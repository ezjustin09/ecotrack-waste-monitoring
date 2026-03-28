import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TruckMarker from "../components/TruckMarker";
import { useAuth } from "../context/AuthContext";
import { getTrucks } from "../services/api";
import {
  ALERT_RADIUS_METERS,
  ALERT_REARM_METERS,
  clearNearbyTruckNotificationsAsync,
  enableNearbyTruckAlertsAsync,
  formatDistanceMeters,
  getDistanceMeters,
  getNearbyTruckAlertsStatusAsync,
  sendNearbyTruckNotificationAsync,
} from "../services/notifications";
import { createTruckSocket } from "../services/socket";
import { MAP_STYLE } from "../utils/mapTheme";
import { buildMapRegion } from "../utils/region";
import { getTruckStatusMeta } from "../utils/truckStatus";

const SHEET_MAX_HEIGHT = 350;
const SHEET_PEEK_HEIGHT = 88;
const SHEET_COLLAPSED_OFFSET = SHEET_MAX_HEIGHT - SHEET_PEEK_HEIGHT;
const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);
const OVERLAP_DISTANCE_METERS = 18;
const OVERLAP_OFFSET_DEGREES = 0.00014;

function isBlockedTruckId(truckId) {
  return BLOCKED_TRUCK_IDS.has(truckId);
}

function filterVisibleTrucks(trucks) {
  return trucks.filter((truck) => !isBlockedTruckId(truck.truckId));
}

function upsertTruck(currentTrucks, updatedTruck) {
  if (isBlockedTruckId(updatedTruck.truckId)) {
    return currentTrucks;
  }

  const nextTrucks = [...currentTrucks];
  const index = nextTrucks.findIndex((truck) => truck.truckId === updatedTruck.truckId);

  if (index >= 0) {
    nextTrucks[index] = updatedTruck;
    return nextTrucks;
  }

  nextTrucks.push(updatedTruck);
  return nextTrucks;
}

function removeTruck(currentTrucks, removedTruckId) {
  return currentTrucks.filter((truck) => truck.truckId !== removedTruckId);
}

function firstName(name) {
  return String(name || "Citizen").trim().split(" ")[0] || "Citizen";
}

function hashTruckId(truckId) {
  return String(truckId || "").split("").reduce((total, character) => total + character.charCodeAt(0), 0);
}

function getVisibleTruckCoordinate(truck, userLocation) {
  if (!userLocation) {
    return {
      latitude: truck.latitude,
      longitude: truck.longitude,
    };
  }

  if (getDistanceMeters(userLocation, truck) > OVERLAP_DISTANCE_METERS) {
    return {
      latitude: truck.latitude,
      longitude: truck.longitude,
    };
  }

  const angle = ((hashTruckId(truck.truckId) % 360) * Math.PI) / 180;

  return {
    latitude: truck.latitude + Math.sin(angle) * OVERLAP_OFFSET_DEGREES,
    longitude: truck.longitude + Math.cos(angle) * OVERLAP_OFFSET_DEGREES,
  };
}

