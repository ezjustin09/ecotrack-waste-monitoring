import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { changePassword } from "../services/api";

function buildInputBorderColor(colors, isDarkMode) {
  return isDarkMode ? colors.border : "#cbd5e1";
}

export default function ChangePasswordScreen({ onClose }) {
  const insets = useSafeAreaInsets();
  const { token, user, setSession, signOut } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const isGoogleUser = String(user?.authProvider || "").trim().toLowerCase() === "google";
  const inputBorderColor = useMemo(() => buildInputBorderColor(colors, isDarkMode), [colors, isDarkMode]);

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  function updateFormValue(key, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleChangePassword() {
    setSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      if (!isGoogleUser && !form.currentPassword.trim()) {
        setErrorMessage("Current password is required.");
        return;
      }

      if (!form.newPassword.trim() || !form.confirmPassword.trim()) {
        setErrorMessage("Please complete the new password fields.");
        return;
      }

      if (form.newPassword.trim().length < 6) {
        setErrorMessage("New password must be at least 6 characters long.");
        return;
      }

      if (form.newPassword !== form.confirmPassword) {
        setErrorMessage("New password and confirmation do not match.");
        return;
      }

      const response = await changePassword(
        {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        },
        token
      );

      setSession({
        token: response.token,
        user: response.user,
      });
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setInfoMessage(response.message || "Password updated successfully.");
    } catch (error) {
      if (!handleAuthError(error.message)) {
        setErrorMessage(error.message || "Unable to change password.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.borderSoft,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>{isGoogleUser ? "Set Password" : "Change Password"}</Text>
        <Pressable
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: colors.overlay }]}
          accessibilityRole="button"
          accessibilityLabel="Close change password"
        >
          <Ionicons name="close-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderSoft,
            },
          ]}
        >
          {!isGoogleUser ? (
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Current Password</Text>
              <View style={[styles.passwordField, { borderColor: inputBorderColor, backgroundColor: colors.cardMuted }]}>
                <TextInput
                  value={form.currentPassword}
                  onChangeText={(value) => updateFormValue("currentPassword", value)}
                  placeholder="Enter your current password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showCurrentPassword}
                  style={[styles.passwordInput, { color: colors.text }]}
                />
                <Pressable onPress={() => setShowCurrentPassword((value) => !value)} style={styles.passwordToggle}>
                  <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.inputWrap}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>New Password</Text>
            <View style={[styles.passwordField, { borderColor: inputBorderColor, backgroundColor: colors.cardMuted }]}>
              <TextInput
                value={form.newPassword}
                onChangeText={(value) => updateFormValue("newPassword", value)}
                placeholder="Enter your new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showNewPassword}
                style={[styles.passwordInput, { color: colors.text }]}
              />
              <Pressable onPress={() => setShowNewPassword((value) => !value)} style={styles.passwordToggle}>
                <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.inputWrap}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Confirm New Password</Text>
            <View style={[styles.passwordField, { borderColor: inputBorderColor, backgroundColor: colors.cardMuted }]}>
              <TextInput
                value={form.confirmPassword}
                onChangeText={(value) => updateFormValue("confirmPassword", value)}
                placeholder="Re-enter your new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showConfirmPassword}
                style={[styles.passwordInput, { color: colors.text }]}
              />
              <Pressable onPress={() => setShowConfirmPassword((value) => !value)} style={styles.passwordToggle}>
                <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.primary,
                opacity: submitting ? 0.75 : 1,
              },
            ]}
            onPress={handleChangePassword}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>{isGoogleUser ? "Set Password" : "Change Password"}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  closeButton: {
    marginRight: 16,
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
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
  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
  },
  inputWrap: {
    marginBottom: 12,
  },
  inputLabel: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "700",
  },
  passwordField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 56,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
