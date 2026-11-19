import { describe, it, expect } from "vitest";
import { normalizeMailboxCandidates } from "@/lib/mailbox-candidates";
const t = { id: "a", name: "Rune", email: "rune@x.no" };
describe("normalizeMailboxCandidates", () => {
  it("accepts the cached server object shape", () => expect(normalizeMailboxCandidates({ technicians: [t] })).toEqual([t]));
  it("accepts an array", () => expect(normalizeMailboxCandidates([t])).toEqual([t]));
  it("returns empty for loading/null/garbage", () => {
    for (const v of [undefined, null, {}, { technicians: null }, "x"]) expect(normalizeMailboxCandidates(v)).toEqual([]);
  });
});
