import { supabase } from "@/integrations/supabase/client";
import { fetchSdsUrl } from "@/hooks/useChemicals";
import type { AttachmentCandidate } from "@/lib/response-package";
import type { DleCategory, DleFile, DleRecord } from "./export";
import { generateDlePdf } from "./export";
import { externalDocumentBlob } from "@/lib/external-document";
import { relevanceDocumentation } from "@/lib/requirement-relevance";
import { REQUIREMENT_STATUS_META, type RequirementStatus } from "@/lib/compliance";
const sb = supabase as any;

async function rows(table: string, company: string, columns: string, deleted = true) {
  let q = sb.from(table).select(columns).eq("company_id", company);
  if (deleted) q = q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
const section = (heading: string, value: unknown) => ({ heading, text: String(value ?? "") });

export async function loadDleRecords(category: DleCategory, company: string, attachments: AttachmentCandidate[]): Promise<DleRecord[]> {
  if (category === "attachments") return attachments.filter((a, index, all) => a.kind === "document" && a.storage_bucket && a.file_path && all.findIndex((b) => b.storage_bucket === a.storage_bucket && b.file_path === a.file_path) === index).map((a) => ({
    id: a.key, title: a.title, sections: [], original: { bucket: a.storage_bucket ?? undefined, path: a.file_path ?? undefined, filename: a.file_name, mime: a.mime_type ?? "application/octet-stream" },
  }));
  if (["chart", "matrix", "roles"].includes(category)) {
    const [roles, employees] = await Promise.all([
      rows("compliance_org_roles", company, "id,title,person_id,additional_person_ids,deputy_person_id,reports_to_id,responsibilities,tasks,authority,is_active,sort_order", false),
      sb.from("employment_profiles").select("person_id,people(full_name,is_active)").eq("company_id", company).eq("include_in_hms_people", true).is("archived_at", null),
    ]);
    if (employees.error) throw employees.error;
    const names = new Map((employees.data ?? []).filter((e: any) => e.people?.is_active !== false).map((e: any) => [e.person_id, e.people?.full_name]));
    const name = (id: string) => String(names.get(id) ?? "Ikke registrert i ansattgrunnlaget");
    const active = roles.filter((r: any) => r.is_active !== false).sort((a: any, b: any) => a.sort_order - b.sort_order);
    return active.map((r: any) => ({ id: r.id, parentId: r.reports_to_id, title: r.title, sections: [
      section("Ansvarlige", [r.person_id, ...(r.additional_person_ids ?? [])].filter(Boolean).map(name).join(", ") || "Ikke tildelt"),
      section("Stedfortreder", r.deputy_person_id ? name(r.deputy_person_id) : "Ikke tildelt"),
      ...(category === "chart" ? [section("Rapporterer til", active.find((p: any) => p.id === r.reports_to_id)?.title ?? "Øverste nivå")] : [section("Ansvar", r.responsibilities), ...(category === "roles" ? [section("Oppgaver", r.tasks), section("Myndighet", r.authority)] : [])]),
    ] }));
  }
  if (category === "handbook" || category === "fse") {
    const handbooks = await rows("hms_handbooks", company, "id,title,current_version_id,status");
    const versions = handbooks.map((h: any) => h.current_version_id).filter(Boolean);
    if (!versions.length) return [];
    const { data: versionRows, error: versionError } = await sb.from("hms_handbook_versions").select("id,version_number").in("id", versions);
    if (versionError) throw versionError;
    const { data, error } = await sb.from("hms_handbook_sections").select("id,heading,body,ordering,version_id").in("version_id", versions).order("ordering");
    if (error) throw error;
    return (data ?? []).filter((s: any) => category !== "fse" || /fse|elsikkerhet|strømulykke|arbeid.*spenning/i.test(s.heading)).map((s: any) => ({
      id: s.id, title: s.heading, version: `v${versionRows?.find((v: any) => v.id === s.version_id)?.version_number ?? "?"}`, sections: [section(handbooks.find((h: any) => h.current_version_id === s.version_id)?.title ?? "Håndbok", s.body)],
    }));
  }
  if (category === "competence") {
    const [employees, competences, types, requirements] = await Promise.all([
      sb.from("employment_profiles").select("person_id,people(full_name,is_active)").eq("company_id", company).eq("include_in_hms_people", true).is("archived_at", null),
      rows("compliance_competences", company, "id,person_id,competence_type_id,type_label,issuer,issued_at,expires_at"),
      rows("compliance_competence_types", company, "id,name", false),
      sb.rpc("compliance_requirement_status_details", { _company_id: company, _person_id: null }),
    ]);
    if (employees.error) throw employees.error;
    if (requirements.error) throw requirements.error;
    return (employees.data ?? []).filter((e: any) => e.people?.is_active !== false).map((e: any) => ({ id: e.person_id, title: e.people?.full_name ?? "Ansatt", sections: [
      ...competences.filter((c: any) => c.person_id === e.person_id).map((c: any) => section(types.find((t: any) => t.id === c.competence_type_id)?.name ?? c.type_label ?? "Kompetanse", `Utsteder: ${c.issuer ?? "Ikke oppgitt"}\nUtstedt: ${c.issued_at ?? "Ikke oppgitt"}\nGyldig til: ${c.expires_at ?? "Ikke oppgitt"}`)),
      ...(requirements.data ?? []).filter((r: any) => r.person_id === e.person_id).map((r: any) => section(types.find((t: any) => t.id === r.competence_type_id)?.name ?? "Kompetansekrav", r.status === "not_relevant" ? relevanceDocumentation(r) : `Kravstatus: ${REQUIREMENT_STATUS_META[r.status as RequirementStatus]?.label ?? r.status}`)),
    ] }));
  }
  if (category === "chemicals" || category === "sds") {
    const chemicals = await rows("hms_chemicals", company, "id,product_name,supplier,usage_area,h_statements,p_statements,ppe_requirements,first_aid,storage_requirements,waste_handling,sds_filename,sds_revision_date,sds_path");
    return chemicals.filter((c: any) => category !== "sds" || c.sds_filename).map((c: any) => ({ id: c.id, version: c.sds_revision_date ? `SDS ${c.sds_revision_date}` : undefined, title: category === "sds" ? `SDS ${c.product_name}${c.sds_revision_date ? ` rev${c.sds_revision_date}` : ""}` : c.product_name,
      original: category === "sds" ? { chemicalId: c.id, filename: c.sds_filename, mime: "application/pdf" } : undefined,
      sections: [section("Leverandør", c.supplier), section("Bruksområde", c.usage_area), section("Fareutsagn", (c.h_statements ?? []).join("\n")), section("Sikkerhetsutsagn", (c.p_statements ?? []).join("\n")), section("Verneutstyr", c.ppe_requirements), section("Førstehjelp", c.first_aid), section("Lagring", c.storage_requirements), section("Avfall", c.waste_handling)],
    }));
  }
  if (category === "incidents") {
    const incidents = await rows("hms_incidents", company, "id,title,incident_type,occurred_at,description,location,status,proposed_action,closure_notes");
    return incidents.map((r: any) => ({ id: r.id, title: `${r.title} ${r.occurred_at.slice(0, 10)}`, sections: [section("Type / status", `${r.incident_type} / ${r.status}`), section("Sted", r.location), section("Beskrivelse", r.description), section("Foreslått tiltak", r.proposed_action), section("Avslutning", r.closure_notes)] }));
  }
  const submissions = await rows("hms_submissions", company, "id,title,kind,status,submitted_at,location,template_snapshot");
  const selected = submissions.filter((s: any) => s.status !== "draft" && (category === "sja" ? s.kind === "sja" : /vernerunde/i.test(`${s.title} ${s.template_snapshot?.name} ${s.template_snapshot?.category}`)));
  if (!selected.length) return [];
  const { data: answers, error } = await sb.from("hms_submission_answers").select("submission_id,item_id,value").in("submission_id", selected.map((s: any) => s.id));
  if (error) throw error;
  return selected.map((s: any) => ({ id: s.id, version: `Mal v${s.template_snapshot?.template_version ?? "?"} / ${s.submitted_at ?? "dato ikke registrert"}`, title: s.title ?? s.template_snapshot?.name ?? "Skjema", sections: [section("Dato / status", `${s.submitted_at?.slice(0, 10) ?? ""} / ${s.status}`), section("Sted", s.location), ...(s.template_snapshot?.sections ?? []).flatMap((part: any) => (part.items ?? []).map((item: any) => {
    const value = (answers ?? []).find((a: any) => a.submission_id === s.id && a.item_id === item.id)?.value;
    return section(item.label, typeof value === "object" && value !== null ? JSON.stringify(value) : value);
  }))] }));
}

export async function prepareDleFile(file: DleFile, company: string, date: string): Promise<Blob> {
  const original = file.records[0]?.original;
  if (!original) return generateDlePdf(file, company, date);
  let url: string;
  if (original.chemicalId) url = (await fetchSdsUrl({ chemical_id: original.chemicalId })).url;
  else {
    if (!original.bucket || !original.path) throw new Error("Originalfilen mangler");
    const { data, error } = await supabase.storage.from(original.bucket).createSignedUrl(original.path, 60);
    if (error || !data?.signedUrl) throw error ?? new Error("Ingen tilgang til originalfilen");
    url = data.signedUrl;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Kunne ikke hente originalfilen");
  const blob = await response.blob();
  if (!blob.size) throw new Error("Originalfilen er tom");
  return externalDocumentBlob(blob, original.filename, original.mime, file.records[0].title, company, date);
}
