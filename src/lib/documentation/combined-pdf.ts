import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { buildDleFiles, type DleFile } from '@/lib/dle/export';
import { prepareDleFile } from '@/lib/dle/sources';
import { findingDisplayStatus, type FindingDisplayInput } from '@/lib/inspections';
import { slugForFile } from '@/lib/response-package';
import { markdownSections } from '../../../supabase/functions/_shared/external-document';

export interface CombinedFinding extends FindingDisplayInput {
  id: string; finding_number: number; title: string; original_text?: string | null;
  response_text?: string | null;
}
export interface CombinedDocument { file: DleFile; findingIds: string[] }
export interface CombinedPdfInput {
  company: string; title: string; authority?: string | null; caseNumber?: string | null;
  date: string; recipient?: string | null; intro?: string; closing?: string;
  findings: CombinedFinding[]; documents: CombinedDocument[];
}
export interface CombinedPdfResult {
  name: string; blob: Blob; pageCount: number;
  chapters: { title: string; page: number }[];
  documents: { title: string; supports: string; included: boolean; pages: number }[];
  warnings: string[];
}

/** Read-only assembly: never persists snapshots, logs events or invokes mail. */
export async function buildCombinedPdf(input: CombinedPdfInput, load: (file: DleFile) => Promise<Blob> = f => prepareDleFile(f, input.company, input.date)): Promise<CombinedPdfResult> {
  const findings = [...input.findings].sort((a,b) => a.finding_number - b.finding_number);
  const prepared: { spec: CombinedDocument; pdf: PDFDocument | null }[] = [];
  const warnings: string[] = [];
  // Each selected source remains represented even when an original PDF is unreadable.
  for (const spec of input.documents) {
    let pdf: PDFDocument | null = null;
    const blob = await load(spec.file);
    try {
      pdf = await PDFDocument.load(new Uint8Array(await blobBytes(blob)), { updateMetadata: false });
      if (pdf.getPageCount() === 0) throw new Error('Tom PDF');
    } catch {
      warnings.push(`${spec.file.records.map(r => clean(r.title)).join(', ')}: kunne ikke flettes sikkert; dokumentreferanse beholdt.`);
    }
    prepared.push({ spec, pdf });
  }
  const supportLabel = (ids: string[]) => {
    const numbers = findings.filter(f => ids.includes(f.id)).map(f => f.finding_number);
    return numbers.length ? `Funn ${numbers.join(', ')}` : 'Saksgenerell dokumentasjon';
  };
  const documentList = prepared.map(({spec,pdf}) => ({ title: clean(spec.file.records.map(r => r.title).join(', ')), supports: supportLabel(spec.findingIds), included: Boolean(pdf), pages: pdf?.getPageCount() ?? 0 }));
  const segments: { title: string; pdf: PDFDocument }[] = [];
  const makePage = async (title: string, blocks: { heading: string; text: string }[]) => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' }); let y = 22;
    const write = (text: string, size: number, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
      for (const line of pdf.splitTextToSize(clean(text), 174) as string[]) {
        if (y > 270) { pdf.addPage(); y = 22; }
        pdf.text(line, 18, y); y += size * 0.46 + 1.2;
      }
      y += 3;
    };
    write(input.company, 10); write(title, 20, true);
    for (const block of blocks) {
      if (y > 244) { pdf.addPage(); y = 22; }
      if (block.heading) write(block.heading, 12, true);
      if (block.text) for (const section of markdownSections(block.text)) {
        if (section.heading) write(section.heading, 11, true);
        if (section.text.trim()) write(section.text.trim(), 10);
      }
    }
    return PDFDocument.load(pdf.output('arraybuffer'));
  };
  const add = async (title: string, blocks: { heading: string; text: string }[]) => segments.push({ title, pdf: await makePage(title,blocks) });
  const emitted = new Set<number>();
  const addDocuments = async (findingId?: string) => {
    for (let index=0;index<prepared.length;index++) {
      const {spec,pdf} = prepared[index];
      if (emitted.has(index) || (findingId ? !spec.findingIds.includes(findingId) : spec.findingIds.some(id => findings.some(f => f.id===id)))) continue;
      emitted.add(index);
      const entry = documentList[index];
      if (pdf) segments.push({title:entry.title,pdf});
      else await add(entry.title, [{heading:'Dokumentasjon',text:`Støtter: ${entry.supports}\nOriginaldokumentet kunne ikke flettes sikkert. Dokumentet er kun representert ved denne referansen, og må leveres separat etter kontroll.`}]);
    }
  };
  for (const f of findings) {
    const docs = documentList.filter((_,i) => prepared[i].spec.findingIds.includes(f.id));
    await add(`Funn ${f.finding_number} – ${f.title}`, [
      {heading:'Avvik / myndighetens beskrivelse',text:f.original_text || 'Beskrivelse ikke registrert'},
      {heading:'Godkjent svartekst',text:f.response_approved_at ? f.response_text || 'Svartekst mangler' : 'Svartekst er ikke godkjent. Ingen ugodkjent tekst inkludert.'},
      {heading:'Status og retting',text:`${findingDisplayStatus(f).label}\nForhold rettet: ${f.condition_corrected_at || 'Ikke bekreftet'}\nDokumentasjon komplett: ${f.documentation_complete_at || 'Ikke bekreftet'}`},
      {heading:'Tilhørende dokumentasjon',text:docs.map(d=>`${d.title} (${d.included?'innfelt':'kun referanse'})`).join('\n') || 'Ingen dokumentasjon valgt'},
    ]);
    await addDocuments(f.id);
  }
  if (prepared.some((s,i)=>!emitted.has(i))) {
    await add('Saksgenerell dokumentasjon', [{heading:'Dokumenter',text:documentList.filter((_,i)=>!emitted.has(i)).map(d=>d.title).join('\n')}]);
    await addDocuments();
  }
  await add('Dokumentasjonsoversikt', documentList.map(d=>({heading:d.title,text:`Støtter: ${d.supports}\n${d.included ? `Inkludert: ${d.pages} PDF-sider` : 'Kun dokumentreferanse – originalen må kontrolleres og leveres separat'}`})));
  const cover = await makePage('Svarpakke – tilsyn og revisjon', [
    {heading:input.authority || 'Tilsyn / revisjon',text:input.title},
    {heading:'Saksnummer',text:input.caseNumber || 'Ikke registrert'},
    {heading:'Dato',text:input.date},
    ...(input.recipient ? [{heading:'Kontakt / mottaker',text:input.recipient}] : []),
    ...(input.intro ? [{heading:'Innledning',text:input.intro}] : []),
    ...(warnings.length ? [{heading:'Dokumentbegrensninger',text:warnings.join('\n')}] : []),
  ]);
  if (input.closing) await add('Avslutning',[{heading:'',text:input.closing}]);
  let tocPages = 1; let toc: PDFDocument | undefined; let chapters: {title:string;page:number}[] = [];
  for (let attempt=0;attempt<8;attempt++) {
    let page = cover.getPageCount()+tocPages+1;
    chapters=segments.map(segment=>{const entry={title:clean(segment.title),page};page+=segment.pdf.getPageCount();return entry;});
    toc=await makePage('Innholdsfortegnelse',chapters.map(c=>({heading:'',text:`${c.title} — side ${c.page}`})));
    if (toc.getPageCount()===tocPages) break;
    tocPages=toc.getPageCount();
  }
  if (!toc) throw new Error('Kunne ikke lage innholdsfortegnelse');
  const output = await PDFDocument.create(); output.setTitle(`Svarpakke ${input.caseNumber || input.title}`); output.setAuthor(input.company);
  for (const pdf of [cover,toc,...segments.map(s=>s.pdf)]) for (const page of await output.copyPages(pdf,pdf.getPageIndices())) output.addPage(page);
  // Do not stamp/re-render originals: their visual content remains untouched.
  const bytes = await output.save();
  return {name:`${slugForFile(input.company)}_Svarpakke_${slugForFile(input.caseNumber || input.title)}_${input.date}.pdf`,blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),pageCount:output.getPageCount(),chapters,documents:documentList,warnings};
}

