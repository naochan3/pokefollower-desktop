// tests/party.test.mjs
import { describe, it, expect } from "vitest";
import { addToParty, removeFromParty, replaceInParty, setLead, isFull, PARTY_MAX } from "../src/settings/party.mjs";

describe("party", () => {
  it("adds until full (6)", () => {
    let p = [];
    for (let i = 0; i < 8; i++) p = addToParty(p, "m" + i);
    expect(p.length).toBe(PARTY_MAX);
    expect(isFull(p)).toBe(true);
    expect(p).toEqual(["m0", "m1", "m2", "m3", "m4", "m5"]);
  });
  it("does not duplicate", () => {
    expect(addToParty(["a"], "a")).toEqual(["a"]);
  });
  it("removes", () => {
    expect(removeFromParty(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("replaces a slot when full", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(replaceInParty(full, "c", "z")).toEqual(["a", "b", "z", "d", "e", "f"]);
  });
  it("does not replace with an already-present member", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(replaceInParty(full, "c", "a")).toEqual(full);
  });
  it("sets lead to front", () => {
    expect(setLead(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(setLead(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});
