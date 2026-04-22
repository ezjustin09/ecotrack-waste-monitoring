const fs = require("fs");
const path = require("path");

const baseConfig = {
  name: "EcoTrack: Waste Collection Monitoring for Pateros",
  slug: "ecotrack-waste-collection-monitoring",
  scheme: [
    "wastemonitoring",
    "com.googleusercontent.apps.457539763720-hqdpqbb4nigrn3mo7nib75h9akfb13hi",
    "com.googleusercontent.apps.457539763720-nhc77i2p6cc2gqb0kt0jgu70bpdid2kp",
  ],
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash-logo.png",
    resizeMode: "contain",
    backgroundColor: "#f3f7f6",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.ecotrack.wastemonitoring",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.ecotrack.wastemonitoring",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0e6b2d",
    },
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
    ],
  },
  plugins: [
    "expo-font",
    "expo-web-browser",
    [
      "expo-dev-client",
      {
        launchMode: "most-recent",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow EcoTrack: Waste Collection Monitoring for Pateros to access your location for reporting illegal dumping.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow EcoTrack: Waste Collection Monitoring for Pateros to access your photos so you can attach issue evidence.",
        cameraPermission:
          "Allow EcoTrack: Waste Collection Monitoring for Pateros to access your camera so you can capture issue evidence.",
      },
    ],
    [
      "expo-notifications",
      {
        color: "#0f766e",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "729cd156-38c3-451c-9439-add184af5ac4",
    },
  },
};

function firstNonEmptyEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = firstNonEmptyEnv(
    "GOOGLE_MAPS_ANDROID_API_KEY",
    "EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY"
  );
  const iosGoogleMapsApiKey = firstNonEmptyEnv(
    "GOOGLE_MAPS_IOS_API_KEY",
    "EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY"
  );

  if (process.env.NODE_ENV === "production") {
    if (!androidGoogleMapsApiKey || !iosGoogleMapsApiKey) {
      throw new Error(
        "Missing Google Maps API keys. Set GOOGLE_MAPS_ANDROID_API_KEY and GOOGLE_MAPS_IOS_API_KEY before production builds."
      );
    }
  }

  const androidGoogleServicesFileFromEnv = firstNonEmptyEnv(
    "GOOGLE_SERVICES_JSON_PATH",
    "EXPO_PUBLIC_GOOGLE_SERVICES_JSON_PATH"
  );
  const iosGoogleServiceInfoFileFromEnv = firstNonEmptyEnv(
    "GOOGLE_SERVICE_INFO_PLIST_PATH",
    "EXPO_PUBLIC_GOOGLE_SERVICE_INFO_PLIST_PATH"
  );

  const defaultAndroidGoogleServicesFile = "./google-services.json";
  const defaultIosGoogleServiceInfoFile = "./GoogleService-Info.plist";

  const resolvedAndroidGoogleServicesFile = androidGoogleServicesFileFromEnv || defaultAndroidGoogleServicesFile;
  const resolvedIosGoogleServiceInfoFile = iosGoogleServiceInfoFileFromEnv || defaultIosGoogleServiceInfoFile;

  const hasAndroidGoogleServicesFile = fs.existsSync(path.resolve(__dirname, resolvedAndroidGoogleServicesFile));
  const hasIosGoogleServiceInfoFile = fs.existsSync(path.resolve(__dirname, resolvedIosGoogleServiceInfoFile));

  return {
    ...baseConfig,
    ios: {
      ...(baseConfig.ios || {}),
      ...(hasIosGoogleServiceInfoFile ? { googleServicesFile: resolvedIosGoogleServiceInfoFile } : {}),
      config: {
        ...((baseConfig.ios && baseConfig.ios.config) || {}),
        ...(iosGoogleMapsApiKey ? { googleMapsApiKey: iosGoogleMapsApiKey } : {}),
      },
    },
    android: {
      ...(baseConfig.android || {}),
      ...(hasAndroidGoogleServicesFile ? { googleServicesFile: resolvedAndroidGoogleServicesFile } : {}),
      config: {
        ...((baseConfig.android && baseConfig.android.config) || {}),
        googleMaps: {
          ...((baseConfig.android && baseConfig.android.config && baseConfig.android.config.googleMaps) || {}),
          ...(androidGoogleMapsApiKey ? { apiKey: androidGoogleMapsApiKey } : {}),
        },
      },
    },
    extra: {
      ...(baseConfig.extra || {}),
      mapKeySource: "env",
    },
  };
};
