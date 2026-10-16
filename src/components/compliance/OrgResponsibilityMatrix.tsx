import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import type { OrgRole } from "@/hooks/useCompliance";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";

interface Props {
  roles: OrgRole[];
  nameOf: (id: string | null | undefined) => string;
  isActivePerson: (id: string | null | undefined) => boolean;
  typeLabel: (key: string) => string;
  companyName: string;
}

export function roleStatus(r: OrgRole, isActivePerson: (id: string) => boolean) {
  const today = new Date().toISOString().slice(0, 10);
  if (r.is_active === false) return { label: "Inaktiv", tone: "neutral" as const };
  if (r.valid_to && r.valid_to < today) return { label: "Utløpt", tone: "warn" as const };
  if (!r.person_id) return { label: "Ikke tildelt", tone: "warn" as const };
  if (!isActivePerson(r.person_id)) return { label: "Person ikke aktiv", tone: "alert" as const };
  return { label: "Aktiv", tone: "ok" as const };
}

export function OrgResponsibilityMatrix({ roles, nameOf, isActivePerson, typeLabel, companyName }: Props) {
  const persons = (r: OrgRole) =>
    [r.person_id, ...(r.additional_person_ids ?? [])].filter(Boolean).map((id) => nameOf(id as string)).join(", ") || "Ikke tildelt";
  const reportsTo = (r: OrgRole) => roles.find((x) => x.id === r.reports_to_id)?.title ?? "—";
  const area = (r: OrgRole) => [typeLabel(r.role_type), r.responsibilities?.trim()].filter(Boolean).join(": ");

  const exportCsv = () => {
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Rolle", "Person", "Type ansvar", "Ansvarsområde", "Oppgaver", "Myndighet", "Rapporterer til", "Stedfortreder", "Gyldig fra", "Status"],
      ...roles.map((r) => [
        r.title, persons(r), typeLabel(r.role_type), r.responsibilities ?? "", r.tasks ?? "", r.authority ?? "",
        reportsTo(r), r.deputy_person_id ? nameOf(r.deputy_person_id) : "", r.valid_from ?? "",
        roleStatus(r, isActivePerson).label,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(esc).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ansvarsmatrise-${companyName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-3.5 w-3.5" /> Eksporter CSV</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-3.5 w-3.5" /> PDF / skriv ut</Button>
      </div>
      <div className="org-print-root overflow-x-auto">
        <p className="mb-2 hidden text-sm font-semibold print:block">{companyName} – ansvarsmatrise ({new Date().toLocaleDateString("nb-NO")})</p>
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen roller registrert ennå.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                {["Rolle", "Person", "Ansvarsområde", "Rapporterer til", "Status"].map((h) => (
                  <th key={h} className="p-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const st = roleStatus(r, isActivePerson);
                return (
                  <tr key={r.id} className="border-b align-top">
                    <td className="p-2 font-medium">{r.title}</td>
                    <td className="p-2">{persons(r)}</td>
                    <td className="p-2 whitespace-pre-line">{area(r)}</td>
                    <td className="p-2">{reportsTo(r)}</td>
                    <td className="p-2"><ComplianceStatusBadge label={st.label} tone={st.tone} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
