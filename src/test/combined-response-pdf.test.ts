import { Blob as NodeBlob } from 'node:buffer';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildCombinedPdf, candidateFiles, type CombinedPdfInput } from '@/lib/documentation/combined-pdf';
import { externalDocumentBlob } from '@/lib/external-document';
import type { AttachmentCandidate } from '@/lib/response-package';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/hooks/useChemicals',()=>({fetchSdsUrl:vi.fn()}));
const ready={status:'new',response_approved_at:'2026-10-28',responsible_person_id:'p1',condition_corrected_at:'2026-10-28',documentation_complete_at:'2026-10-28',documentation_status:'complete'};
const c={key:'rutine',finding_id:'f2',kind:'document',title:'Rutine for internrevisjon',file_name:'rutine.md',mime_type:'text/markdown',storage_bucket:'internal',file_path:'rutine.md'} as AttachmentCandidate;
const input:CombinedPdfInput={company:'MCS Service AS',title:'DLE sak 63210',authority:'DLE',caseNumber:'63210',date:'2026-10-28',findings:[{...ready,id:'f3',finding_number:3,title:'Regelverksregister',response_text:'Register etablert'},{...ready,id:'f1',finding_number:1,title:'Organisasjon',response_text:'Virksomheten har etablert organisasjonsoversikt'},{...ready,id:'f2',finding_number:2,title:'Internrevisjon',response_text:'Rutine og revisjon gjennomført'}],documents:candidateFiles([c],'MCS Service AS','2026-10-28')};
async function readableBlob(blob:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsText(blob);});}
describe('Combined case 63210 PDF, isolated sources',()=>{
 it('produces one PDF with findings in numeric order and full Markdown content represented',async()=>{
   const load=vi.fn(async()=>externalDocumentBlob(new NodeBlob(['# Rutine\n## Gjennomført internrevisjon\nAnsvar og kompetanse kontrollert.'],{type:'text/markdown'}) as Blob,'rutine.md','text/markdown',c.title,input.company,input.date));
   const result=await buildCombinedPdf(input,load);
   expect(result.name).toBe('MCS_Service_AS_Svarpakke_63210_2026-10-28.pdf');expect(result.blob.type).toBe('application/pdf');
   expect(result.chapters.filter(c=>c.title.startsWith('Funn')).map(c=>c.title)).toEqual(['Funn 1 - Organisasjon','Funn 2 - Internrevisjon','Funn 3 - Regelverksregister']);
   expect(result.documents).toEqual([{title:'Rutine for internrevisjon',supports:'Funn 2',included:true,pages:1}]);expect(result.warnings).toEqual([]);
   expect(result.chapters.some(c=>c.title==='Dokumentasjonsoversikt')).toBe(true);
   expect(await readableBlob(result.blob)).not.toContain('.md');expect(load).toHaveBeenCalledTimes(1);
 });
 it('merges a valid original PDF as real pages without changing the source bytes',async()=>{
   const original=await PDFDocument.create();const font=await original.embedFont(StandardFonts.Helvetica);original.addPage().drawText('Original competence certificate',{font});const bytes=await original.save();const before=new Uint8Array(bytes);
   const result=await buildCombinedPdf(input,async()=>new NodeBlob([bytes],{type:'application/pdf'}) as Blob);
   expect(result.documents[0].included).toBe(true);expect(result.documents[0].pages).toBe(1);expect(bytes).toEqual(before);expect(result.pageCount).toBeGreaterThan(5);
 });
 it('represents an unreadable original with an explicit warning, never silently omits it',async()=>{
   const result=await buildCombinedPdf(input,async()=>new NodeBlob(['%PDF-truncated'],{type:'application/pdf'}) as Blob);
   expect(result.documents[0].included).toBe(false);expect(result.documents[0].supports).toBe('Funn 2');expect(result.warnings[0]).toContain('kunne ikke flettes sikkert');
 });
 it('never labels an unapproved response as approved or exports its draft content',async()=>{
   const result=await buildCombinedPdf({...input,documents:[],findings:[{...input.findings[0],response_approved_at:null,response_text:'SECRET_UNAPPROVED_DRAFT'}]});
   expect(await readableBlob(result.blob)).not.toContain('SECRET_UNAPPROVED_DRAFT');
 });
});