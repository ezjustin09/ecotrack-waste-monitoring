import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

export function createTruckSocket() {
  return io(API_BASE_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ["polling", "websocket"],
  });
}
