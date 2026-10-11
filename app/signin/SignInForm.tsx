"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Card";
import { sendMagicLink, signInWithGoogle, type SignInState } from "./actions";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mail, mailAction, mailPending] = useActionState<SignInState, FormData>(sendMagicLink, {});
  const [google, googleAction, googlePending] = useActionState<SignInState, FormData>(
    signInWithGoogle,
    {},
  );

  if (mail.sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center" data-testid="check-email">
        <svg
          aria-hidden
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-mustard"
        >
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M3.5 7.5l8.5 6 8.5-6" />
        </svg>
        <h2 className="font-wide text-xl font-black uppercase text-cream">Check your email</h2>
        <p className="text-soft">
          We sent a sign-in link to <strong className="break-all">{mail.sentTo}</strong>. Open it on this
          device to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote>{mail.error ?? google.error ?? initialError}</ErrorNote>
      <form action={mailAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="min-h-14 rounded-2xl border-0 bg-surface px-4 text-base font-normal normal-case tracking-normal text-cream placeholder:text-dim focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--color-mustard)]"
          />
        </label>
        <Button type="submit" disabled={mailPending}>
          {mailPending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <form action={googleAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="secondary" className="w-full" disabled={googlePending}>
          {googlePending ? "Connecting…" : "Continue with Google"}
        </Button>
      </form>
    </div>
  );
}
