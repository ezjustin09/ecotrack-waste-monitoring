
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { MongoClient } = require("mongodb");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "waste_monitoring_system";
const ADMIN_PUBLIC_DIR = path.join(__dirname, "public-admin");

const USER_ROLES = {
  citizen: "citizen",
  driver: "driver",
};

const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const trucks = new Map();
const sessions = new Map();
const adminSessions = new Map();

let mongoClient;
let usersCollection;
let reportsCollection;
let schedulesCollection;
let countersCollection;

const DEFAULT_COLLECTION_SCHEDULE = [
  {
    id: "SCH-001",
    day: "Monday",
    zone: "Zone 1 - West Pateros",
    timeWindow: "6:00 AM - 10:00 AM",
    wasteType: "Biodegradable",
    notes: "Place bins outside by 5:30 AM",
  },
  {
    id: "SCH-002",
    day: "Tuesday",
    zone: "Zone 2 - Central Pateros",
    timeWindow: "6:00 AM - 10:00 AM",
    wasteType: "Non-biodegradable",
    notes: "Use clear bagging for recyclables",
  },
  {
    id: "SCH-003",
    day: "Wednesday",
    zone: "Zone 3 - East Pateros",
    timeWindow: "7:00 AM - 11:00 AM",
    wasteType: "Biodegradable",
    notes: "Segregate food waste separately",
  },
  {
    id: "SCH-004",
    day: "Thursday",
    zone: "Zone 4 - Riverside",
    timeWindow: "7:00 AM - 11:00 AM",
    wasteType: "Non-biodegradable",
    notes: "Flatten cardboard before disposal",
  },
  {
    id: "SCH-005",
    day: "Friday",
    zone: "All Zones",
    timeWindow: "8:00 AM - 12:00 PM",
    wasteType: "Special Collection",
    notes: "Bulk and bulky waste pickup",
  },
];

function parseNumericSuffix(value, prefix) {
  const text = String(value || "");

  if (!text.startsWith(prefix)) {
    return 0;
  }

  const suffix = Number(text.slice(prefix.length));
  return Number.isFinite(suffix) ? suffix : 0;
}

function toIsoString(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function sanitizeTruck(truck) {
  return {
    truckId: truck.truckId,
    status: truck.status,
    latitude: truck.latitude,
    longitude: truck.longitude,
    updatedAt: truck.updatedAt,
  };
}


function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    truckId: user.truckId || "",
    createdAt: toIsoString(user.createdAt),
  };
}

function sanitizeDriver(user) {
  return {
    ...sanitizeUser(user),
    role: USER_ROLES.driver,
  };
}

function sanitizeReport(report) {
  return {
    id: report.id,
    issueType: report.issueType,
    contactNumber: report.contactNumber,
    pictureUri: report.pictureUri,
    notes: report.notes,
    location: {
      barangay: report.location?.barangay || "",
      street: report.location?.street || "",
    },
    createdAt: toIsoString(report.createdAt),
    reportedBy: report.reportedBy || "",
    reporterEmail: report.reporterEmail || "",
  };
}

function sanitizeSchedule(item) {
  return {
    id: item.id,
    day: item.day,
    zone: item.zone,
    timeWindow: item.timeWindow,
    wasteType: item.wasteType,
    notes: item.notes,
  };
}

function isBlockedTruckId(truckId) {
  return BLOCKED_TRUCK_IDS.has(truckId);
}

function listTrucks() {
  return Array.from(trucks.values())
    .filter((truck) => !isBlockedTruckId(truck.truckId))
    .map(sanitizeTruck);
}

function summarizeTruckStatuses(truckList) {
  return truckList.reduce(
    (summary, truck) => {
      const status = String(truck.status || "Unknown");
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
      return summary;
    },
    {
      total: truckList.length,
      byStatus: {},
    }
  );
}
async function getMaxCounterFromCollection(collection, prefix) {
  const rows = await collection.find({}, { projection: { id: 1 } }).toArray();
  return rows.reduce((maxValue, row) => Math.max(maxValue, parseNumericSuffix(row.id, prefix)), 0);
}

async function ensureCounter(name, minimumValue) {
  await countersCollection.updateOne({ _id: name }, { $setOnInsert: { value: 0 } }, { upsert: true });

  if (minimumValue > 0) {
    await countersCollection.updateOne({ _id: name, value: { $lt: minimumValue } }, { $set: { value: minimumValue } });
  }
}

