# Én felles avsender: postkontoret@mcsservice.no

## Funn (kun lesing, ingenting endret)

### Sendes allerede fra postkontoret (app-tilgang til Microsoft, ikke personlig konto)
- Oppgavetråder og daglig sammendrag (task-thread-email-send, task-thread-daily-digest)
- Prosjektsamtaler og invitasjoner (conversation-email-send, conversation-invite-send)
- Bestillinger: varsel og meldinger (order-form-notify, order-message-email-send)
- Eksterne i Planlegging: invitasjon og innlogging (planning-external-invite, planning-external-login)
- HMS: håndbok og stoffkartotek (hms-handbook-send, hms-chemical-send)
- DLE-svarpakke og testutsending (inspection-response-send)

### Sendes fra den innloggedes personlige Microsoft-konto. Det er her postkontoret IKKE er satt opp
| Utsending | Konsekvens i dag |
|---|---|
| create-approval (jobb-e-post med Godta/Avslå til montør) | Ingen e-post hvis den som oppretter mangler Microsoft-kobling (Rune) |
| approval-reminder (påminnelse) | Samme. Kjører i bakgrunnen med en personlig konto |
| notify-event-changes (endret tid/sted) | Samme, og ingen sporing per mottaker |
| send-change-order (endringsordre til kunde) | Personlig konto. Kan være bevisst, se nedenfor |

### Kalenderavtaler skrives direkte i montørens egen kalender med montørens personlige kobling
calendar-write-sync, sync-task-to-calendar, ms-calendar, handle-approval, absence-calendar-sync og lead-calendar-event.
Det er dette som gjorde at Marcus, Mats og Rune ble hoppet over. Noen få funksjoner bruker allerede app-tilgangen til å slette eller bekrefte avtaler (delete-schedule-block, confirm-schedule-block, remove-work-visit-from-plan, outlook-schedule-sync). Appen har altså trolig kalenderrettigheter allerede, men det er ikke bekreftet.

### Skal forbli personlig, menneskestyrt korrespondanse (endres ikke)
- ms-mail: utkast og svar i egen innboks
- Tilbud og e-postutkast til kunder (create-lead-email-draft, case-offer-ai-draft)
- send-change-order, hvis kunden skal se og svare til ansvarlig selger. Anbefaling: avsender postkontoret med ansvarlig selger som svaradresse. Krever din bekreftelse.

### Varsler i Hub (ikke e-post)
Kundeportal, offer-followup og order-message-public-send skriver bare varsler inne i Hub. Disse påvirkes ikke av avsendervalget.

### Innkommende
graph-webhook-inbound, inbox-sync/inbox-scan og task-thread-email-inbound leser postkontoret. Svar på utsendinger kommer tilbake hit via plus-adressering, og dette fungerer allerede.

### Hindringer
1. **Tillatelser i Microsoft er ikke verifisert.** Appen bruker én felles nøkkel (tenant, klient og hemmelighet ligger lagret som sikre innstillinger, ingen hardkodede tokens). Jeg kan ikke se i Microsoft hvilke tillatelser den har (Mail.Send, Calendars.ReadWrite), eller om de er begrenset til bestemte postbokser. Uten begrensning kan appen sende som hvem som helst i firmaet.
2. **Pålogging til Microsoft er kopiert i mange funksjoner.** Koden for å hente tilgangen finnes 45 steder, uten felles feilhåndtering eller sporing.
3. **Bare kalendersync og create-approval har sporing per mottaker.** De andre sier bare «sendt» eller «feilet» samlet.
4. **Microsoft gir ingen bekreftelse på levering.** At Microsoft har tatt imot meldingen (svar 202) betyr bare at den er overlevert, ikke at den har kommet fram. Statusen skal derfor si «Overlevert til Microsoft», aldri «Levert».

## Kalender: anbefalt modell
- **Ny standard:** én møteinvitasjon fra postkontorets kalender med montørene som deltakere. Den fungerer uten montørens egen kobling, montøren svarer i Outlook, og svaret (godtatt, avslått eller foreslått ny tid) leses av via eksisterende mottak av Microsoft-varsler på postkontorets kalender.
- **Arbeidsoppdrag** beholder Godta/Avslå i Hub. Invitasjonen sendes uten krav om svar, så Hub er stedet der montøren bekrefter.
- **Informasjonsmøter** bruker svaret fra Outlook direkte, uten godkjenningsoppgave.
- Skriving direkte i montørens kalender fases ut. Den beholdes bare så lenge eksisterende avtaler må endres eller slettes.

## Prioritert implementering
1. **Sjekk tillatelsene (hos Microsoft-admin, ingen kode).** Bekreft Mail.Send og Calendars.ReadWrite, og opprett en tilgangsbegrensning som låser appen til postkontoret (og eventuelt montørenes kalendre i overgangen). Jeg lager en sjekkliste. Jeg kan også lese tillatelsene via en egen Microsoft-tilkobling hvis du kobler den til.
2. **Felles utsendingstjeneste** (`_shared/m365-sender.ts`): én pålogging, hentet fra sikre innstillinger og bufret i minnet. Gir sendMail, opprett/endre/avlys invitasjon og skriver alltid en statusrad per mottaker (forsøkt, overlevert, feilet med årsak), med fast nøkkel per melding og mottaker. Ingen stille hopp: manglende e-post blir «feilet: mangler e-post».
3. **Flytt create-approval, approval-reminder og notify-event-changes til postkontoret.** Svaradresse er den som opprettet. Sendingen avhenger ikke lenger av planleggerens kobling.
4. **Kalender via postkontorets invitasjon** for nye oppgaver: endring oppdaterer samme invitasjon, sletting sender avlysning, «Prøv igjen» sender bare til de som mangler.
5. **Svar fra montører:** Microsoft-varsler på postkontorets kalender oppdaterer godtatt/avslått per montør i Hub.
6. **Varsel til planlegger** i Hub når en mottaker står rødt.
7. **Flytt de eksisterende postkontor-utsendingene** over på den felles tjenesten litt etter litt, slik at alle får samme sporing.

## Tester (ingen ekte utsending)
- Microsoft erstattes med en simulert tjeneste. Mottak (202) gir «overlevert», aldri «levert».
- Når en mottaker feiler, får nøyaktig den mottakeren status rød med årsak.
- Samme melding to ganger gir én utsending, ikke to.
- Avsender er alltid postkontoret, uansett hvem som oppretter oppgaven, også en uten Microsoft-kobling.
- Avlysning og ny tid treffer samme invitasjon.
- Personlig korrespondanse (ms-mail, tilbud) sendes fortsatt fra den ansatte.

## Begrenset pilot
- Starter først når du godkjenner skriftlig. Bare Thomas og én frivillig montør, med én TEST-oppgave og én TEST-endring.
- Vi kontrollerer avsender, innhold, invitasjon, svar og avlysning i begge Outlook-postboksene.
- Utsendingen kan slås av med én innstilling som går tilbake til dagens løsning.
- Deretter én uke med vanlig drift i MCS Service før resten tas i bruk.
