import React from "react";
import { Callout, Marker } from "react-native-maps";
import { View, Text, StyleSheet, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getTruckStatusMeta } from "../utils/truckStatus";

function TruckCallout({ truck, statusMeta }) {
  return (
    <Callout tooltip>
      <View style={styles.callout}>
        <View style={styles.calloutHeader}>
          <Text style={styles.title}>{truck.truckId}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusMeta.soft }]}>
            <MaterialCommunityIcons name="truck-fast" size={12} color={statusMeta.color} />
            <Text style={[styles.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          </View>
        </View>
        <Text style={styles.meta}>Latitude: {truck.latitude.toFixed(5)}</Text>
        <Text style={styles.meta}>Longitude: {truck.longitude.toFixed(5)}</Text>
        <Text style={styles.liveText}>Live GPS position</Text>
      </View>
    </Callout>
  );
}

export default function TruckMarker({ truck, markerCoordinate, selected = false, onPress }) {
  const statusMeta = getTruckStatusMeta(truck.status);
  const coordinate = markerCoordinate || {
    latitude: truck.latitude,
    longitude: truck.longitude,
  };

  if (Platform.OS === "android") {
    return (
      <Marker
        coordinate={coordinate}
        pinColor={statusMeta.color}
        zIndex={selected ? 20 : 10}
        tracksViewChanges={false}
        onPress={() => onPress?.(truck)}
        title={truck.truckId}
        description={`${truck.status} | ${truck.latitude.toFixed(4)}, ${truck.longitude.toFixed(4)}`}
      >
        <TruckCallout truck={truck} statusMeta={statusMeta} />
      </Marker>
    );
  }

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -18 }}
      zIndex={selected ? 20 : 10}
      tracksViewChanges
      onPress={() => onPress?.(truck)}
      title={truck.truckId}
      description={`${truck.status} | ${truck.latitude.toFixed(4)}, ${truck.longitude.toFixed(4)}`}
    >
      <View collapsable={false} style={styles.markerShell}>
        <View style={[styles.markerGlow, { backgroundColor: statusMeta.ring }, selected && styles.markerGlowActive]} />

        <View style={[styles.markerBadge, { backgroundColor: statusMeta.color }, selected && styles.markerBadgeActive]}>
          <View style={styles.truckGlyph}>
            <View style={styles.truckTopRow}>
              <View style={styles.truckBody} />
              <View style={styles.truckCabin} />
            </View>
            <View style={styles.truckWheelRow}>
              <View style={styles.truckWheel} />
              <View style={styles.truckWheel} />
            </View>
          </View>
        </View>

        <View style={[styles.pointer, { borderTopColor: statusMeta.color }]} />

        <View style={[styles.labelBubble, selected && styles.labelBubbleActive]}>
          <Text style={styles.labelText}>{truck.truckId}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
        </View>
      </View>

      <TruckCallout truck={truck} statusMeta={statusMeta} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  markerShell: {
    alignItems: "center",
  },
  markerGlow: {
    position: "absolute",
    top: 2,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  markerGlowActive: {
    transform: [{ scale: 1.08 }],
  },
  markerBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 8,
  },
  markerBadgeActive: {
    transform: [{ scale: 1.08 }],
  },
  truckGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  truckTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  truckBody: {
    width: 18,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#ffffff",
    marginRight: 2,
  },
  truckCabin: {
    width: 7,
    height: 8,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: "#ffffff",
  },
  truckWheelRow: {
    marginTop: 2,
    width: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  truckWheel: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0f172a",
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2,
  },
  labelBubble: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.98)",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 5,
  },
  labelBubbleActive: {
    backgroundColor: "#ffffff",
  },
  labelText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  callout: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 220,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 6,
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 5,
  },
  meta: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 3,
  },
  liveText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
});