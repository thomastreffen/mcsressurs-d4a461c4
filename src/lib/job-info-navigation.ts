/** Reading job information never depends on write rights or an approval token. */
export function jobEntryPath(id: string, planner: boolean): string {
  return `${planner ? "/projects" : "/job-info"}/${encodeURIComponent(id)}`;
}