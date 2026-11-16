# Frittstående Ressursplan-oppgave – 16. november

- [x] Migrasjon 0098 aktiv: standalone task tillatt, child/root/company-/blokkvalidering beholdt; phantom-forsøk har 0 events/assignments/blocks
- [x] Invoker-RLS atomisk task-oppretting med tildeling/dager/idempotens; vedlegg før informasjonsvarsling, eksplisitt logget fravalg, task uavhengig av Tripletex master
- [x] 923 tester bestått; isolert PC/mobil Oppgave→PDF→info uten approval verifisert; build OK; app-only OFF/dry_run ON
- [ ] Ny opprettingsflyt må publiseres; Thomas tester neste ordinære oppgave med egen konto, kvittering og jobbinfo – ingen live tester/utsending utført

# Varslingshull JOB-000420 – 16. november

- [x] Flytsjekk: nye prosjekter/konvertering/henvendelse, drag/drop/resize, prosjektinnstillinger, resends, påminnelser og databasekø; resterende jobbvarslingshull rettet uten live utsending

- [x] 420: kun opprettet/tildelt i event_logs; ingen kanal/approval/notification/activity, intet fravalg bevist. 6/19 nyere planlagte ikke-testtitler uten mailaudit; fem har approval, historisk levering ukjent
- [x] Stille task-gren sender nå info uten godkjenning; mottakerutvalg for ny tildeling, feilkvittering/fravalgsaudit og timestamp-deduplikering rettet
- [x] Migrasjon 0097: service-only atomisk e-postclaim, akseptert/ukjent aldri replay; 906 tester og isolert PC/mobil, ingen utsending/produksjonsrader endret
- [ ] UI må publiseres; kontroller neste ordinære jobb med egne kontoer og kvittering per mottaker, ikke resend historikk. Eksakt historisk 420-feil ikke bevist

# Ett trykk til jobbinfo – 16. november

- [x] Revidert tildeling/tidsendring/resend/info/påminnelse/endringsmail; tydelig varig jobbinfohandling, separate svarlenker og uendrede fulladresser
- [x] Kalenderens delegated og app-only single/per-day deler operativ HTML; eldre ms-calendar/confirm-lenker rettet; ingen writes kjørt
- [x] Mottakerspesifikke maildager, planleggerens teamdager og Mine-direktelenke; auth-retur i URL bevarer jobb uten delt PWA-storage, auth/RLS/gates beholdt
- [x] 60570: begge mailkanaler 202 uten verification_signal, Mats personlig kalenderfeil og pending 0 forsøk, Emil to synkede dager; ingen leveringsløfte
- [x] Funksjoner deployet; 901 tester bestått, bygg OK og PC/mobil/eget innloggingsvindu med mock kontrollert; ingen utsending/dataendring
- [ ] Publisering av Mine/innloggingsretur kreves; Mats faktisk konto, ekte OAuth/PWA og Outlook-visning må testes av brukerne etter publisering, kalender RAOP/pilot fortsatt blokkert

# Falsk tilgangsnekt på jobbinfo – 16. november

- [x] Flytkontroll: akseptlenke viser lesefeil fremfor stille Min dag-fallback; full oppdragsside skiller feil og tilbyr sikker jobbinfo; Min dag bruker technician-id via login, ikke antatt person-id; fremtidige påminnelser/endringsvarsler peker til jobbinfo
- [x] Mine-listens relevans, mobilhjem, innloggingsretur, egen-tildeling-RPC, company/RLS og kalender-/godkjenningslenker lest; 73 isolerte tester, ingen historikk/tilgang/sendingsendringer
- [x] Rett gammel planleggerrettighet som sperrer superadmin; behold caller-RLS og selskapsavgrenset visning, ingen endring av rettigheter
- [x] Skill autentisering, reell tilgangsnekt og teknisk feil; isolerte autentiserte jobbkall og PC/mobil/eget-vindu kontrollert
- [x] Deploy job-access lesefunksjon; eksisterende jobb er MCS Service AS og ikke slettet
- [ ] UI krever publisering; faktisk Thomas/Mats-bearer og standalone-innlogging må kontrolleres av brukerne (ingen autorisert kontoovertakelse)

