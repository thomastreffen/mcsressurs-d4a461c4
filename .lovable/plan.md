# Tripletex-integrasjon – byggeplan for Fase 0 og Fase 1

Planen bygger på arkitekturvurderingen (godkjent 19.10.2026) og på kontroller av dagens data. Ingen kodeendringer er gjort.

## 0. Hva dagens data faktisk viser (kontrollert uten endringer)

Alt som er koblet til Tripletex i dag hører til **MCS Service AS**. MCS Elektrotavler AS og det tredje selskapet har ingen koblinger.

| Kilde | Antall | Funn |
|---|---|---|
| `tripletex_project_mappings` | 56 | `tripletex_project_id` = `tripletex_project_number` i alle 56. **Feltet heter ID, men inneholder prosjektnummer.** Filimporten får aldri den interne Tripletex-ID-en. Ingen kobling uten prosjekt, ingen til slettede prosjekter, ingen firmaavvik, ingen dobbeltkoblinger. |
| `events.external_tripletex_id` | 60 | 58 har samme verdi som `project_number`. 4 prosjekter (60374 Hmv30, 60382 Felleskjøpet Eidsvoll, 60403 Sinsen VO, 60404 Rosenholm Campus) mangler i mappingtabellen. 2 rader (60457, 60458) har ikke `project_number`. Ingen dubletter, slettede eller sammenslåtte. |
| `customers.external_tripletex_id` | 5 av 124 | Verdiene (10008, 10029, 10083–10085) ser ut som **kundenummer**, ikke intern ID. Alle 124 kunder har orgnr. **2 orgnr finnes to ganger** (913452100, 916282524), altså mulige dublettkunder i MCS. |
| `employee_work_profiles.external_employee_id` | 8 | Verdiene 1–9 ser ut som **ansattnummer**. Alle tilhører MCS Service, alle har bruker, ingen dubletter. Alle 8 ansattnumrene i timeimporten finner en profil. |
| `offers` / `calculations.external_tripletex_number` | 7 / 7 | Tilbudsnumre fra importen. Hører ikke til Fase 1. |
| `planning_external_refs` | 0 | Tom. Brukes ikke til Tripletex. |
| `planning_projects` | 5 | Ingen er knyttet til et Tripletex-koblet prosjekt. |

**Hovedkonsekvens:** MCS kjenner ingen intern Tripletex-ID i dag, bare nummer. Første API-trinn må derfor slå opp hvert nummer i Tripletex og lagre den interne ID-en. Det er nøkkelen som er stabil over tid; nummer kan endres i Tripletex.

## 1. Fase 0 – integrasjonsgrunnmur

### 1.1 Datamodell (nye tabeller, ingen endring i eksisterende)

**`tripletex_connections`** – én rad per internt selskap
- `company_id` (unik, peker på `internal_companies`), `environment` (`test` | `production`), `api_base_url`
- `mode` (`off` | `read` | `read_write`), `enabled_entities` (customers/employees/projects, med egen modus per type)
- `secret_ref` – **navnet** på den hemmelige nøkkelen, aldri verdien
- `tripletex_company_id` (verifisert ved første tilkobling, sperrer feil klient)
- `last_health_check_at`, `last_health_status`, `last_error_code`, `paused_reason`, `paused_at/by`
- `created_by/at`, `updated_by/at`

**`tripletex_links`** – generell ID-kobling (erstatter på sikt alle spredte felt)
- `id`, `company_id`, `entity_type` (`customer` | `employee` | `project` | senere `department`, `activity`, `order`)
- `mcs_table`, `mcs_id` (uuid)
- `tt_id` (bigint, **null tillatt** til ID-en er slått opp), `tt_number` (text), `tt_version` (Tripletex sitt versjonsfelt)
- `link_status`: `confirmed` | `pending_resolve` (bare nummer kjent) | `suggested` | `conflict` | `unlinked_remote_deleted` | `inactive_remote`
- `link_source`: `legacy_csv` | `auto_match` | `manual` | `created_from_mcs`
- `match_confidence`, `match_signals` (jsonb), `confirmed_by/at`
- `last_synced_at`, `last_remote_hash`, `last_pull_at`, `last_push_at`
- `deleted_at`, `deleted_by` (myk sletting, som ellers i MCS)
- Unikhet med delvise indekser der `deleted_at is null`: (`company_id`, `entity_type`, `tt_id`) der `tt_id` finnes, (`company_id`, `entity_type`, `mcs_id`), og (`company_id`, `entity_type`, `tt_number`) der status er `pending_resolve`.

