# MCS ↔ Tripletex – arkitekturvurdering (kun diskusjon, ingen bygging)

## A) Hva som finnes i dag (verifisert i kodebase og database)

**Tripletex i dag = kun filimport/-eksport (CSV/Excel), ingen API-kobling.**
- Prosjektimport (`TripletexImportPage`, `TripletexProjectImport`, `useTripletexImport`): CSV fra Tripletex → MCS-prosjekter. Tabellen `tripletex_project_mappings` (56 koblinger) kobler Tripletex prosjekt-ID/-nummer til MCS-prosjekt per selskap, med unike indekser og `last_payload_hash`. `tripletex_import_runs` har 1 kjøring.
- Tilbudsimport (`TripletexOfferImport`) og `external_tripletex_number` på `calculations`/`offers`.
- Kunder: `customers.external_tripletex_id` – bare 5 av 124 kunder er koblet.
- Prosjekter/jobber: `events.external_tripletex_id` (60 satt), pluss generiske `external_system`/`external_project_id`.
- Ansatte: `employee_work_profiles.external_employee_id` (8 satt). Ansettelse ligger i `employment_profiles` (per selskap), personer i `people`.
- Timer: `worktime_entries` (1 537 rader) – alle importert fra Tripletex månedsoversikt (`source_system = tripletex_monthly_overview`) via HMS/AML-importen, brukt til arbeidstidskontroll (AML-varsler, overtid). Har `source_hash`, `status`, `approved_by` og prosjektkobling.
- Bestillingsskjema: manuell «Eksporter til Tripletex»-CSV (`TripletexExportPanel`).
- Fakturagrunnlag: `invoice_basis` finnes (snapshot ved kundegodkjenning) men har 0 rader.
- Planlegging: `planning_projects`/`planning_work_packages` med pris, budsjett, timesats og fakturerende firma, og `planning_external_refs` (fritekstreferanser til andre systemer).
- 3 aktive interne selskaper i `internal_companies` – Tripletex er trolig én klient per selskap.

**Det som mangler:** API-klient, lagrede API-nøkler per selskap, generell ID-koblingstabell for alle typer data, synk-logg/kø, retry, webhook-mottak, timer *fra* MCS (i dag går timer bare inn til MCS), og økonomitall tilbake fra Tripletex.

**Viktig funn:** I dag er timeflyten motsatt av det dere ser for dere. Tripletex er kilden for timer, og MCS bruker dem til AML-kontroll. Å sende timer fra MCS til Tripletex er et nytt prinsippvalg, ikke en utvidelse av det som finnes.

## B) Anbefalt målarkitektur

### 1–2. Eierskap og retning per datatype
```text
Datatype            Master     Retning               Merknad
Selskap/avdeling    MCS        lokal + koblingstabell Avdeling kobles til Tripletex-avdeling
Ansatte (lønn/HR)   Tripletex  TT -> MCS (les)       Ansettelse/tilgang forblir i MCS
Kompetanse/HMS      MCS        kun MCS               Aldri til Tripletex
Kunder (juridisk)   Tripletex  TT -> MCS + kontrollert opprettelse MCS -> TT
Kundekontakter/CRM  MCS        kun MCS
Prosjekt (operativt)MCS        MCS -> TT ved "Opprett i Tripletex"-overgang
Prosjektnr/regnskap Tripletex  TT -> MCS (nummer skrives tilbake)
Arbeidspakker       MCS        kun MCS (evt. delprosjekt/aktivitet senere)
Timer               avklares   se under
Kostnader/bilag     Tripletex  TT -> MCS (les, aggregert)
Fakturagrunnlag     MCS        MCS -> TT som ordre/kladd, aldri auto-sendt
Faktura/betaling    Tripletex  TT -> MCS (kun status)
Prosjektstatus      MCS operativt; Tripletex "lukket" leses tilbake som regnskapsstatus
```
Timer: enten (a) Tripletex fortsatt master (montører fører i Tripletex, MCS leser) eller (b) MCS master (føres/godkjennes i MCS, sendes som godkjent). Dagens data peker mot (a). Anbefaling: behold (a) til dere har en timeføringsflate i MCS som montørene faktisk vil bruke.

### 3. ID-mapping
- Én generell koblingstabell: selskap, MCS-type, MCS-ID, Tripletex-type, Tripletex-ID, Tripletex-nummer, versjon/endret-tid, sist synket, hash. Unikt på (selskap, type, Tripletex-ID) og (selskap, type, MCS-ID).
- Bruk Tripletex sin interne ID som nøkkel; nummer kun til visning og første matching.
- Eksisterende `tripletex_project_mappings` og `external_tripletex_id`-felt migreres inn, ikke slettes.
- Første kobling gjøres med forslag + manuell bekreftelse (orgnr for kunder, prosjektnr/navn for prosjekter, e-post/ansattnr for ansatte) – samme mønster som dagens prosjektmatching.

### 4. Unngå looper, duplikater og konflikter
- Én retning per felt, aldri «sist skrevet vinner» på samme felt.
- Hver utgående operasjon får en idempotensnøkkel (samme mønster som `client_request_id`), og kobling lagres før neste forsøk.
- Innkommende endringer merkes med kilde; endringer fra synken utløser ikke ny utsending.
- Konflikter (f.eks. kunde endret begge steder) legges i en avvikskø for manuell avklaring, ikke løses automatisk.

