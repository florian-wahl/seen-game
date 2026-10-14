"use client";
import { useActionState, type ReactNode } from "react";
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

function Toggle({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-2xl bg-surface p-4 hover:bg-raised">
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-cream">{title}</span>
        <span className="block text-sm text-soft">{children}</span>
      </span>
      <input type="checkbox" role="switch" name={name} className="peer sr-only" data-testid={name} />
      <span
        aria-hidden
        className="relative h-8 w-14 shrink-0 rounded-full bg-line-strong transition after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-cream after:shadow after:transition-[left] peer-checked:bg-teal peer-checked:after:left-7 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mustard"
      />
    </label>
  );
}

export function NewGameForm() {
  const [state, action, pending] = useActionState<NewGameState, FormData>(createGame, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <ErrorNote>{state.error}</ErrorNote>
      <section className="flex flex-col gap-6" aria-labelledby="game-settings-title">
        <h2 id="game-settings-title" className="font-wide text-lg font-black uppercase tracking-tight text-cream">
          Game settings
        </h2>
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
        <Toggle name="monochrome" title="Monochrome">
          Every picture in black and white. Find it by its shape alone.
        </Toggle>
        <Toggle name="scatter" title="Scattered board">
          No rows or columns: the pictures are strewn across the board.
        </Toggle>
      </section>
      <Button type="submit" disabled={pending} className="min-h-14 w-full text-lg" data-testid="create-game">
        {pending ? "Creating…" : "Create game"}
      </Button>
    </form>
  );
}
