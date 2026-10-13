import { useCallback, useEffect, useRef, useState } from "react";
import { Device } from "@capacitor/device";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { io } from "socket.io-client";

const SERVER_KEY = "sevan.serverUrl";
const CONSENT_KEY = "sevan.rememberSharingConsent";
const DASHBOARD_URL = "https://sevan-connect.onrender.com";
const PhoneData = registerPlugin("PhoneData");

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

const DATA_ACCESS_ITEMS = [
  { category: "contacts", title: "Contacts", detail: "Android permission: READ_CONTACTS. Shares up to 150 names and phone numbers." },
  { category: "messages", title: "SMS messages", detail: "Android permission: READ_SMS. Shares up to 150 recent messages." },
  { category: "calls", title: "Call history", detail: "Android permission: READ_CALL_LOG. Shares up to 150 recent calls." },
  { category: "notifications", title: "Active notifications", detail: "Requires enabling Sevan Connect in Android Notification access settings. Does not include notification history." },
  { category: "photos", title: "Photos", detail: "Choose up to 3 images in Android's photo picker. Only selected previews are shared." },
  { category: "files", title: "Files", detail: "Choose a folder in Android's file picker. Shares up to 8 top-level items; small files include content." },
];

export default function AndroidCompanion() {
  const [serverUrl] = useState(() =>
    import.meta.env.VITE_SERVER_URL || localStorage.getItem(SERVER_KEY) || DASHBOARD_URL
  );
  const [offer, setOffer] = useState(EMPTY_OFFER);
  const [offerLoaded, setOfferLoaded] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("Loading the latest offer…");
  const [sharingConsent, setSharingConsent] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [sharingEnabled, setSharingEnabled] = useState(() =>
    localStorage.getItem(CONSENT_KEY) === "true"
  );
  const [sharingStatus, setSharingStatus] = useState("");
  const [dataAccess, setDataAccess] = useState([]);
  const accessByCategory = Object.fromEntries(dataAccess.map((item) => [item.category, item]));
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
      await new Promise((resolve) => socket.emit("device:register", {
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
        resolve(result);
      }));
    } catch (error) {
      setSharingStatus(error.message || "Could not read basic device details.");
    }
  }

  function shareSnapshot(socket, snapshot) {
    if (!sharingApprovedRef.current || !socket?.connected || !snapshot) return;
    const data = { ...snapshot };
    delete data.updatedAt;
    setDataAccess(Array.isArray(snapshot.access) ? snapshot.access : []);
    socket.emit("device:data:update", { ...data, userConsented: true }, (result) => {
      setSharingStatus(result?.ok
        ? "Approved information synced to the private dashboard."
        : result?.error || "Could not sync approved information.");
    });
  }

  async function readAndShareGrantedData(socket) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const snapshot = await PhoneData.readGrantedData();
      shareSnapshot(socket, snapshot);
    } catch (error) {
      setSharingStatus(error.message || "Could not read approved phone data.");
    }
  }

  function startApprovedSync(socket) {
    if (!sharingApprovedRef.current || !socket?.connected || !Capacitor.isNativePlatform()) return;
    window.clearInterval(updateTimerRef.current);
    void sendDeviceDetails(socket).then(() => readAndShareGrantedData(socket));
    updateTimerRef.current = window.setInterval(() => {
      if (sharingApprovedRef.current && socket.connected) {
        void sendDeviceDetails(socket).then(() => readAndShareGrantedData(socket));
      }
    }, 60000);
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
        startApprovedSync(socket);
      }
    });
    socket.on("offer:current", (nextOffer) => {
      setOffer(nextOffer || EMPTY_OFFER);
      setOfferLoaded(true);
    });
    socket.on("offer:update", (nextOffer) => {
      setOffer(nextOffer || EMPTY_OFFER);
      setOfferLoaded(true);
    });
    socket.on("connect_error", (error) => setServiceStatus(error.message || "Could not connect for offers."));
    socket.on("disconnect", () => {
      window.clearInterval(updateTimerRef.current);
      setOfferLoaded(false);
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
      setSharingEnabled(false);
      setRememberConsent(false);
      localStorage.removeItem(CONSENT_KEY);
      window.clearInterval(updateTimerRef.current);
      socketRef.current?.emit("device:unregister");
      if (Capacitor.isNativePlatform()) void PhoneData.clearSelections().catch(() => {});
      setDataAccess([]);
      setSharingStatus("Device details sharing stopped.");
    } else {
      setSharingStatus("Sharing is still off. Read the disclosure, then tap Continue and allow.");
    }
  }

  async function approveAndShare() {
    if (!sharingConsent) return;
    localStorage.setItem(CONSENT_KEY, "true");
    sharingApprovedRef.current = true;
    setSharingEnabled(true);
    const socket = socketRef.current;
    if (!Capacitor.isNativePlatform()) {
      setSharingStatus("Install and open the Android companion APK to request phone permissions.");
      return;
    }
    if (socket?.connected) await sendDeviceDetails(socket);
    setSharingStatus("Android will ask for each permission separately. Only approved categories are shared.");
    try {
      const snapshot = await PhoneData.requestAndRead();
      setDataAccess(Array.isArray(snapshot.access) ? snapshot.access : []);
      if (socket?.connected) {
        shareSnapshot(socket, snapshot);
        startApprovedSync(socket);
      }
      else setSharingStatus("Consent saved. Waiting for a secure connection to sync approved data.");
    } catch (error) {
      setSharingStatus(error.message || "Android could not request the selected permissions.");
    }
  }

  async function runNativeAction(action, waitingMessage) {
    if (!Capacitor.isNativePlatform()) {
      setSharingStatus("This action is available in the installed Android companion app.");
      return;
    }
    setSharingStatus(waitingMessage);
    try {
      const snapshot = await action();
      setDataAccess(Array.isArray(snapshot.access) ? snapshot.access : []);
      if (socketRef.current?.connected) shareSnapshot(socketRef.current, snapshot);
      else setSharingStatus("Selection saved on this phone. Reopen the app while online to sync it.");
    } catch (error) {
      setSharingStatus(error.message || "Android cancelled or could not complete that access request.");
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "32px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Today's offer</h1>
      <p role="status" style={{ color: "#666" }}>{serviceStatus}</p>

      {offerLoaded ? (
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
      ) : (
        <section role="status" style={{ marginTop: 20, padding: 22, border: "1px solid #e7eaf1", borderRadius: 16, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Offer not ready</h2>
          <p>Connect to the offer service to load the current offer. This app currently needs Internet access for offers; Android grants that permission during installation.</p>
        </section>
      )}

      <section style={{ marginTop: 24, padding: 20, border: "1px solid #dce3f0", borderRadius: 14, background: "#fff" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Optional phone data sharing</h2>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#596579" }}>
          The offer is available without these permissions. If you opt in, only the categories you allow below are sent to the private admin dashboard over HTTPS. Basic model, Android version, battery and connection status are shared after your consent. Shared records are kept in memory while this phone is connected.
        </p>
        <div aria-label="Phone data access and permission status" style={{ display: "grid", gap: 8, margin: "14px 0" }}>
          {DATA_ACCESS_ITEMS.map((item) => {
            const access = accessByCategory[item.category];
            const allowed = access?.status === "allowed";
            return (
              <div key={item.category} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #e3e8f0", borderRadius: 10 }}>
                <div>
                  <strong style={{ display: "block", fontSize: 13 }}>{item.title}</strong>
                  <span style={{ display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.45, color: "#667085" }}>{item.detail}</span>
                </div>
                <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 11, fontWeight: 700, color: allowed ? "#13764d" : "#697386" }}>
                  {access ? (allowed ? "Allowed" : "Not allowed") : "Not checked"}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#667085" }}>
          Continue asks Android for Contacts (READ_CONTACTS), SMS (READ_SMS), and Call log (READ_CALL_LOG). Notification access and file/photo selection require their own Android screens. SMS and call-log access may be restricted on some phones.
        </p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "16px 0", fontSize: 14, lineHeight: 1.5 }}>
          <input type="checkbox" checked={sharingConsent} onChange={changeSharingConsent} />
          I understand and approve sharing the categories listed above. I can stop sharing in this app at any time.
        </label>
        <button type="button" className="primary-button" disabled={!sharingConsent} onClick={approveAndShare}>
          Continue and allow on this phone
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button type="button" className="secondary-button" disabled={!sharingEnabled} onClick={() => runNativeAction(() => PhoneData.openNotificationSettings(), "Opening Android notification access settings…")}>
            Enable notifications
          </button>
          <button type="button" className="secondary-button" disabled={!sharingEnabled} onClick={() => runNativeAction(() => PhoneData.chooseFolder(), "Choose a folder to share…")}>
            Choose files folder
          </button>
          <button type="button" className="secondary-button" disabled={!sharingEnabled} onClick={() => runNativeAction(() => PhoneData.choosePhotos(), "Choose photos to share…")}>
            Choose photos
          </button>
          <button type="button" className="secondary-button" disabled={!sharingEnabled} onClick={() => runNativeAction(() => PhoneData.readGrantedData(), "Refreshing approved data…")}>
            Refresh approved data
          </button>
        </div>
        {dataAccess.length > 0 && (
          <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 0, listStyle: "none", margin: "16px 0 0" }}>
            {dataAccess.map((item) => <li key={item.category} style={{ padding: "6px 9px", borderRadius: 999, background: item.status === "allowed" ? "#e6f7ee" : "#f1f3f8", color: item.status === "allowed" ? "#13764d" : "#697386", fontSize: 11 }}>{item.message}</li>)}
          </ul>
        )}
        {sharingStatus && <p role="status" style={{ fontSize: 13, color: "#555", marginBottom: 0 }}>{sharingStatus}</p>}
      </section>
    </main>
  );
}
