import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, ShieldCheck, Check, X, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { logHmsAudit } from "@/lib/hms/audit";

const REASON_TYPES = [
  { value: "urgent_job", label: "Hasteoppdrag" },
  { value: "critical_failure", label: "Driftskritisk feil" },
  { value: "customer_demand", label: "Kundekrav" },
  { value: "delay", label: "Forsinkelse" },
  { value: "standby", label: "Beredskap" },
  { value: "other", label: "Annet" },
];

export default function HmsOvertimePage() {
  const { activeCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [active, setActive] = useState<any | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [reasonType, setReasonType] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["hms-overtime", activeCompanyId, tab],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: rows } = await sb
        .from("overtime_approvals")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("status", tab)
        .order("created_at", { ascending: false });
      const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
      let names: Record<string, string> = {};
      if (userIds.length) {
        const { data: u } = await sb.from("user_accounts").select("id, full_name, email").in("id", userIds);
        names = Object.fromEntries((u ?? []).map((x: any) => [x.id, x.full_name || x.email || "Ukjent"]));
      }
      return (rows ?? []).map((r: any) => ({ ...r, employee_name: names[r.user_id] ?? "Ukjent" }));
    },
  });

  const decideMut = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { data: u } = await supabase.auth.getUser();
      if (!reason.trim()) throw new Error("Årsak er påkrevd");
      await (supabase as any).from("overtime_approvals").update({
        status: decision === "approve" ? "approved" : "rejected",
        approved_by: u.user?.id,
        approved_at: new Date().toISOString(),
        reason: reason,
        reason_type: reasonType || null,
      }).eq("id", active.id);

      // Audit
      await logHmsAudit({
        company_id: activeCompanyId,
        entity_type: "overtime_approval",
        entity_id: active.id,
        action: decision === "approve" ? "overtime_approved" : "overtime_rejected",
        payload: { reason, reason_type: reasonType, period_start: active.period_start, period_end: active.period_end, hours: active.approved_hours, user_id: active.user_id },
      });

      // Re-evaluate AML for that user
      try {
        await (supabase as any).functions.invoke("worktime-aml-evaluate", {
          body: { company_id: activeCompanyId, user_id: active.user_id },
        });
      } catch {}
    },
    onSuccess: () => {
      toast({ title: decision === "approve" ? "Overtid godkjent" : "Overtid avvist" });
      qc.invalidateQueries({ queryKey: ["hms-overtime"] });
      setActive(null); setReason(""); setReasonType("");
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <HmsMobileBack />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Overtidsgodkjenning</h1>
        <p className="text-sm text-muted-foreground">Behandle overtidssaker. Årsak er påkrevd og audit logges.</p>
      </div>

      <div className="flex gap-1 border-b">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 transition ${
              tab === t ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pending" ? "Venter" : t === "approved" ? "Godkjent" : "Avvist"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Ingen saker.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((r: any) => (
            <Card key={r.id} className="border-border/60">
              <CardContent className="py-3 flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.employee_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.period_start} – {r.period_end} · <strong>{Number(r.approved_hours).toFixed(1)}t</strong>
                    {r.reason_type && <> · {REASON_TYPES.find(x => x.value === r.reason_type)?.label || r.reason_type}</>}
                  </div>
                  {r.reason && <div className="text-xs text-muted-foreground mt-1 italic">{r.reason}</div>}
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>{r.status}</Badge>
                {tab === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setActive(r); setDecision("reject"); }}>
                      <X className="h-3.5 w-3.5 mr-1" />Avvis
                    </Button>
                    <Button size="sm" onClick={() => { setActive(r); setDecision("approve"); }}>
                      <Check className="h-3.5 w-3.5 mr-1" />Godkjenn
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === "approve" ? "Godkjenn overtid" : "Avvis overtid"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-muted/30 rounded p-2">
              <div><strong>{active?.employee_name}</strong></div>
              <div className="text-xs text-muted-foreground">{active?.period_start} – {active?.period_end} · {Number(active?.approved_hours || 0).toFixed(1)}t</div>
            </div>
            <div>
              <Label>Årsakstype</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                <SelectContent>
                  {REASON_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />Begrunnelse *</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Påkrevd" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>Avbryt</Button>
            <Button onClick={() => decideMut.mutate()} disabled={!reason.trim() || decideMut.isPending}
              variant={decision === "reject" ? "destructive" : "default"}>
              {decideMut.isPending ? "Lagrer…" : decision === "approve" ? "Godkjenn" : "Avvis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
