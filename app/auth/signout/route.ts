import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// POST only (a form button), so link prefetching can never sign anyone out.
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/signin", request.url), { status: 303 });
}
