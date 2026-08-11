# Samlet avplanlegging uten ghost-bookinger

## Mål
Én autoritativ avplanleggingsflyt skal frigjøre montøren umiddelbart i MCS, rydde alle interne bookingreferanser og slette riktig Outlook-hendelse. Ekstern sletting kan ikke være del av samme databasetransaksjon, så løsningen bygges som en idempotent saga: lokal opprydding skjer atomisk, Outlook-sletting forsøkes straks, og feil legges i en varig retry-kø med tydelig advarsel.

## Backend og datamodell

- Utvid jobbstatus med `cancelled`, slik at siste montør/hel oppgave kan kanselleres uten at databaseoppdateringen feiler.
- Opprett `calendar_delete_retry_queue` for Outlook-slettinger med event, montør, kalender-ID-er, tidsrom, forsøk, siste feil og løst-tidspunkt. Tabellen får nødvendige grants, RLS og service-tilgang.
- Lag en `SECURITY DEFINER`-RPC som låser berørte rader og atomisk:
  - finner canonical child task via `schedule_block_id`, `job_id` og `project_id`
  - soft-sletter riktige `schedule_blocks`
  - fjerner aktuell `event_technicians`-rad og tilhørende `job_approvals`
  - oppdaterer `job_calendar_links`
  - beholder child task når andre montører fortsatt er tildelt
  - soft-sletter/kansellerer child task når siste montør fjernes eller hele oppgaven slettes
  - oppretter Outlook-delete-jobber før kalender-ID-ene ryddes
  - skriver gyldige `event_logs`/`activity_log`-poster
  - returnerer `success` eller `already_removed`, men fullfører eventuelle manglende deler ved gjentatte kall
- Utvid `event_logs_action_type_check` med avplanleggings- og sync-feilhandlingene som faktisk brukes.

## Én Edge Function for remove/retry/sweep

Opprett `remove-work-visit-from-plan` med autentisering og `check_permission_v2`:

- `remove_assignment`: fjern kun valgt montør.
- `remove_event`: fjern alle montører og kanseller child task.
- `retry_outlook`: behandle åpne delete-jobber.
- `scan_ghosts`: rapporter funn uten å endre data.
- `repair_ghosts`: reparer valgte/alle rapporterte funn gjennom samme avplanleggingslogikk.

Outlook-sletting bruker per-montør-ID fra `event_technicians.calendar_event_id`, deretter `job_calendar_links`, `schedule_blocks.outlook_event_id` og til slutt herdet `calendarView`-søk etter `MCS_EVENT_ID`/`MCS_ASSIGNMENT_ID`. `204` og `404` regnes som ferdig fjernet. Andre feil beholdes i retry-køen og returneres per montør.

## Conflict/busy-grunnlag

- Samle intern konfliktsjekk i én backend-RPC og bruk den fra alle opprett/rediger/tildel-dialoger.
- Ekskluder alltid:
  - slettede events
  - `cancelled` events
  - fjernede tildelinger
  - soft-slettede schedule blocks
- Oppdater kalender- og kapasitetsfetcher med samme regler.
- Når Outlook-delete venter på retry, filtrerer `ms-calendar` kun den kjente MCS-hendelsen fra busy-resultatet ved montør + tidsrom + MCS-metadata, slik at den ikke fortsetter å blokkere ny booking. Andre eksterne avtaler beholdes.

## Frontend

- Erstatt alle direkte kombinasjoner av klient-delete, `syncDelete` og løkker over blokker med ett kall til den nye funksjonen.
- «Fjern fra plan» på ett kalenderkort sender montørens assignment; «Slett hele oppgaven» sender hele child task.
- Oppdater ressursplan, kalenderhendelser, kapasitet og busy-data straks etter svar og etter refresh.
- Vis resultat per montør. Ved Outlook-feil vises eksplisitt: «Fjernet i ressursplan, men Outlook-sletting feilet for X. Nytt forsøk er satt i kø.»
- Ikke vis generell «Slettet ✓» når Outlook-sletting er ubekreftet.

## Ghost-rapport og reparasjon

Utvid Dataintegritet med en egen «Ressursplan»-kategori som først viser antall og detaljer for:

- `event_technicians` uten aktiv event
- tildelinger på slettet/kansellert event
- aktive `schedule_blocks` på slettet/kansellert event
- aktive approvals på slettet/kansellert event
- aktive kalenderkoblinger/Outlook-ID-er på slettet/kansellert event
- åpne Outlook-delete-retries

Brukeren kan skanne uten endring og deretter reparere valgte funn eller alle. Eksisterende automatiske sweep endres til å bruke samme regler i stedet for kun å skjule blokker.

## Tester og verifisering

- Én montør: avplanlegg, intern konflikt forsvinner, Outlook-delete blir bekreftet eller tydelig køet.
- To montører: fjern én; bare denne frigjøres, den andre og child task beholdes.
- Siste montør: alle bookingreferanser ryddes og child task blir `cancelled` + soft-slettet.
- Hel oppgave: samme fullstendige opprydding for alle montører.
- Gjentatt kall: `already_removed`/`success`, samtidig som uferdig Outlook-delete fortsatt retries.
- Refresh: ingen kort fra events, assignments eller schedule blocks.
- Ny booking samme tidsrom: ingen intern eller MCS-skapt Outlook-konflikt.
- Enhets-/integrasjonstester for scope-reglene, konfliktfiltrering, idempotens og retry-status; deploy og test Edge Function samt kjør relevante frontendtester.

## Nåværende data

Før implementering er det funnet én approval knyttet til en soft-slettet event. Ingen aktive schedule-block- eller event-technician-ghosts ble funnet i øyeblikksbildet. Den nye rapporten vil finne og reparere slike avvik løpende.
