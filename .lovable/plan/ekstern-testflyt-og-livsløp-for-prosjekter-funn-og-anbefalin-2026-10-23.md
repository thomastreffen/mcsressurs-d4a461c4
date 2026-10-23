# Ekstern testflyt og livsløp for prosjekter – funn og anbefaling (kun lesing)

Ingenting er bygget, sendt eller opprettet. Alle funn under kommer fra direkte lesing av databasen og koden.

## 1. Finnes prosjektet fortsatt?
Ja. `025618e0-be5d-40b9-907f-c438d46d6ce6` «TEST – ekstern invitasjon tt – 22.10.2026»:
- status `early_planning` (Tidlig planlegging), visibility `internal`, economic_state `draft`
- `deleted_at` / `deleted_by` = null (ikke slettet). Det finnes ikke noe eget arkiv-felt på planleggingsprosjekter.
- **selskap = MCS BusBar AS** (`a3eb3912…`), eier/oppretter = Thomas, 1 intern medlem.

## 2. Hvorfor vises det ikke i intern Planlegging?
Prosjektet er levende og Thomas har lesetilgang (han er oppretter). Det er listevisningens selskapsfilter som skjuler det:
- Listen henter bare prosjekter i **aktivt selskap**, med mindre «Alle selskaper» er valgt.
- De andre testkortene ligger i MCS Service AS og MCS Elektrotavler AS. Testprosjektet ligger i BusBar.
- Med Service eller Elektrotavler som aktivt selskap blir BusBar-prosjektet borte, uten at det står noe sted at prosjekter i andre selskaper er filtrert bort.

Diagnosen er sterk, men ikke helt bekreftet: jeg kan ikke se hvilket selskap som var aktivt i økten hans. Bekreftes ved å bytte til BusBar eller «Alle selskaper».

## 3. Er ekstern tilgang fortsatt koblet riktig?
Ja, den er ikke foreldreløs. Deltaker `c1a84c34…` (tt@mcsservice.no, Leverandør) er `active`, ikke slettet, akseptert 22.10, og koblet til samme prosjekt og person.
Ny lenke kan bestilles fordi bestillingen bare krever: aktiv deltaker, ikke slettet, og prosjekt som ikke er slettet. Det er riktig oppførsel i dag.

## 4. Meldingen
Prosjektet har tre meldinger: to fra 22.10 (Leverandør og Intern plan) og én ny fra 23.10 08:01 i Leverandør, som er meldingen han skrev. Den ligger på riktig prosjekt og er ikke slettet. Interne brukere med tilgang leser den via direkte prosjektadresse, siden direkte oppslag ikke filtrerer på aktivt selskap.

## 5. Hull i dagens livsløp
Alle eksterne sjekker ser bare på `deleted_at` og deltakerstatus. **Prosjektstatus blir ikke sjekket i det hele tatt.**

| Situasjon | Ekstern tilgang i dag |
|---|---|
| Prosjekt soft-slettet | Økter, åpning og ny lenke stoppes (riktig). Direkte adresse gir en generell feil, ikke en tydelig «avsluttet»-tekst. |
| Status Fullført/Kansellert | **Full tilgang beholdes**: lesing, ny lenke, nye meldinger og filer. Unntaket er at oppgaver ikke kan fullføres. |
| «Arkivert» | Finnes ikke som tilstand. |
| Deltaker «Avslutt tilgang» | Stoppes (riktig). |
| Gjenoppretting fra papirkurv | Gamle deltakere blir aktive igjen automatisk, og ingen ser på dem på nytt. |
| Prosjekt i annet selskap enn det aktive | Synlig eksternt, men usynlig i intern liste uten varsel. Dette er «levende, men usynlig». |

Andre hull:
- Bestilling på e-post velger bare siste aktive deltaker (`LIMIT 1`). Det er greit i dag, men det bør heller sendes til hele inngangen.
- Fillenker kan virke inntil 60 sekunder etter tilbakekalling (kjent fra før).

