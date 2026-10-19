# Roadmap

## DLE / ekstern opplasting
- [x] Separate filer, kategorivalg og samlet/separat PDF per post
- [x] Enkeltnedlasting, strukturert ZIP og ryddige eksportnavn
- [x] Implementert valgt e-postutsendelse og filbasert revisjonsspor
- [x] Verifisert eksport med ekte innlogging, nedlastede PDF-er, ZIP og bortvalg; 7 tester grønne
- [ ] Test faktisk sending: én fil, flere filer, ZIP; Thomas bekrefter mottak
- [ ] Til/kopi/flere adresser og sikker tidsbegrenset lenke ved store vedlegg
- [ ] Dokumentversjoner og mottaker/bruker/firma/leveringsmåte i historikken
- [ ] Regresjon: kategori-PDF/original SDS og rettigheter per selskap

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
