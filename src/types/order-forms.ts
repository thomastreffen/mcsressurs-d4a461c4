// ── Order Forms Module Types ──

export type OrderFormFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "time"
  | "time_window"
  | "email"
  | "phone"
  | "address"
  | "org_number"
  | "dropdown"
  | "multi_select"
  | "yes_no"
  | "checkbox_list"
  | "radio"
  | "pricing_model"
  | "file_upload"
  | "image_upload"
  | "customer_lookup"
  | "project_lookup"
  | "user_lookup"
  | "info_box"
  | "section_header";

export const ORDER_FIELD_TYPE_LABELS: Record<OrderFormFieldType, string> = {
  short_text: "Kort tekst",
  long_text: "Lang tekst",
  number: "Tall",
  date: "Dato",
  time: "Klokkeslett",
  time_window: "Tidsvindu",
  email: "E-post",
  phone: "Telefon",
  address: "Adresse",
  org_number: "Org.nr",
  dropdown: "Nedtrekksliste",
  multi_select: "Flervalg",
  yes_no: "Ja / Nei",
  checkbox_list: "Sjekkliste",
  radio: "Radioknapper",
  file_upload: "Filopplasting",
  image_upload: "Bildeopplasting",
  customer_lookup: "Kundeoppslag",
  project_lookup: "Prosjektoppslag",
  user_lookup: "Brukeroppslag",
  info_box: "Infoboks",
  section_header: "Overskrift",
};

// ── Conditional Logic ──

export interface ConditionalRule {
  field_key: string;
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string;
}

export interface ConditionalLogic {
  action: "show" | "hide" | "require";
  rules: ConditionalRule[];
  logic: "and" | "or";
}

// ── Template ──