**`tripletex_sync_jobs`** – kø og idempotens
- `id`, `company_id`, `entity_type`, `operation` (`pull_list` | `pull_one` | `resolve_number` | `create_remote` | `link_remote`)
- `mcs_id`, `payload` (jsonb), `idempotency_key` (unik), `requested_by`, `client_request_id`
- `status`: `queued` | `running` | `succeeded` | `failed_retryable` | `dead` | `cancelled` | `needs_review`
- `attempts`, `max_attempts`, `next_attempt_at`, `locked_until`, `locked_by`, `last_error_code`, `last_error_message` (uten persondata), `result` (jsonb), tidsstempler
- Dødkø = `status = dead`, samme tabell og egen admin-visning (som `conversation_email_dead_letters`).

**`tripletex_sync_log`** – revisjonslogg, kun innsetting
- `company_id`, `job_id`, `entity_type`, `mcs_id`, `tt_id`, `action`, `direction` (`in` | `out`), `outcome`, `http_status`, `duration_ms`, `actor` (bruker eller `system`), `changed_fields` (bare feltnavn), `request_id`. Ingen tokens, ingen fullstendige payloader med persondata.

**`tripletex_review_items`** – avklaringskø for usikre treff og konflikter
- `company_id`, `entity_type`, `mcs_id` (null tillatt), `tt_id`/`tt_number`, `reason` (`multiple_candidates` | `no_match` | `field_conflict` | `remote_deleted` | `legacy_mismatch`), `candidates` (jsonb), `status` (`open` | `resolved` | `dismissed`), `resolved_by/at`, `resolution`.

**`tripletex_remote_cache`** (valgfri, anbefalt)
- Siste lest rad fra Tripletex per (`company_id`, `entity_type`, `tt_id`): `data` jsonb, `hash`, `fetched_at`. Gjør matching og avklaring raskt uten nye API-kall, og gjør det mulig å se «hva Tripletex sier» uten å kopiere felt inn i MCS-tabeller.

### 1.2 Konsolidering av eksisterende felt

| Eksisterende | Behandling | Beholdes midlertidig? |
|---|---|---|
| `tripletex_project_mappings` | Kopieres til `tripletex_links` som `project`, `tt_number` = verdien, `tt_id` = null, status `pending_resolve`, kilde `legacy_csv` | Ja. Filimporten skriver hit til TPX-012 er ferdig. Deretter skrives begge, til slutt merkes den utgått (`COMMENT ... DEPRECATED`), ikke slettet |
| `events.external_tripletex_id` | 56 overlapper med mappingtabellen (samme verdi, ingen avvik). De 4 uten mapping kopieres som egne `pending_resolve`-rader | Ja, som visningsfelt. Fylles fra `tripletex_links` etter oppslag (verdien er prosjektnummer) |
| `events.external_system` / `external_project_id` | Leses som kilde om de har verdi og ikke er dekket over | Ja, uendret |
| `customers.external_tripletex_id` | Kopieres som `customer`, `tt_number` = verdien, `pending_resolve` | Ja, som visningsfelt (kundenummer) |
| `employee_work_profiles.external_employee_id` | Kopieres som `employee`, `tt_number` = verdien, `pending_resolve`. Koblet til personen via `user_id` → `people` | **Ja, permanent inntil Fase 2.** Timeimporten og arbeidstidskontrollen slår opp på dette feltet |
| `offers` / `calculations.external_tripletex_number` | Røres ikke i Fase 0/1 | Ja |
| `planning_external_refs` | Røres ikke. Fortsetter som fritekstreferanser til andre systemer | Ja |
| `planning_projects.linked_event_id` | Planleggingsprosjekt arver Tripletex-status fra det koblede prosjektet. Ingen egen kobling i Fase 1 | – |

### 1.3 Migreringsrekkefølge (uten tap og dubletter)

1. Opprett nye tabeller, rettigheter og RLS. Ingen data flyttes.
2. Engangskopiering til `tripletex_links` med `on conflict do nothing` på de unike indeksene, i rekkefølgen prosjekter fra mappingtabellen → prosjekter kun i `events` → kunder → ansatte. Gamle felt røres ikke.
3. Avstemmingsrapport (bare lesing): antall i hver kilde mot antall i `tripletex_links`. Må gå opp: 56 + 4 = 60 prosjekter, 5 kunder, 8 ansatte.
4. Først når API-tilkoblingen virker: `resolve_number`-jobber slår opp hvert nummer i Tripletex. Ett treff → `tt_id` settes og status blir `confirmed`. Ingen eller flere treff → avklaringskøen.
5. Når filimport og API begge skriver via `tripletex_links`: merk gamle felt som utgått. Ingen sletting.

Hvert steg kan kjøres på nytt uten bivirkninger.

