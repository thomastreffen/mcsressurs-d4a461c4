# Roadmap

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
