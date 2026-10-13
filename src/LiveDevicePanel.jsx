import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Wifi, WifiOff } from "lucide-react";
import { SERVER_URL } from "./lib/server";

export default function LiveDevicePanel({ onDevicesChange, onDeviceDataChange, onAuthChange }) {
  const [pairingCode, setPairingCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [connectionCode, setConnectionCode] = useState("");
  const [offer, setOffer] = useState({ title: "", description: "", linkUrl: "", buttonLabel: "View offer" });
  const [offerStatus, setOfferStatus] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!attempt || !connectionCode) return undefined;

    const socket = io(SERVER_URL, {
      autoConnect: false,
      auth: { pairingCode: connectionCode, role: "dashboard" },
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError("");
      onAuthChange(true);
    });
    socket.on("connect_error", (connectionError) => {
      setConnected(false);
      onAuthChange(false);
      onDevicesChange([]);
      onDeviceDataChange({});
      setError(connectionError.message || "Could not connect to the server.");
    });
    socket.on("disconnect", () => {
      setConnected(false);
      onAuthChange(false);
      onDevicesChange([]);
      onDeviceDataChange({});
    });
    socket.on("device:list", (serverDevices) => {
      onDevicesChange(serverDevices.map((device) => ({
        ...device,
        id: device.deviceId,
        type: "Phone",
        os: `Android ${device.osVersion}`,
        lastActive: device.lastSeen,
      })));
    });
    socket.on("device:data:list", (records) => {
      onDeviceDataChange(Object.fromEntries(records.map(({ deviceId, ...data }) => [deviceId, data])));
    });
    socket.on("device:data:update", ({ deviceId, ...data }) => {
      onDeviceDataChange((current) => ({ ...current, [deviceId]: data }));
    });
    socket.on("device:data:remove", ({ deviceId }) => {
      onDeviceDataChange((current) => {
        const next = { ...current };
        delete next[deviceId];
        return next;
      });
    });
    socket.on("offer:current", (serverOffer) => {
      if (!serverOffer?.updatedAt) {
        setOffer({ title: "", description: "", linkUrl: "", buttonLabel: "View offer" });
        return;
      }
      setOffer({
        title: serverOffer.title,
        description: serverOffer.description,
        linkUrl: serverOffer.linkUrl,
        buttonLabel: serverOffer.buttonLabel,
      });
      setOfferStatus("Current offer loaded.");
    });
    socket.on("offer:update", (serverOffer) => {
      setOffer({
        title: serverOffer.title,
        description: serverOffer.description,
        linkUrl: serverOffer.linkUrl,
        buttonLabel: serverOffer.buttonLabel,
      });
      setOfferStatus("Offer updated from the server.");
    });

    socket.connect();
    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [attempt, connectionCode, onAuthChange, onDeviceDataChange, onDevicesChange]);

  function connectDashboard(event) {
    event.preventDefault();
    setError("");
    if (!pairingCode.trim()) {
      setError("Enter the pairing code configured on your server.");
      return;
    }
    setConnectionCode(pairingCode.trim());
    setAttempt((value) => value + 1);
  }

  function lockDashboard() {
    setConnected(false);
    setConnectionCode("");
    setPairingCode("");
    setAttempt(0);
    onAuthChange(false);
    onDevicesChange([]);
    onDeviceDataChange({});
  }

  function publishOffer(event) {
    event.preventDefault();
    const socket = socketRef.current;
    if (!socket?.connected) {
      setOfferStatus("Dashboard is disconnected. Reconnect before publishing.");
      return;
    }
    setOfferStatus("Publishing offer…");
    socket.emit("offer:update", offer, (result) => {
      setOfferStatus(result?.ok ? "Offer published to connected phones." : result?.error || "Could not publish offer.");
    });
  }

  return (
    <section className="live-connection-panel" aria-label="Android connection">
      <div className="live-connection-heading">
        <div>
          <h2>Connect your Android phone</h2>
          <p>Server: {SERVER_URL}</p>
        </div>
        <span className={`live-connection-state ${connected ? "online" : "offline"}`}>
          {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <form onSubmit={connectDashboard} className="live-connection-form">
        <input
          type="password"
          value={pairingCode}
          onChange={(event) => setPairingCode(event.target.value)}
          placeholder="Private admin access code"
          aria-label="Private admin access code"
          autoComplete="off"
          required
        />
        <button className="primary-button" type="submit">Connect dashboard</button>
        {connected && <button className="secondary-button" type="button" onClick={lockDashboard}>Lock dashboard</button>}
      </form>

      {error && <p role="alert" className="connection-error">{error}</p>}
      {connected && <p className="connection-hint">Open the companion app on each phone and approve sharing there. The admin code is only for this dashboard.</p>}
      {connected && (
        <form className="offer-admin-form" onSubmit={publishOffer}>
          <h3>Offer shown in phone app</h3>
          <label>
            Offer title
            <input maxLength={100} value={offer.title} onChange={(event) => setOffer({ ...offer, title: event.target.value })} required />
          </label>
          <label>
            Offer details
            <textarea maxLength={500} rows={3} value={offer.description} onChange={(event) => setOffer({ ...offer, description: event.target.value })} required />
          </label>
          <label>
            HTTPS destination link
            <input type="url" pattern="https://.*" value={offer.linkUrl} onChange={(event) => setOffer({ ...offer, linkUrl: event.target.value })} placeholder="https://example.com/offer" required />
          </label>
          <label>
            Button label
            <input maxLength={40} value={offer.buttonLabel} onChange={(event) => setOffer({ ...offer, buttonLabel: event.target.value })} required />
          </label>
          <button className="primary-button" type="submit">Publish offer to phones</button>
          {offerStatus && <p role="status" className="connection-hint">{offerStatus}</p>}
        </form>
      )}
    </section>
  );
}
