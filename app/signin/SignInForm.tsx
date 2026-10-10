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
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 text-center ring-1 ring-slate-200" data-testid="check-email">
        <p className="text-4xl" aria-hidden>
          📬
        </p>
        <h2 className="text-lg font-bold">Check your email</h2>
        <p className="text-slate-600">
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
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="min-h-12 rounded-xl border-0 bg-white px-4 text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
        </label>
        <Button type="submit" disabled={mailPending}>
          {mailPending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-300" />
        or
        <span className="h-px flex-1 bg-slate-300" />
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
