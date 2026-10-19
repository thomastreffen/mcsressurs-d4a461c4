import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { slugForFile } from '@/lib/response-package';
import { externalText } from '@/lib/dle/export';

export type ExportValue = string | number | boolean | Date | null | undefined;
export type ExportRow = Record<string, ExportValue>;
export type LocalExportFormat = 'pdf' | 'xlsx' | 'csv' | 'zip';
export interface ExportChartNode { id: string; parentId?: string | null; title: string; people: string }
export interface LocalExportSnapshot {
  title: string; company: string; actor: string; date: Date; filters: Record<string, string>;
  rows: ExportRow[]; columns: string[]; version?: string; chart?: ExportChartNode[];
}
export function selectExportRows(rows: ExportRow[], indices: number[], columns: string[]): ExportRow[] {
  return indices.filter((i) => i >= 0 && i < rows.length).map((i) => Object.fromEntries(columns.map((c) => [c, rows[i][c] ?? null])));
}
export function exportCell(value: ExportValue): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
  return String(value ?? '');
}
export function csvCell(value: ExportValue): string {
  let text = exportCell(value);
  // Prevent a spreadsheet interpreting untrusted text as a formula.
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function buildLocalCsv(snapshot: LocalExportSnapshot): string {
  return '\uFEFF' + [snapshot.columns.map(csvCell).join(';'), ...snapshot.rows.map((r) => snapshot.columns.map((c) => csvCell(r[c])).join(';'))].join('\r\n');
}
export function buildLocalWorkbook(snapshot: LocalExportSnapshot) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([snapshot.columns, ...snapshot.rows.map((r) => snapshot.columns.map((c) => r[c] ?? null))], { cellDates: true, dateNF: 'dd"."mm"."yyyy' });
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: snapshot.rows.length, c: Math.max(0, snapshot.columns.length - 1) } }) };
  sheet['!cols'] = snapshot.columns.map((c) => ({ wch: Math.min(45, Math.max(15, c.length + 3)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  return workbook;
}
export function buildLocalPdf(snapshot: LocalExportSnapshot): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: snapshot.columns.length > 5 ? 'landscape' : 'portrait' });
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  let y = 18;
  const write = (text: string, size = 10, bold = false, x = 15, maxWidth = width - 30) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(externalText(text), maxWidth);
    for (const line of lines) {
      if (y > height - 22) { pdf.addPage(); y = 18; }
      pdf.text(line, x, y); y += size * 0.45 + 1;
    }
    y += 2;
  };
  write(snapshot.company, 16, true); write(snapshot.title, 13, true);
  write(`Generert ${snapshot.date.toLocaleString('nb-NO')} av ${snapshot.actor}`, 9);
  if (snapshot.version) write(`Dokumentversjon: ${snapshot.version}`, 9);
  write(Object.entries(snapshot.filters).map(([k,v]) => `${k}: ${v}`).join(' | ') || 'Hele visningen', 9);
  write(`${snapshot.rows.length} poster`, 9);
  if (snapshot.chart?.length) {
    write('Organisasjonskart', 12, true);
    const seen = new Set<string>();
    const branch = (node: ExportChartNode, depth: number) => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      const x = 15 + Math.min(depth, 6) * 10;
      if (y > height - 45) { pdf.addPage(); y = 18; }
      write(node.title, 11, true, x, width - x - 20);
      write(node.people, 9, false, x, width - x - 20);
      pdf.line(x, y, width - 15, y); y += 5;
      snapshot.chart?.filter((n) => n.parentId === node.id).forEach((n) => branch(n, depth + 1));
    };
    snapshot.chart.filter((n) => !n.parentId || !snapshot.chart?.some((p) => p.id === n.parentId)).forEach((n) => branch(n, 0));
    snapshot.chart.forEach((n) => branch(n, 0));
    write('Ansvars- og myndighetsoversikt', 12, true);
  }
  // A row is kept on one page where possible; long records continue naturally.
  for (const row of snapshot.rows) {
    if (y > height - 55) { pdf.addPage(); y = 18; }
    if (snapshot.columns.length <= 4 && !snapshot.chart?.length) {
      const start = y;
      const cellWidth = (width - 30) / snapshot.columns.length;
      const values = snapshot.columns.map((c) => pdf.splitTextToSize(externalText(exportCell(row[c])), cellWidth - 3) as string[]);
      const maxLines = Math.max(...values.map((v)=>v.length));
      if (start + 12 + maxLines * 5 > height - 22) {
        snapshot.columns.forEach((c)=>write(`${c}: ${exportCell(row[c])}`,9));
        pdf.line(15,y,width-15,y); y+=7;
        continue;
      }
      snapshot.columns.forEach((column, i) => {
        const x = 15 + i * ((width - 30) / snapshot.columns.length);
        y = start;
        write(column, 8, true, x, (width - 30) / snapshot.columns.length - 3);
        write(exportCell(row[column]), 9, false, x, (width - 30) / snapshot.columns.length - 3);
      });
      y = Math.max(y, start + 12 + maxLines * 5);
    } else {
      write(exportCell(row[snapshot.columns[0]]), 11, true);
      snapshot.columns.slice(1).forEach((c) => write(`${c}: ${exportCell(row[c])}`, 9));
    }
    pdf.line(15, y, width - 15, y); y += 7;
  }
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) { pdf.setPage(p); pdf.setFontSize(8); pdf.text(`${snapshot.company} · ${p} / ${total}`, 15, height - 10); }
  return pdf.output('blob');
}
export async function generateLocalExport(snapshot: LocalExportSnapshot, format: LocalExportFormat) {
  const stem = `${slugForFile(snapshot.company)}_${slugForFile(snapshot.title)}_${snapshot.date.toISOString().slice(0,10)}`;
  if (format === 'csv') return { name: `${stem}.csv`, blob: new Blob([buildLocalCsv(snapshot)], { type: 'text/csv;charset=utf-8' }) };
  if (format === 'xlsx') return { name: `${stem}.xlsx`, blob: new Blob([XLSX.write(buildLocalWorkbook(snapshot), { type: 'array', bookType: 'xlsx', cellDates: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
  if (format === 'pdf') return { name: `${stem}.pdf`, blob: buildLocalPdf(snapshot) };
  const zip = new JSZip();
  for (const type of ['pdf', 'xlsx', 'csv'] as const) { const file = await generateLocalExport(snapshot, type); zip.file(file.name, file.blob); }
  return { name: `${stem}.zip`, blob: await zip.generateAsync({ type: 'blob', compression: 'STORE' }) };
}