import { ChevronDown } from "lucide-react";
import type { OrgNode } from "@/lib/org-overview";
import { buildOrgTree } from "@/lib/org-overview";
import type { OrgRole } from "@/hooks/useCompliance";

interface Props {
  roles: OrgRole[];
  nameOf: (id: string | null | undefined) => string;
  jobTitleOf?: (id: string | null | undefined) => string | null;
}

function Box({ role, nameOf, jobTitleOf }: { role: OrgRole } & Omit<Props, "roles">) {
  const person = role.person_id ? nameOf(role.person_id) : "Ikke tildelt";
  const stilling = jobTitleOf?.(role.person_id);
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center shadow-sm">
      <p className="text-sm font-semibold leading-tight">{role.title}</p>
      <p className="text-xs text-muted-foreground">{person}</p>
      {stilling && <p className="text-[11px] text-muted-foreground/80">{stilling}</p>}
    </div>
  );
}

function Branch({ node, ...rest }: { node: OrgNode } & Omit<Props, "roles">) {
  return (
    <div className="flex flex-col items-center">
      <Box role={node.role} {...rest} />
      {node.children.length > 0 && (
        <>
          <ChevronDown className="my-1 h-4 w-4 text-muted-foreground" />
          <div className="flex flex-wrap items-start justify-center gap-4">
            {node.children.map((c) => (
              <Branch key={c.role.id} node={c} {...rest} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart({ roles, nameOf, jobTitleOf }: Props) {
  const { tree, functions } = buildOrgTree(roles);

  if (roles.length === 0)
    return <p className="text-sm text-muted-foreground">Ingen roller registrert ennå.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-center gap-6">
        {tree.map((n) => (
          <Branch key={n.role.id} node={n} nameOf={nameOf} jobTitleOf={jobTitleOf} />
        ))}
      </div>

      {functions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Støttefunksjoner og særskilte ansvar
          </p>
          <div className="flex flex-wrap gap-3">
            {functions.map((r) => (
              <div key={r.id} className="min-w-[180px] flex-1">
                <Box role={r} nameOf={nameOf} jobTitleOf={jobTitleOf} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
