# Varslingsrevisjon v2 – én sentral varslingsregel (kun plan, til godkjenning)

Ingen kode er endret, og ingen e-post eller testjobb er laget. Denne versjonen bygger på den forrige revisjonen og tar inn beslutningen fra eier.

## Beslutning fra eier (låst)
- Bestiller får alltid e-post ved statusene **Mottatt, Planlagt, Utført og Avvist**.
  - Varslene er obligatoriske transaksjonsbekreftelser og går bare på e-post.
  - De sendes automatisk, uten avkrysning, og kan ikke skrus av.
- Bare en faktisk statusovergang gir utsending. Å lagre uendret status gir ingen e-post.
- Idempotens per statusovergang og mottaker, slik at samme varsel aldri sendes to ganger.
- Bestiller får én mottaksbekreftelse, ikke to. Bekreftelsen ved innsending *er* «Mottatt»-varselet, og en senere overgang til «Mottatt» sender ikke på nytt.
- Systemet viser aldri «sendt» uten et dokumentert resultat.
- Valgfrie interne e-poster er **på** som standard og kan skrus av i selve handlingen, som i Ressursplan.
- Alle regler ligger i én sentral kilde. Ingen avkrysningsbokser i grensesnittet har egen logikk.

## Statuskobling (må bekreftes)
De faktiske statusverdiene i dag er: `new` (12), `under_review` (1), `waiting_internal` (1), `task_created` (6), `rejected` (1) og `closed` (31). Forslag til kobling:

| Varsel til bestiller | Utløses ved overgang til |
|---|---|
| Mottatt | Innsending (`new`), bare én gang |
| Planlagt | `task_created`, eller når jobb i Ressursplan får dato |
| Utført | `closed` med utfallet utført |
| Avvist | `rejected` |

`under_review` og `waiting_internal` er interne statuser og gir ingen e-post til bestiller. `closed` kan i dag bety både utført og henlagt. Første byggesteg avklarer om det trengs et eget utfall, slik at en henlagt bestilling ikke blir meldt som «Utført».

## Oppdatert matrise

| Hendelse | Mottaker | Kanal | Standard | Kan skrus av |
|---|---|---|---|---|
| Innsendt = Mottatt | Bestiller | E-post | Alltid | Nei |
| Planlagt / Utført / Avvist | Bestiller | E-post | Alltid | Nei |
| Ny bestilling | Postkontoret / malens mottakere | E-post | Alltid | Nei |
| Ny bestilling | Bestillingsansvarlige | Varsel i Hub | På | Ja, per bruker |
| Tildeling | Ny ansvarlig | Varsel i Hub og e-post | På | E-posten kan skrus av i handlingen |
| Mangler info / feltforespørsel | Bestiller | E-post | Alltid (er selve handlingen) | Nei |
| Delt melding | Bestiller | E-post | På | Ja, i handlingen |
| Svar fra bestiller | Ansvarlig og adressert person | Ett varsel i Hub | Alltid | Nei |
| Intern adressert melding | Deltaker | Varsel i Hub og e-post | På (`receives_notifications`) | Ja |
| Ressursplan: jobb og endring | Montør | E-post og Outlook | På | Ekstra e-post kan skrus av (som i dag) |
| Prosjektmeldinger og HMS | Etter egen kartlegging | | | |

Bestilleren er aldri avhengig av varselboksen i Hub. Montørens mobil viser bare varsler om egne oppdrag.

## Sentral kilde – design
```text
Statusendring / handling
  → én serverfunksjon: sammenligner gammel og ny status (ingen endring = ingen hendelse)
  → hendelseslogg med idempotensnøkkel (bestilling + overgang + mottaker)
  → regeltabell i kode: hendelse × mottaker × kanal × standard × låst
  → e-post via felles kø (postkontoret@) · varsel i Hub = én rad per bruker
  → leveringsstatus per mottaker: i kø / akseptert / feilet / hoppet over (årsak)
```
- Grensesnittet henter standardvalg og låser fra regeltabellen.
  - Obligatoriske varsler vises som en fast tekst, for eksempel «Bestiller får e-post automatisk».
  - Valgfrie varsler vises som en bryter som står på.
- Etter handlingen vises faktisk resultat, for eksempel «Akseptert av Microsoft 10:42», «Feilet – prøver igjen» eller «Ikke sendt: mangler e-post».
- Avkrysningene for statusvarsel og tildeling i bestillingsdetaljen, og «varsle bestiller» i oppgavedialogen, fjernes som egne logikkilder.

## Faser (venter på godkjenning)
0. **Kun lesing:** bekreft statuskoblingen og kartlegg varslingsløpene i Ressursplan, prosjektmeldinger og HMS inn i samme matrise.
1. **Regeltabell og hendelseslogg:**
   - Statusvarslene flyttes til serveren, med sammenligning av før og etter.
   - Innsending og bekreftelse flyttes ut av nettleseren.
   - Utsendingsbryteren står av, og alt testes mot en simulert Microsoft-tjeneste.
2. **Grensesnittet leser fra regeltabellen** og viser faktisk resultat.
3. **Dobbeltvarsler i Hub ryddes:** triggeren som varsler alle administratorer fjernes, og de to meldingstriggerne slås sammen.
4. **Ressursplan, prosjektmeldinger og HMS** inn i samme motor, etter egen diff.

## Tester (ingen ekte utsending)
- Hver av de fire statusene gir nøyaktig én e-post til bestiller. Den kan ikke skrus av.
- Lagring av uendret status gir 0 e-poster.
- Innsending etterfulgt av «Mottatt» gir én bekreftelse totalt.
- Gjentatt kall eller nytt forsøk gir ingen duplikat (idempotens).
- `under_review` og `waiting_internal` gir 0 e-poster til bestiller.
- Valgfri intern e-post står på som standard. Når den skrus av, gir det 0 e-poster og «hoppet over (valgt bort)».
- Et svar fra Microsoft med 202 vises som «akseptert», en feil som «feilet» med nytt forsøk, og «sendt» vises aldri uten logget resultat.
- Bestiller er aldri mottaker av varsel i Hub.

## Gjenstår før bygging
- Godkjenning av helheten og av statuskoblingen over, særlig hva `closed` betyr.
- Spørsmålet om varsel i Hub ved ny bestilling (alle administratorer eller bare bestillingsansvarlige) står fortsatt åpent. Forslaget er bare bestillingsansvarlige.