async function nextSequence(name) {
  const result = await countersCollection.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", projection: { value: 1 } }
  );

  if (typeof result?.value === "number") {
    return result.value;
  }

  const nestedValue = Number(result?.value?.value);
  return Number.isFinite(nestedValue) ? nestedValue : 1;
}

async function nextUserId() {
  const sequence = await nextSequence("user");
  return `USR-${String(sequence).padStart(3, "0")}`;
}

async function nextReportId() {
  const sequence = await nextSequence("report");
  return `RPT-${String(sequence).padStart(3, "0")}`;
}

async function nextScheduleId() {
  const sequence = await nextSequence("schedule");
  return `SCH-${String(sequence).padStart(3, "0")}`;
}

async function getScheduleList() {
  const rows = await schedulesCollection.find({}).sort({ id: 1 }).toArray();
  return rows.map(sanitizeSchedule);
}

async function buildAdminDashboardPayload() {
  const liveTrucks = listTrucks();
  const truckSummary = summarizeTruckStatuses(liveTrucks);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [reportsTotal, reportsToday, reportRows, scheduleRows] = await Promise.all([
    reportsCollection.countDocuments(),
    reportsCollection.countDocuments({ createdAt: { $gte: startOfToday } }),
    reportsCollection.find({}).sort({ createdAt: -1 }).limit(100).toArray(),
    getScheduleList(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      activeTrucks: truckSummary.total,
      reportsTotal,
      reportsToday,
      byStatus: truckSummary.byStatus,
    },
    trucks: liveTrucks,
    reports: reportRows.map(sanitizeReport),
    schedule: scheduleRows,
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  const role = String(value || USER_ROLES.citizen).trim().toLowerCase();
  return Object.values(USER_ROLES).includes(role) ? role : "";
}

function normalizeTruckId(value) {
  return String(value || "").trim().toUpperCase();
}

function parseCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function findUserById(userId) {
  return usersCollection.findOne({ id: userId });
}

async function findUserByEmail(email) {
  return usersCollection.findOne({ email });
}


async function findDriverById(driverId) {
  return usersCollection.findOne({ id: driverId, role: USER_ROLES.driver });
}

async function getDriverList() {
  const rows = await usersCollection.find({ role: USER_ROLES.driver }).sort({ createdAt: -1 }).toArray();
  return rows.map(sanitizeDriver);
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, user.id);

  return {
    token,
    user: sanitizeUser(user),
  };
}

function createAdminSession(username) {
  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, {
    username,
    createdAt: new Date().toISOString(),
  });

  return {
    token,
    user: {
      username,
      role: "administrator",
      name: "Admin User",
    },
  };
}

function extractBearerToken(value = "") {
  const authorizationHeader = String(value || "");
  return authorizationHeader.toLowerCase().startsWith("bearer ")
    ? authorizationHeader.slice(7).trim()
    : "";
}

function normalizeTruckPayload(payload = {}) {
  const latitude = parseCoordinate(payload.latitude);
  const longitude = parseCoordinate(payload.longitude);
  const truckId = normalizeTruckId(payload.truckId);

  if (!truckId || latitude === null || longitude === null) {
    return null;
  }

  return {
    truckId,
    status: String(payload.status || "Collecting").trim(),
    latitude,
    longitude,
    updatedAt: new Date().toISOString(),
  };
}

function removeTruckById(truckId, ownerSocketId = "") {
  const existingTruck = trucks.get(truckId);

  if (!existingTruck) {
    return null;
  }

  if (ownerSocketId && existingTruck.ownerSocketId !== ownerSocketId) {
    return null;
  }

  trucks.delete(truckId);
  return sanitizeTruck(existingTruck);
}

function normalizeReportPayload(payload = {}) {
  const issueType = String(payload.issueType || "").trim();
  const contactNumber = String(payload.contactNumber || "").trim();
  const pictureUri = String(payload.pictureUri || payload.pictureUrl || "").trim();
  const notes = String(payload.notes || payload.description || "").trim();
  const location = payload.location || {};
  const barangay = String(location.barangay || payload.barangay || "").trim();
  const street = String(location.street || payload.street || "").trim();
  const contactDigits = contactNumber.replace(/\D/g, "");

  if (!issueType || !contactNumber || contactDigits.length < 7 || !pictureUri || !barangay || !street) {
    return null;
  }

  return {
    issueType,
    contactNumber,
    pictureUri,
    notes,
    location: {
      barangay,
      street,
    },
  };
}


