import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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

const DAY_LABELS = Object.keys(DAY_ORDER);
const ALL_BARANGAYS_FILTER = "All barangays";
const PATEROS_BARANGAYS = [
  "Aguho",
  "Magtanggol",
  "Martires Del 96",
  "Poblacion",
  "San Pedro",
  "San Roque",
  "Santa Ana",
  "Santo Rosario-Kanluran",
  "Santo Rosario-Silangan",
  "Tabacalera",
];

function getScheduleArea(entry) {
  return String(entry?.barangay || entry?.zone || "").trim();
}

function sortSchedule(entries) {
  return [...entries].sort((first, second) => {
    const firstDay = DAY_ORDER[first.day] || 99;
    const secondDay = DAY_ORDER[second.day] || 99;

    if (firstDay !== secondDay) {
      return firstDay - secondDay;
    }

    return getScheduleArea(first).localeCompare(getScheduleArea(second));
  });
}

function getTodayName() {
  const jsDay = new Date().getDay();
  return DAY_LABELS[(jsDay + 6) % 7] || "Monday";
}

function groupScheduleByDay(entries) {
  return entries.reduce((groups, entry) => {
    const key = entry.day || "Unscheduled";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(entry);
    return groups;
  }, {});
}

function getNextSchedule(entries) {
  if (!entries.length) {
    return null;
  }

  const todayOrder = DAY_ORDER[getTodayName()] || 1;
  const scoredEntries = entries.map((entry) => {
    const entryOrder = DAY_ORDER[entry.day] || 99;
    const distance = entryOrder >= todayOrder ? entryOrder - todayOrder : 7 - (todayOrder - entryOrder);

    return {
      ...entry,
      _distance: distance,
    };
  });

  scoredEntries.sort((first, second) => {
    if (first._distance !== second._distance) {
      return first._distance - second._distance;
    }

    return String(first.timeWindow || "").localeCompare(String(second.timeWindow || ""));
  });

  return scoredEntries[0] || null;
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
    backgroundColor: "#fef3c7",
    color: "#b45309",
  };
}

function getDayTone(day) {
  const normalizedDay = String(day || "").trim();

  if (normalizedDay === getTodayName()) {
    return {
      accent: "#0f766e",
      soft: "#ccfbf1",
      ring: "rgba(15,118,110,0.14)",
    };
  }

  if (normalizedDay === "Saturday" || normalizedDay === "Sunday") {
    return {
      accent: "#7c3aed",
      soft: "#ede9fe",
      ring: "rgba(124,58,237,0.12)",
    };
  }

  return {
    accent: "#2563eb",
    soft: "#dbeafe",
    ring: "rgba(37,99,235,0.12)",
  };
}

