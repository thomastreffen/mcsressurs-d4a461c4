import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FlaskConical,
  GraduationCap, HelpCircle, Loader2, MessageSquare, Send, ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useSendChemicalInfo } from "@/hooks/useChemicals";
import { useSendHandbook } from "@/hooks/useHandbookDistribution";
import {
  logReadinessAction, useAddReadinessOverride, useEventRiskTags, useReadinessEvaluator,
  type TechIdentity,
} from "@/hooks/useWorkReadiness";
import {
  READINESS_STYLES, REQ_STATE_LABEL, RISK_TAG_LABEL,
  type RequirementResult, type ReadinessResult,
} from "@/lib/hms/workReadiness";

interface Props {
  eventId: string;
  jobTitle?: string;
  /** Planlagte montører. Kan være delvis utfylt (navn/e-post) – identiteten slås opp mot ansattregisteret. */
  technicians: TechIdentity[];
  /** Overstyr taggene (ellers hentes de fra oppdraget). */
  tags?: string[];
}

function StateIcon({ r }: { r: RequirementResult }) {
  if (r.state === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (r.state === "overridden") return <ShieldCheck className="h-4 w-4 shrink-0 text-sky-600" />;
  if (r.state === "unknown") return <HelpCircle className="h-4 w-4 shrink-0 text-slate-500" />;
  return (
    <AlertTriangle
      className={`h-4 w-4 shrink-0 ${r.requirement.severity === "critical" ? "text-red-600" : "text-amber-600"}`}
    />
  );
}

/** Samlet "Klar for arbeid"-status per planlagt montør, med hurtighandlinger. */
export function WorkReadinessPanel({ eventId, jobTitle, technicians, tags: tagsProp }: Props) {
  const { data: savedTags = [] } = useEventRiskTags(tagsProp ? undefined : eventId);
  const tags = tagsProp ?? savedTags;
  const { evaluate, data, isLoading } = useReadinessEvaluator();
  const [openFor, setOpenFor] = useState<string | null>(null);

  const rows = useMemo(
    () => technicians.filter(Boolean).map((t) => ({ input: t, ...evaluate(tags, t, eventId) })),
    [technicians, tags, evaluate, eventId]
  );

  if (tags.length === 0 || technicians.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Klar for arbeid</span>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[11px]">{RISK_TAG_LABEL[t] ?? t}</Badge>
          ))}
        </div>
      </div>

      <div className="divide-y">
        {rows.map((row, idx) => {
          const key = row.tech.person_id ?? row.tech.user_id ?? row.tech.email ?? String(idx);
          const expanded = openFor === key;
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => setOpenFor(expanded ? null : key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
              >
                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm">{row.tech.full_name ?? "Montør"}</span>
                <Badge variant="outline" className={`ml-auto text-xs ${READINESS_STYLES[row.readiness.level]}`}>
                  {row.readiness.label}
                </Badge>
              </button>

              {row.readiness.level === "critical" && !expanded && (
                <p className="px-3 pb-2 text-xs text-red-700">
                  {criticalMessage(row.readiness, row.tech.full_name ?? "Ansatt")}
                </p>
              )}

              {expanded && (
                <ReadinessDetail
                  eventId={eventId}
                  jobTitle={jobTitle}
                  tags={tags}
                  tech={row.tech}
                  readiness={row.readiness}
                  sections={data?.sections ?? []}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function criticalMessage(r: ReadinessResult, name: string) {
  const first = r.missingCritical[0]?.requirement;
  if (!first) return "";
  if (first.kind === "chemical") return `${name} mangler bekreftet epoxy-/kjemikalieinformasjon før planlagt arbeid.`;
  if (first.key === "fse_competence") return `${name} mangler gyldig FSE-opplæring.`;
  if (first.kind === "manual") return "Arbeid krever SJA før oppstart.";
  return `${name} mangler bekreftelse: ${first.label}.`;
}

function ReadinessDetail({
  eventId, jobTitle, tags, tech, readiness, sections,
}: {
  eventId: string;
  jobTitle?: string;
  tags: string[];
  tech: TechIdentity;
  readiness: ReadinessResult;
  sections: { id: string; heading: string; handbook_id?: string | null; version_id?: string | null }[];
}) {
  const { activeCompanyId } = useCompanyContext();
  const sendChemical = useSendChemicalInfo();
  const sendHandbook = useSendHandbook();
  const addOverride = useAddReadinessOverride();
  const [overrideFor, setOverrideFor] = useState<RequirementResult | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const missingChemicals = useMemo(() => {
    const out: { id: string; product_name: string }[] = [];
    for (const r of readiness.requirements) {
      if (r.requirement.kind !== "chemical") continue;
      for (const c of r.chemicals ?? []) {
        if (!c.acknowledged_at || c.needsNewAck) out.push({ id: c.chemical.id, product_name: c.chemical.product_name });
      }
    }
    return out;
  }, [readiness]);

  const missingSectionIds = useMemo(() => {
    const out = new Set<string>();
    for (const r of readiness.requirements) {
      if (r.requirement.kind !== "handbook") continue;
      for (const s of r.sections ?? []) if (!s.acknowledged_at) out.add(s.section.id);
    }
    return [...out];
  }, [readiness]);

  const recipient = [{
    person_id: tech.person_id ?? null, user_id: tech.user_id ?? null,
    full_name: tech.full_name ?? null, email: tech.email ?? null, phone: tech.phone ?? null,
  }];

  const send = async (kind: "distribution" | "reminder") => {
    if (!tech.email) {
      toast({ title: "Mangler e-postadresse", description: "Ansatt har ingen e-post registrert.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      let sentAnything = false;
      for (const c of missingChemicals) {
        await sendChemical.mutateAsync({
          chemical_id: c.id,
          channels: ["email"],
          kind,
          subject: `${kind === "reminder" ? "Purring: " : ""}Sikkerhetsinformasjon: ${c.product_name}`,
          message: `Du er planlagt på arbeid${jobTitle ? ` (${jobTitle})` : ""} der dette produktet brukes. Les rutine og sikkerhetsdatablad, og bekreft før arbeidet starter.`,
          recipients: recipient,
        });
        sentAnything = true;
      }

      const byBook = new Map<string, { handbook_id: string; version_id: string; ids: string[] }>();
      for (const id of missingSectionIds) {
        const s = sections.find((x) => x.id === id);
        if (!s?.handbook_id || !s.version_id) continue;
        const k = `${s.handbook_id}:${s.version_id}`;
        const cur = byBook.get(k) ?? { handbook_id: s.handbook_id, version_id: s.version_id, ids: [] };
        cur.ids.push(id);
        byBook.set(k, cur);
      }
      for (const pkg of byBook.values()) {
        await sendHandbook.mutateAsync({
          handbook_id: pkg.handbook_id,
          version_id: pkg.version_id,
          section_ids: pkg.ids,
          channels: ["email"],
          kind,
          subject: `${kind === "reminder" ? "Purring: " : ""}HMS-rutiner før planlagt arbeid`,
          message: `Les og bekreft rutinene som gjelder for planlagt arbeid${jobTitle ? ` (${jobTitle})` : ""}.`,
          recipients: recipient,
        });
        sentAnything = true;
      }

      if (!sentAnything) {
        toast({ title: "Ingenting å sende", description: "Manglende krav kan ikke sendes automatisk (SJA/PVU følges opp manuelt)." });
        return;
      }
      await logReadinessAction(activeCompanyId, eventId, kind === "reminder" ? "readiness.reminder_sent" : "readiness.info_sent", {
        technician: tech.full_name, email: tech.email, risk_tags: tags,
        chemicals: missingChemicals.map((c) => c.product_name), section_ids: missingSectionIds,
        requirements: readiness.requirements.map((r) => ({ key: r.requirement.key, state: r.state })),
      });
      toast({ title: kind === "reminder" ? "Purring sendt" : "Informasjon sendt", description: `${tech.full_name ?? "Ansatt"} har fått personlig lenke med krav om bekreftelse.` });
    } catch (e: any) {
      toast({ title: "Kunne ikke sende", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveOverride = async () => {
    if (!overrideFor || !comment.trim()) return;
    try {
      await addOverride.mutateAsync({
        event_id: eventId,
        tech,
        requirement_key: overrideFor.requirement.key,
        requirement_label: overrideFor.requirement.label,
        risk_tags: tags,
        comment: comment.trim(),
      });
      toast({ title: "Vurdering lagret", description: "Varselet er markert som vurdert. Historikken beholdes." });
      setOverrideFor(null);
      setComment("");
    } catch (e: any) {
      toast({ title: "Kunne ikke lagre vurdering", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3 bg-muted/30 px-3 py-3">
      <ul className="space-y-2">
        {readiness.requirements.map((r) => (
          <li key={r.requirement.key} className="flex gap-2 text-xs">
            <StateIcon r={r} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium text-foreground">{r.requirement.label}</span>
                <Badge variant="outline" className="text-[10px]">{REQ_STATE_LABEL[r.state]}</Badge>
                {r.requirement.severity === "critical" && r.state === "missing" && (
                  <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] text-red-700">Kritisk</Badge>
                )}
              </div>
              <p className="text-muted-foreground">{r.detail}</p>
              {r.lastConfirmedAt && (
                <p className="text-muted-foreground">Sist bekreftet/gyldig: {r.lastConfirmedAt.slice(0, 10)}</p>
              )}
              {(r.chemicals ?? []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {r.chemicals!.map((c) => (
                    <Link
                      key={c.chemical.id}
                      to={`/hms/kjemikalier/${c.chemical.id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FlaskConical className="h-3 w-3" />
                      {c.chemical.product_name}
                      {c.chemical.sds_revision_date ? ` (SDS ${c.chemical.sds_revision_date.slice(0, 10)})` : " (SDS mangler)"}
                    </Link>
                  ))}
                </div>
              )}
              {(r.sections ?? []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {r.sections!.map((s) => (
                    <Link
                      key={s.section.id}
                      to={s.section.handbook_id ? `/hms/handbok/${s.section.handbook_id}` : "/hms/handbok"}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {s.section.heading}
                    </Link>
                  ))}
                </div>
              )}
              {r.override && (
                <p className="mt-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
                  Vurdert {r.override.created_at.slice(0, 10)}: “{r.override.comment}”
                </p>
              )}
              {r.state === "missing" && (
                <Button
                  size="sm" variant="ghost" className="mt-1 h-6 px-2 text-xs"
                  onClick={() => { setOverrideFor(r); setComment(""); }}
                >
                  <MessageSquare className="mr-1 h-3 w-3" /> Marker som vurdert
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send("distribution")} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
          Send info og krav om bekreftelse
        </Button>
        <Button size="sm" variant="outline" onClick={() => send("reminder")} disabled={busy}>
          Send purring
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/hms/templates">Opprett SJA</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/compliance/kompetanse">
            <GraduationCap className="mr-1 h-3 w-3" /> Kompetanseoversikt
          </Link>
        </Button>
      </div>

      <Dialog open={!!overrideFor} onOpenChange={(o) => !o && setOverrideFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marker som vurdert</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{overrideFor?.requirement.label}</p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Eks: SJA gjennomføres fysisk på stedet før oppstart."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideFor(null)}>Avbryt</Button>
            <Button onClick={saveOverride} disabled={!comment.trim() || addOverride.isPending}>
              {addOverride.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Lagre vurdering
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
