
import {
  LayoutDashboard,
  Smartphone,
  FolderOpen,
  Bell,
  Monitor,
  Settings,
  Wifi,
  ShieldCheck,
} from "lucide-react";

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "devices", label: "My Devices", icon: Smartphone },
  { id: "files", label: "File Manager", icon: FolderOpen },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "screen", label: "Screen Mirroring", icon: Monitor },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Smartphone size={25} />
        </div>

        <div>
          <h2>Sevan Connect</h2>
          <p>Personal Device Manager</p>
        </div>
      </div>

      <div className="sidebar-label">WORKSPACE</div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="security-card">
          <ShieldCheck size={22} />
          <div>
            <strong>Privacy First</strong>
            <p>Your devices, your control.</p>
          </div>
        </div>

        <div className="connection-status">
          <Wifi size={17} />
          <span>Dashboard ready</span>
          <span className="status-dot" />
        </div>
      </div>
    </aside>
  );
}
