# Roadmap

## Tilsynsflyt publiseringskontroll – 27.10.2026
- [ ] Verifiser og herd forhåndsvisning/manuell sending; aldri registrer oversendt før Microsoft aksepterer; tester uten produksjonsskriving
- [ ] Kontroller aktiv organisasjonsbevis/individuell kravrelevans; punkt 2/3 og Rune urørt
- [ ] Rapporter test/byggestatus og gjenstående publisering/deploy; ikke publiser eller send

## Individuell kravrelevans – 27.10.2026
- [x] Append-only compliance_requirement_assessments + HMS-audit, company-authorized/idempotent RPC; begrunnelse/aktør/tid/valgfri revurdering, oppheving; endret krav/ansettelseskontekst ugyldiggjør vurdering
- [x] Adminhandling i gjeldende personkrav; eksplisitt Ikke relevant i matrise/eksport, separate opplæringstall og vurderingstall i gap/preflight/svarpakke/DLE/internrevisjon
- [x] 90 tester bestått, derav 14 faktiske SQL-tester i isolert PGlite; servertilgang/RLS/oppheving/utløp/idempotens/audit og UI-feil/nytt forsøk; automatisk bygg OK
- [x] Produksjon tilbakelest: 0 vurderinger, Rune fortsatt 2 påkrevde krav og 0 kompetanseposter; ingen testdata, ingen utsending/publisering. Ingen eksisterende automatisk produsent for compliance-varsler funnet; gapbaserte varsler/tellere følger statusmotoren
- [ ] Innlogget visuell kontroll i preview: egen konto kunne ikke matches; krever brukerinnlogging. UI-handlingen testet med isolert simulering
- [ ] Publisering av ny adminhandling: avventer eksplisitt bestilling; additive databasestøtte er installert

## Samlet organisasjonsbevis – DLE 63210 punkt 1
- [x] Samlet dynamisk selskapskilde med ref_id=sakens selskap; servervalidering, duplikatvern og antall aktive roller; enkeltroller beholdes
- [x] Preflight validerer tilgjengelig register; ett samlet CSV-vedlegg i svarpakke og samlet innhold i eksisterende PDF-eksport
- [x] 28 tester bestått, inkludert simulert kobling på eksakte sak/funn-1-ID-er, ventestatus/feil/nytt forsøk, dynamiske endringer og selskapsisolasjon; automatisk bygg OK
- [x] Tilbakelesing: 7 aktive roller; alle 7 funn har uendrede status/updated_at; ingen samlet beviskobling opprettet i produksjon; ingen utsending
- [ ] Innlogget visuell kontroll på saken: egen sesjon kunne ikke etableres; krever brukerinnlogging i preview
- [ ] App-publisering: ikke bestilt; databasens additive bevistype/validering er installert, frontend venter på publisering

## Produksjonsdokumentasjon DLE sak 63210 punkt 2 – 27.10.2026
- [x] Administrativ ferdigstilling 27.10.2026 12:32:44 UTC: kun feil funnkobling fjernet fra bredt åpent tiltak (øvrige koblinger beholdt); HUB-preflight uten mangler/systemgap, Thomas godkjente eksisterende svar og bekreftet rettet/komplett; documentation_ready + complete, 2 bevis, 0 åpne tilknyttede tiltak, 6 inspeksjonshendelser + 2 aktørfestede auditposter. Alle andre funn har identiske før/etter-hasher; ingen utsending
- [x] Rutine 9470d76b-da66-495c-94c0-287c893a2a7a, versjon 1 published, uten utsending; tidligere håndbok urørt
- [x] Revisjon b8d7dfbf-7328-443e-9780-d7a4404425dd completed 27.10.2026, 7 besvarte kontrollpunkter og frosset systemgrunnlag; dokumentgjennomgang, ingen fysisk inspeksjon attestert
- [x] To dokumenter/bevis koblet til punkt 2; brukerbestilt svartekst satt uten formell godkjenning/lukking; tidligere svar bevart i sakshistorikken
- [x] Ett åpent oppfølgingstiltak 13f22948-34c8-4888-bff8-b8fc29e7794c, Thomas Treffen, 08.11.2026; øvrige DLE-funn og gammel revisjon urørt
- [x] Produksjonsposter lest tilbake; lagrede rutine/referat byte-verifisert (3161/6109 B); publisert side krever innlogging; ingen kodeendring eller app-publisering nødvendig
- [ ] Innlogget visuell kontroll: ingen tilgjengelig autorisert nettlesersesjon, selv-mint fant ikke bestiller; ingen omgåelse av innlogging
- [ ] Punkt 2 ekstern oversendelse/lukking: internt ferdigstilt og klart for oversendelse; faktisk sending/formell DLE-lukking krever separat bestilling, ingenting sendt

