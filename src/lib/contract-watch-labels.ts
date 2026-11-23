export const KIND_LABEL: Record<string, string> = {
  confirmed_job: "Bekreftet jobbavtale", job_request: "Forespørsel om jobb/booking", reminder_no_reply: "Purring / mangler svar",
  promised_contact: "Lovet å kontakte/ringe", waiting_customer: "Avventer kunde", cancelled_or_handled: "Avlyst/utsatt/håndtert", not_actionable: "Ikke relevant",
};
export const ACTION_LABEL: Record<string, string> = { action_required: "Krever handling", scheduling: "Avtales", handled: "Allerede håndtert", unknown: "Ukjent" };
export const REASON_LABEL: Record<string, string> = {
  auto_reply: "Autosvar", newsletter: "Nyhetsbrev/liste", system: "Systemavsender", internal_only: "Kun intern e-post", empty_text: "Uten lesbar ny tekst",
  thread_cap: "Over trådgrensen", folder_cap_inbox: "Innboks over lesegrensen", folder_cap_sentitems: "Sendt over lesegrensen", ai_not_actionable: "AI: ikke relevant",
  ai_quote_not_verbatim: "AI-sitat ikke ordrett (forkastet)", ai_invalid_ref: "Ugyldig AI-svar", ai_batch_failed: "AI-kall feilet (tråder)", ai_no_item_for_thread: "Tråder uten funn",
  store_failed: "Lagring feilet", foreign_next_link_stopped: "Stoppet lenke til annen postkasse", no_customer: "Ingen kunde (v1)",
};
