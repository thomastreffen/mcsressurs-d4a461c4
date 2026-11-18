# Helhetlig salgsflyt: kunde → henvendelse → tilbud → prosjekt → drift → faktura

Kun plan basert på lesende kartlegging av data og kode. Ingen endringer, e-post eller varsler.

## Verifisert datamodell (hva er hva)

| Begrep i appen | Faktisk tabell | Merknad |
|---|---|---|
| Kunde / avdeling / kontakt | `customers`, `customer_accounts`, `customer_contacts` | Hub er master |
| Henvendelse (lead) | `leads` | 1 rad i produksjon. Har nå kobling til kunde, avdeling og kontakt |
| Salgssak (samlemappe) | `commercial_cases` | 0 rader. Opprettes automatisk fra lead bare når lead har selskap, som eldre leads manglet |
| Kalkyle | `calculations` (+ `calc_cases`) | 34 rader. Har felt for lead, kunde, kontakt og salgssak, men 0 har lead og bare 4 har kunde |
| Tilbud | `offers` | 34 rader, 0 akseptert. Kunde ligger kun via kalkylen. Har allerede HTML-snapshot, innholds-hash og aksept-navn/-tid |
| «Saker» | `cases` | Postkontor-henvendelser (24). Ikke prosjekter |
| Prosjekt / jobb | `events` (`entity_type` financial_project/job/service/internal, `parent_project_id`) | 75 økonomiske prosjekter. 0 har tilbud, lead eller salgssak koblet |
| Planleggingsprosjekt | `planning_projects` → `financial_project_id` | Eget samarbeidslag. Peker til prosjektet |
| Tripletex | `tripletex_links` (stabil ID) | Kun prosjekter med aktiv kobling. Tripletex er økonomisk master |
| Fakturagrunnlag | `invoice_basis` (prosjekt, kunde, servicejournal) | 0 rader. Snapshot ved godkjenning |
| Dokumentasjonskrav | `doc_*`, `doc_job_profiles` | 0 jobbprofiler i bruk ennå |

## Reelle hull

1. **Henvendelse til tilbud:** «Opprett tilbud» sender bare `lead_id` i adressen. Tilbudseditoren lagrer ikke lead og ber om kunde og kontakt på nytt. Det er dobbeltregistrering.
2. **Avdeling mangler videre i kjeden:** Kalkyle, tilbud, salgssak og prosjekt har ikke `customer_account_id`. Avdelingshistorikk kan ikke bygges.
3. **Vunnet til prosjekt:** `LeadConvertPanel` oppretter et prosjekt direkte fra nettleseren med lead-teksten som kundenavn. Det mangler:
   - kunde, `source_lead_id`, salgssak og `entity_type`
   - engangsnøkkel, så et dobbeltklikk kan gi to prosjekter
   - valg av eksisterende prosjekt
   - kontroll mot Tripletex

   Det setter også innlogget bruker som montør og en falsk tidsluke på 8 timer.
4. **Akseptert tilbud:** Aksept oppdaterer tilbud og kalkyle, men ingenting kobler tilbudet til prosjektet.
5. **Salgssak:** Den automatiske salgssaken bruker et kontaktfelt som ikke finnes på lead. Avdeling er ikke med.
6. **Samlet historikk:** Den finnes per objekt, men ikke samlet per kunde og avdeling på tvers av lead, tilbud, prosjekt og faktura.

## Master per datapunkt

- **Hub:** kunde, avdeling, kontakt, lead, salgssak, prosjektidentitet (`events.id`), ressursplan, timer, materiell og dokumentasjon.
- **Tripletex:** prosjektnummer, åpen/lukket status og økonomi, via stabil ID i `tripletex_links`.
- **Uforanderlig:** akseptert tilbud (HTML-snapshot, hash, aksept-navn/-tid), fakturagrunnlag ved godkjenning, utsendte dokumenter.
- **Lenker, ikke kopier:** Nye rader peker med ID til kunde, avdeling og kontakt. Tekstfelt (kundenavn) er kun et visningssnapshot.

