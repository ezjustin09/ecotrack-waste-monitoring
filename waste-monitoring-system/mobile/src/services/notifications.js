import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const ALERT_RADIUS_METERS = 500;
export const ALERT_REARM_METERS = 650;
const NEARBY_TRUCK_CHANNEL_ID = "nearby-trucks";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function buildPermissionResult(result) {
  const status = result?.status || "undetermined";

  return {
    granted: status === "granted",
    canAskAgain: Boolean(result?.canAskAgain),
    status,
  };
}

async function ensureNotificationChannelAsync() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(NEARBY_TRUCK_CHANNEL_ID, {
    name: "Nearby truck alerts",
    description: "Alerts when a garbage truck is close to your current location.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#0f766e",
  });
}

export async function getNearbyTruckAlertsStatusAsync() {
  if (Platform.OS === "web") {
    return {
      granted: false,
      canAskAgain: false,
      status: "unsupported",
    };
  }

  await ensureNotificationChannelAsync();
  const result = await Notifications.getPermissionsAsync();
  return buildPermissionResult(result);
}

export async function enableNearbyTruckAlertsAsync() {
  if (Platform.OS === "web") {
    return {
      granted: false,
      canAskAgain: false,
      status: "unsupported",
    };
  }

  await ensureNotificationChannelAsync();
  const existingPermissions = await Notifications.getPermissionsAsync();

  if (existingPermissions.status === "granted") {
    return buildPermissionResult(existingPermissions);
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return buildPermissionResult(requestedPermissions);
}

export async function clearNearbyTruckNotificationsAsync() {
  if (Platform.OS === "web") {
    return;
  }

  await Notifications.dismissAllNotificationsAsync();
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function sendNearbyTruckNotificationAsync(truck, distanceMeters) {
  if (Platform.OS === "web") {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: truck.truckId + " is nearby",
      body:
        "A " +
        String(truck.status || "active").toLowerCase() +
        " garbage truck is about " +
        formatDistanceMeters(distanceMeters) +
        " from your location.",
      data: {
        truckId: truck.truckId,
        status: truck.status,
        distanceMeters: Math.round(distanceMeters),
      },
      sound: false,
    },
    trigger: null,
  });
}

export function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "unknown distance";
  }

  if (distanceMeters < 1000) {
    return Math.max(1, Math.round(distanceMeters)) + " m";
  }

  const decimals = distanceMeters < 10000 ? 1 : 0;
  return (distanceMeters / 1000).toFixed(decimals) + " km";
}

export function getDistanceMeters(origin, target) {
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
