import { useCallback, useEffect, useRef, useState } from "react";
import { Device } from "@capacitor/device";
import { io } from "socket.io-client";

const SERVER_KEY = "sevan.serverUrl";
const CONSENT_KEY = "sevan.rememberSharingConsent";
const DASHBOARD_URL = "https://sevan-connect.onrender.com";

function isPrivateNetworkHost(host) {
  if (host === "localhost" || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    parts[0] === 192 && parts[1] === 168 ||
    parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 ||
    parts[0] === 169 && parts[1] === 254;
}

const EMPTY_OFFER = {
  title: "No offer right now",
  description: "Please check back later.",
  linkUrl: "",
  buttonLabel: "",
  updatedAt: null,
};

export default function AndroidCompanion() {
  const [serverUrl] = useState(() =>
    import.meta.env.VITE_SERVER_URL || localStorage.getItem(SERVER_KEY) || DASHBOARD_URL
  );
  const [offer, setOffer] = useState(EMPTY_OFFER);
  const [serviceStatus, setServiceStatus] = useState("Loading the latest offer…");
  const [sharingConsent, setSharingConsent] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [rememberConsent, setRememberConsent] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [sharingStatus, setSharingStatus] = useState("");
  const socketRef = useRef(null);
  const updateTimerRef = useRef(null);
  const sharingApprovedRef = useRef(localStorage.getItem(CONSENT_KEY) === "true");

  async function sendDeviceDetails(socket) {
    try {
      const [info, id, battery] = await Promise.all([
        Device.getInfo(),
        Device.getId(),
        Device.getBatteryInfo(),
      ]);
      socket.emit("device:register", {
        userConsented: true,
        deviceId: id.identifier,
        name: info.name || "Android device",
        model: info.model || "Android device",
        manufacturer: info.manufacturer || "Unknown",
        osVersion: info.osVersion || "Unknown",
        batteryLevel: battery.batteryLevel == null ? null : Math.round(battery.batteryLevel * 100),
        isCharging: battery.isCharging ?? null,
      }, (result) => {
        setSharingStatus(result?.ok
          ? "Approved basic details are being shared while this app is connected."
          : result?.error || "Could not share device details.");
      });
    } catch (error) {
      setSharingStatus(error.message || "Could not read basic device details.");
    }
  }

  const openService = useCallback(() => {
    const normalizedUrl = serverUrl.trim().replace(/\/+$/, "");
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid service URL.");
      if (parsedUrl.protocol === "http:" && !isPrivateNetworkHost(parsedUrl.hostname)) {
        throw new Error("Public connections require HTTPS.");
      }
    } catch (error) {
      setServiceStatus(error.message || "Invalid service URL.");
      return;
    }

    localStorage.setItem(SERVER_KEY, normalizedUrl);
    const socket = io(normalizedUrl, {
      auth: { role: "device" },
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setServiceStatus("Connected. Offer updates will appear here.");
      if (sharingApprovedRef.current) {
        void sendDeviceDetails(socket);
        window.clearInterval(updateTimerRef.current);
        updateTimerRef.current = window.setInterval(() => {
          if (sharingApprovedRef.current && socket.connected) void sendDeviceDetails(socket);
        }, 30000);
      }
    });
    socket.on("offer:current", (nextOffer) => setOffer(nextOffer || EMPTY_OFFER));
    socket.on("offer:update", (nextOffer) => setOffer(nextOffer || EMPTY_OFFER));
    socket.on("connect_error", (error) => setServiceStatus(error.message || "Could not connect for offers."));
    socket.on("disconnect", () => {
      window.clearInterval(updateTimerRef.current);
      setServiceStatus("Reconnecting to load the latest offer…");
    });
  }, [serverUrl]);

  useEffect(() => {
    const startTimer = window.setTimeout(openService, 0);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, [openService]);

  function changeSharingConsent(event) {
    const approved = event.target.checked;
    setSharingConsent(approved);
    if (!approved) {
      sharingApprovedRef.current = false;
      setRememberConsent(false);
      localStorage.removeItem(CONSENT_KEY);
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.emit("device:unregister");
      setSharingStatus("Device details sharing stopped.");
    } else {
      setSharingStatus("Sharing is still off. Tap the button below to send the listed details.");
    }
  }

  function approveAndShare() {
    if (!sharingConsent) return;
    if (rememberConsent) localStorage.setItem(CONSENT_KEY, "true");
    else localStorage.removeItem(CONSENT_KEY);
    sharingApprovedRef.current = true;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setSharingStatus("Waiting for a secure connection. Try again when connected.");
      return;
    }
    void sendDeviceDetails(socket);
    window.clearInterval(updateTimerRef.current);
    updateTimerRef.current = window.setInterval(() => {
      if (sharingApprovedRef.current && socket.connected) void sendDeviceDetails(socket);
    }, 30000);
  }

  return (
    <main style={{ maxWidth: 560, margin: "32px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Today's offer</h1>
      <p role="status" style={{ color: "#666" }}>{serviceStatus}</p>

      <article style={{ marginTop: 20, padding: 22, border: "1px solid #e7eaf1", borderRadius: 16, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>{offer.title}</h2>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{offer.description}</p>
        {offer.linkUrl && (
          <a
            href={offer.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, padding: "12px 18px", borderRadius: 8, background: "#2457d6", color: "white", textDecoration: "none" }}
          >
            {offer.buttonLabel || "View offer"}
          </a>
        )}
        {offer.updatedAt && <p style={{ marginBottom: 0, color: "#777", fontSize: 12 }}>Updated {new Date(offer.updatedAt).toLocaleString()}</p>}
      </article>

      <details style={{ marginTop: 24, padding: 16, border: "1px solid #e7eaf1", borderRadius: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Privacy and optional device sharing</summary>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          This app connects to load public offer updates. It does not send device details unless you separately approve below. Optional sharing contains this phone's app device ID, name, model, Android version, battery level, and charging state.
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
          <input type="checkbox" checked={sharingConsent} onChange={changeSharingConsent} />
          I approve sending the listed basic device details to the service while connected.
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 14 }}>
          <input type="checkbox" checked={rememberConsent} disabled={!sharingConsent} onChange={(event) => setRememberConsent(event.target.checked)} />
          Remember this approval and resume sharing when I open the app again.
        </label>
        <button type="button" disabled={!sharingConsent} onClick={approveAndShare} style={{ marginTop: 14, padding: "10px 14px", cursor: sharingConsent ? "pointer" : "not-allowed" }}>
          Approve and share basic details
        </button>
        {sharingStatus && <p role="status" style={{ fontSize: 13, color: "#555" }}>{sharingStatus}</p>}
      </details>
    </main>
  );
}
