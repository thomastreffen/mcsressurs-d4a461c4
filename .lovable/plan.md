# Steg 1: Lesende avstemming av 19 kunderader

Kun lesing. Ingen data, kode eller filer er endret. Kilder: Hub-databasen og Brønnøysund Enhetsregisteret (offentlig, oppslag 11.11.2026 09:17 UTC).
**Tripletex-originaleksporten er ikke tilgjengelig** (ingen fil er lastet opp, og Tripletex er ikke lest). Alt som bare Tripletex kan bekrefte er derfor merket **ukjent**.

Begreper: **Kundenr.** = Tripletex sitt synlige kundenummer (f.eks. 10086). **TX-ID** = Tripletex sin stabile interne ID. **Org.nr.** = Brønnøysund. Disse er tre forskjellige verdier.

## A. De 12 fra 11.11 (navn = kundenummer)

Forventet navn er hentet fra Brønnøysund **via org.nr. i raden**, ikke gjettet ut fra kundenummeret. At kundenr. hører til denne virksomheten i Tripletex er **ukjent** til eksporten er kontrollert.

| Hub-navn (antatt kundenr.) | Org.nr. i Hub | Navn i Brønnøysund | Sted | Sikkerhet | Konflikt | Anbefalt handling |
|---|---|---|---|---|---|---|
| 10086 | 984438370 | ARKEL OSLO AS | Oslo | Middels | – | Sett navn etter kontroll mot eksport |
| 10087 | 917339236 | Ørnulf Wiig Installasjon A/S | – | Lav | **Slettet i Enhetsregisteret 06.05.2026** | Avklar om kunden skal beholdes som historisk/inaktiv. Ikke aktiv CRM |
| 10088 | 890007082 | HORTEN ELEKTRISKE AS | Ringebu | Middels | – | Sett navn etter kontroll |
| 10089 | 999009123 | SOLENERGI FUSEN AS | Oslo | Middels | – | Sett navn etter kontroll |
| 10090 | 916110529 | DATEK INSTALLASJON AS | Oslo | Middels | – | Sett navn etter kontroll |
| 10091 | 943267596 | MOSS ELEKTRO AS | Moss | Middels | – | Sett navn etter kontroll |
| 10092 | 971185589 | OSLO KOMMUNE VANN- OG AVLØPSETATEN | Oslo | Middels | Offentlig etat (faktura via EHF) | Sett navn etter kontroll |
| 10093 | 976494881 | ROMERIKE ELEKTRO AS | Kløfta | Middels | – | Sett navn etter kontroll |
| 10094 | 968545337 | LEFDAL INSTALLASJON AS | Lysaker | Middels | – | Sett navn etter kontroll |
| 10095 | 987592567 | OSLO HAVN KF | Oslo | Middels | – | Sett navn etter kontroll |
| 10096 | 912185621 | DITMAR ENGE ELEKTRO AS | Sandefjord | Middels | – | Sett navn etter kontroll |
| 10097 | 990012288 | TB MASKIN AS | Drammen | Middels | – | Sett navn etter kontroll |

For alle 12: TX-ID er **ukjent** (finnes ikke i Hub). E-post, telefon og adresse er tomme. Kundenr. lagres i eget felt, ikke som navn eller org.nr.
«Middels» betyr at org.nr. finnes i Brønnøysund, men at koblingen org.nr. ↔ kundenr. ikke er bekreftet. Den blir «Høy» når eksporten viser samme org.nr. på samme rad.

## B. De 5 fra juni (org.nr. = kundenummer)

Brønnøysund-treffene er søk på **navnet** i Hub. De er kandidater, ikke bekreftelser. Flere treff betyr at riktig enhet må velges av et menneske.

