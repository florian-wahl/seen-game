"use client";
// Brief highlight for a game that just became the player's turn. The provider wraps the whole home
// page, so it survives router.refresh() and a card moving between sections (which remounts the card,
// not the provider). It remembers which game ids were in "Your turn" on earlier renders; the first
// render only seeds that memory, so nothing lights up on page load.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const HIGHLIGHT_MS = 2000;
const Lit = createContext<ReadonlySet<string>>(new Set());

export function TurnHighlightProvider({ turnIds, children }: { turnIds: string[]; children: ReactNode }) {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [lit, setLit] = useState<ReadonlySet<string>>(new Set());
  const key = turnIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const before = seen.current;
    seen.current = new Set(ids);
    if (!before) return; // first render: seed only
    const fresh = ids.filter((id) => !before.has(id));
    if (fresh.length === 0) return;
    setLit((prev) => new Set([...prev, ...fresh]));
    const t = setTimeout(() => {
      timers.current.delete(t);
      setLit((prev) => new Set([...prev].filter((id) => !fresh.includes(id))));
    }, HIGHLIGHT_MS);
    timers.current.add(t);
  }, [key]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return <Lit.Provider value={lit}>{children}</Lit.Provider>;
}

/** Wraps a "Your turn" card; glows while its game is freshly the player's turn. */
export function TurnHighlight({ gameId, children }: { gameId: string; children: ReactNode }) {
  const on = useContext(Lit).has(gameId);
  return (
    <div className={`rounded-3xl ${on ? "just-turned" : ""}`} data-just-turned={on ? "true" : undefined}>
      {children}
    </div>
  );
}
