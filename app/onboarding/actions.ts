"use server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/next";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
}

export async function saveDisplayName(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const next = safeNext(String(formData.get("next") ?? "/"));
  await requireUserId("/onboarding");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 60) {
    return { error: "Please enter a name between 1 and 60 characters." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("update_profile", { display_name: name });
  if (error) return { error: "We could not save your name. Please try again." };
  await supabase.auth.updateUser({ data: { seen_onboarded: true } });
  redirect(next);
}
