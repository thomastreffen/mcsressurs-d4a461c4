import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useState } from "react";
import { LocalExportMenu } from '@/components/LocalExportMenu';
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Filter, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_LABELS, type SubmissionStatus } from "@/lib/hms/submissions";
import { format } from "date-fns";

const STATUS_TABS: Array<{ key: "all" | SubmissionStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Utkast" },
  { key: "submitted", label: "Til godkjenning" },
  { key: "approved", label: "Godkjent" },
  { key: "rejected", label: "Avvist" },
];

export default function HmsSubmissionsPage() {
  const { activeCompanyId } = useCompanyContext();
  const [tab, setTab] = useState<"all" | SubmissionStatus>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "sja" | "checklist">("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["hms-submissions-admin", activeCompanyId, tab, kindFilter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const sb = supabase as any;
      let q = sb
        .from("hms_submissions")
        .select("id, title, status, kind, hms_areas, submitted_at, created_at, updated_at, submitted_by, project_id")
        .eq("company_id", activeCompanyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (tab !== "all") q = q.eq("status", tab);
      if (kindFilter !== "all") q = q.eq("kind", kindFilter);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const filtered = (data ?? []).filter((s) =>
    !search ? true : (s.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Innsendinger</h1>
          <p className="text-sm text-muted-foreground">Alle SJA og sjekklister sendt inn fra felt.</p>
        </div>
        <LocalExportMenu title="SJA / sjekklister / vernerunder" module="hms" disabled={isLoading} filters={{Søk:search||'Alle',Type:kindFilter,Status:STATUS_TABS.find(t=>t.key===tab)?.label??tab}} rows={filtered.map(s=>({'Tittel':s.title,'Type':s.kind,'Status':STATUS_LABELS[s.status as SubmissionStatus]??s.status,'Oppdatert':new Date(s.updated_at),'Sendt inn':s.submitted_at?new Date(s.submitted_at):null,'HMS-områder':(s.hms_areas??[]).join(', ')}))}/>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søk på tittel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">Alle typer</TabsTrigger>
            <TabsTrigger value="sja">SJA</TabsTrigger>
            <TabsTrigger value="checklist">Sjekklister</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-12">Laster…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Ingen innsendinger.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Link
              key={s.id}
              to={`/hms/submissions/${s.id}`}
              className="block p-3 rounded-lg border border-border/60 bg-card hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{s.kind?.toUpperCase()}</Badge>
                    <div className="text-sm font-medium truncate">{s.title || "Uten tittel"}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Oppdatert {format(new Date(s.updated_at), "dd.MM.yyyy HH:mm")}
                    {s.submitted_at && ` · Sendt inn ${format(new Date(s.submitted_at), "dd.MM.yyyy")}`}
                  </div>
                  {s.hms_areas?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {s.hms_areas.slice(0, 4).map((a: string) => (
                        <Badge key={a} variant="outline" className="text-[10px] py-0 h-4 px-1.5">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <StatusPill status={s.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SubmissionStatus }) {
  const cls =
    status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
    status === "submitted" ? "bg-blue-50 text-blue-700 border-blue-200" :
    status === "draft" ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{STATUS_LABELS[status] ?? status}</Badge>;
}
