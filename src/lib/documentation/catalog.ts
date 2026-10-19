import type { DleCategory, DleRecord } from '@/lib/dle/export';
export const CONTENT = [
  { group: 'Organisasjon og ansvar', key: 'chart', label: 'Organisasjonskart', source: 'chart', module: 'organisation' },
  { group: 'Organisasjon og ansvar', key: 'matrix', label: 'Ansvarsmatrise', source: 'matrix', module: 'organisation' },
  { group: 'Organisasjon og ansvar', key: 'roles', label: 'Roller og myndighet', source: 'roles', module: 'organisation' },
  { group: 'HMS', key: 'handbook', label: 'HMS-håndbok', source: 'handbook', module: 'hms' },
  { group: 'HMS', key: 'chapters', label: 'Utvalgte HMS-kapitler', source: 'handbook', module: 'hms' },
  { group: 'HMS', key: 'fse', label: 'FSE / elsikkerhet', source: 'fse', module: 'hms' },
  { group: 'HMS', key: 'emergency', label: 'Beredskap', source: 'handbook', module: 'hms' },
  { group: 'HMS', key: 'rounds', label: 'Vernerunder', source: 'rounds', module: 'hms' },
  { group: 'HMS', key: 'incidents', label: 'Avvik / RUH', source: 'incidents', module: 'hms' },
  { group: 'Kompetanse', key: 'competence', label: 'Kompetanseoversikt', source: 'competence', module: 'employees' },
  { group: 'Kompetanse', key: 'fse_status', label: 'FSE-status', source: 'competence', module: 'employees' },
  { group: 'Kompetanse', key: 'courses', label: 'Opplæring / kurs', source: 'competence', module: 'employees' },
  { group: 'Risiko', key: 'sja', label: 'SJA', source: 'sja', module: 'hms' },
  { group: 'Risiko', key: 'risks', label: 'Risikovurderinger', source: 'sja', module: 'hms' },
  { group: 'Risiko', key: 'checklists', label: 'Sjekklister', source: 'sja', module: 'hms' },
  { group: 'Kjemikalier', key: 'chemicals', label: 'Stoffkartotek', source: 'chemicals', module: 'hms' },
  { group: 'Kjemikalier', key: 'selected_chemicals', label: 'Valgte kjemikalier', source: 'chemicals', module: 'hms' },
  { group: 'Kjemikalier', key: 'sds', label: 'SDS', source: 'sds', module: 'hms' },
  { group: 'Prosjekt', key: 'project_docs', label: 'Prosjektspesifikk dokumentasjon', source: 'attachments', module: 'documents' },
] as const;
export type ContentKey = typeof CONTENT[number]['key'];
export type ExportRecord = DleRecord & { date?: string; status?: string; projectId?: string; personId?: string; userId?: string };
export interface ExportFilters { from: string; to: string; project: string; person: string; status: string }
export const PRESETS: Record<string, ContentKey[]> = {
  'DLE-tilsyn': ['chart', 'matrix', 'roles', 'handbook', 'fse', 'competence', 'sja', 'rounds', 'chemicals', 'sds'],
  'Intern revisjon': ['chart', 'matrix', 'roles', 'competence', 'incidents', 'risks', 'checklists'],
  'HMS-revisjon': ['handbook', 'emergency', 'rounds', 'incidents', 'sja', 'chemicals', 'sds'],
  'Kundeforespørsel': ['project_docs', 'sja', 'checklists'],
};
export function filterExportRecords(records: ExportRecord[], filter: ExportFilters, userId?: string | null) {
  return records.filter(r => (!filter.from || !r.date || r.date.slice(0,10) >= filter.from)
    && (!filter.to || !r.date || r.date.slice(0,10) <= filter.to)
    && (!filter.project || r.projectId === filter.project)
    && (!filter.person || r.personId === filter.person || (!!userId && r.userId === userId))
    && (!filter.status || r.status === filter.status));
}
export function exportCategory(key: ContentKey): DleCategory { return CONTENT.find(c => c.key === key)?.source ?? 'attachments'; }