function normalizeDriverPayload(payload = {}, options = {}) {
  const requirePassword = options.requirePassword !== false;
  const name = String(payload.name || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "").trim();
  const truckId = normalizeTruckId(payload.truckId);

  if (!name || !email || !truckId) {
    return {
      error: "name, email, and truckId are required",
    };
  }

  if (!email.includes("@")) {
    return {
      error: "Please enter a valid email address",
    };
  }

  if (isBlockedTruckId(truckId)) {
    return {
      error: "TRUCK-001 is reserved and cannot be used",
    };
  }

  if (requirePassword && !password) {
    return {
      error: "password is required",
    };
  }

  if (password && password.length < 6) {
    return {
      error: "Password must be at least 6 characters long",
    };
  }

  return {
    name,
    email,
    truckId,
    password: password || "",
  };
}

function normalizeSignupPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "").trim();
  const role = normalizeRole(payload.role);
  const truckId = normalizeTruckId(payload.truckId);

  if (!name || !email || !password) {
    return { error: "name, email, and password are required" };
  }

  if (!role) {
    return { error: "role must be citizen or driver" };
  }

  if (!email.includes("@")) {
    return { error: "Please enter a valid email address" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long" };
  }

  if (role === USER_ROLES.driver && !truckId) {
    return { error: "truckId is required for driver accounts" };
  }

  if (role === USER_ROLES.driver && isBlockedTruckId(truckId)) {
    return { error: "TRUCK-001 is reserved and cannot be used" };
  }

  return {
    name,
    email,
    password,
    role,
    truckId: role === USER_ROLES.driver ? truckId : "",
  };
}

function normalizeLoginPayload(payload = {}) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "").trim();
  const role = payload.role ? normalizeRole(payload.role) : "";

  if (!email || !password) {
    return { error: "email and password are required" };
  }

  if (payload.role && !role) {
    return { error: "role must be citizen or driver" };
  }

  return {
    email,
    password,
    role,
  };
}

async function authenticateRequest(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        error: "Authentication required",
      });
      return;
    }

    const userId = sessions.get(token);
    const user = userId ? await findUserById(userId) : null;

    if (!user) {
      res.status(401).json({
        error: "Invalid or expired session",
      });
      return;
    }

    req.user = sanitizeUser(user);
    req.authToken = token;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    res.status(500).json({
      error: "Authentication failed",
    });
  }
}

function authenticateAdminRequest(req, res, next) {
  const token =
    extractBearerToken(req.headers.authorization) || String(req.headers["x-admin-token"] || "").trim();

  if (!token) {
    res.status(401).json({
      error: "Admin authentication required",
    });
    return;
  }

  const adminSession = adminSessions.get(token);

  if (!adminSession) {
    res.status(401).json({
      error: "Invalid or expired admin session",
    });
    return;
  }

  req.adminToken = token;
  req.adminUser = adminSession;
  next();
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({
      error: `This action is only available to ${allowedRoles.join(" or ")} accounts`,
    });
  };
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      console.error("Route error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
        });
      }
    });
  };
}

async function connectDatabase() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();

  const database = mongoClient.db(MONGODB_DB);
  usersCollection = database.collection("users");
  reportsCollection = database.collection("reports");
  schedulesCollection = database.collection("schedules");
  countersCollection = database.collection("counters");

  await Promise.all([
    usersCollection.createIndex({ email: 1 }, { unique: true }),
    usersCollection.createIndex({ id: 1 }, { unique: true }),
    usersCollection.createIndex({ role: 1, truckId: 1 }),
    reportsCollection.createIndex({ id: 1 }, { unique: true }),
    reportsCollection.createIndex({ createdAt: -1 }),
    schedulesCollection.createIndex({ id: 1 }, { unique: true }),
  ]);

  const scheduleCount = await schedulesCollection.countDocuments();
  if (scheduleCount === 0) {
    await schedulesCollection.insertMany(DEFAULT_COLLECTION_SCHEDULE.map((item) => ({ ...item })));
  }

  const [maxUserCounter, maxReportCounter, maxScheduleCounter] = await Promise.all([
    getMaxCounterFromCollection(usersCollection, "USR-"),
    getMaxCounterFromCollection(reportsCollection, "RPT-"),
    getMaxCounterFromCollection(schedulesCollection, "SCH-"),
  ]);

  await Promise.all([
    ensureCounter("user", maxUserCounter),
    ensureCounter("report", maxReportCounter),
    ensureCounter("schedule", maxScheduleCounter),
  ]);

  console.log(`Connected to MongoDB at ${MONGODB_URI} (db: ${MONGODB_DB})`);
}

