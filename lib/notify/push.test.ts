import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification, setVapidDetails } }));

const subs = [
  { id: "a", endpoint: "https://push.example/a", p256dh: "k", auth: "x" },
  { id: "b", endpoint: "https://push.example/b", p256dh: "k", auth: "x" },
  { id: "c", endpoint: "https://push.example/c", p256dh: "k", auth: "x" },
  { id: "d", endpoint: "https://push.example/d", p256dh: "k", auth: "x" },
];
const payload = { title: "T", body: "B", url: "https://seen.example/g/1/play", tag: "turn-1" };

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:a@b.c";
});

describe("sendPush", () => {
  it("reports 404/410 as gone, other errors as failed, and keeps going", async () => {
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("nf"), { statusCode: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));
    const { sendPush } = await import("./push");
    const r = await sendPush(subs, payload);
    expect(r).toEqual({ sent: 1, gone: ["b", "c"], failed: 1 });
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:a@b.c", "pub", "priv");
    const [target, body] = sendNotification.mock.calls[0];
    expect(target).toEqual({ endpoint: subs[0].endpoint, keys: { p256dh: "k", auth: "x" } });
    expect(JSON.parse(body)).toEqual(payload);
  });

  it("does nothing without subscriptions, and never throws without VAPID config", async () => {
    const { sendPush } = await import("./push");
    expect(await sendPush([], payload)).toEqual({ sent: 0, gone: [], failed: 0 });
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await sendPush(subs, payload)).toEqual({ sent: 0, gone: [], failed: 4 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
