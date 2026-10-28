import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, FileCheck2, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/hooks/useAuth';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useCompanyModuleAccess } from '@/hooks/useCompanyModuleAccess';
import { useInspection, useFindings, useFindingEvidence, useInspectionActions } from '@/hooks/useInspections';
import { useAttachmentCandidates } from '@/hooks/useResponsePackages';
import { supabase } from '@/integrations/supabase/client';
import { buildDleFiles, deliverDleBlob, type DleFile } from '@/lib/dle/export';
import { prepareOutputs, saveDocumentationExport, sendDocumentationExport, markDocumentationDownloaded } from '@/lib/documentation/delivery';
import { GENERAL_EXPORT_OPTIONS, availableGeneralExportKeys, loadOptionRecords, suggestedFindingIds } from '@/lib/documentation/inspection';

export function InspectionExportTab({inspectionId}:{inspectionId:string}) {
  const {user}=useAuth();const {activeCompanyId,activeCompany,companies,setActiveCompanyId}=useCompanyContext();const access=useCompanyModuleAccess();const qc=useQueryClient();
  const inspection=useInspection(inspectionId);const findings=useFindings(inspectionId);const evidence=useFindingEvidence(inspectionId);const actions=useInspectionActions(inspectionId);
  const {candidates,loading}=useAttachmentCandidates(findings.data??[],evidence.data??[],actions.data??[]);
  const [choices,setChoices]=useState<Set<string>>(new Set());const [files,setFiles]=useState<DleFile[]>([]);const [removed,setRemoved]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);const [reviewed,setReviewed]=useState(false);const [missing,setMissing]=useState<string[]>([]);
  const [action,setAction]=useState('download');const [to,setTo]=useState('');const [cc,setCc]=useState('');const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [sent,setSent]=useState(false);
  const initialized=useRef(false);const alive=useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
  const allowed=(key:string)=>access.can(key==='chart'||key==='matrix'?'organisation':key==='fse_training'||key==='competence'?'employees':'hms');
  useEffect(()=>{
    if(initialized.current||!inspection.data||inspection.data.company_id!==activeCompanyId||!findings.data||access.loading||loading)return;
    initialized.current=true;
    setTo(inspection.data.contact_email??'');setSubject(`Dokumentasjon – ${inspection.data.title}`);
    const suggested=suggestedFindingIds(findings.data,candidates).map(id=>`finding:${id}`);
    void availableGeneralExportKeys(allowed,key=>loadOptionRecords(key,inspection.data!.company_id,inspectionId,candidates))
      .then(general=>{if(alive.current)setChoices(new Set([...general,...suggested]));})
      .catch(()=>{if(alive.current)setChoices(new Set(suggested));});
  },[inspection.data,findings.data,access.loading,activeCompanyId,loading,candidates,inspectionId]);
  if(inspection.data && inspection.data.company_id !== activeCompanyId) return <div className="space-y-3"><h2 className="text-xl font-semibold">Eksport fra tilsynssak</h2><p className="text-sm text-muted-foreground">Velg sakens firma før dokumentasjonen hentes.</p>{companies.some(c=>c.id===inspection.data?.company_id) && <Button onClick={()=>{if(inspection.data)setActiveCompanyId(inspection.data.company_id);}}>Bytt til {companies.find(c=>c.id===inspection.data?.company_id)?.name ?? 'sakens firma'}</Button>}</div>;
  if(!access.can('hms','edit'))return <p className="text-sm text-muted-foreground">Du har ikke tilgang til eksport i dette firmaet.</p>;
  const company=activeCompany?.name??'Firma';const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Oslo'});
  const options=[...GENERAL_EXPORT_OPTIONS.map(o=>({key:o.key as string,label:o.label})),...(findings.data??[]).map(f=>({key:`finding:${f.id}`,label:`Dokumentasjon knyttet til funn ${f.finding_number}`}))];
  const selected=files.filter(f=>!removed.has(f.key));
  function reset(){setReviewed(false);setFiles([]);setSent(false);}
  async function review() {
    if(!activeCompanyId||inspection.data?.company_id!==activeCompanyId)return;setBusy(true);const result:DleFile[]=[];const gaps:string[]=[];
    try {
      for(const option of options.filter(o=>choices.has(o.key)&&allowed(o.key))) {
        let category: DleFile['category']='roles';
        if(option.key.startsWith('finding:'))category='attachments';
        else if(option.key==='fse_training')category='competence';
        else if(option.key!=='internal_control')category=option.key as 'chart'|'matrix'|'competence';
        const records=await loadOptionRecords(option.key,activeCompanyId,inspectionId,candidates);
        if(!records.length){gaps.push(option.label);continue;}
        const built=buildDleFiles(category,records,option.key.startsWith('finding:')||option.key==='internal_control',company,date);
        for(const f of built){if(option.key==='fse_training')f.name=f.name.replace('Kompetanseoversikt','FSE_opplaering');f.path=`${f.path.split('/')[0]}/${f.name}`;f.key=`${option.key}:${f.key}`;result.push(f);}
      }
      if(!alive.current)return;
      setFiles(result.filter((f,i,all)=>all.findIndex(x=>x.records[0]?.original&&f.records[0]?.original?x.records[0].original.path===f.records[0].original.path&&x.records[0].original.bucket===f.records[0].original.bucket:x.name===f.name)===i));setRemoved(new Set());setMissing(gaps);setReviewed(true);
    }catch(e){toast.error(e instanceof Error?e.message:'Kunne ikke hente dokumentasjon');}finally{if(alive.current)setBusy(false);}
  }
  async function deliver() {
    if(!activeCompanyId||!user||!inspection.data||inspection.data.company_id!==activeCompanyId||!selected.length)return;setBusy(true);
    try {
      const outputs=await prepareOutputs(selected,'files',company,'DLE-tilsyn',date);
      const saved=await saveDocumentationExport({companyId:activeCompanyId,userId:user.id,actor:user.name,company,purpose:`DLE-tilsyn – ${inspection.data.title}`,files:selected,outputs,format:'files',action,subject,message,to,cc,filters:{inspection_id:inspectionId,finding_ids:[...choices].filter(k=>k.startsWith('finding:')).map(k=>k.slice(8))}});
      if(action!=='download') await sendDocumentationExport(saved.id);
      if(action!=='email'){for(const output of outputs)await deliverDleBlob(output.blob,output.name);await markDocumentationDownloaded(saved.id);}
      const {error}=await (supabase as any).from('compliance_inspection_events').insert({company_id:activeCompanyId,inspection_id:inspectionId,actor_user_id:user.id,event_type:action==='download'?'dle_exported':'dle_sent',summary:`${action==='download'?'Lastet ned':action==='both'?'Lastet ned og Microsoft aksepterte sending':'Microsoft aksepterte sending'}: ${selected.map(f=>f.name).join(', ')}`,payload:{export_id:saved.id,delivery:action,actor_name:user.name,company_name:company,to,cc,files:selected.map(f=>({name:f.name,category:f.category,source_ids:f.records.map(r=>r.id),versions:f.records.map(r=>({title:r.title,version:r.version??'Snapshot '+date}))}))}});
      if(error)toast.error('Eksporten er levert, men sakshistorikken kunne ikke oppdateres');
      await Promise.all([qc.invalidateQueries({queryKey:['inspection-events',activeCompanyId,inspectionId]}),qc.invalidateQueries({queryKey:['documentation-history',activeCompanyId]})]);
      if(alive.current){setSent(true);toast.success(action==='download'?'Dokumentene er lastet ned':'Microsoft har akseptert e-posten');}
    }catch(e){toast.error(e instanceof Error?e.message:'Eksporten feilet');}finally{if(alive.current)setBusy(false);}
  }
  return <section className="max-w-4xl space-y-6">
    <header className="space-y-2"><h2 className="flex items-center gap-2 text-xl font-semibold"><FileCheck2 className="h-5 w-5 text-primary"/>Eksport fra tilsynssak</h2><p className="text-xs text-muted-foreground">Valgt sak</p><p className="text-base font-medium">{inspection.data?.title??'Laster sak…'}</p></header>
    <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Foreslått dokumentasjon</h3>{options.map(o=><label key={o.key} className="flex items-center gap-3 text-sm"><Checkbox checked={choices.has(o.key)} disabled={busy||!allowed(o.key)} onCheckedChange={v=>{setChoices(old=>{const n=new Set(old);v===true?n.add(o.key):n.delete(o.key);return n;});reset();}}/><span>{o.label}</span>{!allowed(o.key)&&<span className="text-xs text-muted-foreground">Ingen tilgang</span>}</label>)}</div>
    <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Hva vil du gjøre?</h3><RadioGroup value={action} onValueChange={v=>{setAction(v);setSent(false);}} className="flex flex-wrap gap-6" disabled={busy}>{[{key:'download',label:'Last ned'},{key:'email',label:'Send på e-post'},{key:'both',label:'Begge'}].map(o=><label key={o.key} className="flex items-center gap-2 text-sm"><RadioGroupItem value={o.key}/>{o.label}</label>)}</RadioGroup></div>
    {action!=='download'&&<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="inspection-export-to">Til</Label><Input id="inspection-export-to" value={to} onChange={e=>setTo(e.target.value)}/></div><div className="space-y-1"><Label htmlFor="inspection-export-cc">Kopi</Label><Input id="inspection-export-cc" value={cc} onChange={e=>setCc(e.target.value)}/></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="inspection-export-subject">Emne</Label><Input id="inspection-export-subject" value={subject} onChange={e=>setSubject(e.target.value)}/></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="inspection-export-message">Melding</Label><Textarea id="inspection-export-message" value={message} onChange={e=>setMessage(e.target.value)}/></div></div>}
    {!reviewed?<Button disabled={busy||loading||!choices.size} onClick={()=>void review()}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Forhåndsvis eksport</Button>:<div className="space-y-4 border-t pt-4"><h3 className="font-semibold">Dette blir eksportert</h3>{missing.length>0&&<div className="space-y-1 text-sm text-muted-foreground"><p className="font-medium">Dokumentasjon mangler</p>{missing.map(m=><p key={m}>{m}: ingen tilgjengelig dokumentasjon knyttet til valgt innhold</p>)}</div>}{selected.map(f=><div key={f.key} className="flex items-center gap-3 border-b py-2"><Check className="h-4 w-4 shrink-0 text-primary"/><span className="min-w-0 flex-1 break-words text-sm">{f.name}{f.records[0]?.original&&<span className="block text-xs text-muted-foreground">Originalfil</span>}</span><Button variant="ghost" size="icon" disabled={busy} aria-label={`Fjern ${f.name}`} onClick={()=>setRemoved(old=>new Set(old).add(f.key))}><X className="h-4 w-4"/></Button></div>)}<Button disabled={busy||sent||!selected.length} onClick={()=>void deliver()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:action==='download'?<Download className="mr-2 h-4 w-4"/>:<Send className="mr-2 h-4 w-4"/>}{sent?'Ferdig':action==='download'?'Last ned':action==='both'?'Last ned + send':'Send på e-post'}</Button></div>}
  </section>;
}
