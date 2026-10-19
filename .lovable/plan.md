# TPX-000 – Prosjektmodell i MCS før Tripletex blir sannhet for økonomiske prosjekter

Kun analyse og plan. Ingen kode, migreringer eller dataendringer i denne runden.

## 1. Nåsituasjon (verifisert i database 19.10.2026)

Alle oppdrag ligger i `events`. Ingen er arkivert. Alle 259 aktive tilhører MCS Service AS – de to andre selskapene har ingen oppdrag i Hub ennå.

```text
project_type  antall  m/prosjektnr  m/Tripletex-ID  m/kunde  m/Outlook
project        181        58             60            58       110
task            44         0              0             0        27
service         34         0              0             1        29
```

Struktur som allerede finnes:
- `parent_project_id`: 44 underobjekter, alle `task` under `project` (fordelt på 14 hovedprosjekter). Ingen service eller prosjekt ligger under et annet prosjekt.
- `merged_into_project_id`: 0 i bruk (feltet finnes).
- `planning_project_id`: 2 oppdrag koblet til 2 planleggingsprosjekter. 5 planleggingsprosjekter, 0 med `linked_event_id`; 1 arbeidspakke med `linked_event_id`.
- `work_package_type` på events: 0 i bruk.
- `tripletex_project_mappings`: 56 rader, alle peker på aktive events. Prosjektnummer er unike (0 duplikater).
- Timer (`worktime_entries`, 1 537): har kolonnene `project_id`, `project_number_raw`, `project_external_ref`, men alle er tomme. Timer er altså ikke knyttet til prosjekt i dag – en klassifisering kan ikke ødelegge timekoblinger.

## 2. Funn: økonomisk prosjekt vs. oppgave

Signaler brukt: prosjektnummer, Tripletex-ID/mapping, kunde-ID, underobjekter, `project_type`, tittelmønster.

```text
Gruppe                                         Antall  Tolkning
A project med prosjektnr/Tripletex-kobling      ~60    Reelle økonomiske prosjekter
B project uten nr, med underoppgaver              ~13   Sannsynlig prosjekt, mangler nr
C project uten nr, uten kunde-ID, uten barn       108   Uklart – stikkprøve viser mest
                                                        enkeltjobber ("utbedring av IK-EL
                                                        avvik", "Bytte 1000A", "Tester tid i
                                                        mail") – 43 opprettet siste 90 dager
D task (alle under prosjekt)                       44   Operative jobber – aldri økonomisk
E service                                          34   Serviceoppdrag – ramme-/serviceprosjekt
```

Hovedfunn: `project_type='project'` betyr i dag «oppdrag i ressursplanen», ikke «økonomisk prosjekt». Rundt 60 % av «prosjektene» er trolig enkeltjobber. Kunde er i praksis fritekst (`customer`) – bare 59 av 259 har kunde-ID.

## 3. Har datamodellen nok struktur?

Nesten. `parent_project_id`, `project_type` og `tripletex_project_mappings` gir et grunnlag, men det mangler:
- et eksplisitt skille mellom «økonomisk prosjekt» og «jobb» (i dag er begge `project`),
- en regel for hvem som kan ha Tripletex-kobling,
- en kobling fra service-jobb til et rammeprosjekt,
- klassifiseringsstatus for historiske poster.

Anbefaling: ingen ny tabell. Utvid `events` med få, additive felt.

## 4. Anbefalt målmodell

```text
Kunde (customers)
  └─ Økonomisk prosjekt   events.entity_type = 'financial_project'
       │                  (eneste type som kan ha Tripletex-kobling)
       ├─ Jobb             entity_type = 'job'      parent_project_id -> økonomisk prosjekt
       ├─ Serviceoppdrag   entity_type = 'service'  parent_project_id -> rammeprosjekt
       └─ (Planlegging)    planning_projects.financial_project_id -> økonomisk prosjekt
              └─ Arbeidspakke -> sendes til Ressursplan som Jobb (aldri økonomisk)
Intern aktivitet          entity_type = 'internal'  aldri Tripletex
```