async function closeDatabaseConnection() {
  if (mongoClient) {
    await mongoClient.close();
  }
}

app.get("/", (req, res) => {
  res.json({
    message: "Waste monitoring backend is running.",
    endpoints: [
      "POST /auth/signup",
      "POST /auth/login",
      "GET /trucks",
      "GET /schedule",
      "POST /report",
      "POST /admin/auth/login",
      "GET /admin",
      "GET /admin/dashboard",
      "GET /admin/schedules",
      "POST /admin/schedules",
      "PUT /admin/schedules/:id",
      "DELETE /admin/schedules/:id",
      "GET /admin/drivers",
      "POST /admin/drivers",
      "PUT /admin/drivers/:id",
      "DELETE /admin/drivers/:id",
    ],
    roles: Object.values(USER_ROLES),
    database: {
      type: "mongodb",
      name: MONGODB_DB,
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.post("/admin/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!username || !password) {
    res.status(400).json({
      error: "username and password are required",
    });
    return;
  }

  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    res.status(401).json({
      error: "Invalid admin credentials",
    });
    return;
  }

  const session = createAdminSession(username);

  res.status(200).json({
    message: "Admin login successful.",
    ...session,
  });
});

app.post("/admin/auth/logout", authenticateAdminRequest, (req, res) => {
  adminSessions.delete(req.adminToken);

  res.status(200).json({
    message: "Admin logged out.",
  });
});
app.get(
  "/admin/dashboard",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const payload = await buildAdminDashboardPayload();
    res.json(payload);
  })
);

app.get(
  "/admin/schedules",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    res.json({
      schedule: await getScheduleList(),
    });
  })
);

app.post(
  "/admin/schedules",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const schedulePayload = normalizeSchedulePayload(req.body);

    if (!schedulePayload) {
      res.status(400).json({
        error: "day, zone, timeWindow, and wasteType are required",
      });
      return;
    }

    const schedule = {
      id: await nextScheduleId(),
      ...schedulePayload,
      updatedAt: new Date(),
    };

    await schedulesCollection.insertOne(schedule);

    res.status(201).json({
      message: "Schedule added successfully.",
      schedule: sanitizeSchedule(schedule),
    });
  })
);

app.put(
  "/admin/schedules/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const scheduleId = String(req.params.id || "").trim().toUpperCase();
    const schedulePayload = normalizeSchedulePayload(req.body);

    if (!scheduleId) {
      res.status(400).json({
        error: "schedule id is required",
      });
      return;
    }

    if (!schedulePayload) {
      res.status(400).json({
        error: "day, zone, timeWindow, and wasteType are required",
      });
      return;
    }

    const updateResult = await schedulesCollection.findOneAndUpdate(
      { id: scheduleId },
      {
        $set: {
          ...schedulePayload,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedSchedule = updateResult?.value || updateResult;

    if (!updatedSchedule) {
      res.status(404).json({
        error: "Schedule not found",
      });
      return;
    }

    res.status(200).json({
      message: "Schedule updated successfully.",
      schedule: sanitizeSchedule(updatedSchedule),
    });
  })
);

app.delete(
  "/admin/schedules/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const scheduleId = String(req.params.id || "").trim().toUpperCase();

    if (!scheduleId) {
      res.status(400).json({
        error: "schedule id is required",
      });
      return;
    }

    const deleteResult = await schedulesCollection.deleteOne({ id: scheduleId });

    if (!deleteResult.deletedCount) {
      res.status(404).json({
        error: "Schedule not found",
      });
      return;
    }

    res.status(200).json({
      message: "Schedule deleted successfully.",
      id: scheduleId,
    });
  })
);

app.get(
  "/admin/drivers",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    res.json({
      drivers: await getDriverList(),
    });
  })
);

