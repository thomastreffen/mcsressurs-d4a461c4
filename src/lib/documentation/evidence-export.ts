import type { AttachmentCandidate } from '@/lib/response-package';
import type { DleFile, DleRecord } from '@/lib/dle/export';
import { DLE_CATEGORIES } from '@/lib/dle/export';

/** Stable external names; source/person labels remain inside the evidence. */
export function evidenceDocumentTitle(c: AttachmentCandidate): string {
  if (c.source_kind === 'organization_overview') return 'Organisasjonskart og ansvarsmatrise';
  if (c.source_kind === 'regulation') return 'Regelverksregister';
  if (c.source_kind === 'org_role') return 'Ansvarsmatrise';
  if (c.source_kind === 'competence_requirement' || c.source_kind === 'competence')
    return /\bfse\b/i.test(c.title) ? 'FSE-opplæring' : 'Kompetanseoversikt';
  if (/rutine.*internrevisjon/i.test(c.title)) return 'Rutine for internrevisjon';
  if (c.source_kind === 'internal_audit' || /internrevisjon|revisjonsreferat/i.test(c.title)) return 'Internrevisjonsreferat';
  return c.title.replace(/\.(md|markdown|pdf)$/i, '');
}

/** A missing/inaccessible source must never become exportable through its label. */
export function exportableEvidence(c: AttachmentCandidate): boolean {
  if (c.kind === 'document') return Boolean(c.storage_bucket && c.file_path);
  if (c.generated) return c.generated.rows.slice(1).some(row => row.some(value => value.trim()));
  return c.kind === 'reference' && c.status_tone !== 'alert' && Boolean(c.reference_note?.trim());
}

export function evidenceExportRecord(c: AttachmentCandidate): DleRecord | null {
  if (!exportableEvidence(c)) return null;
  const title = evidenceDocumentTitle(c);
  const id = c.document_id ? `document:${c.document_id}`
    : c.generated?.type === 'organization_overview' ? `organization:${c.generated.company_id}`
    : c.generated?.type === 'competence_overview' ? `competence:${c.generated.competence_type_id}`
    : c.source_ref_id ? `${c.source_kind}:${c.source_ref_id}` : c.key;
  const sections = c.generated ? c.generated.rows.slice(1).map(row => ({
    heading: row[0] || title,
    text: row.map((value, index) => `${c.generated?.rows[0]?.[index] || ''}: ${value}`).join('\n'),
  })) : c.kind === 'reference' ? [{ heading: c.title, text: c.reference_note || '' }] : [];
  return { id, title, sections,
    ...(c.kind === 'document' ? { original: { bucket: c.storage_bucket ?? undefined, path: c.file_path ?? undefined, filename: c.file_name, mime: c.mime_type || 'application/octet-stream' } } : {}),
  };
}

export function exportFileTitle(file: DleFile): string {
  if (file.title) return file.title;
  if (file.category !== 'attachments' && file.records.length > 1)
    return DLE_CATEGORIES.find(c => c.key === file.category)?.label || 'Dokumentasjon';
  return file.records[0]?.title || 'Dokumentasjon';
}

/** Deduplicate by source identity, not by people/role/document display labels. */
export function mergeEvidenceDocuments<T extends { file: DleFile; findingIds: string[] }>(documents: T[]): T[] {
  const result = new Map<string, T>();
  for (const document of documents) {
    const { file } = document;
    const original = file.records[0]?.original;
    const register = file.records.length > 0 && file.records.every(r => r.id.startsWith('regulation:'));
    const key = original ? `original:${original.bucket}:${original.path || original.chemicalId}`
      : register ? 'regulation:register' : `records:${file.records.map(r => r.id).sort().join('|')}`;
    const existing = result.get(key);
    if (!existing) {
      result.set(key, { ...document, file: { ...file, title: exportFileTitle(file), records: [...file.records] }, findingIds: [...new Set(document.findingIds)] });
      continue;
    }
    existing.findingIds = [...new Set([...existing.findingIds, ...document.findingIds])];
    existing.file.records = [...new Map([...existing.file.records, ...file.records].map(r => [r.id, r])).values()];
  }
  return [...result.values()];
}