### 1.4 Tilkobling per selskap og hemmelige nøkler

- Tripletex bruker `consumerToken` (per integrasjon) og `employeeToken` (per klient/selskap). Disse veksles inn i en `sessionToken` med utløpsdato.
- Lagres som hemmelige nøkler på serveren: `TRIPLETEX_CONSUMER_TOKEN` (felles), `TRIPLETEX_EMPLOYEE_TOKEN_<SELSKAPSKODE>` (én per selskap) og egne nøkler for testmiljøet. `tripletex_connections.secret_ref` peker på navnet.
- Sesjonstoken lages bare på serveren, med kort levetid (f.eks. 1 dag). Den bufres i minnet i serverfunksjonen eller i en egen tabell uten lesetilgang for innloggede brukere (bare tjenesterollen). Den fornyes ved 401 og forsøkes én gang før jobben feiler.
- Tokens sendes aldri til nettleseren, logges aldri og vises aldri på adminsiden. Admin ser bare «Tilkoblet / Feil token / Utløpt».
- Første tilkobling verifiserer at Tripletex-klienten er riktig selskap (orgnr fra `internal_companies.org_number`). Avvik gir umiddelbart `paused`.

### 1.5 Kø, retries og idempotens

- **Idempotensnøkkel:** deterministisk per handling, f.eks. `create_remote:project:<mcs_id>`. Unik indeks i køen hindrer at to like jobber legges inn, også ved dobbeltklikk. Frontend sender i tillegg `client_request_id` (fast prinsipp i MCS).
- **Låsing:** en jobb hentes med `locked_until` (atomisk oppdatering, «skip locked»-prinsipp), slik at to arbeidere aldri kjører samme jobb.
- **Retry:** økende ventetid (30 s, 2 min, 10 min, 1 t, 6 t). Maks 5 forsøk, deretter `dead` og varsel til admin.
- **Feiltyper:** 401 → forny sesjon og prøv igjen én gang. 429 → respekter `Retry-After`. 5xx/tidsavbrudd → prøv på nytt. 4xx valideringsfeil → `needs_review` uten nye forsøk. 403 → pause tilkoblingen.
- **Sløyfevern:** endringer synken selv skriver får `actor = system` og kilde `tripletex`, og utløser aldri nye utgående jobber. I Fase 1 er det bare «Opprett i Tripletex» som skriver ut, og den startes alltid av en bruker.
- **Endringskontroll:** `last_remote_hash` per kobling. Lik hash ved innlesing gir ingen oppdatering og ingen logglinje utover telling.

### 1.6 Serverfunksjoner

| Funksjon | Ansvar |
|---|---|
| `_shared/tripletex-client.ts` | Felles klient: sesjon, base-URL per miljø, rate limiting, feilklassifisering, `request_id` i alle logglinjer |
| `tripletex-connection` | Admin: test tilkobling, verifiser selskap, endre modus (av/les/les+skriv), pause/gjenoppta. Krever super_admin |
| `tripletex-sync-worker` | Planlagt kjøring (f.eks. hvert minutt) som behandler køen. Autentisert som planlagt jobb, ikke åpen for brukere |
| `tripletex-pull-scheduler` | Planlagt kjøring som legger inn `pull_list`-jobber for kunder/ansatte/prosjekter per aktivt selskap (f.eks. hvert 30. min, inkrementelt via `changedSince` der API-et støtter det) |
| `tripletex-actions` | Brukerhandlinger: «Koble til eksisterende», «Opprett i Tripletex», «Bekreft forslag», «Fjern kobling». Kontrollerer tilgang med `check_permission_v2` og `has_company_access`, finner selskap på serveren, legger jobb i køen og svarer med jobb-ID |
| `tripletex-search` | Søk i Tripletex for koblingsvisningen (kunde/prosjekt), med kortlevd mellomlagring. Kun lesing |
| `tripletex-webhook` | **Ikke i Fase 1.** Plass reservert til senere, kun som «noe er endret»-signal |

### 1.7 Tilgang og RLS

- Ny modulkode `tripletex` i eksisterende modultilgang, med nivåene `view` (se status) og `manage` (koble og opprette). Sjekkes med `has_company_access(uid, company, 'tripletex', nivå)`. Tilgangen utvides ikke automatisk for noen.
- `tripletex_connections`: lesing/endring kun for super_admin. Øvrige brukere ser bare `mode` og helse via en egen funksjon som returnerer bare det.
- `tripletex_links`: lesing for brukere med tilgang til selskapet og objektet. Skriving **kun** via serverfunksjoner (tjenesterollen). Ingen direkte innsetting fra nettleseren.
- `tripletex_sync_jobs`, `sync_log`, `review_items`: lesing for `tripletex.manage` i selskapet, eller super_admin. Skriving kun via server.
- `tripletex_remote_cache`: kun tjenesterollen. Brukere får utvalgte felt via funksjoner.
- Økonomifelt kommer først i Fase 3 og følger eksisterende restriktive finansregler.