app.post(
  "/admin/drivers",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const driverPayload = normalizeDriverPayload(req.body, { requirePassword: true });

    if (driverPayload.error) {
      res.status(400).json({
        error: driverPayload.error,
      });
      return;
    }

    const existingUser = await findUserByEmail(driverPayload.email);
    if (existingUser) {
      res.status(409).json({
        error: "An account with that email already exists",
      });
      return;
    }

    const truckConflict = await usersCollection.findOne({
      role: USER_ROLES.driver,
      truckId: driverPayload.truckId,
    });

    if (truckConflict) {
      res.status(409).json({
        error: "This truck is already assigned to another driver",
      });
      return;
    }

    const driver = {
      id: await nextUserId(),
      name: driverPayload.name,
      email: driverPayload.email,
      password: driverPayload.password,
      role: USER_ROLES.driver,
      truckId: driverPayload.truckId,
      createdAt: new Date(),
    };

    await usersCollection.insertOne(driver);

    res.status(201).json({
      message: "Driver account created successfully.",
      driver: sanitizeDriver(driver),
    });
  })
);

app.put(
  "/admin/drivers/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const driverId = String(req.params.id || "").trim().toUpperCase();

    if (!driverId) {
      res.status(400).json({
        error: "driver id is required",
      });
      return;
    }

    const existingDriver = await findDriverById(driverId);
    if (!existingDriver) {
      res.status(404).json({
        error: "Driver not found",
      });
      return;
    }

    const driverPayload = normalizeDriverPayload(req.body, { requirePassword: false });

    if (driverPayload.error) {
      res.status(400).json({
        error: driverPayload.error,
      });
      return;
    }

    const emailConflict = await usersCollection.findOne({
      email: driverPayload.email,
      id: { $ne: driverId },
    });

    if (emailConflict) {
      res.status(409).json({
        error: "An account with that email already exists",
      });
      return;
    }

    const truckConflict = await usersCollection.findOne({
      role: USER_ROLES.driver,
      truckId: driverPayload.truckId,
      id: { $ne: driverId },
    });

    if (truckConflict) {
      res.status(409).json({
        error: "This truck is already assigned to another driver",
      });
      return;
    }

    const updateData = {
      name: driverPayload.name,
      email: driverPayload.email,
      truckId: driverPayload.truckId,
    };

    if (driverPayload.password) {
      updateData.password = driverPayload.password;
    }

    const updateResult = await usersCollection.findOneAndUpdate(
      { id: driverId, role: USER_ROLES.driver },
      {
        $set: updateData,
      },
      { returnDocument: "after" }
    );

    const updatedDriver = updateResult?.value || updateResult;

    if (!updatedDriver) {
      res.status(404).json({
        error: "Driver not found",
      });
      return;
    }

    if (existingDriver.truckId && existingDriver.truckId !== updatedDriver.truckId) {
      const removedTruck = trucks.get(existingDriver.truckId);
      if (removedTruck) {
        trucks.delete(existingDriver.truckId);
        io.emit("truck:removed", {
          truckId: existingDriver.truckId,
        });
      }
    }

    res.status(200).json({
      message: "Driver account updated successfully.",
      driver: sanitizeDriver(updatedDriver),
    });
  })
);

app.delete(
  "/admin/drivers/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const driverId = String(req.params.id || "").trim().toUpperCase();

    if (!driverId) {
      res.status(400).json({
        error: "driver id is required",
      });
      return;
    }

    const existingDriver = await findDriverById(driverId);
    if (!existingDriver) {
      res.status(404).json({
        error: "Driver not found",
      });
      return;
    }

    await usersCollection.deleteOne({ id: driverId, role: USER_ROLES.driver });

    const activeTruck = trucks.get(existingDriver.truckId);
    if (activeTruck) {
      trucks.delete(existingDriver.truckId);
      io.emit("truck:removed", {
        truckId: existingDriver.truckId,
      });
    }

    for (const [token, userId] of sessions.entries()) {
      if (userId === driverId) {
        sessions.delete(token);
      }
    }

    res.status(200).json({
      message: "Driver account deleted successfully.",
      id: driverId,
    });
  })
);
app.get("/admin", (req, res) => {
  res.sendFile(path.join(ADMIN_PUBLIC_DIR, "index.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(ADMIN_PUBLIC_DIR, "index.html"));
});

app.use("/admin", express.static(ADMIN_PUBLIC_DIR));

app.get(
  "/schedule",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    res.json({
      user: req.user,
      schedule: await getScheduleList(),
    });
  })
);

app.post(
  "/auth/signup",
  asyncRoute(async (req, res) => {
    const signup = normalizeSignupPayload(req.body);

    if (signup.error) {
      res.status(400).json({ error: signup.error });
      return;
    }

    if (await findUserByEmail(signup.email)) {
      res.status(409).json({
        error: "An account with that email already exists",
      });
      return;
    }

    const user = {
      id: await nextUserId(),
      name: signup.name,
      email: signup.email,
      password: signup.password,
      role: signup.role,
      truckId: signup.truckId,
      createdAt: new Date(),
    };

    await usersCollection.insertOne(user);

    const session = createSession(user);

    res.status(201).json({
      message: "Account created successfully.",
      ...session,
    });
  })
);

