# Intern tverrsamhandling i Planlegging – arkitektur v2 (kun plan)

Ingen bygging, e-post, varsler, testoppgaver eller Ressursplan-jobber i denne runden.

## 1. Låste prinsipper

- Prosjekt = felles arbeidsrom på tvers av MCS.
- Person = mottaker av oppgaver.
- Selskap/avdeling = ansvar, tilgang og organisatorisk kontekst – settes per oppgave.
- Ressursplan = kalender/kapasitet, kun for faktisk planlagt arbeid.
- Service, BusBar og Elektrotavler oppleves som én organisasjon: man søker «Lars Erik», Hub finner riktig selskap/avdeling.
- En vanlig oppgave lager aldri automatisk en Ressursplan-booking. «Planlegg i Ressursplan» er en eksplisitt handling som går via eksisterende arbeidspakke/oppdrag – ingen parallell bookingmotor.
- `planning_tasks` er eneste kilde. Samme oppgave vises flere steder, men er ett objekt med én ferdigmelding.

## 2. Kartlegging: kobling person ↔ innlogging (kun lest)

Det finnes allerede en tabell for dette: `user_accounts` (`auth_user_id`, `person_id`, `company_id`, `is_active`), med hjelpefunksjonen `get_user_account_id(auth_user_id)`.

Datakvalitet i dag:

| Kontroll | Resultat |
|---|---|
| Koblinger totalt / aktive | 16 / 15 |
| Innlogging koblet til flere personer | 0 |
| Person koblet til flere innlogginger | 0 |
| E-post på person ≠ e-post på innlogging | 0 |
| Aktive personer uten innlogging | 1 av 16 |
| Brukere med selskapstilgang uten personkobling | 0 av 14 |
| Personer med flere aktive ansettelser | 2 |

Konklusjon: vi lager ingen ny tabell. `user_accounts` blir den eneste koblingen person ↔ innlogging. Den er allerede entydig og stemmer med e-post. `people` og `user_memberships` får ikke nye ID-kolonner.

Må avklares i steg 1 (kun lesing og en liten databaseendring):
- `user_accounts.company_id` er ikke en ansettelse. Den skal ikke brukes som ansvarslinje – det gjør `employment_profiles` og oppgavens eget selskap/avdeling.
- Sjekk at det finnes unike indekser på aktiv `auth_user_id` og aktiv `person_id`. Legg dem til hvis de mangler, slik at koblingen ikke kan bli tvetydig senere.
- Legg til felter for revisjonsspor: `verified_at`, `verified_by` og `link_source` (auto_exact_email / admin).

## 3. Koblingsregler

- Automatisk kobling bare når alt er entydig: én aktiv person, én aktiv innlogging, samme e-post (små bokstaver, uten mellomrom) og aktiv ansettelse i et MCS-selskap. Lagres med `link_source = auto_exact_email`.
- Alt annet havner i en enkel gjennomgangsliste under Admin → Personer: ingen treff, flere treff eller motstridende ansettelse. Admin bekrefter eller avviser på siden, uten modal.
- Når mottaker skal finnes, brukes alltid `user_accounts`. Vi slår aldri opp på e-post.
- Person uten bekreftet kobling kan fortsatt få oppgaver, men avsender ser «Kan ikke varsles ennå».
- Flere ansettelser: personen er én, men oppgaven har eget selskap/avdeling. Primæransettelsen foreslås og kan endres.

## 4. Spor A – oppgave til person

Oppretting og tildeling
- Én personvelger med søk på tvers av MCS. Når en person velges, foreslås selskap og avdeling fra primæransettelsen. Server sjekker ved lagring at personen faktisk er ansatt der.

Visning
- Ny RPC `my_planning_tasks()` henter oppgaver der `assignee_person_id` = innlogget brukers person (via `user_accounts`). Den gir bare ut tittel, frist, status, prosjektnavn og ansvarslinje, aldri økonomi.
- Vises i «Mine oppgaver» / «Min dag» (hovedflate) og på den generelle Oppgaver-siden med merket «Planlegging · prosjekt». Ferdigmelding går til samme rad.

