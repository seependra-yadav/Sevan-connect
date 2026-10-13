
require("dotenv").config();

const express = require("express");
const http = require("http");
const os = require("node:os");
const path = require("node:path");
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
const allowedOrigins = new Set(DASHBOARD_ORIGINS);
if (process.env.RENDER_EXTERNAL_HOSTNAME) {
  allowedOrigins.add(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
}

if (!PAIRING_CODE || PAIRING_CODE.length < 6) {
  throw new Error("Configure a private PAIRING_CODE in server/.env");
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
}));
app.use(express.json());

const io = new Server(server, {
  maxHttpBufferSize: 2_000_000,
  cors: {
    origin: [...allowedOrigins],
    methods: ["GET", "POST"],
  },
});

// Device presence is in memory and is restored as clients reconnect.
const devices = new Map();
const deviceData = new Map();
const failedPairings = new Map();
const DIST_DIR = path.resolve(__dirname, "../dist");
let currentOffer = {
  title: "No offer right now",
  description: "Please check back later.",
  linkUrl: "",
  buttonLabel: "",
  updatedAt: null,
};

function normalizeOffer(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Offer details are required.");
  const title = String(payload.title || "").trim().slice(0, 100);
  const description = String(payload.description || "").trim().slice(0, 500);
  const linkUrl = String(payload.linkUrl || "").trim().slice(0, 2048);
  const buttonLabel = String(payload.buttonLabel || "View offer").trim().slice(0, 40);
  if (!title || !description) throw new Error("Enter an offer title and description.");
  if (!linkUrl) throw new Error("Enter an HTTPS offer link.");

  let parsedLink;
  try {
    parsedLink = new URL(linkUrl);
  } catch {
    throw new Error("Enter a valid HTTPS offer link.");
  }
  if (parsedLink.protocol !== "https:" || parsedLink.username || parsedLink.password) {
    throw new Error("Offer links must use HTTPS and cannot include embedded credentials.");
  }

  return { title, description, linkUrl: parsedLink.toString(), buttonLabel: buttonLabel || "View offer", updatedAt: new Date().toISOString() };
}

function isPairingBlocked(address) {
  const record = failedPairings.get(address);
  if (!record) return false;
  if (Date.now() >= record.blockedUntil && record.blockedUntil) {
    failedPairings.delete(address);
    return false;
  }
  return Boolean(record.blockedUntil);
}

function recordPairingFailure(address) {
  const now = Date.now();
  const current = failedPairings.get(address);
  const withinWindow = current && now - current.windowStartedAt < 10 * 60_000;
  const failures = (withinWindow ? current.failures : 0) + 1;
  failedPairings.set(address, {
    failures,
    windowStartedAt: withinWindow ? current.windowStartedAt : now,
    blockedUntil: failures >= 8 ? now + 10 * 60_000 : 0,
  });
}

