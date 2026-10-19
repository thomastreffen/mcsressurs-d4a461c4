import { supabase } from '@/integrations/supabase/client';
import { loadDleRecords } from '@/lib/dle/sources';
import { CONTENT, type ContentKey, type ExportRecord } from './catalog';
const sb = supabase as any;
async function query(table: string, company: string, columns: string) {
  const { data, error } = await sb.from(table).select(columns).eq('company_id', company).is('deleted_at', null);
  if (error) throw error;
  return data ?? [];
}
const section = (heading: string, value: unknown) => ({ heading, text: String(value ?? '') });
export async function loadDocumentation(key: ContentKey, company: string): Promise<ExportRecord[]> {
  if (key === 'project_docs') {
    const docs = await query('documents', company, 'id,entity_id,entity_type,file_name,file_path,storage_bucket,mime_type,created_at');
    return docs.filter((d: any) => ['job','project','event'].includes(d.entity_type) && d.file_path && d.storage_bucket).map((d: any) => ({ id: d.id, title: d.file_name, projectId: d.entity_id, date: d.created_at, sections: [], original: { filename: d.file_name, path: d.file_path, bucket: d.storage_bucket, mime: d.mime_type ?? 'application/octet-stream' } }));
  }
  if (key === 'risks') {
    const [assessments, items] = await Promise.all([query('hms_risk_assessments', company, 'id,title,description,project_id,status,created_at,created_by'), sb.from('hms_risk_items').select('assessment_id,description,probability,consequence,proposed_action,status').eq('company_id',company)]);
    if (items.error) throw items.error;
    return assessments.map((a: any) => ({ id:a.id, title:a.title, date:a.created_at, status:a.status, projectId:a.project_id, userId:a.created_by, sections: [section('Beskrivelse',a.description), ...(items.data ?? []).filter((i: any) => i.assessment_id === a.id).map((i: any) => section(i.description, `Sannsynlighet: ${i.probability} · Konsekvens: ${i.consequence}\nTiltak: ${i.proposed_action ?? ''}\nStatus: ${i.status}`))] }));
  }
  if (['sja','rounds','checklists'].includes(key)) {
    const submissions = await query('hms_submissions', company, 'id,title,kind,status,project_id,submitted_at,submitted_by,location,template_snapshot,template_version');
    const chosen = submissions.filter((s: any) => key === 'sja' ? s.kind === 'sja' : key === 'rounds' ? /vernerunde/i.test(`${s.title} ${s.template_snapshot?.name} ${s.template_snapshot?.category}`) : s.kind !== 'sja' && !/vernerunde/i.test(`${s.title} ${s.template_snapshot?.name} ${s.template_snapshot?.category}`));
    if (!chosen.length) return [];
    const {data: answers,error} = await sb.from('hms_submission_answers').select('submission_id,item_id,value').in('submission_id',chosen.map((s:any)=>s.id));
    if(error) throw error;
    return chosen.map((s:any)=>({id:s.id,title:s.title ?? s.template_snapshot?.name ?? 'Skjema',status:s.status,date:s.submitted_at,projectId:s.project_id,userId:s.submitted_by,version:`Mal v${s.template_version ?? '?'}`,sections:[section('Dato / status',`${s.submitted_at ?? 'Ikke innsendt'} / ${s.status}`),section('Sted',s.location),...(s.template_snapshot?.sections ?? []).flatMap((part:any)=>(part.items ?? []).map((item:any)=>{ const value=(answers ?? []).find((a:any)=>a.submission_id===s.id && a.item_id===item.id)?.value; return section(item.label, typeof value==='object' && value!==null ? JSON.stringify(value):value); }))]}));
  }
  const config = CONTENT.find(c=>c.key===key);
  if(!config) return [];
  let records: ExportRecord[] = await loadDleRecords(config.source,company,[]);
  if(key==='emergency') records=records.filter(r=>/beredskap|brann|førstehjelp|ulykke|evakuering/i.test(r.title));
  if(['fse_status','courses'].includes(key)) records=records.map(r=>({...r,sections:r.sections.filter(s=>key==='fse_status' ? /fse|elsikkerhet/i.test(s.heading) : !/fse|elsikkerhet/i.test(s.heading))}));
  if(['competence','fse_status','courses'].includes(key)) records=records.map(r=>({...r,personId:r.id}));
  if(key==='incidents') {
    const meta=await query('hms_incidents',company,'id,status,project_id,occurred_at,reported_by');
    records=records.map(r=>{const m=meta.find((x:any)=>x.id===r.id);return {...r,status:m?.status,date:m?.occurred_at,projectId:m?.project_id,userId:m?.reported_by};});
  }
  return records;
}
