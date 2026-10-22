# Roadmap

## Planlegging – eksterne prosjektdeltakere
- [ ] Prosjektbundet invitasjon og separat ekstern identitet uten Hub-medlemskap
- [ ] Fire faste samtaler med serverstyrt gruppe- og meldingsmottakertilgang
- [ ] Inline invitasjon, mottakeroversikt og egne eksterne prosjektflater
- [ ] Aktiv deling av private filer, oppgaver og arbeidspakker
- [ ] Isolerte sikkerhetstester og reelle rollebytter uten utsending; rapporter pilotrisiko

## Ressursplan – stoppregel og sikker testopprydding
- [x] Fast regel lagret: ingen live testjobber eller utsending til ekte montører; kun isolerte/mockede tester eller verifisert trygg testressurs uten utsending
- [x] Egne testjobber JOB-000405–409 identifisert ved eksakte UUID-er, client_request_id, skaper, selskap, tidspunkt og testspor; slettetriggere undersøkt
- [x] Kun disse fem oppdragene soft-deletet via direkte dataendring; 13 bekreftelseslenker rotert/utløpt og påminnelser satt på pause uten statusendringer eller ny utsending
- [x] Verifisert: fem oppdrag soft-deletet, null aktive kalenderblokker, null aktive bekreftelser; foreldreprosjekt JOB-000381 / 60521 urørt
- [ ] Eventuelle Outlook-rester etter JOB-000405/406: krever separat, verifisert varslingfri fjerning; ingen avlysnings-/sletteutsending startet

## Ressursplan – presis opprettelsesvalidering
- [x] Ett normalisert skjema brukes i validering og opprettelse; konkret manglende felt vises og fokuseres. Første reproduksjon dekket bare Nytt prosjekt med tom tittel, ikke brukerens Eksisterende-flyt.
- [x] JOB-000406 opprettet og gjenåpnet i kalenderen 9./10./11. november med Emil, Marcus, Mats og validering-test.png; alle ni kalenderblokker bekreftet
- [x] 287 tester grønne; automatisk bygg OK

## Ressursplan – valgt eksisterende prosjekt og navnearv
- [x] Eksisterende-valg bruker selectedJobId som identitet, valgfritt title og company-autorisert parent.title som fallback i payload; eget oppdragsnavn eksplisitt valgfritt
- [x] Tilgjengelig eksisterende 60521 valgt uten eget navn: JOB-000407/408/409 lagret 9./10./11. november med Emil/Marcus/Mats, ni blokker gjenåpnet; vedlegg på hovedbesøket bekreftet. Andre gjennomkjøring gjenbrukte samme besøk via eksisterende duplicate-/idempotensregler.
- [ ] Eksakt 60554/Ringnes-case ende til ende: krever isolert testmiljø/mock eller verifisert trygg testressurs uten utsending; skal aldri gjennomføres på ekte montører i produksjon
- [x] 289 tester grønne, inkludert 60554-navnearv og valgfri overstyring; automatisk bygg OK

## Ressursplan – testkobling må ikke blokkere opprettelse
- [x] Økonomisk master kun ved aktiv produksjonskobling; frivillig TEST-søk beholdes (migrasjon 0047)
- [x] Nytt prosjekt som kalenderstandard uten produksjonsmaster; tydelig validering ved manglende eksisterende prosjekt; flerdagsvalg og vedlegg beholdes
- [x] 281 tester grønne, bygg OK; TEST – kalenderretting 22.10.2026 / JOB-000405 lagret til Thomas i MCS Service med kun TEST-kobling, 23. og 26. oktober, vedlegg gjenåpnet og begge kalenderuker verifisert

## Oppdragsgodkjenning – 401 Invalid user
- [x] Signing-key-kompatibel validering og alle ti godkjenningsanrop sesjonssikret uten mutasjonsretry
- [x] 276 tester grønne, bygg OK; deployet tjeneste godtar ekte innlogging (400 Missing job_id uten skriving), avviser ugyldig bearer (401); ingen eksisterende oppdrag sendt på nytt

