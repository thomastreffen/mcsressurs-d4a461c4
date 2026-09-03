import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ShieldAlert, AlertTriangle, Paperclip, Send, Loader2, Trash2,
  CheckCircle2, XCircle, ListTodo, Clock, MapPin, FolderKanban, History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { IncidentChemicalPanel } from "@/components/hms/IncidentChemicalPanel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { logHmsAudit } from "@/lib/hms/audit";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

const SEV: Record<string, { label: string; cls: string }> = {
  low: { label: "Lav", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "Middels", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  high: { label: "Høy", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  critical: { label: "Kritisk", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};
const TYPE_LABEL: Record<string, string> = {
  hms: "HMS-avvik", near_miss: "Nestenulykke", personal_injury: "Personskade",
  material_damage: "Materiell skade", quality: "Kvalitet", environment: "Miljø", observation: "HMS-observasjon",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Ny", in_progress: "Under behandling", action_pending: "Tiltak opprettet", closed: "Lukket", rejected: "Avvist",
};
const STATUS_TONE: Record<string, string> = {
  open: "bg-rose-50 text-rose-700 border-rose-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  action_pending: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-muted text-muted-foreground border-border",
};

export default function HmsIncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = hasPermission("hms.manage") || hasPermission("admin.manage_users");

  const incidentQuery = useQuery({
    queryKey: ["hms-incident", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb.from("hms_incidents").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const i = incidentQuery.data;

  const commentsQuery = useQuery({
    queryKey: ["hms-incident-comments", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("hms_incident_comments").select("*").eq("incident_id", id).order("created_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });
  const logQuery = useQuery({
    queryKey: ["hms-incident-log", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("hms_incident_status_log").select("*").eq("incident_id", id).order("created_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });
  const actionsQuery = useQuery({
    queryKey: ["hms-incident-actions", id],
    enabled: !!id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("hms_action_items").select("*").eq("incident_id", id).is("deleted_at", null).order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // Resolve people names
  const userIds = useMemo(() => {
    const s = new Set<string>();
    if (i?.reported_by) s.add(i.reported_by);
    if (i?.assigned_to) s.add(i.assigned_to);
    if (i?.closed_by) s.add(i.closed_by);
    (commentsQuery.data ?? []).forEach((c) => s.add(c.author_id));
    (logQuery.data ?? []).forEach((l) => { if (l.changed_by) s.add(l.changed_by); });
    (actionsQuery.data ?? []).forEach((a) => { if (a.assignee_user_id) s.add(a.assignee_user_id); });
    return Array.from(s);
  }, [i, commentsQuery.data, logQuery.data, actionsQuery.data]);

  const namesQuery = useQuery({
    queryKey: ["hms-incident-names", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("user_accounts").select("auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)").in("auth_user_id", userIds);
      return Object.fromEntries((data ?? []).map((a: any) => [a.auth_user_id, a.person?.full_name || a.person?.email || "Ukjent"])) as Record<string, string>;
    },
  });
  const names = namesQuery.data ?? {};

  const usersQuery = useQuery({
    queryKey: ["hms-assignable-users", activeCompanyId],
    enabled: !!activeCompanyId && canManage,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("user_memberships")
        .select("user_id, user:user_accounts!user_memberships_user_id_fkey(auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email))")
        .eq("company_id", activeCompanyId!).eq("is_active", true);
      const seen = new Set<string>();
      const out: { id: string; name: string }[] = [];
      for (const r of (data ?? [])) {
        const uid = r.user_id || r.user?.auth_user_id;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        out.push({ id: uid, name: r.user?.person?.full_name || r.user?.person?.email || uid.slice(0, 8) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const projectQuery = useQuery({
    queryKey: ["hms-incident-project", i?.project_id],
    enabled: !!i?.project_id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("events").select("id, title, project_number").eq("id", i.project_id).maybeSingle();
      return data as any;
    },
  });

  const updateIncident = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_incidents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await logHmsAudit({
        company_id: activeCompanyId!, action: "incident.updated",
        entity_type: "hms_incident", entity_id: id!, payload: patch,
      }).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hms-incident", id] });
      qc.invalidateQueries({ queryKey: ["hms-incident-log", id] });
      toast({ title: "Lagret" });
    },
    onError: (e: any) => toast({ title: "Kunne ikke lagre", description: e.message, variant: "destructive" }),
  });

  const [comment, setComment] = useState("");
  const addComment = useMutation({
    mutationFn: async () => {
      if (!comment.trim()) return;
      const sb = supabase as any;
      const { error } = await sb.from("hms_incident_comments").insert({
        incident_id: id, company_id: i.company_id, author_id: user!.id, body: comment.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["hms-incident-comments", id] });
    },
    onError: (e: any) => toast({ title: "Kunne ikke kommentere", description: e.message, variant: "destructive" }),
  });

  const [actionTitle, setActionTitle] = useState("");
  const [actionAssignee, setActionAssignee] = useState<string>("");
  const [actionDue, setActionDue] = useState<string>("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const createAction = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_action_items").insert({
        company_id: i.company_id, title: actionTitle.trim(),
        description: actionDescription.trim() || null,
        assignee_user_id: actionAssignee || null,
        due_date: actionDue || null,
        status: "open", priority: "normal",
        incident_id: id, created_by: user!.id,
      });
      if (error) throw error;
      // Also bump status to action_pending
      if (i.status === "open") {
        await sb.from("hms_incidents").update({ status: "action_pending", updated_at: new Date().toISOString() }).eq("id", id);
      }
    },
    onSuccess: () => {
      setActionTitle(""); setActionAssignee(""); setActionDue(""); setActionDescription("");
      setActionOpen(false);
      qc.invalidateQueries({ queryKey: ["hms-incident-actions", id] });
      qc.invalidateQueries({ queryKey: ["hms-incident", id] });
      toast({ title: "Tiltak opprettet" });
    },
    onError: (e: any) => toast({ title: "Kunne ikke opprette tiltak", description: e.message, variant: "destructive" }),
  });

  const [closeOpen, setCloseOpen] = useState<"closed" | "rejected" | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const closeMut = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_incidents").update({
        status: closeOpen,
        closed_at: new Date().toISOString(),
        closed_by: user!.id,
        closure_notes: closeReason.trim() || null,
        closed_reason: closeReason.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setCloseOpen(null); setCloseReason("");
      qc.invalidateQueries({ queryKey: ["hms-incident", id] });
      qc.invalidateQueries({ queryKey: ["hms-incident-log", id] });
      toast({ title: closeOpen === "rejected" ? "Avvist" : "Lukket" });
    },
    onError: (e: any) => toast({ title: "Kunne ikke lukke", description: e.message, variant: "destructive" }),
  });

  if (incidentQuery.isLoading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Laster…</div>;
  }
  if (!i) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="text-sm text-muted-foreground">Avviket finnes ikke eller du har ikke tilgang.</div>
        <Button asChild variant="outline"><Link to="/hms/incidents">Tilbake til oversikten</Link></Button>
      </div>
    );
  }

  const attachments = Array.isArray(i.attachments) ? i.attachments : [];
  const isReporter = i.reported_by === user?.id;
  const isAssignee = i.assigned_to === user?.id;
  const canEditStatus = canManage || isAssignee;
  const isClosed = i.status === "closed" || i.status === "rejected";

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-4 lg:px-6 py-3 max-w-5xl mx-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hms/incidents")} aria-label="Tilbake">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">HMS-avvik / RUH</div>
            <div className="text-base font-semibold flex items-center gap-1.5 truncate">
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" /> <span className="truncate">{i.title}</span>
            </div>
          </div>
          <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[i.status])}>{STATUS_LABEL[i.status] ?? i.status}</Badge>
        </div>
      </header>

      <div className="px-4 lg:px-6 py-5 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* MAIN */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]", SEV[i.severity]?.cls)}>
                  {(i.severity === "critical" || i.severity === "high") && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                  {SEV[i.severity]?.label ?? i.severity}
                </Badge>
                <span className="text-muted-foreground font-normal">{TYPE_LABEL[i.incident_type] ?? i.incident_type}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {i.description ? <p className="whitespace-pre-wrap">{i.description}</p> : <p className="text-muted-foreground italic">Ingen beskrivelse oppgitt.</p>}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                {i.location && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {i.location}</div>}
                {projectQuery.data && (
                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="h-3 w-3" />
                    <Link to={`/projects/${projectQuery.data.id}`} className="hover:underline">
                      {projectQuery.data.project_number || projectQuery.data.title}
                    </Link>
                  </div>
                )}
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(i.occurred_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
                <div>Rapportert av: <span className="text-foreground">{names[i.reported_by] ?? "—"}</span></div>
              </div>
              {i.proposed_action && (
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Foreslått tiltak fra melder</div>
                  <div className="whitespace-pre-wrap">{i.proposed_action}</div>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Vedlegg ({attachments.length})</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {attachments.map((a: any, idx: number) => (
                      <AttachmentTile key={idx} att={a} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {i.chemical_id && (
            <IncidentChemicalPanel chemicalId={i.chemical_id} issueType={i.chemical_issue_type} />
          )}


          {/* Tiltak */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><ListTodo className="h-4 w-4" /> Tiltak ({actionsQuery.data?.length ?? 0})</CardTitle>
              {canManage && !isClosed && (
                <Dialog open={actionOpen} onOpenChange={setActionOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">Nytt tiltak</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Opprett tiltak</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Tittel *</Label>
                        <Input value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} placeholder="Hva skal gjøres?" />
                      </div>
                      <div>
                        <Label className="text-xs">Beskrivelse</Label>
                        <Textarea value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} rows={3} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Ansvarlig</Label>
                          <Select value={actionAssignee} onValueChange={setActionAssignee}>
                            <SelectTrigger><SelectValue placeholder="Velg…" /></SelectTrigger>
                            <SelectContent>
                              {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Frist</Label>
                          <Input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setActionOpen(false)}>Avbryt</Button>
                      <Button onClick={() => createAction.mutate()} disabled={!actionTitle.trim() || createAction.isPending}>
                        {createAction.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Opprett
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {(actionsQuery.data ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground py-3 text-center">Ingen tiltak opprettet ennå.</div>
              )}
              {(actionsQuery.data ?? []).map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                      {a.assignee_user_id && <span>{names[a.assignee_user_id] ?? "—"}</span>}
                      {a.due_date && <span>Frist {format(new Date(a.due_date), "d. MMM", { locale: nb })}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Kommentarer */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Kommentarer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(commentsQuery.data ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground py-2 text-center">Ingen kommentarer ennå.</div>
              )}
              {(commentsQuery.data ?? []).map((c) => (
                <div key={c.id} className="text-sm rounded-md border border-border/60 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-1">
                    {names[c.author_id] ?? "Bruker"} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: nb })}
                  </div>
                  <div className="whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
              {(canManage || isReporter || isAssignee) && !isClosed && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Skriv en kommentar…" rows={2} />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}>
                      {addComment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                      Kommenter
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historikk */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Historikk</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <LogRow ts={i.created_at} text={`Meldt av ${names[i.reported_by] ?? "—"}`} />
              {(logQuery.data ?? []).map((l) => (
                <LogRow
                  key={l.id}
                  ts={l.created_at}
                  text={`Status: ${STATUS_LABEL[l.from_status] ?? l.from_status ?? "—"} → ${STATUS_LABEL[l.to_status] ?? l.to_status}${l.changed_by ? ` av ${names[l.changed_by] ?? "—"}` : ""}${l.reason ? ` — ${l.reason}` : ""}`}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* SIDE: Behandling */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Behandling</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!canEditStatus && (
                <div className="text-xs text-muted-foreground italic">Du kan se avviket, men har ikke tilgang til å behandle det.</div>
              )}
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={i.status}
                  disabled={!canEditStatus || isClosed}
                  onValueChange={(v) => updateIncident.mutate({ status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Ny</SelectItem>
                    <SelectItem value="in_progress">Under behandling</SelectItem>
                    <SelectItem value="action_pending">Tiltak opprettet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canManage && (
                <>
                  <div>
                    <Label className="text-xs">Alvorlighet</Label>
                    <Select value={i.severity} disabled={isClosed} onValueChange={(v) => updateIncident.mutate({ severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SEV).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Ansvarlig</Label>
                    <Select value={i.assigned_to ?? "__none"} disabled={isClosed} onValueChange={(v) => updateIncident.mutate({ assigned_to: v === "__none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Ingen</SelectItem>
                        {(usersQuery.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Frist</Label>
                    <Input
                      type="date"
                      defaultValue={i.due_date ?? ""}
                      disabled={isClosed}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (i.due_date ?? null)) updateIncident.mutate({ due_date: v });
                      }}
                    />
                  </div>
                </>
              )}
              {canEditStatus && !isClosed && (
                <div className="pt-2 border-t border-border/40 flex flex-col gap-2">
                  <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setCloseOpen("closed")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Lukk avvik
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => setCloseOpen("rejected")}>
                      <XCircle className="h-4 w-4 mr-1" /> Avvis / duplikat
                    </Button>
                  )}
                </div>
              )}
              {isClosed && i.closure_notes && (
                <div className="pt-2 border-t border-border/40 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Begrunnelse</div>
                  <div className="whitespace-pre-wrap">{i.closure_notes}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!closeOpen} onOpenChange={(o) => !o && setCloseOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{closeOpen === "rejected" ? "Avvis avvik" : "Lukk avvik"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Begrunnelse {closeOpen === "rejected" ? "*" : "(anbefalt)"}</Label>
            <Textarea value={closeReason} onChange={(e) => setCloseReason(e.target.value)} rows={3} placeholder={closeOpen === "rejected" ? "Hvorfor avvises dette? (f.eks. duplikat av…)" : "Kort oppsummering av lukking"} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseOpen(null)}>Avbryt</Button>
            <Button onClick={() => closeMut.mutate()} disabled={closeMut.isPending || (closeOpen === "rejected" && !closeReason.trim())}>
              {closeMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Bekreft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LogRow({ ts, text }: { ts: string; text: string }) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
      <div className="flex-1">{text}</div>
      <div className="text-[10px] whitespace-nowrap">{formatDistanceToNow(new Date(ts), { addSuffix: true, locale: nb })}</div>
    </div>
  );
}

function AttachmentTile({ att }: { att: { name?: string; path: string; type?: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImg = (att.type ?? "").startsWith("image/");
  const open = async () => {
    const sb = supabase as any;
    const { data } = await sb.storage.from("hms-attachments").createSignedUrl(att.path, 3600);
    if (data?.signedUrl) {
      setUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank");
    }
  };
  return (
    <button onClick={open} className="rounded-md border border-border/60 p-2 text-left hover:border-primary/40 transition flex items-center gap-2 text-xs">
      <Paperclip className="h-3 w-3 shrink-0" />
      <span className="truncate">{att.name ?? att.path.split("/").pop()}</span>
    </button>
  );
}