function describeAlertAccess(alertAccess, alertsEnabled) {
  if (alertsEnabled) {
    return "Near-me alerts on";
  }

  if (alertAccess === "blocked") {
    return "Alerts blocked";
  }

  if (alertAccess === "checking") {
    return "Checking alerts";
  }

  if (alertAccess === "error") {
    return "Alert issue";
  }

  if (alertAccess === "unsupported") {
    return "Alerts unavailable";
  }

  return "Alerts paused";
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { token, user, signOut } = useAuth();
  const mapRef = useRef(null);
  const fittedOnceRef = useRef(false);
  const nearbyTruckIdsRef = useRef(new Set());
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const [trucks, setTrucks] = useState([]);
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("Connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertAccess, setAlertAccess] = useState("checking");

  const region = useMemo(() => buildMapRegion(trucks, userLocation), [trucks, userLocation]);
  const selectedTruck = useMemo(
    () => trucks.find((truck) => truck.truckId === selectedTruckId) || trucks[0] || null,
    [selectedTruckId, trucks]
  );
  const fleetCounts = useMemo(
    () => ({
      total: trucks.length,
      collecting: trucks.filter((truck) => truck.status === "Collecting").length,
      moving: trucks.filter((truck) => truck.status === "On Route").length,
      idle: trucks.filter((truck) => truck.status === "Idle").length,
    }),
    [trucks]
  );
  const nearbyTruckCount = useMemo(() => {
    if (!userLocation) {
      return 0;
    }

    return trucks.filter((truck) => getDistanceMeters(userLocation, truck) <= ALERT_RADIUS_METERS).length;
  }, [trucks, userLocation]);
  const closestTruckSummary = useMemo(() => {
    if (!userLocation || trucks.length === 0) {
      return null;
    }

    return trucks.reduce((closest, truck) => {
      const distanceMeters = getDistanceMeters(userLocation, truck);

      if (!closest || distanceMeters < closest.distanceMeters) {
        return {
          truck,
          distanceMeters,
        };
      }

      return closest;
    }, null);
  }, [trucks, userLocation]);

  function setSheetCollapsed(nextCollapsed) {
    setIsSheetCollapsed(nextCollapsed);
    Animated.spring(sheetTranslateY, {
      toValue: nextCollapsed ? SHEET_COLLAPSED_OFFSET : 0,
      useNativeDriver: true,
      friction: 10,
      tension: 70,
    }).start();
  }

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  function focusFleet() {
    const coordinates = [
      ...trucks.map((truck) => ({ latitude: truck.latitude, longitude: truck.longitude })),
      ...(userLocation ? [userLocation] : []),
    ];

    if (!mapRef.current || coordinates.length === 0) {
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 180,
        right: 80,
        bottom: isSheetCollapsed ? 120 : 320,
        left: 80,
      },
      animated: true,
    });
  }

  function focusUser() {
    if (!mapRef.current || !userLocation) {
      return;
    }

    mapRef.current.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700
    );
  }

  function focusTruck(truck) {
    if (!mapRef.current || !truck) {
      return;
    }

    setSelectedTruckId(truck.truckId);
    mapRef.current.animateToRegion(
      {
        latitude: truck.latitude,
        longitude: truck.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700
    );
  }

  async function loadTrucks(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await getTrucks(token);
      setTrucks(filterVisibleTrucks(response.trucks || []));
      setErrorMessage("");
    } catch (error) {
      if (!handleAuthError(error.message)) {
        setErrorMessage(error.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function startLocationTracking() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      return Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 25,
          timeInterval: 10000,
        },
        (nextPosition) => {
          setUserLocation({
            latitude: nextPosition.coords.latitude,
            longitude: nextPosition.coords.longitude,
          });
        }
      );
    } catch (error) {
      console.log("Unable to get user location:", error.message);
      return null;
    }
  }

  async function hydrateNearbyAlerts() {
    try {
      const access = await getNearbyTruckAlertsStatusAsync();
      setAlertAccess(access.granted ? "granted" : access.status === "unsupported" ? "unsupported" : access.canAskAgain ? "denied" : "blocked");
      setAlertsEnabled(access.granted);
    } catch (error) {
      console.log("Unable to read notification permissions:", error.message);
      setAlertAccess("error");
      setAlertsEnabled(false);
    }
  }

  async function toggleNearbyAlerts() {
    if (alertsEnabled) {
      nearbyTruckIdsRef.current.clear();
      clearNearbyTruckNotificationsAsync().catch(() => {});
      setAlertsEnabled(false);
      return;
    }

    try {
      const access = await enableNearbyTruckAlertsAsync();
      setAlertAccess(access.granted ? "granted" : access.status === "unsupported" ? "unsupported" : access.canAskAgain ? "denied" : "blocked");
      setAlertsEnabled(access.granted);
    } catch (error) {
      console.log("Unable to enable nearby alerts:", error.message);
      setAlertAccess("error");
      setAlertsEnabled(false);
    }
  }

  useEffect(() => {
    let locationSubscription;

    loadTrucks();
    hydrateNearbyAlerts();

    (async () => {
      locationSubscription = await startLocationTracking();
    })();

    const socket = createTruckSocket();

    socket.on("connect", () => {
      setConnectionLabel("Live");
      setErrorMessage("");
    });

    socket.on("disconnect", () => {
      setConnectionLabel("Syncing");
    });

    socket.on("connect_error", (error) => {
      setConnectionLabel("Offline");
      setErrorMessage(error.message);
    });

    socket.on("trucks:snapshot", (snapshot) => {
      setTrucks(filterVisibleTrucks(snapshot));
      setErrorMessage("");
    });

    socket.on("truck:updated", (updatedTruck) => {
      setTrucks((currentTrucks) => upsertTruck(currentTrucks, updatedTruck));
      setErrorMessage("");
    });

    socket.on("truck:removed", ({ truckId }) => {
      setTrucks((currentTrucks) => removeTruck(currentTrucks, truckId));
      setErrorMessage("");
    });

    return () => {
      clearNearbyTruckNotificationsAsync().catch(() => {});
      socket.disconnect();
      locationSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedTruckId && trucks[0]) {
      setSelectedTruckId(trucks[0].truckId);
      return;
    }

    if (selectedTruckId && !trucks.some((truck) => truck.truckId === selectedTruckId)) {
      setSelectedTruckId(trucks[0]?.truckId || "");
    }
  }, [selectedTruckId, trucks]);

  useEffect(() => {
    if (!mapRef.current || fittedOnceRef.current || trucks.length === 0) {
      return;
    }

    focusFleet();
    fittedOnceRef.current = true;
  }, [trucks.length, region]);

  useEffect(() => {
    if (!alertsEnabled) {
      nearbyTruckIdsRef.current.clear();
      clearNearbyTruckNotificationsAsync().catch(() => {});
    }
  }, [alertsEnabled]);

  useEffect(() => {
    if (!alertsEnabled || !userLocation || trucks.length === 0) {
      if (trucks.length === 0) {
        nearbyTruckIdsRef.current.clear();
        clearNearbyTruckNotificationsAsync().catch(() => {});
      }
      return;
    }

    const trackedTruckIds = nearbyTruckIdsRef.current;
    const liveTruckIds = new Set(trucks.map((truck) => truck.truckId));

    trucks.forEach((truck) => {
      const distanceMeters = getDistanceMeters(userLocation, truck);
      const isInsideAlertZone = distanceMeters <= ALERT_RADIUS_METERS;
      const isOutsideRearmZone = distanceMeters >= ALERT_REARM_METERS;

      if (isInsideAlertZone && !trackedTruckIds.has(truck.truckId)) {
        trackedTruckIds.add(truck.truckId);
        sendNearbyTruckNotificationAsync(truck, distanceMeters).catch((error) => {
          console.log("Unable to send nearby truck notification:", error.message);
        });
        return;
      }

      if (isOutsideRearmZone && trackedTruckIds.has(truck.truckId)) {
        trackedTruckIds.delete(truck.truckId);
      }
    });

    Array.from(trackedTruckIds).forEach((truckId) => {
      if (!liveTruckIds.has(truckId)) {
        trackedTruckIds.delete(truckId);
      }
    });
  }, [alertsEnabled, trucks, userLocation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Loading live garbage truck activity...</Text>
      </View>
    );
  }

  const selectedStatusMeta = getTruckStatusMeta(selectedTruck?.status);
  const actionStackTop = insets.top + 20;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        googleRenderer={Platform.OS === "android" ? "LEGACY" : undefined}
        customMapStyle={MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
      >
        {trucks.map((truck) => (
          <TruckMarker
            key={truck.truckId}
            truck={truck}
            markerCoordinate={getVisibleTruckCoordinate(truck, userLocation)}
            selected={truck.truckId === selectedTruckId}
            onPress={focusTruck}
          />
        ))}
      </MapView>

      <View style={[styles.actionStack, { top: actionStackTop }]}>
        <Pressable
          style={[styles.actionButton, alertsEnabled && styles.actionButtonActive]}
          onPress={toggleNearbyAlerts}
        >
          <Ionicons
            name={alertsEnabled ? "notifications" : "notifications-outline"}
            size={20}
            color={alertsEnabled ? "#ffffff" : "#0f172a"}
          />
        </Pressable>
        <Pressable style={styles.actionButton} onPress={focusFleet}>
          <Ionicons name="scan-outline" size={20} color="#0f172a" />
        </Pressable>
        <Pressable style={styles.actionButton} onPress={focusUser}>
          <Ionicons name="locate-outline" size={20} color="#0f172a" />
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => loadTrucks(true)}>
          <Ionicons name="refresh-outline" size={20} color="#0f172a" />
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            paddingBottom: Math.max(insets.bottom, 14) + 10,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View style={styles.sheetGrabArea}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <View>
              <Text style={styles.sheetTitle}>Garbage Truck Activity</Text>
              <Text style={styles.sheetSubtitle}>
                {isSheetCollapsed ? "Tap expand to reopen the fleet list." : "Tap hide to collapse the fleet list."}
              </Text>
            </View>
            <View style={styles.sheetHeaderActions}>
              {selectedTruck ? (
                <View style={[styles.selectedStatusPill, { backgroundColor: selectedStatusMeta.soft }]}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={14} color={selectedStatusMeta.color} />
                  <Text style={[styles.selectedStatusText, { color: selectedStatusMeta.color }]}>{selectedTruck.status}</Text>
                </View>
              ) : null}
              <Pressable style={styles.collapseButton} onPress={() => setSheetCollapsed(!isSheetCollapsed)}>
                <Ionicons
                  name={isSheetCollapsed ? "chevron-up-outline" : "chevron-down-outline"}
                  size={18}
                  color="#0f172a"
                />
              </Pressable>
            </View>
          </View>
        </View>

        {!isSheetCollapsed ? (
          <>

            {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

            <ScrollView
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => loadTrucks(true)} tintColor="#0f766e" />
              }
              showsVerticalScrollIndicator={false}
            >
              {trucks.map((truck) => {
                const statusMeta = getTruckStatusMeta(truck.status);
                const selected = truck.truckId === selectedTruckId;

                return (
                  <Pressable
                    key={truck.truckId}
                    style={[styles.truckRow, selected && styles.truckRowSelected]}
                    onPress={() => focusTruck(truck)}
                  >
                    <View style={styles.truckRowLeft}>
                      <View style={[styles.rowIconShell, { backgroundColor: statusMeta.soft }]}>
                        <MaterialCommunityIcons name="truck-fast-outline" size={18} color={statusMeta.color} />
                      </View>
                      <View>
                        <Text style={styles.truckId}>{truck.truckId}</Text>
                        <Text style={styles.coordinates}>
                          {truck.latitude.toFixed(4)}, {truck.longitude.toFixed(4)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.truckRowRight}>
                      <View style={[styles.statusTag, { backgroundColor: statusMeta.soft }]}>
                        <Text style={[styles.statusTagText, { color: statusMeta.color }]}>{truck.status}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={styles.collapsedSummary}>
            <Text style={styles.collapsedSummaryText}>{fleetCounts.total} trucks live</Text>
            <Text style={styles.collapsedSummaryMeta}>Tap expand to view the full activity list again.</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#edf2ea",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf2ea",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#334155",
  },
  map: {
    flex: 1,
  },
  topPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "rgba(250, 252, 248, 0.96)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topRowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  topPanelCollapsed: {
    paddingBottom: 14,
  },
  topPanelToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    marginLeft: 10,
  },
  topPanelCollapsedLabel: {
    marginTop: 10,
    fontSize: 13,
    color: "#64748b",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 6,
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
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
  connectionSyncing: {
    backgroundColor: "#dbeafe",
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
  metricRow: {
    flexDirection: "row",
    marginTop: 16,
  },
  metricCard: {
    padding: 14,
    borderRadius: 20,
    marginRight: 10,
  },
  metricCardPrimary: {
    flex: 1.1,
    backgroundColor: "#0f766e",
  },
  metricCardMuted: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  metricCardLast: {
    marginRight: 0,
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
  },
  metricLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    marginTop: 4,
  },
  metricValueDark: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800",
  },
  metricLabelDark: {
    color: "#475569",
    fontSize: 12,
    marginTop: 4,
  },
  alertCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  alertPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  alertPillActive: {
    backgroundColor: "#ccfbf1",
  },
  alertPillBlocked: {
    backgroundColor: "#fee2e2",
  },
  alertPillMuted: {
    backgroundColor: "#e2e8f0",
  },
  alertPillText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
  },
  alertPillTextActive: {
    color: "#0f766e",
  },
  alertPillTextBlocked: {
    color: "#b91c1c",
  },
  alertPillTextMuted: {
    color: "#475569",
  },
  alertDescription: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  actionStack: {
    position: "absolute",
    right: 16,
    gap: 10,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 6,
  },
  actionButtonActive: {
    backgroundColor: "#0f766e",
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_MAX_HEIGHT,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: -6,
    },
    elevation: 12,
  },
  sheetGrabArea: {
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d1d5db",
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a",
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
  },
  selectedStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  selectedStatusText: {
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 6,
  },
  collapseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },

  errorBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 8,
  },
  truckRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  truckRowSelected: {
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
  },
  truckRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIconShell: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  truckRowRight: {
    alignItems: "flex-end",
  },
  truckId: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  coordinates: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 5,
  },
  statusTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: "800",
  },
  collapsedSummary: {
    marginTop: 12,
    paddingVertical: 10,
  },
  collapsedSummaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  collapsedSummaryMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
  },
});

