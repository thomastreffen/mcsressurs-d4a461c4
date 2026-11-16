// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { jobCalendarHtml, recipientPlannedDays } from "../../supabase/functions/_shared/job-communication";
import { buildDayPayload, dayFingerprint } from "../../supabase/functions/_shared/job-outlook-app-days";
import { buildJobPayload, jobFingerprint, type HubJob } from "../../supabase/functions/_shared/job-outlook-app-core";
import { jobInfoUrl } from "../../supabase/functions/_shared/job-access-policy";
import { oauthReturnPath } from "../lib/oauth-return-path";
const id = "11111111-1111-4111-8111-111111111111";
const job: HubJob = { id, company_id: "isolated", title: "Isolated", job_number: "60570", description: "Operational instructions", site_contact_name: "Contact", address: "Site", start_at: "2026-11-19T05:00:00Z", end_at: "2026-11-19T13:00:00Z", status: "scheduled", deleted_at: null };
const day = { technicianId: "test", workDate: "2026-11-20", startAt: "2026-11-20T05:00:00Z", endAt: "2026-11-20T13:00:00Z", operationKey: "isolated" };
function legacyBody(file: string, fn: string) {
  const source = readFileSync(file, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context: any = { Deno: { serve() {} }, jobCalendarHtml, PROJECT_TYPE_LABELS: {}, normalizeEventTimes: (e: any) => ({ startTime: e.start_time, endTime: e.end_time }), toLocalDateTimeString: (x: string) => x, Intl, Date };
  vm.createContext(context); vm.runInContext(js, context);
  return context[fn];
}
describe("stable operational communication, no real Graph or mail", () => {
  it("both legacy calendar builders and both app-only payloads point to the exact authenticated job", () => {
    const event = { ...job, start_time: job.start_at, end_time: job.end_at };
    const delegated = legacyBody("supabase/functions/calendar-write-sync/index.ts", "buildGraphBody")(event);
    const legacy = legacyBody("supabase/functions/ms-calendar/index.ts", "buildHtmlBody")(event, id);
    const single = buildJobPayload(job, "test", "key") as any;
    const perDay = buildDayPayload(job, day, "key") as any;
    for (const html of [delegated.body.content, legacy, single.body.content, perDay.body.content]) {
      const destinations = [...html.matchAll(/href="([^"]+)"/g)].map((m: any) => m[1]);
      expect(destinations).toContain(jobInfoUrl(id));
      expect(destinations.some((u: string) => u.includes("/approval/") || u.startsWith("mailto:"))).toBe(false);
    }
    expect(perDay.start.dateTime).toBe(day.startAt);
    expect(perDay.attendees).toEqual([]);
  });
  it("mail days use only the recipient's 19/20 November, not another technician's day", () => {
    const blocks = ["19", "20"].map(d => ({ technician_id: "test", start_at: `2026-11-${d}T05:00:00Z`, end_at: `2026-11-${d}T13:00:00Z` }));
    const result = recipientPlannedDays([...blocks, ...blocks, { technician_id: "other", start_at: "2026-11-21T05:00:00Z", end_at: "2026-11-21T13:00:00Z" }], "test");
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("19."); expect(result[1]).toContain("20.");
    expect(result.every(d => d.includes("06:00–14:00"))).toBe(true);
  });
  it("description and contact edits invalidate both app fingerprints without touching identity", () => {
    expect(dayFingerprint({ ...job, description: "New instructions" }, day)).not.toBe(dayFingerprint(job, day));
    expect(jobFingerprint({ ...job, site_contact_name: "New contact" }, "test")).not.toBe(jobFingerprint(job, "test"));
  });
  it("exact job destination survives safe OAuth return; external redirects fail closed", () => {
    expect(oauthReturnPath(`/job-info/${id}`)).toBe(`/job-info/${id}`);
    expect(oauthReturnPath("//evil.example/job-info/test")).toBe("/");
  });
});