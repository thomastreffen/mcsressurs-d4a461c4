import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Mail, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useCompanyModuleAccess } from '@/hooks/useCompanyModuleAccess';
import { useAuth } from '@/hooks/useAuth';
import type { CompanyModule } from '@/lib/company-module-access';
import { generateLocalExport, selectExportRows, exportCell, type ExportRow, type LocalExportFormat, type ExportChartNode, type LocalExportSnapshot } from '@/lib/local-export';
import { saveDocumentationExport, sendDocumentationExport, markDocumentationDownloaded } from '@/lib/documentation/delivery';
import { deliverDleBlob } from '@/lib/dle/export';
import { parseDleRecipients } from '@/lib/dle/delivery';
import { toast } from 'sonner';

interface Props {
  title: string; module: CompanyModule; rows: ExportRow[]; columns?: string[];
  filters?: Record<string, string>; version?: string; chart?: ExportChartNode[]; disabled?: boolean;
}
export function LocalExportMenu({ title, module, rows, columns, filters = {}, version, chart, disabled }: Props) {
  const company = useCompanyContext(); const { user } = useAuth(); const access = useCompanyModuleAccess();
  const [draft, setDraft] = useState<{ snapshot: LocalExportSnapshot; companyId: string; userId: string; page: string } | null>(null);
  const [format, setFormat] = useState<LocalExportFormat>('pdf'); const [action, setAction] = useState<'download'|'send'>('download');
  const [selected, setSelected] = useState<number[]>([]); const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [to, setTo] = useState(''); const [cc, setCc] = useState(''); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [prepared, setPrepared] = useState<{ id:string; name:string; blob:Blob } | null>(null);
  const allowed = !!company.activeCompanyId && access.can(module);
  const sameContext = draft?.companyId === company.activeCompanyId && draft?.userId === user?.id;
  const open = (nextFormat: LocalExportFormat, nextAction: 'download'|'send') => {
    if (!company.activeCompanyId || !user || !allowed) return;
    const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    setDraft({ snapshot: { title, company: company.activeCompany?.name ?? '', actor:user.name, date:new Date(), rows: rows.map((r) => ({...r})), columns:cols, filters:{...filters}, version, chart:chart?.map((n)=>({...n})) }, companyId:company.activeCompanyId, userId:user.id, page:window.location.pathname });
    setFormat(nextFormat); setAction(nextAction); setSelected(rows.map((_,i)=>i)); setSelectedColumns(cols); setSubject(title); setPrepared(null);
  };
  const invalidate = () => setPrepared(null);
  const prepare = async () => {
    if (!draft || !sameContext || !allowed || !selected.length || !selectedColumns.length) return;
    setBusy(true);
    try {
      if (action === 'send' && !parseDleRecipients(to).length) throw new Error('Legg inn minst én mottaker.');
      parseDleRecipients(cc);
      const snapshot = {...draft.snapshot, rows:selectExportRows(draft.snapshot.rows, selected, selectedColumns), columns:selectedColumns, chart: selected.length === draft.snapshot.rows.length && selectedColumns.length === draft.snapshot.columns.length ? draft.snapshot.chart : undefined};
      const output = await generateLocalExport(snapshot, format);
      const saved = await saveDocumentationExport({companyId:draft.companyId,userId:draft.userId,actor:snapshot.actor,company:snapshot.company,purpose:snapshot.title,files:[],outputs:[output],format,action,subject,message,to:action==='send'?to:'',cc:action==='send'?cc:'',filters:{...snapshot.filters,columns:selectedColumns},sourceModule:module,sourcePage:draft.page,recordCount:snapshot.rows.length});
      setPrepared({id:saved.id,...output});
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Kunne ikke klargjøre eksporten.'); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!prepared || !sameContext || !allowed) return;
    void deliverDleBlob(prepared.blob,prepared.name).catch(()=>toast.error('Nedlastingen kunne ikke startes.'));
    void markDocumentationDownloaded(prepared.id).catch(()=>toast.error('Filen er lastet ned, men historikken kunne ikke oppdateres.'));
  };
  const send = async () => {
    if (!prepared || !sameContext || !allowed) return;
    setBusy(true);
    try { await sendDocumentationExport(prepared.id); toast.success('Microsoft har akseptert e-posten.'); setDraft(null); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'Sendingen feilet.'); }
    finally { setBusy(false); }
  };
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={disabled || !allowed || !rows.length}><Share2 className="mr-1.5 h-4 w-4"/>Eksporter / Del</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={()=>open('pdf','download')}><FileText className="mr-2 h-4 w-4"/>Last ned PDF</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>open('xlsx','download')}><FileSpreadsheet className="mr-2 h-4 w-4"/>Eksporter Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>open('csv','download')}><Download className="mr-2 h-4 w-4"/>Eksporter CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>open('pdf','send')}><Mail className="mr-2 h-4 w-4"/>Send på e-post</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Sheet open={!!draft} onOpenChange={(v)=>{if(!v&&!busy)setDraft(null);}}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>{action==='send'?'Send eksport på e-post':'Eksporter visningen'}</SheetTitle><SheetDescription>{draft?.snapshot.company} · {draft?.snapshot.title}</SheetDescription></SheetHeader>
      {draft && <div className="space-y-5 py-5">
        {!sameContext && <p role="alert" className="text-sm text-destructive">Firmaet er endret. Lukk og åpne eksporten fra den nye visningen.</p>}
        <div className="text-xs text-muted-foreground">{Object.entries(draft.snapshot.filters).map(([k,v])=>`${k}: ${v}`).join(' · ') || 'Hele den aktive visningen'}</div>
        <div className="space-y-2"><Label>Format</Label><Select value={format} disabled={busy} onValueChange={(v)=>{setFormat(v as LocalExportFormat);invalidate();}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['pdf','xlsx','csv','zip'].map((f)=><SelectItem key={f} value={f}>{f==='xlsx'?'Excel (.xlsx)':f==='zip'?'ZIP (PDF + Excel + CSV)':f.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Kolonner</Label><div className="flex flex-wrap gap-x-4 gap-y-2">{draft.snapshot.columns.map((c)=><label key={c} className="flex items-center gap-2 text-xs"><Checkbox disabled={busy} checked={selectedColumns.includes(c)} onCheckedChange={(on)=>{setSelectedColumns(on?[...selectedColumns,c]:selectedColumns.filter((x)=>x!==c));invalidate();}}/>{c}</label>)}</div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label>Dette blir eksportert · {selected.length} poster</Label><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{setSelected(selected.length===draft.snapshot.rows.length?[]:draft.snapshot.rows.map((_,i)=>i));invalidate();}}>{selected.length===draft.snapshot.rows.length?'Fjern alle':'Velg alle'}</Button></div>
          <div className="max-h-56 overflow-auto divide-y rounded-md border">{draft.snapshot.rows.map((r,i)=><label key={i} className="flex items-start gap-2 p-2 text-xs"><Checkbox className="mt-0.5" disabled={busy} checked={selected.includes(i)} onCheckedChange={(on)=>{setSelected(on?[...selected,i]:selected.filter((x)=>x!==i));invalidate();}}/><span className="min-w-0 break-words">{draft.snapshot.columns.slice(0,3).map((c)=>exportCell(r[c])).filter(Boolean).join(' · ')}</span></label>)}</div>
        </div>
        {action==='send' && <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="local-export-to">Til</Label><Input id="local-export-to" value={to} placeholder="navn@firma.no; mottaker@firma.no" disabled={busy} onChange={(e)=>{setTo(e.target.value);invalidate();}}/></div>
          <div className="space-y-1"><Label htmlFor="local-export-cc">Kopi</Label><Input id="local-export-cc" value={cc} disabled={busy} onChange={(e)=>{setCc(e.target.value);invalidate();}}/></div>
          <div className="space-y-1"><Label htmlFor="local-export-subject">Emne</Label><Input id="local-export-subject" value={subject} disabled={busy} onChange={(e)=>{setSubject(e.target.value);invalidate();}}/></div>
          <div className="space-y-1"><Label htmlFor="local-export-message">Melding</Label><Textarea id="local-export-message" value={message} disabled={busy} onChange={(e)=>{setMessage(e.target.value);invalidate();}}/></div>
        </div>}
        {prepared && <div className="space-y-2 border-t pt-3"><p className="break-all text-sm font-medium">{prepared.name}</p><p className="text-xs text-muted-foreground">{(prepared.blob.size/1024).toFixed(1)} kB{action==='send'?` · Til: ${to}${cc?` · Kopi: ${cc}`:''}`:''}</p></div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setDraft(null)}>Lukk</Button>{prepared?<Button disabled={busy||!sameContext||!allowed} onClick={action==='send'?send:download}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:action==='send'?<Mail className="mr-2 h-4 w-4"/>:<Download className="mr-2 h-4 w-4"/>}{action==='send'?'Send e-post':'Last ned'}</Button>:<Button disabled={busy||!sameContext||!allowed||!selected.length||!selectedColumns.length} onClick={prepare}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Klargjør fil</Button>}</div>
      </div>}
    </SheetContent></Sheet>
  </>;
}