## Mobil fase 2
- [x] Planlegging: én status om gangen på telefon, sammenleggbare filtre, store knapper, sticky safe-area-handlinger; desktop-board uendret
- [x] Postkontoret: liste -> detalj -> tilbake på telefon, filterchips, dvh; samtaledetalj med dvh og temafarger
- [x] HMS: mobilkort for kjemikalier og ansatte, dvh og safe-area i skjema
- [x] Bestillinger: større mobilkort, temafarger, touch-synlige handlinger
- [x] HMS fase 3: /hms på telefon er den operative arbeidsflaten for alle (HmsHomePage-velger); AML-/arbeidstids- og overtidsvarsler flyttet til «Mer HMS» med diskrete tellere; desktop-oversikt uendret, «HMS-oversikt (admin)» nås via ?vis=oversikt
- [ ] Fase 4: resterende HMS-tabeller (rapporter, import), bestillingsdetalj, fysisk iPhone-test av tastatur og sjekklisteflyt

## Første mobilbølge
- [x] Mobilskall, rollebasert meny og safe-area; sekundære app-/kontohandlinger i Mer
- [x] Dagbasert telefonvisning i Ressursplan med eksisterende data og montørfokus i EventDrawer
- [x] Mobil prosjektliste med Mine/Alle og kanonisk involvering, selskapsavgrenset arving og globalt tilgangsstyrt søk
- [x] Mobil prosjekt-hjem og opt-in fullbredde store arbeidsflater med sticky safe-area-handlinger
- [x] 230 tester grønne; innlogget 390x844, 768x1024 og 1280x1800 kontrollert; ekte MCS Service-blokk åpnet, BusBar plan/list/detail uten horisontal overflow, mobilskjema 390x844 uten overflow; ingen lagring eller backend-endringer

## Ressursplan – robust prosjektsøk
- [x] Felles søkenormalisering/token-matching i picker og Tripletex med tilsvarende selskapsavgrenset SQL-søk før resultatgrenser; identitet/import/lagring uendret
- [x] 145 tester besto (17 nye); innlogget test 1/test1/test-1/TEST 1/test/1 verifisert med én linked Test1 og separat Test 2; ingen Tripletex-skriving eller produksjonskall

## Ressursplan – innloggingsfeil
- [x] Sesjonshydrering, delt fornyelse og én 401-retry kun for lesing; signing-key-kompatibel kontroll deployet for ms-calendar/tripletex-import
- [x] 102 tester besto; ekte innlogget kalender og Test1/Test2-søk svarte 200 uten 401; ingen Tripletex-skriving eller produksjonskall

## Ressursplan – entydig prosjektvelger
- [x] Grupper og ranger eksisterende picker, behold stabil-ID-deduplisering og lagringsregler
- [x] 107 tester grønne; Test1/Test2-søk og Hub-only-valg verifisert innlogget, desktop/mobil kontrollert; ingen import/opprettelse

## Monitoring – automatikk og utkast
- [x] Rett innboksskanningens HTTP-schema til net.http_post uten å endre 15-minuttersintervallet; oppdatert SDK fjerner getClaims-krasj
- [ ] Innboksskanningens autentisering: eksisterende cron bruker anon-bearer og får 401; krever sikker systemautentisering, ikke svekket tilgangskontroll
- [x] Rett lagrede/forkastede utkast; seks regresjonstester bestått og innlogget avbryt/gjenåpning verifisert
- [ ] Oppdater monitoring-status når funn-ID-er er tilgjengelige (pending-listen returnerer ingen funn); cron ikke ferdig før autorisert kjøring er verifisert

## Ressursplan – Tripletex-additiv regresjonsretting
- [x] Gjenopprett selskapsavgrenset Hub-prosjektsøk og Nytt prosjekt uten integrasjon
- [x] Behold koblingsstyrt statusvakt, stabil-ID-deduplisering og F4-import
- [x] Regresjonstester og innlogget skjermkontroll: BusBar Nytt prosjekt aktivt, MCS Service deaktivert, 60374 valgt; ingen faktisk opprettelse/utsending under kontrollen