### 1.8 Adminside `/admin/tripletex` (kun super_admin, som `/admin/microsoft`)

Per selskap:
- Status: Av / Lesemodus / Les+skriv / Pauset, miljø (test/produksjon), sist vellykket kontakt, siste feil i klartekst.
- Telling per datatype: koblet, venter på oppslag, forslag til avklaring, konflikter, ikke koblet.
- Kø: i kø, kjører, feilet (prøver igjen), døde jobber. Knapper: «Prøv igjen», «Avbryt».
- Avklaringskø med lenke til koblingsvisningen.
- Avstemmingsrapporten fra 1.3.
- Siste 200 logglinjer med filter (selskap, type, resultat).
- Knapper: «Test tilkobling», «Pause», «Gjenoppta», «Bytt modus». Hver endring krever begrunnelse og logges.

### 1.9 Av/på per selskap uten å skade resten av MCS

- `mode = off` er standard. Da gjør serverfunksjonene ingenting, køen avviser nye jobber, og UI-merkene viser «Ikke aktivert» eller skjules.
- MCS fungerer aldri avhengig av Tripletex. Ingen prosjektopprettelse, Ressursplan, HMS eller Planlegging venter på svar fra Tripletex.
- Pause stopper all kommunikasjon. Køen blir liggende og kan gjenopptas.
- Dagens CSV-import beholdes og virker uansett modus (reserveløsning).

## 2. Fase 1 – kunder, ansatte og prosjekter

### 2.1 Kunder

**Master per felt**

| Felt | Master | Merknad |
|---|---|---|
| Juridisk navn, orgnr, kundenummer | Tripletex | Skrives inn i MCS, kan ikke endres i MCS når kunden er koblet (vises låst med forklaring) |
| Fakturaadresse, faktura-e-post | Tripletex | Leses inn til `billing_*` og `main_email` |
| Hovedtelefon | Tripletex | Leses inn |
| Kontaktpersoner, tagger, kundeverdi, interessefelt, notater | MCS | Kopieres ikke fra Tripletex |
| Aktiv/inaktiv i Tripletex | Tripletex | Vises som status, sletter ikke i MCS |
| Kreditt, saldo, betalingsbetingelser | Tripletex | **Kopieres ikke**. Kan senere vises live i Fase 3 |

**Første kobling**
1. Orgnr (normalisert til 9 siffer) innen samme selskap.
2. Kundenummer fra eksisterende `external_tripletex_id`.
3. Navnelikhet (eksisterende `stringSimilarity`) ≥ 0,9 kun som støttesignal, aldri alene.

- **Null treff:** MCS-kunden forblir «Ikke koblet». Ingen automatisk opprettelse i Tripletex.
- **Ett treff på orgnr:** kobles automatisk med kilde `auto_match` hvis navnelikheten er ≥ 0,7. Ellers blir det et forslag.
- **Flere treff** (f.eks. samme orgnr på flere Tripletex-kunder, eller på de 2 kjente MCS-dublettene): avklaringskø, aldri automatisk.
- **Allerede koblet:** bare oppdatering av Tripletex-eide felt hvis hashen er endret. Ny matching kjøres ikke.
- **Tripletex-kunde uten MCS-motpart:** opprettes **ikke** automatisk i MCS. Den er søkbar i koblingsvisningen og kan hentes inn ved behov («Hent fra Tripletex»).
- **Inaktiv eller slettet i Tripletex:** koblingen settes til `inactive_remote` / `unlinked_remote_deleted`, og MCS-kunden får merket «Inaktiv i Tripletex». MCS-kunden slettes aldri.

### 2.2 Ansatte

**Master per felt**

| Felt | Master |
|---|---|
| Ansattnummer, navn, e-post i Tripletex | Tripletex (leses inn som referanse, overskriver ikke `people` automatisk) |
| Ansettelsesforhold, avdeling, stilling, tilgang, kompetanse, HMS | MCS |
| Lønn, kontonummer, fødselsnummer, adresse | **Kopieres aldri** |

