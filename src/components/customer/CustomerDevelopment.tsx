import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useCompanyModuleAccess } from '@/hooks/useCompanyModuleAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Loader2, Plus, ArrowRight, Save, History } from 'lucide-react';
import { toast } from 'sonner';
import { CRM_LABELS, filterCrmAccounts, osloToday, type CrmAccount } from '@/lib/crm-accounts';
import type { Json } from '@/integrations/supabase/types';

function Choice({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][]}) {
 return <div className="space-y-1 min-w-0"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
}
const options=(keys:string[]):[string,string][]=>keys.map(k=>[k,CRM_LABELS[k]??k]);
const dateLabel=(s:string|null)=>s?new Date(`${s}T12:00:00`).toLocaleDateString('nb-NO'):'Ikke registrert';
export function CustomerDevelopment({customerId}:{customerId?:string}) {
 const {activeCompanyId}=useCompanyContext(); const access=useCompanyModuleAccess(); const qc=useQueryClient();
 const [filters,setFilters]=useState({search:'',relationship:'all',temperature:'all',priority:'all',owner:'all',due:'all',focus:false});
 const [selected,setSelected]=useState<CrmAccount|null>(null); const [creating,setCreating]=useState(false);
 useEffect(()=>{setSelected(null);setCreating(false);setFilters(f=>({...f,owner:'all'}));},[activeCompanyId]);
 const query=useQuery({queryKey:['crm-accounts',activeCompanyId],enabled:!!activeCompanyId&&access.can('customers'),queryFn:async()=>{if(!activeCompanyId)return [];const {data,error}=await supabase.rpc('crm_account_list',{_company_id:activeCompanyId});if(error)throw error;return data as unknown as CrmAccount[];}});
 const owners=useQuery({queryKey:['crm-owners',activeCompanyId],enabled:!!activeCompanyId&&access.can('customers'),queryFn:async()=>{if(!activeCompanyId)return [];const {data,error}=await supabase.rpc('crm_account_owners',{_company_id:activeCompanyId});if(error)throw error;return data??[];}});
 const rows=filterCrmAccounts((query.data??[]).filter(r=>!customerId||r.customer_id===customerId),filters,osloToday());
 const change=(k:keyof typeof filters,v:string|boolean)=>setFilters(f=>({...f,[k]:v}));
 if(!activeCompanyId)return <p className="text-muted-foreground">Velg selskap for kundeutvikling.</p>;
 return <section className="space-y-5">
 <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Lokale kundeenheter</h2>{access.can('customers','edit')&&<Button onClick={()=>setCreating(true)} className="min-h-11 gap-2"><Plus className="h-4 w-4"/>Ny kundeenhet</Button>}</div>
 <Input aria-label="Søk kundeenheter" placeholder="Søk hovedkunde, kundeenhet eller ansvarlig" value={filters.search} onChange={e=>change('search',e.target.value)} className="min-h-11"/>
 <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
 <Choice label="Kategori" value={filters.relationship} onChange={v=>change('relationship',v)} options={[['all','Alle kategorier'],...options(['existing','prospect'])]}/>
 <Choice label="Temperatur" value={filters.temperature} onChange={v=>change('temperature',v)} options={[['all','Alle temperaturer'],...options(['hot','warm','cold'])]}/>
 <Choice label="Prioritet" value={filters.priority} onChange={v=>change('priority',v)} options={[['all','Alle prioriteter'],...options(['A','B','C'])]}/>
 <Choice label="Ansvarlig" value={filters.owner} onChange={v=>change('owner',v)} options={[['all','Alle ansvarlige'],['unassigned','Uten ansvarlig'],...(owners.data??[]).map(o=>[o.user_id,o.name] as [string,string])]}/>
 <Choice label="Oppfølging" value={filters.due} onChange={v=>change('due',v)} options={[['all','Alle'],['due','Forfalt / i dag'],['missing','Uten dato']]}/>
 <label className="flex items-center gap-2 min-h-11 self-end text-sm"><Checkbox checked={filters.focus} onCheckedChange={v=>change('focus',v===true)}/>Fase 1-kunder</label>
 </div>
 {query.isLoading?<Loader2 className="h-6 w-6 animate-spin"/>:query.error?<div role="alert" className="text-destructive">Kunne ikke hente kundeenheter. <Button variant="outline" onClick={()=>query.refetch()}>Prøv igjen</Button></div>:rows.length===0?<p className="py-8 text-muted-foreground">Ingen kundeenheter i dette utvalget.</p>:<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map(r=><article key={r.id} className="border border-border rounded-lg p-4 space-y-3 bg-card">
 <div><p className="text-xs text-muted-foreground break-words">{r.customer_name}</p><h3 className="font-semibold break-words">{r.name}</h3></div>
 <div className="flex flex-wrap gap-2"><Badge variant="secondary">{CRM_LABELS[r.relationship??'']??'Ikke klassifisert'}</Badge>{r.temperature&&<Badge variant="outline">{CRM_LABELS[r.temperature]}</Badge>}{r.priority&&<Badge variant="outline">Prioritet {r.priority}</Badge>}</div>
 <dl className="text-sm space-y-2"><div><dt className="text-muted-foreground">Ansvarlig</dt><dd>{r.owner_name??'Ikke tildelt'}</dd></div><div><dt className="text-muted-foreground">Siste kontakt</dt><dd>{dateLabel(r.last_contact_on)}</dd></div><div><dt className="text-muted-foreground">Neste oppfølging</dt><dd className={r.next_followup_on&&r.next_followup_on<=osloToday()?'text-destructive':''}>{dateLabel(r.next_followup_on)}</dd><dd className="break-words">{r.next_action}</dd></div></dl>
 <Button variant="outline" className="w-full min-h-11 gap-2" onClick={()=>setSelected(r)}>Åpne kundeenhet<ArrowRight className="h-4 w-4"/></Button></article>)}</div>}
 {(selected||creating)&&<AccountEditor key={selected?.id??'new'} row={selected} companyId={activeCompanyId} customerId={customerId} canEdit={access.can('customers','edit')} owners={owners.data??[]} onClose={()=>{setSelected(null);setCreating(false);}} onSaved={async()=>{await qc.invalidateQueries({queryKey:['crm-accounts',activeCompanyId]});setSelected(null);setCreating(false);}}/>}
 </section>;
}
function AccountEditor({row,companyId,customerId,canEdit,owners,onClose,onSaved}:{row:CrmAccount|null;companyId:string;customerId?:string;canEdit:boolean;owners:{user_id:string;name:string}[];onClose:()=>void;onSaved:()=>Promise<void>}) {
 const request=useRef(crypto.randomUUID());const locked=useRef(false);
 const [legal,setLegal]=useState(customerId??'');const [name,setName]=useState('');const [verified,setVerified]=useState(false);const [saving,setSaving]=useState(false);const [note,setNote]=useState('');
 const [state,setState]=useState({owner_user_id:row?.owner_user_id??'',relationship:row?.relationship??'existing',temperature:row?.temperature??'warm',priority:row?.priority??'B',last_contact_on:row?.last_contact_on??'',next_followup_on:row?.next_followup_on??'',next_action:row?.next_action??''});
 const customers=useQuery({queryKey:['crm-legal-customers',companyId],enabled:!row,queryFn:async()=>{const {data,error}=await supabase.from('customers').select('id,name,org_number').eq('company_id',companyId).is('deleted_at',null).order('name');if(error)throw error;return data??[];}});
 const history=useQuery({queryKey:['crm-history',companyId,row?.id],enabled:!!row,queryFn:async()=>{if(!row)return [];const {data,error}=await supabase.from('customer_account_crm_history').select('*').eq('company_id',companyId).eq('account_id',row.id).order('created_at',{ascending:false});if(error)throw error;return data??[];}});
 const update=(k:keyof typeof state,v:string)=>setState(s=>({...s,[k]:v}));
 async function save(){if(locked.current)return;locked.current=true;setSaving(true);try{const {error}=await supabase.rpc('save_crm_account',{_company_id:companyId,_account_id:row?.id??null,_customer_id:row?.customer_id??legal,_name:row?.name??name,_verified:verified,_expected_version:row?.version??0,_state:state as Json,_note:note,_request_id:request.current});if(error)throw error;toast.success('Kundeenhet lagret');await onSaved();}catch(e){toast.error('Kunne ikke lagre',{description:e instanceof Error?e.message:'Kontroller tilgang og last inn kundeenheten på nytt.'});}finally{locked.current=false;setSaving(false);}}
 return <Sheet open onOpenChange={v=>{if(!v&&!saving)onClose();}}><SheetContent mobileWorkspace className="sm:max-w-xl overflow-y-auto"><SheetHeader><SheetTitle>{row?.name??'Ny kundeenhet'}</SheetTitle><SheetDescription>{row?.customer_name??'Verifisert lokal kundeenhet'}</SheetDescription></SheetHeader>
 <div className="space-y-4 mt-6"><fieldset disabled={!canEdit||saving} className="space-y-4">
 {!row&&<><Choice label="Juridisk hovedkunde" value={legal} onChange={setLegal} options={(customers.data??[]).map(c=>[c.id,`${c.name}${c.org_number?' · '+c.org_number:''}`])}/>{customers.error&&<p role="alert" className="text-destructive">Kunne ikke hente hovedkunder</p>}<div><Label htmlFor="unit-name">Lokalt avdelingsnavn</Label><Input id="unit-name" value={name} maxLength={200} onChange={e=>setName(e.target.value)} className="min-h-11"/></div><label className="flex gap-2 items-center min-h-11 text-sm"><Checkbox checked={verified} onCheckedChange={v=>setVerified(v===true)}/>Rune/Thomas har verifisert avdelingen</label></>}
 <Choice label="Ansvarlig for kundeenheten" value={state.owner_user_id||'none'} onChange={v=>update('owner_user_id',v==='none'?'':v)} options={[['none','Ikke tildelt'],...owners.map(o=>[o.user_id,o.name] as [string,string]),...(state.owner_user_id&&!owners.some(o=>o.user_id===state.owner_user_id)?[[state.owner_user_id,'Tidligere ansvarlig – velg på nytt'] as [string,string]]:[])]}/>
 <div className="grid grid-cols-2 gap-3"><Choice label="Relasjon" value={state.relationship} onChange={v=>update('relationship',v)} options={options(['existing','prospect'])}/><Choice label="Kundetemperatur" value={state.temperature} onChange={v=>update('temperature',v)} options={options(['hot','warm','cold'])}/><Choice label="ABC-prioritet" value={state.priority} onChange={v=>update('priority',v)} options={options(['A','B','C'])}/></div>
 <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="last-contact">Siste kontakt</Label><Input id="last-contact" type="date" max={osloToday()} value={state.last_contact_on} onChange={e=>update('last_contact_on',e.target.value)} className="min-h-11"/></div><div><Label htmlFor="next-contact">Neste oppfølging</Label><Input id="next-contact" type="date" value={state.next_followup_on} onChange={e=>update('next_followup_on',e.target.value)} className="min-h-11"/></div></div>
 <div><Label htmlFor="next-action">Neste handling</Label><Input id="next-action" value={state.next_action} maxLength={500} onChange={e=>update('next_action',e.target.value)} className="min-h-11"/></div><div><Label htmlFor="crm-note">Historikknotat{state.last_contact_on?' (påkrevd)':''}</Label><Textarea id="crm-note" value={note} maxLength={4000} onChange={e=>setNote(e.target.value)}/></div>
 </fieldset>{canEdit&&<Button className="w-full min-h-11 gap-2" disabled={saving||(!row&&(!verified||!legal||!name.trim()))||(!!state.last_contact_on&&!note.trim())} onClick={save}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Lagre kundeenhet</Button>}
 {row&&<section className="space-y-3 border-t border-border pt-4"><h3 className="flex gap-2 font-semibold"><History className="h-4 w-4"/>Historikk</h3>{history.isLoading?<Loader2 className="animate-spin h-4 w-4"/>:history.error?<p role="alert" className="text-destructive">Kunne ikke hente historikk</p>:history.data?.length===0?<p className="text-sm text-muted-foreground">Ingen registrert CRM-historikk.</p>:history.data?.map(h=>{const s=h.after_state as Record<string,string>;return <div key={h.id} className="border-l-2 border-border pl-3 space-y-1"><p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString('nb-NO',{timeZone:'Europe/Oslo'})} · {h.actor_name}</p><p className="text-sm">{h.kind==='contact'?'Kontakt registrert':h.kind==='created'?'Kundeutvikling registrert':'Oppfølging endret'} · {CRM_LABELS[s.relationship]} / {CRM_LABELS[s.temperature]} / {s.priority}</p><p className="text-sm">Neste: {dateLabel(s.next_followup_on??null)}{s.next_action?' · '+s.next_action:''}</p><p className="text-sm whitespace-pre-wrap break-words">{h.note}</p></div>;})}</section>}
 </div></SheetContent></Sheet>;
}
