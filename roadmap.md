# Ett trykk til jobbinfo – 16. november

- [ ] Revider alle montørmailer og begge kalenderveier; samme varige lenke, egne godkjenningshandlinger og faktiske mottakeradresser
- [ ] Rett konkrete mal-/flerdagshull; behold eksisterende auth/RLS og alle sendings-/pilotgates
- [ ] Les per-montør kvitteringer for 60570 uten leveringsløfter; isolerte tester og PC/mobil/innloggingsretur
- [ ] Rapporter deploy/publisering og manglende faktisk Mats-/Outlook-verifisering; ingen ekte utsending eller dataendring

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
