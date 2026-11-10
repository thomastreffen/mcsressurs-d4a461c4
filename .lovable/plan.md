# Prosjektdokumentasjon i Hub og overføring til Tripletex: plan

Hub er master for dokumentasjon. Tripletex er master for økonomi og faktura. Bare godkjent, låst dokumentasjon kan overføres, og bare til det samme økonomiske prosjektet. Overføringen bruker en aktiv, selskapsavgrenset kobling på stabil ID. BusBar og andre selskaper uten Tripletex fortsetter som i dag, bare i Hub.

## Verifiserte funn (lest i koden nå)

Alvorlighetsgrad: P0 = må rettes før noe sendes ut, P1 = viktig, men ikke stopper.

| # | Funn | Hvor | Alvor |
|---|---|---|---|
| 1 | Et ubesvart sjekklistepunkt vises og lagres som «OK». Default `{status:"ok"}` brukes både i visningen og når punktet endres. | `src/pages/FormFillPage.tsx` l.164, l.314 | P0 |
| 2 | `canComplete()` sjekker bare foto ved avvik og kommentar ved kritisk risiko. Obligatoriske felt, ubesvarte punkter og påkrevd signatur sjekkes ikke. | FormFillPage l.174–192 | P0 |
| 3 | Autolagring ignorerer `error`. Ingen lagrestatus, ingen nytt forsøk og ingen beskyttelse mot at to lagringer overskriver hverandre. Bare en timer på 1,5 s. | FormFillPage l.127–144 | P0 |
| 4 | `handleComplete` venter ikke på pågående autolagring og ignorerer feil fra oppdateringen. Den viser «ferdig» uansett. | l.194–210 | P0 |
| 5 | `handleSign` sjekker feil på signaturen, men ikke på låsingen og statusoppdateringen. Det kan gi en signatur på et ulåst skjema. «Signaturen» er bare tekst (`Signert av X den …`), ikke en tegnet signatur. Rollen avgjøres i nettleseren (`isAdmin`). | l.212–240 | P0 |
| 6 | Opplåsing bruker `prompt()`, og tilgangen sjekkes bare i nettleseren. | l.243–247 | P1 |
| 7 | `checkRequiredForms` lar jobben fullføres ved nettverksfeil eller tilgangsfeil (fail-open). Den leser globale maler uten selskapsfilter. | `src/components/forms/ProjectFormsSection.tsx` l.260–293 | P0 |
| 8 | MyDayChecklists regner `completed` og `signed` som ferdig, uten å vite noe om innholdet er gyldig. | `src/components/forms/MyDayChecklists.tsx` l.139 | P1 (følger av 1–5) |
| 9 | Det finnes ingen opplasting til `documentArchive` eller vedlegg i Tripletex-funksjonene. Det betyr at ingen automatisk utsending eksisterer i dag. | `supabase/functions/tripletex-*` | Info |
| 10 | Servicejournalen har sine egne statuser (draft/review/approved/sent) og PDF i `service-journal-pdf`. Skjemaene har ingen PDF-snapshot. | `service-journal-pdf` | P1 |

Dette må verifiseres i fase A0 før bygging, fordi det ikke er lest ennå:
- RLS og selskapsavgrensning på `form_instances`, `form_signatures` og `form_templates`.
- Om skjemaets status kan endres direkte med API av montøren. Det betyr at grensen i dag ligger i nettleseren.
- Hvor PDF av skjemaer eventuelt genereres.
- Hvor fotoene lagres (bøtte og om den er offentlig).
- Faktureringsporten i `invoice_basis`.

## Målbilde

```text
Montør (mobil)                Prosjektleder (desktop)          Tripletex
Mine jobber -> sluttkontroll  Kø "Til kvalitetssikring"
utfyll, foto, signer  ---->   Les PDF-forhåndsvisning
(autolagret, offline-kø)      Godkjenn / Send tilbake m/grunn
                               |
                               v  (låst snapshot + SHA256 v1)
                              Dokumentpakke "Godkjent"
                               |  eksplisitt "Overfør til Tripletex" (B)
                               v
                              Prosjektarkiv på samme  ------>  /documentArchive/project/{id}
                              stable-ID-prosjekt               Manuelt "Behandle vedlegg"
                                                               på prosjektfaktura (C)
```

