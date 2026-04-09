const fs = require("fs");
const path = require("path");
const http = require("http");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const SEED_PATH = path.join(DATA_DIR, "seed.json");
const DB_PATH = path.join(DATA_DIR, "ecotrack-db.json");
let shouldResetData = process.argv.includes("--reset-data");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (shouldResetData || !fs.existsSync(DB_PATH)) {
    const seed = fs.readFileSync(SEED_PATH, "utf8");
    fs.writeFileSync(DB_PATH, seed);
    shouldResetData = false;
  }
}

function syncDerivedState(data) {
  const openIssueCounts = data.issues.reduce((counts, issue) => {
    if (issue.status !== "Resolved") {
      counts[issue.barangay] = (counts[issue.barangay] || 0) + 1;
    }

    return counts;
  }, {});

  data.barangays = data.barangays.map((barangay) => ({
    ...barangay,
    issuesOpen: openIssueCounts[barangay.name] || 0,
  }));

  data.routes = data.routes.map((route) => ({
    ...route,
    progress:
      route.scheduledStops === 0
        ? 0
        : Math.min(100, Math.round((route.completedStops / route.scheduledStops) * 100)),
  }));

  return data;
}

function readDatabase() {
  ensureDataStore();
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  return syncDerivedState(data);
}

function writeDatabase(data) {
  const synchronizedData = syncDerivedState(data);
  fs.writeFileSync(DB_PATH, JSON.stringify(synchronizedData, null, 2));
  return synchronizedData;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "Resource not found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;

      if (data.length > 1000000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function computeOverview(data) {
  const routes = data.routes;
  const issues = data.issues;
  const barangays = data.barangays;

  const scheduledStops = routes.reduce((sum, route) => sum + route.scheduledStops, 0);
  const completedStops = routes.reduce((sum, route) => sum + route.completedStops, 0);
  const activeFleet = routes.filter((route) => route.status !== "Completed").length;
  const tonnageCollected = routes.reduce((sum, route) => sum + route.tonnageCollected, 0);
  const recyclableVolume = barangays.reduce((sum, barangay) => sum + barangay.recyclablesTons, 0);
  const unresolvedIssues = issues.filter((issue) => issue.status !== "Resolved").length;
  const delayedRoutes = routes.filter((route) => route.status === "Delayed").length;
  const collectionRate = scheduledStops === 0 ? 0 : Math.round((completedStops / scheduledStops) * 100);
  const diversionRate =
    tonnageCollected === 0
      ? 0
      : Math.round((recyclableVolume / (tonnageCollected + recyclableVolume)) * 100);

  return {
    generatedAt: new Date().toISOString(),
    scheduledStops,
    completedStops,
    collectionRate,
    activeFleet,
    tonnageCollected: Number(tonnageCollected.toFixed(1)),
    diversionRate,
    unresolvedIssues,
    delayedRoutes,
  };
}

function buildDashboardPayload() {
  const data = readDatabase();

  return {
    city: data.city,
    generatedAt: new Date().toISOString(),
    overview: computeOverview(data),
    schedule: data.schedule,
    routes: data.routes,
    barangays: data.barangays,
    issues: data.issues.sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)),
    crews: data.crews,
  };
}

function nextIssueId(issues) {
  const max = issues.reduce((currentMax, issue) => {
    const numeric = Number(issue.id.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 120);

  return `ISS-${String(max + 1).padStart(3, "0")}`;
}

function resolveStaticPath(urlPath) {
  const normalized = urlPath === "/" ? "/index.html" : urlPath;
  const requestedPath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return filePath;
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      app: "EcoTrack",
      city: "Pateros City",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    sendJson(res, 200, buildDashboardPayload());
    return;
  }

  if (req.method === "POST" && pathname === "/api/issues") {
    try {
      const body = await parseBody(req);
      const data = readDatabase();

      if (!body.title || !body.barangay || !body.priority || !body.type) {
        sendJson(res, 400, {
          error: "title, barangay, priority, and type are required",
        });
        return;
      }

      const issue = {
        id: nextIssueId(data.issues),
        title: String(body.title).trim(),
        barangay: String(body.barangay).trim(),
        priority: String(body.priority).trim(),
        type: String(body.type).trim(),
        notes: String(body.notes || "No additional notes provided.").trim(),
        reporter: String(body.reporter || "Field Supervisor").trim(),
        reportedAt: new Date().toISOString(),
        status: "Open",
      };

      data.issues.unshift(issue);
      writeDatabase(data);

      sendJson(res, 201, {
        message: "Issue logged",
        issue,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/issues/") && pathname.endsWith("/resolve")) {
    const issueId = pathname.split("/")[3];
    const data = readDatabase();
    const issue = data.issues.find((item) => item.id === issueId);

    if (!issue) {
      notFound(res);
      return;
    }

    issue.status = "Resolved";
    issue.resolvedAt = new Date().toISOString();
    writeDatabase(data);

    sendJson(res, 200, {
      message: "Issue resolved",
      issue,
    });
    return;
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/routes/") && pathname.endsWith("/advance")) {
    const routeId = pathname.split("/")[3];
    const data = readDatabase();
    const route = data.routes.find((item) => item.id === routeId);

    if (!route) {
      notFound(res);
      return;
    }

    const remainingStops = Math.max(route.scheduledStops - route.completedStops, 0);
    const progressStep = remainingStops > 6 ? 6 : Math.max(remainingStops, 1);
    route.completedStops = Math.min(route.completedStops + progressStep, route.scheduledStops);
    route.progress = Math.min(
      100,
      Math.round((route.completedStops / route.scheduledStops) * 100)
    );
    route.tonnageCollected = Number((route.tonnageCollected + progressStep * 0.18).toFixed(1));
    route.lastUpdated = new Date().toISOString();

    if (route.completedStops >= route.scheduledStops) {
      route.status = "Completed";
      route.nextCheckpoint = "Unload and submit post-route report";
    } else if (route.status === "Delayed" && route.progress >= 70) {
      route.status = "Recovering";
      route.nextCheckpoint = "Clear recovery stretch and report ETA";
    } else if (route.status === "Planned") {
      route.status = "On Schedule";
    }

    writeDatabase(data);

    sendJson(res, 200, {
      message: "Route advanced",
      route,
    });
    return;
  }

  notFound(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, pathname);
    } catch (error) {
      sendJson(res, 500, { error: "Server error", detail: error.message });
    }
    return;
  }

  const filePath = resolveStaticPath(pathname);

  if (!filePath || !fs.existsSync(filePath)) {
    notFound(res);
    return;
  }

  sendFile(res, filePath);
});

ensureDataStore();

server.listen(PORT, HOST, () => {
  console.log(`EcoTrack running on http://localhost:${PORT}`);
});


