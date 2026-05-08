import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import {
  markTripCompletionFromLiveSharing,
  markTripDepartureFromLiveSharing,
} from "../services/api";
import { createTruckSocket } from "../services/socket";

const TRUCK_STATUSES = ["Collecting", "On Route", "Idle"];
const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "-";
}

function toCoordinatePayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

function normalizeTruckId(value) {
  return String(value || "").trim().toUpperCase();
}

function isBlockedTruckId(truckId) {
  return BLOCKED_TRUCK_IDS.has(truckId);
}

export default function DriverScreen() {
  const { token, user, signOut } = useAuth();
  const assignedTruckId = isBlockedTruckId(user?.truckId || "") ? "" : user?.truckId || "";
  const socketRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const statusRef = useRef("On Route");
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(24)).current;
  const cardsOpacity = useRef(new Animated.Value(0)).current;
  const cardsTranslateY = useRef(new Animated.Value(34)).current;
  const livePulse = useRef(new Animated.Value(0)).current;
  const [truckId, setTruckId] = useState(assignedTruckId || "");
  const [status, setStatus] = useState("On Route");
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [connectionLabel, setConnectionLabel] = useState("Connecting");
  const [errorMessage, setErrorMessage] = useState("");

  const secondaryCardTranslateY = cardsTranslateY.interpolate({
    inputRange: [0, 34],
    outputRange: [0, 18],
  });
  const livePulseScale = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.24],
  });
  const livePulseOpacity = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0],
  });
  const floatingCardShift = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  useEffect(() => {
    Animated.stagger(110, [
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(heroTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 150,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(cardsOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(cardsTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 140,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [cardsOpacity, cardsTranslateY, heroOpacity, heroTranslateY]);

  useEffect(() => {
    let pulseAnimation;

    if (sharing) {
      livePulse.setValue(0);
      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(livePulse, {
            toValue: 1,
            duration: 1000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(livePulse, {
            toValue: 0,
            duration: 1000,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
    } else {
      livePulse.setValue(0);
    }

    return () => pulseAnimation?.stop();
  }, [livePulse, sharing]);

  useEffect(() => {
    if (assignedTruckId) {
      setTruckId(assignedTruckId);
    }
  }, [assignedTruckId]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const socket = createTruckSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionLabel("Live");
      setErrorMessage("");
    });

    socket.on("disconnect", () => {
      setConnectionLabel("Offline");
    });

    socket.on("connect_error", (error) => {
      setConnectionLabel("Offline");
      if (!handleAuthError(error.message)) {
        setErrorMessage(error.message);
      }
    });

    return () => {
      locationSubscriptionRef.current?.remove();
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!sharing || !currentLocation) {
      return;
    }

    publishTruckLocation(currentLocation, status).catch((error) => {
      setErrorMessage(error.message);
    });
  }, [sharing, status]);

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  function getActiveTruckId() {
    return normalizeTruckId(assignedTruckId || truckId);
  }

  async function syncTripTicketSharingPhase(phase, occurredAt, activeTruckId) {
    if (!token) {
      return null;
    }

    try {
      if (phase === "start") {
        return await markTripDepartureFromLiveSharing(activeTruckId, occurredAt, token);
      }

      return await markTripCompletionFromLiveSharing(activeTruckId, occurredAt, token);
    } catch (error) {
      if (handleAuthError(error.message)) {
        return null;
      }

      throw error;
    }
  }

  async function requestLiveLocation() {
    const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();

    if (permissionStatus !== "granted") {
      throw new Error("Location permission is required to share truck GPS.");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const coordinates = toCoordinatePayload(position);
    setCurrentLocation(coordinates);
    return coordinates;
  }

  async function publishTruckLocation(coordinates, nextStatus = statusRef.current) {
    const activeSocket = socketRef.current;
    const normalizedTruckId = normalizeTruckId(assignedTruckId || truckId);

    if (!normalizedTruckId) {
      throw new Error("Enter a truck ID before sharing location.");
    }

    if (!activeSocket || !activeSocket.connected) {
      throw new Error("Backend is offline. Reconnect before sending truck GPS.");
    }

    return new Promise((resolve, reject) => {
      activeSocket.emit(
        "truck:update",
        {
          truckId: normalizedTruckId,
          status: nextStatus,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        (response) => {
          if (!response?.ok) {
            reject(new Error(response?.error || "Unable to update the truck location."));
            return;
          }

          setLastSyncedAt(new Date().toLocaleTimeString());
          setErrorMessage("");
          resolve(response.truck);
        }
      );
    });
  }

  async function removeTruckFromFleet() {
    const activeSocket = socketRef.current;
    const normalizedTruckId = normalizeTruckId(assignedTruckId || truckId);

    if (!normalizedTruckId || !activeSocket || !activeSocket.connected) {
      return;
    }

    await new Promise((resolve, reject) => {
      activeSocket.emit("truck:remove", { truckId: normalizedTruckId }, (response) => {
        if (!response?.ok) {
          reject(new Error(response?.error || "Unable to remove the truck from the map."));
          return;
        }

        resolve(response);
      });
    });
  }

  async function sendSingleUpdate() {
    setLoading(true);

    try {
      const coordinates = await requestLiveLocation();
      await publishTruckLocation(coordinates);
      Alert.alert("Truck updated", "The phone's current GPS location has been sent to the live map.");
    } catch (error) {
      setErrorMessage(error.message);
      Alert.alert("Unable to send GPS", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function startSharing() {
    const pressedAt = new Date().toISOString();
    setLoading(true);

    try {
      locationSubscriptionRef.current?.remove();

      const coordinates = await requestLiveLocation();
      await publishTruckLocation(coordinates);

      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        async (nextPosition) => {
          const nextCoordinates = toCoordinatePayload(nextPosition);
          setCurrentLocation(nextCoordinates);

          try {
            await publishTruckLocation(nextCoordinates, statusRef.current);
          } catch (error) {
            setErrorMessage(error.message);
          }
        }
      );

      setSharing(true);
      setErrorMessage("");

      try {
        await syncTripTicketSharingPhase("start", pressedAt, getActiveTruckId());
      } catch (error) {
        setErrorMessage(`Live GPS started, but the departure time was not updated: ${error.message}`);
      }
    } catch (error) {
      setSharing(false);
      setErrorMessage(error.message);
      Alert.alert("Unable to start sharing", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function stopSharing() {
    const pressedAt = new Date().toISOString();
    const activeTruckId = getActiveTruckId();
    setLoading(true);
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    setSharing(false);

    try {
      const results = await Promise.allSettled([
        removeTruckFromFleet(),
        syncTripTicketSharingPhase("stop", pressedAt, activeTruckId),
      ]);

      const errors = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason?.message || "Unable to finish the live sharing update.");

      setLastSyncedAt("");
      setErrorMessage(errors.join(" "));
    } finally {
      setLoading(false);
    }
  }

  const connectionTone = connectionLabel === "Live" ? styles.connectionLive : styles.connectionOffline;
  const truckIdLocked = Boolean(assignedTruckId) || sharing;

  return (
    <ScrollView contentContainerStyle={styles.content}>

      <Animated.View
        style={{
          opacity: cardsOpacity,
          transform: [{ translateY: cardsTranslateY }],
        }}
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Assigned truck</Text>
          <Text style={styles.label}>{assignedTruckId ? "Truck ID" : "Truck ID (editable)"}</Text>
          <TextInput
            style={[styles.input, truckIdLocked && styles.inputDisabled]}
            value={truckId}
            onChangeText={(value) => setTruckId(value.toUpperCase())}
            placeholder="Enter truck ID"
            placeholderTextColor="#94a3b8"
            editable={!truckIdLocked}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            {TRUCK_STATUSES.map((option) => {
              const selected = option === status;

              return (
                <Pressable
                  key={option}
                  style={[styles.statusChip, selected && styles.statusChipSelected]}
                  onPress={() => setStatus(option)}
                >
                  <Text style={[styles.statusChipText, selected && styles.statusChipTextSelected]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={{
          opacity: cardsOpacity,
          transform: [{ translateY: secondaryCardTranslateY }],
        }}
      >
        <View style={styles.card}>
          <View style={styles.gpsHeaderRow}>
            <Text style={styles.sectionTitle}>Live GPS</Text>
            <View style={styles.shareStatusShell}>
              {sharing ? (
                <Animated.View
                  style={[
                    styles.shareStatusPulse,
                    {
                      opacity: livePulseOpacity,
                      transform: [{ scale: livePulseScale }],
                    },
                  ]}
                />
              ) : null}
              <View style={[styles.shareStatusPill, sharing && styles.shareStatusPillActive]}>
                <Ionicons
                  name={sharing ? "radio" : "pause-circle-outline"}
                  size={14}
                  color={sharing ? "#0f766e" : "#64748b"}
                />
                <Text style={[styles.shareStatusText, sharing && styles.shareStatusTextActive]}>
                  {sharing ? "Broadcasting" : "Ready"}
                </Text>
              </View>
            </View>
          </View>

          <Animated.View
            style={[
              styles.coordinatesCard,
              sharing && {
                transform: [{ translateY: floatingCardShift }],
              },
            ]}
          >
            <View style={styles.coordinateBlock}>
              <Text style={styles.coordinateLabel}>Latitude</Text>
              <Text style={styles.coordinateValue}>{formatCoordinate(currentLocation?.latitude)}</Text>
            </View>
            <View style={styles.coordinateDivider} />
            <View style={styles.coordinateBlock}>
              <Text style={styles.coordinateLabel}>Longitude</Text>
              <Text style={styles.coordinateValue}>{formatCoordinate(currentLocation?.longitude)}</Text>
            </View>
          </Animated.View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Sharing</Text>
            <Text style={[styles.metaValue, sharing ? styles.metaValueLive : styles.metaValueMuted]}>
              {sharing ? "Live to fleet map" : "Stopped"}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last sync</Text>
            <Text style={styles.metaValue}>{lastSyncedAt || "Not sent yet"}</Text>
          </View>

          {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

          <Pressable
            style={[styles.primaryButton, (loading || sharing) && styles.buttonDisabled]}
            onPress={startSharing}
            disabled={loading || sharing}
          >
            {loading && !sharing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Live GPS Sharing</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, sharing && styles.stopButton]}
            onPress={sharing ? stopSharing : sendSingleUpdate}
            disabled={loading}
          >
            <Text style={[styles.secondaryButtonText, sharing && styles.stopButtonText]}>
              {sharing ? "Stop Sharing" : "Send One GPS Update"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    backgroundColor: "#f3f7f6",
    flexGrow: 1,
  },
  heroCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: "#0f172a",
    marginBottom: 16,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#5eead4",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
    maxWidth: 220,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: "#cbd5e1",
  },
  tipCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tipText: {
    marginLeft: 10,
    flex: 1,
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
  },
  liveBadgeWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  liveBadgePulse: {
    position: "absolute",
    width: 88,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(94, 234, 212, 0.22)",
  },
  connectionPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectionLive: {
    backgroundColor: "#dcfce7",
  },
  connectionOffline: {
    backgroundColor: "#fee2e2",
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0f766e",
    marginRight: 8,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 16,
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
  inputDisabled: {
    opacity: 0.65,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    marginRight: 10,
    marginBottom: 10,
  },
  statusChipSelected: {
    backgroundColor: "#ccfbf1",
  },
  statusChipText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  statusChipTextSelected: {
    color: "#0f766e",
  },
  gpsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareStatusShell: {
    alignItems: "center",
    justifyContent: "center",
  },
  shareStatusPulse: {
    position: "absolute",
    width: 116,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(20, 184, 166, 0.18)",
  },
  shareStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#e2e8f0",
  },
  shareStatusPillActive: {
    backgroundColor: "#ccfbf1",
  },
  shareStatusText: {
    marginLeft: 6,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  shareStatusTextActive: {
    color: "#0f766e",
  },
  coordinatesCard: {
    flexDirection: "row",
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  coordinateBlock: {
    flex: 1,
    padding: 16,
  },
  coordinateDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
  },
  coordinateLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
    marginBottom: 8,
  },
  coordinateValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  metaLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  metaValueLive: {
    color: "#0f766e",
  },
  metaValueMuted: {
    color: "#64748b",
  },
  errorBanner: {
    marginTop: 10,
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfeff",
  },
  secondaryButtonText: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "700",
  },
  stopButton: {
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
  },
  stopButtonText: {
    color: "#dc2626",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
