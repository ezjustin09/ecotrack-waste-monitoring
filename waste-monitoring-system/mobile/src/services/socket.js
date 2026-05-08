import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

export function createTruckSocket(token = "") {
  return io(API_BASE_URL, {
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ["polling", "websocket"],
  });
}
