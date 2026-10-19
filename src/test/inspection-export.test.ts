import { describe,it,expect } from 'vitest';
import { INSPECTION_EXPORT_DEFAULTS,suggestedFindingIds,findingExportRecords } from '@/lib/documentation/inspection';
import type { AttachmentCandidate } from '@/lib/response-package';
const candidate:AttachmentCandidate={key:'document-6',finding_id:'six',kind:'document',evidence_id:'ev',document_id:'doc',file_name:'original.pdf',mime_type:'application/pdf',file_size:100,storage_bucket:'job-attachments',file_path:'six/report.pdf',source_kind:'document',source_label:'Bevis',date:null,status_label:'Tilgjengelig',status_tone:'ok',title:'Rapport'};
describe('Inspection export rules',()=>{
 it('suggests the five requested common documentation categories',()=>expect([...INSPECTION_EXPORT_DEFAULTS]).toEqual(['chart','matrix','fse_training','competence','internal_control']));
 it('preselects findings 6 and 7 only',()=>expect(suggestedFindingIds([{id:'six',finding_number:6},{id:'seven',finding_number:7},{id:'eight',finding_number:8}])).toEqual(['six','seven']));
 it('exports only evidence belonging to the selected finding',()=>expect(findingExportRecords([candidate,{...candidate,key:'other',finding_id:'seven'}],'six').map(r=>r.id)).toEqual(['document-6']));
 it('preserves original evidence file paths',()=>expect(findingExportRecords([candidate],'six')[0].original?.path).toBe('six/report.pdf'));
 it('does not invent files for references without original documentation',()=>expect(findingExportRecords([{...candidate,kind:'reference',storage_bucket:null,file_path:null}],'six')).toEqual([]));
});
