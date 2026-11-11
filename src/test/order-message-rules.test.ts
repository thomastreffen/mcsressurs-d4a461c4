import { describe, it, expect } from "vitest";
import { validateOutgoingMessage, allowedAddressees, statusRequiresCustomerMessage, shouldEmailRequester, customerVisibleMessages } from "@/lib/order-message-rules";
import { deriveOrderConversationState, isGenuineCustomerReply } from "@/lib/order-request-state";

const customer = { id: "c1", participant_type: "customer" };
const internal = { id: "i1", participant_type: "internal_user" };

describe("order composer rules", () => {
  it("an internal note cannot be addressed to the customer", () => {
    expect(validateOutgoingMessage({ visibility: "internal", addressee: customer, body: "Hei", hasFiles: false })).toMatch(/internt notat/i);
    expect(validateOutgoingMessage({ visibility: "internal", addressee: internal, body: "Hei", hasFiles: false })).toBeNull();
    expect(validateOutgoingMessage({ visibility: "shared", addressee: customer, body: "Hei", hasFiles: false })).toBeNull();
  });
  it("internal visibility hides customer participants as addressees", () => {
    expect(allowedAddressees([customer, internal], "internal").map((p) => p.id)).toEqual(["i1"]);
    expect(allowedAddressees([customer, internal], "shared")).toHaveLength(2);
  });
  it("Venter kunde requires a shared, non-empty customer message", () => {
    expect(statusRequiresCustomerMessage("waiting_customer")).toBe(true);
    expect(statusRequiresCustomerMessage("under_review")).toBe(false);
    expect(validateOutgoingMessage({ visibility: "internal", addressee: null, body: "x", hasFiles: false, requireCustomerMessage: true })).not.toBeNull();
    expect(validateOutgoingMessage({ visibility: "shared", addressee: null, body: "", hasFiles: true, requireCustomerMessage: true })).not.toBeNull();
    expect(validateOutgoingMessage({ visibility: "shared", addressee: null, body: "Passer fredag?", hasFiles: false, requireCustomerMessage: true })).toBeNull();
  });
  it("shared messages e-mail the requester by default, internal never", () => {
    expect(shouldEmailRequester("shared", "hs@x.no", false)).toBe(true);
    expect(shouldEmailRequester("shared", "hs@x.no", true)).toBe(false);
    expect(shouldEmailRequester("internal", "hs@x.no", false)).toBe(false);
    expect(shouldEmailRequester("shared", null, false)).toBe(false);
  });
  it("tracking page shows only shared messages, never internal notes", () => {
    const msgs = [{ id: "a", is_visible_to_customer: true, visibility: "shared" }, { id: "b", is_visible_to_customer: false, visibility: "internal" }];
    expect(customerVisibleMessages(msgs).map((m) => m.id)).toEqual(["a"]);
  });
});

describe("automatic status after Venter kunde", () => {
  const postkontor = { id: "m1", sender_type: "customer", sender_name: "MCS Service - Postkontor", message_type: "message", body: "Ny bestilling", created_at: "2026-10-28T08:07:26Z", is_visible_to_customer: true, visibility: "shared" };
  it("Postkontoret's forwarded order is not a customer reply", () => {
    expect(isGenuineCustomerReply(postkontor)).toBe(false);
  });
  it("manual Ny → Venter kunde is not reverted by older messages (BST-000067 case)", () => {
    const s = deriveOrderConversationState("waiting_customer", [postkontor], [], "2026-11-11T09:18:30Z");
    expect(s.statusSyncTarget).toBeNull();
    expect(s.effectiveInternalStatus).toBe("waiting_customer");
  });
  it("a genuine customer reply after the status change moves it to Til vurdering", () => {
    const reply = { ...postkontor, id: "m2", sender_name: "Henning", created_at: "2026-11-12T10:00:00Z" };
    const s = deriveOrderConversationState("waiting_customer", [postkontor, reply], [], "2026-11-11T09:18:30Z");
    expect(s.statusSyncTarget).toBe("under_review");
  });
  it("a customer reply from before the status change does not count", () => {
    const old = { ...postkontor, id: "m3", sender_name: "Henning", created_at: "2026-11-01T10:00:00Z" };
    expect(deriveOrderConversationState("waiting_customer", [old], [], "2026-11-11T09:18:30Z").statusSyncTarget).toBeNull();
  });
});
