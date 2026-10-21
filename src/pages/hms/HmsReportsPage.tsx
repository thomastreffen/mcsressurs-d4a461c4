import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useState } from "react";
import { FileBarChart2, Download, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) {
    toast({ title: "Ingen data", description: "Ingen rader å eksportere", variant: "destructive" });
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const today = new Date().toISOString().slice(0, 10);
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

export default function HmsReportsPage() {
  const { activeCompanyId } = useCompanyContext();
  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  async function lookupNames(authUserIds: string[]) {
    if (!authUserIds.length) return {};
    const { data } = await (supabase as any)
      .from("user_accounts")
      .select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
      .in("auth_user_id", authUserIds);
    return Object.fromEntries(
      (data ?? []).map((x: any) => [x.auth_user_id, x.person?.full_name || x.person?.email || x.auth_user_id])
    );
  }

  async function exportAml(status: "open" | "all") {
    setBusy("aml-" + status);
    try {
      const sb = supabase as any;
      let q = sb.from("worktime_alerts").select("*").eq("company_id", activeCompanyId)
        .gte("period_end", from).lte("period_end", to);
      if (status === "open") q = q.in("status", ["open", "acknowledged"]);
      const { data: alerts } = await q;
      const names = await lookupNames(Array.from(new Set((alerts ?? []).map((a: any) => a.user_id))));
      const rows = (alerts ?? []).map((a: any) => ({
        Ansatt: names[a.user_id] || "",
        Regel: a.rule_key,
        Tittel: a.title || "",
        Periode: `${a.period_start} – ${a.period_end}`,
        Verdi: a.value,
        Grense: a.threshold,
        Severity: a.severity,
        Status: a.status,
        Forklaring: a.explanation || a.why,
        Tiltak: a.recommended_action || a.suggested_action,
        Opprettet: a.created_at,
      }));
      downloadCsv(`aml-${status}-${from}-${to}.csv`, rows);
    } finally { setBusy(null); }
  }

  async function exportOvertime() {
    setBusy("ot");
    try {
      const sb = supabase as any;
      const { data } = await sb.from("overtime_approvals").select("*")
        .eq("company_id", activeCompanyId).gte("period_end", from).lte("period_end", to);
      const names = await lookupNames(Array.from(new Set((data ?? []).map((a: any) => a.user_id))));
      downloadCsv(`overtid-${from}-${to}.csv`, (data ?? []).map((r: any) => ({
        Ansatt: names[r.user_id] || "",
        Periode: `${r.period_start} – ${r.period_end}`,
        Timer: r.approved_hours,
        Status: r.status,
        Årsakstype: r.reason_type || "",
        Begrunnelse: r.reason || "",
        Godkjent: r.approved_at || "",
      })));
    } finally { setBusy(null); }
  }

  async function exportSubmissions() {
    setBusy("subs");
    try {
      const sb = supabase as any;
      const { data } = await sb.from("hms_submissions").select("*")
        .eq("company_id", activeCompanyId).gte("submitted_at", from).lte("submitted_at", to + "T23:59:59")
        .is("deleted_at", null);
      downloadCsv(`sja-sjekklister-${from}-${to}.csv`, (data ?? []).map((s: any) => ({
        Tittel: s.title || "",
        Type: s.kind || "",
        Status: s.status,
        Innsendt: s.submitted_at || "",
        Mal_versjon: s.template_version || "",
        Avvist: s.rejection_reason || "",
      })));
    } finally { setBusy(null); }
  }

  async function exportHandbookAcks() {
    setBusy("hb");
    try {
      const sb = supabase as any;
      const { data } = await sb.from("hms_handbook_acknowledgements").select("*, hms_handbooks(title)")
        .eq("company_id", activeCompanyId).gte("acknowledged_at", from).lte("acknowledged_at", to + "T23:59:59");
      const names = await lookupNames(Array.from(new Set((data ?? []).map((a: any) => a.user_id))));
      downloadCsv(`håndbokbekreftelser-${from}-${to}.csv`, (data ?? []).map((a: any) => ({
        Ansatt: names[a.user_id] || "",
        Håndbok: a.hms_handbooks?.title || "",
        Bekreftet: a.acknowledged_at,
      })));
    } finally { setBusy(null); }
  }

  const reports = [
    { key: "aml-open", title: "Åpne AML-varsler", desc: "Pågående og kvitterte varsler i perioden", run: () => exportAml("open") },
    { key: "aml-all", title: "Alle AML-varsler", desc: "Inkluderer løste og avviste", run: () => exportAml("all") },
    { key: "ot", title: "Overtid per ansatt", desc: "Godkjenninger med årsak og status", run: exportOvertime },
    { key: "subs", title: "SJA / sjekklister", desc: "Innsendinger med status og malversjon", run: exportSubmissions },
    { key: "hb", title: "Håndbokbekreftelser", desc: "Hvem har bekreftet hvilken håndbok", run: exportHandbookAcks },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <HmsMobileBack />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><FileBarChart2 className="h-6 w-6 text-primary" />Rapporter</h1>
        <p className="text-sm text-muted-foreground">CSV-eksport for AML, overtid, SJA og håndbøker. PDF-rapporter kommer.</p>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Periode</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><Label>Fra</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Til</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reports.map((r) => (
          <Card key={r.key} className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-base">{r.title}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{r.desc}</p>
              <Button onClick={r.run} disabled={busy === r.key} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />{busy === r.key ? "Eksporterer…" : "Last ned CSV"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
