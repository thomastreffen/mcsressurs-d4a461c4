# Roadmap – Hub-dokumentasjon → Tripletex

- [x] A0/A1/A3: Skjemaintegritet, serverkontroll, autolagring, bildelagring (migrasjon 0081)
- [x] A1.5 Kravmatrise (grunnlag levert; maler mangler faglig godkjenning, godkjennere ikke tildelt) per selskap (jobbtype/arbeidstype, regelversjon, betingede krav) med to faste kategorier per jobb: Risikovurdering/SJA + Avslutningsdokumentasjon; snapshot på jobb ved planlegging/oppstart; ukjent jobbtype/feil = «Dokumentasjonskrav må avklares»; lederstyrte tillegg/unntak/likeverdig dokument med audit, montør kan kun be om «ikke relevant»
- [~] A1.6 Fremdrift (lesevisning på Min dag levert; separate statuser kontroll/godkjent/fakturaklar gjenstår) på Min dag/jobbkort: «Fullfør sluttkontroll», separate statuser (Arbeid utført / Dokumentasjon fullført / Til kontroll / Godkjent / Klar for faktura)
- [ ] A1.5b Dokumentasjonsrettigheter: ansvarlig montør fyller/signerer egen jobb; hjelpearbeider avgrenset; signere-som-utførende ≠ faglig godkjenning ≠ dispensasjon; per person/rolle/skjematype på eksisterende permission-system; server/RLS + rollematrise-tester
- [ ] A1.7 Fail-closed port «Dokumentasjon komplett» + Hub «Klar for fakturering», bak av-bryter per selskap (ingen massaktivering)
- [ ] A1.8 Auditert unntak for hele skjema (autorisert rolle, begrunnelse); N/A-begrunnelse per punkt etter malpolicy
- [ ] A1.9 Oversikt for installatør/PL + målrettet påminnelse/eskalering (aldri til alle admins)
- [ ] A2/A4: Tegnet signatur, PDF-snapshot, PL-godkjenning/retur
- [ ] B: Tripletex TEST-arkivering
- [ ] C: Fakturavedlegg (manuelt valg først)
- [ ] Superadmin-UI for å tildele unntaksgodkjennere (i dag kun via server)

## Outlook ↔ Hub toveis (Rune, 10.11)
- [x] Etappe 1 gap/kontrakt (.lovable/outlook-hub-2way/gap-and-contract.md)
- [x] Etappe 2 trygg import: privat=Opptatt, selskapsavgrenset forslag, ingen auto-kobling, kansellering, synkstatus
- [x] Etappe 2c svarstatus per deltaker + «Avtale»-merking (avslått skjules)
- [ ] Etappe 2b synkstatus/403 synlig i Ressursplan-admin
- [ ] Etappe 3 Hub-oppgave → Outlook (app-token, flagg AV)
- [ ] Etappe 4 Outlook-endring → Hub med konflikt (flagg AV)
- [ ] Etappe 5 kontrollert test på isolert postkasse (venter godkjenning)
- [ ] BLOKKERT: Microsoft-tilgang for Eirik, Hans Jakob, Lars Erik, Rune (Thomas/Simen)
- [ ] Ressursplan rekkestruktur: jobber øverst, avtaler under, kronologisk, +N, legend, filter Alle/Jobber/Avtaler, «13–13»-analyse
