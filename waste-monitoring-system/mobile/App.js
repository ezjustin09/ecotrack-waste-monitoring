import "expo-dev-client";
import "react-native-gesture-handler";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootTabs from "./src/navigation/RootTabs";
import AuthScreen from "./src/screens/AuthScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import { AuthProvider } from "./src/context/AuthContext";
import { PreferencesProvider, usePreferences } from "./src/context/PreferencesContext";
import { registerPushToken, unregisterPushToken } from "./src/services/api";
import { getExpoPushTokenForServerAsync, sendFeedNotificationAsync } from "./src/services/notifications";
import { createTruckSocket } from "./src/services/socket";
import { buildNavigationTheme } from "./src/utils/appTheme";

const ONBOARDING_STORAGE_KEY = "ecotrack:onboarding:completed";
let asyncStorageModule = null;
const onboardingInMemoryStore = {
  value: null,
};

try {
  // Keep app stable if the current native binary does not include AsyncStorage yet.
  // eslint-disable-next-line global-require
  asyncStorageModule = require("@react-native-async-storage/async-storage").default;
} catch (error) {
  asyncStorageModule = null;
}

async function getOnboardingFlag() {
  if (asyncStorageModule?.getItem) {
    try {
      return await asyncStorageModule.getItem(ONBOARDING_STORAGE_KEY);
    } catch (error) {
      console.warn("Unable to read onboarding state:", error?.message || error);
    }
  }

  return onboardingInMemoryStore.value;
}

async function setOnboardingFlag(value) {
  if (asyncStorageModule?.setItem) {
    try {
      await asyncStorageModule.setItem(ONBOARDING_STORAGE_KEY, value);
      return;
    } catch (error) {
      console.warn("Unable to persist onboarding state:", error?.message || error);
    }
  }

  onboardingInMemoryStore.value = value;
}

function AppShell() {
  const { colors, feedNotificationsEnabled, isDarkMode, isReady: preferencesReady } = usePreferences();
  const [session, setSession] = useState(null);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const lastRegisteredPushTokenRef = useRef("");
  const currentPushTokenRef = useRef("");

  useEffect(() => {
    let mounted = true;

    async function restoreAppState() {
      try {
        const onboardingValue = await getOnboardingFlag();

        if (mounted) {
          setHasSeenOnboarding(onboardingValue === "1");
        }
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    }

    restoreAppState();

    return () => {
      mounted = false;
    };
  }, []);

  function handleAuthenticated(nextSession) {
    setSession(nextSession);
  }

  function handleSignOut() {
    lastRegisteredPushTokenRef.current = "";
    currentPushTokenRef.current = "";
    setSession(null);
  }

  async function handleCompleteOnboarding() {
    setHasSeenOnboarding(true);
    await setOnboardingFlag("1");
  }

  const authValue = useMemo(
    () => ({
      session,
      token: session?.token || "",
      user: session?.user || null,
      isAuthenticated: Boolean(session?.token),
      setSession: handleAuthenticated,
      signOut: handleSignOut,
    }),
    [session]
  );

  useEffect(() => {
    if (!authValue.isAuthenticated || !authValue.token) {
      return;
    }

    let active = true;

    async function syncAnnouncementPushToken() {
      try {
        if (!feedNotificationsEnabled) {
          const currentPushToken =
            currentPushTokenRef.current || (await getExpoPushTokenForServerAsync({ requestPermission: false }));

          if (!active || !currentPushToken) {
            lastRegisteredPushTokenRef.current = "";
            return;
          }

          await unregisterPushToken(currentPushToken, authValue.token).catch(() => {});
          currentPushTokenRef.current = "";
          lastRegisteredPushTokenRef.current = "";
          return;
        }

        const expoPushToken = await getExpoPushTokenForServerAsync();

        if (!active || !expoPushToken) {
          return;
        }

        currentPushTokenRef.current = expoPushToken;
        const tokenKey = `${authValue.user?.id || ""}:${expoPushToken}`;

        if (lastRegisteredPushTokenRef.current === tokenKey) {
          return;
        }

        await registerPushToken(expoPushToken, authValue.token);
        lastRegisteredPushTokenRef.current = tokenKey;
      } catch (error) {
        console.log("Unable to register push token:", error?.message || error);
      }
    }

    syncAnnouncementPushToken();

    return () => {
      active = false;
    };
  }, [authValue.isAuthenticated, authValue.token, authValue.user?.id, feedNotificationsEnabled]);

  useEffect(() => {
    if (!__DEV__ || !authValue.isAuthenticated || !feedNotificationsEnabled) {
      return;
    }

    const socket = createTruckSocket();

    socket.on("announcement:created", (announcement) => {
      sendFeedNotificationAsync("announcement", announcement).catch(() => {});
    });

    socket.on("news:created", (news) => {
      sendFeedNotificationAsync("news", news).catch(() => {});
    });

    return () => {
      socket.disconnect();
    };
  }, [authValue.isAuthenticated, feedNotificationsEnabled]);

  const navigationTheme = useMemo(() => buildNavigationTheme(isDarkMode), [isDarkMode]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <AuthProvider value={authValue}>
            <StatusBar style={isDarkMode ? "light" : "dark"} />
            {isBootstrapping || !preferencesReady ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color="#0f766e" />
              </View>
            ) : !hasSeenOnboarding ? (
              <OnboardingScreen onComplete={handleCompleteOnboarding} />
            ) : authValue.isAuthenticated ? (
              <RootTabs onSignOut={handleSignOut} user={authValue.user} />
            ) : (
              <AuthScreen onAuthenticated={handleAuthenticated} />
            )}
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AppShell />
    </PreferencesProvider>
  );
}
