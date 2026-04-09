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
import { getCollectionSchedule } from "../services/api";

const DAY_ORDER = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function sortSchedule(entries) {
  return [...entries].sort((first, second) => {
    const firstDay = DAY_ORDER[first.day] || 99;
    const secondDay = DAY_ORDER[second.day] || 99;

    if (firstDay !== secondDay) {
      return firstDay - secondDay;
    }

    return String(first.zone || "").localeCompare(String(second.zone || ""));
  });
}

function getWasteTypeTone(wasteType) {
  const normalized = String(wasteType || "").toLowerCase();

  if (normalized.includes("bio")) {
    return {
      backgroundColor: "#dcfce7",
      color: "#166534",
    };
  }

  if (normalized.includes("non")) {
    return {
      backgroundColor: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  return {
    backgroundColor: "#ffedd5",
    color: "#c2410c",
  };
}

export default function ScheduleScreen() {
  const { token, signOut } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sortedSchedule = useMemo(() => sortSchedule(schedule), [schedule]);

  function handleAuthError(message) {
    if (message === "Authentication required" || message === "Invalid or expired session") {
      signOut();
      return true;
    }

    return false;
  }

  async function loadSchedule(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await getCollectionSchedule(token);
      setSchedule(Array.isArray(response.schedule) ? response.schedule : []);
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
    loadSchedule();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadSchedule(true)} tintColor="#0f766e" />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>Collection Schedule</Text>
        <Text style={[styles.title, { color: colors.text }]}>Weekly Waste Pickup Plan</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Check your collection day and prepare your waste before pickup starts in your zone.
        </Text>
        <View style={styles.heroMetaRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={[styles.heroMetaText, { color: colors.primary }]}>{sortedSchedule.length} active schedule slots</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading collection schedule...</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={[styles.errorBanner, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>{errorMessage}</Text>
      ) : null}

      {!loading && !errorMessage && sortedSchedule.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Ionicons name="calendar-clear-outline" size={22} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No schedule found yet.</Text>
        </View>
      ) : null}

      {!loading && sortedSchedule.length > 0
        ? sortedSchedule.map((entry) => {
            const tone = getWasteTypeTone(entry.wasteType);

            return (
              <View
                key={entry.id || `${entry.day}-${entry.zone}`}
                style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}
              >
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.dayText, { color: colors.text }]}>{entry.day}</Text>
                    <Text style={[styles.zoneText, { color: colors.textSecondary }]}>{entry.zone}</Text>
                  </View>
                  <View style={[styles.typePill, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.typePillText, { color: tone.color }]}>{entry.wasteType}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={15} color={colors.primary} />
                  <Text style={[styles.detailText, { color: colors.text }]}>{entry.timeWindow}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
                  <Text style={[styles.noteText, { color: isDarkMode ? colors.textSecondary : "#475569" }]}>{entry.notes}</Text>
                </View>
              </View>
            );
          })
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: "#f3f7f6",
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#ffffff",
    marginBottom: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "800",
    color: "#0f766e",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  heroMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  heroMetaText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f766e",
  },
  loadingCard: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: "#475569",
  },
  errorBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
  },
  emptyCard: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  emptyText: {
    marginLeft: 10,
    color: "#475569",
    fontSize: 14,
  },
  scheduleCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  zoneText: {
    marginTop: 2,
    fontSize: 13,
    color: "#475569",
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  detailRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  detailText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
  },
  noteText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#64748b",
    flex: 1,
  },
});
