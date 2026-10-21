import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Send, FileCheck2, ChevronDown, ChevronRight, Check, Loader2, X, History } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useCompanyModuleAccess } from '@/hooks/useCompanyModuleAccess';
import { CONTENT, PRESETS, filterExportRecords, exportCategory, type ContentKey, type ExportRecord, type ExportFilters } from '@/lib/documentation/catalog';
import { loadDocumentation } from '@/lib/documentation/sources';
import { prepareOutputs, saveDocumentationExport, sendDocumentationExport, markDocumentationDownloaded, type OutputFormat } from '@/lib/documentation/delivery';
import { slugForFile } from '@/lib/response-package';
import { buildDleFiles, deliverDleBlob, type DleFile } from '@/lib/dle/export';
const sb=supabase as any;
function Selector({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{id:string;name:string}[];disabled?:boolean}) {
  return <div className="space-y-1.5"><Label>{label}</Label><Select value={value||'all'} onValueChange={v=>onChange(v==='all'?'':v)} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Alle</SelectItem>{options.map(o=><SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>;
}
export default function HmsDocumentationPage() {
  const {activeCompanyId}=useCompanyContext();const {user}=useAuth();
  return <DocumentationWorkspace key={`${user?.id}:${activeCompanyId}`} />;
}
function DocumentationWorkspace() {
  const {activeCompanyId,activeCompany}=useCompanyContext();const {user}=useAuth();const access=useCompanyModuleAccess();const qc=useQueryClient();
  const company=activeCompany?.name ?? 'Firma';const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Oslo'});
  const [purpose,setPurpose]=useState('DLE-tilsyn');const [enabled,setEnabled]=useState<Set<ContentKey>>(new Set());
  const [records,setRecords]=useState<Partial<Record<ContentKey,ExportRecord[]>>>({});const [omitted,setOmitted]=useState<Set<string>>(new Set());
  const [excluded,setExcluded]=useState<Set<string>>(new Set());const [expanded,setExpanded]=useState<Set<ContentKey>>(new Set());
  const [busy,setBusy]=useState(false);const [errors,setErrors]=useState<Partial<Record<ContentKey,string>>>({});
  const [filters,setFilters]=useState<ExportFilters>({from:'',to:'',project:'',person:'',status:''});
  const [action,setAction]=useState('download');const [format,setFormat]=useState<OutputFormat>('files');const [to,setTo]=useState('');const [cc,setCc]=useState('');
  const [subject,setSubject]=useState(`DLE-tilsyn – ${company}`);const [message,setMessage]=useState('');
  const [ready,setReady]=useState<{id:string;outputs:{name:string;blob:Blob}[];sent:boolean;action:string}|null>(null);
  const [details,setDetails]=useState<string|null>(null);
  const canExport=access.can('hms','edit');
  const {data:projects=[]}=useQuery({queryKey:['documentation-projects',activeCompanyId],enabled:!!activeCompanyId&&access.can('documents'),queryFn:async()=>{const {data,error}=await sb.from('events').select('id,title,project_number').eq('company_id',activeCompanyId).eq('project_type','project').is('deleted_at',null).order('title');if(error)throw error;return (data??[]).map((p:any)=>({id:p.id,name:`${p.project_number ? p.project_number+' · ':''}${p.title}`}));}});
  const {data:people=[]}=useQuery({queryKey:['documentation-people',activeCompanyId],enabled:!!activeCompanyId&&access.can('employees'),queryFn:async()=>{const {data,error}=await sb.from('employment_profiles').select('person_id,people(full_name,is_active)').eq('company_id',activeCompanyId).eq('include_in_hms_people',true).is('archived_at',null);if(error)throw error;return [...new Map<string,{id:string;name:string}>((data??[]).filter((p:any)=>p.people?.is_active!==false).map((p:any)=>[p.person_id,{id:p.person_id,name:p.people?.full_name??'Ansatt'}])).values()];}});
  const {data:accounts=[]}=useQuery({queryKey:['documentation-accounts',activeCompanyId],enabled:!!activeCompanyId&&access.can('employees'),queryFn:async()=>{const {data,error}=await sb.from('user_accounts').select('person_id,auth_user_id').eq('company_id',activeCompanyId);if(error)throw error;return data??[];}});
  const {data:history=[],isLoading:historyLoading}=useQuery({queryKey:['documentation-history',activeCompanyId],enabled:!!activeCompanyId&&canExport,queryFn:async()=>{const {data,error}=await sb.from('hms_document_exports').select('*').eq('company_id',activeCompanyId).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data??[];}});
  const personUser=accounts.find((a:any)=>a.person_id===filters.person)?.auth_user_id;
  const visibleRecords=(key:ContentKey)=>filterExportRecords(records[key]??[],{...filters,project:['sja','rounds','checklists','risks','incidents','project_docs'].includes(key)?filters.project:'',person:['competence','courses','fse_status','sja','rounds','checklists','risks','incidents'].includes(key)?filters.person:'',status:['sja','rounds','checklists','risks','incidents'].includes(key)?filters.status:''},personUser);
  const files=useMemo(()=>CONTENT.flatMap(c=>{
    if(!enabled.has(c.key))return [];
    const list=visibleRecords(c.key).filter(r=>!omitted.has(`${c.key}:${r.id}`));
    if(format==='originals') return buildDleFiles(exportCategory(c.key),list.filter(r=>r.original),true,company,date).map(f=>({...f,key:`${c.key}:${f.key}`}));
    // Use separate posts for selectable document lists; category reports remain available.
    const separate=['chapters','selected_chemicals','project_docs','sja','rounds','risks','checklists','incidents','sds'].includes(c.key);
    return buildDleFiles(exportCategory(c.key),list,separate,company,date).map(f=>{
      const name=!separate && !f.records[0]?.original ? `${slugForFile(company)}_${slugForFile(c.label)}_${date}.pdf` : f.name;
      return {...f,key:`${c.key}:${f.key}`,name,path:`${f.path.split('/')[0]}/${name}`};
    });
  }),[enabled,records,filters,accounts,omitted,format,company,date]);
  // Categories that share a source must not duplicate the same snapshot or filename.
  const uniqueFiles=files.filter((f,i,all)=>all.findIndex(x=>x.name===f.name)===i);const selected=uniqueFiles.filter(f=>!excluded.has(f.key));
  const clearReady=()=>setReady(null);
  async function selectKeys(keys:ContentKey[]) {
    if(!activeCompanyId||!canExport)return;
    setBusy(true);clearReady();setEnabled(new Set(keys));setErrors({});setExcluded(new Set());setOmitted(new Set());
    const result:Partial<Record<ContentKey,ExportRecord[]>>={};const failures:Partial<Record<ContentKey,string>>={};
    await Promise.all(keys.map(async key=>{const c=CONTENT.find(x=>x.key===key);if(!c||!access.can(c.module))return;try{result[key]=records[key]??await loadDocumentation(key,activeCompanyId);}catch(e){failures[key]=e instanceof Error?e.message:'Kunne ikke hente dokumentasjon';}}));
    setRecords(old=>({...old,...result}));setErrors(failures);setBusy(false);
  }
  function changeFilter(key:keyof ExportFilters,value:string){setFilters(old=>({...old,[key]:value}));clearReady();}
  // Prepares a fresh export for the chosen action; returns null when validation fails.
  async function prepare(act:string) {
    if(!activeCompanyId||!user||!canExport||!selected.length)return null;
    if(filters.from&&filters.to&&filters.from>filters.to){toast.error('Fra-dato må være før til-dato');return null;}
    if(selected.some(f=>f.category==='attachments')&&!filters.project){toast.error('Velg prosjekt for prosjektspesifikk dokumentasjon');return null;}
    const outputs=await prepareOutputs(selected,format,company,purpose,date);
    const saved=await saveDocumentationExport({companyId:activeCompanyId,userId:user.id,actor:user.name??user.email??'Ukjent bruker',company,purpose,files:selected,outputs,format,action:act,subject,message,to,cc,filters});
    const next={id:saved.id,outputs,sent:false,action:act};setReady(next);return next;
  }
  // Several files are bundled in one ZIP so the browser does not block multiple downloads.
  async function downloadAll(r:{id:string;outputs:{name:string;blob:Blob}[]}){
    if(r.outputs.length===1)await deliverDleBlob(r.outputs[0].blob,r.outputs[0].name);
    else{const {default:JSZip}=await import('jszip');const zip=new JSZip();for(const o of r.outputs)zip.file(o.name,o.blob);await deliverDleBlob(await zip.generateAsync({type:'blob'}),`${slugForFile(company)}_${slugForFile(purpose)}_${date}.zip`);}
    await markDocumentationDownloaded(r.id);
  }
  async function run(act:string){
    setAction(act);
    if(act!=='download'&&!to.trim()){toast.error('Fyll inn mottaker, og trykk knappen igjen');setTimeout(()=>document.getElementById('export-email')?.focus(),50);return;}
    setBusy(true);
    try{
      const r=ready&&ready.action===act&&!ready.sent?ready:await prepare(act);if(!r)return;
      if(act!=='email')await downloadAll(r);
      if(act!=='download'){await sendDocumentationExport(r.id);setReady({...r,sent:true});toast.success('Microsoft har akseptert e-posten');}
      await qc.invalidateQueries({queryKey:['documentation-history',activeCompanyId]});
    }catch(e){toast.error(e instanceof Error?e.message:'Eksporten feilet');}finally{setBusy(false);}
  }
  async function historyDownload(file:any){try{const {data,error}=await supabase.storage.from(file.storage_bucket).createSignedUrl(file.file_path,60);if(error||!data)throw error??new Error('Ingen tilgang');const response=await fetch(data.signedUrl);if(!response.ok)throw new Error('Kunne ikke hente filen');await deliverDleBlob(await response.blob(),file.export_name);}catch(e){toast.error(e instanceof Error?e.message:'Kunne ikke laste ned');}}
  const statuses=[...new Set(Object.values(records).flatMap(list=>(list??[]).map(r=>r.status).filter((s):s is string=>!!s)))];
  const statusNames:Record<string,string>={draft:'Utkast',submitted:'Innsendt',approved:'Godkjent',rejected:'Avvist',open:'Åpen',closed:'Lukket',in_progress:'Under arbeid',reviewed:'Kontrollert'};
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <HmsMobileBack />
    <header className="space-y-2"><p className="text-xs font-medium uppercase text-muted-foreground">HMS & HR · {company}</p><h1 className="flex items-center gap-3 text-2xl font-semibold"><FileCheck2 className="h-7 w-7 text-primary"/>Dokumentasjon / Eksport</h1><p className="text-sm text-muted-foreground">DLE, revisjon og tilsyn</p></header>
    <Tabs defaultValue="export"><TabsList><TabsTrigger value="export">Ny eksport</TabsTrigger><TabsTrigger value="history"><History className="mr-2 h-4 w-4"/>Tidligere eksporter</TabsTrigger></TabsList>
    <TabsContent value="export" className="space-y-6 pt-4">
      <div className="flex flex-wrap gap-2">{Object.keys(PRESETS).map(p=><Button key={p} disabled={busy} variant={purpose===p?'default':'outline'} onClick={()=>{setPurpose(p);setSubject(`${p} – ${company}`);setFormat('files');void selectKeys(PRESETS[p].filter(k=>access.can(CONTENT.find(c=>c.key===k)?.module??'hms')));}}>{p}</Button>)}</div>
      <section className="space-y-4 border-t pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">1. Velg innhold</h2><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void selectKeys(CONTENT.filter(c=>access.can(c.module)).map(c=>c.key))}>Velg alle</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{setEnabled(new Set());clearReady();}}>Fjern alle</Button></div></div>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">{[...new Set(CONTENT.map(c=>c.group))].map(group=><div key={group} className="space-y-2"><h3 className="text-sm font-semibold">{group}</h3>{CONTENT.filter(c=>c.group===group).map(c=><div key={c.key}><div className="flex items-center gap-2"><Checkbox id={`content-${c.key}`} checked={enabled.has(c.key)} disabled={busy||!access.can(c.module)} onCheckedChange={v=>{const keys=new Set(enabled);v===true?keys.add(c.key):keys.delete(c.key);void selectKeys([...keys]);}}/><Label className="flex-1 text-sm font-normal" htmlFor={`content-${c.key}`}>{c.label}</Label>{enabled.has(c.key)&&<Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title={`Velg enkeltposter: ${c.label}`} aria-label={`Velg enkeltposter: ${c.label}`} onClick={()=>setExpanded(old=>{const n=new Set(old);n.has(c.key)?n.delete(c.key):n.add(c.key);return n;})}>{expanded.has(c.key)?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</Button>}</div>
      {!access.can(c.module)&&<p className="pl-6 text-xs text-muted-foreground">Ingen tilgang</p>}{errors[c.key]&&<p className="pl-6 text-xs text-destructive">{errors[c.key]}</p>}{enabled.has(c.key)&&!busy&&!errors[c.key]&&visibleRecords(c.key).length===0&&<p className="pl-6 text-xs text-muted-foreground">Ingen dokumentasjon med valgte filtre</p>}
      {expanded.has(c.key)&&enabled.has(c.key)&&<div className="ml-6 max-h-56 space-y-2 overflow-y-auto border-l pl-3 py-2">{visibleRecords(c.key).map(r=><label key={r.id} className="flex items-start gap-2 text-xs"><Checkbox checked={!omitted.has(`${c.key}:${r.id}`)} onCheckedChange={v=>{setOmitted(old=>{const n=new Set(old);v?n.delete(`${c.key}:${r.id}`):n.add(`${c.key}:${r.id}`);return n;});clearReady();}}/><span className="min-w-0 break-words">{r.title}{r.version&&<span className="block text-muted-foreground">{r.version}</span>}</span></label>)}</div>}</div>)}</div>)}</div></section>
      <section className="space-y-4 border-t pt-5"><h2 className="text-lg font-semibold">2. Velg filter</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-1.5"><Label>Firma</Label><Input value={company} readOnly/></div><Selector label="Prosjekt" value={filters.project} onChange={v=>changeFilter('project',v)} options={projects} disabled={!access.can('documents')}/><Selector label="Ansatt" value={filters.person} onChange={v=>changeFilter('person',v)} options={people} disabled={!access.can('employees')}/><div className="space-y-1.5"><Label htmlFor="export-from">Fra dato</Label><Input id="export-from" type="date" value={filters.from} onChange={e=>changeFilter('from',e.target.value)}/></div><div className="space-y-1.5"><Label htmlFor="export-to">Til dato</Label><Input id="export-to" type="date" value={filters.to} onChange={e=>changeFilter('to',e.target.value)}/></div><Selector label="Dokumentstatus" value={filters.status} onChange={v=>changeFilter('status',v)} options={statuses.map(s=>({id:s,name:statusNames[s]??s}))}/></div></section>
      <section className="space-y-4 border-t pt-5"><h2 className="text-lg font-semibold">3. Velg handling</h2><div className="grid gap-3 sm:grid-cols-3">{[{id:'download',label:'Last ned',icon:Download},{id:'email',label:'Send på e-post',icon:Send},{id:'both',label:'Last ned + send',icon:FileCheck2}].map(a=><Button key={a.id} variant={action===a.id?'default':'outline'} className="h-14" aria-pressed={action===a.id} disabled={busy||!selected.length||!canExport} onClick={()=>void run(a.id)}>{busy&&action===a.id?<Loader2 className="mr-2 h-5 w-5 animate-spin"/>:<a.icon className="mr-2 h-5 w-5"/>}{busy&&action===a.id?'Klargjør filer…':ready&&ready.action===a.id?(a.id==='download'?'Last ned valgte filer':ready.sent?'E-post sendt – send igjen':a.label):a.label}</Button>)}</div>
      <div className="max-w-sm space-y-1.5"><Label>Filformat</Label><Select value={format} onValueChange={v=>{setFormat(v as OutputFormat);clearReady();}}><SelectTrigger aria-label="Filformat"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="files">Separate PDF-filer + originalfiler</SelectItem><SelectItem value="originals">Bare originalfiler</SelectItem><SelectItem value="zip">Samlet ZIP</SelectItem><SelectItem value="report">Samlet rapport + originalfiler</SelectItem></SelectContent></Select></div>
      {action!=='download'&&<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="export-email">Til</Label><Input id="export-email" value={to} onChange={e=>{setTo(e.target.value);clearReady();}}/></div><div className="space-y-1.5"><Label htmlFor="export-cc">Kopi</Label><Input id="export-cc" value={cc} onChange={e=>{setCc(e.target.value);clearReady();}}/></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="export-subject">Emne</Label><Input id="export-subject" value={subject} onChange={e=>{setSubject(e.target.value);clearReady();}}/></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="export-message">Melding</Label><Textarea id="export-message" value={message} onChange={e=>{setMessage(e.target.value);clearReady();}}/></div></div>}</section>
      <section className="space-y-3 border-t pt-5"><h2 className="text-lg font-semibold">Dette blir eksportert <span className="text-muted-foreground">({selected.length})</span></h2>{!selected.length&&<p className="text-sm text-muted-foreground">Ingen filer valgt</p>}{selected.map(f=><div key={f.key} className="flex items-center gap-3 border-b py-2"><Check className="h-4 w-4 shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="break-words text-sm">{f.name}</p><p className="text-xs text-muted-foreground">{f.records.length} poster{f.records[0]?.original?' · Originalfil':''}</p></div><Button size="icon" variant="ghost" title="Fjern fil" aria-label={`Fjern ${f.name}`} disabled={busy} onClick={()=>{setExcluded(old=>new Set(old).add(f.key));clearReady();}}><X className="h-4 w-4"/></Button></div>)}
      {ready&&<div className="space-y-2 pt-2"><p className="text-sm font-medium">{ready.outputs.length} {ready.outputs.length===1?'fil':'filer'} klare for nedlasting</p><div className="divide-y">{ready.outputs.map(o=><div key={o.name} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 break-words text-sm">{o.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>{void deliverDleBlob(o.blob,o.name);void markDocumentationDownloaded(ready.id).then(()=>qc.invalidateQueries({queryKey:['documentation-history',activeCompanyId]}));}}><Download className="mr-2 h-4 w-4"/>Last ned fil</Button></div>)}</div></div>}</section>
    </TabsContent>
    <TabsContent value="history" className="space-y-3 pt-4">{historyLoading?<Loader2 className="h-5 w-5 animate-spin"/>:!history.length?<p className="py-8 text-sm text-muted-foreground">Ingen tidligere eksporter i {company}</p>:history.map((h:any)=><div key={h.id} className="border-b py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><p className="font-medium">{h.purpose}</p><p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString('nb-NO')} · {h.delivery_metadata?.actor_name ?? 'Ukjent bruker'}</p><p className="text-sm">{h.sent_at?'Sendt':h.status==='sending'?'Under sending':h.status==='failed'?'Sending feilet':'Klargjort'}{h.downloaded_at?' · Lastet ned':''} · {(h.files??[]).length} filer</p>{h.recipient_email&&<p className="break-words text-xs text-muted-foreground">Til: {h.recipient_email}{h.cc_emails?.length?` · Kopi: ${h.cc_emails.join(', ')}`:''}</p>}</div><Button size="sm" variant="ghost" onClick={()=>setDetails(details===h.id?null:h.id)}>{details===h.id?'Lukk detaljer':'Åpne detaljer'}</Button></div>{details===h.id&&<div className="mt-3 space-y-3 border-l pl-4">{(h.files??[]).map((f:any)=><div key={f.file_path} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words text-sm">{f.export_name}</span>{h.created_by===user?.id&&<Button size="sm" variant="outline" onClick={()=>void historyDownload(f)}><Download className="mr-2 h-4 w-4"/>Last ned</Button>}</div>)}{(h.delivery_metadata?.files??[]).flatMap((f:any)=>(f.versions??[]).map((v:any)=><p key={`${f.name}:${v.id}`} className="text-xs text-muted-foreground">{v.title} · {v.version}</p>))}{h.send_error&&<p className="text-sm text-destructive">{h.send_error}</p>}{(h.events??[]).map((e:any,i:number)=><div key={i} className="text-xs text-muted-foreground"><p>{e.summary} · {new Date(e.created_at).toLocaleString('nb-NO')}</p>{(e.payload?.links??[]).map((l:any)=><p key={l.name}>{l.name} · Lenke utløper {new Date(l.expires_at).toLocaleString('nb-NO')}</p>)}</div>)}</div>}</div>)}</TabsContent>
    </Tabs>
  </div>;
}
