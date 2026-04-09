import React, { useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { enableNearbyTruckAlertsAsync, getExpoPushTokenForServerAsync } from "../services/notifications";
import ChangePasswordScreen from "./ChangePasswordScreen";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { colors, feedNotificationsEnabled, isDarkMode, setFeedNotificationsEnabled, setThemeMode } = usePreferences();
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  async function handleNotificationToggle(nextValue) {
    setSavingPreferences(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      if (nextValue) {
        const access = await enableNearbyTruckAlertsAsync();

        if (!access.granted) {
          setErrorMessage("Notification permission is blocked or unavailable. Open system settings to enable it.");
          return;
        }

        const expoPushToken = await getExpoPushTokenForServerAsync({ requestPermission: false });

        if (!expoPushToken) {
          setInfoMessage("Nearby truck alerts are on. Announcement push may need full Firebase setup on this build.");
        }
      }

      await setFeedNotificationsEnabled(nextValue);
      setInfoMessage(nextValue ? "Notifications enabled for announcements and nearby trucks." : "Notifications turned off.");
    } catch (error) {
      if (!handleAuthError(error.message)) {
        setErrorMessage(error.message || "Unable to update notification preference.");
      }
    } finally {
      setSavingPreferences(false);
    }
  }

  async function handleThemeToggle(nextValue) {
    setSavingPreferences(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      await setThemeMode(nextValue ? "dark" : "light");
      setInfoMessage(nextValue ? "Dark mode enabled." : "Dark mode disabled.");
    } catch (error) {
      setErrorMessage(error.message || "Unable to update theme preference.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function openSystemSettings() {
    try {
      await Linking.openSettings();
    } catch (error) {
      setErrorMessage("Unable to open system settings on this device.");
    }
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            backgroundColor: colors.background,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? (
          <Text style={[styles.messageBanner, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}

        {!errorMessage && infoMessage ? (
          <Text style={[styles.messageBanner, { backgroundColor: colors.successSoft, color: colors.primary }]}>
            {infoMessage}
          </Text>
        ) : null}

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderSoft,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>

          <View style={[styles.preferenceRow, { borderBottomColor: colors.borderSoft }]}>
            <View style={styles.preferenceCopy}>
              <Text style={[styles.preferenceLabel, { color: colors.text }]}>Notifications</Text>
            </View>
            <Switch
              value={feedNotificationsEnabled}
              onValueChange={handleNotificationToggle}
              disabled={savingPreferences}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              trackColor={{ false: "#94a3b8", true: colors.primary }}
            />
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={[styles.preferenceLabel, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={handleThemeToggle}
              disabled={savingPreferences}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              trackColor={{ false: "#94a3b8", true: colors.primary }}
            />
          </View>

          <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={openSystemSettings}>
            <Ionicons name="settings-outline" size={16} color={colors.text} />
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Open System Settings</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderSoft,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>

          <Pressable
            style={[styles.navigationRow, { borderBottomColor: colors.borderSoft }]}
            onPress={() => setIsChangePasswordVisible(true)}
          >
            <Text style={[styles.preferenceLabel, { color: colors.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.logoutButton,
              {
                backgroundColor: colors.dangerSoft,
                borderColor: colors.danger,
              },
            ]}
            onPress={signOut}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={[styles.logoutButtonText, { color: colors.danger }]}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={isChangePasswordVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsChangePasswordVisible(false)}
      >
        <ChangePasswordScreen onClose={() => setIsChangePasswordVisible(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 36,
  },
  messageBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  preferenceCopy: {
    flex: 1,
    paddingRight: 12,
  },
  navigationRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    marginTop: 4,
    marginBottom: 14,
    paddingBottom: 14,
  },
  preferenceLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "700",
  },
  logoutButton: {
    marginTop: 4,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
