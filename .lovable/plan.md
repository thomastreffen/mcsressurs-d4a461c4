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

## 6. UX-spesifikasjon: Leads-/kundeoversikt

### Dagens leads-liste (verifisert i `LeadsPage.tsx`)
- Kolonner: Kunde, Status, Sist aktivitet og Neste steg (begge skjult på smal skjerm), Est. verdi, Handlinger.
- Filtre: bare status og søk. Mobil er samme tabell med skjulte kolonner, ikke egne kort.
- Mangler: ansvarlig, relasjon, temperatur, prioritet, region og gruppering. «Sist aktivitet» er ikke en registrert siste kontakt.

### Prinsipp
Oversikten viser **virksomheter**, ikke løse leads. Hver rad er én virksomhet (unik på org.nr.) med sin åpne mulighet. Det gir én rad per bedrift og ingen duplikater.

### Desktop-tabell
| Kolonne | Innhold |
|---|---|
| Virksomhet | Navn, org.nr. (lite), kommune |
| Relasjon | Merke: Prospekt / Kunde / Tidligere kunde / Partner |
| Temp. | Cold / Warm / Hot (farge + tekst) |
| Pri. | A / B / C |
| Pipeline | Status på åpen mulighet, eller «Ingen åpen mulighet» |
| Ansvarlig | Avatar + navn. Tomt vises som «Mangler ansvarlig» (varsel) |
| Siste kontakt | Dato + type (samtale/møte/e-post) + kort notat, fra siste registrerte aktivitet |
| Neste aktivitet | Type + dato. Rød hvis forfalt, gul i dag, grå hvis ingen |
| Verdi | Est. verdi på åpen mulighet |
| Handlinger | Logg kontakt, Planlegg neste, Åpne |

- **Filtre** (lagres per bruker): Relasjon, Temperatur, Prioritet, Pipeline, Ansvarlig («Mine» som standard), Region (Oslo, Romerike, Nannestad/Gardermoen, Innlandet/Hamar), Neste aktivitet (forfalt / i dag / denne uken / ingen), og søk på navn/org.nr.
- **Grupperinger** (valgfritt): Ansvarlig, Temperatur, Pipeline eller Region. Antall og sum verdi står i gruppeoverskriften.
- **Standard sortering:** forfalt neste aktivitet først, deretter prioritet A→C og temperatur hot→cold.
- **Hurtigvisninger (faner):** Mine oppfølginger, Cold-prospekter, Hot-kunder, Uten ansvarlig, Uten neste aktivitet.

### Mobilkort
```text
[Hot] [A]  Bravida Norge AS            Kunde
Pipeline: Tilbud sendt · 450 000
Ansvarlig: Rune Ø.
Sist: Samtale 05.11 – «ønsker serviceavtale»
Neste: Møte 13.11  (gul hvis i dag, rød hvis forfalt)
[ Ring ]  [ Logg kontakt ]  [ Neste aktivitet ]
```
- Øverst: Mine oppfølginger i dag/forfalt. Filtrene ligger i en nedtrekksskuff, og knappene er minst 44px.
- «Logg kontakt» er en liten skuff med type, notat og neste aktivitet (valgfritt) i samme lagring, ikke et modalvindu.

### Kundekort og historikk uten duplikater
- Én tidslinje per virksomhet i `activity_log`, med `entity=customer`. Aktiviteter på mulighet, tilbud eller prosjekt får også `customer_id`, så kundekortet viser alt i én samlet liste uten å kopiere.
- «Siste kontakt» og «Neste aktivitet» beregnes fra aktivitets-/oppgavetabellen og lagres ikke som egne kopier. Feltene `leads.next_action_*` fases ut eller speiles bare én vei.
- Mulighet (lead) har pipeline-status. Virksomheten har relasjon, temperatur og prioritet. Når en mulighet vinnes, endres bare relasjonen til «Kunde»; virksomhetsraden er den samme.
- Kontaktpersoner ligger kun under virksomheten. En lead peker på en kontakt i stedet for fritekst.
- Ved import og ny registrering slås org.nr. opp først. Finnes virksomheten, åpnes den eksisterende i stedet for å lage en ny.

## 7. Arbeidsverktøy: oversikter og endringslogg

- **Sist endret og av hvem:** `leads` har `updated_at`, men ikke hvem som endret. Planen legger til `updated_by`, satt på serveren, og viser «Endret 10.11 av Rune Ø.» på rad og kort.
- **Endringslogg:** feltendringer på virksomhet og mulighet (ansvarlig, status, temperatur, prioritet, neste aktivitet) skrives av en databasetrigger til `activity_log` med gammel → ny verdi. Én kilde, ingen dobbel føring i `lead_history`.
- **Mine oppfølginger** (standard startside for selger) har tre bolker: Forfalt, I dag og Denne uken. Under dem ligger «Nye tildelt meg» og «Uten neste aktivitet».
- **Ledelsesoversikt** (egen fane, krever lesetilgang til selskapet):
  - antall per ansvarlig med forfalt og uten neste aktivitet
  - pipelineverdi per status
  - hot A-kunder uten kontakt de siste 30 dager
  - serviceavtale-muligheter
  - nye og tapte siste 30 dager

  Lederne leser oversikten i stedet for å få varsel om hver hendelse.
- **Serviceavtaler:** egen mulighetstype og filter. Utløpsdato på eksisterende avtaler kan senere kobles til kontraktsmodulen (`contracts`), som allerede har frister.

