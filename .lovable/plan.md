# Kundeimport 11.11 – lesende kontroll, rotårsak og reparasjonsplan

Kun lesing. Ingen kunder er endret, slettet eller importert.

## 1. Funn (verifisert)

| Opprettet | Antall | Kjennetegn |
|---|---|---|
| 27.02.2026 | 119 | Riktige navn og ni-sifret org.nr. Ingen Tripletex-kobling. 2 dobbeltregistreringer: Eaton Electric AS ×2 (913452100), MCS Elektrotavler AS ×2 (916282524) |
| 05.06.2026 | 5 | Riktige navn, men **org.nr. = Tripletex-kundenummer** (10008, 10029, 10083, 10084, 10085), samme verdi i `external_tripletex_id`. Granitor, Installatøren Oslo, Thor R S Andersen, Eltel Networks, Green Mountain |
| 11.11.2026 09:09 | 12 | **Navn = Tripletex-kundenummer** (10086–10097). Org.nr. er ni-sifret og trolig riktig. Ingen Tripletex-ID, e-post eller adresse |

Totalt 136 kunder: 17 åpenbart feil og 2 duplikatpar. De 119 andre ser strukturelt riktige ut. Innholdet (om org.nr. hører til riktig navn) er ikke kontrollert mot Brønnøysund.

## 2. Rotårsak for 11.11 (verifisert i kode)

`CustomerImportPage.tsx`:
1. **Automatisk kolonnevalg treffer feil kolonne.** Regelen `^(kunde|firm|company|name|navn)` velger «Kundenavn» for alle kolonner som *begynner* med «kunde». I Tripletex-eksporten heter nummerkolonnen «Kundenummer», så den blir koblet til navnefeltet. Kolonnen «Navn» kobles også til navnefeltet.
2. **Første treff vinner.** `getMappedValue` bruker `findIndex`. Når to kolonner står som «Kundenavn», brukes den første, altså kundenummeret. Ingen advarsel om at to kolonner peker til samme felt.
3. **Ikke noe felt for Tripletex-kundenummer eller -ID** i importen. Tallet kan derfor ikke lagres riktig, og `external_tripletex_id` blir aldri satt.
4. **Ingen validering.** Navn som bare er tall godtas, og org.nr. sjekkes ikke for ni siffer eller kontrollsiffer (mod 11).
5. **Forhåndsvisningen** viser bare rå kolonner, ikke hvordan hver rad faktisk blir lagret.

## 3. Hvorfor bare 12 nye

Importen sjekker duplikater først på org.nr. De ni-sifrede numrene fra filen fantes allerede hos 119 kunder. Disse ble hoppet over, ikke oppdatert. Bare 12 org.nr. var nye, og de ble opprettet med kundenummer som navn. Navnesjekken traff ikke fordi navnet var et tall. Eksisterende kunder ble altså **ikke** overskrevet.

## 4. De 5 radene fra 05.06

Ingen kode i prosjektet skriver i dag `customers.external_tripletex_id`. Hvordan disse ble laget er derfor **ikke verifisert**; det kan ha vært en tidligere funksjon eller manuell registrering. Mønsteret er samme type feil: kundenummer i org.nr.-feltet. `external_tripletex_id` inneholder et Tripletex-kundenummer, ikke en stabil Tripletex-ID, og må behandles som det.

## 5. Trygg reparasjon (krever eksplisitt godkjenning per steg)

1. **Lesende avstemming:** les Tripletex-kundelisten (kun lesing) eller den importerte filen. Lag en tabell per rad: Hub-kunde, Tripletex-kundenummer, Tripletex-ID, navn, org.nr. og Brønnøysund-navn.
2. **De 12 nye:** foreslå riktig navn fra filen eller Brønnøysund for hvert org.nr. Kontroller at hvert org.nr. ikke allerede finnes. Rett navn og legg inn Tripletex-nummer i eget felt, eller myk-slett hvis de ikke skal være kunder. Ingen sletting uten godkjenning.
3. **De 5 fra 05.06:** flytt kundenummeret til et eget felt, slå opp riktig org.nr. (f.eks. Eltel) og legg det inn etter kontroll.
4. **Duplikatpar:** velg hvilket kort som beholdes og flytt koblinger (tilbud, jobber, kontakter) før det andre myk-slettes.
5. **Ny Tripletex-kobling** gjennom `tripletex_links` (stabil ID + nummer som øyeblikksbilde), i tråd med eksisterende regel. Ikke via `external_tripletex_id`.
6. Hver retting logges i `activity_log` med gammel og ny verdi og hvem som godkjente. Retting skjer i små godkjente pakker, aldri som automatisk remapping.

## 6. Hindre gjentakelse (bygges etter godkjenning)

- **Kolonnevalg:** eksakte navn i stedet for «begynner med». «Kundenummer» blir eget felt, og «Navn»/«Kundenavn» blir navn. Hvert felt kan bare velges én gang; dobbeltvalg stopper importen. Egen forhåndsinnstilling for «Tripletex kundeeksport».
- **Validering per rad:** navn kan ikke være bare tall, org.nr. må ha ni siffer og gyldig kontrollsiffer, og Tripletex-nummer kan ikke legges i org.nr.-feltet.
- **Forhåndsvisning før lagring:** per rad vises Ny / Finnes (oppdater) / Konflikt / Ugyldig med ferdig tolket verdi. Ingenting lagres før brukeren bekrefter.
- **Dedupe på serveren:** importen kjøres i en serverfunksjon. Den har en unik regel per selskap + normalisert org.nr. (etter duplikatopprydding) og fletter med Tripletex-nummer og -ID. Tomme felt overskriver aldri eksisterende verdier.
- **Importlogg** med fil, mapping, antall og hvem, slik at en import kan spores og angres.
- **Tester:** tester for mapping («Kundenummer» blir aldri navn), org.nr.-sjekk, dobbeltvalg og dedupe.

## 7. Sammenheng med CRM og lokalkontorer

- Riktig hovedkunde (navn, org.nr., Tripletex-kobling) må være på plass **før** lokale avdelinger registreres under Caverion, Bravida, Assemblin, OneCo og Eltel.
- Lokalkontorer importeres aldri som egne kunder; de registreres manuelt som kundeenheter etter verifisering.
- Eltel (10084) er en av de fem feilradene og rettes i steg 3 før piloten.
- Ingen e-post, varsler eller kundekontakt i noe steg.

## Tekniske detaljer

- `suggestMapping` (`CustomerImportPage.tsx:40-53`): `/^(kunde|firm|company|name|navn)/`. `/by|city|sted/` er også for vid (treffer f.eks. «Bydel» og «Fakturasted»).
- `getMappedValue` (`:125-129`): `findIndex` gir første kolonne per felt.
- Dedupe (`:146-175`): org.nr. hentes uten `company_id`-filter, rader settes inn én og én, eksisterende rader oppdateres aldri.
- Parseren splitter på `;`/`,` uten å håndtere anførselstegn, så felt med komma inni kan forskyve kolonner. XLSX støttes ikke.
