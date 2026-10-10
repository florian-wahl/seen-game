import webpush from "web-push";

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  /** ids of subscriptions the push service reports as gone (404/410); delete them. */
  gone: string[];
  failed: number;
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

/** Send a push to every subscription. Never throws: push is best effort. */
export async function sendPush(subs: StoredSubscription[], payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, gone: [], failed: 0 };
  if (subs.length === 0) return result;
  if (!configure()) {
    result.failed = subs.length;
    return result;
  }
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        result.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) result.gone.push(s.id);
        else result.failed++;
      }
    }),
  );
  return result;
}
