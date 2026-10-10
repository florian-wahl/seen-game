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
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Your name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={defaultName}
          autoComplete="nickname"
          className="min-h-12 rounded-xl border-0 bg-white px-4 text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
