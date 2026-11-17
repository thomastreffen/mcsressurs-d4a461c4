# Mats engangspilot – skrivebeskyttet konfliktdiagnose

## Verifisert 17. november 2026, ca. 10:19 UTC
- Eksakt Mats/60570/19. november lest gjennom innlogget `diagnose` på deployet job-calendar-one-shot.
- Graph calendarView returnerte 1 avtale for Oslo-dagen. 1 overlapper pilotperioden: **13:00–13:30 Europe/Oslo**, `showAs=tentative`, `type=occurrence`, ikke heldag, ikke avlyst.
- Klasse: annen foreløpig opptatt avtale. Ingen eksakte samme-Hub-jobbmarkører, ingen bekreftet samme-tittel-kandidat eller engangstransaksjon. Ingen eksisterende Mats-mapping.
- Dette er en faktisk tidsmessig overlapp, ikke en påvist falsk positiv. En avtale uten Hub-markører kan ikke sikkert knyttes til Majorstua eller utelukkes som en manuelt opprettet kopi. Ingen private titler, innhold, kalender-ID-er eller deltagere er levert i diagnosen.

## Hvorfor simulering og preflight skilte seg
- Tidligere `simulate` brukte kun Hub-plan og kjente koblinger; mailbox-proben leste kalenderens metadata, ikke avtaler. «Ville opprettet» var derfor ingen konfliktkontroll.
- Preflight bruker eksakt Mats calendarView for Oslo-dagen (18. nov 23:00Z til 19. nov 23:00Z), UTC-svar, maks 100; feil eller neste side stopper som ufullstendig lesing. Ingen GET /events eller bred postbokssøk.
- Gammel dedup identifiserer egen engangskopi bare ved nøyaktig transaksjonsnøkkel, 07–15Z og jobb/montør/dag-markører. Andre overlapp og uleselige tider sperrer. Like titler alene er ikke dedupbevis.
- Den brede sperren undersøkte ikke free/cancelled/type. Ny diagnose viser disse, men endrer **ikke** hva som får opprettes. Gjentakende forekomster er reelle kalenderavtaler, ikke automatisk falske konflikter.
- Pending Mats-svar og legacy aggregate rejected er separate fra kalenderkonflikten; busy-bekreftelsen i eksisterende pilot overstyrer ikke andre opptatte avtaler.

## Endring og sikkerhet
- Ny action `diagnose`: samme operatør- og selskapsrettighet, aktiv identitet/tildeling, eksakt target/plan/fresh probe/full diagnose/global OFF; bare SELECT/lese-RPC og én eksakt Graph GET. Ingen permit/audit/claim/receipt/queue/flags-mutasjon.
- Preflight-feil inkluderer nå anonymisert diagnose. UI skiller samme Hub-dag, relatert Hub-jobb, ubekreftet lik tittel, annen opptatt, ledig, avlyst og uleselig/ukjent.
- Tidene er klippet til pilotintervallet. Ingen private møteopplysninger lagres i DB eller eksponeres.
- `job-calendar-one-shot` deployet. **Ny skjerm må publiseres.** Live diagnose returnerte forventet klasse; isolert UI verifiseres separat.
- 58 målrettede tester bestod, inkludert faktisk handler uten mutasjoner, Graph GET-only, privat projeksjon, uendret free/cancelled-sperre og engangsclaim/rollback.
- Etter lesingen: 0 runs, 0 audits; global enabled=false/dry_run=true/tom pilotliste/null scope; 5 pending intents, attempts=0/released_at=null. Ingen Graph POST/PATCH/DELETE eller e-post utført.

## Anbefalt videre policy, ikke implementert
- Samme Hub-oppdrag: vis «Finnes allerede – kontroller kobling», aldri «Fortsett» eller automatisk adopsjon fra tittel/tidslikhet.
- Annen opptatt/tentative: vis anonymisert overlapp og la operatøren avklare om avtalen faktisk kolliderer. Eksisterende engangspilot tillater ikke overstyring.
- En senere separat godkjent regel kan la verifisert free eller avlyst **ikke-Hub**-avtale være ikke-blokkerende, men må bevare nøyaktig dedup, mappings, ufullstendig-lesing-stopp, og ny GET like før claim. Free/cancelled Hub-kopier skal fortsatt kreve avklaring. Ikke tillatt eller aktivert i denne oppgaven.