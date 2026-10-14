import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { resolvePrefs } from "@/lib/notify/deliver";
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
  const [profile, prefs, user] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).single(),
    supabase.from("notification_prefs").select("email, push").eq("user_id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <NameForm defaultName={profile.data?.display_name ?? ""} />
      <NotificationPrefs initial={resolvePrefs(prefs.data)} email={user.data.user?.email ?? null} />
    </div>
  );
}
