export const KIND_LABEL: Record<string, string> = {
  confirmed_job: "Bekreftet jobbavtale", job_request: "Forespørsel om jobb/booking", reminder_no_reply: "Purring / mangler svar",
  promised_contact: "Lovet å kontakte/ringe", waiting_customer: "Avventer kunde", cancelled_or_handled: "Avlyst/utsatt/håndtert",
  internal_action_request: "Intern forespørsel om handling", technical_decision: "Teknisk beslutning", deviation_hms: "Avvik/HMS", documentation_request: "Dokumentasjonsforespørsel", internal_reminder: "Intern purring", information: "Informasjon", not_actionable: "Ikke relevant",
};
export const ACTION_LABEL: Record<string, string> = { action_required: "Krever handling", scheduling: "Avtales", handled: "Allerede håndtert", awaiting_me: "Avventer meg", awaiting_other: "Avventer andre – svar er ikke en avslutning", answered: "Besvart", info: "Informasjon", unknown: "Ukjent" };
export const REASON_LABEL: Record<string, string> = {
  message_gone: "Meldingen finnes ikke lenger", message_read_failed: "Kunne ikke lese meldingen", retry_ai_rate_limited: "Nytt forsøk (AI-grense)", retry_ai_timeout: "Nytt forsøk (AI-tidsavbrudd)", retry_ai_batch_error: "Nytt forsøk (AI-feil)", retry_graph_throttled: "Nytt forsøk (Microsoft ba om pause)",
  auto_reply: "Autosvar", newsletter: "Nyhetsbrev/liste", system: "Systemavsender", internal_only: "Kun intern e-post (v1/v2)", ai_quote_too_short: "AI-sitat for kort (forkastet)", order_nearby_unverified: "Bestilling i nærheten uten sikker kobling", empty_text: "Uten lesbar ny tekst",
  thread_cap: "Over trådgrensen", folder_cap_inbox: "Innboks over lesegrensen", folder_cap_sentitems: "Sendt over lesegrensen", ai_not_actionable: "AI: ikke relevant",
  ai_quote_not_verbatim: "AI-sitat ikke ordrett (forkastet)", ai_invalid_ref: "Ugyldig AI-svar", ai_batch_failed: "AI-kall feilet (tråder)", ai_no_item_for_thread: "Tråder uten funn",
  store_failed: "Lagring feilet", foreign_next_link_stopped: "Stoppet lenke til annen postkasse", no_customer: "Ingen kunde (v1)",
};

export const ORDER_DRAFT_KINDS = ["confirmed_job", "job_request"];
export const canSuggestOrderDraft = (kind: string | null, status: string | null) => !kind || (ORDER_DRAFT_KINDS.includes(kind) && status !== "handled" && status !== "answered");
