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
  View,
} from "react-native";
import { API_BASE_URL, loginUser, signUpUser } from "../services/api";

const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);

const initialForms = {
  citizenLogin: {
    email: "",
    password: "",
  },
  citizenSignup: {
    name: "",
    email: "",
    password: "",
  },
  driverLogin: {
    email: "",
    password: "",
  },
  driverSignup: {
    name: "",
    email: "",
    password: "",
    truckId: "",
  },
};

export default function AuthScreen({ onAuthenticated }) {
  const [portal, setPortal] = useState("citizen");
  const [mode, setMode] = useState("login");
  const [forms, setForms] = useState(initialForms);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(28)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateX = useRef(new Animated.Value(18)).current;
  const orbScale = useRef(new Animated.Value(1)).current;

  const isLoginMode = mode === "login";
  const isDriverPortal = portal === "driver";
  const activeFormKey = `${portal}${isLoginMode ? "Login" : "Signup"}`;
  const activeForm = forms[activeFormKey];
  const isNetworkError = errorMessage === "Network request failed";
  const secondaryOrbScale = orbScale.interpolate({
    inputRange: [1, 1.08],
    outputRange: [1.08, 0.96],
  });

  const title = useMemo(() => {
    if (isDriverPortal) {
      return isLoginMode ? "Driver Dispatch Login" : "Register Driver Account";
    }

    return isLoginMode ? "Citizen Access" : "Create Citizen Account";
  }, [isDriverPortal, isLoginMode]);

  const subtitle = useMemo(() => {
    if (isDriverPortal) {
      return "Sign in as a garbage truck driver to stream your phone GPS as a live truck tracker.";
    }

    return "Sign in as a citizen to view live garbage trucks and submit illegal dumping reports.";
  }, [isDriverPortal]);

  const submitLabel = useMemo(() => {
    if (isDriverPortal) {
      return isLoginMode ? "Log In as Driver" : "Create Driver Account";
    }

    return isLoginMode ? "Log In as Citizen" : "Create Citizen Account";
  }, [isDriverPortal, isLoginMode]);

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
  }, [formOpacity, formTranslateX, mode, portal]);

  function switchPortal(nextPortal) {
    setPortal(nextPortal);
    setErrorMessage("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setErrorMessage("");
  }

  function updateActiveForm(field, value) {
    setForms((currentForms) => ({
      ...currentForms,
      [activeFormKey]: {
        ...currentForms[activeFormKey],
        [field]: value,
      },
    }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMessage("");

    try {
      const normalizedDriverTruckId = activeForm.truckId?.trim().toUpperCase() || "";

      if (!isLoginMode && isDriverPortal && BLOCKED_TRUCK_IDS.has(normalizedDriverTruckId)) {
        setErrorMessage("TRUCK-001 is reserved. Please enter your real assigned truck ID.");
        return;
      }

      const payload = isLoginMode
        ? {
            email: activeForm.email.trim(),
            password: activeForm.password,
            role: portal,
          }
        : {
            name: activeForm.name.trim(),
            email: activeForm.email.trim(),
            password: activeForm.password,
            role: portal,
            ...(isDriverPortal ? { truckId: normalizedDriverTruckId } : {}),
          };

      const response = isLoginMode ? await loginUser(payload) : await signUpUser(payload);
      onAuthenticated({ token: response.token, user: response.user });
    } catch (error) {
      setErrorMessage(error.message);
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
        <Text style={styles.kicker}>Waste Monitoring System</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Animated.View
          style={{
            opacity: formOpacity,
            transform: [{ translateX: formTranslateX }],
          }}
        >
          <View style={styles.portalRow}>
            <Pressable
              style={[styles.portalButton, !isDriverPortal && styles.portalButtonActive]}
              onPress={() => switchPortal("citizen")}
            >
              <Text style={[styles.portalText, !isDriverPortal && styles.portalTextActive]}>Citizen</Text>
            </Pressable>
            <Pressable
              style={[styles.portalButton, isDriverPortal && styles.portalButtonActive]}
              onPress={() => switchPortal("driver")}
            >
              <Text style={[styles.portalText, isDriverPortal && styles.portalTextActive]}>Driver</Text>
            </Pressable>
          </View>

          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleButton, isLoginMode && styles.toggleButtonActive]}
              onPress={() => switchMode("login")}
            >
              <Text style={[styles.toggleText, isLoginMode && styles.toggleTextActive]}>Log In</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, !isLoginMode && styles.toggleButtonActive]}
              onPress={() => switchMode("signup")}
            >
              <Text style={[styles.toggleText, !isLoginMode && styles.toggleTextActive]}>Sign Up</Text>
            </Pressable>
          </View>

          {!isLoginMode ? (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder={isDriverPortal ? "Driver name" : "Juan Dela Cruz"}
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                value={activeForm.name}
                onChangeText={(value) => updateActiveForm("name", value)}
              />
            </>
          ) : null}

          {isDriverPortal && !isLoginMode ? (
            <>
              <Text style={styles.label}>Assigned Truck ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter assigned truck ID"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={activeForm.truckId}
                onChangeText={(value) => updateActiveForm("truckId", value.toUpperCase())}
              />
            </>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder={isDriverPortal ? "driver@example.com" : "name@example.com"}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={activeForm.email}
            onChangeText={(value) => updateActiveForm("email", value)}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            value={activeForm.password}
            onChangeText={(value) => updateActiveForm("password", value)}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {isNetworkError ? (
            <Text style={styles.hintText}>
              Backend not reachable at {API_BASE_URL}. Start the backend with `npm run waste:start:backend`, or use `npm run waste:start:all` to launch both backend and mobile together. If you are on a real phone, keep the phone and computer on the same Wi-Fi.
            </Text>
          ) : null}

          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
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
    fontWeight: "700",
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
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    marginTop: 10,
    marginBottom: 18,
  },
  portalRow: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 4,
    marginBottom: 12,
  },
  portalButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  portalButtonActive: {
    backgroundColor: "#ffffff",
  },
  portalText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#cbd5e1",
  },
  portalTextActive: {
    color: "#0f172a",
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
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#ffffff",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  toggleTextActive: {
    color: "#0f172a",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 16,
  },
  errorText: {
    color: "#b91c1c",
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