Nye felt på `events` (alle valgfrie / med standardverdi):
- `entity_type`: `financial_project | job | service | internal | unclassified` (standard `unclassified`).
- `is_framework_project` (bool): rammeprosjekt for service/småjobber per kunde eller selskap.
- `classification_status`: `auto | confirmed | needs_review` + `classified_by/at` og begrunnelse.
- `parent_project_id` gjenbrukes – ingen ny relasjon.

Databaseregler (håndheves på server, ikke bare i skjermbilde):
- Tripletex-kobling kun tillatt når `entity_type='financial_project'`.
- `parent_project_id` må peke på et økonomisk prosjekt i samme selskap.
- Et økonomisk prosjekt kan ikke selv ha forelder (to nivåer, ikke tre).
- `project_type` beholdes uendret for Ressursplan (det styrer kalender/visning, ikke økonomi).

`planning_projects` får `financial_project_id` (valgfri). Planleggingsprosjekt er arbeidsflate/paraply og blir ikke selv Tripletex-prosjekt; det knyttes til et økonomisk prosjekt når det finnes. Arbeidspakker får aldri Tripletex-kobling.

Navneforslag i UI: «Prosjekt» (økonomisk), «Jobb», «Serviceoppdrag», «Intern aktivitet». «Oppgave» reserveres for sjekkliste-oppgaver (`job_tasks`/`planning_tasks`) for å unngå dagens sammenblanding.

## 5. Klassifiseringsregler

Kvalifiserer som økonomisk prosjekt hvis minst én gjelder:
- Har Tripletex-mapping eller `external_tripletex_id` (automatisk, bekreftet).
- Har prosjektnummer (automatisk, bekreftet).
- Har underjobber (forslag, krever bekreftelse).
- Er knyttet til planleggingsprosjekt med pris/budsjett (forslag).

Blir jobb hvis: har forelder, eller er `task`. Blir service hvis `project_type='service'`. Blir intern hvis tittel/kunde peker på eget selskap eller testposter (forslag).
Alt annet: `needs_review`. Ingen regel konverterer automatisk et økonomisk prosjekt til jobb.

Forventet utfall: ~60 automatisk prosjekt, 44 jobb, 34 service, ~120 til manuell kø (gruppe B+C).

## 6. Migreringsstrategi (trygg, i trinn)

1. Legg til felt med standard `unclassified` – ingen eksisterende spørringer endres.
2. Kjør regelmotor som skriver forslag + begrunnelse, aldri sletting eller flytting.
3. Manuell avklaringskø for `needs_review`.
4. Når en enkeltjobb flyttes under et prosjekt, settes bare `parent_project_id`/`entity_type`. ID, ressursplan-blokker, Outlook-hendelse, dokumenter, meldinger og historikk forblir på samme rad. Alle endringer logges i `activity_log` og kan angres.
5. Tripletex-mappinger flyttes ikke; de valideres mot regelen «kun økonomisk prosjekt».
6. Integrasjonen (TPX-002+) får sperre: synk/opprettelse kun for `financial_project` med `confirmed`.

## 7. Avklaringskø (manuell gjennomgang)

Egen side under Prosjekter: liste over `needs_review` med forslag og knapper «Gjør til prosjekt», «Flytt som jobb under …» (søk etter prosjekt), «Serviceoppdrag (rammeprosjekt …)», «Intern». Masseklassifisering med filter (kunde, periode, tittel). Ingen modaler – inline i listen, sidepanel for flytting.

Prioritert manuell gjennomgang:
- de 108 prosjektene uten nummer/kunde/barn (start med de 43 fra siste 90 dager),
- 13 prosjekter med underjobber uten nummer,
- 2 Tripletex-koblede uten matchende prosjektnummer-mapping (60 ID-er vs. 56 mappinger),
- testposter (f.eks. «Tester tid i mail»).

## 8. Service og småjobber

