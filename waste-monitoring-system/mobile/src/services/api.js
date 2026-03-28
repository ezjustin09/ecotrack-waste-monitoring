import { NativeModules, Platform } from "react-native";

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

function resolveApiHost() {
  if (process.env.EXPO_PUBLIC_API_HOST) {
    return process.env.EXPO_PUBLIC_API_HOST;
  }

  const inferredHost = inferHostFromBundle();
  if (inferredHost && inferredHost !== "localhost") {
    return inferredHost;
  }

  if (Platform.OS === "android") {
    return "10.0.2.2";
  }

  if (Platform.OS === "ios") {
    return "127.0.0.1";
  }

  return "localhost";
}

export const API_HOST = resolveApiHost();
export const API_BASE_URL = `http://${API_HOST}:4000`;

async function parseJsonResponse(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
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

export const loginCitizen = loginUser;
export const signUpCitizen = signUpUser;

export async function getTrucks(token) {
  const response = await fetch(`${API_BASE_URL}/trucks`, {
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