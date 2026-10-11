# Deploying Seen!

Production: https://seen.imjustbored.com, Vercel project `seen` (florianwahls-projects), connected to
GitHub, so every push to `main` deploys. Database: Supabase project `seen`, ref `vzqudzbdpiuhzddsunit`,
us-east-1. Email: Resend, sending domain `seen.imjustbored.com`. DNS: Cloudflare (`A seen → 76.76.21.21`,
DNS only; Resend DKIM/SPF/MX records under `seen`).

Local secret files (gitignored, never commit): `.env.prod-secrets` (DB password, NOTIFY_SECRET, VAPID
keys, Supabase URL/keys), `.env.deploy` (RESEND_API_KEY).

## Vercel environment (Production only)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NOTIFY_SECRET`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_URL`, `EMAIL_FROM`,
`RESEND_API_KEY`. Never set `NEXT_PUBLIC_E2E_TEST_HOOKS` (the build refuses it on `VERCEL_ENV=production`).
Previews have no env on purpose: they would otherwise write to the production database.

## Database changes

```sh
source .env.prod-secrets
supabase db push -p "$SUPABASE_DB_PASSWORD"          # new migrations
npx tsx --env-file=.env.prod-secrets scripts/import-library.ts   # after manifest/picture changes
```

Vault secrets (once, or when NOTIFY_SECRET changes): `bash scripts/setup-remote-notify.sh` sets `notify_url`
(`https://seen.imjustbored.com/api/jobs/notify`) and `notify_secret` (`$NOTIFY_SECRET`); needs local Supabase running.

## Auth (Supabase dashboard → Authentication)

- URL Configuration: Site URL `https://seen.imjustbored.com`; redirect URL `https://seen.imjustbored.com/auth/callback`.
- SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key,
  sender `noreply@seen.imjustbored.com`, name `Seen!`.
- Google provider: enabled with an OAuth client from Google Cloud project `Seen` (Google Auth Platform,
  External, published). Client: Web application; JS origin `https://seen.imjustbored.com`; redirect URI
  `https://vzqudzbdpiuhzddsunit.supabase.co/auth/v1/callback`. Client ID/secret live only in the Supabase dashboard.
