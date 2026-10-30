import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./Auth.jsx";
import { OfflineBar } from "./offline.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <OfflineBar />
    <App />
  </AuthGate>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  );
}