
import { useEffect, useState } from "react";
import { Server, Wifi, WifiOff } from "lucide-react";
import { SERVER_URL } from "../lib/server";

export default function BackendStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(
          `${SERVER_URL}/api/health`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Backend unavailable");
        }

        const data = await response.json();

        setStatus(data.status === "running" ? "online" : "offline");
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus("offline");
        }
      }
    }

    checkBackend();

    return () => controller.abort();
  }, []);

  const online = status === "online";
  const checking = status === "checking";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        margin: "0 0 20px",
        border: "1px solid #e7eaf1",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <Server size={21} color="#4f46e5" />

      <div style={{ flex: 1 }}>
        <strong>Sevan Connect Server</strong>
        <div style={{ color: "#7c879c", fontSize: 13, marginTop: 4 }}>
          {checking
            ? "Checking connection..."
            : online
            ? "Backend connected successfully"
            : "Backend offline — check the server"}
        </div>
      </div>

      {online ? (
        <Wifi color="#16a36a" size={20} />
      ) : (
        <WifiOff color={checking ? "#7c879c" : "#dc4545"} size={20} />
      )}
    </div>
  );
}
