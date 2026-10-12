
import { Smartphone, Wifi, FolderOpen, Bell } from "lucide-react";

const iconMap = {
  devices: Smartphone,
  online: Wifi,
  files: FolderOpen,
  notifications: Bell,
};

export default function StatCard({
  title,
  value,
  description,
  type = "devices",
}) {
  const Icon = iconMap[type] || Smartphone;

  return (
    <div className="stat-card">
      <div className={`stat-icon ${type}`}>
        <Icon size={22} strokeWidth={1.8} />
      </div>

      <div className="stat-content">
        <p className="stat-title">{title}</p>
        <h2>{value}</h2>
        <span className="stat-description">{description}</span>
      </div>
    </div>
  );
}
