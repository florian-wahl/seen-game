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
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">What should friends call you?</h1>
        <p className="text-slate-600">This is the name other players see in games.</p>
      </div>
      <NameForm next={next} defaultName={data?.display_name ?? ""} />
    </Page>
  );
}
