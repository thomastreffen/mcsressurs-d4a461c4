import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { deliverDleBlob } from '@/lib/dle/export';
import { buildCombinedPdf, type CombinedPdfInput, type CombinedPdfResult } from '@/lib/documentation/combined-pdf';

export function CombinedPdfPreview({input}:{input:CombinedPdfInput}) {
  const snapshot=JSON.stringify(input);
  const [prepared,setPrepared]=useState<{snapshot:string;result:CombinedPdfResult;url:string}|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>()=>{if(prepared)URL.revokeObjectURL(prepared.url);},[prepared]);
  const current=prepared?.snapshot===snapshot?prepared:null;
  async function preview() {
    setBusy(true);
    try {const result=await buildCombinedPdf(input);setPrepared({snapshot,result,url:URL.createObjectURL(result.blob)});}
    catch(e){toast.error(e instanceof Error?e.message:'Kunne ikke klargjøre svarpakken');}
    finally{setBusy(false);}
  }
  return <section className="space-y-4 border-t pt-5">
    <h2 className="text-lg font-semibold">Samlet svarpakke</h2>
    <ol className="space-y-1 text-sm"><li>Forside · {input.company} · Sak {input.caseNumber || input.title}</li><li>Innholdsfortegnelse</li>{[...input.findings].sort((a,b)=>a.finding_number-b.finding_number).map(f=><li key={f.id}>Funn {f.finding_number} · {f.title}</li>)}<li>Dokumentasjonsoversikt</li></ol>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || (!input.findings.length && !input.documents.length)} onClick={()=>void preview()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}Forhåndsvis samlet PDF</Button><Button disabled={!current || busy} onClick={()=>{if(current)void deliverDleBlob(current.result.blob,current.result.name);}}><Download className="mr-2 h-4 w-4"/>Last ned svarpakke</Button></div>
    {current && <><p className="break-words text-sm font-medium">{current.result.name} · {current.result.pageCount} sider · application/pdf</p>{current.result.warnings.map(w=><p key={w} className="text-sm text-destructive">{w}</p>)}<ol className="space-y-1 text-sm">{current.result.chapters.map((c,i)=><li key={`${i}-${c.page}`}>{c.title} · side {c.page}</li>)}</ol><div className="space-y-2 text-sm">{current.result.documents.map((d,i)=><p key={i}>{d.title} · {d.supports} · {d.included?`${d.pages} sider innfelt`:'Kun referanse'}</p>)}</div><object data={current.url} type="application/pdf" aria-label="Samlet svarpakke PDF" className="h-[720px] w-full border"><a href={current.url} target="_blank" rel="noreferrer">Åpne samlet PDF</a></object></>}
  </section>;
}