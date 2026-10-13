function formatDate(value) {
  if (!value) return "Time unavailable";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatSize(value) {
  if (value == null) return "Size unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function recordTitle(section, record) {
  if (section === "contacts") return record.name || record.phone || "Contact";
  if (section === "messages") return record.address || "Unknown sender";
  if (section === "calls") return record.name || record.number || "Call";
  if (section === "notifications") return record.title || record.app || "Notification";
  return record.name || "Shared item";
}

function recordDescription(section, record) {
  if (section === "contacts") return record.phone || "No phone number";
  if (section === "messages") return record.body || "Empty message";
  if (section === "calls") return `${record.number || "Unknown number"} · ${record.duration ?? 0}s`;
  if (section === "notifications") return record.text || record.app || "";
  return `${record.mimeType || "File"} · ${formatSize(record.size)}`;
}

export default function DeviceDataPage({ section, devices, deviceData, selectedDevice, searchQuery = "" }) {
  const labels = {
    contacts: "Contacts",
    messages: "SMS messages",
    calls: "Call history",
    notifications: "Notifications",
    files: "Files and photos",
  };
  const rows = devices.flatMap((device) => {
    if (selectedDevice && selectedDevice.id !== device.id) return [];
    const data = deviceData[device.id];
    const values = section === "files"
      ? [...(data?.files || []).map((record) => ({ ...record, kind: "File" })), ...(data?.photos || []).map((record) => ({ ...record, kind: "Photo" }))]
      : data?.[section] || [];
    return values.map((record, index) => ({ ...record, deviceName: device.name, deviceId: device.id, rowId: `${device.id}-${section}-${index}` }));
  }).filter((record) => {
    if (!searchQuery.trim()) return true;
    const searchableRecord = { ...record };
    delete searchableRecord.dataUrl;
    return JSON.stringify(searchableRecord).toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  return (
    <section className="page-content data-page">
      <div className="data-page-heading">
        <div>
          <p className="eyebrow">APPROVED DEVICE DATA</p>
          <h2>{labels[section]}</h2>
          <p>Showing data the phone owner approved. This live snapshot is removed when the phone disconnects.</p>
        </div>
        {selectedDevice && <span className="data-device-filter">{selectedDevice.name}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="data-empty-state">
          <strong>No approved {labels[section].toLowerCase()} to show</strong>
          <p>Open Sevan Connect on the phone, approve sharing, and grant this category on Android. Files and photos also require choosing a folder or items on the phone.</p>
        </div>
      ) : (
        <div className="data-record-list">
          {rows.map((record) => (
            <article className="data-record" key={record.rowId}>
              {section === "files" && record.dataUrl?.startsWith("data:image/") && (
                <img className="data-record-preview" src={record.dataUrl} alt={record.name || "Phone photo"} />
              )}
              <div className="data-record-main">
                <div className="data-record-topline">
                  <strong>{recordTitle(section, record)}</strong>
                  <span>{record.deviceName}</span>
                </div>
                <p>{recordDescription(section, record)}</p>
                <small>
                  {record.kind && `${record.kind} · `}
                  {record.date ? formatDate(record.date) : record.postedAt ? formatDate(record.postedAt) : ""}
                  {section === "messages" && record.type != null ? ` · ${Number(record.type) === 1 ? "Received" : "Sent or other"}` : ""}
                  {section === "calls" && record.type != null ? ` · ${({ 1: "Incoming", 2: "Outgoing", 3: "Missed", 5: "Rejected" })[record.type] || "Call"}` : ""}
                </small>
              </div>
              {section === "files" && record.dataUrl && (
                <a className="secondary-button" href={record.dataUrl} download={record.name || "phone-file"}>Download</a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
