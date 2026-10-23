import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mail, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExternalHubHeader } from "@/components/planning/ExternalHubHeader";
import { clearExternalStorage, EXTERNAL_PORTAL_KEY, externalLandingPath, type ExternalPortalView } from "@/lib/planning-external-portal";
import { PLANNING_STATUS_LABELS, type PlanningStatus } from "@/lib/planning";

export default function PlanningExternalHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => sessionStorage.getItem(EXTERNAL_PORTAL_KEY) || "");
  const [access, setAccess] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("access") || "";
    if (value) window.history.replaceState(null, "", window.location.pathname);
    return value;
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["planning-external-portal", token], enabled: !!token && !access, retry: false, refetchInterval: 15000,
    queryFn: async () => { const { data, error } = await supabase.rpc("planning_external_my_projects", { _token: token }); if (error) throw error; return data as unknown as ExternalPortalView; },
  });
  const accept = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { data, error } = await supabase.rpc("planning_external_accept_login", { _token: access });
      if (error) throw error;
      const result = data as { portal_token: string };
      clearExternalStorage(); sessionStorage.setItem(EXTERNAL_PORTAL_KEY, result.portal_token);
      setToken(result.portal_token); setAccess("");
      const { data: projects, error: projectsError } = await supabase.rpc("planning_external_my_projects", { _token: result.portal_token });
      if (projectsError) throw projectsError;
      navigate(externalLandingPath((projects as unknown as ExternalPortalView).projects), { replace: true });
    } catch { setAccess(""); setError("Denne lenken kan ikke brukes lenger. Be om en ny nedenfor."); }
    finally { setBusy(false); }
  };
  const request = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.functions.invoke("planning-external-login", { body: { email } });
      if (error) throw error;
      setSent(true);
    } catch { setError("Kunne ikke be om en lenke nå. Prøv igjen senere."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    const { error } = await supabase.rpc("planning_external_portal_logout", { _token: token });
    if (error) { setError("Kunne ikke avslutte innloggingen. Prøv igjen."); return; }
    clearExternalStorage(); setToken(""); queryClient.removeQueries({ predicate: q => String(q.queryKey[0]).startsWith("planning-external") || q.queryKey[0] === "planning-channel" });
  };
  return <main className="min-h-dvh bg-background text-foreground"><ExternalHubHeader onLogout={token ? logout : undefined} />
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {access ? <section className="max-w-md space-y-5"><p className="text-sm text-muted-foreground">Velkommen</p><h1 className="text-2xl font-semibold">Dine prosjekter i MCS Hub</h1><Button className="min-h-11 w-full sm:w-auto" onClick={accept} disabled={busy}><ArrowRight />{busy ? "Åpner…" : "Åpne mine prosjekter"}</Button></section>
      : token && query.data ? <><header className="space-y-2"><p className="break-words text-sm text-muted-foreground">{query.data.person.name} · {query.data.person.email}</p><h1 className="text-2xl font-semibold">Mine prosjekter</h1></header>
        {query.data.projects.length === 0 && <section className="space-y-2 border-t border-border py-6"><FolderOpen className="h-6 w-6 text-muted-foreground" /><h2 className="font-semibold">Ingen aktive prosjekter</h2><p className="text-sm text-muted-foreground">Kontakt prosjektansvarlig i MCS hvis du venter på tilgang.</p></section>}
        <div className="divide-y divide-border border-y border-border">{query.data.projects.map(project => project.access_mode === "none" ? <div key={project.id} className="flex min-h-24 items-center gap-4 py-5 text-muted-foreground"><div className="min-w-0 space-y-2"><h2 className="break-words text-lg font-semibold">{project.project_number && <span>{project.project_number} · </span>}{project.name}</h2><p className="text-sm">Tilgangen er avsluttet</p></div></div> : <Link key={project.id} to={`/planlegging/ekstern/${project.id}`} className="flex min-h-24 items-center justify-between gap-4 py-5 focus-visible:outline-primary"><div className="min-w-0 space-y-2"><h2 className="break-words text-lg font-semibold">{project.project_number && <span>{project.project_number} · </span>}{project.name}</h2><p className="text-sm text-muted-foreground">{project.participant_type === "customer" ? "Kunde" : "Leverandør / samarbeidspartner"}</p><Badge variant="secondary">{project.access_mode === "read" ? "Fullført – kun lesing" : PLANNING_STATUS_LABELS[project.status as PlanningStatus] || project.status}</Badge></div><ArrowRight className="h-5 w-5 shrink-0 text-primary" /></Link>)}</div></>
      : token && query.isLoading ? <p role="status">Henter dine prosjekter…</p>
      : <section className="max-w-md space-y-5"><header className="space-y-2"><p className="text-sm text-muted-foreground">For kunder og samarbeidspartnere</p><h1 className="text-2xl font-semibold">Mine prosjekter</h1><p className="text-sm text-muted-foreground">{query.isError ? "Innloggingen er utløpt. Be om en ny lenke." : "Få en personlig tilgangslenke på e-post."}</p></header>
        {sent ? <div role="status" className="space-y-3 border-l-2 border-primary pl-4"><h2 className="font-semibold">Sjekk e-posten din</h2><p className="break-words text-sm">Hvis {email} har aktiv prosjekttilgang, sender vi en lenke. Se også i søppelpost.</p><Button variant="ghost" className="min-h-11" onClick={() => setSent(false)}>Bruk en annen e-post</Button></div>
        : <form onSubmit={request} className="space-y-4"><div className="space-y-2"><Label htmlFor="external-login-email">E-postadressen du ble invitert på</Label><Input id="external-login-email" type="email" autoComplete="email" required maxLength={254} className="min-h-11" value={email} onChange={e => setEmail(e.target.value)} /></div><Button type="submit" className="min-h-11 w-full" disabled={busy}><Mail className="h-4 w-4" />{busy ? "Sender…" : "Send meg en tilgangslenke"}</Button></form>}
      </section>}
    </div></main>;
}