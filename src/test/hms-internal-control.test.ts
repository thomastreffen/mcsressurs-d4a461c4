import { describe, expect, it } from "vitest";
import {
  actionDisplayStatus,
  activityState,
  deriveActionSource,
  isActionOverdue,
  nextDueDate,
  riskLevel,
  REVIEW_CHECKPOINTS,
} from "@/lib/hms/internalControl";

describe("nextDueDate", () => {
  it("monthly legger til én måned", () => {
    expect(nextDueDate("2026-01-15", "monthly")).toBe("2026-02-15");
  });
  it("quarterly legger til tre måneder", () => {
    expect(nextDueDate("2026-01-15", "quarterly")).toBe("2026-04-15");
  });
  it("semiannual legger til seks måneder", () => {
    expect(nextDueDate("2026-01-15", "semiannual")).toBe("2026-07-15");
  });
  it("annual legger til ett år", () => {
    expect(nextDueDate("2026-01-15", "annual")).toBe("2027-01-15");
  });
  it("custom bruker egendefinert intervall i dager", () => {
    expect(nextDueDate("2026-01-15", "custom", 14)).toBe("2026-01-29");
  });
  it("custom uten intervall faller tilbake til 30 dager", () => {
    expect(nextDueDate("2026-01-15", "custom", null)).toBe("2026-02-14");
  });
});

describe("activityState", () => {
  const today = new Date("2026-10-21T12:00:00");
  it("gjennomført aktivitet er done uansett dato", () => {
    expect(activityState({ status: "done", due_date: "2020-01-01" }, today)).toBe("done");
  });
  it("forfalt når frist er passert og ikke gjennomført", () => {
    expect(activityState({ status: "planned", due_date: "2026-10-01" }, today)).toBe("overdue");
  });
  it("nærmer seg innen 30 dager", () => {
    expect(activityState({ status: "planned", due_date: "2026-11-10" }, today)).toBe("due_soon");
  });
  it("planlagt utover 30 dager", () => {
    expect(activityState({ status: "planned", due_date: "2027-01-01" }, today)).toBe("planned");
  });
});

describe("riskLevel", () => {
  it("1-4 er lav", () => {
    expect(riskLevel(1)).toBe("low");
    expect(riskLevel(4)).toBe("low");
  });
  it("5-9 er middels", () => {
    expect(riskLevel(5)).toBe("medium");
    expect(riskLevel(9)).toBe("medium");
  });
  it("10-14 er høy", () => {
    expect(riskLevel(10)).toBe("high");
    expect(riskLevel(14)).toBe("high");
  });
  it("15-25 er kritisk", () => {
    expect(riskLevel(15)).toBe("critical");
    expect(riskLevel(25)).toBe("critical");
  });
});

describe("isActionOverdue / actionDisplayStatus", () => {
  const today = new Date("2026-10-21T12:00:00");
  it("ferdig tiltak er aldri forfalt", () => {
    expect(isActionOverdue({ status: "done", due_date: "2020-01-01" }, today)).toBe(false);
    expect(actionDisplayStatus({ status: "done", due_date: "2020-01-01" }, today)).toBe("done");
  });
  it("åpent tiltak med passert frist er forfalt", () => {
    expect(actionDisplayStatus({ status: "open", due_date: "2026-10-01" }, today)).toBe("overdue");
  });
  it("åpent tiltak uten frist er ikke forfalt", () => {
    expect(isActionOverdue({ status: "open", due_date: null }, today)).toBe(false);
  });
  it("pågående tiltak med fremtidig frist vises som pågår", () => {
    expect(actionDisplayStatus({ status: "in_progress", due_date: "2027-01-01" }, today)).toBe("in_progress");
  });
});

describe("deriveActionSource", () => {
  it("eksplisitt source_type vinner", () => {
    expect(deriveActionSource({ source_type: "manual", risk_register_id: "x" })).toBe("manual");
  });
  it("utleder fra koblingsfelt i prioritert rekkefølge", () => {
    expect(deriveActionSource({ risk_register_id: "x" })).toBe("risk_register");
    expect(deriveActionSource({ year_activity_id: "x" })).toBe("year_activity");
    expect(deriveActionSource({ internal_review_id: "x" })).toBe("internal_review");
    expect(deriveActionSource({ incident_id: "x" })).toBe("incident");
    expect(deriveActionSource({ compliance_finding_id: "x" })).toBe("inspection");
    expect(deriveActionSource({ compliance_audit_id: "x" })).toBe("audit");
    expect(deriveActionSource({ submission_id: "x" })).toBe("submission");
    expect(deriveActionSource({ alert_id: "x" })).toBe("alert");
    expect(deriveActionSource({})).toBe("manual");
  });
});

describe("REVIEW_CHECKPOINTS", () => {
  it("har unike nøkler", () => {
    const keys = REVIEW_CHECKPOINTS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("dekker de obligatoriske temaene", () => {
    const keys = REVIEW_CHECKPOINTS.map((c) => c.key);
    for (const required of ["year_wheel", "actions", "incidents", "handbook_acks", "fse", "sds", "risk_register"]) {
      expect(keys).toContain(required);
    }
  });
});
