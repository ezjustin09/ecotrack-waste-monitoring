const fs = require("fs");
const path = require("path");

function normalizeEnvValue(rawValue) {
  const value = String(rawValue || "").trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function loadLocalEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = String(line || "").trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      const value = normalizeEnvValue(trimmed.slice(separatorIndex + 1));
      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[env] Unable to load " + filePath + ": " + (error?.message || error));
    }
  }
}

loadLocalEnvFile(path.join(__dirname, ".env"));
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const { promisify } = require("util");
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "waste_monitoring_system";
const ADMIN_PUBLIC_DIR = path.join(__dirname, "public-admin");
const MOBILE_ASSETS_DIR = path.join(__dirname, "..", "mobile", "assets");
const ADMIN_STATIC_CACHE_CONTROL = "no-store, no-cache, must-revalidate, proxy-revalidate";

const USER_ROLES = {
  citizen: "citizen",
  driver: "driver",
};

const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = !IS_PRODUCTION ? process.env.ADMIN_PASSWORD || "admin123" : String(process.env.ADMIN_PASSWORD || "").trim();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
const USER_SESSION_TTL_MS = Number(process.env.USER_SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const ADMIN_SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_BODY_LIMIT = String(process.env.REQUEST_BODY_LIMIT || "12mb").trim() || "12mb";
const INCLUDE_RESET_CODE_IN_RESPONSE = process.env.NODE_ENV !== "production";
const RESEND_API_URL = String(process.env.RESEND_API_URL || "https://api.resend.com/emails").trim() || "https://api.resend.com/emails";
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = String(process.env.RESEND_FROM || "").trim();
const RESEND_FROM_NAME = String(process.env.RESEND_FROM_NAME || "EcoTrack Waste Monitoring").trim();
const RESEND_REPLY_TO = String(process.env.RESEND_REPLY_TO || "").trim();
const RESEND_EMAIL_ENABLED = Boolean(RESEND_API_KEY && RESEND_FROM);
const SMTP_HOST = String(process.env.SMTP_HOST || "smtp.gmail.com").trim() || "smtp.gmail.com";
const parsedSmtpPort = Number(process.env.SMTP_PORT || 587);
const SMTP_PORT = Number.isFinite(parsedSmtpPort) && parsedSmtpPort > 0 ? parsedSmtpPort : 587;
const SMTP_SECURE_FLAG = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
const SMTP_SECURE = SMTP_SECURE_FLAG ? SMTP_SECURE_FLAG === "true" : SMTP_PORT === 465;
const SMTP_USER = String(process.env.SMTP_USER || process.env.GMAIL_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();
const SMTP_FROM_NAME = String(process.env.SMTP_FROM_NAME || "EcoTrack Waste Monitoring").trim();
const EMAIL_SENDING_ENABLED = Boolean(SMTP_USER && SMTP_PASS && SMTP_FROM);
const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_PUSH_CHUNK_SIZE = 100;
const EXPO_PUSH_RECEIPT_CHUNK_SIZE = 300;
const EXPO_PUSH_RECEIPT_WAIT_MS = 2000;
const NEARBY_TRUCK_ALERT_RADIUS_METERS = 500;
const NEARBY_TRUCK_ALERT_REARM_METERS = 650;
const EXPO_PUSH_ACCESS_TOKEN = String(process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim();
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const DEV_DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_CORS_ORIGINS = new Set(
  CORS_ALLOWED_ORIGINS.length > 0
    ? CORS_ALLOWED_ORIGINS
    : IS_PRODUCTION
      ? []
      : DEV_DEFAULT_ALLOWED_ORIGINS
);
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const scryptAsync = promisify(crypto.scrypt);

if (IS_PRODUCTION && ALLOWED_CORS_ORIGINS.size === 0) {
  throw new Error("CORS_ALLOWED_ORIGINS must be set in production.");
}

function isCorsOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  return ALLOWED_CORS_ORIGINS.has(origin);
}

function corsOriginHandler(origin, callback) {
  if (isCorsOriginAllowed(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS blocked origin: ${origin}`));
}

const corsOptions = {
  origin: corsOriginHandler,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      error: "Attached image is too large. Please choose a smaller photo and try again.",
    });
    return;
  }

  if (error instanceof SyntaxError && error?.status === 400 && "body" in error) {
    res.status(400).json({
      error: "Invalid request format. Please try submitting the report again.",
    });
    return;
  }

  next(error);
});

const trucks = new Map();

let mongoClient;
let usersCollection;
let reportsCollection;
let schedulesCollection;
let announcementsCollection;
let newsCollection;
let tripTicketsCollection;
let countersCollection;
let userSessionsCollection;
let adminSessionsCollection;
let passwordResetCodesCollection;
let mailTransporter = null;
const pushDiagnostics = {
  lastRegistration: null,
  lastRemoval: null,
  lastBroadcast: null,
  lastLocationSync: null,
  lastNearbyTruckAlert: null,
};
const nearbyTruckAlertStateByUserId = new Map();

if (EMAIL_SENDING_ENABLED) {
  mailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

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
const DEFAULT_ANNOUNCEMENTS = [
  {
    id: "ANN-001",
    title: "Barangay Segregation Reminder",
    details:
      "Please separate biodegradable and non-biodegradable waste before pickup to avoid missed collection.",
  },
  {
    id: "ANN-002",
    title: "Saturday Recovery Route",
    details:
      "A recovery truck will cover delayed streets this Saturday from 8:00 AM to 12:00 PM.",
  },
];

const DEFAULT_NEWS_ITEMS = [
  {
    id: "NEWS-001",
    title: "New GPS-Tracked Truck Added to Fleet",
    details:
      "The city added one additional GPS-enabled truck to improve route coverage in dense areas.",
  },
  {
    id: "NEWS-002",
    title: "Illegal Dumping Reports Are Being Processed Faster",
    details:
      "Recent system updates helped response teams dispatch cleanup crews faster after citizen reports.",
  },
];

const TRIP_TICKET_STATUSES = ["Scheduled", "On Route", "Completed", "Delayed", "Missed"];

const DEFAULT_TRIP_TICKET_TEMPLATES = [
  {
    id: "TT-001",
    truckId: "TRUCK-002",
    driverName: "Miguel Santos",
    zone: "Zone 1 - West Pateros",
    wasteType: "Biodegradable",
    scheduledWindow: "6:00 AM - 9:00 AM",
    departureOffsetDays: -4,
    departureHour: 6,
    departureMinute: 5,
    durationMinutes: 108,
    status: "Completed",
    volumeKg: 415,
    remarks: "Completed before the recovery route started.",
  },
  {
    id: "TT-002",
    truckId: "TRUCK-003",
    driverName: "Rafael Cruz",
    zone: "Zone 2 - Central Pateros",
    wasteType: "Non-biodegradable",
    scheduledWindow: "6:00 AM - 10:00 AM",
    departureOffsetDays: -3,
    departureHour: 6,
    departureMinute: 18,
    durationMinutes: 146,
    status: "Delayed",
    volumeKg: 382,
    remarks: "Traffic slowdown near M. Almeda.",
  },
  {
    id: "TT-003",
    truckId: "TRUCK-004",
    driverName: "Paolo Reyes",
    zone: "Zone 3 - East Pateros",
    wasteType: "Biodegradable",
    scheduledWindow: "7:00 AM - 11:00 AM",
    departureOffsetDays: -2,
    departureHour: 7,
    departureMinute: 2,
    durationMinutes: 121,
    status: "Completed",
    volumeKg: 438,
    remarks: "Normal route completion.",
  },
  {
    id: "TT-004",
    truckId: "TRUCK-002",
    driverName: "Miguel Santos",
    zone: "Zone 4 - Riverside",
    wasteType: "Non-biodegradable",
    scheduledWindow: "7:00 AM - 11:00 AM",
    departureOffsetDays: -1,
    departureHour: 7,
    departureMinute: 10,
    durationMinutes: 97,
    status: "Completed",
    volumeKg: 294,
    remarks: "Faster route due to lighter volume.",
  },
  {
    id: "TT-005",
    truckId: "TRUCK-003",
    driverName: "Rafael Cruz",
    zone: "Zone 2 - Central Pateros",
    wasteType: "Special Collection",
    scheduledWindow: "8:00 AM - 12:00 PM",
    departureOffsetDays: 0,
    departureHour: 8,
    departureMinute: 12,
    durationMinutes: 84,
    status: "On Route",
    volumeKg: 155,
    remarks: "Still collecting along the central corridor.",
  },
  {
    id: "TT-006",
    truckId: "TRUCK-004",
    driverName: "Paolo Reyes",
    zone: "Zone 5 - Market Area",
    wasteType: "Residual Waste",
    scheduledWindow: "8:00 AM - 12:00 PM",
    departureOffsetDays: 0,
    departureHour: 8,
    departureMinute: 0,
    durationMinutes: 0,
    status: "Missed",
    volumeKg: 0,
    remarks: "Ticket marked missed due to truck maintenance check.",
  },
];
const DEFAULT_TRIP_TICKET_IDS = DEFAULT_TRIP_TICKET_TEMPLATES.map((template) => template.id);

function createRelativeDate(dayOffset, hour, minute) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function buildDefaultTripTickets() {
  return DEFAULT_TRIP_TICKET_TEMPLATES.map((template) => {
    const departureAt = createRelativeDate(
      template.departureOffsetDays,
      template.departureHour,
      template.departureMinute
    );
    const completedAt =
      template.status === "Completed" || template.status === "Delayed"
        ? new Date(departureAt.getTime() + template.durationMinutes * 60 * 1000)
        : null;

    return {
      id: template.id,
      truckId: template.truckId,
      driverName: template.driverName,
      zone: template.zone,
      wasteType: template.wasteType,
      scheduledWindow: template.scheduledWindow,
      departureAt,
      completedAt,
      status: template.status,
      volumeKg: template.volumeKg,
      remarks: template.remarks,
      createdAt: departureAt,
      updatedAt: completedAt || new Date(Math.max(departureAt.getTime(), Date.now() - 15 * 60 * 1000)),
    };
  });
}
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
    authProvider: user.authProvider || "local",
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
function sanitizeFeedItem(item) {
  return {
    id: item.id,
    title: item.title,
    details: item.details,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

function getTripTicketDurationMinutes(ticket) {
  const departureAt = new Date(ticket?.departureAt || 0).getTime();
  const completedAt = new Date(ticket?.completedAt || 0).getTime();

  if (!Number.isFinite(departureAt) || !Number.isFinite(completedAt) || completedAt <= departureAt) {
    return null;
  }

  return Math.round((completedAt - departureAt) / 60000);
}

function sanitizeTripTicket(ticket) {
  return {
    id: ticket.id,
    truckId: ticket.truckId,
    driverName: ticket.driverName || "",
    zone: ticket.zone || "",
    wasteType: ticket.wasteType || "",
    scheduledWindow: ticket.scheduledWindow || "",
    departureAt: toIsoString(ticket.departureAt),
    completedAt: toIsoString(ticket.completedAt),
    status: ticket.status || "Unknown",
    volumeKg: Number(ticket.volumeKg || 0),
    remarks: ticket.remarks || "",
    durationMinutes: getTripTicketDurationMinutes(ticket),
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
async function nextAnnouncementId() {
  const sequence = await nextSequence("announcement");
  return `ANN-${String(sequence).padStart(3, "0")}`;
}

async function nextNewsId() {
  const sequence = await nextSequence("news");
  return `NEWS-${String(sequence).padStart(3, "0")}`;
}

async function nextTripTicketId() {
  const sequence = await nextSequence("trip_ticket");
  return `TT-${String(sequence).padStart(3, "0")}`;
}

async function getScheduleList() {
  const rows = await schedulesCollection.find({}).sort({ id: 1 }).toArray();
  return rows.map(sanitizeSchedule);
}
async function getAnnouncementList() {
  const rows = await announcementsCollection.find({}).sort({ createdAt: -1 }).toArray();
  return rows.map(sanitizeFeedItem);
}

async function getNewsList() {
  const rows = await newsCollection.find({}).sort({ createdAt: -1 }).toArray();
  return rows.map(sanitizeFeedItem);
}

async function getTripTicketList(limit = 120) {
  const rows = await tripTicketsCollection.find({}).sort({ departureAt: -1, id: 1 }).limit(limit).toArray();
  return rows.map(sanitizeTripTicket);
}

function buildTripTicketAnalytics(tripTickets = []) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const completedStatuses = new Set(["Completed", "Delayed"]);

  const summary = {
    totalTickets: tripTickets.length,
    ticketsToday: 0,
    completedTrips: 0,
    delayedTrips: 0,
    inProgressTrips: 0,
    missedTrips: 0,
    averageDurationMinutes: 0,
    completionRate: 0,
    totalVolumeKg: 0,
    trucksCovered: 0,
    statusBreakdown: [],
    zoneBreakdown: [],
    truckPerformance: [],
  };

  if (!tripTickets.length) {
    return summary;
  }

  const durations = [];
  const statusCounts = new Map();
  const zoneCounts = new Map();
  const truckStats = new Map();

  tripTickets.forEach((ticket) => {
    const departureAt = new Date(ticket.departureAt || 0);
    const status = String(ticket.status || "Unknown");
    const volumeKg = Number(ticket.volumeKg || 0);
    const durationMinutes = Number(ticket.durationMinutes);

    if (!Number.isNaN(departureAt.getTime()) && departureAt >= startOfToday) {
      summary.ticketsToday += 1;
    }

    if (completedStatuses.has(status)) {
      summary.completedTrips += 1;
    }

    if (status === "Delayed") {
      summary.delayedTrips += 1;
    } else if (status === "On Route") {
      summary.inProgressTrips += 1;
    } else if (status === "Missed") {
      summary.missedTrips += 1;
    }

    if (Number.isFinite(volumeKg)) {
      summary.totalVolumeKg += volumeKg;
    }

    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      durations.push(durationMinutes);
    }

    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    zoneCounts.set(ticket.zone, (zoneCounts.get(ticket.zone) || 0) + 1);

    const truckKey = ticket.truckId || "Unknown";
    const currentTruck = truckStats.get(truckKey) || {
      truckId: truckKey,
      driverName: ticket.driverName || "",
      trips: 0,
      completedTrips: 0,
      delayedTrips: 0,
      totalVolumeKg: 0,
      durations: [],
    };

    currentTruck.trips += 1;
    if (completedStatuses.has(status)) {
      currentTruck.completedTrips += 1;
    }
    if (status === "Delayed") {
      currentTruck.delayedTrips += 1;
    }
    if (Number.isFinite(volumeKg)) {
      currentTruck.totalVolumeKg += volumeKg;
    }
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      currentTruck.durations.push(durationMinutes);
    }

    truckStats.set(truckKey, currentTruck);
  });

  summary.averageDurationMinutes =
    durations.length > 0 ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : 0;
  summary.completionRate = summary.totalTickets > 0 ? Math.round((summary.completedTrips / summary.totalTickets) * 100) : 0;
  summary.trucksCovered = truckStats.size;

  summary.statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ label: status, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  summary.zoneBreakdown = Array.from(zoneCounts.entries())
    .map(([zone, count]) => ({ label: zone || "Unknown zone", count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  summary.truckPerformance = Array.from(truckStats.values())
    .map((truck) => ({
      truckId: truck.truckId,
      driverName: truck.driverName,
      trips: truck.trips,
      completedTrips: truck.completedTrips,
      delayedTrips: truck.delayedTrips,
      totalVolumeKg: truck.totalVolumeKg,
      averageDurationMinutes:
        truck.durations.length > 0
          ? Math.round(truck.durations.reduce((total, value) => total + value, 0) / truck.durations.length)
          : 0,
      completionRate: truck.trips > 0 ? Math.round((truck.completedTrips / truck.trips) * 100) : 0,
    }))
    .sort((a, b) => b.trips - a.trips || a.truckId.localeCompare(b.truckId));

  return summary;
}

async function buildAdminDashboardPayload() {
  const liveTrucks = listTrucks();
  const truckSummary = summarizeTruckStatuses(liveTrucks);
  const [reportsTotal, reportsToday, reportRows, scheduleRows, announcementsRows, newsRows, tripTicketRows] = await Promise.all([
    reportsCollection.countDocuments(),
    reportsCollection.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
    reportsCollection.find({}).sort({ createdAt: -1 }).limit(100).toArray(),
    getScheduleList(),
    getAnnouncementList(),
    getNewsList(),
    getTripTicketList(),
  ]);
  const tripAnalytics = buildTripTicketAnalytics(tripTicketRows);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      activeTrucks: truckSummary.total,
      reportsTotal,
      reportsToday,
      byStatus: truckSummary.byStatus,
      tripTicketsToday: tripAnalytics.ticketsToday,
      completedTrips: tripAnalytics.completedTrips,
      averageTripDurationMinutes: tripAnalytics.averageDurationMinutes,
    },
    trucks: liveTrucks,
    reports: reportRows.map(sanitizeReport),
    schedule: scheduleRows,
    announcements: announcementsRows,
    news: newsRows,
    tripTickets: tripTicketRows,
    tripAnalytics,
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

function isPasswordHash(value = "") {
  return String(value || "").startsWith(PASSWORD_HASH_PREFIX + "$");
}

function getStoredPasswordHash(user) {
  return String(user?.passwordHash || "").trim();
}

function getLegacyPassword(user) {
  return String(user?.password || "").trim();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derivedKey = await scryptAsync(String(password || ""), salt, PASSWORD_KEY_LENGTH);
  return `${PASSWORD_HASH_PREFIX}$${salt}$${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPasswordHash(password, storedHash) {
  const [prefix, salt, expectedHex] = String(storedHash || "").split("$");

  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !expectedHex) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, "hex");
  if (!expectedBuffer.length) {
    return false;
  }

  const derivedKey = await scryptAsync(String(password || ""), salt, expectedBuffer.length);
  return crypto.timingSafeEqual(Buffer.from(derivedKey), expectedBuffer);
}

async function setUserPassword(userId, nextPassword) {
  const passwordHash = await hashPassword(nextPassword);

  await usersCollection.updateOne(
    { id: userId },
    {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
      $unset: {
        password: "",
      },
    }
  );

  return passwordHash;
}

async function verifyAndUpgradeUserPassword(user, candidatePassword) {
  const storedHash = getStoredPasswordHash(user);
  if (storedHash) {
    return verifyPasswordHash(candidatePassword, storedHash);
  }

  const legacyPassword = getLegacyPassword(user);
  if (!legacyPassword || legacyPassword !== String(candidatePassword || "")) {
    return false;
  }

  await setUserPassword(user.id, candidatePassword);
  return true;
}

async function migrateLegacyPasswords() {
  const legacyUsers = await usersCollection
    .find({
      password: { $type: "string", $ne: "" },
      $or: [{ passwordHash: { $exists: false } }, { passwordHash: "" }],
    })
    .toArray();

  if (!legacyUsers.length) {
    return;
  }

  for (const legacyUser of legacyUsers) {
    await setUserPassword(legacyUser.id, legacyUser.password);
  }

  console.log(`[auth] Migrated ${legacyUsers.length} legacy password(s) to hashed storage.`);
}

async function verifyAdminPassword(candidatePassword) {
  if (ADMIN_PASSWORD_HASH) {
    return verifyPasswordHash(candidatePassword, ADMIN_PASSWORD_HASH);
  }

  if (IS_PRODUCTION) {
    return false;
  }

  return Boolean(ADMIN_PASSWORD) && String(candidatePassword || "") === ADMIN_PASSWORD;
}

function validateProductionConfiguration() {
  if (!IS_PRODUCTION) {
    return;
  }

  if (!ADMIN_PASSWORD_HASH) {
    throw new Error("Set ADMIN_PASSWORD_HASH before starting in production.");
  }

  if (!isEmailSendingConfigured()) {
    console.warn("[mail] Forgot-password email is not configured. Set RESEND_API_KEY and RESEND_FROM, or SMTP_USER/SMTP_PASS/SMTP_FROM.");
  }
}

async function findDriverById(driverId) {
  return usersCollection.findOne({ id: driverId, role: USER_ROLES.driver });
}

async function findTripTicketById(ticketId) {
  return tripTicketsCollection.findOne({ id: ticketId });
}

async function getDriverList() {
  const rows = await usersCollection.find({ role: USER_ROLES.driver }).sort({ createdAt: -1 }).toArray();
  return rows.map(sanitizeDriver);
}

function createExpiryDate(ttlMs) {
  return new Date(Date.now() + ttlMs);
}

async function insertUniqueTokenRecord(collection, payload) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("hex");

    try {
      await collection.insertOne({
        token,
        ...payload,
      });

      return token;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  throw new Error("Unable to create a unique authentication token.");
}

async function createSession(user) {
  const createdAt = new Date();
  const token = await insertUniqueTokenRecord(userSessionsCollection, {
    userId: user.id,
    createdAt,
    expiresAt: createExpiryDate(USER_SESSION_TTL_MS),
  });

  return {
    token,
    user: sanitizeUser(user),
  };
}

async function clearUserSessions(userId) {
  if (!userId) {
    return;
  }

  await userSessionsCollection.deleteMany({ userId });
}

async function createAdminSession(username) {
  const createdAt = new Date();
  const token = await insertUniqueTokenRecord(adminSessionsCollection, {
    username,
    createdAt,
    expiresAt: createExpiryDate(ADMIN_SESSION_TTL_MS),
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

async function clearAdminSession(token) {
  if (!token) {
    return;
  }

  await adminSessionsCollection.deleteOne({ token });
}

async function storePasswordResetCode(email, userId, code) {
  await passwordResetCodesCollection.updateOne(
    { email },
    {
      $set: {
        email,
        userId,
        code,
        createdAt: new Date(),
        expiresAt: createExpiryDate(PASSWORD_RESET_CODE_TTL_MS),
      },
    },
    { upsert: true }
  );
}

async function getActivePasswordResetCode(email) {
  return passwordResetCodesCollection.findOne({
    email,
    expiresAt: { $gt: new Date() },
  });
}

async function clearPasswordResetCode(email) {
  if (!email) {
    return;
  }

  await passwordResetCodesCollection.deleteOne({ email });
}

function normalizePushToken(value) {
  return String(value || "").trim();
}

function isExpoPushToken(value) {
  const token = normalizePushToken(value);
  return /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(token);
}

function normalizePushTokenPayload(payload = {}) {
  const pushToken = normalizePushToken(payload.pushToken || payload.token || payload.expoPushToken);
  const platform = String(payload.platform || "").trim().toLowerCase();

  if (!pushToken) {
    return {
      error: "pushToken is required",
    };
  }

  if (!isExpoPushToken(pushToken)) {
    return {
      error: "Invalid Expo push token",
    };
  }

  return {
    pushToken,
    platform,
  };
}

function normalizeNearbyAlertLocationPayload(payload = {}) {
  const latitude = parseCoordinate(payload.latitude ?? payload.location?.latitude);
  const longitude = parseCoordinate(payload.longitude ?? payload.location?.longitude);
  const accuracy = parseCoordinate(payload.accuracy ?? payload.location?.accuracy);
  const source = String(payload.source || payload.location?.source || "mobile").trim().toLowerCase();

  if (latitude === null || longitude === null) {
    return {
      error: "latitude and longitude are required",
    };
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      error: "latitude or longitude is out of range",
    };
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    source: source || "mobile",
  };
}

function chunkArray(items, chunkSize) {
  const normalizedChunkSize = Number(chunkSize) > 0 ? Number(chunkSize) : 100;
  const chunks = [];

  for (let index = 0; index < items.length; index += normalizedChunkSize) {
    chunks.push(items.slice(index, index + normalizedChunkSize));
  }

  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function maskPushToken(token) {
  const normalized = normalizePushToken(token);

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 20) {
    return normalized;
  }

  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`;
}

function snapshotPushDiagnosticEvent(event = {}) {
  return {
    ...event,
    timestamp: new Date().toISOString(),
  };
}

function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "unknown distance";
  }

  if (distanceMeters < 1000) {
    return `${Math.max(1, Math.round(distanceMeters))} m`;
  }

  const decimals = distanceMeters < 10000 ? 1 : 0;
  return `${(distanceMeters / 1000).toFixed(decimals)} km`;
}

function getDistanceMeters(origin, target) {
  if (!origin || !target) {
    return Number.POSITIVE_INFINITY;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(target.latitude - origin.latitude);
  const longitudeDelta = toRadians(target.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const targetLatitude = toRadians(target.latitude);
  const haversineA =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(originLatitude) * Math.cos(targetLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
  const haversineC = 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));

  return earthRadiusMeters * haversineC;
}

function getNearbyTruckState(userId, truckId) {
  if (!userId || !truckId) {
    return null;
  }

  const userState = nearbyTruckAlertStateByUserId.get(userId);
  return userState?.get(truckId) || null;
}

function setNearbyTruckState(userId, truckId, state) {
  if (!userId || !truckId) {
    return;
  }

  if (!nearbyTruckAlertStateByUserId.has(userId)) {
    nearbyTruckAlertStateByUserId.set(userId, new Map());
  }

  const userState = nearbyTruckAlertStateByUserId.get(userId);
  userState.set(truckId, state);
}

function deleteNearbyTruckState(userId, truckId) {
  if (!userId || !truckId) {
    return;
  }

  const userState = nearbyTruckAlertStateByUserId.get(userId);
  if (!userState) {
    return;
  }

  userState.delete(truckId);

  if (userState.size === 0) {
    nearbyTruckAlertStateByUserId.delete(userId);
  }
}

function clearNearbyTruckStateForTruck(truckId) {
  if (!truckId) {
    return;
  }

  for (const [userId, userState] of nearbyTruckAlertStateByUserId.entries()) {
    userState.delete(truckId);

    if (userState.size === 0) {
      nearbyTruckAlertStateByUserId.delete(userId);
    }
  }
}

async function registerUserPushToken(userId, pushToken, platform = "") {
  if (!userId || !pushToken) {
    return false;
  }

  const update = {
    $addToSet: {
      pushTokens: pushToken,
    },
    $set: {
      pushTokenUpdatedAt: new Date(),
    },
  };

  if (platform) {
    update.$set.pushTokenPlatform = platform;
  }

  const result = await usersCollection.updateOne({ id: userId }, update);
  pushDiagnostics.lastRegistration = snapshotPushDiagnosticEvent({
    userId,
    platform: platform || "unknown",
    pushToken: maskPushToken(pushToken),
    registered: result.matchedCount > 0,
    modifiedCount: Number(result.modifiedCount || 0),
  });
  console.log(
    `[push] register token user=${userId} platform=${platform || "unknown"} token=${maskPushToken(pushToken)} matched=${result.matchedCount} modified=${result.modifiedCount || 0}`
  );
  return result.matchedCount > 0;
}

async function removeUserPushToken(userId, pushToken) {
  if (!userId || !pushToken) {
    return false;
  }

  const result = await usersCollection.updateOne(
    { id: userId },
    {
      $pull: {
        pushTokens: pushToken,
      },
      $set: {
        pushTokenUpdatedAt: new Date(),
      },
    }
  );

  pushDiagnostics.lastRemoval = snapshotPushDiagnosticEvent({
    userId,
    pushToken: maskPushToken(pushToken),
    removed: result.matchedCount > 0,
    modifiedCount: Number(result.modifiedCount || 0),
  });
  console.log(
    `[push] remove token user=${userId} token=${maskPushToken(pushToken)} matched=${result.matchedCount} modified=${result.modifiedCount || 0}`
  );
  return result.matchedCount > 0;
}

async function listExpoPushTokens() {
  const rows = await usersCollection
    .find({ pushTokens: { $exists: true, $ne: [] } }, { projection: { pushTokens: 1 } })
    .toArray();
  const tokenSet = new Set();

  for (const row of rows) {
    const values = Array.isArray(row.pushTokens) ? row.pushTokens : [row.pushTokens];

    for (const value of values) {
      const normalized = normalizePushToken(value);

      if (isExpoPushToken(normalized)) {
        tokenSet.add(normalized);
      }
    }
  }

  return Array.from(tokenSet);
}

async function buildPushDiagnosticsStatus() {
  const registeredTokens = await listExpoPushTokens();

  return {
    configured: {
      expoPushAccessTokenPresent: Boolean(EXPO_PUSH_ACCESS_TOKEN),
    },
    registeredTokenCount: registeredTokens.length,
    registeredTokenSamples: registeredTokens.slice(0, 5).map(maskPushToken),
    lastRegistration: pushDiagnostics.lastRegistration,
    lastRemoval: pushDiagnostics.lastRemoval,
    lastBroadcast: pushDiagnostics.lastBroadcast,
    lastLocationSync: pushDiagnostics.lastLocationSync,
    lastNearbyTruckAlert: pushDiagnostics.lastNearbyTruckAlert,
  };
}

async function updateUserNearbyAlertLocation(userId, location) {
  if (!userId || !location) {
    return false;
  }

  const normalizedLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
    updatedAt: new Date(),
    source: location.source || "mobile",
  };

  if (Number.isFinite(location.accuracy)) {
    normalizedLocation.accuracy = location.accuracy;
  }

  const result = await usersCollection.updateOne(
    { id: userId },
    {
      $set: {
        nearbyAlertLocation: normalizedLocation,
      },
    }
  );

  pushDiagnostics.lastLocationSync = snapshotPushDiagnosticEvent({
    userId,
    source: normalizedLocation.source,
    latitude: normalizedLocation.latitude,
    longitude: normalizedLocation.longitude,
    accuracy: normalizedLocation.accuracy,
    updated: result.matchedCount > 0,
    modifiedCount: Number(result.modifiedCount || 0),
  });
  console.log(
    `[push] sync location user=${userId} source=${normalizedLocation.source} lat=${normalizedLocation.latitude.toFixed(5)} lng=${normalizedLocation.longitude.toFixed(5)} matched=${result.matchedCount} modified=${result.modifiedCount || 0}`
  );

  return result.matchedCount > 0;
}

async function clearUserNearbyAlertLocation(userId) {
  if (!userId) {
    return false;
  }

  const result = await usersCollection.updateOne(
    { id: userId },
    {
      $unset: {
        nearbyAlertLocation: "",
      },
    }
  );

  nearbyTruckAlertStateByUserId.delete(userId);
  pushDiagnostics.lastLocationSync = snapshotPushDiagnosticEvent({
    userId,
    cleared: true,
    modifiedCount: Number(result.modifiedCount || 0),
  });
  console.log(`[push] clear location user=${userId} matched=${result.matchedCount} modified=${result.modifiedCount || 0}`);

  return result.matchedCount > 0;
}

async function listUsersEligibleForNearbyTruckAlerts() {
  return usersCollection
    .find(
      {
        role: USER_ROLES.citizen,
        pushTokens: { $exists: true, $ne: [] },
        "nearbyAlertLocation.latitude": { $type: "number" },
        "nearbyAlertLocation.longitude": { $type: "number" },
      },
      {
        projection: {
          id: 1,
          name: 1,
          pushTokens: 1,
          nearbyAlertLocation: 1,
        },
      }
    )
    .toArray();
}

async function removeUnregisteredPushTokens(tokens = []) {
  const invalidTokens = Array.from(
    new Set(tokens.map((token) => normalizePushToken(token)).filter((token) => isExpoPushToken(token)))
  );

  if (!invalidTokens.length) {
    return 0;
  }

  const result = await usersCollection.updateMany(
    { pushTokens: { $in: invalidTokens } },
    { $pull: { pushTokens: { $in: invalidTokens } } }
  );

  return Number(result.modifiedCount || 0);
}

async function sendExpoPushBatch(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      okCount: 0,
      droppedTokens: [],
      errors: [],
      ticketEntries: [],
    };
  }

  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };

  if (EXPO_PUSH_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${EXPO_PUSH_ACCESS_TOKEN}`;
  }

  const response = await fetch(EXPO_PUSH_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Expo push API request failed with status ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`
    );
  }

  const payload = await response.json().catch(() => null);
  const dataRows = Array.isArray(payload?.data) ? payload.data : [];
  let okCount = 0;
  const droppedTokens = [];
  const errors = [];
  const ticketEntries = [];

  dataRows.forEach((row, index) => {
    if (row?.status === "ok") {
      okCount += 1;
      const ticketId = String(row?.id || "").trim();
      if (ticketId) {
        ticketEntries.push({
          id: ticketId,
          token: normalizePushToken(messages[index]?.to || ""),
        });
      }
      return;
    }

    const errorCode = String(row?.details?.error || row?.message || "").trim();
    if (errorCode === "DeviceNotRegistered") {
      const token = normalizePushToken(messages[index]?.to || "");
      if (token) {
        droppedTokens.push(token);
      }
    }

    errors.push({
      token: normalizePushToken(messages[index]?.to || ""),
      message: errorCode || "Unknown Expo push error",
    });
  });

  return {
    okCount,
    droppedTokens,
    errors,
    ticketEntries,
  };
}

async function fetchExpoPushReceipts(ticketEntries = []) {
  if (!Array.isArray(ticketEntries) || ticketEntries.length === 0) {
    return {
      okCount: 0,
      droppedTokens: [],
      errors: [],
      checkedCount: 0,
    };
  }

  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };

  if (EXPO_PUSH_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${EXPO_PUSH_ACCESS_TOKEN}`;
  }

  const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ids: ticketEntries.map((entry) => entry.id),
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Expo receipt request failed with status ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`
    );
  }

  const payload = await response.json().catch(() => null);
  const receiptMap = payload?.data && typeof payload.data === "object" ? payload.data : {};
  let okCount = 0;
  const droppedTokens = [];
  const errors = [];

  ticketEntries.forEach((entry) => {
    const receipt = receiptMap[entry.id];

    if (!receipt) {
      errors.push({
        token: normalizePushToken(entry.token || ""),
        ticketId: entry.id,
        message: "Missing Expo push receipt",
      });
      return;
    }

    if (receipt.status === "ok") {
      okCount += 1;
      return;
    }

    const errorCode = String(receipt?.details?.error || receipt?.message || "").trim();
    const normalizedToken = normalizePushToken(entry.token || "");

    if (errorCode === "DeviceNotRegistered" && normalizedToken) {
      droppedTokens.push(normalizedToken);
    }

    errors.push({
      token: normalizedToken,
      ticketId: entry.id,
      message: errorCode || "Unknown Expo push receipt error",
    });
  });

  return {
    okCount,
    droppedTokens,
    errors,
    checkedCount: ticketEntries.length,
  };
}

function collectUserExpoPushTokens(user) {
  const pushTokenValues = Array.isArray(user?.pushTokens) ? user.pushTokens : [user?.pushTokens];
  return Array.from(
    new Set(pushTokenValues.map((value) => normalizePushToken(value)).filter((value) => isExpoPushToken(value)))
  );
}

async function deliverExpoPushMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      requested: 0,
      accepted: 0,
      ticketCount: 0,
      receiptCheckedCount: 0,
      dropped: 0,
      droppedTokens: [],
      errors: [],
    };
  }

  const chunks = chunkArray(messages, EXPO_PUSH_CHUNK_SIZE);
  let accepted = 0;
  const droppedTokens = [];
  const pushErrors = [];
  const ticketEntries = [];

  for (const chunk of chunks) {
    try {
      const result = await sendExpoPushBatch(chunk);
      accepted += result.okCount;
      droppedTokens.push(...result.droppedTokens);
      pushErrors.push(...(result.errors || []));
      ticketEntries.push(...(result.ticketEntries || []));
    } catch (error) {
      console.error("[push] Expo push chunk failed:", error?.message || error);
      pushErrors.push({
        token: "",
        message: String(error?.message || error || "Expo push chunk failed"),
      });
    }
  }

  let receiptCheckedCount = 0;

  if (ticketEntries.length > 0) {
    await wait(EXPO_PUSH_RECEIPT_WAIT_MS);
    const receiptChunks = chunkArray(ticketEntries, EXPO_PUSH_RECEIPT_CHUNK_SIZE);

    for (const receiptChunk of receiptChunks) {
      try {
        const receiptResult = await fetchExpoPushReceipts(receiptChunk);
        receiptCheckedCount += receiptResult.checkedCount || 0;
        droppedTokens.push(...(receiptResult.droppedTokens || []));
        pushErrors.push(...(receiptResult.errors || []));
      } catch (error) {
        console.error("[push] Expo push receipt lookup failed:", error?.message || error);
        pushErrors.push({
          token: "",
          ticketId: "",
          message: String(error?.message || error || "Expo push receipt lookup failed"),
        });
      }
    }
  }

  if (droppedTokens.length > 0) {
    const removedCount = await removeUnregisteredPushTokens(droppedTokens);
    console.log(`[push] Removed ${removedCount} stale push token(s) from user records.`);
  }

  return {
    requested: messages.length,
    accepted,
    ticketCount: ticketEntries.length,
    receiptCheckedCount,
    dropped: droppedTokens.length,
    droppedTokens,
    errors: pushErrors,
  };
}

async function sendBroadcastFeedPushNotification(kind, item) {
  const pushTokens = await listExpoPushTokens();
  const safeKind = kind === "news" ? "news" : "announcement";
  const baseEvent = {
    kind: safeKind,
    feedId: String(item?.id || "").trim(),
    title: String(item?.title || "").trim(),
    availableTokenCount: pushTokens.length,
    tokenSamples: pushTokens.slice(0, 5).map(maskPushToken),
  };

  if (pushTokens.length === 0) {
    pushDiagnostics.lastBroadcast = snapshotPushDiagnosticEvent({
      ...baseEvent,
      status: "no_tokens",
      requested: 0,
      accepted: 0,
      ticketCount: 0,
      receiptCheckedCount: 0,
      dropped: 0,
      errors: [],
    });
    console.warn(`[push] Skipped ${safeKind} broadcast because no Expo push tokens are registered.`);
    return {
      requested: 0,
      accepted: 0,
      ticketCount: 0,
      receiptCheckedCount: 0,
      dropped: 0,
      errors: [],
    };
  }

  const title = safeKind === "announcement" ? "New Announcement" : "News Update";
  const body = String(item?.title || "").trim() || (safeKind === "announcement"
    ? "A new community announcement has been posted."
    : "A new waste monitoring news update is available.");
  const data = {
    type: safeKind,
    feedId: String(item?.id || "").trim(),
    title: String(item?.title || "").trim(),
    screen: "Home",
  };

  const messages = pushTokens.map((pushToken) => ({
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
    channelId: "nearby-trucks",
  }));
  console.log(
    `[push] Sending ${safeKind} broadcast for ${baseEvent.feedId || "unknown"} to ${messages.length} registered token(s).`
  );
  const result = await deliverExpoPushMessages(messages);

  pushDiagnostics.lastBroadcast = snapshotPushDiagnosticEvent({
    ...baseEvent,
    status: result.errors.length > 0 && result.accepted === 0 ? "failed" : result.errors.length > 0 ? "partial" : "ok",
    requested: result.requested,
    accepted: result.accepted,
    ticketCount: result.ticketCount,
    receiptCheckedCount: result.receiptCheckedCount,
    dropped: result.dropped,
    droppedTokenSamples: result.droppedTokens.slice(0, 5).map(maskPushToken),
    errors: result.errors.slice(0, 10),
  });
  console.log(
    `[push] ${safeKind} broadcast result requested=${result.requested} accepted=${result.accepted} tickets=${result.ticketCount} receipts=${result.receiptCheckedCount} dropped=${result.dropped} errors=${result.errors.length}`
  );

  return result;
}

async function sendNearbyTruckAlertPushNotification(user, truck, distanceMeters) {
  const pushTokens = collectUserExpoPushTokens(user);

  if (pushTokens.length === 0) {
    return {
      requested: 0,
      accepted: 0,
      ticketCount: 0,
      receiptCheckedCount: 0,
      dropped: 0,
      droppedTokens: [],
      errors: [],
    };
  }

  const truckStatus = String(truck?.status || "active").trim().toLowerCase();
  const distanceLabel = formatDistanceMeters(distanceMeters);
  const messages = pushTokens.map((pushToken) => ({
    to: pushToken,
    sound: "default",
    title: `${String(truck?.truckId || "Garbage truck").trim()} is nearby`,
    body: `A ${truckStatus} garbage truck is about ${distanceLabel} from your last synced location.`,
    data: {
      type: "nearby-truck",
      truckId: String(truck?.truckId || "").trim(),
      status: String(truck?.status || "").trim(),
      distanceMeters: Math.max(1, Math.round(distanceMeters)),
      screen: "Live Map",
    },
    priority: "high",
    channelId: "nearby-trucks",
  }));

  return deliverExpoPushMessages(messages);
}

async function processNearbyTruckAlerts(truck) {
  if (!truck?.truckId || !Number.isFinite(truck.latitude) || !Number.isFinite(truck.longitude)) {
    return;
  }

  const eligibleUsers = await listUsersEligibleForNearbyTruckAlerts();
  const summary = {
    truckId: truck.truckId,
    truckStatus: String(truck.status || "").trim(),
    status: "no_match",
    evaluatedUsers: eligibleUsers.length,
    availableTokenCount: 0,
    insideRadiusCount: 0,
    alertedUsers: 0,
    suppressedUsers: 0,
    rearmedUsers: 0,
    requested: 0,
    accepted: 0,
    ticketCount: 0,
    receiptCheckedCount: 0,
    dropped: 0,
    errors: [],
  };

  for (const user of eligibleUsers) {
    const location = user?.nearbyAlertLocation;
    const pushTokens = collectUserExpoPushTokens(user);
    summary.availableTokenCount += pushTokens.length;

    if (!location || pushTokens.length === 0) {
      continue;
    }

    const distanceMeters = getDistanceMeters(location, truck);
    const isInsideAlertZone = distanceMeters <= NEARBY_TRUCK_ALERT_RADIUS_METERS;
    const isOutsideRearmZone = distanceMeters >= NEARBY_TRUCK_ALERT_REARM_METERS;
    const existingState = getNearbyTruckState(user.id, truck.truckId);

    if (isInsideAlertZone) {
      summary.insideRadiusCount += 1;

      if (existingState?.inside || existingState?.status === "sending") {
        summary.suppressedUsers += 1;
        continue;
      }

      setNearbyTruckState(user.id, truck.truckId, {
        status: "sending",
        updatedAt: new Date().toISOString(),
      });

      const result = await sendNearbyTruckAlertPushNotification(user, truck, distanceMeters);
      summary.requested += result.requested;
      summary.accepted += result.accepted;
      summary.ticketCount += result.ticketCount;
      summary.receiptCheckedCount += result.receiptCheckedCount;
      summary.dropped += result.dropped;
      summary.errors.push(...result.errors);

      if (result.accepted > 0) {
        summary.alertedUsers += 1;
        setNearbyTruckState(user.id, truck.truckId, {
          status: "inside",
          inside: true,
          lastAlertAt: new Date().toISOString(),
          lastDistanceMeters: Math.max(1, Math.round(distanceMeters)),
        });
      } else {
        deleteNearbyTruckState(user.id, truck.truckId);
      }

      continue;
    }

    if (isOutsideRearmZone && existingState) {
      deleteNearbyTruckState(user.id, truck.truckId);
      summary.rearmedUsers += 1;
    }
  }

  if (summary.alertedUsers > 0) {
    summary.status = summary.errors.length > 0 && summary.accepted === 0 ? "failed" : summary.errors.length > 0 ? "partial" : "sent";
  } else if (summary.insideRadiusCount > 0) {
    summary.status = summary.suppressedUsers > 0 ? "suppressed" : "inside_no_delivery";
  } else if (summary.rearmedUsers > 0) {
    summary.status = "rearmed";
  }

  pushDiagnostics.lastNearbyTruckAlert = snapshotPushDiagnosticEvent({
    ...summary,
    errors: summary.errors.slice(0, 10),
  });

  console.log(
    `[push] nearby truck ${truck.truckId} status=${summary.status} evaluated=${summary.evaluatedUsers} inside=${summary.insideRadiusCount} alerted=${summary.alertedUsers} suppressed=${summary.suppressedUsers} rearmed=${summary.rearmedUsers} requested=${summary.requested} accepted=${summary.accepted} dropped=${summary.dropped} errors=${summary.errors.length}`
  );

  return summary;
}

function isEmailSendingConfigured() {
  return RESEND_EMAIL_ENABLED || (EMAIL_SENDING_ENABLED && Boolean(mailTransporter));
}

function getConfiguredEmailProviderLabel() {
  if (RESEND_EMAIL_ENABLED) {
    return "Resend API";
  }

  if (EMAIL_SENDING_ENABLED && mailTransporter) {
    return `${SMTP_HOST}:${SMTP_PORT}`;
  }

  return "";
}

function buildPasswordResetEmailText(resetCode) {
  return [
    "EcoTrack password reset",
    "",
    "Use this one-time reset code to change your password:",
    String(resetCode || ""),
    "",
    "The code expires in 10 minutes.",
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");
}

function buildPasswordResetEmailHtml(resetCode) {
  const safeCode = String(resetCode || "").replace(/[^0-9A-Za-z]/g, "");

  return (
    "<div style=\"font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;\">" +
    "<h2 style=\"margin:0 0 12px;\">EcoTrack password reset</h2>" +
    "<p style=\"margin:0 0 12px;\">Use this one-time reset code to change your password:</p>" +
    "<p style=\"font-size:28px;letter-spacing:4px;font-weight:700;margin:0 0 12px;color:#0f766e;\">" +
    safeCode +
    "</p>" +
    "<p style=\"margin:0 0 8px;\">The code expires in 10 minutes.</p>" +
    "<p style=\"margin:0;\">If you did not request this reset, you can ignore this email.</p>" +
    "</div>"
  );
}

async function sendPasswordResetCodeEmail(email, resetCode) {
  if (!isEmailSendingConfigured()) {
    throw new Error("Forgot-password email delivery is not configured.");
  }

  if (RESEND_EMAIL_ENABLED) {
    const fromValue = RESEND_FROM.includes("<")
      ? RESEND_FROM
      : `${RESEND_FROM_NAME} <${RESEND_FROM}>`;

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromValue,
        to: [email],
        subject: "EcoTrack password reset code",
        text: buildPasswordResetEmailText(resetCode),
        html: buildPasswordResetEmailHtml(resetCode),
        ...(RESEND_REPLY_TO ? { reply_to: RESEND_REPLY_TO } : {}),
      }),
    });

    const responseText = await response.text();
    let payload = {};

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Resend email API failed with status ${response.status}${responseText ? `: ${responseText.slice(0, 240)}` : ""}`
      );
    }

    return payload;
  }

  if (!mailTransporter) {
    throw new Error("SMTP mail transport is not configured.");
  }

  await mailTransporter.sendMail({
    from: {
      name: SMTP_FROM_NAME,
      address: SMTP_FROM,
    },
    to: email,
    subject: "EcoTrack password reset code",
    text: buildPasswordResetEmailText(resetCode),
    html: buildPasswordResetEmailHtml(resetCode),
  });
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

function normalizeSchedulePayload(payload = {}) {
  const day = String(payload.day || "").trim();
  const zone = String(payload.zone || "").trim();
  const timeWindow = String(payload.timeWindow || "").trim();
  const wasteType = String(payload.wasteType || "").trim();
  const notes = String(payload.notes || "").trim();

  if (!day || !zone || !timeWindow || !wasteType) {
    return null;
  }

  return {
    day,
    zone,
    timeWindow,
    wasteType,
    notes,
  };
}

function normalizeFeedPayload(payload = {}) {
  const title = String(payload.title || "").trim();
  const details = String(payload.details || "").trim();

  if (!title || !details) {
    return {
      error: "title and details are required",
    };
  }

  return {
    title,
    details,
  };
}

function normalizeTripTicketPayload(payload = {}) {
  const truckId = normalizeTruckId(payload.truckId);
  const driverName = String(payload.driverName || "").trim();
  const zone = String(payload.zone || "").trim();
  const wasteType = String(payload.wasteType || "").trim();
  const scheduledWindow = String(payload.scheduledWindow || "").trim();
  const remarks = String(payload.remarks || "").trim();
  const status = String(payload.status || "Scheduled").trim() || "Scheduled";
  const rawVolumeKg = payload.volumeKg;
  const volumeKg =
    rawVolumeKg === "" || rawVolumeKg === null || typeof rawVolumeKg === "undefined"
      ? 0
      : Number(rawVolumeKg);
  const departureAt = payload.departureAt ? new Date(payload.departureAt) : null;
  const completedAt = payload.completedAt ? new Date(payload.completedAt) : null;

  if (!truckId || !driverName || !zone || !wasteType || !scheduledWindow || !departureAt) {
    return {
      error: "truckId, driverName, zone, wasteType, scheduledWindow, and departureAt are required",
    };
  }

  if (isBlockedTruckId(truckId)) {
    return {
      error: "TRUCK-001 is reserved and cannot be used",
    };
  }

  if (Number.isNaN(departureAt.getTime())) {
    return {
      error: "departureAt must be a valid date and time",
    };
  }

  if (completedAt && Number.isNaN(completedAt.getTime())) {
    return {
      error: "completedAt must be a valid date and time",
    };
  }

  if (!TRIP_TICKET_STATUSES.includes(status)) {
    return {
      error: `status must be one of: ${TRIP_TICKET_STATUSES.join(", ")}`,
    };
  }

  if (!Number.isFinite(volumeKg) || volumeKg < 0) {
    return {
      error: "volumeKg must be a valid positive number",
    };
  }

  if (completedAt && completedAt.getTime() <= departureAt.getTime()) {
    return {
      error: "completedAt must be later than departureAt",
    };
  }

  if ((status === "Completed" || status === "Delayed") && !completedAt) {
    return {
      error: "completedAt is required for completed or delayed trip tickets",
    };
  }

  return {
    truckId,
    driverName,
    zone,
    wasteType,
    scheduledWindow,
    departureAt,
    completedAt,
    status,
    volumeKg,
    remarks,
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

function normalizeForgotPasswordPayload(payload = {}) {
  const email = normalizeEmail(payload.email);

  if (!email) {
    return { error: "email is required" };
  }

  if (!email.includes("@")) {
    return { error: "Please enter a valid email address" };
  }

  return { email };
}

function normalizeResetPasswordPayload(payload = {}) {
  const email = normalizeEmail(payload.email);
  const code = String(payload.code || "").trim();
  const newPassword = String(payload.newPassword || "").trim();

  if (!email || !code || !newPassword) {
    return { error: "email, code, and newPassword are required" };
  }

  if (!email.includes("@")) {
    return { error: "Please enter a valid email address" };
  }

  if (newPassword.length < 6) {
    return { error: "Password must be at least 6 characters long" };
  }

  return {
    email,
    code,
    newPassword,
  };
}

function normalizeChangePasswordPayload(payload = {}) {
  const currentPassword = String(payload.currentPassword || "").trim();
  const newPassword = String(payload.newPassword || "").trim();

  if (!newPassword) {
    return { error: "newPassword is required" };
  }

  if (newPassword.length < 6) {
    return { error: "Password must be at least 6 characters long" };
  }

  return {
    currentPassword,
    newPassword,
  };
}

function normalizeGoogleLoginPayload(payload = {}) {
  const idToken = String(payload.idToken || payload.id_token || "").trim();

  if (!idToken) {
    return { error: "idToken is required" };
  }

  return { idToken };
}

function getAllowedGoogleAudiences() {
  return Array.from(
    new Set(
      [
        process.env.GOOGLE_WEB_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
        process.env.GOOGLE_EXPO_CLIENT_ID,
        process.env.GOOGLE_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

async function verifyGoogleIdToken(idToken) {
  let response;

  try {
    response = await fetch(GOOGLE_TOKENINFO_URL + "?id_token=" + encodeURIComponent(idToken));
  } catch (error) {
    return {
      ok: false,
      reason: "Token verification request failed",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "Google tokeninfo rejected the token",
    };
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    return {
      ok: false,
      reason: "Google tokeninfo returned invalid payload",
    };
  }

  const email = normalizeEmail(payload.email);
  const emailVerifiedRaw = payload.email_verified;
  const emailVerified =
    emailVerifiedRaw === true || String(emailVerifiedRaw || "").trim().toLowerCase() === "true";

  if (!email || !emailVerified) {
    return {
      ok: false,
      reason: "Google account email is missing or not verified",
    };
  }

  const allowedAudiences = getAllowedGoogleAudiences();
  if (allowedAudiences.length > 0 && payload.aud && !allowedAudiences.includes(payload.aud)) {
    return {
      ok: false,
      reason: "Token audience mismatch (aud=" + String(payload.aud || "") + ")",
    };
  }

  const fallbackName = email.split("@")[0] || "Google User";

  return {
    ok: true,
    profile: {
      sub: String(payload.sub || "").trim(),
      email,
      name: String(payload.name || payload.given_name || fallbackName).trim(),
      picture: String(payload.picture || "").trim(),
    },
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

    const activeSession = await userSessionsCollection.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
    const user = activeSession?.userId ? await findUserById(activeSession.userId) : null;

    if (!user) {
      await userSessionsCollection.deleteOne({ token });
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

async function authenticateAdminRequest(req, res, next) {
  try {
    const token =
      extractBearerToken(req.headers.authorization) || String(req.headers["x-admin-token"] || "").trim();

    if (!token) {
      res.status(401).json({
        error: "Admin authentication required",
      });
      return;
    }

    const adminSession = await adminSessionsCollection.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });

    if (!adminSession) {
      await adminSessionsCollection.deleteOne({ token });
      res.status(401).json({
        error: "Invalid or expired admin session",
      });
      return;
    }

    req.adminToken = token;
    req.adminUser = adminSession;
    next();
  } catch (error) {
    console.error("Admin authentication error:", error.message);
    res.status(500).json({
      error: "Admin authentication failed",
    });
  }
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
  announcementsCollection = database.collection("announcements");
  newsCollection = database.collection("news");
  tripTicketsCollection = database.collection("trip_tickets");
  countersCollection = database.collection("counters");
  userSessionsCollection = database.collection("sessions");
  adminSessionsCollection = database.collection("admin_sessions");
  passwordResetCodesCollection = database.collection("password_reset_codes");

  await Promise.all([
    usersCollection.createIndex({ email: 1 }, { unique: true }),
    usersCollection.createIndex({ id: 1 }, { unique: true }),
    usersCollection.createIndex({ role: 1, truckId: 1 }),
    usersCollection.createIndex({ pushTokens: 1 }),
    reportsCollection.createIndex({ id: 1 }, { unique: true }),
    reportsCollection.createIndex({ createdAt: -1 }),
    schedulesCollection.createIndex({ id: 1 }, { unique: true }),
    announcementsCollection.createIndex({ id: 1 }, { unique: true }),
    announcementsCollection.createIndex({ createdAt: -1 }),
    newsCollection.createIndex({ id: 1 }, { unique: true }),
    newsCollection.createIndex({ createdAt: -1 }),
    tripTicketsCollection.createIndex({ id: 1 }, { unique: true }),
    tripTicketsCollection.createIndex({ departureAt: -1 }),
    tripTicketsCollection.createIndex({ truckId: 1, departureAt: -1 }),
    tripTicketsCollection.createIndex({ zone: 1 }),
    userSessionsCollection.createIndex({ token: 1 }, { unique: true }),
    userSessionsCollection.createIndex({ userId: 1 }),
    userSessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    adminSessionsCollection.createIndex({ token: 1 }, { unique: true }),
    adminSessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    passwordResetCodesCollection.createIndex({ email: 1 }, { unique: true }),
    passwordResetCodesCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const scheduleCount = await schedulesCollection.countDocuments();
  if (scheduleCount === 0) {
    await schedulesCollection.insertMany(DEFAULT_COLLECTION_SCHEDULE.map((item) => ({ ...item })));
  }

  const announcementsCount = await announcementsCollection.countDocuments();
  if (announcementsCount === 0) {
    const now = Date.now();
    await announcementsCollection.insertMany(
      DEFAULT_ANNOUNCEMENTS.map((item, index) => ({
        ...item,
        createdAt: new Date(now - index * 60000),
        updatedAt: new Date(now - index * 60000),
      }))
    );
  }

  const newsCount = await newsCollection.countDocuments();
  if (newsCount === 0) {
    const now = Date.now();
    await newsCollection.insertMany(
      DEFAULT_NEWS_ITEMS.map((item, index) => ({
        ...item,
        createdAt: new Date(now - index * 60000),
        updatedAt: new Date(now - index * 60000),
      }))
    );
  }

  if (DEFAULT_TRIP_TICKET_IDS.length > 0) {
    const cleanupResult = await tripTicketsCollection.deleteMany({
      id: { $in: DEFAULT_TRIP_TICKET_IDS },
    });

    if (cleanupResult.deletedCount > 0) {
      console.log(`[trip-tickets] Removed ${cleanupResult.deletedCount} seeded demo trip ticket(s).`);
    }
  }

  const [maxUserCounter, maxReportCounter, maxScheduleCounter, maxAnnouncementCounter, maxNewsCounter, maxTripTicketCounter] = await Promise.all([
    getMaxCounterFromCollection(usersCollection, "USR-"),
    getMaxCounterFromCollection(reportsCollection, "RPT-"),
    getMaxCounterFromCollection(schedulesCollection, "SCH-"),
    getMaxCounterFromCollection(announcementsCollection, "ANN-"),
    getMaxCounterFromCollection(newsCollection, "NEWS-"),
    getMaxCounterFromCollection(tripTicketsCollection, "TT-"),
  ]);

  await Promise.all([
    ensureCounter("user", maxUserCounter),
    ensureCounter("report", maxReportCounter),
    ensureCounter("schedule", maxScheduleCounter),
    ensureCounter("announcement", maxAnnouncementCounter),
    ensureCounter("news", maxNewsCounter),
    ensureCounter("trip_ticket", maxTripTicketCounter),
  ]);

  await migrateLegacyPasswords();

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
      "POST /auth/google",
      "POST /auth/forgot-password",
      "POST /auth/reset-password",
      "POST /auth/change-password",
      "POST /users/push-token",
      "POST /users/push-token/remove",
      "POST /users/nearby-alert-location",
      "POST /users/nearby-alert-location/remove",
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
      "GET /admin/trip-tickets",
      "POST /admin/trip-tickets",
      "PUT /admin/trip-tickets/:id",
      "DELETE /admin/trip-tickets/:id",
      "GET /admin/announcements",
      "POST /admin/announcements",
      "PUT /admin/announcements/:id",
      "DELETE /admin/announcements/:id",
      "GET /admin/news",
      "POST /admin/news",
      "PUT /admin/news/:id",
      "DELETE /admin/news/:id",
      "GET /admin/push/status",
      "GET /announcements",
      "GET /news",
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

app.post("/admin/auth/login", asyncRoute(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!username || !password) {
    res.status(400).json({
      error: "username and password are required",
    });
    return;
  }

  const passwordMatches = username === ADMIN_USER ? await verifyAdminPassword(password) : false;
  if (!passwordMatches) {
    res.status(401).json({
      error: "Invalid admin credentials",
    });
    return;
  }

  const session = await createAdminSession(username);

  res.status(200).json({
    message: "Admin login successful.",
    ...session,
  });
}));

app.post(
  "/admin/auth/logout",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    await clearAdminSession(req.adminToken);

    res.status(200).json({
      message: "Admin logged out.",
    });
  })
);
app.get(
  "/admin/push/status",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    res.json(await buildPushDiagnosticsStatus());
  })
);

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
      passwordHash: await hashPassword(driverPayload.password),
      passwordChangedAt: new Date(),
      role: USER_ROLES.driver,
      truckId: driverPayload.truckId,
      authProvider: "local",
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

    const updateOperation = {
      $set: updateData,
    };

    if (driverPayload.password) {
      updateOperation.$set.passwordHash = await hashPassword(driverPayload.password);
      updateOperation.$set.passwordChangedAt = new Date();
      updateOperation.$unset = {
        password: "",
      };
    }

    const updateResult = await usersCollection.findOneAndUpdate(
      { id: driverId, role: USER_ROLES.driver },
      updateOperation,
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

    await clearUserSessions(driverId);

    res.status(200).json({
      message: "Driver account deleted successfully.",
      id: driverId,
    });
  })
);

app.get(
  "/admin/trip-tickets",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const tripTickets = await getTripTicketList();

    res.json({
      tripTickets,
      tripAnalytics: buildTripTicketAnalytics(tripTickets),
    });
  })
);

app.post(
  "/admin/trip-tickets",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const payload = normalizeTripTicketPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const tripTicket = {
      id: await nextTripTicketId(),
      truckId: payload.truckId,
      driverName: payload.driverName,
      zone: payload.zone,
      wasteType: payload.wasteType,
      scheduledWindow: payload.scheduledWindow,
      departureAt: payload.departureAt,
      completedAt: payload.completedAt || null,
      status: payload.status,
      volumeKg: payload.volumeKg,
      remarks: payload.remarks,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await tripTicketsCollection.insertOne(tripTicket);
    const publicTripTicket = sanitizeTripTicket(tripTicket);
    io.emit("trip-ticket:created", publicTripTicket);

    res.status(201).json({
      message: "Trip ticket created successfully.",
      tripTicket: publicTripTicket,
    });
  })
);

app.put(
  "/admin/trip-tickets/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const tripTicketId = String(req.params.id || "").trim().toUpperCase();

    if (!tripTicketId) {
      res.status(400).json({
        error: "trip ticket id is required",
      });
      return;
    }

    const existingTripTicket = await findTripTicketById(tripTicketId);
    if (!existingTripTicket) {
      res.status(404).json({
        error: "Trip ticket not found",
      });
      return;
    }

    const payload = normalizeTripTicketPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const updateResult = await tripTicketsCollection.findOneAndUpdate(
      { id: tripTicketId },
      {
        $set: {
          truckId: payload.truckId,
          driverName: payload.driverName,
          zone: payload.zone,
          wasteType: payload.wasteType,
          scheduledWindow: payload.scheduledWindow,
          departureAt: payload.departureAt,
          completedAt: payload.completedAt || null,
          status: payload.status,
          volumeKg: payload.volumeKg,
          remarks: payload.remarks,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedTripTicket = updateResult?.value || updateResult;

    if (!updatedTripTicket) {
      res.status(404).json({
        error: "Trip ticket not found",
      });
      return;
    }

    const publicTripTicket = sanitizeTripTicket(updatedTripTicket);
    io.emit("trip-ticket:updated", publicTripTicket);

    res.status(200).json({
      message: "Trip ticket updated successfully.",
      tripTicket: publicTripTicket,
    });
  })
);

app.delete(
  "/admin/trip-tickets/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const tripTicketId = String(req.params.id || "").trim().toUpperCase();

    if (!tripTicketId) {
      res.status(400).json({
        error: "trip ticket id is required",
      });
      return;
    }

    const deleteResult = await tripTicketsCollection.deleteOne({ id: tripTicketId });

    if (!deleteResult.deletedCount) {
      res.status(404).json({
        error: "Trip ticket not found",
      });
      return;
    }

    io.emit("trip-ticket:deleted", {
      id: tripTicketId,
    });

    res.status(200).json({
      message: "Trip ticket deleted successfully.",
      id: tripTicketId,
    });
  })
);


app.get(
  "/admin/announcements",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    res.json({
      announcements: await getAnnouncementList(),
    });
  })
);

