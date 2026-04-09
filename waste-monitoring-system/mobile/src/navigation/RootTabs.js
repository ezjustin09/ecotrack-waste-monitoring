import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
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

export default function RootTabs({ onSignOut, user }) {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = usePreferences();
  const isDriver = user?.role === "driver";
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + tabBarBottomPadding;
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  return (
    <>
      <Tab.Navigator
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
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarHideOnKeyboard: true,
          tabBarStyle: [
            styles.tabBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.borderSoft,
              height: tabBarHeight,
              paddingBottom: tabBarBottomPadding,
            },
          ],
          tabBarIcon: ({ color, size }) => <Ionicons name={iconMap[route.name]} size={size} color={color} />,
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
  tabBar: {
    paddingTop: 8,
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
