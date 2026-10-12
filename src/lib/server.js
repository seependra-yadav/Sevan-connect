const configuredUrl = import.meta.env.VITE_SERVER_URL?.trim();
const defaultUrl = import.meta.env.DEV
  ? "http://localhost:4000"
  : window.location.origin;

export const SERVER_URL = (
  configuredUrl || defaultUrl
).replace(/\/+$/, "");
