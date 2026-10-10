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
          <span className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-white px-2 py-2 text-center ring-1 ring-slate-300 peer-checked:bg-indigo-50 peer-checked:ring-2 peer-checked:ring-indigo-600 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-600">
            <span className="text-xl font-bold">{o.label}</span>
            <span className="text-xs text-slate-500">{o.hint}</span>
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
        <legend className="mb-1 font-semibold">Rounds per player</legend>
        <Choice
          name="rounds"
          defaultValue={5}
          options={[
            { value: 3, label: "3", hint: "Quick" },
            { value: 5, label: "5", hint: "Classic" },
            { value: 10, label: "10", hint: "Marathon" },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Pictures on the board</legend>
        <Choice
          name="board_size"
          defaultValue={200}
          options={[
            { value: 100, label: "100", hint: "Easier" },
            { value: 200, label: "200", hint: "Classic" },
            { value: 300, label: "300", hint: "Tough" },
          ]}
        />
      </fieldset>
      <Button type="submit" disabled={pending} className="min-h-14 text-lg" data-testid="create-game">
        {pending ? "Creating…" : "Create game"}
      </Button>
    </form>
  );
}
