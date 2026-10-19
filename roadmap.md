# Roadmap

## Klokkeslett hos montør
- [ ] Rett UTC/Oslo-visning i utsending og relevante mottakerflater uten å endre registrerte tidspunkt
- [ ] Test 06:00–14:00 i sommer- og vintertid og montørspesifikke tidspunkt
- [ ] Verifiser utsendingsinnhold og publiser korrigerte utsendingsfunksjoner

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
