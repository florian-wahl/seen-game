import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Service-role client. Server only; bypasses RLS. Use for start_game_internal and jobs. */
export function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