**Første kobling:** e-post (normalisert) → ansattnummer fra `external_employee_id` → fullt navn som støtte.
- **Null treff:** «Ikke i Tripletex» (normalt for eksterne og innleide).
- **Ett treff:** e-post og nummer stemmer begge → automatisk. Bare ett av dem → forslag.
- **Flere treff:** avklaringskø.
- **Allerede koblet:** navn/e-post-avvik vises som avvik i avklaringskøen. Overskrives ikke.
- **Sluttet i Tripletex:** merkes «Sluttet i Tripletex» på HR-kortet. Personen arkiveres **ikke** automatisk. Tilgang og ansettelse i MCS styres fortsatt i MCS.
- Koblingen skjer per `employment_profiles`-rad (person + selskap). Én person kan ha ulike ansattnumre i ulike selskaper.

### 2.3 Prosjekter

**Master per felt**

| Felt | Master | Merknad |
|---|---|---|
| Navn, adresse, beskrivelse, datoer, operativ status, team, arbeidspakker | MCS | Tripletex-navnet vises som referanse |
| Tripletex intern ID, prosjektnummer | Tripletex | Skrives tilbake til MCS |
| Kunde | Begge, men må peke på samme koblede kunde. Avvik → avklaringskø |
| Prosjektleder i Tripletex | Tripletex | Settes fra MCS bare ved opprettelse |
| Avdeling, kategori, fastpris/timepris | Tripletex | Settes ved opprettelse, leses deretter. MCS overskriver ikke |
| Lukket/avsluttet i Tripletex | Tripletex | Vises som regnskapsstatus. Endrer ikke MCS-status |

**Første kobling (eksisterende 60):** `resolve_number` slår opp nummeret og lagrer intern ID. Treff bekreftes automatisk bare hvis prosjektnummeret stemmer **og** kunden stemmer (hvis kunden er koblet) **eller** navnelikheten er ≥ 0,6. Ellers forslag.

**Nye prosjekter uten kobling:** signalene er prosjektnummer, navn, kunde og startdato, med samme prinsipp som dagens prosjektmatching (≥ 85 % pluss ett hardt signal).
- **Null treff:** «Ikke koblet», med valg «Opprett i Tripletex» eller «Koble til eksisterende».
- **Ett sikkert treff:** forslag som må bekreftes én gang. Aldri stille automatikk for nye prosjekter.
- **Flere treff:** koblingsvisning med kandidater.
- **Allerede koblet:** bare innlesing av Tripletex-eide felt.
- **Slettet i Tripletex:** koblingen markeres, merket viser «Prosjektet finnes ikke lenger i Tripletex», og prosjektet beholdes i MCS.
- **Tripletex-prosjekt uten MCS-motpart:** vises som kandidat og kan hentes inn. Erstatter dagens CSV-prosjektimport for dette.

**«Opprett i Tripletex» (kontrollert)**
1. Bare for brukere med `tripletex.manage` i selskapet, og bare når selskapets modus er `read_write` for prosjekter.
2. Forhåndskontroll: kunden **må være koblet** (anbefalt krav, se 7B). Hvis ikke, tilbys «Koble kunde først» i samme flyt.
3. Brukeren ser hvilke felt som sendes (navn, kunde, startdato, prosjektleder, avdeling) og kan justere dem før sending.
4. Jobben legges i køen med nøkkel `create_remote:project:<mcs_id>`.
5. **Vern mot dobbel opprettelse:** før sending reserveres koblingen som `pending_create`. Prosjektet sendes med et unikt MCS-merke (f.eks. MCS-ID i referanse-/eksternfelt eller i beskrivelsen). Ved tidsavbrudd eller ukjent svar sendes **aldri** et nytt opprettelseskall direkte. Først søkes det i Tripletex etter MCS-merket (og navn + kunde + dato). Funnet → kobles. Ikke funnet etter avstemming → nytt forsøk. Bare ett aktivt opprettelsesforsøk per prosjekt.
6. Svaret skriver tilbake `tt_id`, `tt_number`, `tt_version` til `tripletex_links`, og `tt_number` til `events.external_tripletex_id` (bakoverkompatibelt) og eventuelt `project_number` dersom det er tomt (se 7B om nummerering).
7. Det loggs i `tripletex_sync_log` og i prosjektets historikk (`activity_log`).

**«Koble til eksisterende Tripletex-prosjekt»:** søk i Tripletex etter nummer, navn eller kunde, velg ett treff, se en sammenligning, bekreft. Unik indeks hindrer at samme Tripletex-prosjekt kobles til to MCS-prosjekter.

## 3. Eksisterende data – migreringsklassifisering

