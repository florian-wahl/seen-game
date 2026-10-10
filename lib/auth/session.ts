import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentUserId } from "@/lib/supabase/server";
import { signInPath } from "./next";

/** Server-side auth gate: returns the user id or redirects to /signin?next=… */
export async function requireUserId(next: string): Promise<string> {
  // Session reads are request-time only; keep token-expiry checks (Date.now) out of prerender.
  await connection();
  const id = await currentUserId();
  if (!id) redirect(signInPath(next));
  return id;
}
