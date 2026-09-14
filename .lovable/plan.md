# Planlegging / Prosjektboard

## Kort teknisk oppsummering av dagens løsning

Dagens "prosjekt" er raden i `events` (samme tabell brukes for jobber, oppgaver og prosjekter via `project_type`). Den har allerede kunde, selskap, avdeling, prosjektnummer, SharePoint-felter, adresse/site-info, kommersiell sak og risikotagger. Rundt den finnes:

- **Prosjektside**: `src/pages/JobDetail.tsx` med `ProjectHeader`, `ProjectSubnav`, `ProjectRooms`, `ProjectDashboard`, `ProjectScheduleBlocks`, `ProjectFormsSection`.
- **Meldinger**: `conversation_threads` + `conversation_posts` (@nevning, vedlegg, e-post, svar, beslutningsmerking) med `ThreadDetail`/`ThreadList`.
- **Filer**: `docs_files` + `doc_folders` (mapper per prosjekt, tittel + beskrivelse).
- **Oppgaver**: `job_tasks` (kun person-array, ingen avdeling/frist).
- **Arbeidspakker**: `events` med `work_package_type` — knyttet til utført arbeid/avvik, ikke til planlagt ressursbehov per avdeling.
- **Ressursplan**: `events` + `event_technicians` + `schedule_blocks`.
- **Organisasjon**: `internal_companies`, `departments`, `people`, `employment_profiles`, `user_accounts`, `user_memberships`.
- **Kunde/kontakt**: `customers`, `customer_contacts`.
- **Tilgang**: `project_members` (owner/manager/member/follower), `project_spaces`, `check_permission_v2`.

Det som mangler i dag: et paraplylag over flere selskaper med avdelingstildelt ressursbehov *før* personer velges, kontraktsform/økonomi per arbeidspakke, prosjektkontakter og eksterne systemreferanser.

## Anbefalt utvidelse

Nytt tynt paraplylag med egne tabeller, som gjenbruker eksisterende org-, kunde-, meldings- og filsystem via nullbare koblinger. Ingen duplisering av ressursplan, samtaler eller filhåndtering.

### Nye tabeller
- `planning_projects` — navn, kunde, kundekontakt, prosjekteier, ansvarlig selskap/avdeling, status (enum-lignende tekst), periode (start/slutt/uke), beskrivelse, kontraktsform, fakturerende selskap, fakturamottaker, kontraktsverdi, budsjett, estimerte timer/materialkost, `linked_event_id` (kobling til eksisterende MCS-prosjekt), `visibility`.
- `planning_work_packages` — navn, beskrivelse, ansvarlig selskap/avdeling/person, status, planlagt start/slutt, ressursbehov (antall personer, estimerte timer), prisform, avtalt pris/timepris, internfakturering (fra selskap → til selskap), `linked_event_id` for ressursplan-kobling, `assignment_state` (ikke tildelt / tildelt avdeling / tildelt personer / i ressursplan).
- `planning_tasks` — tittel, beskrivelse, status, ansvarlig avdeling, valgfri person, frist, kobling til arbeidspakke.
- `planning_contacts` — navn, firma, avdeling, rolle, telefon, e-post, type (intern/ekstern), kommentar.
- `planning_external_refs` — system (Business Central / SharePoint / Tripletex / MCS / annet), referanse, URL.
- `planning_members` — bruker/person, rolle (eier, ansvarlig, medlem, ekstern), ansvarlig avdeling.

### Gjenbruk
- **Samtale**: nullbar `planning_project_id` på `conversation_threads` — samme `ThreadDetail`-komponent, @nevning og vedlegg.
- **Filer**: nullbar `planning_project_id` på `doc_folders` og `docs_files`, pluss `display_name` og `original_file_name` på `docs_files`. Kategorier = mapper, opprettes fritt.
- **Historikk**: `activity_log` med entitetstype `planning_project`.
- **Org/kunde**: eksisterende `internal_companies`, `departments`, `employment_profiles`, `customers`, `customer_contacts`.

### Statuser
Tidlig planlegging → Sannsynlig → Bekreftet → Klar for ressursplan → Pågår → Fullført / Kansellert. De tre første vises som "sikkerhetsindikator" på kortet.

## Første leveranse (denne iterasjonen)

1. **Board** `/planning` — kortbasert oversikt gruppert på status, med filtre på selskap, avdeling, kunde, status, ansvarlig og periode.
2. **Opprett prosjekt** — lettvekts dialog med kun navn + kunde som påkrevd; resten valgfritt.
3. **Prosjektrom** `/planning/:id` — header (navn, kunde, status, eier, selskap, periode) og faner: Oversikt, Samtale, Arbeidspakker, Oppgaver, Filer, Økonomi, Kontakter, Historikk. Oversikt viser sammendrag av arbeidspakker, ressursbehov, økonomi og siste aktivitet på én side.
4. **Arbeidspakker** — opprett/rediger med avdelingstildeling uten personer, ressursbehov og prisform. Statuskort viser "3 montører / 05.10–08.10 / Ikke tildelt".
5. **Ressursplan-forberedelse** — knapp "Send til ressursplan" som oppretter/kobler et `events`-oppdrag på ansvarlig avdeling og setter `assignment_state`; personvalg skjer i eksisterende ressursplan.
6. **Oppgaver** — enkel liste, avdeling først, person valgfritt, frist.
7. **Filer** — opplasting med kategori (mappe), fritt visningsnavn, originalfilnavn i metadata.
8. **Økonomi** — kontraktsverdi, prisform, fakturerende selskap/mottaker, sum arbeidspakker inkl. intern-/eksternfakturering.
9. **Kontakter** — enkel liste med rolle og type.
10. **Eksterne referanser** — lenkeliste (ingen integrasjon).
11. **Historikk** — viktige hendelser via `activity_log`.

Designet bruker eksisterende shadcn-komponenter, design tokens og sidebar-mønster. Ny sidebar-oppføring "Planlegging" under prosjektområdet, filtrert på eksisterende tilgangsmodell.

## Ikke i denne iterasjonen
Integrasjoner mot Business Central, SharePoint, Tripletex eller e-post; avansert dokumentrevisjon; finmasket ekstern synlighet (datamodellen forberedes, UI-en holdes intern).