| Klasse | Innhold | Behandling |
|---|---|---|
| **Sikre treff (forventet)** | 56 prosjekter der mapping og `events` har samme nummer, samme selskap og ingen avvik | Kopieres som `pending_resolve`. Blir `confirmed` når API-oppslaget finner nøyaktig ett prosjekt med nummeret |
| **Manglende kobling i mappingtabellen** | 4 prosjekter (60374, 60382, 60403, 60404) med Tripletex-nummer bare på `events` | Kopieres som `pending_resolve`, kilde `legacy_csv`. Samme oppslag |
| **Mulig konflikt (data)** | 2 prosjekter (60457, 60458) med Tripletex-nummer men uten `project_number` | Kopieres. Ved bekreftelse foreslås `project_number` fylt, men bare etter godkjenning |
| **Mulig konflikt (kunder)** | 2 orgnr som finnes på to MCS-kunder hver (913452100, 916282524) | Ingen automatisk kobling. Avklaringskø: velg hvilken MCS-kunde som kobles, eventuelt slå sammen dubletter i MCS først |
| **Nummer, ikke ID** | Alle 60 prosjekter, 5 kunder (kundenummer) og 8 ansatte (ansattnummer) | Krever oppslag før de regnes som stabile |
| **Ikke koblet** | 119 kunder og alle ansatte i andre selskaper | Matching etter 2.1/2.2 når selskapet er aktivert |
| **Orphaned mapping** | 0 funnet (ingen koblinger til slettede eller manglende prosjekter) | Kontrollen kjøres på nytt rett før migrering |
| **Ikke i scope** | 7 tilbud og 7 kalkyler med Tripletex-nummer | Røres ikke |

Ved API-oppslaget legges disse utfallene i egne klasser: nummer finnes ikke i Tripletex (`legacy_mismatch`), nummer gir flere treff, og treff med en annen kunde enn i MCS.

## 4. UI/UX (beskrivelse, ingen bygging)

Prinsipp: ett lite merke og én handling der det trengs. Ingen integrasjonsterminologi i vanlige flater. I tråd med MCS-regelen brukes egen side eller sidepanel, ikke modaler.

**Statusmerker** (samme merke overalt, ved siden av dagens `SourceMetadataBadge`)
- «Tripletex 60470» (grønn prikk) – koblet
- «Ikke i Tripletex» (grå) – kan kobles
- «Trenger avklaring» (gul) – åpner koblingsvisningen
- «Inaktiv i Tripletex» / «Finnes ikke lenger i Tripletex» (grå med varsel)
- «Venter på Tripletex…» – opprettelse eller oppslag pågår
- Skjult når selskapet har integrasjonen av

**Prosjektkort / prosjekthode:** merket ved prosjektnummeret. Knappene «Opprett i Tripletex» og «Koble til eksisterende» vises bare for `tripletex.manage`, og bare når prosjektet ikke er koblet.

**Planleggingsprosjekt:** arver merket fra det koblede prosjektet i Ressursplan. Uten koblet prosjekt vises ingenting i Fase 1.

**Kundekort:** merke med kundenummer. Tripletex-eide felt vises låst med teksten «Hentes fra Tripletex». Valget «Koble til Tripletex-kunde» vises når kunden ikke er koblet.

**Ansatt/HR:** lite merke «Ansattnr. 7 i Tripletex» på personens ansettelse, pluss «Sluttet i Tripletex» som varsel. Ingen lønnsdata.

**Koblingsvisning (sidepanel):** til venstre «I MCS», til høyre opptil 5 kandidater fra Tripletex, med treffgrunnen i klartekst («Samme orgnr», «Likt navn», «Samme nummer»). Valg: «Koble», «Ingen av disse», «Opprett ny i Tripletex» (prosjekt). Bekreftelsen viser hva som skjer: «Navn og adresse hentes fra Tripletex».

**«Opprett i Tripletex» (egen side eller sidepanel):** viser feltene som sendes, krav om koblet kunde, knappen «Opprett». Etterpå: «Opprettet i Tripletex som prosjekt 60481».

**Feiltilstander (det brukeren ser)**
- Tripletex svarer ikke: «Tripletex svarer ikke akkurat nå. Vi prøver igjen automatisk – du kan jobbe videre.»
- Valideringsfeil: «Tripletex godtok ikke prosjektet: kunden mangler. Koble kunden og prøv igjen.»
- Tilkoblingen er pauset: «Koblingen til Tripletex er satt på pause av administrator.»
- Dobbel kobling: «Dette Tripletex-prosjektet er allerede koblet til [prosjekt X].»
- Tekniske koder vises aldri for vanlige brukere, bare på adminsiden.

**Admin/økonomioversikt:** `/admin/tripletex` som i 1.8. For ledere med `tripletex.manage`: en enkel liste «Trenger avklaring» per selskap, uten tekniske detaljer.

## 5. Teststrategi