export default function ScheduleScreen() {
  const { token, signOut } = useAuth();
  const { colors, isDarkMode } = usePreferences();
  const [schedule, setSchedule] = useState([]);
  const [selectedBarangay, setSelectedBarangay] = useState(ALL_BARANGAYS_FILTER);
  const [isBarangayPickerOpen, setIsBarangayPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const barangayOptions = useMemo(() => {
    const barangayOrder = new Map(PATEROS_BARANGAYS.map((barangay, index) => [barangay, index]));
    const options = Array.from(
      new Set(schedule.map((entry) => getScheduleArea(entry)).filter(Boolean))
    ).sort((first, second) => {
      const firstIndex = barangayOrder.has(first) ? barangayOrder.get(first) : Number.MAX_SAFE_INTEGER;
      const secondIndex = barangayOrder.has(second) ? barangayOrder.get(second) : Number.MAX_SAFE_INTEGER;

      if (firstIndex !== secondIndex) {
        return firstIndex - secondIndex;
      }

      return first.localeCompare(second);
    });

    return [ALL_BARANGAYS_FILTER, ...options];
  }, [schedule]);
  const barangayScheduleCounts = useMemo(
    () =>
      schedule.reduce((counts, entry) => {
        const area = getScheduleArea(entry);

        if (area) {
          counts[area] = (counts[area] || 0) + 1;
        }

        return counts;
      }, {}),
    [schedule]
  );
  const filteredSchedule = useMemo(() => {
    if (selectedBarangay === ALL_BARANGAYS_FILTER) {
      return schedule;
    }

    return schedule.filter((entry) => getScheduleArea(entry) === selectedBarangay);
  }, [schedule, selectedBarangay]);
  const sortedSchedule = useMemo(() => sortSchedule(filteredSchedule), [filteredSchedule]);
  const groupedSchedule = useMemo(() => groupScheduleByDay(sortedSchedule), [sortedSchedule]);
  const nextSchedule = useMemo(() => getNextSchedule(sortedSchedule), [sortedSchedule]);
  const uniqueCoverageCount = useMemo(
    () =>
      new Set(
        sortedSchedule.map((entry) => getScheduleArea(entry)).filter(Boolean)
      ).size,
    [sortedSchedule]
  );
  const todayName = useMemo(() => getTodayName(), []);

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

  useEffect(() => {
    if (!barangayOptions.includes(selectedBarangay)) {
      setSelectedBarangay(ALL_BARANGAYS_FILTER);
    }
  }, [barangayOptions, selectedBarangay]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadSchedule(true)} tintColor="#0f766e" />
      }
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: isDarkMode ? "#102032" : "#eff8f4",
            borderColor: isDarkMode ? colors.borderSoft : "#cfe7dc",
          },
        ]}
      >
        <View style={styles.heroBackdropPrimary} />
        <View style={styles.heroBackdropSecondary} />
        <Text style={[styles.title, { color: isDarkMode ? "#f8fafc" : "#0f172a" }]}>Next pickup</Text>

        <View
          style={[
            styles.nextPickupCard,
            {
              backgroundColor: isDarkMode ? "rgba(15,23,42,0.56)" : "#ffffff",
              borderColor: isDarkMode ? colors.borderSoft : "#d9e8e1",
            },
          ]}
        >
          <View style={styles.nextPickupHeader}>
            <View>
              <Text style={[styles.nextPickupDay, { color: colors.text }]}>
                {nextSchedule ? nextSchedule.day : "No schedule yet"}
              </Text>
            </View>
            <View style={[styles.todayBadge, { backgroundColor: colors.overlay }]}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={[styles.todayBadgeText, { color: colors.primary }]}>Today</Text>
            </View>
          </View>

          <Text style={[styles.nextPickupZone, { color: colors.textSecondary }]}>
            {nextSchedule ? getScheduleArea(nextSchedule) || "Collection route" : "No route yet"}
          </Text>

          <View style={styles.nextPickupMetaRow}>
            <View style={[styles.metaChip, { backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc" }]}>
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <Text style={[styles.metaChipText, { color: colors.text }]}>
                {nextSchedule ? nextSchedule.timeWindow : "Waiting for update"}
              </Text>
            </View>
            {nextSchedule ? (
              <View
                style={[
                  styles.metaChip,
                  {
                    backgroundColor: getWasteTypeTone(nextSchedule.wasteType).backgroundColor,
                  },
                ]}
              >
                <Ionicons name="leaf-outline" size={14} color={getWasteTypeTone(nextSchedule.wasteType).color} />
                <Text style={[styles.metaChipText, { color: getWasteTypeTone(nextSchedule.wasteType).color }]}>
                  {nextSchedule.wasteType}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: isDarkMode ? "rgba(15,23,42,0.56)" : "#ffffff",
                borderColor: isDarkMode ? colors.borderSoft : "#d9e8e1",
              },
            ]}
          >
              <Text style={[styles.statValue, { color: colors.text }]}>{sortedSchedule.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Slots</Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: isDarkMode ? "rgba(15,23,42,0.56)" : "#ffffff",
                borderColor: isDarkMode ? colors.borderSoft : "#d9e8e1",
              },
            ]}
          >
              <Text style={[styles.statValue, { color: colors.text }]}>{uniqueCoverageCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Areas</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading schedule...</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={[styles.errorBanner, { backgroundColor: colors.dangerSoft, color: colors.danger }]}>{errorMessage}</Text>
      ) : null}

      {!loading && !errorMessage && schedule.length > 0 ? (
        <View style={[styles.filterCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Barangay</Text>
          <Pressable
            style={[
              styles.filterSelect,
              {
                backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc",
                borderColor: colors.borderSoft,
              },
            ]}
            onPress={() => setIsBarangayPickerOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel="Select barangay schedule"
          >
            <Text style={[styles.filterSelectText, { color: colors.text }]}>{selectedBarangay}</Text>
            <Ionicons name={isBarangayPickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
          </Pressable>

          {isBarangayPickerOpen ? (
            <View style={[styles.filterDropdown, { borderColor: colors.borderSoft }]}>
              {barangayOptions.map((barangay) => {
                const isSelected = barangay === selectedBarangay;
                const slotCount =
                  barangay === ALL_BARANGAYS_FILTER ? schedule.length : barangayScheduleCounts[barangay] || 0;

                return (
                  <Pressable
                    key={barangay}
                    style={[
                      styles.filterOption,
                      {
                        backgroundColor: isSelected ? colors.overlay : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setSelectedBarangay(barangay);
                      setIsBarangayPickerOpen(false);
                    }}
                  >
                    <View style={styles.filterOptionCopy}>
                      <Text style={[styles.filterOptionText, { color: isSelected ? colors.primary : colors.text }]}>
                        {barangay}
                      </Text>
                      <Text style={[styles.filterOptionMeta, { color: colors.textMuted }]}>
                        {slotCount} {slotCount === 1 ? "slot" : "slots"}
                      </Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {!loading && !errorMessage && sortedSchedule.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <Ionicons name="calendar-clear-outline" size={22} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {schedule.length > 0 ? "No schedule for this barangay yet." : "No schedule yet."}
          </Text>
        </View>
      ) : null}

      {!loading && sortedSchedule.length > 0
        ? Object.entries(groupedSchedule).map(([day, entries]) => {
            const dayTone = getDayTone(day);

            return (
              <View key={day} style={styles.daySection}>
                <View style={styles.daySectionHeader}>
                  <View style={[styles.dayDot, { backgroundColor: dayTone.accent }]} />
                  <Text style={[styles.daySectionTitle, { color: colors.text }]}>{day}</Text>
                  {day === todayName ? (
                    <View style={[styles.liveTag, { backgroundColor: dayTone.soft }]}>
                      <Text style={[styles.liveTagText, { color: dayTone.accent }]}>Today</Text>
                    </View>
                  ) : null}
                </View>

                {entries.map((entry) => {
                  const tone = getWasteTypeTone(entry.wasteType);

                  return (
                    <View
                      key={entry.id || `${entry.day}-${getScheduleArea(entry)}-${entry.timeWindow}`}
                      style={[
                        styles.scheduleCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.borderSoft,
                          shadowColor: dayTone.accent,
                        },
                      ]}
                    >
                      <View style={styles.scheduleAccentWrap}>
                        <View
                          style={[
                            styles.scheduleAccent,
                            {
                              backgroundColor: dayTone.accent,
                              shadowColor: dayTone.accent,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.scheduleCardBody}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderTextWrap}>
                            <Text style={[styles.zoneTextStrong, { color: colors.text }]}>
                              {getScheduleArea(entry) || "Collection route"}
                            </Text>
                          </View>
                          <View style={[styles.typePill, { backgroundColor: tone.backgroundColor }]}>
                            <Text style={[styles.typePillText, { color: tone.color }]}>{entry.wasteType}</Text>
                          </View>
                        </View>

                        <View style={styles.metaStrip}>
                          <View
                            style={[
                              styles.inlineChip,
                              { backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc", borderColor: colors.borderSoft },
                            ]}
                          >
                            <Ionicons name="time-outline" size={15} color={colors.primary} />
                            <Text style={[styles.inlineChipText, { color: colors.text }]}>{entry.timeWindow}</Text>
                          </View>
                        </View>

                        {String(entry.notes || "").trim() ? (
                          <View
                            style={[
                              styles.noteCard,
                              { backgroundColor: isDarkMode ? colors.cardMuted : "#f8fafc", borderColor: colors.borderSoft },
                            ]}
                          >
                            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                            <Text style={[styles.noteText, { color: isDarkMode ? colors.textSecondary : "#475569" }]}>
                              {entry.notes}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
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
    borderWidth: 1,
    borderColor: "#d9e8e1",
    marginBottom: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
    overflow: "hidden",
  },
  heroBackdropPrimary: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -78,
    right: -48,
    backgroundColor: "rgba(52, 211, 153, 0.12)",
  },
  heroBackdropSecondary: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -32,
    left: -20,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
  },
  nextPickupCard: {
    marginTop: 16,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
  },
  nextPickupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nextPickupDay: {
    fontSize: 22,
    fontWeight: "800",
  },
  nextPickupZone: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  nextPickupMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  todayBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  todayBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  metaChipText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    marginTop: 14,
    flexDirection: "row",
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginRight: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
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
  filterCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  filterSelect: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterSelectText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  filterDropdown: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 10,
    overflow: "hidden",
  },
  filterOption: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterOptionCopy: {
    flex: 1,
    paddingRight: 12,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: "800",
  },
  filterOptionMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
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
  daySection: {
    marginBottom: 16,
  },
  daySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  daySectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  liveTag: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveTagText: {
    fontSize: 11,
    fontWeight: "800",
  },
  scheduleCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
    flexDirection: "row",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 3,
  },
  scheduleAccentWrap: {
    width: 22,
    alignItems: "center",
    paddingTop: 2,
  },
  scheduleAccent: {
    width: 8,
    flex: 1,
    minHeight: 92,
    borderRadius: 999,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  scheduleCardBody: {
    flex: 1,
    marginLeft: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  zoneTextStrong: {
    fontSize: 16,
    fontWeight: "800",
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
  metaStrip: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  inlineChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  inlineChipText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  noteText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#64748b",
    flex: 1,
    lineHeight: 18,
  },
  noteCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
});
