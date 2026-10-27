import type { OrgRole } from "@/hooks/useCompliance";
import type { FindingEvidence } from "@/hooks/useInspections";
import type { AttachmentCandidate } from "@/lib/response-package";

export function activeOrganizationRoles(roles: OrgRole[], today = new Date().toISOString().slice(0, 10)) {
  return roles.filter(r => r.is_active !== false && (!r.valid_from || r.valid_from <= today) && (!r.valid_to || r.valid_to >= today))
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "nb"));
}

export function organizationOverviewCandidate(
  evidence: FindingEvidence,
  company: { id: string; name: string } | null,
  roles: OrgRole[],
  people: { person_id: string; full_name: string; department_name: string | null }[],
  available: boolean,
): AttachmentCandidate {
  const active = activeOrganizationRoles(roles);
  const valid = available && !!company && evidence.ref_id === company.id && active.length > 0;
  const title = company ? `Organisasjonsoversikt – ${company.name}` : evidence.label ?? "Organisasjonsoversikt";
  const name = (id: string | null | undefined) => people.find(p => p.person_id === id)?.full_name ?? "Ikke tildelt / ikke tilgjengelig";
  return {
    key: `org:${evidence.id}`, finding_id: evidence.finding_id, evidence_id: evidence.id,
    kind: valid ? "generated" : "reference", document_id: null, file_name: title,
    mime_type: valid ? "text/csv" : null, file_size: null, storage_bucket: null, file_path: null,
    source_kind: "organization_overview", source_label: "Organisasjon & ansvar – samlet oversikt",
    date: new Date().toISOString(), title,
    status_label: valid ? `${active.length} aktive roller` : "Organisasjonsoversikten er tom eller utilgjengelig",
    status_tone: valid ? "ok" : "alert", reference_note: evidence.note,
    ...(valid && company ? { generated: {
      type: "organization_overview" as const, company_id: company.id,
      rows: [
        ["Selskap", "Rolle", "Ansvarlige", "Avdeling", "Stedfortreder", "Rapporterer til", "Ansvar", "Oppgaver", "Myndighet", "Gyldig fra", "Gyldig til"],
        ...active.map(r => [company.name, r.title,
          [...new Set([r.person_id, ...(r.additional_person_ids ?? [])].filter((id): id is string => !!id))].map(name).join(", ") || "Ikke tildelt",
          people.find(p => p.person_id === r.person_id)?.department_name ?? "",
          r.deputy_person_id ? name(r.deputy_person_id) : "Ikke tildelt",
          r.reports_to_id ? active.find(parent => parent.id === r.reports_to_id)?.title ?? "Ikke tilgjengelig" : "Øverste nivå",
          r.responsibilities ?? "", r.tasks ?? "", r.authority ?? "", r.valid_from ?? "", r.valid_to ?? "",
        ]),
      ],
    } } : {}),
  };
}