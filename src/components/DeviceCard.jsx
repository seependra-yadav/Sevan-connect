
import {
  Smartphone,
  Laptop,
  Wifi,
  WifiOff,
  Monitor,
  FolderOpen,
  ExternalLink,
} from "lucide-react";

export default function DeviceCard({
  device,
  onOpen,
  onOpenFiles,
  onMirror,
}) {
  const isOnline = device.status === "Online";

  const DeviceIcon =
    device.type === "Laptop"
      ? Laptop
      : device.type === "Monitor"
      ? Monitor
      : Smartphone;

  return (
    <div className="device-card">
      <div className="device-card-header">
        <div className="device-icon">
          <DeviceIcon size={26} />
        </div>

        <span
          className={`device-status ${
            isOnline ? "online" : "offline"
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          {device.status}
        </span>
      </div>

      <div className="device-info">
        <h3>{device.name}</h3>
        <p>{device.type} · {device.os}</p>
        <span className="device-last-active">
          Last active: {device.lastActive}
        </span>
      </div>

      <div className="device-card-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onOpen?.(device)}
        >
          <ExternalLink size={15} />
          Open Device
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => onOpenFiles?.(device)}
        >
          <FolderOpen size={15} />
          Files
        </button>

        <button
          type="button"
          className="primary-button"
          disabled={!isOnline}
          onClick={() => onMirror?.(device)}
        >
          <Monitor size={15} />
          Mirror
        </button>
      </div>
    </div>
  );
}
