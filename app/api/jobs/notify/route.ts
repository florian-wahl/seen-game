import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAuthorized } from "@/lib/notify/auth";
import { sendEmail } from "@/lib/notify/email";
import { buildMessage, type OutboxKind } from "@/lib/notify/messages";
import { sendPush } from "@/lib/notify/push";

/**
 * Delivery endpoint for notification_outbox rows. Called by Postgres (pg_net) right after
 * an insert and again by sweep_turns() for rows still unsent after 5 minutes (max 10 attempts).
 *
 * - 401 without the shared secret
 * - 200 when delivered (or already delivered: idempotent)
 * - 500 when the email failed, so the sweep retries
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.NOTIFY_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let id: number;
  try {
    const body = (await request.json()) as { id?: unknown };
    id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("bad id");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: row, error: rowErr } = await db.from("notification_outbox").select("*").eq("id", id).maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.sent_at) return NextResponse.json({ ok: true, skipped: "already_sent" });

  const markSent = async () => {
    await db
      .from("notification_outbox")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("sent_at", null);
  };

  const [game, players, user, subs] = await Promise.all([
    db.from("games").select("id, rounds_per_player").eq("id", row.game_id).maybeSingle(),
    db.from("game_players").select("user_id, profiles(display_name)").eq("game_id", row.game_id),
    db.auth.admin.getUserById(row.user_id),
    db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", row.user_id),
  ]);
  if (!game.data) {
    // Game vanished (cascade should have removed the row too): nothing to say.
    await markSent();
    return NextResponse.json({ ok: true, skipped: "game_gone" });
  }

  const otherNames = (players.data ?? [])
    .filter((p) => p.user_id !== row.user_id)
    .map((p) => p.profiles?.display_name ?? "Player");
  const message = buildMessage({
    kind: row.kind as OutboxKind,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    gameId: row.game_id,
    appUrl: process.env.APP_URL ?? new URL(request.url).origin,
    otherNames,
    roundsPerPlayer: game.data.rounds_per_player,
  });

  // Push is best effort and runs alongside the email. A retry after an email failure may
  // push again, but the shared `tag` makes the device replace the earlier notification.
  const pushPromise = sendPush(subs.data ?? [], {
    title: message.pushTitle,
    body: message.pushBody,
    url: message.url,
    tag: message.tag,
  });

  let emailOk = false;
  let emailError: string | undefined;
  const email = user.data.user?.email;
  if (!email) {
    emailOk = true; // nobody to email (should not happen); do not retry forever
  } else {
    try {
      await sendEmail(email, message);
      emailOk = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      console.error(`notify ${id}: email failed: ${emailError}`);
    }
  }

  const push = await pushPromise;
  if (push.gone.length) await db.from("push_subscriptions").delete().in("id", push.gone);

  if (!emailOk) return NextResponse.json({ error: "email_failed", detail: emailError, push }, { status: 500 });

  await markSent();
  return NextResponse.json({ ok: true, push });
}
