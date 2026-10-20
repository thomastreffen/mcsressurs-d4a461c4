export interface RelevantProject {
  id: string;
  companyId: string | null;
  parentId: string | null;
}

/** Relevance only. Never grants access or carries involvement across companies. */
export function inheritProjectRelevance(projects: RelevantProject[], direct: Map<string, string[]>): Map<string, string[]> {
  const visible = new Map(projects.map(p => [p.id, p]));
  const result = new Map<string, string[]>();
  for (const [id, roles] of direct) {
    const project = visible.get(id);
    if (!project) continue;
    result.set(id, Array.from(new Set([...(result.get(id) ?? []), ...roles])));
    const visited = new Set([id]);
    let child = project;
    while (child.parentId) {
      const parent = visible.get(child.parentId);
      if (!parent || !parent.companyId || parent.companyId !== child.companyId || visited.has(parent.id)) break;
      visited.add(parent.id);
      result.set(parent.id, Array.from(new Set([...(result.get(parent.id) ?? []), "Tildelt arbeid i prosjektet"])));
      child = parent;
    }
  }
  return result;
}