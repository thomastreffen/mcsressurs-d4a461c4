# Individuelle mottakere – resultat 17. november 2026

## Deployet
- Migrasjon `0104_individual_assignment_response_and_plan.sql`: service-only atomisk respons, live konto/ansettelse/tildeling, plan-signatur, berørte svarlenker invalideres; separate Oslo-dager beholdes ved person-/jobb-tidsendring; atomisk tildelingsdiff med selskapsrettighet og optimistisk originalsnapshot.
- Seks funksjoner: `handle-approval`, `create-approval`, `calendar-write-sync`, `job-outlook-app-sync`, `job-outlook-app-pilot`, `sync-task-to-calendar`.
- `handle-approval` gjør ingen Graph-kall, token-refresh, globale jobbstatus-/forslagsendringer eller sletting av mottakernes kalender-ID-er. Individuelt svar og audit er samme transaksjon. Eksisterende varseltrigger er fortsatt eneste produsent ved fremtidige ordinære svar; ingen svar ble sendt i testen.
- `create-approval` overskriver ikke jobbens utførelse etter autoapproval/tidsendring. Plantriggere erstatter gamle lenker; replay av samme pending forespørsel beholder dens gjeldende token.
- Sentral kjerne behandler ikke aggregate rejected som cancelled. Personlig oppdatering sletter ikke manglende dager; update-only/create-only kan ikke slette. Ukjent/5xx POST-resultat beholder claim og kan ikke blindt opprettes igjen.
- Sentrale lesefeil stopper planlegging, og direkte sync kan ikke skrive uten frigitt kø. **Sentral DELETE er særskilt holdt**: generisk create/update-release er ikke slettesamtykke. Eksakt godkjent sentral slettesluse må fortsatt implementeres/verifiseres før sentral slettepilot.
- Separat legacy task-sync krever selskapsredigering før alle operasjoner, aktiv konto og samme personlige tokenformat; sletting krever eksplisitt bekreftelse.

## Skjermendringer – publisering nødvendig
- EventDrawer og Quick Edit bruker atomisk tildelings-/tidskommando; de gjør ikke lenger direkte fjerning av approvals eller automatisk gjenoppliving av en kansellert oppgave. Fjernede montørers kalenderarbeid ligger holdt og vises som ubekreftet.
- Skuffens svarfallback fabrikkerer ikke montøravslag fra jobbstatus. Hurtigredigering viser utførelse, mens legacy avslag betegnes historisk. Mine utelater ikke rejected-jobber.
- Svaroppsummering tar siste svar bare fra aktive tildelinger, ikke historiske mottakere. Avslagsskjermen og kvitteringen sier «din tildeling», med bevart jobbinfo-lenke.
- Pilotsimulering kan vise «ville opprettet» for Mats selv om gammel jobbstatus er rejected; globale sperrer og ikke-valgte dager er uendret.

## Verifikasjon
- **1023 tester / 130 filer bestod**; siste automatiske byggsignal `build OK`.
- 18 lokale PostgreSQL/PGlite-transaksjonstester bruker den faktisk anvendte migrasjonsfilen, relevante plantids-/svartoken-triggere og eksisterende eksakt-avplanlegging. Tester live tildeling, konto/ansettelse, selskaps/RLS-nekt, replay/samtidighet, stale tokens, rollback ved auditfeil, person/dag/hele-besøk, DST, reassign siste task og eksplisitt full cancel.
- Produksjonssvarhandler kjørt med mock database og sperret fetch: kun én responskommando, intet Microsoft-kall, ugyldige input og HTTP 403/409/410 videreføres.
- PC/mobil isolert Playwright: jobbinfo med pending + annet avslag, begge dager 08–16, beskrivelse og vedlegg; personlig avslagskvittering og samme jobbinfo-link; Quick Edit sender én atomisk planhandling med begge mottakere/originalsnapshot. Alle eksterne forespørsler blokkert. Ikke ekte innlogging som Mats.
- Microsoft-body, faktisk e-postmottak og faktisk personlige kalenderskrivinger er **ikke verifisert**; ingen Graph GET/POST/PATCH/DELETE eller utsending ble gjort.

## Produksjonen etter deploy – kun SELECT
- JOB60570 er fortsatt rejected og ikke slettet: én aktiv montør og to aktive dager. Jobben er ikke «reparert» ved å omskrive produksjonsstatus.
- Sentral synk enabled=false, dry_run=true, tom pilot_mailboxes, scope_verified_at=null.
- Fem pending sentrale køelementer har attempts=0 og released_at=null.
- JOB000440 gammel slettekø: failed, attempts=1, candidate_event_ids tom. Uendret; ingen automatisk retry.

## Avgrensninger som fortsatt må håndteres
- Arkitekturen er sikrere, men **hele den langsiktige planen er ikke uttømmende implementert**: EventDrawer lagrer øvrige oppdragsfelt før plantildelingskommandoen; dette er ikke én samlet detalj-/vedleggs-/plantransaksjon. Person/dag-flytt roterer berørte svar, men lager ikke ennå en komplett atomisk flytt+gammel-dag-sletteintent. Sentral sletting holdes derfor fortsatt særskilt.
- Nye montører arver de synlige separate planintervallene; en dedikert eksplisitt dag-/personvelger ved staggered reassign og full snapshot av alle blokker må utvides/testes før vi hevder full reassign-policydekning.
- Generisk task-sync har fortsatt eldre POST-idempotensbegrensninger; selskapsgrensen er rettet, men ingen full arkitekturmigrasjon av dette separate systemet er gjort.
- Alle historiske/legacy lenker ble beholdt. Emil-koblingene er ikke live bevis for kalenderens nåværende innhold og er ikke ryddet.
- Ingen ny sikkerhetsskann er utført i denne runden. Den tidligere parent_module_access-rettelsen er ikke endret.
- Microsoft reconnect-bannerets rapporterte memory drift ligger utenfor denne endringen og er urørt.

## Operativt neste steg
Publiser skjermene. Kontroller deretter vanlig egen brukerflyt og kjør Mats' **simulering**, ikke kalenderaktivering. Ekte skriving/body-verifikasjon, sentral eksakt sletting og operativ JOB000440-retry krever separat eksplisitt godkjenning. Et Exchange Granted eller tidligere Graph 200 erstatter ikke dette samtykket.