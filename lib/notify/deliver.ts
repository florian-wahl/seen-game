import type { Message } from "./messages";
import type { PushPayload, PushResult, StoredSubscription } from "./push";

/** A player's channel choices; a missing notification_prefs row means both are on. */
export interface NotifyPrefs {
  email: boolean;
  push: boolean;
}

export function resolvePrefs(row: { email: boolean; push: boolean } | null | undefined): NotifyPrefs {
  return { email: row?.email ?? true, push: row?.push ?? true };
}

export interface DeliveryInput {
  message: Message;
  /** The player's address; undefined when the account has none. */
  email: string | undefined;
  subscriptions: StoredSubscription[];
  prefs: NotifyPrefs;
}

export interface DeliveryDeps {
  sendEmail(to: string, m: Message): Promise<unknown>;
  sendPush(subs: StoredSubscription[], payload: PushPayload): Promise<PushResult>;
}

export interface DeliveryResult {
  /** False only when an email was due and failed: the caller answers 500 so the sweep retries. */
  emailOk: boolean;
  emailError?: string;
  /** "off" when the player turned the channel off. */
  emailStatus: "sent" | "off" | "no_address" | "failed";
  push: PushResult | "off";
}

const NO_PUSH: PushResult = { sent: 0, gone: [], failed: 0 };

/**
 * Send one outbox message over the channels the player has on. A channel that is off counts as
 * handled, so the row is still marked sent and never retried for it.
 */
export async function deliver(input: DeliveryInput, deps: DeliveryDeps): Promise<DeliveryResult> {
  const { message, prefs } = input;

  // Push is best effort and runs alongside the email. A retry after an email failure may
  // push again, but the shared `tag` makes the device replace the earlier notification.
  const pushPromise: Promise<PushResult | "off"> = prefs.push
    ? input.subscriptions.length
      ? deps.sendPush(input.subscriptions, {
          title: message.pushTitle,
          body: message.pushBody,
          url: message.url,
          tag: message.tag,
        })
      : Promise.resolve(NO_PUSH)
    : Promise.resolve("off");

  let emailStatus: DeliveryResult["emailStatus"];
  let emailError: string | undefined;
  if (!prefs.email) {
    emailStatus = "off";
  } else if (!input.email) {
    emailStatus = "no_address"; // should not happen; do not retry forever
  } else {
    try {
      await deps.sendEmail(input.email, message);
      emailStatus = "sent";
    } catch (e) {
      emailStatus = "failed";
      emailError = e instanceof Error ? e.message : String(e);
    }
  }

  return { emailOk: emailStatus !== "failed", emailError, emailStatus, push: await pushPromise };
}
