# Roadmap

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
