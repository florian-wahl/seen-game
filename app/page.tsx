import Link from "next/link";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { finishedStatus, groupGames, joinNames, type HomeGame } from "@/lib/game/home";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Avatar } from "@/components/ui/Avatar";
import { DoodleStrip } from "@/components/ui/DoodleStrip";
import { LinkButton } from "@/components/ui/Button";
import { Page, PageSpinner } from "@/components/ui/Shell";
import { HomeLive } from "@/components/home/HomeLive";
import { TurnHighlight, TurnHighlightProvider } from "@/components/home/TurnHighlight";
import { EnableNotifications } from "@/components/notifications/EnableNotifications";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Home />
    </Suspense>
  );
}

const GAME_COLUMNS =
  "id, host_id, status, current_turn_id, created_at, finished_at, game_players(user_id, status, total_ms, wrong_taps)";

async function loadGames(): Promise<{
  me: { id: string; name: string; avatar: string | null; pushOn: boolean };
  games: HomeGame[];
}> {
  const meId = await requireUserId("/");
  const supabase = await supabaseServer();
  const [open, done, profile, prefs] = await Promise.all([
    supabase.from("games").select(GAME_COLUMNS).in("status", ["lobby", "in_progress"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("games").select(GAME_COLUMNS).eq("status", "finished").order("finished_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", meId).single(),
    supabase.from("notification_prefs").select("push").eq("user_id", meId).maybeSingle(),
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
      totalMs: p.total_ms,
      wrongTaps: p.wrong_taps,
    })),
  }));
  return {
    me: {
      id: meId,
      name: profile.data?.display_name ?? "You",
      avatar: profile.data?.avatar_url ?? null,
      pushOn: prefs.data?.push ?? true,
    },
    games,
  };
}

async function Home() {
  const { me, games } = await loadGames();
  const groups = groupGames(games, me.id);
  const empty = games.every((g) => g.status === "abandoned") || games.length === 0;

  return (
    <Page>
      <HomeLive userId={me.id} />
      <TurnHighlightProvider turnIds={groups.yourTurn.map((g) => g.id)}>
        <header className="flex min-h-12 items-center gap-3">
          <h1 className="min-w-0 flex-1 font-wide text-3xl font-black uppercase leading-none tracking-tight text-cream">
            Seen<span className="text-mustard">!</span>
          </h1>
          <AccountMenu name={me.name} avatarUrl={me.avatar} />
        </header>

        {/* Players who turned push off on their profile are not nudged to turn it on here. */}
        {me.pushOn ? <EnableNotifications /> : null}

        {empty ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface p-8 text-center">
            <svg
              aria-hidden
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-mustard"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5L21 21" />
            </svg>
            <h2 className="font-wide text-lg font-black uppercase text-cream">No games yet</h2>
            <p className="text-soft">Start a game and send the invite link to your friends. You can play at your own pace.</p>
          </div>
        ) : null}

        <Section title="Your turn" games={groups.yourTurn} me={me.id} tone="turn" />
        <Section title="Waiting for others" games={groups.waiting} me={me.id} tone="wait" />
        <Section title="Lobbies" games={groups.lobbies} me={me.id} tone="lobby" />
        <Section title="Recently finished" games={groups.finished} me={me.id} tone="done" />

        <div className="sticky bottom-0 mt-auto -mx-4 bg-gradient-to-t from-ink from-70% to-transparent px-4 pt-6" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <LinkButton href="/new" className="min-h-14 w-full text-lg" data-testid="new-game">
            New game
          </LinkButton>
        </div>
      </TurnHighlightProvider>
    </Page>
  );
}

function Section({ title, games, me, tone }: { title: string; games: HomeGame[]; me: string; tone: "turn" | "wait" | "lobby" | "done" }) {
  if (games.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">{title}</h2>
      <ul className="flex flex-col gap-2">
        {games.map((g) => (
          <li key={g.id}>
            {tone === "turn" ? (
              <TurnHighlight gameId={g.id}>
                <GameRow game={g} me={me} tone={tone} />
              </TurnHighlight>
            ) : (
              <GameRow game={g} me={me} tone={tone} />
            )}
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
  const status =
    tone === "wait"
      ? turnName
        ? `${turnName}'s turn`
        : "In progress"
      : tone === "lobby"
        ? `Lobby · ${game.players.length}/6`
        : finishedStatus(game, me);
  if (tone === "turn") {
    return (
      <Link
        href={`/g/${game.id}`}
        className="block overflow-hidden rounded-3xl bg-surface shadow-[inset_0_0_0_2px_var(--color-mustard)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard"
      >
        <DoodleStrip height={132} seed={game.players.length} />
        <div className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-wide text-lg font-black uppercase leading-tight text-mustard">Your turn</p>
            <p className="truncate text-soft">{title}</p>
          </div>
          <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mustard text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
            </svg>
          </span>
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={`/g/${game.id}`}
      className={`flex min-h-16 items-center gap-3 rounded-2xl p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard ${
        tone === "done" ? "bg-transparent shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface" : "bg-surface hover:bg-raised"
      }`}
    >
      <div className="flex shrink-0 -space-x-2">
        {game.players.slice(0, 3).map((p) => (
          <span key={p.userId} className={`rounded-full ring-2 ${tone === "done" ? "ring-ink" : "ring-surface"}`}>
            <Avatar name={p.name} size={36} />
          </span>
        ))}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-cream">{title}</span>
        <span className="block truncate text-sm text-muted">{status}</span>
      </span>
    </Link>
  );
}