## Klokkeslett hos montør
- [x] Rett UTC/Oslo i forespørsler, påminnelser, oppdateringer og oppgavetråd uten å endre registrerte tidspunkt
- [x] Test 06:00–14:00 i sommer- og vintertid, DST-overganger og montørspesifikke tidspunkt (7 tester)
- [x] E-postinnhold fra forespørsel/påminnelse/oppdatering verifisert som 06:00–14:00 sommer/vinter; fire korrigerte utsendingsfunksjoner satt i drift
- [ ] Faktisk innboksmottak — krever avtalt testmottaker; ingen eksisterende oppdrag sendes på nytt automatisk

## Lokal eksportstandard
- [x] Gjenbrukbar Eksporter / Del med PDF, Excel, CSV, ZIP, rad-/kolonnevalg og e-post med filforhåndsvisning
- [x] Lokal eksport for organisasjonens fire faner, ansatte, kompetanse, håndbok/aktivt kapittel, stoffkartotek, innsendte SJA/sjekklister, avvik, Ressursplan og tilsyn/revisjon
- [x] Modul-/selskapsavgrenset levering og revisjonsspor uten utvidede rettigheter; Eiriks Ressursplan tillatt, HMS/organisasjon/ansatte nektet
- [x] 27 tester grønne; innlogget PDF/Excel/CSV, filtrert FSE og nedlastingshistorikk verifisert; e-postmanifest klargjort uten sending
- [ ] Lokal e-post faktisk mottak — trenger avtalt testmottaker og tillatelse til sending
- [ ] Ressursplan-nedlasting og konkrete vernerundedata ende til ende — aktiv testuke og innsendt vernerunde manglet i kontrollen

## Dokumentasjon / Eksport
- [x] Tilsynseksport: valgt sak, forslag til organisasjon/FSE/kompetanse/internkontroll/funn 6–7 og tre leveringsvalg; innlogget forhåndsvisning, nedlasting og historikk verifisert
- [x] Fast HMS-inngang, innholdsvalg, enkeltposter og relevante filtre
- [x] Nedlasting, e-post og kombinert handling med filforhåndsvisning
- [x] DLE-/revisjonsmaler og selskapsavgrenset eksporthistorikk
- [x] Filtrerings- og DLE-regresjon: 16 tester grønne; utlogget direkteadresse sperret
- [x] Innlogget tilsynsnedlasting og historikk verifisert
- [ ] Generell dokumentasjonse-post: faktisk mottak — trenger avtalt testmottaker og tillatelse til sending

## DLE / ekstern opplasting
- [x] Separate filer, kategorivalg og samlet/separat PDF per post
- [x] Enkeltnedlasting, strukturert ZIP og ryddige eksportnavn
- [x] Implementert valgt e-postutsendelse og filbasert revisjonsspor
- [x] Verifisert eksport med ekte innlogging, nedlastede PDF-er, ZIP og bortvalg; 7 tester grønne
- [x] Microsoft aksepterte sending: én fil (Thomas, Rune kopi), flere filer og ZIP (begge Til)
- [x] Stor ufarlig test-PDF sendt som syvdagers signert lenke; korrekt filstørrelse, offentlig tilgang og annen pakke sperret
- [x] Dokumentversjoner og mottaker/bruker/firma/leveringsmåte i historikken; 11 tester grønne
- [x] Fem tilgjengelige kategori-PDF-er nedlastet; Thomas HMS-eksport tillatt, Emil/Eirik nektet via serverens tilgangssjekker
- [x] Thomas bekreftet innboksmottak av alle fire testmeldingene 2026-10-19
- [ ] Bekreft at mottatte vedlegg åpnes og nedlastingslenken fungerer; mottak hos Rune er ikke bekreftet
- [ ] Ekte SJA, vernerunde og SDS verifiseres når dokumentasjon finnes (ingen registrert nå)

## Fase 2 – modultilgang og tenant-isolasjon
- [x] Sentral sjekk i meny, ruter og handlinger
- [x] Ressursplan, HMS, organisasjon, personer og økonomi: autoritativ datatilgang
- [x] Minimal personinformasjon for Ressursplan
- [x] Regresjonstest ekte brukere og direkte datakall (A–F grønne, se siste rapport)
- [x] HMS-selvbetjening (håndbok/kjemikalier/klar-for-arbeid) åpen for alle ansatte uten hms-rolle
- [x] Fjern Eiriks gamle MCS Service-medlemskap, med revisjonsspor — fullført 2026-10-16

