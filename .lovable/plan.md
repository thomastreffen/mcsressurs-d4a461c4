# Intern tverrsamhandling i Planlegging – arkitekturvurdering (kun plan)

Ingen bygging, testdata, e-post, varsler eller Ressursplan-jobber i denne runden.

## 1. Dagens modell – hva som finnes

Bekreftet i databasen:
- `planning_tasks` har `company_id`, `department_id`, `assignee_person_id` (peker på `people`), `due_date`, `status`, `completed_at/by`. Ingen triggere – oppretting gir i dag verken varsel, e-post eller Ressursplan-oppdrag. Kun 10 rader totalt.
- `planning_work_packages` har `responsible_company_id/department_id/person_id`, `linked_event_id`, `assignment_state`.
- `send_planning_wp_to_resource_plan` er SECURITY DEFINER, idempotent (låser pakken, gjenbruker aktivt oppdrag), legger `events.company_id/department_id` fra pakkens ansvarslinje og logger i `planning_activity`. Dette er riktig mønster for spor B.
- Bemanning flyter allerede tilbake live via `get_planning_wp_staffing` (ikke lagret).
- `notifications` har `user_id`, `company_id`, `entity_type/entity_id`, `link_url`, `push_status` – kan gjenbrukes for Hub-varsel.
- Generell `tasks`-modul (`tasks` + `task_assignees`, `useTasks`) er brukerbasert (`user_id`) og skriver varsler fra klienten.
- `people` har ingen `user_id`; ansettelse ligger i `employment_profiles` (person, selskap, avdeling, `is_primary`).

Mangler:
- Kobling person → innlogget bruker som er entydig og verifisert for varsling (må kartlegges før bygging; ikke bekreftet hvor den ligger i dag).
- «Mine oppgaver» henter ikke `planning_tasks`.
- Ingen server-side varsel/e-post ved tildeling/endring/ferdigmelding.
- Ingen eksplisitt «Planlegg i Ressursplan» for en enkeltoppgave.
- Velgeren krever at brukeren velger firma → avdeling → person (silo-tenkning i UI).

## 2. Anbefalt arkitektur (enklest robust)

```text
Planlegging-prosjekt (felles)
 ├─ Oppgave (spor A)  ── tildelt PERSON ──> Mine oppgaver + Hub-varsel + e-post
 │     └─ «Planlegg i Ressursplan» (valgfritt) ──> oppretter/kobler arbeidspakke ──> spor B
 └─ Arbeidspakke (spor B) ── ansvarlig SELSKAP/AVDELING ──> events i riktig Ressursplan
                                └─ bemanning/status leses live tilbake
```

Spor A – oppgave til person
- `planning_tasks` forblir eneste kilde (ingen kopi til `tasks`). «Mine oppgaver» får en ekstra kilde som leser via én RPC `my_planning_tasks()` (personens egne, på tvers av selskap, kun tittel/frist/prosjektnavn – ingen økonomi).
- Person velges først (søk på navn på tvers av MCS). Ansvarlig selskap/avdeling utledes server-side fra personens primære `employment_profiles`, kan overstyres hvis personen har flere ansettelser. Brukeren slipper å vite at Lars Erik er i BusBar.
- Varsling skjer i databasen/edge function, aldri fra klienten: trigger på insert/endret `assignee_person_id`/ferdigmelding legger en rad i en utboks-tabell (idempotent nøkkel `task_id + hendelse + versjon`). Eksisterende e-postmotor (Graph via postkontoret) sender; Hub-varsel skrives i `notifications`. Ingen varsel til seg selv.
- Hovedbryter per selskap (av som standard) slik at ingenting sendes før dere slår det på.

Spor B – planlagt arbeid
- Ressursplan berøres kun via arbeidspakke. «Planlegg i Ressursplan» på en oppgave = opprett (eller velg) arbeidspakke med oppgavens ansvarslinje, dato og tid, og kall eksisterende `send_planning_wp_to_resource_plan`. Oppgaven får `work_package_id`; ingen ny event-vei.
- Funksjonen utvides med eksplisitt tidsvindu (i dag fast 07–15) og forhåndsvalgt person som forslag – selskapets planlegger bekrefter bemanning i egen Ressursplan.

## 3. Selskap, medlemskap og identitet

- Tre lag holdes adskilt (som i dag): ansettelse (`employment_profiles`) = hvem personen er og hvor ansvaret ligger; systemtilgang (`company_module_access`) = hva brukeren kan se; prosjekttilgang (`has_planning_project_access`) = hvilket prosjekt.
- Å være mottaker av en oppgave gir tilgang til den oppgaven og prosjektets felles innhold (tittel, oppgaver, ikke økonomi), ikke til mottakerselskapets eller avsenderselskapets øvrige data.
- Økonomi (pris, timepris, fakturering mellom selskaper) vises kun med finansrettighet i respektive selskap – som i dag.
- Varsel krever entydig person → bruker. Mangler bruker eller er den tvetydig: ingen e-post, oppgaven merkes «Mottaker kan ikke varsles» for avsender.

## 4. Risikoer og tiltak

| Risiko | Tiltak |
|---|---|
| Duplikat Ressursplan-oppdrag | Kun via arbeidspakke + eksisterende låst, idempotent RPC; unik indeks på `events.planning_work_package_id` for aktive rader |
| Duplikat varsel/e-post | Utboks med unik idempotensnøkkel; sending markerer status; retry gjenbruker raden |
| Feil selskap/avdeling | Utledes server-side fra ansettelse ved lagring; validering at avdeling tilhører selskapet og at personen er ansatt der; endring logges |
| Varsel til feil person | Kun verifisert person → bruker; ingen e-post-gjetting på navn; flere ansettelser → eksplisitt valg |
| Tilgangslekkasje | Ny RPC returnerer kun egne oppgaver; ingen bred SELECT; økonomifelt aldri i «Mine oppgaver»; eksterne berøres ikke (egen modell) |
| Produksjonsstøy ved innføring | Hovedbryter av, ingen backfill-varsler for eksisterende 10 oppgaver, testing kun med isolerte testpersoner og avslått utsending |

## 5. Trinnvis innføring

1. Kartlegg person → bruker-kobling og ansettelser for de tre selskapene (kun lesing). Avklar dobbeltansettelser.
2. «Mine oppgaver» viser planleggingsoppgaver (kun lesing, ingen varsler). Personvelger på tvers med utledet ansvarslinje.
3. Varslingsutboks + Hub-varsel, hovedbryter av; verifiseres med isolert testperson og mock-sending.
4. E-post via eksisterende motor, slås på per selskap etter godkjenning.
5. «Planlegg i Ressursplan» fra oppgave via arbeidspakke, med tidsvindu; testes mot isolert testselskap/testmontør, aldri ekte montører.
6. Tilbakeflyt: oppgave/arbeidspakke viser bemanning og status fra riktig selskaps Ressursplan (gjenbruk `get_planning_wp_staffing`).

## Åpne spørsmål til dere

- Skal ferdigmelding varsle avsender på e-post, eller kun i Hub?
- Skal mottaker kunne avvise/omfordele en oppgave til en kollega i eget selskap?
- Skal planleggingsoppgaver også vises i den generelle Oppgaver-siden, eller kun i «Mine oppgaver»/Min dag?
