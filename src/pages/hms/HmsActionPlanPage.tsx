import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useAssignableUsers } from "@/hooks/useCompanyUsers";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalExportMenu } from "@/components/LocalExportMenu";
import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import {
  ACTION_DISPLAY_LABEL, ACTION_SOURCE_LABEL, actionDisplayStatus, deriveActionSource,
  type ActionDisplayStatus,
} from "@/lib/hms/internalControl";
import { format } from "date-fns";

const STATUS_STYLE: Record<ActionDisplayStatus, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  waiting: "bg-slate-50 text-slate-600 border-slate-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
};

type StatusFilter = "all" | ActionDisplayStatus;

/** HMS-handlingsplan: samlet tiltaksliste på tvers av kilder (risiko, avvik, revisjon, tilsyn …). */
export default function HmsActionPlanPage() {
  const { activeCompanyId: cid } = useCompanyContext();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hms.manage");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: users } = useAssignableUsers();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [form, setForm] = useState<{ title: string; description: string; assignee_user_id: string; due_date: string; priority: string } | null>(null);

  const { data: actions, isLoading } = useQuery({
    queryKey: ["hms-action-plan", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hms_action_items")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const nameOf = (id: string | null) => users?.find((u) => u.id === id)?.name ?? null;
  const now = new Date();

  const counts = useMemo(() => {
    const list = actions ?? [];
    const bySource: Record<string, number> = {};
    for (const a of list) {
      if (a.status === "done") continue;
      const s = deriveActionSource(a);
      bySource[s] = (bySource[s] ?? 0) + 1;
    }
    return {
      open: list.filter((a) => a.status !== "done").length,
      overdue: list.filter((a) => actionDisplayStatus(a, now) === "overdue").length,
      critical: list.filter((a) => a.status !== "done" && (a.priority === "high" || a.priority === "critical")).length,
      bySource,
    };
  }, [actions]);

  const filtered = useMemo(() => {
    let list = actions ?? [];
    if (statusFilter !== "all") list = list.filter((a) => actionDisplayStatus(a, now) === statusFilter);
    if (sourceFilter !== "all") list = list.filter((a) => deriveActionSource(a) === sourceFilter);
    return list;
  }, [actions, statusFilter, sourceFilter]);

  const saveMut = useMutation({
    mutationFn: async (f: NonNullable<typeof form>) => {
      if (!cid || !user) throw new Error("Mangler kontekst");
      const { error } = await (supabase as any).from("hms_action_items").insert({
        company_id: cid,
        title: f.title.trim(),
        description: f.description || null,
        assignee_user_id: f.assignee_user_id || null,
        due_date: f.due_date || null,
        priority: f.priority,
        status: "open",
        source_type: "manual",
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Tiltak opprettet" });
      setForm(null);
      qc.invalidateQueries({ queryKey: ["hms-action-plan"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  const doneMut = useMutation({
    mutationFn: async (id: string) => {
      if (!user || !cid) throw new Error("Mangler kontekst");
      if (!canManage) {
        const { error } = await supabase.rpc("hms_complete_own_action", { _company_id: cid, _action_id: id });
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("hms_action_items").update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("company_id", cid).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Tiltak ferdig" });
      qc.invalidateQueries({ queryKey: ["hms-action-plan"] });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <HmsMobileBack />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <ListChecks className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">HMS-handlingsplan</h1>
          <p className="text-sm text-muted-foreground">Alle tiltak på tvers av risiko, avvik, revisjon, tilsyn og årshjul.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LocalExportMenu
            title="HMS-handlingsplan" module="hms" disabled={isLoading}
            filters={{ Status: statusFilter, Kilde: sourceFilter }}
            rows={filtered.map((a) => ({
              Tiltak: a.title, Kilde: ACTION_SOURCE_LABEL[deriveActionSource(a)] ?? "Manuelt",
              Status: ACTION_DISPLAY_LABEL[actionDisplayStatus(a, now)],
              Prioritet: a.priority, Ansvarlig: nameOf(a.assignee_user_id) ?? "",
              Frist: a.due_date ?? "", "Lukket dato": a.completed_at ? new Date(a.completed_at) : null,
            }))}
          />
          {canManage && <Button size="sm" onClick={() => setForm({ title: "", description: "", assignee_user_id: "", due_date: "", priority: "normal" })}><Plus className="h-4 w-4 mr-1.5" /> Nytt tiltak</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{counts.open} åpne</Badge>
        <Badge variant="outline" className={counts.overdue ? "bg-rose-50 text-rose-700 border-rose-200" : ""}>{counts.overdue} forfalt</Badge>
        <Badge variant="outline" className={counts.critical ? "bg-orange-50 text-orange-700 border-orange-200" : ""}>{counts.critical} kritiske</Badge>
        {Object.entries(counts.bySource).map(([s, n]) => (
          <Badge key={s} variant="outline">{ACTION_SOURCE_LABEL[s] ?? s}: {n}</Badge>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
            <TabsList className="w-max sm:w-auto">
              <TabsTrigger value="all">Alle</TabsTrigger>
              <TabsTrigger value="open">Ny</TabsTrigger>
              <TabsTrigger value="in_progress">Pågår</TabsTrigger>
              <TabsTrigger value="waiting">Avventer</TabsTrigger>
              <TabsTrigger value="overdue">Forfalt</TabsTrigger>
              <TabsTrigger value="done">Ferdig</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Kilde" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kilder</SelectItem>
            {Object.entries(ACTION_SOURCE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Laster…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Ingen tiltak i denne visningen.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const st = actionDisplayStatus(a, now);
            const canComplete = canManage || a.assignee_user_id === user?.id;
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      <Badge variant="outline" className={STATUS_STYLE[st]}>{ACTION_DISPLAY_LABEL[st]}</Badge>
                      <Badge variant="outline" className="text-[10px]">{ACTION_SOURCE_LABEL[deriveActionSource(a)] ?? "Manuelt"}</Badge>
                      {(a.priority === "high" || a.priority === "critical") && <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">Høy prioritet</Badge>}
                    </div>
                    {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {a.due_date && `Frist ${format(new Date(a.due_date), "dd.MM.yyyy")}`}
                      {nameOf(a.assignee_user_id) && ` · Ansvarlig: ${nameOf(a.assignee_user_id)}`}
                      {a.completed_at && ` · Lukket ${format(new Date(a.completed_at), "dd.MM.yyyy")}${nameOf(a.completed_by) ? ` av ${nameOf(a.completed_by)}` : ""}`}
                    </div>
                  </div>
                  {a.status !== "done" && canComplete && (
                    <Button size="sm" variant="outline" disabled={doneMut.isPending} onClick={() => doneMut.mutate(a.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Merk ferdig
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
          <SheetHeader><SheetTitle>Nytt tiltak</SheetTitle></SheetHeader>
          {form && (
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Tiltak</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Hva skal gjøres?" />
              </div>
              <div className="space-y-1.5">
                <Label>Beskrivelse</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ansvarlig</Label>
                  <Select value={form.assignee_user_id} onValueChange={(v) => setForm({ ...form, assignee_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
                    <SelectContent>{(users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frist</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prioritet</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Lav</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Høy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex gap-2">
                <Button className="flex-1 min-h-11" disabled={!form.title.trim() || saveMut.isPending} onClick={() => saveMut.mutate(form)}>Opprett tiltak</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>Avbryt</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