app.get("/api/health", (req, res) => {
  res.json({
    app: "Sevan Connect",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Offer content is public marketing information; private device data remains
// available only through an authenticated dashboard socket.
app.get("/api/offer", (req, res) => {
  res.set("Cache-Control", "no-store").json(currentOffer);
});

app.get("/downloads/Sevan-Connect.apk", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.download(
    path.join(DIST_DIR, "downloads", "Sevan-Connect.apk"),
    "Sevan-Connect.apk",
    { headers: { "Content-Type": "application/vnd.android.package-archive" } },
    (error) => {
      if (error && !res.headersSent) next(error);
    }
  );
});

// In production the dashboard, REST health endpoint and sockets share the
// same public HTTPS origin. Vite continues serving the dashboard in dev.
app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res, next) => {
  res.sendFile(path.join(DIST_DIR, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.message === "Origin is not allowed") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  console.error("Request failed:", error.message);
  return res.status(500).json({ error: "Internal server error" });
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

function cleanRecords(records, fields, limit, fieldLimit) {
  if (!Array.isArray(records)) return [];
  return records.slice(0, limit).map((record) => {
    const clean = {};
    for (const field of fields) {
      const value = record?.[field];
      if (typeof value === "string") clean[field] = value.slice(0, fieldLimit);
      else if (typeof value === "number" && Number.isFinite(value)) clean[field] = value;
    }
    return clean;
  });
}

function normalizeDeviceData(payload) {
  const data = {
    updatedAt: new Date().toISOString(),
    contacts: cleanRecords(payload?.contacts, ["name", "phone", "email"], 300, 240),
    messages: cleanRecords(payload?.messages, ["address", "body", "date", "type"], 150, 800),
    calls: cleanRecords(payload?.calls, ["number", "date", "duration", "type"], 150, 240),
    notifications: cleanRecords(payload?.notifications, ["app", "title", "text", "postedAt"], 100, 500),
    files: cleanRecords(payload?.files, ["name", "mimeType", "size", "dataUrl"], 40, 300_000),
    photos: cleanRecords(payload?.photos, ["name", "mimeType", "size", "dataUrl"], 30, 300_000),
    access: cleanRecords(payload?.access, ["category", "status", "message"], 10, 160),
  };
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > 1_800_000) {
    throw new Error("The shared data snapshot is too large. Select fewer files or photos.");
  }
  return data;
}

io.use((socket, next) => {
  const remoteAddress = socket.handshake.address || "unknown";
  const { pairingCode, role } = socket.handshake.auth || {};

  if (!["dashboard", "device"].includes(role)) {
    return next(new Error("Invalid client role"));
  }

  // Only the dashboard receives device lists, and it must prove the admin
  // secret. Phone companions register only their own consented details.
  if (role === "dashboard") {
    if (isPairingBlocked(remoteAddress)) {
      return next(new Error("Too many failed pairing attempts. Try again in 10 minutes."));
    }
    if (typeof pairingCode !== "string" || pairingCode !== PAIRING_CODE) {
      recordPairingFailure(remoteAddress);
      return next(new Error("Invalid pairing code"));
    }
    failedPairings.delete(remoteAddress);
  }

  socket.data.role = role;
  next();
});

io.on("connection", (socket) => {
  if (socket.data.role === "dashboard") {
    socket.join("dashboards");
    socket.emit("device:list", publicDeviceList());
    socket.emit("device:data:list", [...deviceData.entries()].map(([deviceId, data]) => ({ deviceId, ...data })));
    socket.emit("offer:current", currentOffer);
    socket.on("offer:update", (payload, callback) => {
      try {
        currentOffer = normalizeOffer(payload);
        io.to("devices").emit("offer:update", currentOffer);
        socket.emit("offer:current", currentOffer);
        callback?.({ ok: true, offer: currentOffer });
      } catch (error) {
        callback?.({ ok: false, error: error.message });
      }
    });
    return;
  }

  console.log("A device companion connected.");
  socket.join("devices");
  socket.emit("offer:current", currentOffer);

  socket.on("device:register", (payload, callback) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.userConsented !== true) {
      callback?.({ ok: false, error: "Device owner consent is required." });
      return;
    }

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
    socket.data.userConsented = true;
    broadcastDevices();
    callback?.({ ok: true });
  });

  socket.on("device:data:update", (payload, callback) => {
    const deviceId = socket.data.deviceId;
    const device = deviceId && devices.get(deviceId);
    if (!socket.data.userConsented || !device || device.socketId !== socket.id || payload?.userConsented !== true) {
      callback?.({ ok: false, error: "The phone owner must approve sharing before sending data." });
      return;
    }
    try {
      const data = normalizeDeviceData(payload);
      deviceData.set(deviceId, data);
      io.to("dashboards").emit("device:data:update", { deviceId, ...data });
      callback?.({ ok: true, updatedAt: data.updatedAt });
    } catch (error) {
      callback?.({ ok: false, error: error.message });
    }
  });

  socket.on("device:unregister", (callback) => {
    const deviceId = socket.data.deviceId;
    if (!deviceId) {
      callback?.({ ok: true });
      return;
    }

    const device = devices.get(deviceId);
    if (device?.socketId === socket.id) {
      devices.delete(deviceId);
      deviceData.delete(deviceId);
      broadcastDevices();
      io.to("dashboards").emit("device:data:remove", { deviceId });
    }
    delete socket.data.deviceId;
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
      deviceData.delete(deviceId);
      io.to("dashboards").emit("device:data:remove", { deviceId });
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
