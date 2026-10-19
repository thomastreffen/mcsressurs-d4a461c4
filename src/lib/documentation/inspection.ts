import type { AttachmentCandidate } from '@/lib/response-package';
import type { DleRecord } from '@/lib/dle/export';
export const INSPECTION_EXPORT_DEFAULTS = ['chart','matrix','fse_training','competence','internal_control'] as const;
export function suggestedFindingIds(findings: {id:string;finding_number:number}[]) {
  return findings.filter(f=>[6,7].includes(f.finding_number)).map(f=>f.id);
}
export function findingExportRecords(candidates: AttachmentCandidate[], findingId: string): DleRecord[] {
  return candidates.filter(c=>c.finding_id===findingId && c.kind!=='reference').map(c=>({
    id:c.key,title:c.title,sections:c.generated ? c.generated.rows.map((row,i)=>({heading:i===0?row.join(' · '):'',text:i===0?'':row.join(' · ')})) : [],
    original:c.kind==='document' && c.storage_bucket && c.file_path ? {bucket:c.storage_bucket,path:c.file_path,filename:c.file_name,mime:c.mime_type??'application/octet-stream'} : undefined,
  })).filter(r=>r.original || r.sections.length);
}
