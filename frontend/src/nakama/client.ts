import { Client } from "@heroiclabs/nakama-js";

// useSSL false for local dev — true in production
// host and port match your Docker Compose ports
export const nakamaClient = new Client(
  "defaultkey", // server key — must match Nakama config
  "localhost", // host
  "7350", // port
  false, // useSSL — false for local dev
);

// Generates or retrieves a persistent device ID
// Stored in localStorage so the same player identity
// is used across browser sessions on the same device
export function getDeviceId(): string {
  const key = "nakama_device_id";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    // Generate a random ID — in production you'd use a more robust UUID
    deviceId = "device-" + Math.random().toString(36).substring(2);
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}
