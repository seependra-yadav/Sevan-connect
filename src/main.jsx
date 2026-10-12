
import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.jsx";
import AndroidCompanion from "./components/AndroidCompanion.jsx";
import "./index.css";

const RootApp = Capacitor.isNativePlatform()
  ? AndroidCompanion
  : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
