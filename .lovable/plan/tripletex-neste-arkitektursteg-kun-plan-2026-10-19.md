# Tripletex – neste arkitektursteg (kun plan)

Verifisert lesende i dag: `internal_companies` (id, name, org_number, is_active), `tripletex_links` (company_id, environment, tripletex_company_id, mcs_entity_type/id, tripletex_id/number/name/version, link_source, status), `tripletex_health_checks`, `planning_projects` (contract_form, contract_value, budget_value, hourly_rate, invoicing_company_id, customer_id, owner_user_id, expected_start/end, financial_project_id, linked_event_id), `planning_work_packages` (price_form, agreed_price, hourly_rate, billing_from/to_company_id), `invoice_basis` (timebasert snapshot, 0 rader). Tripletex OpenAPI (api-test) lest; ingen skriving.

## A) Selskapsavgrenset tilkobling

**Ny tabell `tripletex_connections`** (én rad per Hub-selskap og miljø)
- `company_id` → internal_companies, `environment` ('test'|'production'), unik (company_id, environment)
- `secret_name` (navn på serverhemmelighet, f.eks. `TRIPLETEX_TEST_API_TOKEN__MCS_SERVICE`; aldri verdi)
- `expected_tripletex_company_id` (bigint, påkrevd før aktivering), `verified_org_number`
- `mode`: off | read_only | write_enabled; `capabilities` text[] (customers_read, projects_write, archive_write, timesheet_read, order_draft …)
- `last_health_status/at/request_id`, `enabled_by/at`, `disabled_reason`
- Unik indeks på (environment, expected_tripletex_company_id) → samme Tripletex-selskap kan aldri kobles til to Hub-selskaper.

**Harde vakter (i felles serverhjelper `_shared/tripletex-client.ts`)**
1. Hver kall tar `company_id` + `environment`, slår opp tilkoblingen server-side, henter hemmeligheten ved navn.
2. Etter session: `whoAmI.companyId` må være lik `expected_tripletex_company_id`, ellers avbrudd + logg `wrong_company`.
3. Kildeobjektets `company_id` (event/kunde) må være lik tilkoblingens `company_id`; ellers avbrudd før nettverkskall.
4. Base-URL velges fra fast tabell per miljø; production avvises inntil eget flagg er satt.
5. Skriving krever `mode='write_enabled'` og aktuell capability.

**`tripletex_links`** utvides additivt: `connection_id` (FK), trigger som krever at (company_id, environment, tripletex_company_id) matcher tilkoblingen, og at `mcs_entity_type='event'` peker på event med samme company_id og `entity_type='financial_project'` (finnes delvis allerede). Unike indekser: (connection_id, tripletex_type, tripletex_id) og (connection_id, mcs_entity_type, mcs_entity_id) der status aktiv.
**Migrering:** opprett test-tilkobling for MCS Service (88777230), backfill `connection_id` på eksisterende 60488-lenke (210411444); deretter NOT NULL.

**Admin UI** `/admin/integrasjoner/tripletex`: én kort per Hub-selskap × miljø – status, verifisert Tripletex-selskap, modus-velger, capabilities, siste helsesjekk, «Test tilkobling», antall lenker/feil. Den eksisterende testsiden foldes inn her.

**Tilgang/audit:** kun super_admin endrer tilkoblinger; økonomi-modul (`has_company_access(..,'economy','manage')`) for Opprett/Koble per selskap. Ny `tripletex_operations` (operasjonslogg = kø + audit): connection_id, operation, idempotency_key unik, mcs ref, status, attempts, http_status, request_id, actor, payload_hash (ingen persondata/token).

## B) Økonomisk prosjektprofil

Gjenbruk `planning_projects` som profil for et bekreftet økonomisk prosjekt (har allerede kontrakt, verdi, sats, kunde, fakturerende selskap, datoer, `financial_project_id`). Ikke ny tabell. Additive felt:
- `billing_model` enum: fixed_price | time_and_material | service_framework | internal (erstatter fritekst `contract_form`, som merkes deprecated etter backfill)
- `customer_reference` (PO/kundereferanse), `project_manager_person_id` (Hub-person; Tripletex-ansatt-ID via tripletex_links type employee)
- `economic_state`: draft | needs_review | ready_to_link | linked | conflict
- `ready_for_invoicing_at/by`
Kobling: `planning_projects.financial_project_id` → event med entity_type financial_project; én profil per økonomisk prosjekt (unik).

**Feltregler:**
- Hub eier: billing_model, contract_value, hourly_rate/prisgrunnlag, customer_reference, prosjektleder, datoer, fakturerende selskap (før kobling).
- Tripletex eier etter kobling: prosjektnummer, intern ID, regnskapsstatus (lukket), faktiske timer/kostnader/fakturert.
- Speilet/låst etter kobling: kunde, fakturerende selskap (= tilkoblingens selskap), prosjektnummer. Endring krever eksplisitt «Oppdater i Tripletex».

