"use client";
// Keeps the home page current: re-renders the server page (router.refresh) whenever the private
// Broadcast channel `user:<id>` says one of this player's games changed (docs/API.md "Realtime
// contract"), on focus/visibility, and every 20 s as a fallback (skipped while the tab is hidden;
// becoming visible refreshes at once). Renders nothing; the server component stays the source of data.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 150;
const POLL_MS = 20_000;

export function HomeLive({ userId }: { userId: string }) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const refresh = () => routerRef.current.refresh();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, DEBOUNCE_MS);
    };

    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    void (async () => {
      try {
        await supabase.realtime.setAuth(); // use the current session's JWT for the private channel
      } catch {
        // polling fallback still works
      }
      if (cancelled) return;
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, scheduleRefresh)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") refresh(); // catch anything missed while (re)connecting
        });
    })();

    const poll = setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, POLL_MS);
    // Coming back usually fires both focus and visibilitychange: debounce them into one refresh.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(poll);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
