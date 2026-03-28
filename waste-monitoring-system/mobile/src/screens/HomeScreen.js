import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { getTrucks } from "../services/api";
import { createTruckSocket } from "../services/socket";

const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);

const ANNOUNCEMENTS = [
  {
    id: "ANN-001",
    title: "Barangay Segregation Reminder",
    details:
      "Please separate biodegradable and non-biodegradable waste before pickup to avoid missed collection.",
    postedAt: "March 27, 2026",
  },
  {
    id: "ANN-002",
    title: "Saturday Recovery Route",
    details:
      "A recovery truck will cover delayed streets this Saturday from 8:00 AM to 12:00 PM.",
    postedAt: "March 26, 2026",
  },
];

const NEWS_ITEMS = [
  {
    id: "NEWS-001",
    title: "New GPS-Tracked Truck Added to Fleet",
    details:
      "The city added one additional GPS-enabled truck to improve route coverage in dense areas.",
    postedAt: "March 25, 2026",
  },
  {
    id: "NEWS-002",
    title: "Illegal Dumping Reports Are Being Processed Faster",
    details:
      "Recent system updates helped response teams dispatch cleanup crews faster after citizen reports.",
    postedAt: "March 24, 2026",
  },
];

function filterVisibleTrucks(trucks) {
  return trucks.filter((truck) => !BLOCKED_TRUCK_IDS.has(truck.truckId));
}

function upsertTruck(currentTrucks, updatedTruck) {
  if (BLOCKED_TRUCK_IDS.has(updatedTruck.truckId)) {
    return currentTrucks;
  }

  const nextTrucks = [...currentTrucks];
  const existingIndex = nextTrucks.findIndex((truck) => truck.truckId === updatedTruck.truckId);

  if (existingIndex === -1) {
    nextTrucks.push(updatedTruck);
  } else {
    nextTrucks[existingIndex] = updatedTruck;
  }

  return nextTrucks;
}

function removeTruck(currentTrucks, truckId) {
  return currentTrucks.filter((truck) => truck.truckId !== truckId);
}

export default function HomeScreen() {
  const { token, signOut } = useAuth();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fleetSummary = useMemo(
    () => ({
      active: trucks.length,
      collecting: trucks.filter((truck) => truck.status === "Collecting").length,
      onRoute: trucks.filter((truck) => truck.status === "On Route").length,
      idle: trucks.filter((truck) => truck.status === "Idle").length,
    }),
    [trucks]
  );

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  async function loadActiveTrucks(isRefresh = false) {
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

  useEffect(() => {
    loadActiveTrucks();

    const socket = createTruckSocket();

    socket.on("connect", () => {
      setErrorMessage("");
    });

    socket.on("connect_error", (error) => {
      setErrorMessage(error.message);
    });

    socket.on("trucks:snapshot", (snapshot) => {
      setTrucks(filterVisibleTrucks(snapshot || []));
      setErrorMessage("");
    });

    socket.on("truck:updated", (updatedTruck) => {
      setTrucks((current) => upsertTruck(current, updatedTruck));
      setErrorMessage("");
    });

    socket.on("truck:removed", ({ truckId }) => {
      setTrucks((current) => removeTruck(current, truckId));
      setErrorMessage("");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadActiveTrucks(true)} tintColor="#0f766e" />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.metricRow}>
        <View style={[styles.metricCard, styles.metricCardPrimary]}>
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" style={styles.metricSpinner} />
          ) : (
            <Text style={styles.metricValue}>{fleetSummary.active}</Text>
          )}
          <Text style={styles.metricLabel}>Active trucks</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValueDark}>{fleetSummary.collecting}</Text>
          <Text style={styles.metricLabelDark}>Collecting</Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardLast]}>
          <Text style={styles.metricValueDark}>{fleetSummary.onRoute}</Text>
          <Text style={styles.metricLabelDark}>On route</Text>
        </View>
      </View>

      <View style={styles.metricRowSingle}>
        <View style={styles.metricCardWide}>
          <Ionicons name="pause-circle-outline" size={16} color="#64748b" />
          <Text style={styles.metricWideText}>{fleetSummary.idle} truck(s) currently idle</Text>
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        {ANNOUNCEMENTS.map((announcement) => (
          <View key={announcement.id} style={styles.feedItem}>
            <Text style={styles.feedTitle}>{announcement.title}</Text>
            <Text style={styles.feedDetails}>{announcement.details}</Text>
            <Text style={styles.feedMeta}>{announcement.postedAt}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>News</Text>
        {NEWS_ITEMS.map((newsItem) => (
          <View key={newsItem.id} style={styles.feedItem}>
            <Text style={styles.feedTitle}>{newsItem.title}</Text>
            <Text style={styles.feedDetails}>{newsItem.details}</Text>
            <Text style={styles.feedMeta}>{newsItem.postedAt}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 36,
    backgroundColor: "#f3f7f6",
  },
  metricRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginRight: 8,
  },
  metricCardLast: {
    marginRight: 0,
  },
  metricCardPrimary: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
    flex: 1.2,
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    minHeight: 30,
  },
  metricSpinner: {
    minHeight: 30,
    alignSelf: "flex-start",
  },
  metricLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
  },
  metricValueDark: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "800",
    minHeight: 30,
  },
  metricLabelDark: {
    marginTop: 4,
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  metricRowSingle: {
    marginBottom: 12,
  },
  metricCardWide: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricWideText: {
    marginLeft: 8,
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  errorBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  feedItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12,
    marginBottom: 8,
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  feedDetails: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  feedMeta: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
});
