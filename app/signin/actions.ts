"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/next";
import { supabaseServer } from "@/lib/supabase/server";

export interface SignInState {
  error?: string;
  sentTo?: string;
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Email magic link (PKCE: the verifier cookie is set on this response). */
export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? "/"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next), shouldCreateUser: true },
  });
  if (error) {
    const limited = error.status === 429 || /rate|seconds/i.test(error.message);
    return {
      error: limited
        ? "Too many attempts. Please wait a minute and try again."
        : "We could not send the email. Please try again.",
    };
  }
  return { sentTo: email };
}

/** Starts Google OAuth. Returns an error if the provider is not available. */
export async function signInWithGoogle(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await siteOrigin(), next), skipBrowserRedirect: true },
  });
  const unavailable = { error: "Google sign-in is not available right now. Use the email link instead." };
  if (error || !data.url) return unavailable;
  try {
    // A disabled provider answers 4xx instead of redirecting to Google.
    const res = await fetch(data.url, { redirect: "manual" });
    if (res.status >= 400) return unavailable;
  } catch {
    return unavailable;
  }
  redirect(data.url);
}
