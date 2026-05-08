import { NativeModules, Platform } from "react-native";

function normalizeConfiguredApiUrl(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  try {
    const url = new URL(rawValue);
    const blockedHosts = new Set(["api.yourdomain.com", "yourdomain.com", "example.com", "localhost"]);

    if (blockedHosts.has(url.hostname.toLowerCase())) {
      return "";
    }

    return url.origin.replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
}

function inferHostFromBundle() {
  const scriptUrl =
    NativeModules.SourceCode?.scriptURL ||
    NativeModules.SourceCode?.getConstants?.()?.scriptURL ||
    "";

  if (!scriptUrl) {
    return "";
  }

  const match = scriptUrl.match(/^[a-zA-Z]+:\/\/([^/:]+)/);
  return match?.[1] || "";
}

function normalizeApiHost(value) {
  const host = String(value || "").trim();

  if (!host) {
    return "";
  }

  const blockedHosts = new Set([
    "api.yourdomain.com",
    "yourdomain.com",
    "example.com",
    "localhost",
  ]);

  if (blockedHosts.has(host.toLowerCase())) {
    return "";
  }

  return host;
}

function resolveApiBaseUrl() {
  const envApiUrl = normalizeConfiguredApiUrl(process.env.EXPO_PUBLIC_API_URL);

  if (envApiUrl) {
    return envApiUrl;
  }

  const envHost = normalizeApiHost(process.env.EXPO_PUBLIC_API_HOST);
  if (envHost) {
    return `http://${envHost}:4000`;
  }

  const inferredHost = normalizeApiHost(inferHostFromBundle());
  if (inferredHost) {
    return `http://${inferredHost}:4000`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000";
  }

  if (Platform.OS === "ios") {
    return "http://127.0.0.1:4000";
  }

  return "http://localhost:4000";
}

export const API_BASE_URL = resolveApiBaseUrl();

async function parseJsonResponse(response) {
  const rawBody = await response.text();
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  let payload = null;

  if (rawBody) {
    const trimmedBody = rawBody.trim();
    const looksLikeJson =
      contentType.includes("application/json") ||
      trimmedBody.startsWith("{") ||
      trimmedBody.startsWith("[");

    if (looksLikeJson) {
      try {
        payload = JSON.parse(trimmedBody);
      } catch (error) {
        payload = null;
      }
    }
  }

  if (!response.ok) {
    if (payload?.error) {
      throw new Error(payload.error);
    }

    if (response.status === 413) {
      throw new Error("Attached image is too large. Please choose a smaller photo and try again.");
    }

    if (rawBody.trim().startsWith("<")) {
      throw new Error("Server returned an unexpected response. Please try again in a moment.");
    }

    throw new Error(rawBody.trim() || `Request failed (${response.status})`);
  }

  if (payload !== null) {
    return payload;
  }

  if (!rawBody) {
    return {};
  }

  throw new Error("Server returned an unexpected response.");
}

function buildHeaders(token) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function loginUser(credentials) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(credentials),
  });

  return parseJsonResponse(response);
}

export async function signUpUser(details) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(details),
  });

  return parseJsonResponse(response);
}

export async function loginWithGoogle(payload) {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export const loginCitizen = loginUser;
export const signUpCitizen = signUpUser;

export async function requestPasswordReset(email) {
  const response = await fetch(API_BASE_URL + "/auth/forgot-password", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ email }),
  });

  return parseJsonResponse(response);
}

export async function resetPassword(payload) {
  const response = await fetch(API_BASE_URL + "/auth/reset-password", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function changePassword(payload, token) {
  const response = await fetch(API_BASE_URL + "/auth/change-password", {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}

export async function updateProfilePicture(avatarUrl, token) {
  const response = await fetch(`${API_BASE_URL}/users/profile-picture`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify({ avatarUrl }),
  });

  return parseJsonResponse(response);
}

export async function registerPushToken(pushToken, token, platform = Platform.OS) {
  const response = await fetch(`${API_BASE_URL}/users/push-token`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({
      pushToken,
      platform,
    }),
  });

  return parseJsonResponse(response);
}

export async function unregisterPushToken(pushToken, token, platform = Platform.OS) {
  const response = await fetch(`${API_BASE_URL}/users/push-token/remove`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({
      pushToken,
      platform,
    }),
  });

  return parseJsonResponse(response);
}

export async function updateNearbyAlertLocation(location, token) {
  const response = await fetch(`${API_BASE_URL}/users/nearby-alert-location`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(location),
  });

  return parseJsonResponse(response);
}

export async function clearNearbyAlertLocation(token) {
  const response = await fetch(`${API_BASE_URL}/users/nearby-alert-location/remove`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({}),
  });

  return parseJsonResponse(response);
}

export async function getTrucks(token) {
  const response = await fetch(`${API_BASE_URL}/trucks`, {
    headers: buildHeaders(token),
  });

  return parseJsonResponse(response);
}

export async function getAnnouncements(token) {
  const response = await fetch(`${API_BASE_URL}/announcements`, {
    headers: buildHeaders(token),
  });

  return parseJsonResponse(response);
}

export async function getNews(token) {
  const response = await fetch(`${API_BASE_URL}/news`, {
    headers: buildHeaders(token),
  });

  return parseJsonResponse(response);
}

export async function getCollectionSchedule(token) {
  const response = await fetch(`${API_BASE_URL}/schedule`, {
    headers: buildHeaders(token),
  });

  return parseJsonResponse(response);
}

export async function submitDumpReport(report, token) {
  const response = await fetch(`${API_BASE_URL}/report`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(report),
  });

  return parseJsonResponse(response);
}
