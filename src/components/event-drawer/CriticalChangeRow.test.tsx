import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CriticalChangeRow } from "./CriticalChangeRow";

const long = "Kurs før oppstart: PSI\n\n- Punkt én æøå\n- Punkt to\n" + "Lang tekst. ".repeat(40);

describe("CriticalChangeRow", () => {
  it("shows new long text once, clamped, with preserved newlines", () => {
    render(<CriticalChangeRow label="Beskrivelse" oldValue={long} newValue={long + "\nNytt fra Eirik"} />);
    const el = screen.getByTestId("change-value-Ny tekst");
    expect(el.className).toContain("line-clamp-6");
    expect(el.className).toContain("whitespace-pre-wrap");
    expect(el.textContent).toContain("\n- Punkt én æøå");
    fireEvent.click(screen.getAllByText("Vis hele teksten")[0]);
    expect(el.className).toContain("overflow-y-auto");
  });
  it("renders HTML as text, not markup", () => {
    render(<CriticalChangeRow label="Beskrivelse" oldValue="" newValue={"<img src=x onerror=alert(1)>\nlinje"} />);
    expect(document.querySelector("img")).toBeNull();
  });
  it("keeps short values inline", () => {
    render(<CriticalChangeRow label="Adresse" oldValue="A" newValue="B" />);
    expect(screen.getByText("A → B")).toBeTruthy();
  });
});
