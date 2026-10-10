import { beforeEach, describe, expect, it } from "vitest";
import { _resetSeqMemory, nextSeq, type KeyValueStore } from "./tapSeq";

function fakeStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("nextSeq", () => {
  beforeEach(() => _resetSeqMemory());

  it("increments from 1 per turn", () => {
    const s = fakeStore();
    expect([nextSeq("t1", s), nextSeq("t1", s), nextSeq("t2", s)]).toEqual([1, 2, 1]);
  });

  it("continues after a reload (memory lost, storage kept)", () => {
    const s = fakeStore();
    nextSeq("t1", s);
    nextSeq("t1", s);
    _resetSeqMemory();
    expect(nextSeq("t1", s)).toBe(3);
  });

  it("works without storage", () => {
    expect([nextSeq("t9", null), nextSeq("t9", null)]).toEqual([1, 2]);
  });

  it("ignores garbage in storage", () => {
    const s = fakeStore();
    s.setItem("seen:seq:t1", "oops");
    expect(nextSeq("t1", s)).toBe(1);
  });
});
