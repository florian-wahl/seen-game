"use client";

import { useEffect } from "react";

/** Registers /sw.js (push only). Renders nothing. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Push is optional; ignore registration failures (e.g. insecure context).
    });
  }, []);
  return null;
}