**Fastpris-vakt:** DB-sjekk + kodebane: `billing_model='fixed_price'` krever contract_value > 0; `invoice_basis` og fremtidig ordreutkast for fastpris bygges fra fakturaplan/delbeløp, aldri fra timesummer; timer vises kun som kostnadskontroll. T&M krever sats (prosjekt eller arbeidspakke).
**Krav før «klar for fakturering»:** linked, kunde koblet i samme tilkobling, billing_model satt, fastpris → verdi/plan, T&M → sats + godkjente timer, PO hvis kunden krever, ingen åpne konflikter.

## C) Tripletex API-funn (OpenAPI v2, api-test)

**1. Ressursplan/kalender i Tripletex-appen**
- Dokumentert kun lesende: `GET /project/resourcePlanBudget`, `GET /project/capacityPlan/budget` (budsjettert kapasitet, ikke avtaler).
- Ingen endepunkt for avtaler/oppgaver/kalenderoppføringer per ansatt funnet. Produktets planleggingsvisning har ikke dokumentert skrive-API.
- Tilgjengelig alternativ: `POST /project/participant` (ansatt som deltaker → prosjektet vises i timeføringslisten), `/activity` + `/activity/>forTimeSheet`, `/project/hourlyRates`. Testbart i TEST.
- Konklusjon: Hub kan ikke legge avtaler i Tripletex-appen; Hub kan sørge for at montøren er prosjektdeltaker så riktig prosjekt dukker opp ved timeføring. Kalender forblir Outlook.

**2. Dokumentarkiv**
- `POST /documentArchive/project/{id}` (multipart, BETA) – laste opp; `GET /documentArchive/project/{id}` – liste; `GET /document/{id}` og `/document/{id}/content` – nedlasting; `PUT/DELETE /documentArchive/{id}`. Tilsvarende for customer/employee.
- Mapper/hierarki: ikke dokumentert (flat liste per objekt).
- Fakturavedlegg: `PUT /order/{id}/:attach` med `addToInvoiceMode` / `addToOrderMode` – vedlegg knyttes til ordre og kan følge fakturaen. Ikke direkte «merk arkivdokument som fakturavedlegg».
- BETA = kan endres; testes i TEST før bruk.

## Fasesekvens

1. **TPX-F1 Grunnmur** – tilkoblinger, vakter, operasjonslogg, admin-side, backfill 60488.
   Akseptanse: kall med MCS Service-data mot annen tilkobling avvises før nettverk; wrong_company stoppes; modus off blokkerer alt. Tester: selskapsmismatch, miljømismatch, dobbel tilkobling til samme Tripletex-selskap avvises, idempotency_key unik.
2. **TPX-F2 Opprett/Koble prosjekt i Hub** – økonomisk profil, knapper på prosjektkortet, kunde må være koblet først, reservert pending-lenke før create, søk på nummer før retry.
   Akseptanse: dobbeltklikk/timeout gir ett prosjekt; ikke-financial_project kan ikke kobles. Tester: retry etter timeout, eksisterende nummer → «koble» i stedet for opprett, fastpris uten verdi blokkeres.
3. **TPX-F3 Ressursplan → prosjektdeltaker** (ikke kalender) – ved tildeling legges montørens Tripletex-ansatt som deltaker.
   Akseptanse: montør ser prosjektet i timeføring i Tripletex-appen (manuell verifikasjon i TEST). Test: idempotent deltakeropprettelse, ukoblet ansatt → varsel, ingen feil i Hub.
4. **TPX-F4 Dokumentasjon → prosjektarkiv** – gjenbruk dokumentasjonsleveransen; valgte filer lastes opp til prosjektarkivet; senere fakturavedlegg via ordre.
   Akseptanse: kun filer brukeren valgte, logget med versjon; kun samme selskap. Tester: filstørrelsesgrense, BETA-feil håndteres, ingen dobbel opplasting ved retry (hash).
5. **TPX-F5 Faktisk økonomi/timer inn** – periodisk lesing av `/timesheet/entry`, prosjektstatus, fakturert; erstatter CSV-import av timer til `worktime_entries` med source_hash.
   Akseptanse: tall matcher Tripletex for testprosjekt; kun økonomitilgang ser dem. Tester: dublettfri gjentatt synk, rate limit-backoff.
6. **TPX-F6 Kontrollert fakturautkast** – ordre (ikke faktura) i Tripletex fra «klar for fakturering», aldri sendt automatisk; vedlegg via `:attach`.
   Akseptanse: fastpris bruker fakturaplan, ikke timer; ett utkast per grunnlag. Tester: fastpris-vakt, idempotens, manglende PO blokkerer.

## Avklaringer før F1
- Navngiving av hemmeligheter per selskap/miljø, og hvem i Busbar som lager deres test-nøkkel.
- Hvem (rolle) får skrive per selskap.
- Brukes fakturaplan/delbetaling i Tripletex for fastpris i dag?
