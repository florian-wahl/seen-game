"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";

const ITEM =
  "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-bold text-cream hover:bg-line active:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard sm:min-h-11 sm:gap-2 sm:px-3 sm:text-sm";

/**
 * Avatar + name button that opens "Profile" and "Sign out". On phones the menu is a bottom
 * sheet over a dimmed page (thumb-reachable, large rows); from `sm` up it is a small dropdown.
 */
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
    // The sheet covers the page on phones: keep the page behind it from scrolling.
    const sheet = window.matchMedia("(max-width: 639.98px)").matches;
    const overflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      if (sheet) document.body.style.overflow = overflow;
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
      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 animate-fade-in bg-black/60 motion-reduce:animate-none sm:hidden"
          data-testid="account-menu-backdrop"
        />
      ) : null}
      <div
        id={menuId}
        hidden={!open}
        className="fixed inset-x-0 bottom-0 z-40 animate-sheet-up rounded-t-3xl bg-raised px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_32px_rgba(0,0,0,.45)] motion-reduce:animate-none sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-48 sm:animate-none sm:rounded-2xl sm:p-2 sm:shadow-[0_12px_32px_rgba(0,0,0,.45)]"
      >
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="mb-2 flex items-center gap-3 border-b border-line px-4 pb-3 sm:hidden">
          <Avatar name={name} url={avatarUrl} size={48} />
          <div className="min-w-0">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate text-lg font-bold text-cream">{name}</p>
          </div>
        </div>
        <p className="hidden truncate px-3 pb-2 pt-1 text-xs text-muted sm:block">Signed in as {name}</p>
        <Link href="/profile" onClick={() => setOpen(false)} className={ITEM} data-testid="profile-link">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
          Profile
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className={ITEM}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
