"use server";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

export interface NameState {
  error?: string;
  /** The name as saved, after trimming. */
  saved?: string;
}

export async function saveName(_prev: NameState, formData: FormData): Promise<NameState> {
  await requireUserId("/profile");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 60) {
    return { error: "Please enter a name between 1 and 60 characters." };
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("update_profile", { display_name: name });
  if (error) return { error: "We could not save your name. Please try again." };
  return { saved: String((data as { display_name?: string } | null)?.display_name ?? name) };
}

export interface Prefs {
  email: boolean;
  push: boolean;
}

/** Update one or both channels; returns what is now stored, or an error message. */
export async function savePrefs(change: Partial<Prefs>): Promise<{ prefs?: Prefs; error?: string }> {
  await requireUserId("/profile");
  const args: { email?: boolean; push?: boolean } = {};
  if (typeof change.email === "boolean") args.email = change.email;
  if (typeof change.push === "boolean") args.push = change.push;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("set_notification_prefs", args);
  if (error || !data) return { error: "We could not save that change. Please try again." };
  const p = data as { email: boolean; push: boolean };
  return { prefs: { email: p.email, push: p.push } };
}