function clean(text: string): string {
  return text.replace(/\.(md|markdown)\b/gi,'').replace(/\*\*|__/g,'').replace(/<[^>]*>/g,'').replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\u0020-\u00ff\n\r\t]/g,' ');
}

async function blobBytes(blob:Blob):Promise<ArrayBuffer> {
  if(typeof blob.arrayBuffer==='function')return blob.arrayBuffer();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new Error('Kunne ikke lese PDF'));reader.onerror=reject;reader.readAsArrayBuffer(blob);});
}

export function candidateFiles(candidates: import('@/lib/response-package').AttachmentCandidate[], company: string, date: string): CombinedDocument[] {
  return candidates.map(c=>{
    const records: import('@/lib/dle/export').DleRecord[] = c.kind==='reference'
      ? [{id:c.key,title:c.title,sections:[{heading:'Dokumentreferanse',text:c.reference_note || c.source_label}]}]
      : [{id:c.key,title:c.title,sections:c.generated?.rows.map((row,i)=>({heading:i===0?row.join(' / '):'',text:i===0?'':row.join(' / ')})) || [],original:c.kind==='document' && c.storage_bucket && c.file_path ? {bucket:c.storage_bucket,path:c.file_path,filename:c.file_name,mime:c.mime_type || 'application/octet-stream'} : undefined}];
    return {file:buildDleFiles('attachments',records,true,company,date)[0],findingIds:c.finding_id?[c.finding_id]:[]};
  });
}