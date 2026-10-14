import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth/next";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { Page } from "@/components/ui/Shell";
import { NameForm } from "./NameForm";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <Suspense>
      <Onboarding searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const userId = await requireUserId("/onboarding");
  const supabase = await supabaseServer();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).single();

  return (
    <Page className="justify-center">
      <p className="text-center font-wide text-xl font-black uppercase leading-none tracking-tight text-cream" aria-hidden>
        Seen<span className="text-mustard">!</span>
      </p>
      <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-[28px] bg-paper shadow-[0_0_0_3px_var(--color-mustard),0_0_40px_rgba(245,185,63,0.3)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG */}
        <img src="/library/v2/necktie.svg" alt="" aria-hidden width={104} height={104} draggable={false} className="-rotate-6" />
      </div>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-wide text-3xl font-black uppercase leading-tight tracking-tight text-cream">What should friends call you?</h1>
        <p className="text-soft">This is the name other players see in games.</p>
      </div>
      <NameForm next={next} defaultName={data?.display_name ?? ""} />
    </Page>
  );
}
