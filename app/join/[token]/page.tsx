import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/game/errors";
import { supabaseServer } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui/Button";
import { Page, PageSpinner } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "Join game" };

export default function JoinPage(props: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={<PageSpinner label="Joining…" />}>
      <Join params={props.params} />
    </Suspense>
  );
}

async function Join({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  await requireUserId(`/join/${token}`);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("join_game", { token });
  if (!error) redirect(`/g/${(data as unknown as { game_id: string }).game_id}`);

  return (
    <Page className="items-center justify-center text-center">
      <svg
        aria-hidden
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-magenta"
      >
        <circle cx="12" cy="12" r="9.5" />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
      </svg>
      <h1 className="font-wide text-2xl font-black uppercase text-cream">Could not join</h1>
      <p role="alert" className="text-soft" data-testid="join-error">
        {rpcErrorMessage(error)}
      </p>
      <LinkButton href="/" className="w-full">
        Go to my games
      </LinkButton>
    </Page>
  );
}