## Prioritert implementeringsplan

**1. Koble kjeden uten nye skjermer (lav risiko, additive-only)**
- Legg til `customer_account_id` på `calculations`, `commercial_cases` og `events`, med valideringstrigger: samme kunde og samme selskap.
- Rett den automatiske salgssaken fra lead så den bruker kunde, avdeling og kontakt fra lead.
- Gamle rader beholdes som de er. Ingen tilbakefylling uten egen godkjenning.

**2. «Opprett tilbud fra henvendelse» (ett klikk og forhåndsvisning)**
- Knappen på lead åpner tilbudseditoren med kunde, avdeling, kontakt, tittel og notat ferdig utfylt og låst til leadens kunde. Kunden kan byttes eksplisitt.
- Lagring setter `lead_id`, `commercial_case_id` og `customer_account_id`. Det gjenbruker regelen «ett aktivt tilbud per kilde» (`get_active_offer_for_source`), slik at knappen blir «Åpne tilbud» hvis tilbudet finnes.

**3. «Konverter akseptert tilbud til prosjekt» (erstatter dagens konverteringspanel)**
- Ny side eller sideskuff med to valg: **Koble til eksisterende prosjekt** (søk med eksisterende prosjektsøk for ressursplan, samme selskap) eller **Opprett nytt Hub-prosjekt**.
- Forhåndsvisning viser:
  - kunde, avdeling og kontakt
  - tilbudsnummer og -sum fra snapshot
  - prosjekttype
  - Tripletex-status
- Deretter én eksplisitt «Bekreft».
- En serverfunksjon gjør alt i én operasjon:
  - krever akseptert tilbud og riktig rettighet i selskapet
  - bruker en engangsnøkkel fra nettleseren
  - gir unik kobling tilbud → prosjekt, så samme tilbud aldri gir to prosjekter
  - setter `offer_id`, `source_lead_id`, `commercial_case_id`, kunde og avdeling
  - oppretter ingen montør eller tidsluke
  - kaller aldri Tripletex
- Selskaper med Tripletex følger eksisterende regel: nye økonomiske prosjekter importeres eller kobles fra Tripletex, Hub oppretter dem ikke.
- Leadstatus «vunnet» og hendelser i historikken settes av den samme serverfunksjonen.

**4. Drift (gjenbruk, ingen ny flyt)**
- Ressursplanen planlegger arbeid under prosjektet som før (`parent_project_id`).
- Dokumentasjonskrav settes per jobbtype via eksisterende `doc_job_profiles`, og må fylles med reelle krav av Rune/Thomas.
- Mobil montørflate er uendret. Montøren ser kun jobbinformasjon, aldri tilbudspris eller CRM.

**5. Samlet kundehistorikk**
- En lesefunksjon som samler, med selskapstilgang:
  - leads
  - tilbud (status og aksept)
  - prosjekter og jobber
  - fakturagrunnlag
  - CRM-e-post
  - endringer i avdelinger og kontakter
- Den vises som én tidslinje på kundekort og avdeling, filtrert per avdeling. Den kopierer ikke data.

## Grenser

- Ingen automatisk opprettelse av tilbud, prosjekt eller Tripletex-objekter. Alt starter med et brukerklikk og en bekreftelse.
- Avdeling uten eget org.nr. er tillatt. Feil i kunderegisteret ryddes separat.
- Kundeportal, e-post og varsler er ikke del av konverteringen.

## Tekniske detaljer

- Konvertering skjer i en `SECURITY DEFINER`-funksjon med `client_request_id`. Den låser raden, sjekker status og selskap, og har en partial unique index på `events(offer_id) where deleted_at is null and entity_type='financial_project'`. Ved konflikt returneres eksisterende prosjekt.
- Rettigheter følger eksisterende `has_company_access` og `check_permission_v2` for salg/prosjekt.
- Tester: isolerte databasetester som rulles tilbake (dobbeltklikk, annet selskap, ikke-akseptert tilbud, eksisterende prosjekt, Tripletex-selskap), og test av forhåndsutfylling i UI.
