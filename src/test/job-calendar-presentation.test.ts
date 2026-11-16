import { describe, it, expect } from "vitest";
import { projectQueue, eligibleMissingDays, canUpdateDelegated } from "@/lib/job-calendar-presentation";
import { storedDelegatedAvailable, selectedCalendarRecipients } from "../../supabase/functions/_shared/calendar-capability";
import { readFileSync } from "node:fs";

describe("calendar capability without any external calls", () => {
  it("two Mats workdays remain blocked without personal token; Emil existing days stay untouched", () => {
    const days = [19, 20].map(day => ({ technicianId: "mats", workDate: `2026-11-${day}` }));
    const capabilities = [{ technician_id: "mats", delegated_available: false, existing_link: false }, { technician_id: "emil", delegated_available: true, existing_link: true }];
    expect(eligibleMissingDays(days, capabilities)).toEqual([]);
    expect(canUpdateDelegated(capabilities)).toBe(true);
    expect(canUpdateDelegated(capabilities.slice(0, 1))).toBe(false);
  });
  it("unknown/loading capability fails closed", () => {
    expect(eligibleMissingDays([{ technicianId: "mats" }])).toEqual([]);
    expect(canUpdateDelegated()).toBe(false);
  });
  it("never accepts an old expired access token without refresh", () => {
    const now = Date.parse("2026-11-16T09:56:00Z");
    expect(storedDelegatedAvailable({ ms_access_token: "mock", ms_expires_at: "2026-11-11T00:00:00Z" }, now)).toBe(false);
    expect(storedDelegatedAvailable({ ms_refresh_token: "mock" }, now)).toBe(false);
    expect(storedDelegatedAvailable({ ms_access_token: "mock", ms_refresh_token: "mock" }, now)).toBe(true);
  });
  it("explicit recipients intersect live assignments; another company/unassigned ID cannot be added", () => {
    const assignments = [{ tech: { id: "emil" } }, { tech: { id: "mats" } }];
    expect(selectedCalendarRecipients(assignments, ["emil", "unassigned-other-company"], true)).toEqual([assignments[0]]);
    expect(selectedCalendarRecipients(assignments, [], true)).toEqual([]);
  });
  it("read returns after company authorization and before normalization/write/refresh path", () => {
    const source = readFileSync("supabase/functions/calendar-write-sync/index.ts", "utf8");
    const readStart = source.indexOf('if (action === "read_capability")');
    const readEnd = source.indexOf("// Server-side overnight normalization", readStart);
    expect(readStart).toBeGreaterThan(source.indexOf("_level: \"edit\"", source.indexOf("Deno.serve")));
    const branch = source.slice(readStart, readEnd);
    expect(branch).not.toMatch(/ensureValidMsToken|fetch\(|\.insert\(|\.update\(|\.delete\(/);
    expect(branch).toContain("JSON.stringify({ technicians })");
  });
});
describe("dormant queue is not a failed delivery", () => {
  const intent = { operation: "create", status: "pending", attempt_count: 0, reason_code: null };
  it("Emil delete without current assignment is audit only, Mats create is dormant", () => {
    const result = projectQueue([{ ...intent, technician_id: "mats" }, { ...intent, technician_id: "emil", operation: "delete" }, { ...intent, technician_id: null, operation: "update" }], ["mats"]);
    expect(result.current).toHaveLength(1);
    expect(result.dormant).toHaveLength(1);
    expect(result.audit).toHaveLength(2);
    expect(result.audit[0].attempt_count).toBe(0);
  });
  it("real Graph failure is not reclassified as never attempted", () => {
    const result = projectQueue([{ ...intent, technician_id: "mats", status: "failed", attempt_count: 1, reason_code: "graph_forbidden" }], ["mats"]);
    expect(result.current).toHaveLength(1);
    expect(result.dormant).toEqual([]);
  });
});