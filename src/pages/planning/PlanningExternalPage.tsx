import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { ExternalHubHeader } from "@/components/planning/ExternalHubHeader";
import { clearExternalStorage, EXTERNAL_PORTAL_KEY, externalProjectKey, upgradeExternalSession } from "@/lib/planning-external-portal";
import { PlanningChannelConversation } from "@/components/planning/PlanningChannelConversation";
import { CHANNEL_LABELS, type ExternalProjectView, type PlanningChannel } from "@/lib/planning-external";
import { PLANNING_STATUS_LABELS, formatPeriod, taskStatusLabel, wpStatusLabel, type PlanningStatus } from "@/lib/planning";
import { toast } from "sonner";

export default function PlanningExternalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
    if (value) window.history.replaceState(null, "", window.location.pathname);
    return value;
  });
  const [token, setToken] = useState("");
  const [opening, setOpening] = useState(true);
  const [openError, setOpenError] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    let current = true;
    setToken(""); setOpening(true); setOpenError(false); setTab("overview");
    const open = async () => {
      if (!id || invite) { if (current) setOpening(false); return; }
      try {
        let portal = sessionStorage.getItem(EXTERNAL_PORTAL_KEY);
        const legacy = sessionStorage.getItem(externalProjectKey(id));
        if (!portal && legacy) portal = await upgradeExternalSession(legacy);
        if (!portal) { if (current) setOpening(false); return; }
        const { data, error } = await supabase.rpc("planning_external_open_project", { _token: portal, _project_id: id });
        if (error) throw error;
        if (current) setToken((data as { session_token: string }).session_token);
      } catch { if (current) setOpenError(true); }
      finally { if (current) setOpening(false); }
    };
    void open();
    return () => { current = false; };
  }, [id, invite]);
  const query = useQuery({
    queryKey: ["planning-external-project", id, token], enabled: !!id && !!token,
    retry: false, refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("planning_external_project", { _token: token, _project_id: id || "" });
      if (error) throw error;
      return data as unknown as ExternalProjectView;
    },
  });
  const accept = async () => {
    if (accepting || !invite) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.rpc("planning_accept_external", { _invite_token: invite });
      if (error) throw error;
      const result = data as { session_token: string; project_id: string };
      sessionStorage.setItem(externalProjectKey(result.project_id), result.session_token);
      await upgradeExternalSession(result.session_token);
      setInvite("");
      navigate(`/planlegging/ekstern/${result.project_id}`, { replace: true });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Invitasjonen kunne ikke åpnes"); }
    finally { setAccepting(false); }
  };
  const logout = async () => {
    const portal = sessionStorage.getItem(EXTERNAL_PORTAL_KEY);
    const { error } = portal ? await supabase.rpc("planning_external_portal_logout", { _token: portal }) : await supabase.rpc("planning_external_logout", { _token: token });
    if (error) { toast.error("Kunne ikke logge ut. Prøv igjen."); return; }
    clearExternalStorage();
    setToken(""); queryClient.removeQueries({ queryKey: ["planning-external-project"] });
    queryClient.removeQueries({ queryKey: ["planning-channel"] });
    queryClient.removeQueries({ queryKey: ["planning-external-portal"] });
    navigate("/ekstern", { replace: true });
  };
  const openFile = async (fileId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("planning-external-file", { body: { token, file_id: fileId } });
      if (error || !data?.url) throw error || new Error(data?.error || "Ingen tilgang til filen");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kunne ikke åpne filen"); }
  };
  const complete = async (taskId: string) => {
    const { error } = await supabase.rpc("planning_external_complete_task", { _token: token, _task_id: taskId });
    if (error) toast.error(error.message); else await query.refetch();
  };
  const view = query.data;
  return <main className="min-h-dvh bg-background text-foreground">
    <ExternalHubHeader onLogout={token ? logout : undefined} />
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <Button asChild variant="ghost" className="min-h-11"><Link to="/ekstern"><ArrowLeft className="h-4 w-4" />Mine prosjekter</Link></Button>
      {opening && <p role="status">Åpner prosjekt…</p>}
      {openError && <section className="space-y-3"><h1 className="text-xl font-semibold">Tilgangen er avsluttet</h1><p className="text-sm text-muted-foreground">{CLOSED_PROJECT_TEXT} Gå til Mine prosjekter for å se dine aktive prosjekter.</p><Button asChild className="min-h-11"><Link to="/ekstern">Gå til Mine prosjekter</Link></Button></section>}
      {!token && !opening && !openError && <section className="space-y-4"><h1 className="text-2xl font-semibold">Invitasjon til prosjektrom</h1><p className="text-sm text-muted-foreground">Tilgangen gjelder bare prosjektet du er invitert til og innhold MCS deler med deg.</p>{invite ? <Button className="min-h-11" onClick={accept} disabled={accepting}><ArrowRight />{accepting ? "Åpner…" : "Godta invitasjon og åpne prosjekt"}</Button> : <Button asChild className="min-h-11"><Link to="/ekstern"><ArrowRight />Logg inn på Mine prosjekter</Link></Button>}</section>}
      {token && query.isLoading && <p>Åpner prosjekt…</p>}
      {token && query.isError && <section className="space-y-3"><h1 className="text-xl font-semibold">Tilgangen er avsluttet</h1><p>{CLOSED_PROJECT_TEXT} Kontakt den som inviterte deg hvis du trenger mer.</p><Button variant="outline" className="min-h-11" onClick={logout}>Avslutt</Button></section>}
      {token && view && !query.isError && <>
        <header className="space-y-2"><p className="text-sm text-muted-foreground">{view.participant.name} · {CHANNEL_LABELS[view.participant.participant_type]} · Kun dette prosjektet</p><h1 className="break-words text-2xl font-semibold">{view.project.name}</h1><p className="text-sm">{PLANNING_STATUS_LABELS[view.project.status as PlanningStatus] || view.project.status} · {formatPeriod(view.project.expected_start, view.project.expected_end, null)}</p></header>
        {view.access_mode === "read" && <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm">Prosjektet er fullført – kun lesing{view.read_only_until ? ` til ${new Date(view.read_only_until).toLocaleDateString("nb-NO")}` : ""}. Du kan lese meldinger og åpne delte filer.</p>}
        <Tabs value={tab} onValueChange={setTab}><TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">{[["overview","Oversikt"],["tasks","Oppgaver"],["files","Filer"],["conversations","Samtaler"]].map(([value,label]) => <TabsTrigger key={value} className="min-h-11" value={value}>{label}</TabsTrigger>)}</TabsList></Tabs>
        {tab === "overview" && <section className="space-y-4"><h2 className="text-lg font-semibold">Delte arbeidspakker</h2>{view.work_packages.length === 0 && <p className="text-sm text-muted-foreground">Ingen arbeidspakker er delt med deg ennå.</p>}{view.work_packages.map(w => <article key={w.id} className="space-y-2 rounded-md border border-border p-4"><h3 className="font-semibold">{w.name}</h3><p className="text-sm">{wpStatusLabel(w.status)} · {formatPeriod(w.planned_start,w.planned_end,null)}</p>{w.description && <p className="whitespace-pre-wrap break-words text-sm">{w.description}</p>}</article>)}</section>}
        {tab === "tasks" && <section className="space-y-4"><h2 className="text-lg font-semibold">Delte oppgaver</h2>{view.tasks.length === 0 && <p className="text-sm text-muted-foreground">Ingen oppgaver er delt med deg ennå.</p>}{view.tasks.map(t => <article key={t.id} className="space-y-2 rounded-md border border-border p-4"><h3 className="font-semibold">{t.title}</h3><p className="text-sm">{taskStatusLabel(t.status)}{t.due_date ? ` · Frist ${t.due_date}` : ""}{t.assigned_to_me ? " · Tildelt deg" : ""}</p>{t.description && <p className="whitespace-pre-wrap break-words text-sm">{t.description}</p>}{t.assigned_to_me && t.status !== "done" && externalCanWrite(view.access_mode) && <Button className="min-h-11" onClick={() => complete(t.id)}><Check />Marker utført</Button>}</article>)}</section>}
        {tab === "files" && <section className="space-y-3"><h2 className="text-lg font-semibold">Delte filer</h2>{view.files.length === 0 && <p className="text-sm text-muted-foreground">Ingen filer er delt med deg ennå.</p>}{view.files.map(f => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3"><div className="min-w-0 break-words"><strong>{f.display_name}</strong><p className="text-sm text-muted-foreground">{f.category}</p></div><Button variant="outline" className="min-h-11" onClick={() => openFile(f.id)}><FileDown />Åpne fil</Button></div>)}</section>}
        {tab === "conversations" && <ExternalConversations projectId={view.project.id} token={token} channels={view.channels} participantId={view.participant.id} readOnly={!externalCanWrite(view.access_mode)} />}
      </>}
    </div>
  </main>;
}
function ExternalConversations({ projectId, token, channels, participantId, readOnly }: { projectId: string; token: string; channels: PlanningChannel[]; participantId: string; readOnly: boolean }) {
  const [channel, setChannel] = useState<PlanningChannel>(channels[0] || "all");
  return <div className="space-y-4"><Tabs value={channel} onValueChange={v => setChannel(v as PlanningChannel)}><TabsList className="grid h-auto w-full grid-cols-2">{channels.map(c => <TabsTrigger key={c} className="min-h-11" value={c}>{CHANNEL_LABELS[c]}</TabsTrigger>)}</TabsList></Tabs><PlanningChannelConversation key={channel} projectId={projectId} channel={channel} token={token} participantId={participantId} readOnly={readOnly} /></div>;
}