import { describe, it, expect } from "vitest";
import { decideLink, isTrustedOutlookBlock, maySuggestProject, resolveDeterministicLink, displayTitleFor, allDayRangeUtc } from "../../supabase/functions/_shared/outlook-match-policy";
import { outlookRemovalMode, isTrustedOutlookLink, safeOutlookBlockView, normaliseAllDay } from "@/lib/outlook-block-display";

// Rune's real case shape (no production ids): FRI all-day, stale fuzzy link to an old job.
const runeFri = { source: "outlook", project_id: "job-309", match_state: "needs_confirmation", match_reason: "Partial match: Frigoscandia bytte 1000A", outlook_subject: "FRI", is_private: false, is_all_day: true, title: "Frigoscandia bytte 1000A" };

describe("Outlook FRI wrongly linked → removal is never job removal", () => {
  it("FRI with stale link offers 'Fjern feil kobling', not technician removal", () => {
    expect(outlookRemovalMode(runeFri)).toBe("unconfirmed_link");
    const v = safeOutlookBlockView(runeFri);
    expect(outlookRemovalMode({ ...runeFri, project_id: v.project_id, untrusted_project_id: v.untrustedProjectId })).toBe("unconfirmed_link");
  });
  it("server guard agrees with client: untrusted outlook link is refused for job removal", () => {
    expect(isTrustedOutlookBlock(runeFri)).toBe(false);
    expect(isTrustedOutlookLink(runeFri)).toBe(false);
  });
  it("plain Outlook appointment only offers hiding in Hub", () => {
    expect(outlookRemovalMode({ source: "outlook", project_id: null, match_state: "external", outlook_subject: "FRI" })).toBe("outlook_only");
  });
  it("confirmed Hub job and MCS_BLOCK_ID copy use normal job removal", () => {
    expect(outlookRemovalMode({ source: "manual", project_id: "p" })).toBe("hub_job");
    expect(outlookRemovalMode({ source: "outlook", project_id: "p", match_state: "confirmed" })).toBe("hub_job");
    expect(outlookRemovalMode({ source: "outlook", project_id: "p", match_state: "auto", match_reason: "MCS_BLOCK_ID link" })).toBe("hub_job");
    expect(isTrustedOutlookBlock({ source: "outlook", project_id: "p", match_state: "auto", match_reason: "MCS_BLOCK_ID link" })).toBe(true);
  });
  it("AI/fuzzy 'auto' without MCS_BLOCK_ID is not trusted", () => {
    expect(isTrustedOutlookBlock({ source: "outlook", project_id: "p", match_state: "auto", match_reason: "AI match 92%" })).toBe(false);
  });
});

describe("Re-import after 'Fjern feil kobling'", () => {
  it("never re-links or re-suggests after a human removed the link", () => {
    const d = decideLink({ existing: { project_id: null, match_state: "external_confirmed" } as any, suggestion: { projectId: "job-309", score: 100, title: "Frigoscandia" } });
    expect(d).toMatchObject({ projectId: null, suggestedProjectId: null, matchState: "external_confirmed" });
  });
  it("re-import of stale needs_confirmation row drops the old project_id", () => {
    const d = decideLink({ existing: { project_id: "job-309", match_state: "needs_confirmation" } as any, suggestion: null });
    expect(d.projectId).toBeNull();
  });
  it("FRI never gets a suggestion on re-import", () => {
    expect(maySuggestProject({ subject: "FRI", isAllDay: true })).toBe(false);
  });
});

describe("Company scope", () => {
  it("MCS_BLOCK_ID links only within the same company", () => {
    expect(resolveDeterministicLink({ project_id: "p", company_id: "A" }, "A")).toBe("p");
    expect(resolveDeterministicLink({ project_id: "p", company_id: "B" }, "A")).toBeNull();
    expect(resolveDeterministicLink(null, "A")).toBeNull();
  });
  it("a trusted human link from another company still cannot be forged via MCS_BLOCK_ID", () => {
    const d = decideLink({ existing: null, deterministicProjectId: resolveDeterministicLink({ project_id: "p", company_id: "B" }, "A"), suggestion: null });
    expect(d.projectId).toBeNull();
  });
});

describe("Legitimate FRI display", () => {
  it("shows FRI, or Opptatt when private, never a job title", () => {
    expect(displayTitleFor({ isPrivate: false, subject: "FRI", linkedProjectTitle: null })).toBe("FRI");
    expect(displayTitleFor({ isPrivate: true, subject: "FRI", linkedProjectTitle: null })).toBe("Opptatt");
    expect(safeOutlookBlockView(runeFri).title).toBe("FRI");
    expect(safeOutlookBlockView({ ...runeFri, is_private: true }).title).toBe("Opptatt");
  });
  it("all-day 16 Nov stays on 16 Nov in Oslo (no 01:00 shift)", () => {
    const r = allDayRangeUtc("2026-11-16", "2026-11-17");
    expect(r.start.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    const legacy = normaliseAllDay(new Date("2026-11-16T00:00:00Z"));
    expect([legacy.getFullYear(), legacy.getMonth(), legacy.getDate(), legacy.getHours()]).toEqual([2026, 10, 16, 0]);
  });
});
