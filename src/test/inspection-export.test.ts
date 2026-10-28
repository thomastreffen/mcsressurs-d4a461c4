import { describe,it,expect } from 'vitest';
import { GENERAL_EXPORT_OPTIONS,suggestedFindingIds,findingExportRecords,availableGeneralExportKeys } from '@/lib/documentation/inspection';
import type { AttachmentCandidate } from '@/lib/response-package';
import type { DleRecord } from '@/lib/dle/export';

const candidate:AttachmentCandidate={key:'document-6',finding_id:'six',kind:'document',evidence_id:'ev',document_id:'doc',file_name:'original.pdf',mime_type:'application/pdf',file_size:100,storage_bucket:'job-attachments',file_path:'six/report.pdf',source_kind:'document',source_label:'Bevis',date:null,status_label:'Tilgjengelig',status_tone:'ok',title:'Rapport'};

/** Funn som er ferdig behandlet internt (ansvarlig, godkjent svar, rettet, komplett dokumentasjon) */
const readyFinding={id:'',status:'new',responsible_person_id:'p1',response_approved_at:'2026-10-28',condition_corrected_at:'2026-10-28',documentation_complete_at:'2026-10-28',documentation_status:'complete'};
const openFinding={id:'',status:'new',responsible_person_id:null,response_approved_at:null,condition_corrected_at:null,documentation_complete_at:null,documentation_status:'none'};

describe('Inspection export rules',()=>{
 it('offers the five general documentation categories for manual selection',()=>expect(GENERAL_EXPORT_OPTIONS.map(o=>o.key)).toEqual(['chart','matrix','fse_training','competence','internal_control']));

 it('has no hardcoded finding numbers – a ready, documented finding 2 is suggested',()=>{
   const f={...readyFinding,id:'two'};
   expect(suggestedFindingIds([f],[{...candidate,key:'d2',finding_id:'two'}])).toEqual(['two']);
 });

 it('does not suggest finding 6 or 7 without documentation and completed treatment',()=>{
   const six={...openFinding,id:'six'},seven={...openFinding,id:'seven'};
   expect(suggestedFindingIds([six,seven],[])).toEqual([]);
 });

 it('does not suggest a ready finding that lacks exportable documentation',()=>{
   expect(suggestedFindingIds([{...readyFinding,id:'nine'}],[])).toEqual([]);
 });

 it('does not suggest an unfinished finding even when it has documentation',()=>{
   const f={...openFinding,id:'four'};
   expect(suggestedFindingIds([f],[{...candidate,key:'d4',finding_id:'four'}])).toEqual([]);
 });

 it('suggests submitted findings with documentation',()=>{
   const f={...readyFinding,id:'three',status:'submitted'};
   expect(suggestedFindingIds([f],[{...candidate,key:'d3',finding_id:'three'}])).toEqual(['three']);
 });

 it('exports only evidence belonging to the selected finding',()=>expect(findingExportRecords([candidate,{...candidate,key:'other',finding_id:'seven'}],'six').map(r=>r.id)).toEqual(['document-6']));
 it('preserves original evidence file paths',()=>expect(findingExportRecords([candidate],'six')[0].original?.path).toBe('six/report.pdf'));
 it('does not invent files for references without original documentation',()=>expect(findingExportRecords([{...candidate,kind:'reference',storage_bucket:null,file_path:null}],'six')).toEqual([]));
});

describe('General export category defaults',()=>{
 const record:DleRecord={id:'r1',title:'Innhold',sections:[{heading:'H',text:'T'}]};
 const allowAll=()=>true;

 it('preselects only categories that actually have content',async()=>{
   const load=async(key:string)=>key==='chart'||key==='internal_control'?[record]:[];
   await expect(availableGeneralExportKeys(allowAll,load as never)).resolves.toEqual(['chart','internal_control']);
 });

 it('never preselects empty categories',async()=>{
   await expect(availableGeneralExportKeys(allowAll,async()=>[])).resolves.toEqual([]);
 });

 it('skips categories the user has no access to',async()=>{
   const allowed=(key:string)=>key!=='competence';
   const load=async()=>[record];
   await expect(availableGeneralExportKeys(allowed,load)).resolves.toEqual(['chart','matrix','fse_training','internal_control']);
 });

 it('does not preselect a category whose probe fails',async()=>{
   const load=async(key:string)=>{if(key==='matrix')throw new Error('nettverksfeil');return [record];};
   await expect(availableGeneralExportKeys(allowAll,load as never)).resolves.toEqual(['chart','fse_training','competence','internal_control']);
 });
});
