import { describe, it, expect } from "vitest";
import { assessRoles, assessTokenIdentity, judgeNegativeProbe, judgeProbe, overall, mayRead, confidenceClass, shouldNotify, classifyCoverage, prefilter, excerpt, resolveWeekday, dedupeKey, isSeparateIdentity, PILOT_MAILBOX } from "../../supabase/functions/_shared/contract-watch-core";

describe("Avtalevakt access gates", () => {
  it("RBAC-only: no Entra mail/calendar roles at all", () => {
    expect(assessRoles([]).ok).toBe(true);
    expect(assessRoles(["User.Read.All"]).ok).toBe(true);
    expect(assessRoles(["Mail.Read"]).ok).toBe(false);
    expect(assessRoles(["Calendars.Read"]).ok).toBe(false);
    expect(assessRoles(["Mail.Read", "Mail.Send"]).ok).toBe(false);
    expect(assessRoles(["Mail.ReadWrite"]).ok).toBe(false);
  });
  it("token must match tenant and app", () => {
    expect(assessTokenIdentity({ tid: "T", appid: "A" }, "t", "a").ok).toBe(true);
    expect(assessTokenIdentity({ tid: "X", appid: "A" }, "t", "a").reason).toBe("tenant_mismatch");
    expect(assessTokenIdentity({ tid: "T", azp: "B" }, "t", "a").reason).toBe("app_mismatch");
    expect(assessTokenIdentity(null, "t", "a").ok).toBe(false);
  });
  it("negative probe passes only on 403 access denied", () => {
    expect(judgeNegativeProbe(403, "ErrorAccessDenied")).toBe("pass");
    expect(judgeNegativeProbe(403, null)).toBe("inconclusive");
    expect(judgeNegativeProbe(404, "ResourceNotFound")).toBe("inconclusive");
    expect(judgeNegativeProbe(200, null)).toBe("fail");
  });
  it("own mailbox must give 200 and other mailbox 403; errors are never a pass", () => {
    expect(judgeProbe(200, 200)).toBe("pass");
    expect(judgeProbe(403, 200)).toBe("fail");
    expect(judgeProbe(200, 503)).toBe("inconclusive");
    expect(overall(["pass", "inconclusive"])).toBe("inconclusive");
  });
  it("reading needs enabled + verified scope + consent + explicit mailbox", () => {
    const s = { enabled: true, allowed_mailboxes: [PILOT_MAILBOX], scope_verified_at: "x", consent_at: "x" };
    expect(mayRead(s, PILOT_MAILBOX)).toBe(true);
    expect(mayRead(s, "rune@mcsservice.no")).toBe(false);
    expect(mayRead({ ...s, consent_at: null }, PILOT_MAILBOX)).toBe(false);
    expect(mayRead({ ...s, enabled: false }, PILOT_MAILBOX)).toBe(false);
  });
  it("identity must differ from the mail and calendar apps", () => {
    expect(isSeparateIdentity("a", ["b", "c"])).toBe(true);
    expect(isSeparateIdentity("a", ["a"])).toBe(false);
  });
});

describe("Avtalevakt classification", () => {
  it("confidence thresholds 0.6 / 0.85", () => {
    expect(confidenceClass(0.5, true)).toBe("uncertain");
    expect(confidenceClass(0.7, true)).toBe("check");
    expect(confidenceClass(0.9, false)).toBe("check");
    expect(confidenceClass(0.9, true)).toBe("likely");
  });
  it("test runs and uncertain or covered promises never notify", () => {
    expect(shouldNotify("likely", "missing", true)).toBe(false);
    expect(shouldNotify("uncertain", "missing", false)).toBe(false);
    expect(shouldNotify("likely", "covered", false)).toBe(false);
    expect(shouldNotify("check", "partial", false)).toBe(true);
  });
  it("coverage against Resource Plan within ±1 day", () => {
    expect(classifyCoverage({ date: "2026-11-25" }, [])).toBe("missing");
    expect(classifyCoverage({ date: "2026-11-25", technicians: 2 }, [{ date: "2026-11-25", technicianCount: 2 }])).toBe("covered");
    expect(classifyCoverage({ date: "2026-11-25", technicians: 2 }, [{ date: "2026-11-25", technicianCount: 1 }])).toBe("partial");
    expect(classifyCoverage({ date: "2026-11-25" }, [{ date: "2026-11-26", technicianCount: 2 }])).toBe("partial");
    expect(classifyCoverage({ date: "2026-11-25" }, [{ date: "2026-11-25", technicianCount: 1, techniciansBusy: true }])).toBe("conflict");
  });
  it("prefilter skips auto replies, newsletters, system mail and non-customers", () => {
    expect(prefilter({ from: "a@b.no", subject: "Automatisk svar", customerHit: true }).process).toBe(false);
    expect(prefilter({ from: "a@b.no", subject: "x", headers: { "List-Unsubscribe": "<x>" }, customerHit: true }).process).toBe(false);
    expect(prefilter({ from: "noreply@b.no", subject: "x", customerHit: true }).process).toBe(false);
    expect(prefilter({ from: "a@b.no", subject: "x", customerHit: false }).reason).toBe("no_customer");
    expect(prefilter({ from: "a@bravida.no", subject: "Montering", customerHit: true }).process).toBe(true);
  });
  it("excerpt is capped at 500 chars", () => { expect(excerpt("a".repeat(900)).length).toBe(500); });
  it("weekday resolves in Oslo; ambiguous 'neste' is never guessed", () => {
    // Sent Thu 19 Nov 2026 23:30 Oslo (22:30 UTC) → tirsdag = 24 Nov
    expect(resolveWeekday("tirsdag", "2026-11-19T22:30:00Z")).toBe("2026-11-24");
    expect(resolveWeekday("torsdag", "2026-11-19T10:00:00Z")).toBe("2026-11-26");
    expect(resolveWeekday("tirsdag", "2026-11-19T10:00:00Z", "neste")).toBeNull();
  });
  it("same conversation, customer, date and task dedupe to one key", () => {
    const a = dedupeKey({ conversationId: "c1", customerId: "k", date: "2026-11-25", task: "Montering tavle Sandvika" });
    expect(dedupeKey({ conversationId: "c1", customerId: "k", date: "2026-11-25", task: "montering  TAVLE sandvika!" })).toBe(a);
  });
});

