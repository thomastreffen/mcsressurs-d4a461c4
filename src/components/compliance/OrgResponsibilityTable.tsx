import type { OrgRole } from "@/hooks/useCompliance";
import { formatDate } from "@/lib/compliance";

interface Props {
  roles: OrgRole[];
  nameOf: (id: string | null | undefined) => string;
}

export function OrgResponsibilityTable({ roles, nameOf }: Props) {
  if (roles.length === 0)
    return <p className="text-sm text-muted-foreground">Ingen roller registrert ennå.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {["Rolle", "Person", "Ansvar", "Oppgaver", "Myndighet", "Stedfortreder", "Gyldighet"].map((h) => (
              <th key={h} className="p-2 font-semibold align-bottom">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="border-b align-top">
              <td className="p-2 font-medium">{r.title}</td>
              <td className="p-2">{r.person_id ? nameOf(r.person_id) : "Ikke tildelt"}</td>
              <td className="p-2 whitespace-pre-line">{r.responsibilities || "—"}</td>
              <td className="p-2 whitespace-pre-line">{r.tasks || "—"}</td>
              <td className="p-2 whitespace-pre-line">{r.authority || "—"}</td>
              <td className="p-2">{r.deputy_person_id ? nameOf(r.deputy_person_id) : "—"}</td>
              <td className="p-2 whitespace-nowrap">
                {r.valid_from || r.valid_to
                  ? `${formatDate(r.valid_from)} – ${r.valid_to ? formatDate(r.valid_to) : "løpende"}`
                  : "Løpende"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
