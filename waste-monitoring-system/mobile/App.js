import "expo-dev-client";
import "react-native-gesture-handler";
import React, { useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import RootTabs from "./src/navigation/RootTabs";
import AuthScreen from "./src/screens/AuthScreen";
import { AuthProvider } from "./src/context/AuthContext";

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#f3f7f6",
    card: "#ffffff",
    primary: "#0f766e",
    text: "#0f172a",
    border: "#d1d5db",
  },
};

export default function App() {
  const [session, setSession] = useState(null);

  function handleAuthenticated(nextSession) {
    setSession(nextSession);
  }

  function handleSignOut() {
    setSession(null);
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={theme}>
        <AuthProvider value={authValue}>
          <StatusBar style="dark" />
          {authValue.isAuthenticated ? (
            <RootTabs onSignOut={handleSignOut} user={authValue.user} />
          ) : (
            <AuthScreen onAuthenticated={handleAuthenticated} />
          )}
        </AuthProvider>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}