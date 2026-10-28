import type { AttachmentCandidate } from '@/lib/response-package';
import type { DleRecord } from '@/lib/dle/export';
import { loadDleRecords } from '@/lib/dle/sources';
import { loadDocumentation } from '@/lib/documentation/sources';
import { findingDisplayStatus, type FindingDisplayInput } from '@/lib/inspections';
import { supabase } from '@/integrations/supabase/client';

/** Generelle dokumenttyper som kan velges manuelt i eksportfanen */
export const GENERAL_EXPORT_OPTIONS = [
  { key: 'chart', label: 'Organisasjonskart' },
  { key: 'matrix', label: 'Ansvarsmatrise' },
  { key: 'fse_training', label: 'FSE-opplæring' },
  { key: 'competence', label: 'Kompetanseoversikt' },
  { key: 'internal_control', label: 'Internkontroll' },
] as const;
export type GeneralExportKey = (typeof GENERAL_EXPORT_OPTIONS)[number]['key'];

/** Funn foreslås valgt i eksporten kun når de er ferdig behandlet/oversendt */
const EXPORT_READY_STATUSES = new Set(['ready', 'submitted', 'closed']);

/**
 * Foreslår funn for eksport basert på faktisk sakstilstand – aldri funnnummer.
 * Et funn foreslås kun når det er eksportklart (Klar for oversendelse/Oversendt/Lukket
 * via delt findingDisplayStatus) OG har koblet dokumentasjon som kan inngå i eksporten.
 */
export function suggestedFindingIds(
  findings: (FindingDisplayInput & { id: string })[],
  candidates: AttachmentCandidate[],
): string[] {
  return findings
    .filter((f) => EXPORT_READY_STATUSES.has(findingDisplayStatus(f).status) && findingExportRecords(candidates, f.id).length > 0)
    .map((f) => f.id);
}

export function findingExportRecords(candidates: AttachmentCandidate[], findingId: string): DleRecord[] {
  return candidates.filter(c=>c.finding_id===findingId && c.kind!=='reference').map(c=>({
    id:c.key,title:c.title,sections:c.generated ? c.generated.rows.map((row,i)=>({heading:i===0?row.join(' · '):'',text:i===0?'':row.join(' · ')})) : [],
    original:c.kind==='document' && c.storage_bucket && c.file_path ? {bucket:c.storage_bucket,path:c.file_path,filename:c.file_name,mime:c.mime_type??'application/octet-stream'} : undefined,
  })).filter(r=>r.original || r.sections.length);
}

/**
 * Laster eksportposter for ett valg – delt mellom forhåndsvisning og
 * tilgjengelighetssonden slik at defaultvalg og faktisk eksport aldri divergerer.
 */
export async function loadOptionRecords(
  key: string,
  companyId: string,
  inspectionId: string,
  candidates: AttachmentCandidate[],
): Promise<DleRecord[]> {
  if (key.startsWith('finding:')) return findingExportRecords(candidates, key.slice(8));
  if (key === 'internal_control') {
    const { data, error } = await (supabase as any).from('compliance_audits').select('id,title,status,source_inspection_id,report_document_id,report_markdown,performed_at').eq('company_id', companyId).is('deleted_at', null).eq('source_inspection_id', inspectionId);
    if (error) throw error;
    const ids = (data ?? []).map((r: any) => r.report_document_id).filter(Boolean);
    let docs: any[] = [];
    if (ids.length) {
      const response = await supabase.from('documents').select('id,file_name,file_path,storage_bucket,mime_type').eq('company_id', companyId).is('deleted_at', null).in('id', ids);
      if (response.error) throw response.error;
      docs = response.data ?? [];
    }
    return (data ?? []).filter((r: any) => r.status === 'completed').flatMap((r: any) => {
      const doc = docs.find((d) => d.id === r.report_document_id);
      return doc?.storage_bucket && doc?.file_path
        ? [{ id: r.id, title: r.title, sections: [], original: { bucket: doc.storage_bucket, path: doc.file_path, filename: doc.file_name, mime: doc.mime_type ?? 'application/pdf' } }]
        : r.report_markdown
          ? [{ id: r.id, title: r.title, sections: [{ heading: 'Revisjonsreferat', text: r.report_markdown }] }]
          : [];
    });
  }
  if (key === 'fse_training') return (await loadDocumentation('fse_status', companyId)).filter((r) => r.sections.length > 0);
  return loadDleRecords(key as 'chart' | 'matrix' | 'competence', companyId, []);
}

/**
 * Generelle kategorier som faktisk kan genereres med innhold for saken og brukerens
 * tilgang. Tomme kategorier forhåndsvelges ikke. `load` er injiserbar for tester.
 */
export async function availableGeneralExportKeys(
  allowed: (key: string) => boolean,
  load: (key: GeneralExportKey) => Promise<DleRecord[]>,
): Promise<GeneralExportKey[]> {
  const out: GeneralExportKey[] = [];
  for (const option of GENERAL_EXPORT_OPTIONS) {
    if (!allowed(option.key)) continue;
    try {
      if ((await load(option.key)).length > 0) out.push(option.key);
    } catch {
      // Kategorien kunne ikke sondes – forhåndsvelg ikke, brukeren kan fortsatt hake av manuelt
    }
  }
  return out;
}