app.post(
  "/admin/announcements",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const payload = normalizeFeedPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const announcement = {
      id: await nextAnnouncementId(),
      title: payload.title,
      details: payload.details,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await announcementsCollection.insertOne(announcement);
    const publicAnnouncement = sanitizeFeedItem(announcement);
    io.emit("announcement:created", publicAnnouncement);

    sendBroadcastFeedPushNotification("announcement", publicAnnouncement)
      .then((result) => {
        if (result.requested > 0) {
          console.log(`[push] Announcement broadcast delivered to ${result.accepted}/${result.requested} device(s).`);

          if (result.errors?.length) {
            const sample = result.errors.slice(0, 3).map((entry) => entry.message).join(" | ");
            console.warn(`[push] Announcement push errors (${result.errors.length}): ${sample}`);
          }
        }
      })
      .catch((error) => {
        console.error("[push] Failed to send announcement push notifications:", error?.message || error);
      });

    res.status(201).json({
      message: "Announcement created successfully.",
      announcement: publicAnnouncement,
    });
  })
);

app.put(
  "/admin/announcements/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const announcementId = String(req.params.id || "").trim().toUpperCase();
    const payload = normalizeFeedPayload(req.body);

    if (!announcementId) {
      res.status(400).json({
        error: "announcement id is required",
      });
      return;
    }

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const updateResult = await announcementsCollection.findOneAndUpdate(
      { id: announcementId },
      {
        $set: {
          title: payload.title,
          details: payload.details,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedAnnouncement = updateResult?.value || updateResult;

    if (!updatedAnnouncement) {
      res.status(404).json({
        error: "Announcement not found",
      });
      return;
    }

    const publicAnnouncement = sanitizeFeedItem(updatedAnnouncement);
    io.emit("announcement:updated", publicAnnouncement);

    res.status(200).json({
      message: "Announcement updated successfully.",
      announcement: publicAnnouncement,
    });
  })
);

app.delete(
  "/admin/announcements/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const announcementId = String(req.params.id || "").trim().toUpperCase();

    if (!announcementId) {
      res.status(400).json({
        error: "announcement id is required",
      });
      return;
    }

    const deleteResult = await announcementsCollection.deleteOne({ id: announcementId });

    if (!deleteResult.deletedCount) {
      res.status(404).json({
        error: "Announcement not found",
      });
      return;
    }

    io.emit("announcement:deleted", {
      id: announcementId,
    });

    res.status(200).json({
      message: "Announcement deleted successfully.",
      id: announcementId,
    });
  })
);

