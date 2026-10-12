
require("dotenv").config();

const express = require("express");
const http = require("http");
const os = require("node:os");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 4000;
const PAIRING_CODE = process.env.PAIRING_CODE;
const DASHBOARD_ORIGINS = (process.env.DASHBOARD_ORIGINS || "http://localhost:5173,http://localhost:4173,http://localhost,https://localhost,capacitor://localhost")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!PAIRING_CODE || PAIRING_CODE.length < 6) {
  throw new Error("Configure a private PAIRING_CODE in server/.env");
}

app.use(helmet());
app.use(cors({ origin: DASHBOARD_ORIGINS }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: DASHBOARD_ORIGINS,
  methods: ["GET", "POST"],
},
});

// Development storage only. Devices reset when the server restarts.
const devices = new Map();

app.get("/api/health", (req, res) => {
  res.json({
    app: "Sevan Connect",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

function publicDeviceList() {
  return [...devices.values()].map((device) =>
    Object.fromEntries(
      Object.entries(device).filter(([key]) => key !== "socketId")
    )
  );
}

function broadcastDevices() {
  io.to("dashboards").emit("device:list", publicDeviceList());
}

io.use((socket, next) => {
  const { pairingCode, role } = socket.handshake.auth || {};

  if (pairingCode !== PAIRING_CODE) {
    return next(new Error("Invalid pairing code"));
  }

  if (!["dashboard", "device"].includes(role)) {
    return next(new Error("Invalid client role"));
  }

  socket.data.role = role;
  next();
});

io.on("connection", (socket) => {
  if (socket.data.role === "dashboard") {
    socket.join("dashboards");
    socket.emit("device:list", publicDeviceList());
    return;
  }

  console.log("An authenticated device client connected.");

  socket.on("device:register", (payload, callback) => {
    if (!payload || typeof payload !== "object") return;

    const deviceId = String(payload.deviceId || "").slice(0, 100);
    const name = String(payload.name || "Android device").slice(0, 80);
    const model = String(payload.model || "Unknown").slice(0, 100);
    const manufacturer = String(payload.manufacturer || "Unknown").slice(0, 80);
    const osVersion = String(payload.osVersion || "Unknown").slice(0, 40);
    const batteryLevel = Number(payload.batteryLevel);
    const isCharging = payload.isCharging;

    if (!deviceId) {
      callback?.({ ok: false, error: "deviceId is required" });
      return;
    }

    const safeBattery =
      Number.isFinite(batteryLevel) &&
      batteryLevel >= 0 &&
      batteryLevel <= 100
        ? batteryLevel
        : null;

    // A new connection replaces the old connection for the same device.
    const existing = devices.get(deviceId);

    if (existing && existing.socketId !== socket.id) {
      io.sockets.sockets.get(existing.socketId)?.disconnect(true);
    }

    devices.set(deviceId, {
      deviceId,
      name,
      model,
      manufacturer,
      osVersion,
      batteryLevel: safeBattery,
      isCharging: typeof isCharging === "boolean" ? isCharging : null,
      status: "Online",
      lastSeen: new Date().toISOString(),
      socketId: socket.id,
    });

    socket.data.deviceId = deviceId;
    broadcastDevices();
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const deviceId = socket.data.deviceId;
    if (!deviceId) return;

    const device = devices.get(deviceId);

    // Don't mark a newer connection offline if an older one disconnects.
    if (device?.socketId === socket.id) {
      devices.set(deviceId, {
        ...device,
        status: "Offline",
        lastSeen: new Date().toISOString(),
        socketId: null,
      });

      broadcastDevices();
    }
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Sevan Connect is already running on port ${PORT}; stop the other instance before starting another.`);
    process.exit(0);
  }

  console.error("Sevan Connect could not start:", error);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sevan Connect server running on port ${PORT}`);
  const lanAddresses = Object.entries(os.networkInterfaces())
    .flatMap(([name, interfaces]) => (interfaces || []).map((address) => ({ name, ...address })))
    .filter((address) => address.family === "IPv4" && !address.internal)
    .sort((a, b) => Number(/wi.?fi|wireless/i.test(b.name)) - Number(/wi.?fi|wireless/i.test(a.name)));
  if (lanAddresses.length) {
    console.log(`Same-Wi-Fi phone address candidates: ${lanAddresses.map(({ name, address }) => `${name}: http://${address}:${PORT}`).join(" | ")}`);
  }
});
