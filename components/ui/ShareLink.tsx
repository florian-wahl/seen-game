"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "./Button";

const noopSubscribe = () => () => {};

/** Origin of the current page ("" during SSR). */
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

/** Shows a link as text with a Share button (navigator.share, else copy). */
export function ShareLink({ path, title, text }: { path: string; title: string; text: string }) {
  const origin = useOrigin();
  const url = origin ? `${origin}${path}` : path;
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("share-link-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("copy");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        id="share-link-text"
        data-testid="invite-link"
        className="break-all rounded-xl bg-slate-100 px-3 py-3 font-mono text-sm text-slate-800 select-all"
      >
        {url}
      </p>
      <Button onClick={share} data-testid="share-button">
        {copied ? "Copied!" : "Share invite link"}
      </Button>
    </div>
  );
}