app.get(
  "/admin/news",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    res.json({
      news: await getNewsList(),
    });
  })
);

app.post(
  "/admin/news",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const payload = normalizeFeedPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const newsItem = {
      id: await nextNewsId(),
      title: payload.title,
      details: payload.details,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await newsCollection.insertOne(newsItem);
    const publicNews = sanitizeFeedItem(newsItem);
    io.emit("news:created", publicNews);

    sendBroadcastFeedPushNotification("news", publicNews)
      .then((result) => {
        if (result.requested > 0) {
          console.log(`[push] News broadcast delivered to ${result.accepted}/${result.requested} device(s).`);

          if (result.errors?.length) {
            const sample = result.errors.slice(0, 3).map((entry) => entry.message).join(" | ");
            console.warn(`[push] News push errors (${result.errors.length}): ${sample}`);
          }
        }
      })
      .catch((error) => {
        console.error("[push] Failed to send news push notifications:", error?.message || error);
      });

    res.status(201).json({
      message: "News created successfully.",
      news: publicNews,
    });
  })
);

app.put(
  "/admin/news/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const newsId = String(req.params.id || "").trim().toUpperCase();
    const payload = normalizeFeedPayload(req.body);

    if (!newsId) {
      res.status(400).json({
        error: "news id is required",
      });
      return;
    }

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const updateResult = await newsCollection.findOneAndUpdate(
      { id: newsId },
      {
        $set: {
          title: payload.title,
          details: payload.details,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    const updatedNews = updateResult?.value || updateResult;

    if (!updatedNews) {
      res.status(404).json({
        error: "News not found",
      });
      return;
    }

    const publicNews = sanitizeFeedItem(updatedNews);
    io.emit("news:updated", publicNews);

    res.status(200).json({
      message: "News updated successfully.",
      news: publicNews,
    });
  })
);

app.delete(
  "/admin/news/:id",
  authenticateAdminRequest,
  asyncRoute(async (req, res) => {
    const newsId = String(req.params.id || "").trim().toUpperCase();

    if (!newsId) {
      res.status(400).json({
        error: "news id is required",
      });
      return;
    }

    const deleteResult = await newsCollection.deleteOne({ id: newsId });

    if (!deleteResult.deletedCount) {
      res.status(404).json({
        error: "News not found",
      });
      return;
    }

    io.emit("news:deleted", {
      id: newsId,
    });

    res.status(200).json({
      message: "News deleted successfully.",
      id: newsId,
    });
  })
);
app.get("/admin", (req, res) => {
  res.sendFile(path.join(ADMIN_PUBLIC_DIR, "index.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(ADMIN_PUBLIC_DIR, "index.html"));
});

app.get("/admin/assets/splash-logo.png", (req, res) => {
  res.sendFile(path.join(MOBILE_ASSETS_DIR, "splash-logo.png"));
});

app.use(
  "/admin",
  (req, res, next) => {
    res.setHeader("Cache-Control", ADMIN_STATIC_CACHE_CONTROL);
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  },
  express.static(ADMIN_PUBLIC_DIR)
);



app.get(
  "/announcements",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    res.json({
      announcements: await getAnnouncementList(),
    });
  })
);

app.get(
  "/news",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    res.json({
      news: await getNewsList(),
    });
  })
);
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
  "/auth/google",
  asyncRoute(async (req, res) => {
    const googleLogin = normalizeGoogleLoginPayload(req.body);

    if (googleLogin.error) {
      res.status(400).json({ error: googleLogin.error });
      return;
    }

    const googleVerification = await verifyGoogleIdToken(googleLogin.idToken);

    if (!googleVerification.ok) {
      const reason = String(googleVerification.reason || "Google token validation failed");
      res.status(401).json({ error: "Google authentication failed: " + reason });
      return;
    }

    const googleProfile = googleVerification.profile;
    let user = await findUserByEmail(googleProfile.email);

    if (!user) {
      user = {
        id: await nextUserId(),
        name: googleProfile.name || "Google User",
        email: googleProfile.email,
        passwordHash: await hashPassword(crypto.randomBytes(16).toString("hex")),
        passwordChangedAt: new Date(),
        role: USER_ROLES.citizen,
        truckId: "",
        authProvider: "google",
        googleId: googleProfile.sub || "",
        avatarUrl: googleProfile.picture || "",
        createdAt: new Date(),
      };

      await usersCollection.insertOne(user);
    } else {
      const updatePayload = {};

      if (googleProfile.sub) {
        updatePayload.googleId = googleProfile.sub;
      }

      if (googleProfile.picture) {
        updatePayload.avatarUrl = googleProfile.picture;
      }

      if (Object.keys(updatePayload).length > 0) {
        await usersCollection.updateOne({ id: user.id }, { $set: updatePayload });
        user = await findUserById(user.id);
      }
    }

    const session = await createSession(user);

    res.status(200).json({
      message: "Google login successful.",
      ...session,
    });
  })
);

