import { ReactNode } from "react";

/**
 * Enkel, trygg visning av håndbokinnhold (markdown-lignende tekst) uten
 * HTML-injeksjon. Støtter ## overskrifter, punktlister og avsnitt.
 */
export function renderHandbookBody(body: string | null | undefined): ReactNode {
  const text = (body ?? "").trim();
  if (!text) return <p className="text-muted-foreground italic">Ingen tekst enda.</p>;

  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;

        if (/^#{1,6}\s/.test(lines[0]) && lines.length === 1) {
          const level = lines[0].match(/^#+/)![0].length;
          const label = lines[0].replace(/^#+\s*/, "");
          return (
            <p key={i} className={level <= 2 ? "font-semibold text-base mt-3" : "font-medium mt-2"}>
              {label}
            </p>
          );
        }

        if (lines.every((l) => /^([-*•]|\d+[.)])\s/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^([-*•]|\d+[.)])\s*/, ""))}</li>
              ))}
            </ul>
          );
        }

        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}
