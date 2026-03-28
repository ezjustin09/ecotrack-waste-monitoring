const { io } = require("socket.io-client");

const SERVER_URL = process.env.SERVER_URL || "http://127.0.0.1:4000";
const truckId = process.argv[2] || "TRUCK-LIVE";
const intervalMs = 5000;

const route = [
  { latitude: 14.5448, longitude: 121.0687 },
  { latitude: 14.5454, longitude: 121.0694 },
  { latitude: 14.5462, longitude: 121.0702 },
  { latitude: 14.5470, longitude: 121.0710 },
  { latitude: 14.5475, longitude: 121.0718 },
  { latitude: 14.5468, longitude: 121.0726 },
  { latitude: 14.5459, longitude: 121.0720 },
  { latitude: 14.5451, longitude: 121.0709 },
];

const statuses = ["Collecting", "On Route", "Disposing"];
let routeIndex = 0;
let timerId = null;

const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

function sendUpdate() {
  const coordinate = route[routeIndex];
  const payload = {
    truckId,
    status: statuses[routeIndex % statuses.length],
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };

  socket.emit("truck:update", payload, (response) => {
    if (response?.ok) {
      console.log(
        `[${new Date().toISOString()}] ${truckId} -> ${payload.latitude}, ${payload.longitude} (${payload.status})`
      );
    } else {
      console.error("Update rejected:", response?.error || "Unknown error");
    }
  });

  routeIndex = (routeIndex + 1) % route.length;
}

function startSimulation() {
  if (timerId) {
    clearInterval(timerId);
  }

  sendUpdate();
  timerId = setInterval(sendUpdate, intervalMs);
}

socket.on("connect", () => {
  console.log(`Simulator connected to ${SERVER_URL} as ${truckId}`);
  startSimulation();
});

socket.on("disconnect", (reason) => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  console.log(`Simulator disconnected (${reason}). Waiting to reconnect...`);
});

socket.on("connect_error", (error) => {
  console.error(`Unable to connect to backend at ${SERVER_URL}: ${error.message}`);
});

process.on("SIGINT", () => {
  if (timerId) {
    clearInterval(timerId);
  }
  console.log("\nSimulator stopped.");
  socket.disconnect();
  process.exit(0);
});
