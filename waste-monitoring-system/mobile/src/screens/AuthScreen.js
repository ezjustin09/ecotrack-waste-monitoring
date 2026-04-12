import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Platform,
  View,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { API_BASE_URL, loginUser, loginWithGoogle, requestPasswordReset, resetPassword, signUpUser } from "../services/api";

WebBrowser.maybeCompleteAuthSession();

const googleLogoIcon = require("../../assets/search.png");

function buildGoogleNativeRedirectUri(clientId) {
  const trimmedClientId = String(clientId || "").trim();

  if (!trimmedClientId) {
    return undefined;
  }

  const clientIdWithoutDomain = trimmedClientId.replace(/\.apps\.googleusercontent\.com$/i, "");

  if (!clientIdWithoutDomain) {
    return undefined;
  }

  return `com.googleusercontent.apps.${clientIdWithoutDomain}:/oauthredirect`;
}

function normalizeGoogleClientId(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (text.includes("your-")) {
    return "";
  }

  if (!text.toLowerCase().endsWith(".apps.googleusercontent.com")) {
    return "";
  }

  return text;
}
function extractGoogleClientIdFromScheme(value) {
  const text = String(value || "").trim();
  const match = text.match(/^com\.googleusercontent\.apps\.(.+)$/i);

  if (!match?.[1]) {
    return "";
  }

  return `${match[1]}.apps.googleusercontent.com`;
}

function inferNativeGoogleClientIdsFromExpoConfig() {
  const schemeConfig = Constants.expoConfig?.scheme;
  const schemes = Array.isArray(schemeConfig) ? schemeConfig : schemeConfig ? [schemeConfig] : [];
  const nativeClientIds = schemes.map(extractGoogleClientIdFromScheme).filter(Boolean);

  return {
    androidClientId: nativeClientIds[0] || "",
    iosClientId: nativeClientIds[1] || nativeClientIds[0] || "",
  };
}