export interface OrderFormTemplate {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  category: string | null;
  category_id: string | null;
  audience_type: "internal" | "external" | "both";
  internal_title: string | null;
  external_title: string | null;
  description: string | null;
  internal_help_text: string | null;
  external_help_text: string | null;
  confirmation_text: string | null;
  send_email_to: string[] | null;
  on_submit_action: "queue" | "create_case" | "create_task";
  default_status: string;
  default_priority: string;
  default_handling_rule: string;
  is_active: boolean;
  requires_login: boolean;
  show_in_catalog: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderFormSection {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  visibility_rules: ConditionalLogic[] | null;
  created_at: string;
}

export interface OrderFormField {
  id: string;
  template_id: string;
  section_id: string;
  field_key: string;
  label: string;
  field_type: OrderFormFieldType;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  is_readonly: boolean;
  default_value: any;
  options: string[] | { label: string; value: string }[] | null;
  validation: Record<string, any> | null;
  conditional_logic: ConditionalLogic | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ── Submission / Ticket Status Model ──

export type OrderFormSubmissionStatus =
  | "new"
  | "under_review"
  | "missing_info"
  | "waiting_customer"
  | "waiting_internal"
  | "ready_for_planning"
  | "task_created"
  | "in_progress"
  | "closed"
  | "rejected";

export const ORDER_STATUS_CONFIG: Record<
  OrderFormSubmissionStatus,
  { label: string; color: string; dotClass: string }
> = {
  new: { label: "Ny", color: "bg-blue-100 text-blue-800", dotClass: "bg-blue-500" },
  under_review: { label: "Til vurdering", color: "bg-indigo-100 text-indigo-800", dotClass: "bg-indigo-500" },
  missing_info: { label: "Mangler info", color: "bg-amber-100 text-amber-800", dotClass: "bg-amber-500" },
  waiting_customer: { label: "Venter kunde", color: "bg-orange-100 text-orange-800", dotClass: "bg-orange-500" },
  waiting_internal: { label: "Venter internt", color: "bg-yellow-100 text-yellow-800", dotClass: "bg-yellow-500" },
  ready_for_planning: { label: "Klar for planlegging", color: "bg-cyan-100 text-cyan-800", dotClass: "bg-cyan-500" },
  task_created: { label: "Oppgave opprettet", color: "bg-teal-100 text-teal-800", dotClass: "bg-teal-500" },
  in_progress: { label: "Under arbeid", color: "bg-purple-100 text-purple-800", dotClass: "bg-purple-500" },
  closed: { label: "Lukket", color: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground" },
  rejected: { label: "Avvist", color: "bg-red-100 text-red-800", dotClass: "bg-red-500" },
};

// ── External (customer-facing) Status Model ──

export type ExternalStatus =
  | "received"
  | "processing"
  | "needs_info"
  | "planned"
  | "in_progress"
  | "completed"
  | "closed";

export const EXTERNAL_STATUS_CONFIG: Record<
  ExternalStatus,
  { label: string; description: string; longDescription: string; step: number; color: string }
> = {
  received: { label: "Mottatt", description: "Vi har mottatt bestillingen din", longDescription: "Bestillingen din er registrert og ligger i køen for behandling. Du trenger ikke foreta deg noe.", step: 1, color: "bg-blue-500" },
  processing: { label: "Under behandling", description: "Vi vurderer saken og planlegger neste steg", longDescription: "Vi gjennomgår bestillingen din og vurderer hva som trengs. Du vil bli oppdatert når det skjer noe nytt.", step: 2, color: "bg-indigo-500" },
  needs_info: { label: "Trenger mer info", description: "Vi trenger litt mer informasjon for å gå videre", longDescription: "For at vi skal kunne gå videre med bestillingen, trenger vi mer informasjon fra deg. Se meldingene nedenfor og svar så snart du kan.", step: 2, color: "bg-amber-500" },
  planned: { label: "Planlagt", description: "Saken er planlagt for videre arbeid", longDescription: "Bestillingen er planlagt og tildelt en ansvarlig. Vi forbereder oss på å gjennomføre oppdraget.", step: 3, color: "bg-cyan-500" },
  in_progress: { label: "Utføres", description: "Arbeidet er i gang eller satt i utførelse", longDescription: "Arbeidet er nå i gang. Du vil få beskjed når det er fullført.", step: 4, color: "bg-purple-500" },
  completed: { label: "Ferdig", description: "Bestillingen er ferdig behandlet", longDescription: "Alt arbeid knyttet til denne bestillingen er fullført. Kontakt oss gjerne om du har spørsmål.", step: 5, color: "bg-green-500" },
  closed: { label: "Avsluttet", description: "Saken er avsluttet", longDescription: "Denne saken er avsluttet.", step: 5, color: "bg-muted-foreground" },
};

export const EXTERNAL_STATUS_STEPS: ExternalStatus[] = [
  "received", "processing", "planned", "in_progress", "completed",
];

/** Map internal status → external status */
export function mapToExternalStatus(internal: OrderFormSubmissionStatus): ExternalStatus {
  switch (internal) {
    case "new": return "received";
    case "under_review": return "processing";
    case "missing_info": case "waiting_customer": return "needs_info";
    case "waiting_internal": return "processing";
    case "ready_for_planning": return "processing";
    case "task_created": return "planned";
    case "in_progress": return "in_progress";
    case "closed": return "completed";
    case "rejected": return "closed";
    default: return "received";
  }
}

export const ORDER_PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Kritisk stopp", color: "bg-red-100 text-red-800" },
  high: { label: "Høy", color: "bg-orange-100 text-orange-800" },
  normal: { label: "Normal", color: "bg-muted text-muted-foreground" },
  low: { label: "Lav", color: "bg-muted text-muted-foreground" },
};

export const CHANNEL_LABELS: Record<string, string> = {
  public_form: "Offentlig skjema",
  internal_form: "Internt skjema",
  logged_in_user: "Innlogget bruker",
  email: "E-post",
  manual: "Manuell",
};

export interface OrderFormSubmission {
  id: string;
  company_id: string;
  template_id: string;
  submission_no: string;
  status: OrderFormSubmissionStatus;
  source: string;
  requester_type: "internal" | "external";
  submitted_by: string | null;
  submitted_at: string;
  linked_customer_id: string | null;
  linked_project_id: string | null;
  linked_case_id: string | null;
  assigned_to: string | null;
  priority: string;
  channel: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_user_id: string | null;
  summary: Record<string, any> | null;
  last_activity_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  template?: OrderFormTemplate;
  order_form_templates?: { name: string; slug: string; category?: string | null };
}

export interface OrderFormSubmissionValue {
  id: string;
  submission_id: string;
  field_key: string;
  value: any;
}

export interface OrderFormAttachment {
  id: string;
  submission_id: string;
  field_key: string | null;
  category: string | null;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface OrderFormComment {
  id: string;
  submission_id: string;
  body: string;
  comment_type: "internal" | "external" | "system";
  created_by: string | null;
  created_at: string;
}

export interface OrderFormActivityEntry {
  id: string;
  submission_id: string;
  event_type: string;
  payload: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
}

// ── Template with sections and fields (for builder/renderer) ──

export interface OrderFormTemplateWithStructure extends OrderFormTemplate {
  sections: (OrderFormSection & { fields: OrderFormField[] })[];
}

// ── Category ──

export interface OrderFormCategory {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ── Catalog Settings ──

export interface OrderFormCatalogSettings {
  id: string;
  company_id: string;
  title: string;
  subtitle: string;
  help_text: string | null;
  contact_info: string | null;
  is_active: boolean;
  updated_at: string;
}

// ── "Bestill service" default sections ──

export const SERVICE_ORDER_SECTIONS = [
  "bestillingstype",
  "bestiller",
  "kunde_og_anlegg",
  "oppdrag",
  "teknisk_grunnlag",
  "material_og_ansvar",
  "gjennomforing_hms",
  "vedlegg",
  "intern_kontroll",
  "bekreftelse",
] as const;
