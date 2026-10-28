import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { defaultInspectionExportChoices, suggestedFindingIds } from '@/lib/documentation/inspection';
import { buildCombinedPdf, candidateFiles } from '@/lib/documentation/combined-pdf';
import { evidenceDocumentTitle, evidenceExportRecord, mergeEvidenceDocuments } from '@/lib/documentation/evidence-export';
import { generateDlePdf } from '@/lib/dle/export';
import type { DleFile } from '@/lib/dle/export';
import { externalDocumentBlob } from '@/lib/external-document';
import type { AttachmentCandidate } from '@/lib/response-package';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useChemicals', () => ({ fetchSdsUrl: vi.fn() }));
const ready = { status: 'new', responsible_person_id: 'rune', response_approved_at: '2026-10-28', condition_corrected_at: '2026-10-28', documentation_complete_at: '2026-10-28', documentation_status: 'complete' };
const findings = Array.from({ length: 7 }, (_, i) => ({ ...ready, id: `f${i+1}`, finding_number: i+1, title: ['Organisasjon', 'Internrevisjon', 'Regelverk'][i] || 'Uferdig', response_text: 'Dokumentasjon etablert', ...(i > 2 ? { response_approved_at: null, documentation_complete_at: null } : {}) }));
const base: AttachmentCandidate = { key: 'org', finding_id: 'f1', kind: 'generated', evidence_id: 'e1', document_id: null, file_name: '', mime_type: null, file_size: null, storage_bucket: null, file_path: null, source_kind: 'organization_overview', source_label: 'Organisasjon', date: '2026-10-28', status_label: '7 aktive roller', status_tone: 'ok', title: 'Rune Ørbeck', generated: { type: 'organization_overview', company_id: 'service', rows: [['Rolle','Ansvarlig'], ['Daglig leder','Rune Ørbeck']] } };
const routine: AttachmentCandidate = { ...base, key: 'routine', finding_id: 'f2', kind: 'document', generated: undefined, document_id: 'd2', source_kind: 'document', title: 'Rutine for internrevisjon versjon 1.md', file_name: 'routine.md', mime_type: 'text/markdown', storage_bucket: 'private', file_path: 'routine.md' };
const regulation: AttachmentCandidate = { ...base, key: 'reg', finding_id: 'f3', kind: 'reference', generated: undefined, source_kind: 'regulation', source_ref_id: 'fek', title: 'FEK', reference_note: 'Type: Forskrift\nRelevans: Registrert virksomhet\nOffisiell kilde: Lovdata\nKontrollert: 27.10.2026' };
const competence: AttachmentCandidate = { ...base, key: 'fse', finding_id: 'f6', source_kind: 'competence_requirement', title: 'FSE kompetanseoversikt', generated: { type: 'competence_overview', competence_type_id: 'fse', rows: [['Ansatt','Status'],['Emil','Gyldig']] } };
const candidates = [base, routine, regulation, competence];

