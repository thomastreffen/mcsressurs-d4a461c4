import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FindingDocumentationSuggestions } from "@/components/compliance/FindingDocumentationSuggestions";
import type { Finding, FindingEvidence } from "@/hooks/useInspections";

const mock = vi.hoisted(() => ({ add: vi.fn(), organizationFor: vi.fn(() => 7) }));
vi.mock("@/hooks/useCompanyContext", () => ({ useCompanyContext: () => ({ activeCompanyId: "service" }) }));
vi.mock("@/hooks/useInspections", () => ({
  useInspection: () => ({ data: { company_id: "service" } }),
  useEvidenceMutations: () => ({ add: { mutate: mock.add, isPending: false } }),
}));
vi.mock("@/hooks/useEvidenceCoverage", () => ({ useEvidenceCoverage: () => ({ organizationFor: mock.organizationFor }) }));
vi.mock("@/hooks/useCompliance", () => ({ useCompetenceTypes: () => ({ data: [] }), useComplianceAudits: () => ({ data: [] }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const finding = { id: "finding-1", status: "new", responsible_person_id: null, response_text: null,
  response_approved_at: null, condition_corrected_at: null, documentation_complete_at: null,
  ai_suggestions: { needed_documentation: ["Organisasjonskart med ansvarsmatrise"] } } as Finding;
const evidence = { id: "overview", ref_id: "service", source_kind: "organization_overview",
  label: "Organisasjonsoversikt – MCS Service AS", note: "7 aktive roller ved kobling" } as FindingEvidence;
const props = { finding, inspectionId: "63210", canEdit: true };
beforeEach(() => { vi.clearAllMocks(); mock.organizationFor.mockReturnValue(7); });
afterEach(cleanup);

describe("Documentation needs use live evidence without automatic writes", () => {
  it("checks the inspection company and rechecks evidence removal without changing finding fields", () => {
    const before = structuredClone(finding);
    const { rerender } = render(<FindingDocumentationSuggestions {...props} evidence={[evidence]} />);
    expect(mock.organizationFor).toHaveBeenCalledWith("service");
    rerender(<FindingDocumentationSuggestions {...props} evidence={[]} />);
    expect(mock.add).not.toHaveBeenCalled();
    expect(finding).toEqual(before);
  });
});