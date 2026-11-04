# Diagnose: Outlook/e-post-svikt fra Ressursplan (Medarbeidermøte 3.11.2026)

Bare lesing. Ingen kode, data eller utsending er endret.

## Verifiserte funn (produksjon)

1. **Rune opprettet oppgaven.** `events.created_by` = Rune Ørbeck (31868e90). `event_logs` viser bare `created` og `technician_assigned` (alle 7), begge utført av Rune, 29.10.2026 07:36 UTC. Oppgaven er `project_type=project`, `entity_type=unclassified`, `status=requested`.
2. **Kalenderinvitasjonene bruker hver mottakers egen Microsoft-pålogging.** `calendar-write-sync` sjekker hver montør for seg (`ensureValidMsToken(tech.user_id)` → Graph på deres egen postboks). Uten gyldig Microsoft-pålogging hos montøren blir resultatet `no_token`. Det lagres ingen ID, og det skrives ingen logg om det.
   - Mats og Rune har **ingen** Microsoft-tilgang lagret hos brukeren sin (både tilgangsnøkkel og fornyelsesnøkkel mangler). Det forklarer 0/16 og 0/3.
   - Marcus har lagrede nøkler, men har **aldri logget inn med Microsoft** (bare e-postinnlogging), og siste innlogging var 16.03.2026. Nøkkelen er sannsynligvis utløpt eller trukket tilbake, så fornyelsen feiler stille. Det forklarer 0/8. (Ikke bekreftet: vi kan ikke prøve nøkkelen uten å lese hemmeligheter.)
   - Emil, John, Stian og Thomas har Microsoft-pålogging med lagrede nøkler, og fikk ID.
   - `microsoft_user_id` hos montøren brukes **ikke** til å skrive i kalenderen. Derfor kan det ikke vise om koblingen faktisk virker.
3. **«synced» er en status for hele oppgaven, ikke per mottaker.** `events.outlook_sync_status` settes til `synced` så snart **én** montør har fått en ID (linje ~890). Resten kan feile uten at det vises noe sted. Totalstatusen blir `created` selv om noen får `no_token`.
4. **Vellykkede kalenderopprettelser ble heller ikke logget.** Det finnes ingen `outlook_created` i `event_logs`, selv om fire montører fikk ID. Ukjent årsak: enten feiler loggskrivingen stille, eller ID-ene kom via en annen vei (`outlook-sync` / `sync-task-to-calendar`). Dette må verifiseres.
5. **Ingen e-post og ingen godkjenning.** Det finnes 0 `job_approvals` og 0 `notifications` på oppgaven. Vanlig `create-approval` oppretter godkjenninger før e-post sendes. At de mangler tyder på at `create-approval` **aldri ble kalt** for denne oppgaven, altså at visningen der oppgaven ble opprettet bare kaller kalendersynk. Det kan også ha feilet før godkjenningene ble lagret. Ikke bekreftet: funksjonsloggene fra 29.10 er trolig utenfor lagringstiden.
6. **E-posten sendes fra oppretterens egen postboks.** `create-approval` bruker `/me/sendMail` med **innlogget brukers** Microsoft-tilgang. Rune mangler den. Selv om funksjonen hadde kjørt, ville ingen montør fått e-post (`no_ms_token`), og ingen ville sett det. Det samme gjelder alle oppgaver Rune og Mats oppretter.
7. `microsoft_tokens`-tabellen er tom for alle. Nøklene ligger bare hos brukerne. Det stemmer med dagens oppsett, men gir ingen samlet oversikt.

## Årsaker (rangert)

- A. Per-mottaker-avhengighet: kalenderen krever at hver montør selv har koblet Microsoft. Det gjelder Mats, Rune og trolig Marcus. (Bekreftet for Mats og Rune.)
- B. Ingen per-mottaker-status: «synced» skjuler delvise feil.
- C. Oppretterens postboks sender e-posten: Rune har ingen Microsoft-tilgang. (Bekreftet.)
- D. Godkjenning og e-post ble sannsynligvis ikke utløst for denne typen oppgave og visning. (Sannsynlig, ikke bekreftet.)
- Ingen tegn til feil kobling mellom bruker og postboks: `technicians.user_id` og e-post stemmer med riktig innlogging for alle sju.

## Plan for robust diagnostikk per mottaker (etter godkjenning)

1. **Bekreft det som er uklart (bare lesing).** Finn ut hvilken visning som lager oppgaver av typen `project` med flere montører, og om den kaller `create-approval`. Sjekk om `event_logs`-skrivingen i `calendar-write-sync` feiler.
2. **Status per mottaker.** Ny tabell `event_recipient_delivery` (event, montør, kanal kalender/e-post, status `pending/sent/failed/skipped`, årsakskode `no_ms_connection/token_refresh_failed/graph_4xx/5xx`, Graph-svarkode, tidspunkter, `acked_at` fra godkjenning). Den skrives av `calendar-write-sync` og `create-approval` for hver mottaker. Ingen nøkler lagres.
3. **Sann totalstatus.** `outlook_sync_status` blir `synced` bare når alle er OK, ellers `partial` eller `failed`. Totalen leses fra tabellen over.
4. **Synlig i Ressursplan og oppgaveskuffen.** Hver montør får en egen merkelapp («Kalender sendt», «E-post sendt», «Bekreftet», «Mangler Microsoft-kobling») med «Prøv igjen» per mottaker.
5. **Sjekk av Microsoft-kobling.** Admin får en oversikt over montører uten gyldig kobling eller med feilende fornyelse. Mats, Rune og Marcus får beskjed om å logge inn med Microsoft én gang (eksisterende «koble til på nytt»-banner).
6. **Avsender uavhengig av oppretter (beslutning trengs).** Alternativ: send montør-e-post fra systempostboksen (som Postkontoret) når oppretteren mangler Microsoft-kobling, i stedet for å hoppe stille over. Og/eller lag kalenderinvitasjonen fra oppretterens eller systemets kalender med montørene som deltakere, så de ikke trenger egen kobling.
7. **Sørg for at e-post og godkjenning alltid utløses**, eller at det tydelig vises at e-post ikke sendes, i alle visninger som tildeler montører.
8. **Tester:** delvis feil gir `partial`, `no_token` gir en `failed`-rad, oppretter uten Microsoft-kobling gir synlig `skipped` (ikke stille), og ingen ekte e-post sendes i testene.

## Spørsmål til deg

- Skal e-post og kalender sendes fra en felles systempostboks (uavhengig av hvem som oppretter), eller fortsatt fra personens egen?
- Skal interne møter (som Medarbeidermøte) ha godkjenningsknapper, eller bare informasjon og kalender?