# Kalenderstatus fra jobbskuff – 16. november

- [x] Skill historisk personlig feil, aldri forsøkt kø, faktisk Graph-feil og akseptert e-post
- [x] Trygge kalenderknapper fra lesebekreftet personlig kobling; ingen dispatcher/full resend; lesepunkt deployet
- [x] Auditvisning for utgått/ukjent mottaker uten å endre kø; 875 tester bestått, siste bygg OK, isolert PC/mobil kontrollert
- [ ] Publisering av jobbskuffens UI kreves; faktisk innlogget produksjonsvisning ikke testet, ingen produksjonswrites/utsending

# Montørens jobbinfo – 16. november

- [x] Flow-sjekk: Min dag, Mine, kalender, PC/mobil jobbhjem, jobbinfo, akseptlenke, infomail/påminnelse, RLS/RPC og varseltrigger lest; rette visning av rejected/reschedule_requested i tre svarvisninger
- [x] Egen tildeling viser jobbinfo også med planleggerrettighet; planlegger ser direkte events.description uten bestillingstilgang

- [x] Read-only diagnose: Mats aktiv tildeling/ansettelse/modultilgang; rejected filtreres ikke i Min dag/Mine; full description finnes, PC-forside manglet direkte jobbinfo
- [x] Delt jobbinfo på Min dag og montørens prosjekthjem: egne arbeidsdager, separate montørsvar; job-access deployet, ingen status-/dataendringer
- [x] 868 tester + siste build OK; jobbinfo visuelt mocktestet PC/mobil; RLS testet isolert; ingen innlogging som Mats eller utsending
- [ ] Mats faktiske appsession/valgt visning ikke verifisert uten godkjent innlogging; publisering av UI må utføres av eier

# Kalenderpilot – trygg velger 16. november

- [x] Erstatt UUID-felt med jobbsøk, tildelt montør og faktiske arbeidsdager; eksplisitt dagbekreftelse (tidligere fullført)
- [x] Lesetest før simulering; ingen frigivelse/skriving uten separat godkjenning (tidligere fullført)
- [x] Isolerte tester; produksjonsdata kun lest (tidligere fullført); pilotkortets egen visuelle verifisering ikke del av denne jobbskuffrettelsen

# Godkjenningsvarsler 12. november

- [x] Read-only diagnose: 8 approved + 8 all_approved fra global admintrigger, 5 approval_pending fra handle-approval; ingen dokumentert push-levering
- [x] Én transaksjonell kilde, relevant mottakerutvalg og overgangsidempotens; migrasjon 0093 aktiv og handle-approval deployet
- [x] Isolerte tester: én/flere montører, tilgang, køet samtidighet/replay, rollback og selvvarsling; 802 tester bestått
- [x] Verifisering: produksjonstriggere aktive, eksisterende 21 rader urørt, sentral app OFF/dry-run ON; ingen produksjonsrespons testet

# Flerdags kalender ende-til-ende (jobb 60570-funn)

- [x] Per-dag plankjerne: delt ren TS (bygg plan per jobb×montør×dag, idempotensnøkler, diff for endring/fjerning, Europe/Oslo)
- [x] Mapping-tabell job_calendar_day_links (migrasjon, GRANT, RLS)
- [x] calendar-write-sync: én Outlook-hendelse per (jobb, montør, dag) via eksisterende personlig-token-vei; legacy én-hendelse beholdes uten planblokker
- [x] create-approval: infomail/aksept lister ALLE planlagte dager
- [x] UI: per-dag/per-montør leveringsstatus + samleindikator; montørflate «Outlook mangler»-merke
- [x] Mock-testharness: flerdag, endret dato, fjernet montør, dobbelklikk/idempotens, partial fail, replay, TZ/DST
- [x] Full test (751 grønne) + deploy; job-outlook-app-sync forblir AV/dry-run
- [ ] Publisering av tidligere UI-endringer må bekreftes av eier; ikke del av godkjenningsrettelsen
- [ ] Mats kalenderdekning blokkeres av manglende personlig kobling inntil sentral app har secrets + godkjent Graph-pilot; Emil 60570 begge dager bekreftet, ingen replay
