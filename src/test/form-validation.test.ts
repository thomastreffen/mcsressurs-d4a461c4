import { describe, it, expect } from "vitest";
import { validateFormAnswers } from "@/lib/form-validation";
import type { FormField } from "@/lib/form-types";

const checklist: FormField = {
  id: "c", type: "checkbox_list", label: "Sluttkontroll", order: 0,
  options: ["Jording", "Merking"], require_photo_on_deviation: true, enable_risk_grading: true,
};
const text: FormField = { id: "t", type: "text", label: "Målt verdi", order: 1, required: true };

describe("validateFormAnswers", () => {
  it("treats unanswered checklist items as not answered, never OK", () => {
    expect(validateFormAnswers([checklist], {})).toHaveLength(2);
  });
  it("requires photo on deviation", () => {
    const a = { c: { "0": { status: "ok" }, "1": { status: "avvik", risk_grade: "lav" } } };
    expect(validateFormAnswers([checklist], a).map((i) => i.message)).toEqual(["«Merking»: avvik krever bilde"]);
  });
  it("requires comment on critical deviation", () => {
    const a = { c: { "0": { status: "ok" }, "1": { status: "avvik", risk_grade: "kritisk", photo_count: 1 } } };
    expect(validateFormAnswers([checklist], a)).toHaveLength(1);
  });
  it("requires mandatory fields", () => {
    expect(validateFormAnswers([text], { t: "  " })).toHaveLength(1);
    expect(validateFormAnswers([text], { t: "230 V" })).toHaveLength(0);
  });
  it("passes a fully answered form", () => {
    const a = { c: { "0": { status: "ok" }, "1": { status: "ikke_relevant" } }, t: "ok" };
    expect(validateFormAnswers([checklist, text], a)).toEqual([]);
  });
});