## DLE / internrevisjon – AI-forslag 27.10.2026
- [x] Svarforslag i punkt 2: vent på lagring før forslag fjernes, vis innsatt/lagret bekreftelse, ventestatus og feil med nytt forsøk; godkjenning fortsatt separat
- [x] 35 tester bestått; innlogget punkt 2 kontrollert med lokal simulering av AI/lagring, feil og nytt forsøk; ingen produksjonsskriving eller testdata, automatisk bygg OK; ikke publisert

## MCP native filparameter – produksjonskontroll 27.10.2026
- [x] Faktisk OAuth-autentisert produksjons-tools/list HTTP 200 inneholder allerede top-level file og _meta.openai/fileParams=[file]; avviket er på ChatGPT-klientsiden, ikke manglende serverschema
- [x] MCP-versjon 0.2.1; 14 tester bestått: native file først, eksakte binære bytes for alle tre ruter, eksisterende competence_id, korrupt PDF avvist; live native tools/call avviser http før lagring
- [x] Manifest regenerert med tre verktøy; publisering forespurt 27.10.2026. 25 eksisterende kritiske sikkerhetsfunn består; ingen database-/lagringsendringer
- [x] Produksjon initialize HTTP 200 bekrefter versjon 0.2.1; etter publiseringsforespørselen returnerer faktisk tools/list native file med korrekt metadata
- [ ] Bekreft at den installerte ChatGPT-koblingen henter samme schema; ChatGPT-installasjonen er ikke tilgjengelig her
- [ ] Erstatt Emil Strids dokument først når originalfilen er tilgjengelig og ruten verifisert; ingen dokumentendring i denne operasjonen

## Kompetansedokumenter – binær PDF og trygg kartlegging
- [x] Kontrollert berørt fil (148750 B, %PDF--header, mangler startxref/%%EOF); ingen andre objekter i bøtten; ingen data endret
- [x] Herdet validering i MCP-verktøy og edge-funksjon: krever %PDF--header + startxref + %%EOF (tåler trailing bytes); native file/pdf_base64/pdf_url uendret ellers
- [x] 15 regresjonstester grønne (9 vitest + 6 Deno); edge-funksjon deployet, MCP publisert, manifest har openai/fileParams
- [ ] Re-oppdater Emil Strids Anhuker-bevis med originalen via ChatGPT når pluginen er refreshet (krever at ChatGPT henter ny tools/list)

## Ekstern kundereise – én inngang
- [x] Personbundet sikker inngang på /ekstern, Mine prosjekter og tilbakevei; gamle prosjektlenker/sessions oppgraderes etter verifisering
- [x] Ettersend tilgang på samme person/deltaker, intern inline-bekreftelse ved avslutning og enkel ny innlogging; avsluttede deltakere vises i intern historikk
- [x] Faktisk engangsinnlogging, ett prosjekt direkte og to prosjektroller (supplier A/customer B), feil prosjekt/kanal, skjult innhold, private filnedlastinger, utlogging/revoke, direkte reload og 390×844/1280×1800 kontrollert uten e-post; tomt midlertidig prosjekt B arkivert og testinnlogginger fjernet, original A/tt urørt
- [x] 303 automatiske tester besto; automatisk bygg OK; rapporter gjennomført kontroll og åpne pilotrisikoer
- [ ] Ny /ekstern-flate i publisert løsning: krever eksplisitt publisering; ikke publisert i denne runden
- [ ] Ny ettersendings-/innloggingsmail fra innboks gjennom publisert flate: ikke sendt i denne runden; må avtales før pilot
- [ ] Ekstern pilot: vurder videresendbare personlige lenker, gjenbrukte e-postadresser og bredere misbruksvern for offentlig lenkebestilling; prosjektisolasjonen er kontrollert, ingen pilotklar-erklæring

