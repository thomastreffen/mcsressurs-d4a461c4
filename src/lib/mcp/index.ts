import { auth, defineMcp } from "@lovable.dev/mcp-js";
import uploadCompetenceDocument from "./tools/upload-competence-document";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "mcs-kontrollsenter",
  title: "MCS Kontrollsenter",
  version: "0.1.0",
  instructions: "Tools for MCS Hub. Actions run as the signed-in Hub user with their normal permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [uploadCompetenceDocument],
});
