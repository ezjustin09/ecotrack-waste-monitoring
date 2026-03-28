export const TRUCK_STATUS_META = {
  Collecting: {
    color: "#0f766e",
    soft: "#d1fae5",
    ring: "rgba(15,118,110,0.18)",
    icon: "delete-outline",
    label: "Collecting",
  },
  "On Route": {
    color: "#2563eb",
    soft: "#dbeafe",
    ring: "rgba(37,99,235,0.18)",
    icon: "navigation-outline",
    label: "On Route",
  },
  Disposing: {
    color: "#ea580c",
    soft: "#ffedd5",
    ring: "rgba(234,88,12,0.18)",
    icon: "archive-outline",
    label: "Disposing",
  },
  Idle: {
    color: "#64748b",
    soft: "#e2e8f0",
    ring: "rgba(100,116,139,0.18)",
    icon: "pause-outline",
    label: "Idle",
  },
};

export function getTruckStatusMeta(status) {
  return TRUCK_STATUS_META[status] || {
    color: "#0f766e",
    soft: "#d1fae5",
    ring: "rgba(15,118,110,0.18)",
    icon: "location-outline",
    label: status || "Unknown",
  };
}
