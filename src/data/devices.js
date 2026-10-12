
export const devices = [
  {
    id: 1,
    name: "My Android Phone",
    type: "Phone",
    os: "Android",
    status: "Online",
    lastActive: "Just now",
  },
  {
    id: 2,
    name: "Personal Laptop",
    type: "Laptop",
    os: "Windows",
    status: "Offline",
    lastActive: "2 hours ago",
  },
  {
    id: 3,
    name: "Work Monitor",
    type: "Monitor",
    os: "Windows",
    status: "Online",
    lastActive: "5 minutes ago",
  },
];

export const getOnlineDevices = (deviceList) =>
  deviceList.filter((device) => device.status === "Online");

export const searchDevices = (deviceList, query) => {
  const searchTerm = query.trim().toLowerCase();

  if (!searchTerm) return deviceList;

  return deviceList.filter((device) =>
    [device.name, device.type, device.os, device.status].some((value) =>
      value.toLowerCase().includes(searchTerm)
    )
  );
};