app.post(
  "/auth/forgot-password",
  asyncRoute(async (req, res) => {
    const forgot = normalizeForgotPasswordPayload(req.body);

    if (forgot.error) {
      res.status(400).json({ error: forgot.error });
      return;
    }

    console.log("[auth] Forgot-password request received for " + forgot.email);

    if (IS_PRODUCTION && !isEmailSendingConfigured()) {
      res.status(503).json({
        error: "Password reset email is not configured on the server.",
      });
      return;
    }

    const user = await findUserByEmail(forgot.email);
    let generatedCode = "";

    if (user) {
      generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      await storePasswordResetCode(forgot.email, user.id, generatedCode);

      try {
        if (isEmailSendingConfigured()) {
          await sendPasswordResetCodeEmail(forgot.email, generatedCode);
          console.log("[auth] Password reset code sent to " + forgot.email);
        } else {
          console.log("[auth] Password reset code for " + forgot.email + ": " + generatedCode);
        }
      } catch (error) {
        await clearPasswordResetCode(forgot.email);
        console.error("[auth] Failed to send password reset email to " + forgot.email + ": " + (error?.message || error));
        res.status(502).json({
          error: "Unable to send reset code email right now. Please try again.",
        });
        return;
      }
    }

    res.status(200).json({
      message: isEmailSendingConfigured()
        ? "If an account exists for that email, a reset code has been sent."
        : "If an account exists for that email, a reset code has been generated.",
      ...(INCLUDE_RESET_CODE_IN_RESPONSE && generatedCode ? { resetCode: generatedCode } : {}),
    });
  })
);

