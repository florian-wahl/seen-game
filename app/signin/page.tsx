import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/next";
import { currentUserId } from "@/lib/supabase/server";
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
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-indigo-700">Seen!</h1>
        <p className="text-slate-600">Find the picture before your friends do.</p>
      </div>
      {next.startsWith("/join/") ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 ring-1 ring-amber-200">
          You have been invited to a game. Sign in to join.
        </p>
      ) : null}
      <SignInForm next={next} initialError={initialError} />
    </Page>
  );
}
