# Bestillinger → Administrasjon og varsling (plan v5)

Bygger videre på varslingsrevisjonen (v4). Beslutning fra eier er låst: egen, enkel side der autorisert administrator styrer hvem som administrerer innkommende bestillinger og hvem som får Hub-varsel.

## Verifisert nå (read-only)
- Rune Ørbeck: én person, én aktiv og verifisert innlogging, aktivt medlem kun i MCS Service AS. Ingen andre «Rune»-kontoer. Han er riktig konto for tildeling.
- Thomas Treffen: aktiv, verifisert, medlem i MCS Service AS, superadmin.
- Eksisterende bestillingsadministrasjon ligger under `/admin/order-forms`; bestillingslisten under `/orders`.

## Plassering
- Ny fane «Ansvar og varsling» på bestillingssiden (`/orders`, synlig kun for autoriserte), pluss lenke fra eksisterende bestillingsadministrasjon. Ingen modal; egen side med inline-handlinger.

## Slik ser siden ut
```text
Bestillinger · Ansvar og varsling          [Selskap: MCS Service AS v]

Person               Admin-tilgang   Varsle ved ny bestilling
Thomas Treffen       Alltid (superadmin)      [ på/av ]
Rune Ørbeck          [x]                       [x]
...
[ Søk ansatt for å legge til ...        ] [Legg til]

! Varsel: Ingen mottar varsel om nye bestillinger i dette selskapet.
  Nye bestillinger går da til superadmin (reserve).

Historikk: hvem endret hva, når (siste 50)
```
- To tydelig adskilte valg: Admin-tilgang og Varsle ved ny bestilling.
- Legger man til en person, er begge PÅ som standard; varsling kan skrus av.
- Varsling krever admin-tilgang (kan ikke varsle noen som ikke kan åpne bestillingen). Fjernes admin, fjernes varsling.
- Søk viser bare aktive ansatte med verifisert innlogging og aktivt medlemskap i valgt selskap; navn + selskap + e-post vises så riktig konto velges.
- Thomas (og annen global superadmin) vises alltid med «Alltid»-tilgang og egen av/på for varsling. Standard for superadmin: varsling AV, kun reserve når listen er tom.

## Regler
- Bare global superadmin kan endre listen (samme regel som tilgangsstyring ellers; ingen selvtildeling).
- Ny bestilling varsler kun personer med Varsle PÅ i bestillingens selskap — aldri automatisk alle administratorer.
- Tildeling/overtakelse: varsler går til ansvarlig; øvrige markeres håndtert.
- Tom mottakerliste: varsel til global superadmin + synlig advarsel på siden og i avvikskontroll. Ingen bestilling uten mottaker.
- E-post til Postkontoret og bestillers e-post (Mottatt/Planlagt/Utført/Avvist) er uendret og separate.

## Under panseret (eksisterende tilgangssystem)
- Admin-tilgang = rettigheten `orders.intake` som selskapsbundet overstyring i `user_permission_overrides_v2` (scope_company_id), lagret via eksisterende `save_permission_override_changes`. Ingen ny rolletype.
- Varslingsvalg = egen liten tabell `order_notification_subscriptions` (person/login, selskap, aktiv, endret av/når) — en preferanse, ikke en rettighet.
- Server: én funksjon `order_intake_recipients(company_id)` brukes av ny-bestilling-triggeren i stedet for `_notif_admin_user_ids()`; returnerer abonnenter som fortsatt har gyldig `orders.intake` + aktivt medlemskap, ellers superadmin som reserve.
- RPC-er for siden (`list_/set_order_intake_member`) sjekker `is_global_superadmin` på serveren; RLS på ny tabell tilsvarende.
- Historikk: hver endring skrives til eksisterende revisjonslogg med før/etter.

## Trinn
1. Database: `orders.intake` i rettighetskatalogen, abonnementstabell, mottakerfunksjon, RPC-er, revisjonslogging. Ingen tildelinger.
2. Siden «Ansvar og varsling» med søk, liste, to brytere, tom-liste-advarsel og historikk.
3. Bytte ny-bestilling-triggeren til mottakerfunksjonen — aktiveres først etter at listen er fylt (unngå at alle mister varsel samtidig).
4. Tester: superadmin alltid tilgang; ikke-superadmin kan ikke endre; varsling krever admin-tilgang; feil selskap gir ingen varsel; tom liste gir reserve; ingen e-post utløses (mock).
5. Før/etter-diff til godkjenning: legge til Rune Ørbeck (MCS Service: admin + varsling), Thomas varsling-valg, og hvem som slutter å få varsel (i dag 8 personer via adminroller). Først etter godkjenning gjøres tildeling og bytte.

## Ikke i denne runden
Ingen kodeendringer, tildelinger, testbestillinger eller ekte varsler før planen er godkjent.
