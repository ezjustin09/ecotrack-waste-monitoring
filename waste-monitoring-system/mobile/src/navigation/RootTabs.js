import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "../screens/HomeScreen";
import MapScreen from "../screens/MapScreen";
import DriverScreen from "../screens/DriverScreen";
import ReportScreen from "../screens/ReportScreen";
import ScheduleScreen from "../screens/ScheduleScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { usePreferences } from "../context/PreferencesContext";

const Tab = createBottomTabNavigator();

const iconMap = {
  Home: "home",
  "Live Map": "map",
  "Driver GPS": "navigate",
  Schedule: "calendar",
  Report: "warning",
};

function getTabLabel(route, descriptor) {
  const tabBarLabel = descriptor?.options?.tabBarLabel;

  if (typeof tabBarLabel === "string") {
    return tabBarLabel;
  }

  if (typeof descriptor?.options?.title === "string") {
    return descriptor.options.title;
  }

  return route.name;
}

function AnimatedTabItem({
  label,
  iconName,
  focused,
  colors,
  isDarkMode,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const activeBubbleScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [focused, progress]);

  const iconTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const labelOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const labelTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const inactiveIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const activeIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.tabItem}
    >
      <Animated.View
        style={[
          styles.activeIconBubble,
          {
            backgroundColor: colors.primary,
            borderColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
            opacity: activeIconOpacity,
            transform: [{ translateY: iconTranslateY }, { scale: Animated.multiply(iconScale, activeBubbleScale) }],
          },
        ]}
      >
        <Ionicons name={iconName} size={20} color="#ffffff" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.inactiveIconShell,
          {
            opacity: inactiveIconOpacity,
            transform: [{ translateY: iconTranslateY }, { scale: iconScale }],
          },
        ]}
      >
        <Ionicons name={iconName} size={21} color={colors.textMuted} />
      </Animated.View>
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            color: focused ? colors.primary : colors.textMuted,
            opacity: labelOpacity,
            transform: [{ translateY: labelTranslateY }],
          },
        ]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

