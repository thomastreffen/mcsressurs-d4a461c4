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
