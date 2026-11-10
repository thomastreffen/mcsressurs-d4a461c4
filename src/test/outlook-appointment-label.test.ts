import { describe, it, expect } from "vitest";
import { outlookAppointmentLabel } from "@/lib/outlook-appointment-label";
describe("outlookAppointmentLabel", () => {
  it("private shows only Opptatt", () => expect(outlookAppointmentLabel({ source: "outlook", is_private: true }, "Lege")).toBe("Opptatt"));
  it("unanswered invite is not confirmed", () => expect(outlookAppointmentLabel({ source: "outlook", outlook_response_status: "notResponded" }, "Møte")).toBe("Avtale · Møte (ikke bekreftet)"));
  it("accepted is an Avtale, not a job", () => expect(outlookAppointmentLabel({ source: "outlook", outlook_response_status: "accepted" }, "Møte")).toBe("Avtale · Møte"));
  it("Hub blocks untouched", () => expect(outlookAppointmentLabel({ source: "manual" }, "Jobb")).toBe("Jobb"));
});