### 5. Realtime, periodisk eller hybrid
Hybrid:
- MCS → Tripletex: hendelsesstyrt, men utløst av en eksplisitt brukerhandling («Opprett i Tripletex», «Send godkjente timer», «Opprett fakturakladd»), utført via kø.
- Tripletex → MCS: periodisk synk (f.eks. hvert 15.–60. min for kunder/prosjekter, nattlig for økonomi), og Tripletex-webhooks som «noe er endret»-signal der det støttes. Webhook trigger bare en ny henting – innholdet stoles aldri direkte på.

### 6. Plassering i dagens backend
- Følger etablert mønster for Microsoft: serverfunksjoner (`tripletex-sync`, `tripletex-push`, `tripletex-webhook`), kø-/retry-tabell som `calendar_delete_retry_queue`, døde meldinger som `conversation_email_dead_letters`, admin-overvåking som `/admin/microsoft`.
- Selskapsscope løses på serveren (som i dag), tilgang via `has_company_access` og `check_permission_v2`, ny modul «økonomi/Tripletex».

### 8. UI-flater (status, ikke regnskap)
- Prosjekt/Planlegging: Tripletex-merke (koblet / ikke koblet / feil), prosjektnummer, knapp «Opprett i Tripletex».
- Planlegging → Økonomi-fanen: budsjett vs. faktisk (timer, kostnader, fakturert) lest fra Tripletex, kun for brukere med økonomitilgang.
- Kunde: kobling + fakturastatus/utestående.
- Fakturagrunnlag: «Kladd opprettet i Tripletex» med lenke.
- Admin: integrasjonshelse, kø, feil, manuell ny kjøring.

### 9. Sikkerhet
- Tripletex consumer- og employee-token lagres kun som hemmelige nøkler på serveren, per selskap; sesjonstoken lages kortlevd på serveren og vises aldri i nettleseren.
- Egen integrasjonsbruker i Tripletex med minste nødvendige rettigheter.
- Alle kall logges (hvem, hva, selskap, resultat), uten persondata/beløp i fritekst.
- Retry med økende ventetid, maks antall forsøk, deretter dødkø + varsel. Respekter Tripletex rate limits.
- Økonomitall følger eksisterende finanssperre (restriktive RLS-regler).

## C) Første realistiske integrasjonssteg

Faseforslaget deres justert etter funnene:

1. **Fase 0 – Grunnmur + rydding (lav risiko):** API-tilkobling per selskap, koblingstabell, synk-logg, kø, admin-helsevisning. Samle eksisterende koblinger (56 prosjekter, 5 kunder, 60 jobber, 8 ansatte) inn i den nye tabellen.
2. **Fase 1 – Les inn:** kunder, ansatte og prosjekter Tripletex → MCS med matchingsforslag. Erstatter dagens CSV-import. Deretter kontrollert «Opprett prosjekt i Tripletex» fra MCS.
3. **Fase 2 – Timer via API i stedet for CSV:** les timer fra Tripletex automatisk inn i `worktime_entries` (beholder AML-kontrollen, fjerner manuell import). Gir rask gevinst uten å endre hvor montørene fører timer.
4. **Fase 3 – Prosjektøkonomi:** les kostnader/timer/fakturert per prosjekt, vis mot budsjett i Planlegging.
5. **Fase 4 – Fakturagrunnlag:** MCS → Tripletex som ordre/kladd, aldri automatisk sendt.
6. **Senere, ved behov:** timer MCS → Tripletex, hvis dere bestemmer at MCS skal være timeføringsstedet.

## D) Bør vente / ikke bygges nå
- Fri toveis synk av noe felt.
- Timeføring i MCS som master før beslutning om hvor montørene fører timer.
- Automatisk fakturautsending, bilag, lønn, reskontro eller regnskapsposter i MCS.
- Arbeidspakker som egne Tripletex-objekter (vent til økonomibehovet er klart).
- Sanntidsspeiling av alle økonomitall.

## 10. Avklaringer internt før bygging
1. Har hvert av de 3 selskapene egen Tripletex-klient, og hvem eier integrasjonsbrukeren?
2. Hvor skal timer føres fremover: Tripletex eller MCS? (Avgjør fase 2 og senere.)
3. Hvem får opprette kunder/prosjekter i Tripletex fra MCS, og hvem godkjenner?
4. Prosjektnummerering: MCS-nummer, Tripletex-nummer eller felles serie? (`project_number` er i dag primær i MCS.)
5. Brukes delprosjekter, aktiviteter og avdelinger i Tripletex – og skal arbeidspakker speiles dit?
6. Hvilke økonomitall skal ledere og prosjektledere se i MCS, og hvem skal ikke se dem?
7. Hvordan behandles fakturering mellom MCS-selskapene (fakturerende firma på arbeidspakker)?
8. Tripletex-abonnement: er API-modul og webhooks inkludert?
9. Er Business Central fortsatt i bruk for noen av selskapene, og hva er forholdet til Tripletex?

## Teknisk notat
Ingen kodeendringer gjøres i denne runden. Ved godkjenning av retning lages en egen byggeplan for Fase 0.
