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
  const indicatorTranslateX = useRef(new Animated.Value(5)).current;
  const routeCount = Math.max(state.routes.length, 1);
  const barWidth = Math.min(width - 24, 480);
  const itemWidth = barWidth / routeCount;
  const indicatorWidth = Math.max(itemWidth - 10, 0);
  const indicatorScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(indicatorScale, {
        toValue: 0.92,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(indicatorTranslateX, {
        toValue: state.index * itemWidth + 5,
        useNativeDriver: true,
        friction: 9,
        tension: 110,
      }),
      Animated.spring(indicatorScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 120,
      }),
    ]).start();
  }, [indicatorScale, indicatorTranslateX, itemWidth, state.index]);

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
              transform: [{ translateX: indicatorTranslateX }, { scale: indicatorScale }],
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
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

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
              onPress={() => setIsSettingsVisible(true)}
              style={[styles.settingsButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
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
              style={[styles.settingsButton, { backgroundColor: colors.overlay }]}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close-outline" size={20} color={colors.text} />
            </Pressable>
          </View>
          <SettingsScreen />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    marginRight: 16,
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 24,
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