## Planlegging – eksterne prosjektdeltakere
- [x] Fullført påbegynt eksternflyt: prosjektinvitasjon, Microsoft-utsending, isolert prosjektrom, fire samtaler og deling
- [x] Token-/gruppe-/ID-/fil-/revoke-matrisen: 150 API-kontroller + 9 sluttkontroller; isolerte kunder/leverandører og to prosjekter, ingen invitasjonsutsending
- [x] Prosjektbundet invitasjon og separat ekstern identitet uten Hub-medlemskap
- [x] Fire faste samtaler med serverstyrt gruppe- og meldingsmottakertilgang; standard Intern plan; avsender kan lese egne meldinger
- [x] Inline invitasjon, mottakeroversikt og eget eksternt prosjektrom; mobil 390×844, nettbrett 768×1024, desktop 1280×1800
- [x] Aktiv deling av private filer, oppgaver og arbeidspakker; offentlig legacy-fil avvist; 60-sekunders signert URL kontrollert inkludert utløp
- [x] Reelle eksterne tokenbytter, internvisning av alle fire tråder, melding sendt og lest tilbake; 298 tester og automatisk bygg OK
- [x] Samtidig invitasjon/engangsaksept, null-parametre, utlogging og tilbakekalling avvist server-side; testdeltakere tilbakekalt, 8 testfiler fjernet og to isolerte prosjekter arkivert
- [x] Én faktisk invitasjon kun til tt@mcsservice.no sendt 22.10.2026 kl. 09:52 UTC; Microsoft 202 / funksjon 200 ok; prosjekt 025618e0-be5d-40b9-907f-c438d46d6ce6 «TEST – ekstern invitasjon tt – 22.10.2026», supplier/standard; malens MCS/prosjekt/avsender/rolle/fragmentlenke kontrollert, ingen andre mottakere
- [x] tt bekreftet korrekt innboksmottak 22.10.2026; publisert lenke viser 404
- [x] 404 årsak: gammel publisert JS uten eksternrute; republisert og kontrollert faktisk publisert URL direkte/reload HTTP 200 med invitasjonsflate. 9 tester besto; publisert aksept/prosjekt/leverandør/reload/Leverandør+Alle kontrollert med eksplisitt mock, ikke ekte token. Ingen nye e-poster eller invitasjoner; tt-token fortsatt ubrukt
- [ ] Bekreft åpning fra mottatt engangslenke (utløp 24.10.2026 kl. 09:52 UTC); deretter trygg opprydding av denne invitasjonen/prosjektet; fortsatt ikke pilotklar

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

## Produksjonsdokumentasjon DLE sak 63210 punkt 3 – 27.10.2026
- [x] Regelverksregister MCS Service AS: 9 aktive poster (El-tilsynsloven, Internkontrollforskriften, FEK, FSE, FEL, FEU, NEK 400:2026, NEK 439-serien, NEK EN 50110-1:2023), ansvarlig Rune Ørbeck, kontroll 27.10.2026, neste 27.10.2027, 12 mnd intervall, kun metadata
- [x] Fagstøtte-profil opprettet: primære NEK 400:2026 + NEK 439-serien, sekundær NEK EN 50110-1:2023, regime nek
- [x] Funn 3 (160c6974): svartekst satt (735 tegn), 9 regelverk koblet som dokumentasjon, status uendret 'new', ikke godkjent/rettet/komplett
- [x] Tilbakelesing verifisert: 9 poster, profil, svartekst og 9 koblinger; ingen andre DLE-punkter endret, ingenting sendt
- [ ] Punkt 3 formell lukking: krever ansvarlig på funnet, godkjent svartekst, rettet-/dokumentasjon-komplett-bekreftelser; ingenting sendt til DLE
- [x] QA-retting 27.10.2026: offisielle Lovdata/DSB/NEK-referanser korrigert på alle 9 poster (El-tilsynsloven 1929, FEK 2013-739, FSE 2006-458, FEU 2017-1598); NEK 439 rettet til samlingsnivå A:2024/B:2025/C:2024; Fagstøtte primary_standards og funn 3-svartekst tilsvarende rettet; status fortsatt 'new'
- [x] Lukkeflyt punkt 3 fullført 27.10.2026: ansvarlig Rune Ørbeck (person), svartekst godkjent av Thomas Treffen (auth-id), forhold rettet + dokumentasjon komplett bekreftet, 9 regelverk koblet som bevis, status documentation_ready (Klar for oversendelse), 9 hendelser logget; andre funn urørt, ingenting sendt til DLE
- [ ] Punkt 3 oversendelse til DLE: krever egen godkjenning; status submitted/approved settes først ved faktisk utsending/lukking