const initialForms = {
  login: {
    email: "",
    password: "",
  },
  signup: {
    name: "",
    email: "",
    password: "",
  },
  forgot: {
    email: "",
    code: "",
    newPassword: "",
  },
};

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [forms, setForms] = useState(initialForms);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotCodeRequested, setForgotCodeRequested] = useState(false);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(28)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateX = useRef(new Animated.Value(18)).current;
  const orbScale = useRef(new Animated.Value(1)).current;

  const inferredNativeGoogleClientIds = useMemo(() => inferNativeGoogleClientIdsFromExpoConfig(), []);

  const googleClientConfig = useMemo(
    () => ({
      expoClientId:
        Constants.appOwnership === "expo"
          ? normalizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID) || undefined
          : undefined,
      androidClientId:
        normalizeGoogleClientId(inferredNativeGoogleClientIds.androidClientId) ||
        normalizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) ||
        undefined,
      iosClientId:
        normalizeGoogleClientId(inferredNativeGoogleClientIds.iosClientId) ||
        normalizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ||
        undefined,
      webClientId: normalizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) || undefined,
    }),
    [inferredNativeGoogleClientIds.androidClientId, inferredNativeGoogleClientIds.iosClientId]
  );

  const platformGoogleClientId = useMemo(() => {
    if (Platform.OS === "android") {
      return String(googleClientConfig.androidClientId || "").trim();
    }

    if (Platform.OS === "ios") {
      return String(googleClientConfig.iosClientId || "").trim();
    }

    return String(googleClientConfig.webClientId || "").trim();
  }, [googleClientConfig.androidClientId, googleClientConfig.iosClientId, googleClientConfig.webClientId]);

  const hasGoogleClientConfig = platformGoogleClientId.length > 0;

  const googleRedirectUri = useMemo(() => {
    if (Platform.OS === "android") {
      return buildGoogleNativeRedirectUri(googleClientConfig.androidClientId);
    }

    if (Platform.OS === "ios") {
      return buildGoogleNativeRedirectUri(googleClientConfig.iosClientId);
    }

    return undefined;
  }, [googleClientConfig.androidClientId, googleClientConfig.iosClientId]);

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useAuthRequest({
    ...googleClientConfig,
    redirectUri: googleRedirectUri,
    scopes: ["openid", "profile", "email"],
    selectAccount: true,
  });

  const isLoginMode = mode === "login";
  const isSignupMode = mode === "signup";
  const isForgotMode = mode === "forgot";
  const activeForm = forms[mode];
  const isBusy = submitting || googleSubmitting;
  const isNetworkError = errorMessage === "Network request failed";
  const shouldShowForgotResetFields =
    isForgotMode &&
    (forgotCodeRequested ||
      Boolean(String(forms.forgot.code || "").trim()) ||
      Boolean(String(forms.forgot.newPassword || "").trim()));
  const secondaryOrbScale = orbScale.interpolate({
    inputRange: [1, 1.08],
    outputRange: [1.08, 0.96],
  });

  const title = useMemo(() => {
    if (isForgotMode) {
      return "Reset Password";
    }

    return isLoginMode ? "Welcome" : "Create Account";
  }, [isForgotMode, isLoginMode]);

  const subtitle = useMemo(() => {
    if (isForgotMode) {
      return "Request a reset code using your email, then set a new password.";
    }

    if (isLoginMode) {
      return "";
    }

    return "";
  }, [isForgotMode, isLoginMode]);

  const submitLabel = useMemo(() => {
    if (isForgotMode) {
      return shouldShowForgotResetFields ? "Reset Password" : "Send Reset Code";
    }

    return isLoginMode ? "Log In" : "Create Account";
  }, [isForgotMode, isLoginMode, shouldShowForgotResetFields]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(heroTranslateY, {
        toValue: 0,
        damping: 18,
        stiffness: 140,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();

    const orbAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, {
          toValue: 1.08,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(orbScale, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    orbAnimation.start();
    return () => orbAnimation.stop();
  }, [heroOpacity, heroTranslateY, orbScale]);

  useEffect(() => {
    formOpacity.setValue(0);
    formTranslateX.setValue(18);

    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formTranslateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [formOpacity, formTranslateX, mode]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setShowPassword(false);
    setErrorMessage("");
    setInfoMessage("");

    if (nextMode !== "forgot") {
      setForgotCodeRequested(false);
    } else {
      setForgotCodeRequested(
        Boolean(String(forms.forgot.code || "").trim()) || Boolean(String(forms.forgot.newPassword || "").trim())
      );
    }
  }

  function updateForm(formKey, field, value) {
    setForms((current) => ({
      ...current,
      [formKey]: {
        ...current[formKey],
        [field]: value,
      },
    }));
  }

  useEffect(() => {
    if (!googleResponse) {
      return;
    }

    if (googleResponse.type === "error") {
      setErrorMessage(googleResponse.error?.message || "Google sign-in failed.");
      setInfoMessage("");
      return;
    }

    if (googleResponse.type !== "success") {
      return;
    }

    const idToken = String(
      googleResponse?.authentication?.idToken ||
        googleResponse?.params?.id_token ||
        googleResponse?.params?.idToken ||
        ""
    ).trim();

    if (!idToken) {
      setErrorMessage("Google sign-in did not return an ID token. Please check your Google OAuth client IDs.");
      return;
    }

    let isMounted = true;

    const completeGoogleLogin = async () => {
      setGoogleSubmitting(true);
      setErrorMessage("");
      setInfoMessage("");

      try {
        const response = await loginWithGoogle({ idToken });

        if (!isMounted) {
          return;
        }

        onAuthenticated({ token: response.token, user: response.user });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error.message || "Google sign-in failed.");
      } finally {
        if (isMounted) {
          setGoogleSubmitting(false);
        }
      }
    };

    completeGoogleLogin();

    return () => {
      isMounted = false;
    };
  }, [googleResponse, onAuthenticated]);

  async function handleGoogleLogin() {
    if (!hasGoogleClientConfig) {
      setErrorMessage(
        "Google login is not configured. Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID."
      );
      setInfoMessage("");
      return;
    }

    if (!googleRequest) {
      setErrorMessage("Google sign-in is still preparing. Please try again in a moment.");
      setInfoMessage("");
      return;
    }

    setErrorMessage("");
    setInfoMessage("");

    try {
      const result = await promptGoogleSignIn();

      if (result?.type === "cancel" || result?.type === "dismiss") {
        setInfoMessage("");
      }
    } catch (error) {
      setErrorMessage(error.message || "Unable to start Google sign-in.");
    }
  }

  async function handleRequestResetCode() {
    const email = String(forms.forgot.email || "").trim();

    if (!email) {
      setErrorMessage("Please enter your email first.");
      setInfoMessage("");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      const response = await requestPasswordReset(email);
      const responseCode = String(response?.resetCode || "");
      setForgotCodeRequested(true);

      if (responseCode) {
        updateForm("forgot", "code", responseCode);
        setInfoMessage(`Reset code generated. Demo code: ${responseCode}`);
      } else {
        setInfoMessage(response?.message || "If your email exists, a reset code was generated.");
      }
    } catch (error) {
      setErrorMessage(error.message || "Unable to request reset code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      if (isLoginMode) {
        const response = await loginUser({
          email: String(forms.login.email || "").trim(),
          password: String(forms.login.password || ""),
        });

        onAuthenticated({ token: response.token, user: response.user });
        return;
      }

      if (isSignupMode) {
        const response = await signUpUser({
          name: String(forms.signup.name || "").trim(),
          email: String(forms.signup.email || "").trim(),
          password: String(forms.signup.password || ""),
          role: "citizen",
        });

        onAuthenticated({ token: response.token, user: response.user });
        return;
      }

      if (!shouldShowForgotResetFields) {
        await handleRequestResetCode();
        return;
      }

      await resetPassword({
        email: String(forms.forgot.email || "").trim(),
        code: String(forms.forgot.code || "").trim(),
        newPassword: String(forms.forgot.newPassword || ""),
      });

      setInfoMessage("Password reset complete. Please log in with your new password.");
      setForms((current) => ({
        ...current,
        login: {
          ...current.login,
          email: String(current.forgot.email || ""),
          password: "",
        },
        forgot: {
          ...current.forgot,
          code: "",
          newPassword: "",
        },
      }));
      setForgotCodeRequested(false);
      setShowPassword(false);
      setMode("login");
    } catch (error) {
      setErrorMessage(error.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Animated.View style={[styles.orb, styles.orbPrimary, { transform: [{ scale: orbScale }] }]} />
        <Animated.View style={[styles.orb, styles.orbSecondary, { transform: [{ scale: secondaryOrbScale }] }]} />
      </View>

      <Animated.View
        style={[
          styles.heroCard,
          {
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }],
          },
        ]}
      >
        <Text style={styles.kicker}>EcoTrack: Waste Monitoring System for Pateros</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        <Animated.View
          style={{
            opacity: formOpacity,
            transform: [{ translateX: formTranslateX }],
          }}
        >
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleButton, isLoginMode && styles.toggleButtonActive]}
              onPress={() => switchMode("login")}
            >
              <Text style={[styles.toggleText, isLoginMode && styles.toggleTextActive]}>Log In</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, isSignupMode && styles.toggleButtonActive]}
              onPress={() => switchMode("signup")}
            >
              <Text style={[styles.toggleText, isSignupMode && styles.toggleTextActive]}>Sign Up</Text>
            </Pressable>
          </View>

          {isSignupMode ? (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Juan Dela Cruz"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                value={forms.signup.name}
                onChangeText={(value) => updateForm("signup", "name", value)}
              />
            </>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={activeForm.email}
            onChangeText={(value) => updateForm(mode, "email", value)}
          />

          {isForgotMode ? (
            <>
              {shouldShowForgotResetFields ? (
                <>
                  <Text style={styles.label}>Reset Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    value={forms.forgot.code}
                    onChangeText={(value) => updateForm("forgot", "code", value)}
                  />

                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.passwordField}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter your new password"
                      placeholderTextColor="#94a3b8"
                      secureTextEntry={!showPassword}
                      value={forms.forgot.newPassword}
                      onChangeText={(value) => updateForm("forgot", "newPassword", value)}
                    />
                    <Pressable
                      style={styles.passwordIconButton}
                      onPress={() => setShowPassword((current) => !current)}
                      hitSlop={8}
                    >
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748b" />
                    </Pressable>
                  </View>

                  <Pressable style={styles.secondaryButton} onPress={handleRequestResetCode} disabled={isBusy}>
                    <Text style={styles.secondaryButtonText}>Send Reset Code Again</Text>
                  </Pressable>
                </>
              ) : null}

              <Pressable style={styles.forgotLinkButton} onPress={() => switchMode("login")}>
                <Text style={styles.forgotLinkText}>Back to login</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordField}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={isLoginMode ? forms.login.password : forms.signup.password}
                  onChangeText={(value) => updateForm(isLoginMode ? "login" : "signup", "password", value)}
                />
                <Pressable
                  style={styles.passwordIconButton}
                  onPress={() => setShowPassword((current) => !current)}
                  hitSlop={8}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748b" />
                </Pressable>
              </View>

              {isLoginMode ? (
                <Pressable style={styles.forgotLinkButton} onPress={() => switchMode("forgot")}>
                  <Text style={styles.forgotLinkText}>Forgot password?</Text>
                </Pressable>
              ) : null}
            </>
          )}

          {isLoginMode || isSignupMode ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={[
                  styles.googleButton,
                  isBusy && styles.googleButtonDisabled,
                ]}
                onPress={handleGoogleLogin}
                disabled={isBusy}
              >
                {googleSubmitting ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <View style={styles.googleButtonContent}>
                    <Image source={googleLogoIcon} style={styles.googleButtonIcon} resizeMode="contain" fadeDuration={0} />
                    <Text style={styles.googleButtonText}>{isSignupMode ? "Sign Up with Google" : "Continue with Google"}</Text>
                  </View>
                )}
              </Pressable>
            </>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
          {isNetworkError ? (
            <Text style={styles.hintText}>
              Backend not reachable at {API_BASE_URL}. Start the backend with `npm run waste:start:backend`, or use `npm run waste:start:all` to launch both backend and mobile together. If you are on a real phone, keep the phone and computer on the same Wi-Fi.
            </Text>
          ) : null}

          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={isBusy}>
            {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{submitLabel}</Text>}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    position: "relative",
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f3f7f6",
    overflow: "hidden",
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbPrimary: {
    width: 220,
    height: 220,
    top: 36,
    right: -70,
    backgroundColor: "rgba(15, 118, 110, 0.08)",
  },
  orbSecondary: {
    width: 180,
    height: 180,
    bottom: 44,
    left: -50,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 28,
    padding: 22,
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 20,
    color: "#475569",
    marginTop: 10,
    marginBottom: 18,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#ffffff",
  },
  toggleText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#64748b",
  },
  toggleTextActive: {
    color: "#0f172a",
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: "#c3cedc",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 16,
  },
  passwordField: {
    position: "relative",
    marginBottom: 16,
  },
  passwordInput: {
    borderWidth: 2,
    borderColor: "#c3cedc",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 46,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  passwordIconButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  forgotLinkButton: {
    alignSelf: "flex-start",
    marginBottom: 12,
    paddingVertical: 3,
  },
  forgotLinkText: {
    color: "#0369a1",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#0f766e",
    backgroundColor: "#ecfeff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: "#0f766e",
    fontSize: 18,
    fontWeight: "800",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#cbd5e1",
  },
  dividerText: {
    marginHorizontal: 10,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  googleButton: {
    minHeight: 64,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#c3cedc",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  googleButtonIcon: {
    width: 28,
    height: 28,
  },
  googleButtonText: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    marginBottom: 8,
  },
  infoText: {
    color: "#0f766e",
    fontSize: 13,
    marginBottom: 8,
  },
  hintText: {
    color: "#7c2d12",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
});
