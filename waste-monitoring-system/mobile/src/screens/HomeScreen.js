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
import { usePreferences } from "../context/PreferencesContext";
import { getAnnouncements, getNews, getTrucks } from "../services/api";
import { createTruckSocket } from "../services/socket";

const BLOCKED_TRUCK_IDS = new Set(["TRUCK-001"]);

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

function formatFeedDate(value) {
  if (!value) {
    return "Just now";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Just now";
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeFeedItem(item) {
  if (!item || !item.id) {
    return null;
  }

  return {
    id: String(item.id),
    title: String(item.title || "Untitled"),
    details: String(item.details || ""),
    postedAt: formatFeedDate(item.createdAt || item.updatedAt || item.postedAt),
  };
}

function normalizeFeedList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(normalizeFeedItem).filter(Boolean);
}

function prependUniqueFeedItem(currentItems, incomingItem) {
  const normalized = normalizeFeedItem(incomingItem);

  if (!normalized) {
    return currentItems;
  }

  const withoutOldValue = currentItems.filter((item) => item.id !== normalized.id);
  return [normalized, ...withoutOldValue];
}

function updateFeedItem(currentItems, incomingItem) {
  const normalized = normalizeFeedItem(incomingItem);

  if (!normalized) {
    return currentItems;
  }

  const nextItems = [...currentItems];
  const existingIndex = nextItems.findIndex((item) => item.id === normalized.id);

  if (existingIndex === -1) {
    nextItems.unshift(normalized);
    return nextItems;
  }

  nextItems[existingIndex] = normalized;
  return nextItems;
}

function removeFeedItem(currentItems, itemId) {
  const normalizedItemId = String(itemId || "").trim().toUpperCase();

  if (!normalizedItemId) {
    return currentItems;
  }

  return currentItems.filter((item) => String(item.id || "").trim().toUpperCase() !== normalizedItemId);
}

export default function HomeScreen() {
  const { token, user, signOut } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const [trucks, setTrucks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const designatedBarangay = String(user?.barangay || "").trim();

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

  async function loadHomeData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const [truckResponse, announcementsResponse, newsResponse] = await Promise.all([
        getTrucks(token),
        getAnnouncements(token),
        getNews(token),
      ]);

      setTrucks(filterVisibleTrucks(truckResponse.trucks || []));
      setAnnouncements(normalizeFeedList(announcementsResponse.announcements || []));
      setNewsItems(normalizeFeedList(newsResponse.news || []));
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
    loadHomeData();

    const socket = createTruckSocket(token);

    socket.on("connect", () => {
      setErrorMessage("");
    });

    socket.on("connect_error", (error) => {
      if (!handleAuthError(error.message)) {
        setErrorMessage(error.message);
      }
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

    socket.on("announcement:created", (announcement) => {
      setAnnouncements((current) => prependUniqueFeedItem(current, announcement));
      setErrorMessage("");
    });

    socket.on("news:created", (news) => {
      setNewsItems((current) => prependUniqueFeedItem(current, news));
      setErrorMessage("");
    });

    socket.on("announcement:updated", (announcement) => {
      setAnnouncements((current) => updateFeedItem(current, announcement));
      setErrorMessage("");
    });

    socket.on("announcement:deleted", ({ id }) => {
      setAnnouncements((current) => removeFeedItem(current, id));
      setErrorMessage("");
    });

    socket.on("news:updated", (news) => {
      setNewsItems((current) => updateFeedItem(current, news));
      setErrorMessage("");
    });

    socket.on("news:deleted", ({ id }) => {
      setNewsItems((current) => removeFeedItem(current, id));
      setErrorMessage("");
    });

    return () => {
      socket.disconnect();
    };
  }, [designatedBarangay, token]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadHomeData(true)} tintColor="#0f766e" />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.metricRow}>
        <View style={[styles.metricCard, styles.metricCardPrimary, { borderColor: colors.primary }]}>
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" style={styles.metricSpinner} />
          ) : (
            <Text style={styles.metricValue}>{fleetSummary.active}</Text>
          )}
          <Text style={styles.metricLabel}>Active trucks</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Text style={[styles.metricValueDark, { color: colors.text }]}>{fleetSummary.collecting}</Text>
          <Text style={[styles.metricLabelDark, { color: colors.textSecondary }]}>Collecting</Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardLast, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Text style={[styles.metricValueDark, { color: colors.text }]}>{fleetSummary.onRoute}</Text>
          <Text style={[styles.metricLabelDark, { color: colors.textSecondary }]}>On route</Text>
        </View>
      </View>

      <View style={styles.metricRowSingle}>
        <View style={[styles.metricCardWide, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Ionicons name="pause-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.metricWideText, { color: colors.textSecondary }]}>
            {fleetSummary.idle} truck(s) currently idle
          </Text>
        </View>
      </View>

      {errorMessage ? (
        <Text style={[styles.errorBanner, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>{errorMessage}</Text>
      ) : null}
      {!errorMessage && !designatedBarangay ? (
        <Text style={[styles.errorBanner, { backgroundColor: colors.overlay, color: colors.primary }]}>
          Set your designated barangay in Profile to receive live truck updates.
        </Text>
      ) : null}

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Announcements</Text>
        {announcements.map((announcement) => (
          <View
            key={announcement.id}
            style={[styles.feedItem, { backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc", borderColor: colors.borderSoft }]}
          >
            <Text style={[styles.feedTitle, { color: colors.text }]}>{announcement.title}</Text>
            <Text style={[styles.feedDetails, { color: colors.textSecondary }]}>{announcement.details}</Text>
            <Text style={[styles.feedMeta, { color: colors.textMuted }]}>{announcement.postedAt}</Text>
          </View>
        ))}
        {announcements.length === 0 ? <Text style={[styles.emptyFeedText, { color: colors.textMuted }]}>No announcements yet.</Text> : null}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>News</Text>
        {newsItems.map((newsItem) => (
          <View
            key={newsItem.id}
            style={[styles.feedItem, { backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc", borderColor: colors.borderSoft }]}
          >
            <Text style={[styles.feedTitle, { color: colors.text }]}>{newsItem.title}</Text>
            <Text style={[styles.feedDetails, { color: colors.textSecondary }]}>{newsItem.details}</Text>
            <Text style={[styles.feedMeta, { color: colors.textMuted }]}>{newsItem.postedAt}</Text>
          </View>
        ))}
        {newsItems.length === 0 ? <Text style={[styles.emptyFeedText, { color: colors.textMuted }]}>No news yet.</Text> : null}
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
  emptyFeedText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    paddingVertical: 6,
  },
});
