#!/usr/bin/env bash
# Stores the Vault secrets the outbox trigger needs in the HOSTED (linked) Supabase project:
#   notify_url    = $APP_URL/api/jobs/notify (default https://seen.imjustbored.com)
#   notify_secret = $NOTIFY_SECRET from .env.prod-secrets
# Same SQL as scripts/setup-local-notify.ts. Uses psql from the local Supabase DB container.
# Usage: bash scripts/setup-remote-notify.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.prod-secrets; set +a
APP_URL="${APP_URL:-https://seen.imjustbored.com}"
POOLER="$(cat supabase/.temp/pooler-url)?sslmode=require"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_seen-game}"

SQL="select vault.create_secret(:'value', :'name') where not exists (select 1 from vault.secrets where name = :'name');
select vault.update_secret(id, :'value', :'name') from vault.secrets where name = :'name';"

set_secret() {
  echo "$SQL" | docker exec -i -e PGPASSWORD="$SUPABASE_DB_PASSWORD" "$CONTAINER" \
    psql "$POOLER" -v ON_ERROR_STOP=1 -v name="$1" -v value="$2" -q -t -A >/dev/null
  echo "vault secret $1 set"
}
set_secret notify_url "$APP_URL/api/jobs/notify"
set_secret notify_secret "$NOTIFY_SECRET"

echo "select 'vault: ' || string_agg(name, ', ' order by name) from vault.secrets;
select 'cron: ' || string_agg(jobname || ' (' || schedule || ')', ', ') from cron.job;" |
  docker exec -i -e PGPASSWORD="$SUPABASE_DB_PASSWORD" "$CONTAINER" psql "$POOLER" -t -A
