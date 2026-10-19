import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { generateDlePdf, type DleFile } from '@/lib/dle/export';
import { prepareDleFile } from '@/lib/dle/sources';
import { escapeHtml, slugForFile } from '@/lib/response-package';
import { parseDleRecipients } from '@/lib/dle/delivery';
const sb = supabase as any;
export type OutputFormat = 'files' | 'originals' | 'zip' | 'report';
export async function prepareOutputs(files: DleFile[], format: OutputFormat, company: string, purpose: string, date: string) {
  const outputs: {name:string;blob:Blob}[] = [];
  if (format==='report') {
    const generated=files.filter(f=>!f.records[0]?.original);
    if(generated.length) {
      const report: DleFile={key:'report',category:'roles',name:'',path:'',records:generated.flatMap(f=>f.records)};
      outputs.push({name:`${slugForFile(company)}_${slugForFile(purpose)}_${date}.pdf`,blob:generateDlePdf(report,company,date)});
    }
    for(const f of files.filter(f=>f.records[0]?.original)) outputs.push({name:f.name,blob:await prepareDleFile(f,company,date)});
  } else {
    for(const f of files) outputs.push({name:f.name,blob:await prepareDleFile(f,company,date)});
  }
  if(format==='zip') {
    const zip=new JSZip();outputs.forEach((o,i)=>zip.file(files[i].path,o.blob));
    return [{name:`${slugForFile(company)}_${slugForFile(purpose)}_${date}.zip`,blob:await zip.generateAsync({type:'blob',compression:'STORE'})}];
  }
  return outputs;
}
export async function saveDocumentationExport(input: {companyId:string;userId:string;actor:string;company:string;purpose:string;files:DleFile[];outputs:{name:string;blob:Blob}[];format:OutputFormat|'pdf'|'xlsx'|'csv';action:string;subject:string;message:string;to:string;cc:string;filters:unknown;sourceModule?:string;recordCount?:number;sourcePage?:string}) {
  const to=parseDleRecipients(input.to),cc=parseDleRecipients(input.cc);
  if(input.action!=='download'&&!to.length) throw new Error('Mottaker mangler');
  const id=crypto.randomUUID();
  const metadata={actor_name:input.actor,company_name:input.company,purpose:input.purpose,format:input.format,action:input.action,to,cc,filters:input.filters,source_module:input.sourceModule ?? 'hms',source_page:input.sourcePage,record_count:input.recordCount,files:input.files.map(f=>({name:f.name,versions:f.records.map(r=>({id:r.id,title:r.title,version:r.version ?? 'Snapshot'}))}))};
  const {error}=await sb.from('hms_document_exports').insert({id,client_request_id:crypto.randomUUID(),company_id:input.companyId,created_by:input.userId,source_module:input.sourceModule ?? 'hms',access_level:input.sourceModule ? 'view' : 'edit',purpose:input.purpose,subject:input.subject,recipient_email:to.join(';'),cc_emails:cc,email_body_snapshot:`<p>${escapeHtml(input.message).replace(/\n/g,'<br>')}</p>`,delivery_metadata:metadata});
  if(error) throw error;
  const stored=[];
  for(const output of input.outputs) {
    const path=`${id}/${crypto.randomUUID()}/${output.name}`;
    const {error:uploadError}=await supabase.storage.from('dle-exports').upload(path,output.blob,{contentType:output.blob.type || 'application/octet-stream'});
    if(uploadError) throw uploadError;
    stored.push({export_name:output.name,file_path:path,storage_bucket:'dle-exports',mime_type:output.blob.type,file_size:output.blob.size});
  }
  const {error:updateError}=await sb.from('hms_document_exports').update({files:stored}).eq('id',id);
  if(updateError) throw updateError;
  return {id,files:stored};
}
export async function sendDocumentationExport(id:string) {
  const {data,error}=await supabase.functions.invoke('inspection-response-send',{body:{export_id:id}});
  if(error||!data?.ok) throw new Error(data?.message ?? error?.message ?? 'Sendingen feilet');
  return data;
}
export async function markDocumentationDownloaded(id:string) {
  const {error}=await supabase.rpc('mark_documentation_downloaded',{_export_id:id});
  if(error) throw error;
}
