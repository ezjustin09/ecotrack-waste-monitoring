import React from "react";
import { Callout, Marker } from "react-native-maps";
import { Image, View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getTruckStatusMeta } from "../utils/truckStatus";

const truckMarkerIcon = require("../../assets/truck-marker.png");

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

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: selected ? -28 : -25 }}
      zIndex={selected ? 20 : 10}
      tracksViewChanges={false}
      onPress={() => onPress?.(truck)}
      title={truck.truckId}
      description={`${truck.status} | ${truck.latitude.toFixed(4)}, ${truck.longitude.toFixed(4)}`}
    >
      <Image
        source={truckMarkerIcon}
        style={[styles.markerImage, selected ? styles.markerImageSelected : null]}
        resizeMode="contain"
      />
      <TruckCallout truck={truck} statusMeta={statusMeta} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  markerImage: {
    width: 68,
    height: 68,
  },
  markerImageSelected: {
    width: 74,
    height: 74,
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
