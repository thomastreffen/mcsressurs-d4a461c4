import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatProjectLabel } from "@/lib/project-reference";

const plan = readFileSync("src/components/ProjectPlanTab.tsx", "utf8");
const drawer = readFileSync("src/components/EventDrawer.tsx", "utf8");

function createTaskDrawerBody() {
  const i = plan.indexOf("function CreateTaskDrawer");
  const rest = plan.slice(i);
  const end = rest.indexOf("\n}\n");
  return end > 0 ? rest.slice(0, end) : rest;
}

describe("Project plan uses the resource-plan EventDrawer", () => {
  it("opens EventDrawer locked to the parent project", () => {
    expect(plan).toMatch(/<EventDrawer[\s\S]*?projectId=\{jobId\}[\s\S]*?projectTitle=\{jobTitle\}/);
    expect(plan).toContain("Planlegg jobb / serviceoppdrag");
    expect(drawer).toContain('setMode(projectId ? "existing" : "new")');
    expect(drawer).toContain("setSelectedJobId(projectId || null)");
  });

  it("creates child events via create_work_visits_on_project_batch with parent id", () => {
    expect(drawer).toContain('"create_work_visits_on_project_batch"');
    expect(drawer).toContain("p_parent_id: selectedJobId");
  });

  it("does not copy parent title/number into child title", () => {
    expect(drawer).toContain('setTitle(projectId ? "" : (projectTitle || ""))');
  });

  it("makes no Tripletex calls from planning", () => {
    for (const src of [plan, drawer]) expect(src).not.toMatch(/tripletex-(project|import|participants)/);
  });

  it("internal task never creates a resource event", () => {
    const body = createTaskDrawerBody();
    expect(body).toContain('from("job_tasks").insert');
    expect(body).not.toMatch(/from\("events"\)\.insert|from\("event_technicians"\)\.insert|create-approval/);
    expect(plan).toContain("Ny intern oppgave");
    expect(plan).not.toMatch(/>\s*Ny oppgave\s*</);
  });

  it("resource-plan label still resolves '<nr> · <job>'", () => {
    expect(formatProjectLabel("1", "Montere kurs")).toBe("1 · Montere kurs");
  });

  it("internal task UI has no date/start/end or technician booking", () => {
    const body = createTaskDrawerBody();
    expect(body).not.toMatch(/type="date"|type="time"|scheduled_date|start_time|end_time/);
    expect(body).not.toMatch(/TechnicianMultiSelect|Montør\(er\)|Tildel ressurser|Ressursplan|Planlegging \\(valgfritt\\)|Opprett oppgave og planlegg/);
    expect(body).toContain("Intern deloppgave/sjekkpunkt");
  });
});
