/**
 * DOKUMENTASJONSBEHOV – fra huskeliste til faktiske bevis.
 *
 * For hvert dokumentasjonsbehov søker systemet i eksisterende virksomhetsdata
 * (dokumentarkiv, kompetansetyper/kravmotor og internkontroll) etter mulige
 * bevis. Systemet hevder ALDRI at et dokument lukker funnet – brukeren må
 * eksplisitt godkjenne hvilke dokumenter som kobles som bevis.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileSearch, HelpCircle, Link2, XCircle } from "lucide-react";
import { useCompetenceTypes, useComplianceAudits } from "@/hooks/useCompliance";
import { useEvidenceMutations, type Finding, type FindingEvidence } from "@/hooks/useInspections";

const sb = supabase as any;

const STOPWORDS = new Set([
  "og", "eller", "for", "med", "til", "som", "det", "den", "der", "har", "hva", "skal", "være", "vise",
  "dokumentasjon", "dokumenter", "dokument", "oversikt", "kopi", "av", "på", "i", "en", "et", "the", "må",
]);

function tokens(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9æøå\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function score(need: string, candidate: string): number {
  const a = tokens(need);
  const b = new Set(tokens(candidate));
  if (!a.length) return 0;
  return a.filter((t) => b.has(t)).length;
}

type Candidate =
  | { kind: "document"; id: string; label: string }
  | { kind: "competence_requirement"; id: string; label: string }
  | { kind: "internal_audit"; id: string; label: string };

function useCompanyDocuments() {
  const { activeCompanyId } = useCompanyContext();
  return useQuery<{ id: string; label: string; category: string | null }[]>({
    queryKey: ["finding-doc-candidates", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("documents")
        .select("id, file_name, category")
        .eq("company_id", activeCompanyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id, label: r.file_name, category: r.category ?? null }));
    },
  });
}

export function FindingDocumentationSuggestions({
  finding, inspectionId, evidence, canEdit,
}: {
  finding: Finding;
  inspectionId: string;
  evidence: FindingEvidence[];
  canEdit: boolean;
}) {
  const documents = useCompanyDocuments();
  const competenceTypes = useCompetenceTypes();
  const audits = useComplianceAudits();
  const { add } = useEvidenceMutations();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const needs = useMemo(() => {
    const raw = (finding.ai_suggestions as any)?.needed_documentation;
    return Array.isArray(raw) ? raw.filter((x: any) => typeof x === "string" && x.trim()) : [];
  }, [finding.ai_suggestions]);

  const rows = useMemo(() => {
    return needs.map((need: string) => {
      const existing = evidence.filter((e) => score(need, `${e.label ?? ""} ${e.note ?? ""}`) > 0);
      const candidates: Candidate[] = [];

      for (const t of competenceTypes.data ?? []) {
        if (score(need, t.name) > 0 && !evidence.some((e) => e.competence_type_id === t.id)) {
          candidates.push({ kind: "competence_requirement", id: t.id, label: t.name });
        }
      }
      for (const a of audits.data ?? []) {
        if (score(need, a.title) > 0 && !evidence.some((e) => e.ref_id === a.id)) {
          candidates.push({ kind: "internal_audit", id: a.id, label: a.title });
        }
      }
      const docs = (documents.data ?? [])
        .map((d) => ({ d, s: score(need, `${d.label} ${d.category ?? ""}`) }))
        .filter((x) => x.s > 0 && !evidence.some((e) => e.document_id === x.d.id))
        .sort((a, b) => b.s - a.s)
        .slice(0, 5);
      for (const { d } of docs) candidates.push({ kind: "document", id: d.id, label: d.label });

      return { need, existing, candidates: candidates.slice(0, 8) };
    });
  }, [needs, evidence, competenceTypes.data, audits.data, documents.data]);

  if (!needs.length) return null;

  const link = (need: string, c: Candidate) => {
    const payload: any = {
      inspection_id: inspectionId,
      finding_id: finding.id,
      source_kind: c.kind,
      label: c.label,
      note: `Godkjent som bevis for: ${need}`,
    };
    if (c.kind === "document") payload.document_id = c.id;
    else if (c.kind === "competence_requirement") payload.competence_type_id = c.id;
    else payload.ref_id = c.id;
    add.mutate(payload);
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dokumentasjon som må fremskaffes</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Systemet har søkt i eksisterende dokumentasjon. Et treff er kun et forslag – du må godkjenne hva som faktisk
        dokumenterer forholdet.
      </p>

      {rows.map(({ need, existing, candidates }) => {
        const status = existing.length ? "found" : candidates.length ? "possible" : "missing";
        return (
          <div key={need} className="rounded-md border bg-card px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {status === "found" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              {status === "possible" && <HelpCircle className="h-3.5 w-3.5 text-amber-600" />}
              {status === "missing" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
              <span className="flex-1 min-w-[180px] text-sm">{need}</span>
              <Badge
                variant="outline"
                className={
                  "text-[10px] " +
                  (status === "found" ? "border-emerald-500/40 text-emerald-600"
                    : status === "possible" ? "border-amber-500/40 text-amber-600"
                      : "border-destructive/40 text-destructive")
                }
              >
                {status === "found" ? "Finnes allerede" : status === "possible" ? "Mulig dokumentasjon" : "Mangler"}
              </Badge>
            </div>

            {existing.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Koblet som bevis: {existing.map((e) => e.label ?? "Bevis").join(", ")}
              </p>
            )}

            {candidates.length > 0 && (
              <div className="mt-2 space-y-1">
                {candidates
                  .filter((c) => !dismissed.includes(`${need}|${c.id}`))
                  .map((c) => (
                    <div key={`${need}-${c.kind}-${c.id}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                      <span className="flex-1 min-w-[160px] text-xs">{c.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.kind === "document" ? "Dokument" : c.kind === "competence_requirement" ? "Kompetanse (kravmotor)" : "Internkontroll"}
                      </span>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => link(need, c)}>
                            <Link2 className="mr-1 h-3 w-3" /> Godkjenn som bevis
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDismissed((d) => [...d, `${need}|${c.id}`])}>
                            Ikke relevant
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {status === "missing" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ingen eksisterende dokumentasjon treffer dette behovet. Dokumentasjonen må fremskaffes og lastes opp der
                den hører hjemme, og deretter kobles som bevis.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
