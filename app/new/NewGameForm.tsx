"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/Card";
import { createGame, type NewGameState } from "./actions";

function Choice({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { value: number; label: string; hint: string }[];
  defaultValue: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === defaultValue}
            className="peer sr-only"
          />
          <span className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl bg-surface px-2 py-3 text-center text-cream transition hover:bg-raised peer-checked:bg-mustard peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mustard">
            <span className="font-wide text-3xl font-black leading-none tabular-nums">{o.label}</span>
            <span className="text-xs font-semibold opacity-80">{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function NewGameForm() {
  const [state, action, pending] = useActionState<NewGameState, FormData>(createGame, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <ErrorNote>{state.error}</ErrorNote>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Rounds per player</legend>
        <Choice
          name="rounds"
          defaultValue={10}
          options={[
            { value: 5, label: "5", hint: "Quick" },
            { value: 10, label: "10", hint: "Classic" },
            { value: 20, label: "20", hint: "Marathon" },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Pictures on the board</legend>
        <Choice
          name="board_size"
          defaultValue={300}
          options={[
            { value: 200, label: "200", hint: "Easier" },
            { value: 300, label: "300", hint: "Classic" },
            { value: 500, label: "500", hint: "Tough" },
          ]}
        />
      </fieldset>
      <Button type="submit" disabled={pending} className="min-h-14 w-full text-lg" data-testid="create-game">
        {pending ? "Creating…" : "Create game"}
      </Button>
    </form>
  );
}
