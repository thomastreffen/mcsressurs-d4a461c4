/** Reading job information never depends on write rights or an approval token. */
export function jobEntryPath(id: string, planner: boolean): string {
  return `${planner ? "/projects" : "/job-info"}/${encodeURIComponent(id)}`;
}

/** Resource Plan tasks are operational objects, not economic project workspaces. */
export function overviewEventPath(id: string, projectType: string): string {
  return jobEntryPath(id, projectType !== "task");
}