import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { installToolsListMetaInterceptor } from "./tool-meta";
import uploadCompetenceDocument from "./tools/upload-competence-document";
import findEmployee from "./tools/find-employee";
import listEmployeeCompetences from "./tools/list-employee-competences";

installToolsListMetaInterceptor();

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "mcs-kontrollsenter",
  title: "MCS Kontrollsenter",
  version: "0.2.1",
  instructions:
    "Tools for MCS Hub. Actions run as the signed-in Hub user with their normal permissions. Find an employee, list their competences, then upload a PDF to a competence record.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [findEmployee, listEmployeeCompetences, uploadCompetenceDocument],
});
