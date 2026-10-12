const configuredUrl = import.meta.env.VITE_SERVER_URL?.trim();

export const SERVER_URL = (
  configuredUrl || "http://localhost:4000"
).replace(/\/+$/, "");
