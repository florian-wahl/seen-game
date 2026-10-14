import { describe, expect, it, vi } from "vitest";
import { deliver, resolvePrefs, type DeliveryDeps } from "./deliver";
import type { Message } from "./messages";

const message = {
  subject: "Your turn in Seen!",
  pushTitle: "Your turn",
  pushBody: "Find the picture",
  url: "https://seen.test/g/1/play",
  tag: "turn-1",
} as Message;
const subs = [{ id: "s1", endpoint: "https://push.example/s1", p256dh: "k", auth: "a" }];

function deps(over: Partial<DeliveryDeps> = {}) {
  return {
    sendEmail: vi.fn<DeliveryDeps["sendEmail"]>().mockResolvedValue("smtp"),
    sendPush: vi.fn<DeliveryDeps["sendPush"]>().mockResolvedValue({ sent: 1, gone: [], failed: 0 }),
    ...over,
  };
}

describe("resolvePrefs", () => {
  it("treats a missing row as both channels on", () => {
    expect(resolvePrefs(null)).toEqual({ email: true, push: true });
    expect(resolvePrefs(undefined)).toEqual({ email: true, push: true });
  });
  it("keeps the stored choices", () => {
    expect(resolvePrefs({ email: false, push: true })).toEqual({ email: false, push: true });
  });
});

describe("deliver", () => {
  it("sends email and push when both are on", async () => {
    const d = deps();
    const r = await deliver({ message, email: "a@test.local", subscriptions: subs, prefs: { email: true, push: true } }, d);
    expect(d.sendEmail).toHaveBeenCalledWith("a@test.local", message);
    expect(d.sendPush).toHaveBeenCalledWith(subs, {
      title: "Your turn",
      body: "Find the picture",
      url: message.url,
      tag: "turn-1",
    });
    expect(r).toMatchObject({ emailOk: true, emailStatus: "sent", push: { sent: 1 } });
  });

  it("skips email when it is off, and still counts as delivered", async () => {
    const d = deps();
    const r = await deliver({ message, email: "a@test.local", subscriptions: subs, prefs: { email: false, push: true } }, d);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.sendPush).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ emailOk: true, emailStatus: "off" });
  });

  it("skips push on every device when it is off", async () => {
    const d = deps();
    const r = await deliver({ message, email: "a@test.local", subscriptions: subs, prefs: { email: true, push: false } }, d);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(r.push).toBe("off");
  });

  it("sends nothing when both are off, and the row can be marked sent", async () => {
    const d = deps();
    const r = await deliver({ message, email: "a@test.local", subscriptions: subs, prefs: { email: false, push: false } }, d);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(r).toMatchObject({ emailOk: true, emailStatus: "off", push: "off" });
  });

  it("reports a failed email so the sweep retries", async () => {
    const d = deps({ sendEmail: vi.fn<DeliveryDeps["sendEmail"]>().mockRejectedValue(new Error("smtp down")) });
    const r = await deliver({ message, email: "a@test.local", subscriptions: [], prefs: { email: true, push: true } }, d);
    expect(r).toMatchObject({ emailOk: false, emailStatus: "failed", emailError: "smtp down" });
    expect(d.sendPush).not.toHaveBeenCalled(); // no devices
    expect(r.push).toEqual({ sent: 0, gone: [], failed: 0 });
  });

  it("does not retry forever when the account has no email address", async () => {
    const d = deps();
    const r = await deliver({ message, email: undefined, subscriptions: [], prefs: { email: true, push: true } }, d);
    expect(r).toMatchObject({ emailOk: true, emailStatus: "no_address" });
  });
});
