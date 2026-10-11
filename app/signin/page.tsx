import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/next";
import { currentUserId } from "@/lib/supabase/server";
import { DoodleStrip } from "@/components/ui/DoodleStrip";
import { Page } from "@/components/ui/Shell";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <Suspense>
      <SignIn searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  const nextRaw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeNext(nextRaw);
  if (await currentUserId()) redirect(next);
  const err = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const initialError =
    err === "link"
      ? "That sign-in link did not work. It may have expired, or it was opened on a different device or browser than the one you asked from. Please request a new one."
      : undefined;

  return (
    <Page className="justify-center">
      <DoodleStrip height={280} className="rounded-[28px]" />
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-wide text-[60px] font-black uppercase leading-none tracking-tight text-cream">
          Seen<span className="text-mustard">!</span>
        </h1>
        <p className="text-soft">Find the picture before your friends do.</p>
      </div>
      {next.startsWith("/join/") ? (
        <p className="rounded-2xl bg-surface px-4 py-3 text-center text-sm text-cream shadow-[inset_0_0_0_2px_var(--color-mustard)]">
          You have been invited to a game. Sign in to join.
        </p>
      ) : null}
      <SignInForm next={next} initialError={initialError} />
    </Page>
  );
}