Statusmodell for skjemaer, håndhevet på serveren:

```text
not_started -> in_progress -> submitted -> approved -> (exported)
                       ^           |
                       +-returned--+   (approved = låst, ny versjon for endringer)
```

## Fase A: robust sluttkontroll og godkjenning i Hub (minste nyttige leveranse)

**A0: Verifisering (read-only)**
- Gå gjennom RLS, lagring og PDF-veier.
- Les eksisterende data: hvor mange skjemaer med status `completed`/`signed` som har punkter uten svar.
- Rapporter dette uten å endre noe.

**A1: P0-rettinger i utfyllingen**
- Et sjekklistepunkt har tilstanden `null` til det er aktivt valgt. Visningen viser «Ikke besvart».
- Gamle svar som mangler `status` regnes som ubesvart, ikke OK.
- Felles validator (`validateFormAnswers(template, answers)`) i delt kode. Den brukes av nettleseren for tilbakemelding og av serveren for selve avgjørelsen. Den sjekker:
  - obligatoriske felt
  - at alle sjekklistepunkter er besvart
  - foto ved avvik
  - kommentar ved kritisk risiko
  - påkrevd signatur
- Robust autolagring:
  - versjonsnummer per skjema (optimistisk lås, `revision`)
  - lagrekø med ett kall om gangen og eksponentiell retry
  - lokal kopi i IndexedDB inntil lagringen er bekreftet
  - synlig status: «Lagret», «Lagrer…», «Ikke lagret – prøver igjen», «Konflikt»
  - lagring ved `visibilitychange`/`pagehide`
- Fullfør og signer går gjennom én atomisk server-RPC (`submit_form_instance`, `sign_form_instance`). RPC-en:
  - tar imot forventet versjon
  - kjører validatoren
  - sjekker tilgangen til jobb og selskap med den innloggede brukerens rettigheter (caller RLS)
  - skriver status, signatur og lås i én transaksjon
- Nettleseren får ikke lenger lov til å oppdatere `status` eller `locked_*` direkte. Det håndheves med en trigger eller en kolonne-guard.

**A2: Ekte signatur og foto**
- Tegnet signatur (canvas -> PNG) lagres privat, sammen med navn, rolle fra serveren, tidspunkt og hash av svarene på signeringstidspunktet.
- Fotoene telles på serveren fra koblede vedlegg, ikke fra `photo_count` som nettleseren sender.

**A3: Krav om skjema før fullføring er fail-closed**
- `checkRequiredForms` flyttes til en RPC med selskapsfilter.
- Ved feil vises «Kunne ikke kontrollere – prøv igjen», og jobben blokkeres.
- Bare status `approved` teller for faktureringsporten. `submitted` teller for fullføring.

**A4: Kvalitetssikring**
- Desktop: køen «Til kvalitetssikring» per prosjekt. Den viser:
  - PDF-forhåndsvisning
  - godkjenn
  - send tilbake med begrunnelse (inline eller i en skuff, ikke modal)
- Godkjenning er en server-RPC. Den:
  - genererer en låst PDF-snapshot i en Edge-funksjon (gjenbruker PDF-oppsettet fra servicejournalen)
  - lagrer den i en privat bøtte
  - lagrer SHA256 og versjon
- Endring etter godkjenning gir en ny versjon. Den gamle beholdes uendret.
- Opplåsing blir en server-RPC med påkrevd begrunnelse og logg.

**A5: Mobil**
- MyDay viser «Sluttkontroll mangler / Til godkjenning / Returnert» per jobb.
- Store berøringsflater (44 px) og ett punkt om gangen.
- Avvik åpner kamera direkte.

## Fase B: TEST-only arkivering i Tripletex (eksplisitt handling)

- Ny Edge-funksjon `tripletex-document-export` bak `_shared/tripletex-guard.ts`:
  - nøkkelen brukes bare på serveren
  - tilkoblingen må være `write_enabled` og i miljø TEST
  - selskapet må være verifisert
