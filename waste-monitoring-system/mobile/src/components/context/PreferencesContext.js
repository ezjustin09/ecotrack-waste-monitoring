import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getAppColors } from "../../utils/appTheme";

const PreferencesContext = createContext(null);

const THEME_MODE_STORAGE_KEY = "ecotrack:preferences:themeMode";
const FEED_NOTIFICATIONS_STORAGE_KEY = "ecotrack:preferences:feedNotificationsEnabled";

let asyncStorageModule = null;
const inMemoryStore = new Map();

try {
  // Keep the app stable on older dev builds that may not include AsyncStorage yet.
  // eslint-disable-next-line global-require
  asyncStorageModule = require("@react-native-async-storage/async-storage").default;
} catch (error) {
  asyncStorageModule = null;
}

async function getPersistedValue(key) {
  if (asyncStorageModule?.getItem) {
    try {
      return await asyncStorageModule.getItem(key);
    } catch (error) {
      console.warn("Unable to read preference:", error?.message || error);
    }
  }

  return inMemoryStore.has(key) ? inMemoryStore.get(key) : null;
}

async function setPersistedValue(key, value) {
  if (asyncStorageModule?.setItem) {
    try {
      await asyncStorageModule.setItem(key, value);
      return;
    } catch (error) {
      console.warn("Unable to persist preference:", error?.message || error);
    }
  }

  inMemoryStore.set(key, value);
}

export function PreferencesProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [themeMode, setThemeModeState] = useState("light");
  const [feedNotificationsEnabled, setFeedNotificationsEnabledState] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restorePreferences() {
      try {
        const [storedThemeMode, storedFeedNotificationsEnabled] = await Promise.all([
          getPersistedValue(THEME_MODE_STORAGE_KEY),
          getPersistedValue(FEED_NOTIFICATIONS_STORAGE_KEY),
        ]);

        if (!mounted) {
          return;
        }

        setThemeModeState(storedThemeMode === "dark" ? "dark" : "light");
        setFeedNotificationsEnabledState(storedFeedNotificationsEnabled !== "0");
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    restorePreferences();

    return () => {
      mounted = false;
    };
  }, []);

  async function setThemeMode(nextThemeMode) {
    const normalizedThemeMode = nextThemeMode === "dark" ? "dark" : "light";
    setThemeModeState(normalizedThemeMode);
    await setPersistedValue(THEME_MODE_STORAGE_KEY, normalizedThemeMode);
  }

  async function setFeedNotificationsEnabled(nextValue) {
    const normalizedValue = Boolean(nextValue);
    setFeedNotificationsEnabledState(normalizedValue);
    await setPersistedValue(FEED_NOTIFICATIONS_STORAGE_KEY, normalizedValue ? "1" : "0");
  }

  const value = useMemo(
    () => ({
      isReady,
      themeMode,
      isDarkMode: themeMode === "dark",
      colors: getAppColors(themeMode === "dark"),
      feedNotificationsEnabled,
      setThemeMode,
      setFeedNotificationsEnabled,
    }),
    [feedNotificationsEnabled, isReady, themeMode]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);

  if (!context) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }

  return context;
}