| Hub-navn | Org.nr. i Hub | `external_tripletex_id` | Kandidat(er) i Brønnøysund | Sikkerhet | Konflikt | Anbefalt handling |
|---|---|---|---|---|---|---|
| Granitor Electro AS | 10008 | 10008 | 897688182 GRANITOR ELECTRO AS (Drammen) | Middels | Svenske AB-enheter med samme navn er utelukket | Bekreft mot eksport/faktura, sett org.nr. |
| INSTALLATØREN OSLO AS | 10029 | 10029 | 985885443 INSTALLATØREN OSLO AS (Oppegård) | Middels | – | Bekreft, sett org.nr. |
| El.entreprenør Thor R S Andersen AS | 10083 | 10083 | 976482174 EL.ENTREPRENØR THOR R S ANDERSEN AS (Mjøndalen) | Middels | – | Bekreft, sett org.nr. |
| Eltel Networks AS | 10084 | 10084 | 912955915 ELTEL NETWORKS AS (Oslo) **eller** 998701783 ELTEL NETWORKS (Oslo, trolig avdeling/underenhet) | **Lav** | Flere enheter. Eltel har også lokalkontorer | Velg juridisk enhet manuelt. Lokale kontorer blir kundeenheter, ikke kunder |
| Green Mountain AS | 10085 | 10085 | 994989391 GREEN MOUNTAIN AS (Rennesøy) | Lav–middels | Konsern med flere AS (Elverum, Hønefoss, Holdings) | Avklar hvilket selskap som faktureres |

For alle 5: verdien i `external_tripletex_id` er trolig **kundenummer**, ikke stabil TX-ID. Det er **ukjent** til Tripletex er lest. Nummeret flyttes til kundenr.-felt, og org.nr.-feltet tømmes inntil riktig org.nr. er bekreftet.

## C. Duplikatpar

| Org.nr. | Kort | Hub-navn | Kontakter | Brønnøysund | Anbefalt handling |
|---|---|---|---|---|---|
| 913452100 | 4331ee94 | EATON ELECTRIC AS | 0 | EATON ELECTRIC AS (Oslo) – bekreftet | **Behold** (likt registernavnet) |
| 913452100 | a76519b6 | Eaton Electric AS | 0 | samme | Myk-slett etter kontroll av koblinger |
| 916282524 | acf4d8e5 | Mcs Elektrotavler AS | **1** | MCS ELEKTROTAVLER AS (Jaren) – bekreftet | **Behold** (har kontakt) og sett registernavn |
| 916282524 | 8b0da2de | MCS ELEKTROTAVLER AS | 0 | samme | Myk-slett etter kontroll |

Det finnes ingen databasekoblinger (fremmednøkler) til `customers`. Jobber, tilbud og ordre kan likevel referere til kunden med navn eller ID i tekstfelt; det er **ikke kartlagt** og må sjekkes før sammenslåing.
MCS Elektrotavler er et søsterselskap i MCS-konsernet. Avklar om det skal være kunde i CRM.

## D. Reparere kundeimporten før ny import

1. **Eksakt mapping:** fast forhåndsinnstilling for Tripletex-eksport (Kundenummer → kundenr., Navn → navn, Organisasjonsnummer → org.nr.). Kolonnene kjennes igjen på eksakt navn, ikke «begynner med».
2. **Ett felt per kolonne:** dobbeltvalg stopper importen.
3. **Validering:** navn kan ikke være bare tall. Org.nr. må ha 9 siffer og gyldig mod-11-kontrollsiffer. Kundenr. kan ikke ligge i org.nr.-feltet.
4. **Forhåndsvisning per rad:** Ny / Finnes (vis hva som endres) / Konflikt / Ugyldig. Ingenting lagres uten bekreftelse.
5. **Dedupe på serveren:** per selskap på normalisert org.nr. og kundenr. Tomme felt overskriver aldri eksisterende verdier. Unik regel legges på først etter at duplikatparene er ryddet.
6. **Importlogg** som gjør en import sporbar og mulig å angre.
7. **Tester:** «Kundenummer» blir aldri navn, mod-11-sjekk, dobbeltvalg, og at dedupe hindrer duplikater.

## E. Anbefalt godkjenningsrekkefølge

1. **Last opp Tripletex-originaleksporten** (eller godkjenn én lesende Tripletex-lesing). Da kan «Middels» bli «Høy» og TX-ID fylles ut.
2. **Bygg reparert import** (punkt D) med tester. Ingen ny import før dette er på plass.
3. **Rett de 12 navnene** i én liten pakke, etter kontroll mot eksporten. Ørnulf Wiig behandles separat.
4. **Rett de 5 fra juni**, Eltel først, med manuelt valg av juridisk enhet.
5. **Slå sammen duplikatparene** etter kontroll av tekstkoblinger.
6. **Tripletex-kobling** via stabil ID, deretter lokalkontorer for pilotkundene.

Hvert steg logges med gammel og ny verdi og hvem som godkjente.
