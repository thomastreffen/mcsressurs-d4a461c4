import { describe, it, expect } from "vitest";
import {
  isLeisureSubject, maySuggestProject, scoreCandidate, decideLink, displayTitleFor,
  osloMidnightUtc, allDayRangeUtc, SUGGESTION_MIN_SCORE,
} from "../../supabase/functions/_shared/outlook-match-policy";
import { safeOutlookBlockView, isTrustedOutlookLink, normaliseAllDay } from "@/lib/outlook-block-display";

const frigo = { title: "Frigoscandia bytte 1000A", customer: "Frigoscandia AS", job_number: "JOB-000309", project_aliases: [] };

describe("Outlook match policy – FRI vs Frigoscandia (Rune, 16–17 Nov)", () => {
  it("FRI is leisure and never eligible for a suggestion", () => {
    expect(isLeisureSubject("FRI")).toBe(true);
    expect(isLeisureSubject("Fri - tannlege")).toBe(true);
    expect(isLeisureSubject("Ferie uke 47")).toBe(true);
    expect(isLeisureSubject("Frigoscandia bytte 1000A")).toBe(false);
    expect(maySuggestProject({ subject: "FRI" })).toBe(false);
  });
  it("FRI scores 0 against Frigoscandia (no substring match)", () => {
    expect(scoreCandidate("FRI", frigo)).toBe(0);
  });
  it("all-day and private appointments are never eligible", () => {
    expect(maySuggestProject({ subject: "Frigoscandia bytte 1000A", isAllDay: true })).toBe(false);
    expect(maySuggestProject({ subject: "Frigoscandia bytte 1000A", isPrivate: true })).toBe(false);
    expect(maySuggestProject({ subject: "Kurs", showAs: "oof" })).toBe(false);
  });
  it("job number in subject only suggests, never links", () => {
    const score = scoreCandidate("JOB-000309 befaring", frigo);
    expect(score).toBeGreaterThanOrEqual(SUGGESTION_MIN_SCORE);
    const d = decideLink({ suggestion: { projectId: "p1", score, title: frigo.title } });
    expect(d.projectId).toBeNull();
    expect(d.suggestedProjectId).toBe("p1");
    expect(d.matchState).toBe("needs_confirmation");
  });
  it("identically named but unrelated meeting stays unlinked and keeps its own title", () => {
    const d = decideLink({ suggestion: { projectId: "p1", score: 100, title: frigo.title } });
    expect(d.projectId).toBeNull();
    expect(displayTitleFor({ subject: "Frigoscandia bytte 1000A", linkedProjectTitle: null })).toBe("Frigoscandia bytte 1000A");
  });
  it("re-import never keeps an unconfirmed old project link", () => {
    const d = decideLink({ existing: { project_id: "p1", match_state: "needs_confirmation" } });
    expect(d.projectId).toBeNull();
    expect(d.matchState).toBe("external");
  });
  it("only human confirmation or Hub MCS_BLOCK_ID key links", () => {
    expect(decideLink({ existing: { project_id: "p1", match_state: "confirmed" } }).projectId).toBe("p1");
    expect(decideLink({ deterministicProjectId: "p2" }).projectId).toBe("p2");
  });
  it("private shows Opptatt, FRI shows FRI", () => {
    expect(displayTitleFor({ isPrivate: true, subject: "x", linkedProjectTitle: "Proj" })).toBe("Opptatt");
    expect(displayTitleFor({ subject: "FRI" })).toBe("FRI");
  });
});

describe("All-day dates in Europe/Oslo (DST-safe)", () => {
  it("16 Nov all-day starts at Oslo midnight (23:00Z previous day), not 01:00", () => {
    const r = allDayRangeUtc("2026-11-16T00:00:00.0000000", "2026-11-17T00:00:00.0000000");
    expect(r.start.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-16T23:00:00.000Z");
  });
  it("summer date uses CEST (+2)", () => {
    expect(osloMidnightUtc("2026-07-01").toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("DST change days map to their own midnight", () => {
    expect(osloMidnightUtc("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(osloMidnightUtc("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });
  it("legacy UTC-midnight rows normalise to the same calendar date locally", () => {
    const d = normaliseAllDay(new Date("2026-11-16T00:00:00Z"));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 16, 0]);
  });
});

describe("Planner display fails closed", () => {
  const rune = { source: "outlook", project_id: "450928", match_state: "needs_confirmation", match_reason: "Partial match: Frigoscandia bytte 1000A", outlook_subject: "FRI", title: "Frigoscandia bytte 1000A" };
  it("needs_confirmation block is not shown as a job", () => {
    const v = safeOutlookBlockView(rune);
    expect(v.project_id).toBeNull();
    expect(v.title).toBe("FRI");
  });
  it("external block with stale project_id is not shown as a job", () => {
    expect(isTrustedOutlookLink({ ...rune, match_state: "external" })).toBe(false);
  });
  it("AI 'auto' without Hub key is untrusted; MCS_BLOCK_ID auto is trusted", () => {
    expect(isTrustedOutlookLink({ ...rune, match_state: "auto", match_reason: "AI: x" })).toBe(false);
    expect(isTrustedOutlookLink({ ...rune, match_state: "auto", match_reason: "MCS_BLOCK_ID link" })).toBe(true);
  });
  it("private untrusted block shows Opptatt", () => {
    expect(safeOutlookBlockView({ ...rune, is_private: true, outlook_subject: null }).title).toBe("Opptatt");
  });
  it("manual Hub blocks are untouched", () => {
    expect(safeOutlookBlockView({ source: "manual", project_id: "p", title: "Jobb" })).toEqual({ project_id: "p", title: "Jobb", untrustedProjectId: null });
  });
});
