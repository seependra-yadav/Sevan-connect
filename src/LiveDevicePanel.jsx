import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Wifi, WifiOff } from "lucide-react";
import { SERVER_URL } from "./lib/server";

export default function LiveDevicePanel({ onDevicesChange }) {
  const [pairingCode, setPairingCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [connectionCode, setConnectionCode] = useState("");

  useEffect(() => {
    if (!attempt || !connectionCode) return undefined;

    const socket = io(SERVER_URL, {
      autoConnect: false,
      auth: { pairingCode: connectionCode, role: "dashboard" },
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      setConnected(true);
      setError("");
    });
    socket.on("connect_error", (connectionError) => {
      setConnected(false);
      setError(connectionError.message || "Could not connect to the server.");
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("device:list", (serverDevices) => {
      onDevicesChange(serverDevices.map((device) => ({
        ...device,
        id: device.deviceId,
        type: "Phone",
        os: `Android ${device.osVersion}`,
        lastActive: device.lastSeen,
      })));
    });

    socket.connect();
    return () => socket.disconnect();
  }, [attempt, connectionCode, onDevicesChange]);

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
          placeholder="Server pairing code"
          aria-label="Server pairing code"
          autoComplete="off"
          required
        />
        <button className="primary-button" type="submit">Connect dashboard</button>
      </form>

      {error && <p role="alert" className="connection-error">{error}</p>}
      {connected && <p className="connection-hint">Open the companion app on your phone and enter the same code.</p>}
    </section>
  );
}