## 6. Anbefalt livsløp

| Tilstand | Internt | Ekstern ser | Ekstern kan |
|---|---|---|---|
| active (alle planleggingsstatuser utenom under) | Vanlig liste | Alt som er delt med dem | Lese, skrive, laste ned, fullføre egne oppgaver |
| closed (Fullført) | Fane «Avsluttet», egen merkelapp | Prosjektet med banner «Prosjektet er avsluttet – kun lesing» | Kun lese og laste ned i en periode (f.eks. 30 dager), deretter som archived |
| archived (Kansellert, eller manuelt arkivert) | Fane «Arkiv» | Kort i Mine prosjekter: «Prosjektet er arkivert. Tilgangen er avsluttet.» | Ingenting. Ingen ny lenke til dette prosjektet. |
| deleted / finnes ikke | Papirkurv | «Prosjektet eksisterer ikke lenger, eller tilgangen er avsluttet.» Samme tekst for «finnes ikke» og «ingen tilgang», så ingenting lekker. | Ingenting. Alle økter ugyldige. |

Gjenoppretting fra papirkurv eller arkiv aktiverer aldri ekstern tilgang automatisk. Deltakerne blir «Satt på pause», og en ansvarlig må aktivere dem eksplisitt.

## 7. Aldri «usynlig, men levende» internt
- Planlegging viser en tydelig linje: «N prosjekter i andre selskaper er skjult – vis alle», for prosjekter brukeren har tilgang til utenfor aktivt selskap.
- Egne faner for Aktive, Avsluttet og Arkiv. Kansellert og Fullført forsvinner aldri stille.
- Prosjektkortet og prosjektrommet viser «Eksterne har tilgang (N)», så aktive eksterne på et lukket prosjekt er synlige.
- Admin-oversikt: «Ekstern tilgang på avsluttede eller arkiverte prosjekter» skal normalt være tom.

## 8. Regler som må håndheves på serveren
1. Én felles livsløpsfunksjon (`planning_project_external_mode`: write/read/none) brukes av identitet, prosjektvisning, kanaler, filer, meldinger, oppgavefullføring og lenkebestilling. Ingen sjekk ligger kun i grensesnittet.
2. Nye meldinger eksternt krever modus write. En databaseregel (trigger) på meldingstabellen avviser ekstern forfatter når prosjektet ikke er aktivt, også ved direkte API-kall.
3. Filopplasting og signerte fillenker følger samme modus. Ved none utstedes ingen signerte lenker.
4. Bestilling av ny lenke hopper over prosjekter med none, og svarer likevel nøytralt utad.
5. Statusskifte til archived eller deleted ugyldiggjør eksisterende eksterne økter og lenker i samme transaksjon, og logges i aktivitet.
6. Gjenoppretting setter eksterne deltakere til `paused`, og krever eksplisitt reaktivering.
7. Like feiltekster for «finnes ikke», «ingen tilgang» og «slettet», så ingen kan gjette prosjekt-ID-er (IDOR).
8. Selskapsfilteret i intern liste er en visningshjelp, ikke tilgangskontroll. Tilgang avgjøres fortsatt av databasens tilgangsregler.

## Foreslåtte neste steg (når du godkjenner bygging)
1. Bekrefte diagnosen i punkt 2 med BusBar eller «Alle selskaper» (kun lesing).
2. Livsløpsfunksjonen og databaseregler (1–7) med tester for hver tilstand: lese, skrive, fil, ny lenke, direkte adresse, reload.
3. Ekstern visning: banner for kun lesing, låst skriveboks, tydelig «avsluttet»-side.
4. Intern visning: linje for skjulte selskaper, fanene Avsluttet og Arkiv, teller for eksterne.
Ingen e-post, varsler eller ekte deltakere i testing. Kun isolerte testprosjekter.

## Avklaringer
- Skal Fullført gi kun lesing i 30 dager, eller stenge ekstern tilgang med en gang?
- Skal Kansellert regnes som arkivert (stengt)?