describe('Finding-first case 63210 export', () => {
  it('defaults to documented ready findings 1/2/3, never unfinished 4–7 or general competence/FSE', () => {
    expect(defaultInspectionExportChoices(findings, candidates)).toEqual(['finding:f1','finding:f2','finding:f3']);
    const choices = new Set(suggestedFindingIds(findings, candidates));
    const docs = candidateFiles(candidates.filter(c => choices.has(c.finding_id || '')), 'MCS Service AS', '2026-10-28');
    expect(docs.map(d => d.file.title)).toEqual(['Organisasjonskart og ansvarsmatrise','Rutine for internrevisjon','Regelverksregister']);
    expect(docs.flatMap(d => d.file.records.map(r => r.id))).not.toContain('competence:fse');
  });
  it('uses evidence readiness, never finding numbers, for generated organization and regulation sources', () => {
    const renumbered = [{...ready,id:'f1',finding_number:77},{...ready,id:'f3',finding_number:88}];
    expect(suggestedFindingIds(renumbered, [base,regulation])).toEqual(['f1','f3']);
    expect(suggestedFindingIds(findings, [{...base,kind:'reference',generated:undefined,status_tone:'alert',reference_note:'Old 7-role note'}, {...regulation,status_tone:'alert',reference_note:null}])).toEqual([]);
  });
  it('does not preselect any broad general category, including populated organization or FSE', () => {
    const choices = defaultInspectionExportChoices(findings, candidates);
    for (const key of ['chart','matrix','competence','fse_training','internal_control']) expect(choices).not.toContain(key);
    expect(defaultInspectionExportChoices(findings, [])).toEqual([]);
  });
  it('uses shared live documentation coverage, not stale raw none on a fully treated finding', () => {
    const f = {...findings[0],documentation_status:'none'};
    expect(defaultInspectionExportChoices([f],[base],{f1:'complete'})).toEqual(['finding:f1']);
    expect(defaultInspectionExportChoices([f],[base],{f1:'gaps'})).toEqual([]);
  });
  it('deduplicates shared sources by logical identity and unions finding support', () => {
    const docs = candidateFiles([base,{...base,key:'org2',finding_id:'f2'},routine,{...routine,key:'routine2',finding_id:'f3'},regulation,{...regulation,key:'reg2',source_ref_id:'fse',title:'FSE',reference_note:'Forskrift om sikkerhet'}], 'MCS', '2026-10-28');
    expect(docs).toHaveLength(3);
    expect(docs[0].findingIds).toEqual(['f1','f2']);
    expect(docs[1].findingIds).toEqual(['f2','f3']);
    expect(docs[2].file.records).toHaveLength(2);
  });
  it('uses semantic titles for company-wide source records rather than person/role names', () => {
    const file: DleFile = {key:'chart',category:'chart',name:'chart.pdf',path:'chart.pdf',records:[{id:'r1',title:'Daglig leder Rune Ørbeck',sections:[]},{id:'r2',title:'John Mandt',sections:[]}]};
    expect(mergeEvidenceDocuments([{file,findingIds:[]}])[0].file.title).toBe('Organisasjonskart');
    expect(evidenceDocumentTitle({...base,source_kind:'competence',title:'Lift – Emil Strid'})).toBe('Kompetanseoversikt');
  });
  it('builds one targeted PDF with semantic TOC, historical evidence preserved and no general sections', async () => {
    const load = vi.fn(async file => file.records[0]?.original
      ? externalDocumentBlob(new NodeBlob(['# Rutine\nÅrlig internrevisjon.\n## Historisk kontroll 27.10.2026\nStatus registrert ved revisjon.'], {type:'text/markdown'}) as Blob, 'routine.md', 'text/markdown', file.records[0].title, 'MCS Service AS', '2026-10-28')
      : generateDlePdf(file, 'MCS Service AS', '2026-10-28'));
    const ids = suggestedFindingIds(findings,candidates);
    const result = await buildCombinedPdf({company:'MCS Service AS',title:'DLE 63210',caseNumber:'63210',date:'2026-10-28',findings:findings.filter(f=>ids.includes(f.id)),documents:candidateFiles(candidates.filter(c=>ids.includes(c.finding_id || '')),'MCS Service AS','2026-10-28')},load);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.chapters.filter(c=>c.title.startsWith('Funn')).map(c=>c.title)).toEqual(['Funn 1 - Organisasjon','Funn 2 - Internrevisjon','Funn 3 - Regelverk']);
    expect(result.documents.map(d=>d.title)).toEqual(['Organisasjonskart og ansvarsmatrise','Rutine for internrevisjon','Regelverksregister']);
    expect(result.chapters.map(c=>c.title)).not.toContain('Saksgenerell dokumentasjon');
    expect(result.documents.every(d=>d.included)).toBe(true);
    expect(result.warnings).toEqual([]); expect(load).toHaveBeenCalledTimes(3);
    expect(evidenceExportRecord(regulation)?.sections[0].text).toContain('Kontrollert: 27.10.2026');
  });
});