import { describe, it, expect } from "vitest";
import { existingTargetDecision } from "../../supabase/functions/_shared/job-outlook-pilot-selector";
const now = new Date("2026-11-17T09:00:00Z");
describe("pilot target lifecycle", () => {
  it("no prior target -> none", () => expect(existingTargetDecision(null, now)).toBe("none"));
  it("expired unrevoked target is replaceable", () => expect(existingTargetDecision({ revoked_at: null, expires_at: "2026-11-17T07:13:01Z" }, now)).toBe("expired"));
  it("active target still blocks a duplicate", () => expect(existingTargetDecision({ revoked_at: null, expires_at: "2026-11-18T07:00:00Z" }, now)).toBe("active"));
  it("expiry at exactly now counts as expired", () => expect(existingTargetDecision({ revoked_at: null, expires_at: now.toISOString() }, now)).toBe("expired"));
  it("revoked target never blocks", () => expect(existingTargetDecision({ revoked_at: "2026-11-16T10:00:00Z", expires_at: "2026-11-18T07:00:00Z" }, now)).toBe("none"));
});