- Målet utledes slik: jobb -> `parent_project_id` -> økonomisk prosjekt med aktiv prosjektkobling i samme selskap. Jobber oppretter aldri egne Tripletex-prosjekter. Uten aktiv kobling: `not_linked`, og ingen kall sendes.
- Prosjektet må være åpent. Det sjekkes med en fersk lesing (`isClosed === false`). Fail-closed.
- Ny tabell `tripletex_document_exports`:
  - knyttes til tilkobling og selskap
  - inneholder `document_snapshot_id`, `version`, `sha256`, `tripletex_project_id` og `tripletex_document_id`
  - inneholder status (`pending`, `uploaded`, `verified`, `failed`), forsøk og siste feil
  - har unik indeks på (tilkobling, prosjekt, snapshot, versjon), slik at samme fil ikke kan sendes to ganger
  - en `pending`-rad reserveres før opplastingen
- Flyt:
  1. Reserver rad.
  2. `POST /documentArchive/project/{id}`.
  3. Les tilbake med `GET` og kontroller filnavn og størrelse.
  4. Sett status `verified`.
  5. Skriv auditlogg.
- Retry gjenbruker raden. Hvis en tidligere opplasting har ukjent utfall, sjekkes det ved tilbakelesing før et nytt forsøk.
- Ingen historisk backfill, og bare skjemaer med status `approved`.
- Valgfri separat deling fra Hub (for eksempel til kunden) er egen handling. Den er ikke koblet til eksporten.

## Fase C: fakturavedlegg

- C1: Verifiser i TEST og OpenAPI om et vedlegg i prosjektarkivet kan merkes som fakturavedlegg på prosjektfaktura. `/order/{id}/:attach` gjelder ordre og antas ikke å gjelde prosjektfaktura. Dokumenter resultatet.
- C2: Standard flyt er at regnskap bruker «Behandle vedlegg» manuelt i Tripletex. Hub viser bare «Arkivert i Tripletex» med lenke og versjon.
- C3: Automatikk bygges bare hvis API-et er dokumentert og demonstrert i TEST, og etter egen godkjenning.
- LIVE: først read-only kontroll av mål og kobling. Skriving i produksjon krever eksplisitt godkjenning per selskap.

## Datamodell (nytt eller endret)

- `form_instances`: nye felt `revision`, `submitted_at/by`, `approved_at/by`, `returned_reason` og statusene `submitted`, `approved` og `returned`.
- `form_document_snapshots`: instans, versjon, sti i lagringen, sha256, svar-hash, hvem som godkjente og tidspunkt. Tabellen er uforanderlig.
- `form_signatures`: sti til signaturbildet, svar-hash og rolle fra serveren.
- `tripletex_document_exports`: se fase B.

## Testplan

Alle tester kjøres i PGlite og Vitest. Ingen ekte Tripletex- eller e-postkall.

- Validator: ubesvart punkt er ikke OK; obligatoriske felt; foto ved avvik; signatur.
- Autolagring: feilrespons gir retry og synlig status; konflikt i versjon; ingen tap etter at fanen lukkes.
- RPC-er: direkte statusoppdatering avvises; feil selskap avvises; submit og sign skjer atomisk.
- Krav om skjema: nettverksfeil eller tilgangsfeil blokkerer fullføring.
- Snapshot: hashen er stabil; endring etter godkjenning gir v2.
- Eksport (med mock): ingen kobling betyr ingen kall; lukket prosjekt avvises; samme snapshot to ganger gir én opplasting; ukjent utfall løses ved tilbakelesing; LIVE avvises uten flagg.
- Mobil med Playwright, på isolerte testdata.

## Risikoer

- Eksisterende «fullførte» skjemaer kan ha falske OK-punkter. A0 teller dem, og de merkes som «krever ny kontroll» i stedet for å regnes som gyldige.
- Hvis RLS i dag lar montøren skrive status direkte, må den grensen strammes uten at den legitime utfyllingen brytes.
- Tripletex-støtte for prosjektfakturavedlegg er uavklart. Derfor er fase C manuell.
- Store PDF-er med foto: komprimer, og bruk signerte lenker internt.

## Rekkefølge og minste nyttige leveranse

Minste nyttige leveranse er A0 og A1 og A3: ærlig utfylling, sikker lagring og fail-closed krav. Deretter A2 og A4 (signatur, godkjenning og låst PDF), så A5. B starter først når A4 er i bruk. C1 kan undersøkes i TEST parallelt med A, men bare som lesing og dokumentasjon.
