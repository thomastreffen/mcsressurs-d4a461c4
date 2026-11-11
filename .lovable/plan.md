# BST-000067 – hva skjedde, rotårsak og retting

Kun lest så langt. Ingen e-post sendt, ingen notater gjort synlige, ingen testsaker opprettet.

## 1. Hva som faktisk skjedde (verifisert i databasen, tider i UTC)

| Tid 11.11 | Hendelse | Resultat |
|---|---|---|
| 09:18:30.06 | Thomas endret status **Ny → Venter kunde** | Loggført med `notified_requester: false`. **Ingen e-post** til Henning |
| 09:18:30.40 | Automatisk statusendring **Venter kunde → Til vurdering** (0,3 s senere) | Begrunnelse: «Kundesvar er mottatt og ingen åpen forespørsel». **Feil**: «kundesvaret» er Postkontorets e-post om ny bestilling fra 28.10 |
| 09:20:16 | Thomas skrev «Hei, sendt forslag til kunde vedr tidspunkt. Slutten av neste uke. :-/» | Lagret som **intern** (ikke synlig for kunden), adressert til **Henning (kunde)**. `email_notification_sent=false` |

Konsekvens:
- Henning har ikke fått e-post, verken om status eller om meldingen.
- Sporingssiden viser riktig nok bare delte meldinger. Thomas' melding er intern, så den vises ikke der.
- Bestillingen står nå som «Til vurdering», ikke «Venter kunde».
- Henning har tidligere fått én e-post: «Bestilling mottatt» 27.10.

Også verifisert: Postkontorets e-post om ny bestilling ble 28.10 registrert som en melding *fra kunden* og varslet 8 interne brukere. Det skjedde før den nye selskapsvise mottakerlisten.

## 2. Rotårsaker (verifisert i kode, `OrderFormDetailPage.tsx`)

1. **Synlighet og mottaker motsier hverandre uten advarsel.** «Intern» er valgt som standard, men mottaker kan likevel settes til kunden. Den interne meldingen lagres da som «til Henning», men blir aldri delt eller sendt.
2. **Feil automatisk statusregel.** Postkontorets e-post om ny bestilling regnes som et kundesvar (avsendertype «customer»). Da flyttes «Venter kunde» straks tilbake til «Til vurdering».
3. **Statusvarsel er valgfritt og av som standard.** «Venter kunde» sender ikke e-post med mindre bryteren slås på manuelt.
4. **Falsk «sendt»-markering.** For delte meldinger settes `email_notification_sent=true` *før* e-posten faktisk sendes, og den rettes ikke hvis sendingen feiler.
5. **Ikke idempotent.** Statusvarsel og meldingsvarsel kalles fra nettleseren uten dedupe-nøkkel per overgang og mottaker.

## 3. Retting (kode, testet isolert, ingen ekte e-post)

**A. Meldingsskriveren**
- Valget Intern / Delt med kunde vises som tydelig farget ramme rundt hele skrivefeltet, og knappen sier «Lagre internt notat» eller «Send til kunde».
- Kunde kan ikke velges som mottaker når meldingen er intern. Velger man kunde, foreslås «Delt med kunde» med en tydelig bekreftelse.
- E-post til bestiller er **på som standard** for delte meldinger og vises med adressen («E-post sendes til hs@…»).

**B. Status «Venter kunde»**
- Krever en melding til kunden (delt) som sier hva kunden må gjøre, og sender e-post til bestiller. Det blir samme flyt som «Be om informasjon», med `requires_reply`.
- Uten melding gis advarsel: «Kunden får ikke vite at de må svare».

**C. Automatisk statusregel**
- Bare ekte kundesvar teller: innkommende e-post eller svar fra sporingssiden fra en kundedeltaker, sendt *etter* siste forespørsel eller statusendring.
- Postkontorets videresendinger og systemmeldinger teller aldri. Automatisk flytting skjer aldri samme sekund som en manuell endring.

**D. Sann sendestatus**
- E-post sendes av serverfunksjonen. `email_notification_sent` settes **bare** når Microsoft har akseptert sendingen. Feil lagres og vises på meldingen som Sendt (akseptert) / Feilet / Venter.
- Dedupe-nøkkel per melding/overgang og mottaker hindrer doble e-poster.
- Hver sending logges i aktivitetsloggen med mottaker og utfall.

**E. Tester** for dette:
- intern melding kan ikke ha kunde som mottaker uten å bli delt
- Postkontor-melding utløser ikke statusflytting
- «Venter kunde» gir én e-post-intensjon
- sendt-flagg settes bare etter suksess
- dedupe hindrer dobbel sending

Ingen eksisterende e-post til Postkontoret eller tilganger endres.

## 4. Det som må gjøres for Henning (krever din godkjenning, gjøres ikke automatisk)

1. Thomas skriver eller bekrefter en **ny delt melding** til Henning, for eksempel om forslaget til tidspunkt neste uke. Den gamle interne meldingen forblir intern, med mindre du uttrykkelig godkjenner å dele akkurat den.
2. Sett status «Venter kunde» på nytt etter rettingen, slik at Henning får én e-post.
3. Kontroller etterpå at meldingen står på sporingssiden og at sendestatus viser «akseptert».

Merk: tidligere vedtatte obligatoriske statusmailer gjelder Mottatt / Planlagt / Utført / Avvist. **«Venter kunde» foreslås lagt til som obligatorisk** når kundens handling trengs. Det er en ny regel som krever din bekreftelse.
