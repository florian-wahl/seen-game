// Prints a one-time sign-in link for an email address, without sending any email (admin API).
// For testing with extra players when email delivery isn't available. Creates the user if needed.
// Usage: npx tsx --env-file=.env.prod-secrets scripts/sign-in-link.ts <email> [--app https://seen.imjustbored.com]
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) throw new Error("usage: sign-in-link.ts <email> [--app <url>]");
  const i = process.argv.indexOf("--app");
  const app = i > 0 ? process.argv[i + 1] : (process.env.APP_URL ?? "https://seen.imjustbored.com");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  let { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error?.code === "user_not_found") {
    ({ data, error } = await admin.auth.admin.generateLink({ type: "invite", email }));
  }
  if (error) throw error;
  const type = data.properties.verification_type;
  console.log(`${app}/auth/callback?token_hash=${data.properties.hashed_token}&type=${type}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
