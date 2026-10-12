import { useEffect, useRef, useState } from "react";
import { Device } from "@capacitor/device";
import { Share } from "@capacitor/share";
import { io } from "socket.io-client";

const SERVER_KEY = "sevan.serverUrl";
const CONSENT_KEY = "sevan.rememberSharingConsent";
const DASHBOARD_URL = "https://sevan-connect.onrender.com";
const APK_URL = "https://github.com/seependra-yadav/Sevan-connect/releases/latest/download/app-debug.apk";

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
    import.meta.env.VITE_SERVER_URL || localStorage.getItem(SERVER_KEY) || DASHBOARD_URL
  );
  const [sharingConsent, setSharingConsent] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [rememberConsent, setRememberConsent] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [batteryInfo, setBatteryInfo] = useState(null);
  const [status, setStatus] = useState("Reading basic device details…");
  const [error, setError] = useState("");
  const [shareError, setShareError] = useState("");
  const socketRef = useRef(null);
  const updateTimerRef = useRef(null);
  const connectRef = useRef(null);

  async function sendDeviceDetails(socket, info, id) {
    try {
      const battery = await Device.getBatteryInfo();
      setBatteryInfo(battery);
      socket.emit("device:register", {
        userConsented: true,
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
          setStatus("Connected — sharing approved details");
          setError("");
        } else {
          setStatus("Could not share device details");
          setError(result?.error || "Device registration failed.");
        }
      });
    } catch (deviceError) {
      setStatus("Connected; battery details unavailable");
      setError(deviceError.message || "Could not read battery information.");
    }
  }

  async function connectToServer(rawServerUrl, remember) {
    const normalizedServerUrl = rawServerUrl.trim().replace(/\/+$/, "");
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedServerUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Use an HTTP or HTTPS server URL.");
      }
      if (parsedUrl.protocol === "http:" && !isPrivateNetworkHost(parsedUrl.hostname)) {
        throw new Error("Public connections require HTTPS.");
      }
    } catch (validationError) {
      setStatus("Connection needs attention");
      setError(validationError.message || "Enter a valid server URL.");
      return;
    }

    setError("");
    setStatus("Connecting securely…");
    socketRef.current?.disconnect();

    try {
      localStorage.setItem(SERVER_KEY, normalizedServerUrl);
      if (remember && sharingConsent) localStorage.setItem(CONSENT_KEY, "true");
      else localStorage.removeItem(CONSENT_KEY);

      const [info, id] = await Promise.all([Device.getInfo(), Device.getId()]);
      setDeviceInfo(info);
      const socket = io(normalizedServerUrl, {
        autoConnect: false,
        auth: { role: "device" },
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
        setStatus("Disconnected — reconnecting…");
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
        setStatus("Ready — not sharing");
      })
      .catch((deviceError) => {
        if (!active) return;
        setStatus("Basic device details unavailable");
        setError(deviceError.message || "Could not read device details.");
      });

    const rememberedUrl = localStorage.getItem(SERVER_KEY);
    if (localStorage.getItem(CONSENT_KEY) === "true" && rememberedUrl) {
      void connectRef.current?.(rememberedUrl, true);
    }

    return () => {
      active = false;
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  function updateSharingConsent(event) {
    const allowed = event.target.checked;
    setSharingConsent(allowed);
    if (!allowed) {
      setRememberConsent(false);
      localStorage.removeItem(CONSENT_KEY);
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus("Sharing stopped");
    }
  }

  function connectDevice(event) {
    event.preventDefault();
    if (!sharingConsent) {
      setError("Approve the device-sharing notice before connecting.");
      return;
    }
    void connectToServer(serverUrl, rememberConsent);
  }

  async function shareApk() {
    setShareError("");
    try {
      await Share.share({
        title: "Sevan Connect for Android",
        text: "Install Sevan Connect to share device details with the connected dashboard.",
        url: APK_URL,
        dialogTitle: "Share the Sevan Connect APK",
      });
    } catch (shareFailure) {
      setShareError(shareFailure.message || "Could not open the Android share menu.");
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "32px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Sevan Connect</h1>
      <p>This app stays disconnected until the phone owner approves sharing.</p>

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
        <label htmlFor="server-url">Dashboard and data recipient</label>
        <input
          id="server-url"
          type="url"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          required
          style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", boxSizing: "border-box" }}
        />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 14px", fontSize: 14 }}>
          <input type="checkbox" checked={sharingConsent} onChange={updateSharingConsent} />
          I agree to send this phone’s name, model, Android version, and battery/charging status to the dashboard above while connected. The dashboard administrator can view these details.
        </label>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 16px", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={rememberConsent}
            onChange={(event) => setRememberConsent(event.target.checked)}
          />
          Remember my approval and reconnect when I open this app again.
        </label>

        <button type="submit" disabled={!sharingConsent} style={{ padding: "12px 18px", cursor: sharingConsent ? "pointer" : "not-allowed" }}>
          Connect and share approved details
        </button>
      </form>

      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}

      <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e7eaf1" }}>
        <h2>Sevan Connect links</h2>
        <p><a href={DASHBOARD_URL} target="_blank" rel="noreferrer">Open the dashboard</a></p>
        <p><a href={APK_URL}>Download the latest APK</a></p>
        <button type="button" onClick={() => void shareApk()} style={{ padding: "10px 14px" }}>Share APK link…</button>
        {shareError && <p role="alert" style={{ color: "#b42318" }}>{shareError}</p>}
      </section>

      <p style={{ fontSize: 13, color: "#666", marginTop: 20 }}>
        Only the basic details listed above are currently shared. Files, contacts, notifications, messages, call history, and screen sharing are not implemented. Any future access must be requested separately and approved by the phone owner.
      </p>
    </main>
  );
}
