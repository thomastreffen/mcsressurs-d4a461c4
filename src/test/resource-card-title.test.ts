import { describe, it, expect } from "vitest";
import {
  getResourceCardTitle,
  isGenericResourceTitle,
  extractOrderRef,
  getResourceCardSecondary,
} from "@/lib/resource-card-title";

describe("resource card title", () => {
  it("treats BST task titles as generic", () => {
    expect(isGenericResourceTitle("Oppgave fra BST-000040")).toBe(true);
    expect(isGenericResourceTitle("Ragde Charge Hemsedal - Prosjekt 60500")).toBe(false);
  });

  it("prefers live event title over stale block snapshot", () => {
    expect(
      getResourceCardTitle({
        eventTitle: "Ragde Charge Hemsedal - Prosjekt 60500",
        blockTitle: "Oppgave fra BST-000040",
      })
    ).toBe("Ragde Charge Hemsedal - Prosjekt 60500");
  });

  it("uses parent project title when block title is generic", () => {
    expect(
      getResourceCardTitle({
        eventTitle: null,
        parentTitle: "Hemsedal ladepark",
        blockTitle: "Oppgave fra BST-000040",
      })
    ).toBe("Hemsedal ladepark");
  });

  it("falls back to generic title when nothing better exists", () => {
    expect(getResourceCardTitle({ blockTitle: "Oppgave fra BST-000040" })).toBe(
      "Oppgave fra BST-000040"
    );
    expect(getResourceCardTitle({ sourceOrderNumber: "BST-000040" })).toBe(
      "Oppgave fra BST-000040"
    );
  });

  it("extracts order ref and builds secondary line", () => {
    expect(extractOrderRef("Oppgave fra BST-000040")).toBe("BST-000040");
    expect(getResourceCardSecondary(["BST-000040", "JOB-000318", "08–16"])).toBe(
      "BST-000040 · JOB-000318 · 08–16"
    );
  });
});
