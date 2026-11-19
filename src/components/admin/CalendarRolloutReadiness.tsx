import { useState } from "react";
import { Button } from "@/components/ui/button";
import { invokeWithSession } from "@/lib/invoke-session";
type Selection = { event_id: string; technician_id: string; work_date: string };
/** Selection comes from the existing live-assignment picker. Never enables, saves a target or releases intent. */
export function CalendarRolloutReadiness({ selection, eligible }: { selection: Selection; eligible: boolean }) {
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Record<string,any>|null>(null);
  const [error,setError]=useState("");
  const read=async()=>{
    setBusy(true);setError("");setResult(null);
    try{const r=await invokeWithSession<Record<string,any>>("job-outlook-app-pilot",{body:{action:"rollout_preflight",...selection}});
      if(r.error){const ctx=(r.error as any).context;const detail=await ctx?.json?.().catch(()=>null);throw Error(detail?.error??"calendar_read_failed");}
      setResult(r.data??null);
    }catch(e){setError(`Lesekontrollen stoppet: ${e instanceof Error?e.message:"ukjent feil"}. Ingen avtale eller innstilling er endret.`);}
    finally{setBusy(false);}
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Vanlig kalenderutrulling">
    <h3 className="font-semibold">Vanlig Ressursplan → Outlook · valgt montør og dag</h3>
    <Button variant="outline" disabled={!eligible||busy} onClick={read}>Kontroller valgt arbeidsdag – kun lesing</Button>
    {error&&<p role="alert">{error}</p>}
    {result&&<div className="space-y-2 border-l-2 border-border pl-3">
      <p>{result.mailbox} · {result.work_date}</p>
      <p>{result.blocked?`Sperret: ${result.blocked}`:result.existing_central_copy?"Eksisterende sentral avtale bekreftet – ingen ny kopi":"Lesekontroll fullført"}</p>
      {result.diagnosis&&<><p>{result.diagnosis.checked_count} avtaler kontrollert · {result.diagnosis.blocking_count} treff</p><ul>{result.diagnosis.conflicts.map((c:any,i:number)=><li key={i}>{c.local_overlap??"Ukjent tid"} · {c.show_as} · {c.classification}</li>)}</ul></>}
      <p>Aktivering krever separat sluttgodkjenning. Gamle køoppføringer frigjøres aldri her.</p>
      <Button disabled>Start automatikk for valgt montør/dag – ikke aktivert</Button>
    </div>}
    <p className="text-muted-foreground">Stopp/tilbakerulling: trekk tilbake den valgte pilotdagen over. Eksisterende sentrale kopier forblir sentrale; ingen personlig fallback eller automatisk sletting.</p>
  </section>;
}