function AnimatedTabBar({ state, descriptors, navigation, colors, isDarkMode, tabBarBottomPadding }) {
  const { width } = useWindowDimensions();
  const routeCount = Math.max(state.routes.length, 1);
  const barWidth = Math.min(width - 24, 480);
  const itemWidth = barWidth / routeCount;
  const indicatorInset = 10;
  const indicatorWidth = Math.max(itemWidth - indicatorInset * 2, 0);
  const indicatorTranslateX = useRef(new Animated.Value(state.index * itemWidth + indicatorInset)).current;

  useEffect(() => {
    Animated.spring(indicatorTranslateX, {
      toValue: state.index * itemWidth + indicatorInset,
      useNativeDriver: true,
      friction: 10,
      tension: 140,
    }).start();
  }, [indicatorInset, indicatorTranslateX, itemWidth, state.index]);

  return (
    <View style={[styles.tabBarShell, { paddingBottom: tabBarBottomPadding, backgroundColor: colors.background }]}>
      <View
        style={[
          styles.tabBarFrame,
          {
            width: barWidth,
            backgroundColor: isDarkMode ? "#0f172a" : colors.card,
            borderColor: isDarkMode ? colors.borderSoft : "rgba(15, 23, 42, 0.06)",
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeTabBackdrop,
            {
              width: indicatorWidth,
              transform: [{ translateX: indicatorTranslateX }],
              backgroundColor: isDarkMode ? "rgba(52, 211, 153, 0.14)" : colors.overlay,
              borderColor: isDarkMode ? "rgba(52, 211, 153, 0.22)" : "rgba(15, 118, 110, 0.08)",
            },
          ]}
        />

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const descriptor = descriptors[route.key];
          const label = getTabLabel(route, descriptor);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <AnimatedTabItem
              key={route.key}
              label={label}
              iconName={iconMap[route.name]}
              focused={focused}
              colors={colors}
              isDarkMode={isDarkMode}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              testID={descriptor.options.tabBarButtonTestID}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function RootTabs({ onSignOut, user }) {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = usePreferences();
  const isDriver = user?.role === "driver";
  const tabBarBottomPadding = Math.max(insets.bottom, 10);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const displayName = String(user?.name || user?.email || "Resident User").trim();
  const displayEmail = String(user?.email || "No email available").trim();
  const profileInitial = displayName.charAt(0).toUpperCase() || "R";
  const roleLabel = isDriver ? "Driver" : "Resident";

  function openSettingsFromMenu() {
    setIsMenuVisible(false);
    setIsSettingsVisible(true);
  }

  function openProfileFromMenu() {
    setIsMenuVisible(false);
    setIsProfileVisible(true);
  }

  function handleMenuSignOut() {
    setIsMenuVisible(false);
    setIsProfileVisible(false);
    setIsSettingsVisible(false);
    onSignOut?.();
  }

  return (
    <>
      <Tab.Navigator
        tabBar={(props) => (
          <AnimatedTabBar
            {...props}
            colors={colors}
            isDarkMode={isDarkMode}
            tabBarBottomPadding={tabBarBottomPadding}
          />
        )}
        screenOptions={({ route }) => ({
          sceneStyle: {
            backgroundColor: colors.background,
          },
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "700",
            color: colors.text,
          },
          headerRight: () => (
            <Pressable
              onPress={() => setIsMenuVisible(true)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu-outline" size={24} color={colors.primary} />
            </Pressable>
          ),
          headerShadowVisible: !isDarkMode,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: false,
        })}
      >
        {isDriver ? (
          <>
            <Tab.Screen name="Driver GPS" component={DriverScreen} />
          </>
        ) : (
          <>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Live Map" component={MapScreen} />
            <Tab.Screen name="Schedule" component={ScheduleScreen} />
            <Tab.Screen name="Report" component={ReportScreen} />
          </>
        )}
      </Tab.Navigator>

      <Modal
        visible={isMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setIsMenuVisible(false)}>
          <View
            style={[
              styles.menuCard,
              {
                top: Math.max(insets.top, 12) + 46,
                backgroundColor: colors.card,
                borderColor: colors.borderSoft,
              },
            ]}
          >
            <View style={styles.menuProfileRow}>
              <View style={[styles.profileAvatarSmall, { backgroundColor: colors.primary }]}>
                <Text style={styles.profileAvatarTextSmall}>{profileInitial}</Text>
              </View>
              <View style={styles.menuProfileText}>
                <Text style={[styles.menuProfileName, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={[styles.menuProfileRole, { color: colors.textMuted }]}>{roleLabel}</Text>
              </View>
            </View>

            <Pressable style={styles.menuItem} onPress={openProfileFromMenu}>
              <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Profile</Text>
            </Pressable>

            <Pressable style={styles.menuItem} onPress={openSettingsFromMenu}>
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Settings</Text>
            </Pressable>

            <Pressable style={[styles.menuItem, styles.menuDangerItem]} onPress={handleMenuSignOut}>
              <Ionicons name="log-out-outline" size={22} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: "#ef4444" }]}>Log out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={isProfileVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsProfileVisible(false)}
      >
        <View
          style={[
            styles.profileModal,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
        >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.settingsTitle, { color: colors.text }]}>Profile</Text>
            <Pressable
              onPress={() => setIsProfileVisible(false)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Close profile"
            >
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
            <View style={[styles.profileAvatarLarge, { backgroundColor: colors.primary }]}>
              <Text style={styles.profileAvatarTextLarge}>{profileInitial}</Text>
            </View>
            <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{displayEmail}</Text>
            <View style={[styles.profileBadge, { backgroundColor: colors.overlay }]}>
              <Ionicons name={isDriver ? "navigate-outline" : "person-outline"} size={16} color={colors.primary} />
              <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{roleLabel}</Text>
            </View>
          </View>

          <View style={[styles.profileDetailsCard, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
            <View style={styles.profileDetailRow}>
              <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>User ID</Text>
              <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user?.id || "-"}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Account Type</Text>
              <Text style={[styles.profileDetailValue, { color: colors.text }]}>{roleLabel}</Text>
            </View>
            {user?.truckId ? (
              <View style={styles.profileDetailRow}>
                <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Truck ID</Text>
                <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user.truckId}</Text>
              </View>
            ) : null}
            {user?.authProvider ? (
              <View style={styles.profileDetailRow}>
                <Text style={[styles.profileDetailLabel, { color: colors.textMuted }]}>Login Method</Text>
                <Text style={[styles.profileDetailValue, { color: colors.text }]}>{user.authProvider}</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={styles.profileSignOutButton} onPress={handleMenuSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#ffffff" />
            <Text style={styles.profileSignOutText}>Log out</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={isSettingsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsSettingsVisible(false)}
      >
        <View
          style={[
            styles.settingsModal,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(insets.top, 12),
            },
          ]}
        >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.settingsTitle, { color: colors.text }]}>Settings</Text>
            <Pressable
              onPress={() => setIsSettingsVisible(false)}
              style={[styles.headerMenuButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
          <SettingsScreen />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerMenuButton: {
    marginRight: 16,
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  menuCard: {
    position: "absolute",
    right: 14,
    width: 238,
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 14,
  },
  menuProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    marginBottom: 4,
  },
  profileAvatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarTextSmall: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  menuProfileText: {
    flex: 1,
  },
  menuProfileName: {
    fontSize: 14,
    fontWeight: "800",
  },
  menuProfileRole: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  menuItem: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  menuDangerItem: {
    marginTop: 2,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "800",
  },
  profileModal: {
    flex: 1,
    paddingHorizontal: 18,
  },
  profileCard: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    marginTop: 18,
  },
  profileAvatarLarge: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  profileAvatarTextLarge: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  profileEmail: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  profileBadge: {
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  profileBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  profileDetailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginTop: 14,
  },
  profileDetailRow: {
    gap: 4,
    paddingVertical: 10,
  },
  profileDetailLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  profileDetailValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  profileSignOutButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  profileSignOutText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  tabBarShell: {
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  tabBarFrame: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 12,
  },
  activeTabBackdrop: {
    position: "absolute",
    top: 8,
    bottom: 10,
    left: 0,
    borderRadius: 22,
    borderWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 68,
    zIndex: 1,
  },
  activeIconBubble: {
    position: "absolute",
    top: 6,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 8,
  },
  inactiveIconShell: {
    position: "absolute",
    top: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 34,
  },
  settingsModal: {
    flex: 1,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
});
