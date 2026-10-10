// Magic-link / OAuth landing. Handles the PKCE `code` (default Supabase email
// template and OAuth) and `token_hash` (custom templates). Then routes to
// onboarding (first sign-in) or the requested page.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/auth/next";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const fail = () =>
    NextResponse.redirect(new URL(`/signin?error=link&next=${encodeURIComponent(next)}`, url));

  const supabase = await supabaseServer();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (!ok) return fail();

  const { data } = await supabase.auth.getUser();
  const onboarded = Boolean(data.user?.user_metadata?.seen_onboarded);
  const dest = onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(dest, url));
}
