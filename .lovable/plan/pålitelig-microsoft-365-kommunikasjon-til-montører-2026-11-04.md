# Pålitelig Microsoft 365-kommunikasjon til montører

## Kortfattede funn (fra diagnosen)
- Medarbeidermøtet 3.11: 7 tildelt, bare 4 fikk Outlook-avtale. Marcus, Mats og Rune ble stille hoppet over.
- Mats og Rune har aldri koblet til Microsoft. Marcus har en gammel kobling fra mars som trolig er utløpt (ikke testet).
- Møtet ble likevel vist som «synced», fordi én vellykket avtale var nok til grønn status.
- Ingen e-post og ingen godkjenning ble laget. E-post sendes fra den som oppretter oppgaven, og Rune hadde verken adminrolle eller Microsoft-kobling.
- Postkontoret@mcsservice.no brukes allerede som systemavsender for oppgavetråder (app-tilgang via Microsoft). Hvilke rettigheter appen har og om den er begrenset til bare denne postboksen er ikke bekreftet.
- Merk: forrige runde gjorde endringer som allerede er live (ny statustabell, ærlig samlet status, utvidet senderett). Disse inngår her og vurderes på nytt, ingen nye endringer før godkjenning.

## Statusmodell (én sannhet per montør og kanal)
```text
Oppgave opprettet → Varsling forsøkt → Microsoft akseptert → Avtale bekreftet ved oppslag
                                    → E-post overlevert til Microsoft → (levert, kun hvis verifiserbart)
                                    → Montør godtatt / avslått
```
- Samlet farge på oppgaven: grønn = alle bekreftet, gul = venter eller delvis, rød = minst én feilet uten nytt forsøk.
- «Synced» brukes aldri ved delvis suksess.
- Feilårsaker på norsk: mangler Microsoft-kobling, kobling utløpt, mangler e-post, ingen innlogging koblet, avvist av Microsoft, tidsavbrudd.

## Prioriterte trinn
1. **Avklaring før endring (kun lesing):** bekreft hvilke tillatelser systemappen har i Microsoft (Mail.Send, Calendars.ReadWrite), og om den er låst til postkontoret og montørpostboksene med en tilgangspolicy. Hvis appen har bred tilgang til hele organisasjonen, anbefales en begrensning før vi tar den i bruk.
2. **Ærlig status overalt:** rett at «venter» telles som suksess. Hvert forsøk lagres per montør med tidspunkt og forsøksnummer. Tilstanden «Avtale bekreftet» settes først etter et faktisk oppslag i mottakerens kalender.
3. **Systemavsender:** e-post og invitasjoner sendes fra postkontoret, ikke fra den som oppretter. Da avhenger utsendingen ikke av om planleggeren har koblet til Microsoft.
4. **Kalendervalg (forretningsregel):**
   - *Arbeidsoppdrag:* avtalen legges direkte i montørens kalender, med e-post og Godta/Avslå i Hub.
   - *Informasjons- eller internmøte (som medarbeidermøtet):* én møteinvitasjon fra postkontoret til alle. Svar fra Outlook leses som godtatt/avslått, og det lages ingen godkjenningsoppgave.
   - Valget gjøres av oppgavetypen, ikke av hvem som oppretter.
5. **Robust opprett, endre, slett og nytt forsøk:** fast nøkkel per oppgave og montør (MCS_EVENT_ID) slik at et nytt forsøk aldri lager duplikater. Før ny opprettelse søkes det etter eksisterende avtale. Automatisk nytt forsøk inntil 3 ganger ved tidsavbrudd eller overbelastning, aldri ved manglende tilgang.
6. **Per-montør visning og knapp:** statusrad per montør med årsak og «Prøv igjen» i oppgaveskuffen, pluss fargeprikk på kortet i Ressursplan.
7. **Aktivt varsel til planlegger:** varsel i Hub når en montør står rødt. Påminnelse hvis det fortsatt er rødt etter 2 timer.
8. **Gjennomgå alle veier:** Ressursplan, bestilling til oppgave, batch- og arbeidsbesøk, tidsendring, legge til/fjerne montør, påminnelser og sletting. Alle skal gå gjennom samme utsendingsmotor, ingen snarveier utenom.
9. **Tilkoblingssjekk:** liste over montører med manglende eller utløpt Microsoft-kobling (Marcus, Mats, Rune først), med tydelig beskjed om at de må logge inn med Microsoft én gang. Med systemavsender blir dette bare nødvendig for direkte kalenderskriving.

## Akseptansekriterier
- En oppgave med 7 montører der 3 feiler vises gul eller rød, med navn og årsak på de 3.
- «Prøv igjen» for samme montør gir aldri to avtaler.
- Oppgaver laget via alle veiene i trinn 8 gir statusrader.
- Ingen tester sender ekte e-post eller kalenderavtaler. Microsoft erstattes med en simulert tjeneste.
- Planleggeren får varsel innen 1 minutt ved rød status.

## Begrenset pilot
- Kun Thomas og én frivillig montør, på en egen testoppgave merket TEST, først etter din skriftlige godkjenning.
- Vi sjekker avtale og e-post i begges Outlook, godtar og avslår, og retter tidspunktet.
- Deretter én uke med vanlig drift for MCS Service før resten.
- Utsendingen kan raskt slås av med en innstilling hvis noe går galt.

## Teknisk
- Gjenbruker token-oppsettet til systemappen fra task-thread-email-send. Ny felles hjelper i `_shared/m365-sender.ts`.
- `event_recipient_delivery` utvides med `confirmed_at`, `response_status` og `idempotency_key`, og endres til upsert på (event, tekniker, kanal).
- Møtesvar hentes via en eksisterende webhook (graph-subscription-sync) eller ved oppslag.
- Ingen tokens eller hemmeligheter logges.
