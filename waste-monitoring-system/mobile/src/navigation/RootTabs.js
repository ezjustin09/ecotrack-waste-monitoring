import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import MapScreen from "../screens/MapScreen";
import DriverScreen from "../screens/DriverScreen";
import ReportScreen from "../screens/ReportScreen";
import ScheduleScreen from "../screens/ScheduleScreen";

const Tab = createBottomTabNavigator();

const iconMap = {
  Home: "home",
  "Live Map": "map",
  "Driver GPS": "navigate",
  Schedule: "calendar",
  Report: "warning",
};

export default function RootTabs({ onSignOut, user }) {
  const isDriver = user?.role === "driver";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: "#ffffff",
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: "700",
          color: "#0f172a",
        },
        headerRight: () => (
          <Pressable onPress={onSignOut} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        ),
        tabBarActiveTintColor: "#0f766e",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarIcon: ({ color, size }) => <Ionicons name={iconMap[route.name]} size={size} color={color} />,
      })}
    >
      {isDriver ? (
        <Tab.Screen name="Driver GPS" component={DriverScreen} />
      ) : (
        <>
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Live Map" component={MapScreen} />
          <Tab.Screen name="Schedule" component={ScheduleScreen} />
          <Tab.Screen name="Report" component={ReportScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    marginRight: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ecfeff",
  },
  logoutText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
  },
});
