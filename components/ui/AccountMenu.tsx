"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";

/** Avatar + name button that opens a small dropdown holding "Sign out". */
export function AccountMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard"
        data-testid="account-menu"
      >
        <Avatar name={name} url={avatarUrl} size={40} />
        <span className="max-w-24 truncate text-sm font-bold text-cream" data-testid="me-name">
          {name}
        </span>
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl bg-raised p-2 shadow-[0_12px_32px_rgba(0,0,0,.45)]"
      >
        <p className="truncate px-3 pb-2 pt-1 text-xs text-muted">Signed in as {name}</p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-cream hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
