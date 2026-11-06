# Varslingsrevisjon v3: én regel for varsler, med utfall ved lukking

Dette er bare en plan. Ingen kode er endret, ingen e-post er sendt, og ingen ekte bestillinger er brukt. Planen bygger på v2 og tar inn eiers beslutning om «Lukket».

## Låste beslutninger fra eier
- Bestiller får alltid e-post, og aldri varsel i Hub, når en bestilling blir **Mottatt, Planlagt, Utført eller Avvist**.
  - Disse e-postene er obligatoriske og automatiske.
  - Bestiller får bare e-post når statusen faktisk endres.
  - Hver statusendring gir bare én e-post til hver mottaker, selv om lagringen gjentas.
- **Lukket er en administrativ sluttstatus. Den betyr ikke «Utført».**
  - Den som lukker må alltid oppgi hvordan saken endte: enten **Utført** eller **Avsluttet uten utførelse** (henlagt eller kansellert). En begrunnelse kan legges ved.
  - Utført gir bestiller en bekreftelse på at jobben er gjort.
  - Avsluttet uten utførelse gir bestiller en tydelig beskjed om at saken er avsluttet uten utførelse, med begrunnelsen hvis den er fylt ut.
  - Lukkingen i seg selv sender aldri en egen e-post.
  - Er bestiller allerede varslet om Utført, sendes ingen ny e-post når saken lukkes.
- Bekreftelsen bestiller får ved innsending, regnes som «Mottatt». Bestiller får derfor aldri to mottaksbekreftelser.
- Hub viser aldri «sendt» uten at utsendingen er registrert med resultat.
- Valgfrie interne e-poster er slått på som standard. Den som utfører handlingen kan slå dem av der og da.
- Alle varslingsregler samles på ett sted.

## Statuser i dag og hva de skal gi
Disse statusene finnes i dag: `new`, `under_review`, `waiting_internal`, `task_created`, `rejected` og `closed`.

| Hendelse for bestiller | Utløses av |
|---|---|
| Mottatt | Innsending (`new`). Sendes én gang. |
| Planlagt | Overgang til `task_created`, eller når jobben får dato i Ressursplan |
| Utført | Utfallet `completed`, enten satt for seg eller ved lukking |
| Avsluttet uten utførelse | Utfallet `cancelled` ved lukking, med begrunnelse |
| Avvist | Overgang til `rejected` |
| Lukket | Ingen egen e-post. Utfallet avgjør hva bestiller får. |
| Under vurdering / venter internt | Ingen e-post. Dette er interne statuser. |

Gjenbruk av det som finnes:
- `status` beholder de verdiene den har i dag.
- Det legges til et felt for **utfall** (`completed` eller `cancelled`) og et felt for **begrunnelse**. Ingen eksisterende verdier endres.
- De 31 bestillingene som allerede er lukket, får utfallet «ukjent». De sender aldri e-post i ettertid.

## Oppdatert oversikt over varsler

| Hendelse | Mottaker | Kanal | Standard | Kan slås av |
|---|---|---|---|---|
| Innsendt, regnes som Mottatt | Bestiller | E-post | Alltid | Nei |
| Planlagt, Utført eller Avvist | Bestiller | E-post | Alltid | Nei |
| Lukket med utfall Utført | Bestiller | E-post om utført, bare hvis den ikke er sendt før | Alltid | Nei |
| Lukket med utfall Avsluttet uten utførelse | Bestiller | E-post om avslutning, med begrunnelse | Alltid | Nei |
| Ny bestilling | Postkontoret eller mottakerne i skjemaet | E-post | Alltid | Nei |
| Ny bestilling | Interne mottakere (avklares) | Varsel i Hub | På | Ja, per bruker |
| Tildeling | Ny ansvarlig | Varsel i Hub og e-post | På | E-posten kan slås av ved tildelingen |
| Mangler info eller etterspør felt | Bestiller | E-post | Alltid | Nei |
| Delt melding | Bestiller | E-post | På | Ja, når meldingen sendes |
| Svar fra bestiller | Ansvarlig og den meldingen er rettet til | Ett varsel i Hub | Alltid | Nei |
| Intern melding til en deltaker | Deltaker | Varsel i Hub og e-post | Følger deltakerens innstilling | Ja |
| Ressursplan: ny jobb eller endring | Montør | E-post og Outlook | På | Ekstra e-post kan slås av, som i dag |
| Prosjektmeldinger og HMS | Kartlegges i fase 0 | | | |

## Felles varslingsløp
```text
Statusendring / lukking / handling
  → server: sammenlign før/etter (status + utfall); uendret = ingen hendelse
  → hendelseslogg, nøkkel = bestilling + hendelsestype + mottaker
       (outcome_completed brukes både av Utført-status og Lukket+Utført → maks én)
  → regeltabell: hendelse × mottaker × kanal × standard × låst
  → e-post via felles kø fra postkontoret@ · Hub-varsel én rad per bruker
  → leveringslogg: i kø / akseptert / feilet / hoppet over (årsak)
```
Slik ser det ut for den som lukker:
- Hub ber alltid om utfall før saken kan lukkes. Uten utfall kan saken ikke lukkes.
- Hub viser på forhånd hvilken e-post bestiller kommer til å få.
- Har bestiller allerede fått e-post om Utført, står det i stedet at bestiller allerede er varslet.

## Faser (alle venter på godkjenning)
0. **Kartlegging uten endringer:** Ressursplan, prosjektmeldinger og HMS legges inn i samme oversikt.
1. **Regler og logg:**
   - Regeltabell og hendelseslogg med nøkkel som hindrer dobbel utsending.
   - Nye felt for utfall og begrunnelse.
   - Statusendringene håndteres på serveren.
   - Utsending er slått av, og den testes mot en etterligning av Microsoft i stedet for ekte e-post.
2. **Skjermbildene:**
   - Dialog for utfall når saken lukkes.
   - Skjermbildene viser standardvalg og låste valg slik reglene sier.
   - Faktisk utsendingsresultat vises.
3. **Opprydding:** Dobbeltvarsler i Hub fjernes. Det gjelder den automatiske regelen som varsler alle administratorer, og to regler for meldinger som i dag kan gi to varsler for samme hendelse.
4. **Samme løsning for resten:** Ressursplan, prosjektmeldinger og HMS flyttes over, etter egen oversikt over hva som endres.

## Tester uten ekte utsending
- Hver av de fire statusene gir nøyaktig én e-post, og den kan ikke slås av.
- Å lagre uten å endre status gir ingen e-post.
- Lukking uten utfall blir avvist.
- Utført og deretter Lukket med utfall Utført gir én e-post om utført til sammen.
- Lukket med utfall Utført, uten at Utført er satt før, gir én e-post om utført.
- Lukket med utfall Avsluttet uten utførelse gir én e-post om avslutning med begrunnelse, og ingen e-post om utført.
- Lukket i seg selv gir ingen ekstra e-post.
- Eldre lukkede saker med ukjent utfall gir ingen e-post.
- Innsending etterfulgt av Mottatt gir én bekreftelse.
- Å gjenta samme kall gir ingen ny e-post.
- Interne statuser gir ingen e-post.
- En valgfri intern e-post som er slått av, gir ingen e-post og registreres som «valgt bort».
- Når Microsoft svarer, vises «akseptert» eller «feilet». «Sendt» vises aldri uten registrert resultat.

## Gjenstår før bygging
- Eier må godkjenne hele planen.
- Hvem som skal få varsel i Hub ved ny bestilling: alle administratorer eller bare de med ansvar for bestillinger. Forslaget er bare de med ansvar for bestillinger.