## Planlegging / Prosjektboard (iterasjon 1)
- [x] Datamodell: planning_projects, members, work_packages, tasks, contacts, external_refs, files, messages, activity
- [ ] Board-side på egen hovedrute `/planlegging` (ikke under prosjekt/ressursplan)
- [ ] Egen hovedinngang i navigasjonen, tilgjengelig for alle interne brukere (ikke krev ressursplan-tilgang)
- [ ] Opprett prosjekt (lav terskel)
- [ ] Prosjektrom `/planlegging/:id` med faner
- [ ] Arbeidspakker med avdelingstildeling + ressursbehov
- [ ] Oppgaver, kontakter, filer med kategori/visningsnavn, økonomi, samtale, historikk
- [ ] Forberedt kobling til Ressursplan (lenke/knapp kun ved tilgang)

## Planlegging hardening runde 2
- [x] Ubemannede ressursbehov synlige i Ressursplan-uke
- [x] Bemanningsstatus + datoavvik fra Ressursplan
- [x] Historikk viser faktisk bruker
- [x] Personregister kun egne selskaper (superadmin globalt)
- [x] @nevning begrenset + avdelinger
- [x] Nye Planlegging-filer i privat lager med signerte lenker
- [ ] Flytte eldre Planlegging-filer fra åpent lager (venter på beslutning)

## Tripletex-integrasjon
- [x] TPX-000a/b Klassifiseringsfelt, databaseregler og automatisk forslag (60 prosjekt, 44 jobb, 34 service)
- [x] TPX-000c Avklaringskø /admin/prosjektklassifisering (121 poster)
- [ ] TPX-000d Ny opprettelsesflyt med typevalg — venter på svar om navn og rammeprosjekt
- [ ] TPX-000f Manuell gjennomgang av 121 poster — venter på prosjektledere
- [ ] TPX-001 Avklaringer med ledelse/regnskap + testmiljø — venter på interne svar
- [ ] TPX-002–018 Fase 0/1 (grunnmur, ID-mapping, kunder/ansatte/prosjekter) — starter etter TPX-001
- [ ] TPX-019–020 Lesende Tripletex-assistent (MCP) — etter stabil ID-mapping

## HMS internkontrollsløyfe (fase 5)
- [x] Kvalitetssikring: rest-risiko/tiltak, immutable revisjoner, feilsikre fakta, planlagt rytme, aktivitetskoblinger, audit og company-filter i detail/update
- [x] Risiko -> tiltak -> utført -> eksplisitt restvurdering; signert v1 -> v2; idempotent årshjul 01.10.2026 -> 01.10.2027; direkte signatur-/auditendringer avvist; signert PDF nedlastet; 390/768/1280 ferdiglastede sider uten overflow
- [ ] Ekte cross-company brukerregresjon (ikke bare feil company-id), montørfullføring og komplett risiko/avvik/utsending/bekreftelseskjede gjenstår
- [x] DB: hms_year_activities, hms_risk_register, hms_internal_reviews + hms_action_items-koblinger (source_type, risk_register_id, year_activity_id, internal_review_id), RLS etter hms-mønster
- [x] Leder/admin: /hms/arshjul (frekvens, gjennomfør m/dok, auto neste forekomst), /hms/risiko (matrise, opprett tiltak), /hms/handlingsplan (alle kilder, status/forfalt), /hms/internkontroll (auto-snapshot, Ja/Nei/N/A, tiltak ved Nei, signering, eksport)
- [x] Montørmobil: «Dette må du gjøre» (egne tiltak) + Mine tiltak med merk utført; adminmodulene kun under Mer HMS for hms.manage
- [x] 261 tester grønne og automatisk bygg OK; hovedkjede og PDF verifisert innlogget; øvrige A-F-utsendingsscenarioer gjenstår under neste punkt
- [ ] Senere: DLE-pakkeintegrasjon for nye moduler, varsling ved tildelt tiltak, kobling risiko<->avvik fra avvikssiden