**Miljø**
- Tripletex testmiljø (`api-test.tripletex.tech`) med egen testklient og egne testtokens. Produksjonstokens legges ikke inn før trinn 4 i utrullingen.
- `tripletex_connections.environment = test` for et testselskap i MCS, eller MCS Service i testmodus mot testklienten.

**Testdata**
- Testklienten fylles med kunder som speiler de vanskelige tilfellene: samme orgnr to ganger, ulikt navn, inaktiv kunde.
- Prosjekter med nummer 60374–60470 som speiler dagens nummer, ett prosjekt som er slettet, ett lukket.
- Ansatte med og uten e-post, én som har sluttet.
- Lagrede API-svar (fixtures) for enhetstester av matching, feilklassifisering og hash.

**Automatiske tester** (vitest, ved siden av eksisterende)
- Matching: orgnr-normalisering, terskler, null/ett/flere treff for kunde, ansatt og prosjekt.
- Idempotens: samme handling to ganger gir én jobb og én kobling.
- Tidsavbrudd ved opprettelse: simulert timeout etter at Tripletex har opprettet → avstemmingen finner prosjektet → ingen dublett.
- Dublettvern: to MCS-prosjekter mot samme Tripletex-ID avvises.
- Feil token: 401 → én fornyelse → `dead` med «Feil token» ved ny 401.
- Utløpt sesjon: fornyes stille.
- Rate limit: 429 respekterer `Retry-After`, ingen tapte jobber.
- API nede: 5xx og nettverksfeil gir retry-plan og til slutt `dead`.
- Sløyfevern: innlesing skaper aldri utgående jobber.
- Tilgang: bruker uten `tripletex.manage` får avslag på serveren. Bruker i et annet selskap ser ikke koblinger.

**Manuelle tester mot testmiljøet:** full kjøring av migrering og oppslag på kopi av dagens 60/5/8, og avstemmingsrapporten må gå opp.

**Reserveløsning:** når modus er `off` eller `pause`, virker CSV-importen som før. Test at filimport og API-kobling ikke lager dubletter når begge brukes (samme unike indeks).

**Observability:** `request_id` gjennom hele kjeden (bruker → handling → jobb → API-kall → logg), varighet og HTTP-status per kall, daglig sammendrag på adminsiden, og varsel ved døde jobber eller pauset tilkobling.

## 6. Utrulling

| Trinn | Hva | Kriterium for neste trinn |
|---|---|---|
| 1 | Grunnmur i produksjon, alle selskaper `off`. Engangskopiering og avstemming | Avstemmingen går opp (60/5/8), ingen feil i bygg/tester |
| 2 | Testmiljø: MCS Service i `read` mot testklienten | Alle automatiske og manuelle tester grønne |
| 3 | Produksjon: MCS Service i `read`, først bare `resolve_number` for eksisterende koblinger | ≥ 95 % av de 60 prosjektene bekreftet, resten i avklaringskø og behandlet |
| 4 | MCS Service `read` for kunder, ansatte, prosjekter (innlesing + forslag) | 2 uker uten døde jobber som skyldes feil i koden; avklaringskø under kontroll |
| 5 | MCS Service `read_write` for prosjekter, først for 1–2 navngitte brukere | 10 opprettelser uten dubletter eller manuelle rettinger |
| 6 | Åpne for alle med `tripletex.manage` i MCS Service. CSV-prosjektimporten skjules for vanlige brukere, men beholdes som reserve | 1 måned stabil drift |
| 7 | Neste selskap (MCS Elektrotavler AS), fra trinn 3 | Samme kriterier |

Feature flags = `mode` og `enabled_entities` i `tripletex_connections`, pluss en egen liste over pilotbrukere for skriving i trinn 5.

## 7. Beslutningspunkter

**A) Kan bestemmes teknisk nå**
- Generell koblingstabell med intern Tripletex-ID som nøkkel. Nummer er kun visning.
- Eksisterende felt beholdes. Ingen sletting.
- Kø med idempotensnøkkel, retry, dødkø og revisjonslogg, etter samme mønster som Microsoft-integrasjonen.
- Tokens bare på serveren, én per selskap.
- Kun innlesing i Fase 1, med unntak av brukerstartet «Opprett i Tripletex».
- Ingen automatisk opprettelse eller sletting i noen retning.
- Ingen sensitive HR- eller lønnsdata kopieres.
- Integrasjonen er av som standard og kan aldri blokkere vanlig MCS-bruk.

