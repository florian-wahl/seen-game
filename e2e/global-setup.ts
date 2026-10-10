// Points the local outbox trigger (Vault notify_url) at the server under test, so notification
// e2e works on any port. Teardown restores it to the dev server (APP_URL, default :3000).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { FullConfig } from "@playwright/test";

function setNotifyPort(port: string) {
  const r = spawnSync("npx", ["tsx", "--env-file=.env.local", "scripts/setup-local-notify.ts", "--port", port], {
    encoding: "utf8",
  });
  if (r.status !== 0) console.warn(`[e2e] could not set notify_url to :${port}: ${r.stderr || r.stdout}`);
}

function devPort() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  return process.env.APP_URL ? new URL(process.env.APP_URL).port || "3000" : "3000";
}

export default function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3006";
  const port = new URL(baseURL).port || "80";
  setNotifyPort(port);
  return () => setNotifyPort(devPort());
}
