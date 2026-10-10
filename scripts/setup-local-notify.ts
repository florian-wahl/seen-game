// Stores the Vault secrets the outbox trigger needs, in the LOCAL Supabase Postgres (Docker):
//   notify_url    = http://host.docker.internal:<port>/api/jobs/notify
//   notify_secret = $NOTIFY_SECRET
// Idempotent (updates when the secret already exists). Does not touch any other data.
// Usage: npm run db:setup-notify [-- --port 3000]
import { spawnSync } from "node:child_process";

const argPort = process.argv.indexOf("--port") > 0 ? process.argv[process.argv.indexOf("--port") + 1] : undefined;
const port = argPort ?? (process.env.APP_URL ? new URL(process.env.APP_URL).port : "") ?? "";
const url = `http://host.docker.internal:${port || "3000"}/api/jobs/notify`;
const secret = process.env.NOTIFY_SECRET;
if (!secret) {
  console.error("NOTIFY_SECRET is not set (.env.local)");
  process.exit(1);
}

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_seen-game";

// :'name' makes psql quote the value as a literal, so nothing is interpolated by hand.
const sql = `
select vault.create_secret(:'value', :'name') where not exists (select 1 from vault.secrets where name = :'name');
select vault.update_secret(id, :'value', :'name') from vault.secrets where name = :'name';
`;

for (const [name, value] of [
  ["notify_url", url],
  ["notify_secret", secret],
] as const) {
  const r = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", `name=${name}`, "-v", `value=${value}`, "-q", "-t", "-A"],
    { input: sql, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(`failed to set ${name}:\n${r.stderr}`);
    process.exit(1);
  }
  console.log(`vault secret ${name} set${name === "notify_url" ? ` (${url})` : ""}`);
}
