"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Card";
import { saveDisplayName, type OnboardingState } from "./actions";

export function NameForm({ next, defaultName }: { next: string; defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(saveDisplayName, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <ErrorNote>{state.error}</ErrorNote>
      <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Your name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={defaultName}
          autoComplete="nickname"
          className="min-h-14 rounded-2xl border-0 bg-surface px-4 text-base font-normal normal-case tracking-normal text-cream placeholder:text-dim focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--color-mustard)]"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
