const appJson = require("./app.json");
const fs = require("fs");
const path = require("path");

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
  const baseConfig = appJson.expo;
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
