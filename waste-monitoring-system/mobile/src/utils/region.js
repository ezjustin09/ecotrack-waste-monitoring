const DEFAULT_REGION = {
  latitude: 14.5448,
  longitude: 121.0687,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export function buildMapRegion(trucks = [], userLocation = null) {
  const coordinates = [
    ...trucks.map((truck) => ({
      latitude: truck.latitude,
      longitude: truck.longitude,
    })),
    ...(userLocation ? [userLocation] : []),
  ];

  if (coordinates.length === 0) {
    return DEFAULT_REGION;
  }

  const latitudes = coordinates.map((item) => item.latitude);
  const longitudes = coordinates.map((item) => item.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.02),
  };
}
