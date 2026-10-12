import { useEffect, useRef, useState } from "react";
import { Device } from "@capacitor/device";
import { io } from "socket.io-client";

const PAIRING_KEY = "sevan.pairingCode";
const SERVER_KEY = "sevan.serverUrl";

function isPrivateNetworkHost(host) {
  if (host === "localhost" || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    parts[0] === 192 && parts[1] === 168 ||
    parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 ||
    parts[0] === 169 && parts[1] === 254;
}

export default function AndroidCompanion() {
  const [serverUrl, setServerUrl] = useState(() =>
    import.meta.env.VITE_SERVER_URL || localStorage.getItem(SERVER_KEY) || ""
  );
  const [pairingCode, setPairingCode] = useState(() =>
    localStorage.getItem(PAIRING_KEY) || ""
  );
  const [sharingConsent, setSharingConsent] = useState(() =>
    Boolean(localStorage.getItem(PAIRING_KEY))
  );
  const [rememberDevice, setRememberDevice] = useState(() =>
    Boolean(localStorage.getItem(PAIRING_KEY))
  );
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [batteryInfo, setBatteryInfo] = useState(null);
  const [status, setStatus] = useState("Preparing device details…");
  const [error, setError] = useState("");
  const socketRef = useRef(null);
  const updateTimerRef = useRef(null);
  const connectRef = useRef(null);

  async function sendDeviceDetails(socket, info, id) {
    try {
      const battery = await Device.getBatteryInfo();
      setBatteryInfo(battery);
      socket.emit("device:register", {
        deviceId: id.identifier,
        name: info.name || "My Android Phone",
        model: info.model || "Android device",
        manufacturer: info.manufacturer || "Unknown",
        osVersion: info.osVersion || "Unknown",
        batteryLevel: battery.batteryLevel == null
          ? null
          : Math.round(battery.batteryLevel * 100),
        isCharging: battery.isCharging ?? null,
      }, (result) => {
        if (result?.ok) {
          setStatus("Connected to your dashboard");
          setError("");
        } else {
          setStatus("Pairing failed");
          setError(result?.error || "Device registration failed.");
        }
      });
    } catch (deviceError) {
      setStatus("Connected; battery details unavailable");
      setError(deviceError.message || "Could not read battery information.");
    }
  }

  async function connectToServer(rawServerUrl, rawPairingCode, remember) {
    const normalizedServerUrl = rawServerUrl.trim().replace(/\/+$/, "");
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedServerUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Use an HTTP or HTTPS server URL.");
      }
      if (parsedUrl.protocol === "http:" && !isPrivateNetworkHost(parsedUrl.hostname)) {
        throw new Error("HTTP is allowed only for a private same-Wi-Fi server. Use HTTPS for public servers.");
      }
      if (!rawPairingCode.trim()) throw new Error("Enter your server pairing code.");
    } catch (validationError) {
      setStatus("Pairing required");
      setError(validationError.message || "Enter a valid server URL.");
      return;
    }

    setError("");
    setStatus("Connecting…");
    socketRef.current?.disconnect();

    try {
      localStorage.setItem(SERVER_KEY, normalizedServerUrl);
      if (remember && sharingConsent) localStorage.setItem(PAIRING_KEY, rawPairingCode.trim());
      else localStorage.removeItem(PAIRING_KEY);

      const [info, id] = await Promise.all([Device.getInfo(), Device.getId()]);
      setDeviceInfo(info);
      const socket = io(normalizedServerUrl, {
        autoConnect: false,
        auth: { pairingCode: rawPairingCode.trim(), role: "device" },
        reconnection: true,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        void sendDeviceDetails(socket, info, id);
        window.clearInterval(updateTimerRef.current);
        updateTimerRef.current = window.setInterval(
          () => void sendDeviceDetails(socket, info, id),
          30000
        );
      });
      socket.on("connect_error", (connectionError) => {
        setStatus("Connection failed");
        setError(connectionError.message || "Could not connect to the server.");
      });
      socket.on("disconnect", () => {
        window.clearInterval(updateTimerRef.current);
        setStatus("Disconnected; reconnecting…");
      });
      socket.connect();
    } catch (connectionError) {
      setStatus("Connection failed");
      setError(connectionError.message || "Unable to read device information.");
    }
  }

  useEffect(() => {
    connectRef.current = connectToServer;
  });

  useEffect(() => {
    let active = true;
    Promise.all([Device.getInfo(), Device.getBatteryInfo()])
      .then(([info, battery]) => {
        if (!active) return;
        setDeviceInfo(info);
        setBatteryInfo(battery);
        setStatus("Ready to pair");
      })
      .catch((deviceError) => {
        if (!active) return;
        setStatus("Device details unavailable");
        setError(deviceError.message || "Could not read device details.");
      });

    const savedServerUrl = localStorage.getItem(SERVER_KEY);
    const savedPairingCode = localStorage.getItem(PAIRING_KEY);
    if (savedServerUrl && savedPairingCode) {
      void connectRef.current?.(savedServerUrl, savedPairingCode, true);
    }

    return () => {
      active = false;
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  function connectDevice(event) {
    event.preventDefault();
    if (!sharingConsent) {
      setError("Approve sharing the listed device details before pairing.");
      return;
    }
    void connectToServer(serverUrl, pairingCode, rememberDevice);
  }

  function updateSharingConsent(event) {
    const allowed = event.target.checked;
    setSharingConsent(allowed);
    if (!allowed) {
      localStorage.removeItem(PAIRING_KEY);
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.disconnect();
      setStatus("Sharing paused");
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "32px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Sevan Connect</h1>
      <p>Device details are read on this phone. Pair to share them with your dashboard.</p>

      <section aria-live="polite" style={{ padding: 16, margin: "20px 0", border: "1px solid #e7eaf1", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>This phone</h2>
        <p><strong>Status:</strong> {status}</p>
        {deviceInfo ? (
          <>
            <p><strong>Device:</strong> {deviceInfo.name || deviceInfo.model}</p>
            <p><strong>Model:</strong> {deviceInfo.manufacturer} {deviceInfo.model}</p>
            <p><strong>Android:</strong> {deviceInfo.osVersion}</p>
            <p><strong>Battery:</strong> {batteryInfo?.batteryLevel == null ? "Unavailable" : `${Math.round(batteryInfo.batteryLevel * 100)}%`}{batteryInfo?.isCharging ? " · Charging" : ""}</p>
          </>
        ) : <p>Reading device details…</p>}
      </section>

      <form onSubmit={connectDevice}>
        <label htmlFor="server-url">Secure server address</label>
        <input
          id="server-url"
          type="url"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="http://192.168.1.10:4000 (same Wi-Fi)"
          required
          style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", boxSizing: "border-box" }}
        />

        <label htmlFor="pairing-code">Pairing code</label>
        <input
          id="pairing-code"
          type="password"
          value={pairingCode}
          onChange={(event) => setPairingCode(event.target.value)}
          placeholder="Enter your server pairing code"
          autoComplete="off"
          required
          style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 12px", boxSizing: "border-box" }}
        />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 14px", fontSize: 14 }}>
          <input type="checkbox" checked={sharingConsent} onChange={updateSharingConsent} />
          I allow this phone to send the device name, model, Android version, and battery status to the server above while connected.
        </label>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 16px", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          Remember this pairing on this phone so it reconnects automatically next time.
        </label>

        <button type="submit" disabled={!sharingConsent} style={{ padding: "12px 18px", cursor: sharingConsent ? "pointer" : "not-allowed" }}>Pair this phone</button>
      </form>

      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      <p style={{ fontSize: 13, color: "#666" }}>
        Phone details above need no extra Android permission. Files, contacts, notifications, messages, call history, and screen sharing require separate consent before those features can be added. Use HTTPS when pairing over a network.
      </p>
    </main>
  );
}