**B) Må avklares med ledelse/regnskap før bygging**
1. Har hvert selskap egen Tripletex-klient, og hvem lager integrasjonsbrukeren og tokens?
2. Er API-tilgang inkludert i abonnementet, og har dere tilgang til testmiljøet?
3. Prosjektnummer: skal Tripletex tildele nummeret (anbefalt) og MCS ta det inn som `project_number`, eller skal MCS-nummeret sendes?
4. Må kunden være koblet før et prosjekt kan opprettes i Tripletex? (Anbefaling: ja.)
5. Hvem kan opprette prosjekter i Tripletex fra MCS: prosjektledere, planleggere eller bare økonomi?
6. Hvilke standardverdier gjelder ved opprettelse (avdeling, kategori, prosjektleder, fastpris/timepris)?
7. Hva gjøres med de to MCS-kundedublettene (slås sammen eller beholdes)?
8. Skal arbeidspakker bli delprosjekter eller aktiviteter i Tripletex senere? (Påvirker ikke Fase 1, men avklares tidlig.)
9. Hvem i økonomi eier avklaringskøen?

**C) Venter til Fase 2+**
- Timer via API (erstatter månedsfilimporten for arbeidstidskontroll), og eventuelt timer fra MCS.
- Prosjektøkonomi: kostnader, fakturert og forecast.
- Fakturagrunnlag som ordre/kladd.
- Webhooks.
- Avdelinger og aktiviteter i koblingstabellen.
- Tilbud og kalkyler mot Tripletex.

## 8. Arbeidspakker

| ID | Innhold | Avhenger av | Ferdig når |
|---|---|---|---|
| TPX-001 | Avklaringer (7B) og tilgang til testmiljøet | – | Svar på punkt 1–6 er skrevet ned; testtokens finnes |
| TPX-002 | Tabeller, indekser, rettigheter og RLS (1.1, 1.7). Ny modulkode `tripletex` | – | Tabellene finnes; RLS-tester for tre roller er grønne |
| TPX-003 | Engangskopiering av eksisterende koblinger og avstemmingsrapport (1.3, 3) | 002 | Rapporten viser 60/5/8 kopiert, 0 dubletter, gamle felt urørt |
| TPX-004 | Felles Tripletex-klient: sesjon, feilklassifisering, rate limiting, logging | 001, 002 | Enhetstester for 401/429/5xx/timeout grønne mot fixtures |
| TPX-005 | `tripletex-connection` + tokens i hemmelige nøkler + selskapsverifisering | 004 | «Test tilkobling» virker mot testmiljøet; feil orgnr gir pause |
| TPX-006 | Kø og `tripletex-sync-worker` (låsing, retry, dødkø, idempotens) | 002, 004 | Idempotens-, retry- og samtidighetstester grønne |
| TPX-007 | Adminside `/admin/tripletex` (1.8) | 005, 006 | Status, kø, døde jobber, logg og avstemming vises; pause/gjenoppta logges |
| TPX-008 | `resolve_number` for eksisterende prosjekter, kunder og ansatte | 003, 006 | Kjørt i testmiljøet; utfallene havner i riktig klasse |
| TPX-009 | Innlesing og matching av kunder (2.1) + avklaringskø | 006, 008 | Matchingtester grønne; null/ett/flere treff håndteres som beskrevet |
| TPX-010 | Innlesing og matching av ansatte (2.2) | 006, 008 | Som over; ingen sensitive felt lagres |
| TPX-011 | Innlesing og matching av prosjekter (2.3) | 009 | Som over; Tripletex-eide felt overskriver aldri MCS-felt |
| TPX-012 | Filimporten skriver også til `tripletex_links` | 003 | CSV og API i kombinasjon lager ingen dubletter |
| TPX-013 | Statusmerker og koblingsvisning (prosjekt, kunde, ansatt, planlegging) | 009–011 | Merkene vises riktig per status; koblingen bekreftes i nettleser |
| TPX-014 | «Koble til eksisterende Tripletex-prosjekt» | 011, 013 | Kobling i testmiljø; dobbel kobling avvises |
| TPX-015 | «Opprett i Tripletex» med vern mot dobbel opprettelse | 011, 013, avklaring 3–6 | Timeout-testen gir ingen dublett; nummer og ID skrives tilbake |
| TPX-016 | Utrullingstrinn 2–3 for MCS Service (testmiljø, deretter produksjon i lesemodus) | 007, 008 | Kriteriene i 6 er oppfylt |
| TPX-017 | Utrullingstrinn 4–6 for MCS Service | 009–015, 016 | Kriteriene i 6 er oppfylt |
| TPX-018 | Utrulling til neste selskap | 017 | Kriteriene i 6 er oppfylt for det selskapet |

## Teknisk notat
Ingen kodeendringer, migreringer eller installasjoner er gjort. Alle tall i avsnitt 0 og 3 kommer fra spørringer som bare leser data, kjørt 19.10.2026.
