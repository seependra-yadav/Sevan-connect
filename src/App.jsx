
import { useState } from "react";
import {
  ArrowLeft,
  Smartphone,
  FolderOpen,
  Monitor,
} from "lucide-react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatCard from "./components/StatCard";
import DeviceCard from "./components/DeviceCard";
import BackendStatus from "./components/BackendStatus";
import LiveDevicePanel from "./LiveDevicePanel";

import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [devices, setDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [adminConnected, setAdminConnected] = useState(false);

  const filteredDevices = devices.filter((device) =>
    [
      device.name,
      device.type,
      device.os,
      device.status,
    ].some((value) =>
      value.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
  );

  const onlineCount = devices.filter(
    (device) => device.status === "Online"
  ).length;

  function openDevice(device) {
    setSelectedDevice(device);
    setActivePage("device-details");
  }

  function openFiles(device) {
    setSelectedDevice(device);
    setActivePage("files");
  }

  function openMirror(device) {
    if (device.status !== "Online") return;

    setSelectedDevice(device);
    setActivePage("screen");
  }

  function navigate(page) {
    setActivePage(page);
    setSelectedDevice(null);
    setSearchQuery("");
  }

  const pageTitle =
    activePage === "device-details"
      ? selectedDevice?.name || "Device Details"
      : activePage;

  return (
    <div className="app-layout">
      {adminConnected && <Sidebar
        activePage={activePage === "device-details" ? "devices" : activePage}
        onNavigate={navigate}
      />}

      <main className="main-content">
        {adminConnected && <Header
          activePage={pageTitle}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />}

        <div className="connection-content">
          <LiveDevicePanel onDevicesChange={setDevices} onAuthChange={setAdminConnected} />
        </div>

        {!adminConnected && (
          <section className="page-content admin-lock-notice" role="status">
            <h2>Private dashboard</h2>
            <p>Enter your private admin access code above. Connected device details are shown only after the server verifies it.</p>
            <p>Keep this code private. It is never included in the Android APK.</p>
          </section>
        )}

        <div style={{ display: adminConnected ? "contents" : "none" }}>
        {activePage === "dashboard" && (
          <div className="dashboard-content">
            <BackendStatus />

            <section className="welcome-section">
              <div>
                <h2>Welcome to Sevan Connect</h2>
                <p>
                  Manage all your personal devices in one place.
                </p>
              </div>

            </section>

            <section className="stats-grid">
              <StatCard
                title="Total Devices"
                value={devices.length}
                description="Devices in your dashboard"
                type="devices"
              />

              <StatCard
                title="Online Devices"
                value={onlineCount}
                description="Marked as online"
                type="online"
              />

              <StatCard
                title="Files"
                value="—"
                description="Requires device connection"
                type="files"
              />

              <StatCard
                title="Notifications"
                value="—"
                description="Requires device connection"
                type="notifications"
              />
            </section>

            <section className="devices-section">
              <div className="section-heading">
                <div>
                  <h2>Your Devices</h2>
                  <p>
                    {devices.length} device(s) in your dashboard.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate("devices")}
                >
                  View All
                </button>
              </div>

              <div className="devices-grid">
                {filteredDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onOpen={openDevice}
                    onOpenFiles={openFiles}
                    onMirror={openMirror}
                  />
                ))}
              </div>

              {filteredDevices.length === 0 && (
                <p className="empty-state">
                  No devices match your search.
                </p>
              )}
            </section>
          </div>
        )}

        {activePage === "devices" && (
          <section className="page-content">
            <div className="section-heading">
              <div>
                <h2>All Devices</h2>
                <p>View and manage your device list.</p>
              </div>

            </div>

            <div className="devices-grid">
              {filteredDevices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onOpen={openDevice}
                  onOpenFiles={openFiles}
                  onMirror={openMirror}
                />
              ))}
            </div>

            {filteredDevices.length === 0 && (
              <p className="empty-state">No devices found.</p>
            )}
          </section>
        )}

        {activePage === "device-details" && selectedDevice && (
          <section className="page-content">
            <button
              type="button"
              className="secondary-button back-button"
              onClick={() => navigate("devices")}
            >
              <ArrowLeft size={16} />
              Back to Devices
            </button>

            <div className="device-details-card">
              <div className="device-details-icon">
                <Smartphone size={32} />
              </div>

              <h2>{selectedDevice.name}</h2>
              <p>
                {selectedDevice.type} · {selectedDevice.os}
              </p>

              {selectedDevice.model && (
                <div className="device-detail-row">
                  <span>Model</span>
                  <strong>{selectedDevice.model}</strong>
                </div>
              )}

              {selectedDevice.batteryLevel != null && (
                <div className="device-detail-row">
                  <span>Battery</span>
                  <strong>{selectedDevice.batteryLevel}%{selectedDevice.isCharging ? " · Charging" : ""}</strong>
                </div>
              )}

              <div className="device-detail-row">
                <span>Device ID</span>
                <strong>{selectedDevice.id}</strong>
              </div>

              <div className="device-detail-row">
                <span>Status</span>
                <strong>{selectedDevice.status}</strong>
              </div>

              <div className="device-detail-row">
                <span>Last active</span>
                <strong>{selectedDevice.lastActive}</strong>
              </div>

              <div className="detail-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openFiles(selectedDevice)}
                >
                  <FolderOpen size={17} />
                  Open Files
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={selectedDevice.status !== "Online"}
                  onClick={() => openMirror(selectedDevice)}
                >
                  <Monitor size={17} />
                  Screen Mirroring
                </button>
              </div>

            </div>
          </section>
        )}

        {activePage === "files" && (
          <section className="page-content">
            <button
              type="button"
              className="secondary-button back-button"
              onClick={() => selectedDevice
                ? openDevice(selectedDevice)
                : navigate("devices")}
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <h2>File Manager</h2>
            <p>
              Selected device: {selectedDevice?.name || "None"}
            </p>

            <div className="info-panel">
              <h3>Device connection required</h3>
              <p>
                This page will display authorized files after the
                Android companion app and secure file-transfer
                service are connected. Adding a device here does
                not automatically connect to a physical phone.
              </p>
            </div>
          </section>
        )}

        {activePage === "screen" && (
          <section className="page-content">
            <button
              type="button"
              className="secondary-button back-button"
              onClick={() => selectedDevice
                ? openDevice(selectedDevice)
                : navigate("devices")}
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <h2>Screen Mirroring</h2>
            <p>
              Selected device: {selectedDevice?.name || "None"}
            </p>

            <div className="info-panel">
              <h3>Waiting for a real device connection</h3>
              <p>
                Screen sharing will require the companion app,
                Android screen-capture approval, and an encrypted
                streaming connection.
              </p>
            </div>
          </section>
        )}

        {activePage === "notifications" && (
          <section className="page-content">
            <h2>Notifications</h2>
            <p>
              Notifications will appear here after authorized
              device integration is implemented.
            </p>
          </section>
        )}

        {activePage === "settings" && (
          <section className="page-content">
            <h2>Settings</h2>
            <p>
              Device connection and security settings will be
              available here as the application develops.
            </p>
          </section>
        )}
        </div>
      </main>
    </div>
  );
}

export default App;