## 8. Varsling – dagens tilstand (verifisert)

- Lead-varsler sendes i dag **fra nettleseren**: `LeadDetail.tsx:235-240` setter inn `notifications` med type `lead_update` til deltakere med `notify_enabled`. Egen bruker er unntatt. Det er ingen dedupe og ingen kvittering, og varselet går tapt hvis fanen lukkes.
- Produksjonen har 0 slike varsler, og ingen andre lead-hendelser (tildeling, frist, overdragelse) varsler.
- Det er ingen DB-trigger på leads som varsler administratorer. Det er bra og må beholdes. Ordningen der alle administratorer ble varslet om bestillinger er allerede erstattet av en selskapsvis mottakerliste.
- Tilgangsnøkler som finnes: `leads.view/create/edit/convert/create_meeting/email_draft/manage_participants/transfer_owner`.

## 9. Foreslått varslingsmatrise

Alle varsler opprettes på **serveren** (trigger eller RPC), aldri fra nettleseren. Den som utfører handlingen varsles aldri. Dedupe-nøkkel er hendelse + objekt + mottaker + versjon (unik indeks). Kanal er alltid Hub-varsel; e-post bare der det står i tabellen.

| Hendelse | Mottakere | Kanal | Dedupe / frekvens | Utfall vises |
|---|---|---|---|---|
| Tildelt ansvar | Ny ansvarlig | Hub | Én per tildeling | Lest/ulest i varsel |
| Overdragelse | Ny og forrige ansvarlig | Hub | Én per overdragelse | Logg i tidslinje |
| Ny aktivitet logget | Ansvarlig + eksplisitte deltakere (varsling på) | Hub, samlet | Maks ett samlevarsel per objekt per time | – |
| Neste aktivitet forfaller i morgen | Ansvarlig | Hub | Én per aktivitet og dato | – |
| Forfalt | Ansvarlig | Hub, én gang. Valgfri daglig e-post-oppsummering kl. 07 | Ikke gjentatt daglig. Vises i «Mine oppfølginger» | – |
| Møte opprettet/endret/avlyst | Ansvarlig + interne deltakere | Hub. Outlook-invitasjonen er selve e-posten | Én per møteversjon | Invitasjonsstatus per deltaker (akseptert/avslått/ikke svart) hvis Graph gir det |
| Statusendring (vunnet/tapt/tilbud sendt) | Ansvarlig + deltakere | Hub | Én per overgang | Logg |
| Viktig intern kommentar (eksplisitt merket) | Navngitte personer | Hub | Én per kommentar | Lest |
| Ledelse | Ingen enkeltvarsler | Ledelsesoversikt og valgfri ukentlig e-post-oppsummering | Ukentlig | – |

- **Styring:** hver bruker kan velge Hub-varsel av/på per kategori og daglig oppsummering i stedet for enkeltvarsler. Tildeling og overdragelse kan ikke slås av.
- **Ingen automatisk e-post til kunder.** Eksterne får bare Outlook-invitasjoner som selgeren selv har sendt.
- **Test:** varselreglene er rene funksjoner med enhetstester (mottakere, at egen handling ikke varsler, dedupe). I testmiljø er e-post slått av.

## 10. Teams-møter fra CRM – verifisert tilstand

- `lead-calendar-event` lager en **vanlig Outlook-kalenderhendelse** via `/me/events` med deltakere og kundens e-post. `isOnlineMeeting` settes ikke, så det blir **ikke et Teams-møte**. Den bruker selgerens delegerte token (`Calendars.ReadWrite`). Hvis tokenet mangler, svarer den «No valid Microsoft token». Invitasjonssvar leses ikke tilbake. Produksjonen har 0 slike lenker.
- `teams-meeting` lager Teams-møter via `/me/onlineMeetings`, men **bare for jobber** (`job_id`). Den lager ingen kalenderinvitasjon. Den er ikke koblet til leads eller kunder.
- Konklusjon: **Teams fra CRM er ikke integrert i dag.**
- Forslag (sekundær prioritet):
  - Utvid `lead-calendar-event` med `isOnlineMeeting: true` og `onlineMeetingProvider: teamsForBusiness`. Det gir én Outlook-invitasjon med Teams-lenke.
  - Lagre `joinUrl` og `iCalUId`, og les deltakersvar ved oppdatering.
  - Vis tydelige feil hvis Microsoft-koblingen mangler.
  - Det må verifiseres i Simens tenant at Teams-møter er tillatt for brukeren før det tas i bruk. Kontrollen gjøres kun med lesing eller én godkjent pilot.

## 11. Samlet prioritert tiltaksliste

1. **P1 – Datagrunnlag:** duplikatrapport, felt for relasjon/temperatur/prioritet/region/ansvarlig, `customer_id` og `updated_by` på leads, unik regel på org.nr.
2. **P1 – Import 2.0** med Brønnøysund-berikelse og forhåndsvisning.
3. **P1 – Oversikt:** virksomhetsliste (desktop og mobil), Mine oppfølginger og endringslogg via trigger.
4. **P2 – Varsling:** server-side matrise med dedupe. Fjern nettleserinnsettingen i `LeadDetail`.
5. **P2 – Ledelsesoversikt og serviceavtale-type.**
6. **P3 – Teams-møte fra lead/kundekort**, etter tenant-verifisering med Simen.
7. **P3 – Tilgang:** egen selskapsvis CRM-modul i modulmatrisen.

Ingenting gjøres i produksjon før hvert punkt er godkjent.
