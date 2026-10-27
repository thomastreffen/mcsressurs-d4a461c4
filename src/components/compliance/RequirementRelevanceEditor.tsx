import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAssessPersonRequirement, type RequirementAssessment, type RequirementStatusRow } from "@/hooks/useComplianceRequirements";
import { relevanceDocumentation } from "@/lib/requirement-relevance";

export function RequirementRelevanceEditor({ row, history, canManage }: { row: RequirementStatusRow; history: RequirementAssessment[]; canManage: boolean }) {
  const mutation = useAssessPersonRequirement();
  const [editing, setEditing] = useState(false); const [reason, setReason] = useState("");
  const [until, setUntil] = useState(""); const [error, setError] = useState("");
  const [saved, setSaved] = useState(false); const [showHistory, setShowHistory] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const exempt = row.status === "not_relevant";
  const records = history.filter(a => a.requirement_id === row.requirement_id);
  const start = () => { setEditing(true); setSaved(false); setError(""); setReason(""); setUntil(""); setRequestId(crypto.randomUUID()); };
  async function save() {
    if (!reason.trim()) { setError("Begrunnelse er påkrevd"); return; }
    if (exempt && !row.assessment_id) { setError("Vurderingen kunne ikke hentes. Last siden på nytt."); return; }
    setError("");
    try {
      await mutation.mutateAsync({ personId: row.person_id, requirementId: row.requirement_id, reason,
        validUntil: exempt ? null : until || null, revokeId: exempt ? row.assessment_id ?? undefined : undefined, clientRequestId: requestId });
      setEditing(false); setReason(""); setUntil(""); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke lagre vurderingen"); }
  }
  return <div className="mt-2 space-y-2">
    {exempt && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{relevanceDocumentation(row)}</p>}
    <div className="flex flex-wrap gap-2">
      {canManage && row.required && !editing && <Button size="sm" variant="outline" onClick={start}>{exempt ? "Opphev vurdering" : "Vurder som ikke relevant"}</Button>}
      {records.length > 0 && <Button size="sm" variant="ghost" onClick={() => setShowHistory(v => !v)}>Vurderingshistorikk ({records.length})</Button>}
    </div>
    {editing && <div className="space-y-2 border-l-2 border-border pl-3">
      <Label htmlFor={`relevance-reason-${row.requirement_id}`}>{exempt ? "Begrunnelse for oppheving" : "Dokumentert rolle-/risikovurdering"}</Label>
      <Textarea id={`relevance-reason-${row.requirement_id}`} value={reason} onChange={e => { setReason(e.target.value); setRequestId(crypto.randomUUID()); }} disabled={mutation.isPending} />
      {!exempt && <div className="space-y-1"><Label htmlFor={`relevance-until-${row.requirement_id}`}>Gyldig til / neste revurdering (valgfritt)</Label><Input id={`relevance-until-${row.requirement_id}`} type="date" value={until} onChange={e => { setUntil(e.target.value); setRequestId(crypto.randomUUID()); }} disabled={mutation.isPending} /></div>}
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={mutation.isPending || !reason.trim()} onClick={() => void save()}>{mutation.isPending ? "Lagrer…" : exempt ? "Opphev vurdering" : "Lagre vurdering"}</Button><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => { setEditing(false); setReason(""); setUntil(""); setError(""); }}>Avbryt</Button></div>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {saved && <p role="status" className="text-xs text-primary">Vurderingen er lagret.</p>}
    {showHistory && <div className="space-y-2 border-t pt-2">{records.map(a => <div key={a.id} className="text-xs"><p className="font-medium">{a.decision === "revoke" ? "Opphevet" : "Vurdert ikke relevant"} · {a.assessor_name} · {new Date(a.assessed_at).toLocaleString("nb-NO")}</p><p className="whitespace-pre-wrap text-muted-foreground">{a.reason}{a.valid_until ? ` · Revurdering ${a.valid_until}` : ""}</p></div>)}</div>}
  </div>;
}