app.post(
  "/auth/login",
  asyncRoute(async (req, res) => {
    const login = normalizeLoginPayload(req.body);

    if (login.error) {
      res.status(400).json({ error: login.error });
      return;
    }

    const user = await findUserByEmail(login.email);

    if (!user || user.password !== login.password) {
      res.status(401).json({
        error: "Invalid email or password",
      });
      return;
    }

    if (login.role && user.role !== login.role) {
      res.status(403).json({
        error: `This account belongs to the ${user.role} portal`,
      });
      return;
    }

    const session = createSession(user);

    res.status(200).json({
      message: "Login successful.",
      ...session,
    });
  })
);

app.get("/trucks", authenticateRequest, (req, res) => {
  res.json({
    user: req.user,
    trucks: listTrucks(),
  });
});

app.post(
  "/report",
  authenticateRequest,
  authorizeRoles(USER_ROLES.citizen),
  asyncRoute(async (req, res) => {
    const report = normalizeReportPayload(req.body);

    if (!report) {
      res.status(400).json({
        error: "issueType, contactNumber, pictureUri, and location.barangay/location.street are required",
      });
      return;
    }

    const enrichedReport = {
      id: await nextReportId(),
      ...report,
      createdAt: new Date(),
      reportedBy: req.user.name,
      reporterEmail: req.user.email,
    };

    await reportsCollection.insertOne(enrichedReport);

    const publicReport = sanitizeReport(enrichedReport);
    io.emit("report:created", publicReport);

    res.status(201).json({
      message: "Illegal dumping report submitted successfully.",
      report: publicReport,
    });
  })
);

io.on("connection", (socket) => {
  console.log("Client connected: " + socket.id);
  socket.emit("trucks:snapshot", listTrucks());

  socket.on("truck:update", (payload, acknowledge) => {
    const truck = normalizeTruckPayload(payload);

    if (!truck) {
      if (typeof acknowledge === "function") {
        acknowledge({
          ok: false,
          error: "truckId, latitude, and longitude are required",
        });
      }
      return;
    }

    if (isBlockedTruckId(truck.truckId)) {
      if (typeof acknowledge === "function") {
        acknowledge({
          ok: false,
          error: "TRUCK-001 is reserved and cannot be used",
        });
      }
      return;
    }

    const truckRecord = {
      ...truck,
      ownerSocketId: socket.id,
    };
    trucks.set(truck.truckId, truckRecord);

    const publicTruck = sanitizeTruck(truckRecord);
    io.emit("truck:updated", publicTruck);

    if (typeof acknowledge === "function") {
      acknowledge({
        ok: true,
        truck: publicTruck,
      });
    }
  });

  socket.on("truck:remove", (payload, acknowledge) => {
    const truckId = normalizeTruckId(payload?.truckId);

    if (!truckId) {
      if (typeof acknowledge === "function") {
        acknowledge({
          ok: false,
          error: "truckId is required",
        });
      }
      return;
    }

    const removedTruck = removeTruckById(truckId, socket.id);

    if (!removedTruck) {
      if (typeof acknowledge === "function") {
        acknowledge({
          ok: true,
          removed: false,
          message: "Truck is already offline",
        });
      }
      return;
    }

    io.emit("truck:removed", {
      truckId: removedTruck.truckId,
    });

    if (typeof acknowledge === "function") {
      acknowledge({
        ok: true,
        removed: true,
        truckId: removedTruck.truckId,
      });
    }
  });

  socket.on("disconnect", () => {
    Array.from(trucks.values())
      .filter((truck) => truck.ownerSocketId === socket.id)
      .forEach((truck) => {
        trucks.delete(truck.truckId);
        io.emit("truck:removed", {
          truckId: truck.truckId,
        });
      });

    console.log("Client disconnected: " + socket.id);
  });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received. Shutting down backend...`);

  try {
    await closeDatabaseConnection();
  } catch (error) {
    console.error("Failed to close MongoDB connection:", error.message);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

async function startServer() {
  try {
    await connectDatabase();
    server.listen(PORT, HOST, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  }
}

startServer();






