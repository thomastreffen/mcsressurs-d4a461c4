import { describe, expect, it } from "vitest";
import { explicitPackageSend, initialPackageDelivery, previewAllowsSend, responseFindingReady } from "../../supabase/functions/_shared/inspection-send-policy";
import { buildPreflight } from "@/hooks/useResponsePackages";
import { buildEmailHtml, buildEmailText } from "@/lib/response-package";
const finding = { id: "point-2", finding_number: 2, title: "Internrevisjon", status: "documentation_ready", documentation_status: "complete", internal_assessment: "Dokumentert", responsible_person_id: "thomas", response_text: "Rutine og referat vedlagt", response_approved_at: "2026-10-27", condition_corrected_at: "2026-10-27", documentation_complete_at: "2026-10-27" };
describe("Inspection preview and manual sending", () => {
  it("does not mark preparation as sent, even when sending is intended", () => expect(initialPackageDelivery("send")).toEqual({ status: "draft", sent_at: null, sent_by: null }));
  it("does not mark a download/export as sent", () => expect(initialPackageDelivery("export")).toEqual({ status: "exported", sent_at: null, sent_by: null }));
  it.each(["documentation_ready", "approved", "complete"])("status %s alone never permits sending", status => expect(explicitPackageSend(undefined, status)).toBe(false));
  it("requires an explicit manual confirmation, not just a draft", () => { expect(explicitPackageSend(false, "draft")).toBe(false); expect(explicitPackageSend(true, "draft")).toBe(true); });
  it.each(["sending", "sent"])("rejects repeated sending of a %s package", status => expect(explicitPackageSend(true, status)).toBe(false));
  it("does not enable sending merely because preflight becomes ready", () => expect(previewAllowsSend({ current: "preview-v1", confirmed: null, ready: true, busy: false })).toBe(false));
  it("invalidates confirmation when content or recipients change", () => expect(previewAllowsSend({ current: "preview-v2", confirmed: "preview-v1", ready: true, busy: false })).toBe(false));
  it("permits only the confirmed ready preview and blocks repeat clicks", () => { expect(previewAllowsSend({ current: "preview-v1", confirmed: "preview-v1", ready: true, busy: false })).toBe(true); expect(previewAllowsSend({ current: "preview-v1", confirmed: "preview-v1", ready: true, busy: true })).toBe(false); });
  it.each(["response_approved_at", "condition_corrected_at", "documentation_complete_at", "internal_assessment", "responsible_person_id"])("blocks sending without %s", field => expect(responseFindingReady({ ...finding, [field]: null })).toBe(false));
  it("accepts completed internal handling without mutating status", () => { expect(responseFindingReady(finding)).toBe(true); expect(finding.status).toBe("documentation_ready"); });
  it("blocks package preflight on an open linked action", () => {
    const result = buildPreflight({ findings: [finding as any], actions: [{ compliance_finding_id: finding.id, status: "open" } as any], evidence: [], candidates: [{ finding_id: finding.id, key: "routine", kind: "document" } as any], selectedAttachmentKeys: new Set(["routine"]), detailFor: () => null });
    expect(result[0].overall).toBe("missing");
  });
  it("does not present an open broad action as completed in the outgoing answer", () => {
    const input = { intro: "Sak 63210", closing: "MCS", manifest: [], findings: [{ finding_id: "point-2", finding_number: 2, finding_type: "deviation", title: "Internrevisjon", original_text: null, response_text: "Rutine etablert", attachment_names: [], actions: [{ title: "Bredt åpent tiltak", status: "open" }, { title: "Årlig rutine", status: "completed" }] }] };
    expect(buildEmailText(input)).not.toContain("Bredt åpent tiltak"); expect(buildEmailHtml(input)).not.toContain("Bredt åpent tiltak"); expect(buildEmailText(input)).toContain("Årlig rutine");
  });
});