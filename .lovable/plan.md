# Diagnose: hvorfor Rune får Microsoft 403 i Outlook-importen

Kun diagnostikk. Ingen endringer i kode, database, Microsoft eller tilganger ble gjort. Testen var en lesetest av én dag med `$select=id` (ingen innhold, ingen e-post, ingen token vist).

## Dokumentert årsak
Microsoft svarer for Rune, Eirik, Hans Jakob og Lars Erik:

```text
HTTP 403  error.code = ErrorAccessDenied
"Access to OData is disabled: [RAOP] : Blocked by tenant configured AppOnly AccessPolicy settings."
```

`[RAOP]` betyr at en **Exchange Online Application Access Policy** i tenanten begrenser hvilke postkasser Hub-appen får lese med app-only-token. Rune er ikke innenfor den tillatte gruppen/omfanget.

## Kontroll mot brukere som virker
| Bruker | Kalenderlesing (samme kall, samme app-token) |
|---|---|
| Mats Lien Hansen | 200 |
| Thomas Treffen | 200 |
| Rune Ørbeck | 403 RAOP |
| Eirik Oseth | 403 RAOP |
| Hans Jakob Risnes | 403 RAOP |
| Lars Erik Huseby | 403 RAOP |

## Hva det IKKE er
- Ikke manglende Graph-rettighet: app-tokenet har `Calendars.ReadWrite` (også `Mail.Read/ReadWrite/Send`, `Files.ReadWrite.All`, `Sites.Read.All`), og samme kall virker for Mats/Thomas.
- Ikke feil postkasse: Hub bruker `rune.orbeck@mcsservice.no`, samme adresse i person-, montør- og synkdata. Exchange gjenkjenner postkassen og avviser den eksplisitt med policyen (feil adresse ville gitt 404/ErrorInvalidUser).
- Ikke sperret bruker eller manglende kalender/lisens: feilen kommer fra tilgangspolicyen før kalenderen leses. (Appen har ikke `User.Read.All`, så kontostatus/lisens kunne ikke leses direkte, men 403-teksten utelukker disse som årsak.)
- Ikke App RBAC for Exchange: meldingen er RAOP (Application Access Policy).
- Ledigtid-visningen («Opptatt») for Rune virker fordi den bruker innlogget planleggers egen token (delegert), ikke appen. Den beviser derfor ikke app-tilgang.

## Ikke funnet / mangler bevis
- Navnet på gruppen policyen peker på, og når den ble satt, er ikke synlig fra Hub. Det krever Exchange-admin.

## Anbefalt minimal løsning (Thomas eller Simen, Exchange-admin)
1. Bekreft policyen og gruppen, uten å endre noe:
   - `Get-ApplicationAccessPolicy` (finn policyen for Hub-appens klient-ID og hvilken gruppe den gjelder)
   - `Test-ApplicationAccessPolicy -Identity rune.orbeck@mcsservice.no -AppId <Hub-appens klient-ID>` → forventet `Denied`
   - Samme test for `mats.lien.hansen@mcselektrotavler.no` → forventet `Granted`
2. Når gruppen er bekreftet: legg Rune (og eventuelt Eirik, Hans Jakob, Lars Erik etter egen beslutning) i den samme mail-aktiverte sikkerhetsgruppen.
3. Kjør `Test-ApplicationAccessPolicy` på nytt → `Granted`. Endringen kan ta opptil ca. 1 time å slå inn i Exchange.
4. Ingen endring i Hub er nødvendig: neste automatiske kjøring henter da Runes kalender, og synkstatusen går fra «access_denied» til «ok».

Merk: Gruppen gir appen tilgang til både kalender og e-post for personen (samme policy gjelder `Mail.*`). Det er derfor en bevisst beslutning å legge Rune til, ikke bare en kalenderinnstilling.
