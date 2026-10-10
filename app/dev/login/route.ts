// DEV ONLY: sign in as any email without a magic link, for local testing and e2e.
// GET /dev/login?email=alice@test.local&name=Alice&next=/   (404 in production)
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { testHooksEnabled } from "@/lib/testHooks";

const DEV_PASSWORD = "dev-password-not-secret";

export async function GET(request: NextRequest) {
  if (!testHooksEnabled) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const name = url.searchParams.get("name") ?? email?.split("@")[0];
  const next = url.searchParams.get("next") ?? "/";
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
}
