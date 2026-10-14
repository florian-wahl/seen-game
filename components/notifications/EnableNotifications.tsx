"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";

type State = "checking" | "unsupported" | "ios-install" | "off" | "busy" | "on" | "blocked" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabaseBrowser().rpc("save_push_subscription", {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
  if (error) throw error;
}

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIosNotInstalled() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone && !pushSupported();
}

function BellIcon() {
  return (
    <svg
      aria-hidden
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-teal"
    >
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

/** Home-screen card to turn on web push. Asks for permission only on tap, never on load. */
export function EnableNotifications() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!pushSupported()) {
        next = isIosNotInstalled() ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "blocked";
      } else if (Notification.permission === "granted") {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await saveSubscription(sub); // keep the server copy fresh
          next = sub ? "on" : "off";
        } catch {
          next = "off";
        }
      } else {
        next = "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("missing VAPID key");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      await saveSubscription(sub);
      setState("on");
    } catch (e) {
      console.warn("Could not enable notifications", e);
      setState("error");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabaseBrowser().rpc("delete_push_subscription", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }, []);

  if (state === "checking" || state === "unsupported") return null;

  const card = "flex flex-col gap-3 rounded-2xl bg-surface p-4 text-sm text-soft";

  if (state === "ios-install") {
    return (
      <div className={card} data-testid="notifications-ios-hint">
        <p>To get notifications on iPhone, add Seen! to your Home Screen (Share → Add to Home Screen).</p>
      </div>
    );
  }

  if (state === "on") {
    return (
      <div className={`${card} sm:flex-row sm:items-center`} data-testid="notifications-on">
        <p className="flex-1">Notifications are on for this device.</p>
        <Button variant="ghost" onClick={disable} data-testid="disable-notifications">
          Turn off
        </Button>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className={card} data-testid="notifications-blocked">
        <p>Notifications are blocked. Allow them for this site in your browser settings to hear when it is your turn.</p>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <BellIcon />
        <p className="flex-1">Get a ping on this device when it is your turn.</p>
      </div>
      {state === "error" ? <p className="text-[#f08aba]">Could not turn notifications on. Try again.</p> : null}
      <Button
        onClick={enable}
        disabled={state === "busy"}
        className="min-h-12 bg-teal text-sm text-ink hover:bg-teal hover:brightness-110"
        data-testid="enable-notifications"
      >
        {state === "busy" ? "Turning on…" : "Turn on notifications"}
      </Button>
    </div>
  );
}
