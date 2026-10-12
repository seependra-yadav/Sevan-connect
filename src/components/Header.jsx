
import { Search, Bell, ChevronDown } from "lucide-react";

const pageTitles = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Monitor your personal devices in one place.",
  },
  devices: {
    title: "My Devices",
    subtitle: "View your connected device information.",
  },
  files: {
    title: "File Manager",
    subtitle: "Manage files you have authorized access to.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "View notifications shared by your devices.",
  },
  screen: {
    title: "Screen Mirroring",
    subtitle: "View an authorized device screen.",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage dashboard preferences.",
  },
};

export default function Header({ activePage, searchQuery, onSearchChange }) {
  const page = pageTitles[activePage] || pageTitles.dashboard;

  return (
    <header className="top-header">
      <div className="header-heading">
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
      </div>

      <div className="header-actions">
        <label className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search devices..."
            aria-label="Search devices"
            value={searchQuery}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>

        <button
          className="icon-button"
          type="button"
          aria-label="Notifications"
          onClick={() => {
            window.alert("Notifications will be available when connected.");
          }}
        >
          <Bell size={19} />
          <span className="notification-indicator" />
        </button>

        <button
          className="profile-button"
          type="button"
          aria-label="Profile menu"
          onClick={() => {
            window.alert("Personal dashboard settings");
          }}
        >
          <div className="profile-avatar">S</div>

          <div className="profile-details">
            <strong>Personal</strong>
            <span>Administrator</span>
          </div>

          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  );
}
