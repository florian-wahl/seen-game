"use client";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Card";
import { EnableNotifications } from "@/components/notifications/EnableNotifications";
import { saveName, savePrefs, type NameState, type Prefs } from "./actions";

const sectionTitle = "text-xs font-bold uppercase tracking-[0.12em] text-muted";

export function NameForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveName, {});
  const [dirty, setDirty] = useState(false);
  return (
    <form action={action} onSubmit={() => setDirty(false)} className="flex flex-col gap-3">
      <label htmlFor="profile-name" className={sectionTitle}>
        Your name
      </label>
      <p className="-mt-1 text-sm text-soft">Other players see this name in every game, including ones already running.</p>
      <ErrorNote>{state.error}</ErrorNote>
      <div className="flex gap-2">
        <input
          id="profile-name"
          name="name"
          required
          maxLength={60}
          defaultValue={state.saved ?? defaultName}
          autoComplete="nickname"
          onChange={() => setDirty(true)}
          className="min-h-14 min-w-0 flex-1 rounded-2xl border-0 bg-surface px-4 text-base text-cream placeholder:text-dim focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--color-mustard)]"
          data-testid="profile-name"
        />
        <Button type="submit" disabled={pending} className="min-h-14 px-6" data-testid="save-name">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="min-h-5 text-sm text-teal" role="status" data-testid="name-status">
        {state.saved && !dirty && !pending ? `Saved. You're ${state.saved}.` : ""}
      </p>
    </form>
  );
}

function Switch({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block font-bold text-cream">
          {label}
        </label>
        <p className="text-sm text-soft">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard ${
          checked ? "bg-teal" : "bg-line-strong"
        }`}
        data-testid={id}
      >
        <span
          aria-hidden
          className={`absolute top-1 h-6 w-6 rounded-full bg-cream shadow transition-[left] ${checked ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export function NotificationPrefs({ initial, email }: { initial: Prefs; email: string | null }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const change = (patch: Partial<Prefs>) => {
    const before = prefs;
    setPrefs({ ...prefs, ...patch }); // optimistic
    setError(undefined);
    startTransition(async () => {
      const r = await savePrefs(patch);
      if (r.prefs) setPrefs(r.prefs);
      else {
        setPrefs(before);
        setError(r.error);
      }
    });
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="notifications-title">
      <h2 id="notifications-title" className={sectionTitle}>
        Notifications
      </h2>
      <p className="-mt-1 text-sm text-soft">For your turn, a reminder after 24 hours, and the final results.</p>
      <ErrorNote>{error}</ErrorNote>
      <Switch
        id="pref-email"
        label="Email"
        hint={`A reminder after 24 hours and the final results, sent to ${email ?? "your sign-in address"}`}
        checked={prefs.email}
        disabled={pending}
        onChange={(v) => change({ email: v })}
      />
      <Switch
        id="pref-push"
        label="Push notifications"
        hint={prefs.push ? "Also when it's your turn, on every device where you turned them on" : "Off on all your devices"}
        checked={prefs.push}
        disabled={pending}
        onChange={(v) => change({ push: v })}
      />
      {prefs.push ? <EnableNotifications /> : null}
    </section>
  );
}
