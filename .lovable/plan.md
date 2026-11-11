# CRM/salg i MCS Hub – lesende revisjon og trinnvis plan

Kun revisjon. Ingen kode, database, integrasjoner, tillatelser eller testdata er endret.

## 1. Hva finnes i dag (verifisert)

Sider: `/sales` (dashboard), `/sales/pipeline`, `/sales/leads` (+ ny/detalj), `/sales/offers`, kalkylemotor `/sales/calc-engine/*`, `/sales/cases` (kun admin/superadmin), `/customers` (+ ny, import, detalj).

Data i produksjon nå:
- `customers`: 124 aktive, alle i ett selskap, alle har org.nr. (122 unike → minst 2 duplikater), 5 koblet til Tripletex (`external_tripletex_id`).
- `leads`: 1 rad. `commercial_cases`: 0. `customer_accounts`: 0. `offers`: 15.

Modell:
- `leads`: firmanavn/kontakt som fritekst, `status` (new, contacted, befaring, qualified, tilbud_sendt, forhandling, lost, won), sannsynlighet, verdi, forventet lukking, ansvarlig (`owner_id`, `assigned_owner_user_id`), neste aktivitet (type/dato/notat), selskap/avdeling, myk sletting, kobling til `commercial_case_id`.
- `customers`: navn, org.nr., e-post/telefon, fakturaadresse, `customer_value`, `products_of_interest`, Tripletex-ID, selskap. Kontakter, tagger og verdinivåer i egne tabeller.
- Historikk: `lead_history` og felles `activity_log`. Outlook-kalender for leads: `lead_calendar_links` + funksjonen `lead-calendar-event`. E-postutkast: `create-lead-email-draft`.
- Tilgang: leads styres av omfang (alle / selskap via medlemskap / bare egne og deltakere). Kunder har selskapsavgrensede restriktive modulregler.

## 2. Svakheter og risikoer

1. **Ingen relasjonstype eller temperatur.** Prospekt vs. eksisterende kunde og cold/hot finnes ikke som felt. `leads.status` blander pipeline og kvalifisering. Caverion/Bravida/Assemblin kan ikke følges opp som «hot» uten å lage falske leads.
2. **Lead er ikke knyttet til virksomhet.** `leads` har ikke org.nr. og ikke `customer_id`. Samme entreprenør kan få mange leads uten sammenheng, og en vunnet lead blir ikke trygt til kunde.
3. **Svak dedupe.** Ingen unik regel på org.nr. per selskap (bare en vanlig indeks). Importen sjekker duplikater i nettleseren, sammenligner navn uten selskapsgrense, setter inn rad for rad uten gjenopptak og har ingen forhåndsvisning før lagring. To duplikater finnes allerede.
4. **Ingen Brønnøysund-oppslag.** Navn, adresse, næringskode og antall ansatte må tastes manuelt. Det finnes ikke noe grunnlag for å målrette elektroentreprenører på Østlandet, Romerike/Nannestad–Hamar.
5. **Ingen geografi/segment.** Region, kommune, næringskode og størrelse mangler, så det går ikke å filtrere cold-lister.
6. **Neste aktivitet er bare én verdi per lead.** Ingen oppgaveliste per kunde og ingen «forfalt»-oversikt på tvers. Selgere får ikke påminnelser.
7. **Kalenderskriving går via delegert Microsoft-token.** Det har samme svakhet som Ressursplan (manglende kobling eller RAOP 403), og testing kan skrive i ekte kalendere.
8. **Kundekort mangler økonomisk ansvarlig og eier.** Det finnes ingen kundeansvarlig, og «hot»-oppfølging kan ikke fordeles.
9. **Saker (`commercial_cases`) brukes ikke** (0 rader) og vises bare for admin. Selgere ser ikke den samlende tidslinjen.
10. **Tripletex:** bare 5 av 124 kunder er koblet. Det finnes ingen regel for hvilken side som er master for kundedata, så det er risiko for dobbeltregistrering når prospekter blir kunder.
11. **Leads-tilgang bruker `legacy_admin_in_company`.** Det er greit, men må verifiseres mot selskapsvis CRM-modultilgang før flere selgere tas inn.

