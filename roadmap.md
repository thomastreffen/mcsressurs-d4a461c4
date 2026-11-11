# Flerdags kalender ende-til-ende (jobb 60570-funn)

- [ ] Per-dag plankjerne: delt ren TS (bygg plan per jobb×montør×dag, idempotensnøkler, diff for endring/fjerning, Europe/Oslo)
- [ ] Mapping-tabell job_calendar_day_links (migrasjon, GRANT, RLS)
- [ ] calendar-write-sync: én Outlook-hendelse per (jobb, montør, dag) via eksisterende personlig-token-vei; legacy én-hendelse beholdes uten planblokker
- [ ] create-approval: infomail/aksept lister ALLE planlagte dager
- [ ] UI: per-dag/per-montør leveringsstatus + samleindikator; montørflate «Outlook mangler»-merke
- [ ] Mock-testharness: flerdag, endret dato, fjernet montør, dobbelklikk/idempotens, partial fail, replay, TZ/DST
- [ ] Full test + build + deploy; job-outlook-app-sync forblir AV/dry-run