Varsler – bare i Hub som standard
- Tildelt / omfordelt: Hub-varsel til ny mottaker.
- Ferdigmeldt: Hub-varsel til avsender (`created_by`). Ingen e-post.
- Ansvarlig endret: Hub-varsel til avsender.
- Sendt tilbake: Hub-varsel til avsender, og oppgaven går tilbake til «Ikke tildelt».
- E-post er ikke på som standard. Senere kan den bli et valg per oppgave («Viktig – send e-post»), bak en hovedbryter per selskap.
- Alle varsler går via en utboks i databasen, laget av triggere eller RPC. Hver rad har en idempotensnøkkel (`task_id + hendelse + revisjon`). Ingen varsel til seg selv, ingen varsel uten bekreftet kobling, og ingen varsler for de 10 oppgavene som finnes i dag.

Omfordeling og «Kan ikke utføre»
- RPC `reassign_planning_task(task_id, to_person_id, reason)`: mottaker eller planlegger kan flytte oppgaven til en kollega i oppgavens eget selskap. Flytting til et annet selskap krever et eksplisitt valg og planleggertilgang. Hver flytting logges i `planning_activity` med fra/til.
- RPC `return_planning_task(task_id, reason)`: mottaker sender oppgaven tilbake med begrunnelse. Ingen godkjenningsflyt.

## 5. Spor B – planlagt arbeid (uendret retning)

- «Planlegg i Ressursplan» på en oppgave lager eller velger en arbeidspakke med oppgavens ansvarslinje, dato og tid, og kaller `send_planning_wp_to_resource_plan`.
- Utvides med eget tidsvindu (i dag alltid 07–15) og mottakeren som forslag til bemanning. Selskapets planlegger bekrefter.
- Bemanning leses tilbake live via `get_planning_wp_staffing`.

## 6. Risikoer og tiltak

| Risiko | Tiltak |
|---|---|
| Varsel til feil person | Bare via `user_accounts`; unike aktive indekser; gjennomgangsliste for usikre koblinger |
| Dobbel oppgave eller ferdigmelding | Én kilde (`planning_tasks`), visninger leser bare fra den |
| Dobbelt varsel | Utboks med unik idempotensnøkkel |
| Feil selskap/avdeling | Sjekkes mot ansettelse på serveren; skifte av selskap krever eksplisitt valg |
| Tilgangslekkasje | Mottakers RPC gir bare ut egne oppgaver uten økonomi; RLS på prosjektet er uendret |
| Støy i produksjon | E-post av, ingen varsler bakover i tid, test bare med isolerte testpersoner |

## 7. Trinnvis innføring

1. Koblingsgrunnlag: unike indekser og revisjonsspor på `user_accounts`, automatisk kobling bare for entydige treff, og gjennomgangsliste for resten. Ingen varsler.
2. Personvelger på tvers av selskaper og server-side sjekk av ansettelsen.
3. `my_planning_tasks` i «Mine oppgaver», «Min dag» og på Oppgaver-siden. Kun visning.
4. Utboks og Hub-varsler (tildelt, ferdig, omfordelt, sendt tilbake). Testes bare med isolert testperson.
5. Omfordeling og «Kan ikke utføre» med historikk.
6. «Planlegg i Ressursplan» fra oppgave via arbeidspakke, med eget tidsvindu. Testes bare mot isolert testselskap.
7. Senere, valgfritt: e-post for viktige oppgaver, bak hovedbryter.

## Tekniske notater

- Hver regel får egne tester: ingen varsel uten kobling, ingen varsel til seg selv, flytting til annet selskap avvises uten rettighet, idempotensnøkkelen hindrer dobbelt varsel, mottakers RPC skjuler andres oppgaver og økonomifelt.
- Beslutningen «`user_accounts` er eneste kobling person ↔ innlogging» føres i AGENTS.md når vi bygger.