## 3. Anbefalt målmodell (minst mulig)

```text
Virksomhet (customers, én per org.nr. per selskap)
  relasjonstype: prospekt | kunde | tidligere kunde | partner
  temperatur:    cold | warm | hot      (uavhengig av relasjon)
  prioritet:     A | B | C
  segment:       næringskode, ansatte, kommune, region (fra Brønnøysund)
  kundeansvarlig (person)
  ├─ Kontakter (customer_contacts)
  ├─ Aktiviteter/oppgaver (ny liten tabell: type, forfall, ansvarlig, utført)
  ├─ Muligheter = leads med customer_id, pipeline-status, verdi, type (f.eks. serviceavtale)
  ├─ Tilbud / saker / prosjekter (eksisterende koblinger)
  └─ Tripletex-ID (kobles kun når virksomheten er kunde)
```

Tre akser holdes adskilt: hvem de er (relasjon), hvor varm de er (temperatur/prioritet) og hvor salget står (pipeline på mulighet).

## 4. Trinnvis plan (bygges først etter egen godkjenning)

1. **Dataopprydding (lesende først):** rapport over duplikater på normalisert org.nr. per selskap. Sammenslåing skjer bare manuelt og godkjent.
2. **Modell:** legg felt for relasjonstype, temperatur, prioritet, region/kommune, næringskode og kundeansvarlig på `customers`. Legg `customer_id` på `leads`. Legg unik regel (selskap + normalisert org.nr.) etter oppryddingen.
3. **Import 2.0:** server-side import med forhåndsvisning (ny / finnes / konflikt), oppdatering i stedet for duplikat, Brønnøysund-berikelse og importlogg. Første import: elektroentreprenører (NACE 43.21) i valgte kommuner som `prospekt/cold`.
4. **Oppgaver og neste aktivitet:** liten aktivitetstabell, «Mine oppfølginger i dag/forfalt» og Hub-varsel til ansvarlig. Ingen e-post til eksterne.
5. **Mobil oversikt:** «Mine kunder» med filter for temperatur/prioritet/region, ett trykk for å ringe eller logge samtale, neste aktivitet øverst.
6. **Hot-kunder:** marker Caverion/Bravida/Assemblin, vis aktivitet og prosjekt/Tripletex-omsetning på kundekortet, og legg til mulighetstypen «Serviceavtale».
7. **Kalender:** behold delegert lead-kalender som valgfri. Senere byttes den til sentral kalenderapp når Simens app er godkjent.
8. **Tilgang:** egen selskapsvis CRM-modultilgang (vise/redigere) via eksisterende modulmatrise, og test at selgere i ett selskap ikke ser et annet.

## 5. Trygt testopplegg

- Egne testtester (ingen produksjonsrader) for dedupe, normalisering av org.nr., selskapsgrense og tilgang.
- Brønnøysund testes med kun lesende oppslag. Import testes i forhåndsvisning uten lagring.
- Varsler og kalender er avslått eller mocket i test. Ingen jobber, tilbud, e-post eller Outlook-avtaler opprettes.
- Produksjonsimport kjøres først etter at forhåndsvisningen er godkjent av Thomas/Rune.

## Tekniske detaljer

- Dedupe i dag: `CustomerImportPage.tsx:146-175` henter kunder klientside og sammenligner org.nr. (fjerner bare mellomrom) og navn uten `company_id`-filter. Inserts er sekvensielle uten transaksjon.
- Indekser: `idx_customers_org_number` er ikke unik. `leads` har bare `lead_ref_code` som unik.
- Policy `Leads access by scope`: `legacy_admin_in_company OR get_user_scope(all/company/own+deltaker)`.
- Kundetabellen har restriktive `phase2_module_*`. Nye self-service-unntak må også utvide den restriktive regelen.