app.post(
  "/auth/reset-password",
  asyncRoute(async (req, res) => {
    const reset = normalizeResetPasswordPayload(req.body);

    if (reset.error) {
      res.status(400).json({ error: reset.error });
      return;
    }

    const codeRecord = await getActivePasswordResetCode(reset.email);

    if (!codeRecord) {
      await clearPasswordResetCode(reset.email);
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    if (codeRecord.code !== reset.code) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    const user = await findUserByEmail(reset.email);

    if (!user) {
      await clearPasswordResetCode(reset.email);
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await usersCollection.updateOne(
      { id: user.id },
      {
        $set: {
          passwordHash: await hashPassword(reset.newPassword),
          passwordChangedAt: new Date(),
        },
        $unset: {
          password: "",
        },
      }
    );

    await clearPasswordResetCode(reset.email);
    await clearUserSessions(user.id);

    res.status(200).json({
      message: "Password reset successful. Please log in again.",
    });
  })
);

app.post(
  "/auth/change-password",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    const passwordPayload = normalizeChangePasswordPayload(req.body);

    if (passwordPayload.error) {
      res.status(400).json({ error: passwordPayload.error });
      return;
    }

    const user = await findUserById(req.user.id);

    if (!user) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const isGoogleUser = String(user.authProvider || "").trim().toLowerCase() === "google";

    if (!isGoogleUser) {
      if (!passwordPayload.currentPassword) {
        res.status(400).json({ error: "currentPassword is required" });
        return;
      }

      const passwordMatches = await verifyAndUpgradeUserPassword(user, passwordPayload.currentPassword);

      if (!passwordMatches) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    await setUserPassword(user.id, passwordPayload.newPassword);
    await clearUserSessions(user.id);

    const nextUser = await findUserById(user.id);
    const session = await createSession(nextUser);

    res.status(200).json({
      message: isGoogleUser
        ? "Password set successfully. You can now use email and password too."
        : "Password changed successfully.",
      ...session,
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
      passwordHash: await hashPassword(signup.password),
      passwordChangedAt: new Date(),
      role: signup.role,
      truckId: signup.truckId,
      authProvider: "local",
      createdAt: new Date(),
    };

    await usersCollection.insertOne(user);

    const session = await createSession(user);

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
    const passwordMatches = user ? await verifyAndUpgradeUserPassword(user, login.password) : false;

    if (!user || !passwordMatches) {
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

    const session = await createSession(user);

    res.status(200).json({
      message: "Login successful.",
      ...session,
    });
  })
);

app.post(
  "/users/push-token",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    const payload = normalizePushTokenPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const registered = await registerUserPushToken(req.user.id, payload.pushToken, payload.platform);

    if (!registered) {
      res.status(404).json({
        error: "Account not found",
      });
      return;
    }

    res.status(200).json({
      message: "Push token registered.",
    });
  })
);

app.post(
  "/users/push-token/remove",
  authenticateRequest,
  asyncRoute(async (req, res) => {
    const payload = normalizePushTokenPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const removed = await removeUserPushToken(req.user.id, payload.pushToken);

    if (!removed) {
      res.status(404).json({
        error: "Account not found",
      });
      return;
    }

    res.status(200).json({
      message: "Push token removed.",
    });
  })
);

app.post(
  "/users/nearby-alert-location",
  authenticateRequest,
  authorizeRoles(USER_ROLES.citizen),
  asyncRoute(async (req, res) => {
    const payload = normalizeNearbyAlertLocationPayload(req.body);

    if (payload.error) {
      res.status(400).json({
        error: payload.error,
      });
      return;
    }

    const updated = await updateUserNearbyAlertLocation(req.user.id, payload);

    if (!updated) {
      res.status(404).json({
        error: "Account not found",
      });
      return;
    }

    res.status(200).json({
      message: "Nearby alert location updated.",
    });
  })
);

app.post(
  "/users/nearby-alert-location/remove",
  authenticateRequest,
  authorizeRoles(USER_ROLES.citizen),
  asyncRoute(async (req, res) => {
    const cleared = await clearUserNearbyAlertLocation(req.user.id);

    if (!cleared) {
      res.status(404).json({
        error: "Account not found",
      });
      return;
    }

    res.status(200).json({
      message: "Nearby alert location cleared.",
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
    processNearbyTruckAlerts(publicTruck).catch((error) => {
      console.error(`[push] nearby truck alert processing failed for ${publicTruck.truckId}:`, error?.message || error);
    });

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

    clearNearbyTruckStateForTruck(removedTruck.truckId);
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
        clearNearbyTruckStateForTruck(truck.truckId);
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
    validateProductionConfiguration();
    await connectDatabase();

    if (isEmailSendingConfigured()) {
      console.log(`[mail] Forgot-password email delivery enabled via ${getConfiguredEmailProviderLabel()}.`);
    } else {
      console.log("[mail] Forgot-password emails are disabled. Set RESEND_API_KEY and RESEND_FROM, or SMTP_USER/SMTP_PASS/SMTP_FROM.");
    }

    server.listen(PORT, HOST, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  }
}

startServer();


