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
      <p className="text-5xl" aria-hidden>🙈</p>
      <h1 className="text-2xl font-extrabold">Could not join</h1>
      <p role="alert" className="text-slate-600" data-testid="join-error">
        {rpcErrorMessage(error)}
      </p>
      <LinkButton href="/" className="w-full">
        Go to my games
      </LinkButton>
    </Page>
  );
}
