import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Paperclip, Loader2 } from "lucide-react";
import type { OperationalJobBrief } from "../../supabase/functions/_shared/job-brief";
import { formatJobSchedule } from "../../supabase/functions/_shared/job-time";
type Info = { brief: OperationalJobBrief; status: string; start: string; end: string; files: { key: string; name: string; available: boolean }[] };
export default function JobInformationPage() {
  const { id } = useParams();
  const { session, loading } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (loading || !session || !id) return;
    setInfo(null); setError("");
    void invokeWithSession<Info>("job-access", { body: { action: "read", event_id: id } }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setError("Jobben er fjernet eller du har ikke tilgang. Kontakt planlegger hvis dette er feil.");
      else setInfo(data);
    });
    return () => { active = false; };
  }, [id, loading, session?.user.id]);
  const openFile = async (key: string) => {
    // Open synchronously so Safari does not block a new tab after the network call.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpening(key); setError("");
    try {
      const { data, error } = await invokeWithSession<{ url: string }>("job-access", { body: { action: "file", event_id: id, file_key: key } });
      if (error || !data?.url) { tab?.close(); setError("Vedlegget kunne ikke åpnes. Prøv igjen eller kontakt planlegger."); }
      else if (tab) tab.location.href = data.url;
      else window.location.assign(data.url);
    } finally { setOpening(null); }
  };
  const login = `/login?next=${encodeURIComponent(`/job-info/${id}`)}`;
  if (loading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (!session) return <main className="mx-auto max-w-xl px-5 py-12 space-y-5"><h1 className="text-2xl font-semibold">Jobbinfo og vedlegg</h1><p>Logg inn med jobbkontoen din. Jobbinfo er tilgjengelig også etter godkjenning.</p><Button asChild><Link to={login}>Logg inn på MCS Hub</Link></Button></main>;
  const b = info?.brief;
  const when = info ? formatJobSchedule(info.start, info.end) : null;
  return <main className="mx-auto max-w-3xl px-5 py-6 pb-16 space-y-6">
    <Button variant="ghost" asChild><Link to="/my-day"><ArrowLeft className="mr-2 h-4 w-4" />Min dag</Link></Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!info && !error && <Loader2 className="animate-spin" />}
    {b && <><header className="space-y-2"><p className="text-sm text-muted-foreground">MCS Hub · {b.jobNumber}</p><h1 className="text-2xl font-semibold break-words">{b.title}</h1>{info.status === "cancelled" && <p className="text-destructive font-semibold">Oppdraget er avlyst</p>}<p>{when?.startDate} · {when?.startTime}–{when?.endTime}</p></header>
    <dl className="grid gap-4 sm:grid-cols-2">{[["Oppdragssted", b.siteName], ["Adresse", b.address], ["Kunde", b.customer], ["Kontaktperson", b.contactName], ["Telefon", b.contactPhone], ["E-post", b.contactEmail]].filter(([,v]) => v).map(([label,v]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words">{v}</dd></div>)}</dl>
    {[ ["Arbeidsbeskrivelse", b.workDescription], ["Praktisk info / adgang", b.practicalInfo], ["Materiell", b.materialResponsibility], ["MCS Service skaffer", b.serviceMustProcure] ].filter(([,v]) => v).map(([label,v]) => <section key={label}><h2 className="font-semibold mb-2">{label}</h2><p className="whitespace-pre-wrap break-words">{v}</p></section>)}
    <section className="border-t border-border pt-5 space-y-3"><h2 className="font-semibold">Vedlegg</h2>{!info.files.length && <p className="text-sm text-muted-foreground">Ingen vedlegg registrert på oppdraget.</p>}{info.files.map(f => <div key={f.key}><Button variant="outline" className="min-h-11 h-auto w-full justify-start whitespace-normal text-left py-3" disabled={!f.available || !!opening} onClick={() => openFile(f.key)}><Paperclip className="h-4 w-4 mr-2 shrink-0" /><span className="break-words min-w-0">{f.name}</span>{opening === f.key && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}</Button>{!f.available && <p className="text-sm text-muted-foreground">Kilden må fornyes av planlegger.</p>}</div>)}</section>
    <Button variant="outline" asChild><Link to={`/projects/${id}`}>Åpne hele oppdraget</Link></Button></>}
  </main>;
}