Ett rammeprosjekt per kunde (fast avtale) eller ett felles «Service <selskap> <år>» i Tripletex. Hvert serviceoppdrag i MCS er egen rad med `parent_project_id` → rammeprosjekt, så sporing, dokumentasjon og servicejournal per jobb beholdes. Mot Tripletex sendes kun rammeprosjektet; senere timer/fakturagrunnlag merkes med jobbens referanse som linjetekst.

## 9. Oppretting fremover

«Nytt»-valg i Hub med fire tydelige kort: Prosjekt / Jobb under prosjekt / Serviceoppdrag / Intern aktivitet.
- Jobb krever valg av prosjekt (søk, standard: siste brukte for kunden).
- Serviceoppdrag foreslår kundens rammeprosjekt.
- Ressursplan «hurtig-opprett» lager Jobb eller Serviceoppdrag, aldri Prosjekt.
- «Send til ressursplan» fra arbeidspakke lager Jobb under planleggingsprosjektets økonomiske prosjekt (eller `needs_review` hvis det mangler).
- Kun roller med prosjekttilgang kan opprette økonomisk prosjekt.

## 10. Tripletex-kobling per type

```text
Kan kobles:     Økonomisk prosjekt, rammeprosjekt (også en type økonomisk prosjekt)
Aldri:          Jobb, Serviceoppdrag, Intern aktivitet, arbeidspakke,
                planleggingsprosjekt, ressursplanblokk, sjekkliste-oppgave
```

## 11. Endringer i TPX-001–020

- TPX-001 utvides med beslutning om rammeprosjekt-prinsipp og prosjektnummerering.
- TPX-000 blir forutsetning for TPX-006 (ID-mapping prosjekter), TPX-011–014 (prosjektimport/opprettelse) og alt i fase 2+ (timer, økonomi, fakturagrunnlag).
- TPX-002–005 (tilkobling, hemmeligheter, logg, kø) kan gå parallelt med TPX-000.
- Prosjektmatching i TPX-006 matcher kun mot `financial_project`.
- Timer-fasen bruker `parent_project_id` til å summere jobbtimer opp til økonomisk prosjekt.

## 12. Arbeidspakker TPX-000

- TPX-000a Felt + databaseregler (additivt). Ferdig: alle eksisterende sider fungerer uendret.
- TPX-000b Regelmotor med forslag/begrunnelse. Ferdig: tellingene matcher seksjon 5.
- TPX-000c Avklaringskø og flytting av jobb under prosjekt. Ferdig: flytting bevarer ressursplan, Outlook, dokumenter og historikk.
- TPX-000d Ny opprettelsesflyt med fire valg. Ferdig: ressursplan kan ikke lage økonomisk prosjekt.
- TPX-000e Kobling planleggingsprosjekt → økonomisk prosjekt.
- TPX-000f Gjennomgang med prosjektledere til `needs_review` = 0 for aktive poster.

## 13. Tester

- Tripletex-kobling avvises for jobb/service/intern.
- Forelder må være økonomisk prosjekt i samme selskap; tre nivåer avvises.
- Klassifiseringsregler: prosjektnr → prosjekt, `task` med forelder → jobb, `service` → service, resten → needs_review.
- Flytting endrer ikke event-ID, schedule_blocks, Outlook-ID eller dokumentkoblinger.
- Ressursplan-hurtigopprett gir aldri `financial_project`.

## 14. Ferdigkriterier for TPX-000

- Alle aktive events har `entity_type` ≠ `unclassified` og ingen åpne `needs_review`.
- Alle 56 Tripletex-mappinger og 60 Tripletex-ID-er ligger på bekreftede økonomiske prosjekter.
- Ny opprettelse tvinger valg av type.
- Ressursplan, dokumentasjon og historikk uendret for minst 10 stikkprøver.

## Avklaringer før bygging

1. Ett rammeprosjekt per kunde, eller ett felles serviceprosjekt per selskap/år?
2. Skal småjobber hos kunder uten avtale også gå på rammeprosjekt?
3. Hvem godkjenner at en post blir økonomisk prosjekt?
4. Navnene «Prosjekt / Jobb / Serviceoppdrag / Intern aktivitet» – OK?
