import Link from "next/link";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { groupGames, joinNames, type HomeGame } from "@/lib/game/home";
import { Avatar } from "@/components/ui/Avatar";
import { LinkButton } from "@/components/ui/Button";
import { Page, PageSpinner } from "@/components/ui/Shell";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Home />
    </Suspense>
  );
}

const GAME_COLUMNS =
  "id, host_id, status, current_turn_id, created_at, finished_at, game_players(user_id, status)";

async function loadGames(): Promise<{ me: { id: string; name: string; avatar: string | null }; games: HomeGame[] }> {
  const meId = await requireUserId("/");
  const supabase = await supabaseServer();
  const [open, done, profile] = await Promise.all([
    supabase.from("games").select(GAME_COLUMNS).in("status", ["lobby", "in_progress"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("games").select(GAME_COLUMNS).eq("status", "finished").order("finished_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", meId).single(),
  ]);
  const rows = [...(open.data ?? []), ...(done.data ?? [])];

  const userIds = [...new Set(rows.flatMap((g) => g.game_players.map((p) => p.user_id)))];
  const turnIds = rows.map((g) => g.current_turn_id).filter((x): x is string => !!x);
  const [profiles, turns] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    turnIds.length
      ? supabase.from("turns_public").select("id, user_id").in("id", turnIds)
      : Promise.resolve({ data: [] as { id: string | null; user_id: string | null }[] }),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));
  const turnUser = new Map((turns.data ?? []).map((t) => [t.id, t.user_id]));

  const games: HomeGame[] = rows.map((g) => ({
    id: g.id,
    status: g.status,
    hostId: g.host_id,
    createdAt: g.created_at,
    finishedAt: g.finished_at,
    turnUserId: g.current_turn_id ? (turnUser.get(g.current_turn_id) ?? null) : null,
    players: g.game_players.map((p) => ({
      userId: p.user_id,
      name: names.get(p.user_id) ?? "Player",
      status: p.status,
    })),
  }));
  return {
    me: { id: meId, name: profile.data?.display_name ?? "You", avatar: profile.data?.avatar_url ?? null },
    games,
  };
}

async function Home() {
  const { me, games } = await loadGames();
  const groups = groupGames(games, me.id);
  const empty = games.every((g) => g.status === "abandoned") || games.length === 0;

  return (
    <Page>
      <header className="flex min-h-12 items-center gap-3">
        <Avatar name={me.name} url={me.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="truncate font-semibold" data-testid="me-name">{me.name}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-12 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </form>
      </header>

      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-indigo-700">Seen!</h1>
      </div>

      <LinkButton href="/new" className="min-h-14 w-full text-lg" data-testid="new-game">
        New game
      </LinkButton>

      {empty ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <p className="text-4xl" aria-hidden>🔎</p>
          <h2 className="text-lg font-bold">No games yet</h2>
          <p className="text-slate-600">Start a game and send the invite link to your friends. You can play at your own pace.</p>
        </div>
      ) : null}

      <Section title="Your turn" games={groups.yourTurn} me={me.id} tone="turn" />
      <Section title="Waiting for others" games={groups.waiting} me={me.id} tone="wait" />
      <Section title="Lobbies" games={groups.lobbies} me={me.id} tone="lobby" />
      <Section title="Recently finished" games={groups.finished} me={me.id} tone="done" />
    </Page>
  );
}

function Section({ title, games, me, tone }: { title: string; games: HomeGame[]; me: string; tone: "turn" | "wait" | "lobby" | "done" }) {
  if (games.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ul className="flex flex-col gap-2">
        {games.map((g) => (
          <li key={g.id}>
            <GameRow game={g} me={me} tone={tone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GameRow({ game, me, tone }: { game: HomeGame; me: string; tone: "turn" | "wait" | "lobby" | "done" }) {
  const others = game.players.filter((p) => p.userId !== me).map((p) => p.name);
  const title = others.length ? `with ${joinNames(others)}` : "Just you so far";
  const turnName = game.players.find((p) => p.userId === game.turnUserId)?.name;
  const badge =
    tone === "turn"
      ? { text: "Your turn", cls: "bg-indigo-600 text-white" }
      : tone === "wait"
        ? { text: turnName ? `${turnName}'s turn` : "In progress", cls: "bg-slate-100 text-slate-700" }
        : tone === "lobby"
          ? { text: `Lobby · ${game.players.length}/6`, cls: "bg-amber-100 text-amber-900" }
          : { text: "Finished", cls: "bg-emerald-100 text-emerald-900" };
  return (
    <Link
      href={`/g/${game.id}`}
      className={`flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 hover:bg-slate-50 ${tone === "turn" ? "ring-2 ring-indigo-500" : "ring-slate-200"}`}
    >
      <div className="flex -space-x-2">
        {game.players.slice(0, 3).map((p) => (
          <span key={p.userId} className="rounded-full ring-2 ring-white">
            <Avatar name={p.name} size={36} />
          </span>
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
    </Link>
  );
}
