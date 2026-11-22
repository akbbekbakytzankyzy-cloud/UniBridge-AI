import React from "react";
import { createRoot } from "react-dom/client";
import PortalApp from "./PortalApp.jsx";
import "./style.css";
// In the desktop app, links to other sites open in the system browser instead of doing nothing.
document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest?.("a[href]");
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!link || typeof invoke !== "function") return;
    const url = new URL(link.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    invoke("open_external_link", { url: url.href }).catch(() => {});
  },
  true,
);

createRoot(document.getElementById("root")).render(<PortalApp />);