import { attachmentDecision, looksSensitive, draftFromCommitment, draftMissing } from "../../supabase/functions/_shared/contract-watch-core";
describe("Avtalevakt order drafts", () => {
  it("date and time only when explicit", () => {
    expect(draftFromCommitment({ excerpt: "x", promised_date: "2026-11-25", promised_time: "08:00", date_certain: false }).agreed_date).toBeNull();
    expect(draftFromCommitment({ excerpt: "x", promised_date: "2026-11-25", promised_time: "08:00", date_certain: true }).agreed_time).toBe("08:00");
  });
  it("large jobs are suggested as project, others as service order", () => {
    expect(draftFromCommitment({ excerpt: "", promised_date: null, promised_time: null, date_certain: false, estimatedDays: 5 }).suggested_type).toBe("project");
    expect(draftFromCommitment({ excerpt: "", promised_date: null, promised_time: null, date_certain: false }).suggested_type).toBe("service_order");
  });
  it("attachments: images/PDF as references only; executables, macros, huge files and inline logos rejected", () => {
    expect(attachmentDecision({ contentType: "application/pdf", size: 1e6, name: "tavle.pdf" })).toBe("reference_only");
    expect(attachmentDecision({ contentType: "application/octet-stream", size: 1e3, name: "x.exe" })).toBe("rejected_type");
    expect(attachmentDecision({ contentType: "image/jpeg", size: 30e6, name: "a.jpg" })).toBe("rejected_size");
    expect(attachmentDecision({ contentType: "image/png", size: 5000, isInline: true, name: "logo.png" })).toBe("rejected_inline");
  });
  it("flags national ID numbers as sensitive", () => {
    expect(looksSensitive("Fnr 01019912345")).toBe(true);
    expect(looksSensitive("Montering av tavle i 2. etasje")).toBe(false);
  });
  it("missing fields are named", () => {
    expect(draftMissing({ customer_id: null, description: "x", work_site: "" })).toEqual(["Kunde", "Arbeidssted"]);
  });
});

import { groupThreads, quoteGrounded, resolvePromisedDate, coverageFor, matchableDomain } from "../../supabase/functions/_shared/contract-watch-core";
describe("Avtalevakt historical test", () => {
  const m = (id: string, conv: string, at: string, imid = id) => ({ id, conversationId: conv, folder: "inbox" as const, sentAt: at, from: "a@kunde.no", to: [], subject: "", preview: "", internetMessageId: imid });
  it("dedupes threads and identical messages across folders", () => {
    const g = groupThreads([m("1", "c1", "2026-11-01"), m("2", "c1", "2026-11-02"), m("3", "c1", "2026-11-02", "2"), m("4", "c2", "2026-11-03")]);
    expect(g.length).toBe(2); expect(g[0].key).toBe("c2"); expect(g[1].messages.length).toBe(2);
  });
  it("quote must exist in source", () => {
    expect(quoteGrounded("Vi kommer onsdag 25.11", "Hei! Vi  kommer onsdag 25.11 kl 12.")).toBe(true);
    expect(quoteGrounded("Vi kommer fredag", "Hei! Vi kommer onsdag")).toBe(false);
  });
  it("dates are certain only when explicit and in range (Oslo)", () => {
    expect(resolvePromisedDate({ date_iso: "2026-11-25", weekday: null, quote: "kommer 25.11" }, "2026-11-20T10:00:00Z")).toEqual({ date: "2026-11-25", certain: true });
    expect(resolvePromisedDate({ date_iso: "2026-11-25", weekday: null, quote: "kommer snart" }, "2026-11-20T10:00:00Z").certain).toBe(false);
    expect(resolvePromisedDate({ date_iso: "2030-01-01", weekday: null, quote: "1.1.2030" }, "2026-11-20T10:00:00Z").date).toBeNull();
    expect(resolvePromisedDate({ date_iso: null, weekday: "onsdag", quote: "vi kommer onsdag" }, "2026-11-20T10:00:00Z")).toEqual({ date: "2026-11-25", certain: false, reason: "weekday_relative" });
    expect(resolvePromisedDate({ date_iso: null, weekday: null, quote: "vi tar det" }, "2026-11-20T10:00:00Z").date).toBeNull();
  });
  it("coverage unclear without customer or date", () => {
    expect(coverageFor({ customerKnown: false, date: "2026-11-25" }, [])).toBe("unclear");
    expect(coverageFor({ customerKnown: true, date: null }, [])).toBe("unclear");
    expect(coverageFor({ customerKnown: true, date: "2026-11-25" }, [])).toBe("missing");
    expect(coverageFor({ customerKnown: true, date: "2026-11-25" }, [{ date: "2026-11-25", technicianCount: 1 }])).toBe("covered");
  });
  it("own and public domains are never matched", () => {
    expect(matchableDomain("mcsservice.no")).toBe(false); expect(matchableDomain("gmail.com")).toBe(false); expect(matchableDomain("caverion.no")).toBe(true);
  });
});
