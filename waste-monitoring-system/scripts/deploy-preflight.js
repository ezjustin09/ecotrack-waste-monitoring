const fs = require("fs");
const path = require("path");

function parseEnvFile(filepath) {
  if (!fs.existsSync(filepath)) {
    return {};
  }

  const lines = fs.readFileSync(filepath, "utf8").split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (String(value || "").trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function isPlaceholder(value) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("your-") ||
    text.includes("yourdomain") ||
    text.includes("example") ||
    text.includes("changeme") ||
    text.includes("replace-with") ||
    text.includes("placeholder")
  );
}

function looksLikeHash(value) {
  return String(value || "").startsWith("scrypt$");
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function looksLikeMongoUri(value) {
  return /^mongodb(\+srv)?:\/\//i.test(String(value || "").trim());
}

function looksLikeGoogleClientId(value) {
  return /\.apps\.googleusercontent\.com$/i.test(String(value || "").trim());
}

function looksLikeApiKey(value) {
  return String(value || "").trim().length >= 30;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function logResult(ok, title, details = "") {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${title}${details ? ` - ${details}` : ""}`);
}

function main() {
  const rootDir = process.cwd();
  const backendDir = path.join(rootDir, "backend");
  const mobileDir = path.join(rootDir, "mobile");

  const backendEnv = {
    ...parseEnvFile(path.join(backendDir, ".env")),
    ...process.env,
  };

  const mobileEnv = {
    ...parseEnvFile(path.join(mobileDir, ".env")),
    ...process.env,
  };

  const failures = [];

  const nodeEnv = firstNonEmpty([backendEnv.NODE_ENV, process.env.NODE_ENV]) || "production";
  if (nodeEnv !== "production") {
    failures.push("NODE_ENV should be production for release checks");
  }

  const mongodbUri = firstNonEmpty([backendEnv.MONGODB_URI]);
  if (!looksLikeMongoUri(mongodbUri) || isPlaceholder(mongodbUri)) {
    failures.push("MONGODB_URI is missing or invalid");
  }

  const adminPasswordHash = firstNonEmpty([backendEnv.ADMIN_PASSWORD_HASH]);
  if (!looksLikeHash(adminPasswordHash) || isPlaceholder(adminPasswordHash)) {
    failures.push("ADMIN_PASSWORD_HASH is missing or invalid");
  }

  const corsOrigins = splitList(firstNonEmpty([backendEnv.CORS_ALLOWED_ORIGINS]));
  if (!corsOrigins.length) {
    failures.push("CORS_ALLOWED_ORIGINS is missing");
  } else if (corsOrigins.some((origin) => !looksLikeUrl(origin))) {
    failures.push("CORS_ALLOWED_ORIGINS contains invalid URL(s)");
  } else if (corsOrigins.some((origin) => isPlaceholder(origin))) {
    failures.push("CORS_ALLOWED_ORIGINS still uses placeholder domain(s)");
  }

  const androidMapsKey = firstNonEmpty([
    mobileEnv.GOOGLE_MAPS_ANDROID_API_KEY,
    mobileEnv.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
  ]);
  if (!looksLikeApiKey(androidMapsKey) || isPlaceholder(androidMapsKey)) {
    failures.push("GOOGLE_MAPS_ANDROID_API_KEY is missing or invalid");
  }

  const iosMapsKey = firstNonEmpty([
    mobileEnv.GOOGLE_MAPS_IOS_API_KEY,
    mobileEnv.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
  ]);
  if (!looksLikeApiKey(iosMapsKey) || isPlaceholder(iosMapsKey)) {
    failures.push("GOOGLE_MAPS_IOS_API_KEY is missing or invalid");
  }

  const googleClientIds = [
    mobileEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    mobileEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    mobileEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ];

  if (googleClientIds.some((value) => !looksLikeGoogleClientId(value) || isPlaceholder(value))) {
    failures.push("One or more EXPO_PUBLIC_GOOGLE_*_CLIENT_ID values are missing or invalid");
  }

  const apiHost = firstNonEmpty([mobileEnv.EXPO_PUBLIC_API_HOST]);
  if (!apiHost || isPlaceholder(apiHost)) {
    failures.push("EXPO_PUBLIC_API_HOST is missing");
  }

  console.log("\nWaste Monitoring Deployment Preflight\n");
  logResult(nodeEnv === "production", "NODE_ENV", `value: ${nodeEnv}`);
  logResult(looksLikeMongoUri(mongodbUri) && !isPlaceholder(mongodbUri), "Backend MONGODB_URI");
  logResult(looksLikeHash(adminPasswordHash) && !isPlaceholder(adminPasswordHash), "Backend ADMIN_PASSWORD_HASH");
  logResult(
    corsOrigins.length > 0 &&
      corsOrigins.every((origin) => looksLikeUrl(origin)) &&
      corsOrigins.every((origin) => !isPlaceholder(origin)),
    "Backend CORS_ALLOWED_ORIGINS"
  );
  logResult(looksLikeApiKey(androidMapsKey) && !isPlaceholder(androidMapsKey), "Mobile GOOGLE_MAPS_ANDROID_API_KEY");
  logResult(looksLikeApiKey(iosMapsKey) && !isPlaceholder(iosMapsKey), "Mobile GOOGLE_MAPS_IOS_API_KEY");
  logResult(googleClientIds.every((value) => looksLikeGoogleClientId(value) && !isPlaceholder(value)), "Mobile Google OAuth client IDs");
  logResult(Boolean(apiHost) && !isPlaceholder(apiHost), "Mobile EXPO_PUBLIC_API_HOST", `value: ${apiHost || "(empty)"}`);

  if (failures.length > 0) {
    console.error("\nDeployment preflight failed:\n");
    for (const item of failures) {
      console.error(`- ${item}`);
    }

    process.exit(1);
  }

  console.log("\nAll required deployment checks passed.\n");
}

main();