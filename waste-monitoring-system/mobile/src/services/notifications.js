import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

export const ALERT_RADIUS_METERS = 500;
export const ALERT_REARM_METERS = 650;
const NEARBY_TRUCK_CHANNEL_ID = "nearby-trucks";
const ALERT_VIBRATION_PATTERN = [0, 250, 150, 250];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

function buildPermissionResult(result) {
  const status = result?.status || "undetermined";
  const granted = Boolean(result?.granted) || status === "granted";

  return {
    granted,
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
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: ALERT_VIBRATION_PATTERN,
    enableVibrate: true,
    lightColor: "#0f766e",
    sound: "default",
  });
}

function getImmediateTrigger() {
  if (Platform.OS === "android") {
    return {
      channelId: NEARBY_TRUCK_CHANNEL_ID,
    };
  }

  return null;
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

  if (existingPermissions.granted || existingPermissions.status === "granted") {
    return buildPermissionResult(existingPermissions);
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return buildPermissionResult(requestedPermissions);
}

export async function getExpoPushTokenForServerAsync(options = {}) {
  if (Platform.OS === "web") {
    return "";
  }

  try {
    const shouldRequestPermission = options.requestPermission !== false;
    await ensureNotificationChannelAsync();

    let permission = await Notifications.getPermissionsAsync();
    let granted = permission.granted || permission.status === "granted";

    if (!granted && shouldRequestPermission) {
      permission = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });
      granted = permission.granted || permission.status === "granted";
    }

    if (!granted) {
      return "";
    }

    const projectId = String(
      Constants?.easConfig?.projectId || Constants?.expoConfig?.extra?.eas?.projectId || ""
    ).trim();
    const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return String(tokenResult?.data || "").trim();
  } catch (error) {
    const message = String(error?.message || error || "").trim();

    if (message.includes("Default FirebaseApp is not initialized")) {
      console.log(
        "Unable to obtain Expo push token: missing Firebase Android config. Add mobile/google-services.json and rebuild the dev client."
      );
      return "";
    }

    console.log("Unable to obtain Expo push token:", message || error);
    return "";
  }
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

  await ensureNotificationChannelAsync();

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
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      color: "#0f766e",
      vibrate: ALERT_VIBRATION_PATTERN,
    },
    trigger: getImmediateTrigger(),
  });
}

export async function sendFeedNotificationAsync(kind, item) {
  if (Platform.OS === "web") {
    return null;
  }

  await ensureNotificationChannelAsync();

  const notificationKind = String(kind || "").trim().toLowerCase() === "news" ? "news" : "announcement";
  const title = notificationKind === "news" ? "News Update" : "New Announcement";
  const body = String(item?.title || "").trim() || "A new post is available.";

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        type: notificationKind,
        feedId: String(item?.id || "").trim(),
      },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
      color: "#0f766e",
    },
    trigger: getImmediateTrigger(),
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


