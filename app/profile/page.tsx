import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { resolvePrefs } from "@/lib/notify/deliver";
import { formatTotal } from "@/lib/game/format";
import type { BestTime } from "@/lib/game/types";
import { Header, Page, PageSpinner } from "@/components/ui/Shell";
import { NameForm, NotificationPrefs } from "./ProfileForms";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Page>
      <Header title="Profile" />
      <Suspense fallback={<PageSpinner />}>
        <Profile />
      </Suspense>
    </Page>
  );
}

async function Profile() {
  const userId = await requireUserId("/profile");
  const supabase = await supabaseServer();
  const [profile, prefs, user, best] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).single(),
    supabase.from("notification_prefs").select("email, push").eq("user_id", userId).maybeSingle(),
    supabase.auth.getUser(),
    supabase.rpc("my_best_times"),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <NameForm defaultName={profile.data?.display_name ?? ""} />
      <BestTimes times={(best.data as unknown as BestTime[] | null) ?? []} />
      <NotificationPrefs initial={resolvePrefs(prefs.data)} email={user.data.user?.email ?? null} />
    </div>
  );
}

/** Lowest total per game type (issue #16). Hidden until the player has finished a game that counts. */
function BestTimes({ times }: { times: BestTime[] }) {
  if (times.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="best-times-title" data-testid="best-times">
      <h2 id="best-times-title" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Best times
      </h2>
      <p className="-mt-1 text-sm text-soft">Your lowest total in finished games, wrong-tap penalties included.</p>
      <ul className="flex flex-col gap-2">
        {times.map((t) => (
          <li
            key={`${t.rounds}-${t.board_size}`}
            className="flex items-center gap-4 rounded-2xl bg-surface px-4 py-3"
            data-testid="best-time"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold text-cream">
                {t.rounds} rounds · {t.board_size} pictures
              </p>
              <p className="text-sm text-muted">
                {t.games} {t.games === 1 ? "game" : "games"}
              </p>
            </div>
            <span className="font-wide text-xl font-black tabular-nums text-mustard">{formatTotal(t.best_ms)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
