# Sindre Ulriksen – minste nødvendige tilgang på tvers av selskaper

Ingenting er endret. Dette er statusrapporten (lest i produksjon) og en foreslått diff. Sindres tilganger endres ikke før du godkjenner akkurat denne diffen.

## Status i dag
| Område | Funn |
|---|---|
| Hjemselskap (innlogging) | MCS Elektrotavler AS |
| Ansettelser | MCS Elektrotavler AS og MCS Service AS. **Ingen er merket som primær** |
| Aktive medlemskap | Elektrotavler (**2 like rader**), MCS Service, BusBar. Ingen har selskapsrolle |
| Roller | Prosjektleder + Planlegger/Admin, begge **globale** (både i nytt og gammelt rollesystem) |
| Gammel systemrolle | `admin`. Brukes i 26 dataregler, uten selskapsgrense |
| Individuelle overstyringer | Ingen |
| Modultilgang på tvers | Ingen |
| Faktisk deltakelse | 0 jobbtildelinger, 0 prosjektmedlemskap og 0 Planlegging-deltakelser, i alle selskaper. Ingen jobber opprettet av ham |

**Hva det betyr i praksis:** Serveren ser bort fra hvilket selskap en rolle gjelder for, og BusBar-medlemskapet gir tilgang til selskapets data. Sindre har derfor i dag full administrasjon også i BusBar AS:
- administrere brukere, roller, selskaper og innstillinger
- styre og se sikkerhet (security.manage og security.view)
- se priser, tilbud og kalkyler

Dette er det samme mønsteret vi fant hos Hans Jakob, men med enda bredere rettigheter.

## Foreslått diff (minste nødvendige tilgang)
Antakelse: Sindre er administrator i MCS Elektrotavler, prosjektleder i MCS Service og bare deltaker i BusBar. Bekreft eller rett før utførelse.

| # | Endring | Før | Etter |
|---|---|---|---|
| 1 | Planlegger/Admin begrenses til Elektrotavler | Admin i alle selskaper | Admin bare i Elektrotavler |
| 2 | Prosjektleder begrenses til Elektrotavler + MCS Service | Prosjektleder overalt | Planlegger i disse to |
| 3 | BusBar-medlemskapet **beholdes**, uten rolle | Admin, sikkerhet og økonomi via globale roller | Ingen admin, sikkerhet, brukerstyring eller økonomi i BusBar. Han kan fortsatt delta når han blir tildelt jobber eller invitert til prosjekter |
| 4 | Den doble Elektrotavler-raden settes inaktiv | 2 aktive | 1 aktiv. Ingen endring i tilgang |
| 5 | Ansettelsen i Elektrotavler markeres som primær | Ingen primær | Elektrotavler primær |
| 6 | Den gamle `admin`-rollen | Global | **Avklares egen gang.** Den brukes av mange, så den vurderes samlet for alle med en egen diff |

Bevares uendret: alle medlemskap i MCS Service og Elektrotavler, innloggingen og montørkoblingen.

## Forutsetning: serveren må ta hensyn til rollens selskap
Punkt 1–3 har bare effekt når rettighetssjekkene respekterer rollens selskap:
- i serveren (`check_permission_v2` og den nye selskapsbundne varianten)
- i appens rettighetsberegning

I dag har ingen roller selskapsgrense. Selve kodeendringen endrer derfor ingenting for noen før vi faktisk setter en grense. Dette verifiseres med tester og en før/etter-kontroll for alle brukere.

## Utførelse etter godkjenning
1. Kodeendring: roller med selskapsgrense gjelder bare i sitt selskap, både på serveren og i appen. Tester skal vise at admin i Elektrotavler ikke får admin i BusBar, og at globale roller fungerer som før.
2. Kontroll: ingen brukeres effektive rettigheter endres av selve kodeendringen.
3. Ny lesing av Sindres tilstand. Avviker den fra diffen, stopper jeg og viser en ny diff.
4. Punkt 1, 2, 4 og 5 utføres bare for Sindre, med revisjonslogg. Punkt 3 skjer automatisk som følge av 1–2.
5. Etterkontroll: les tilbake rettighetene hans per selskap (Elektrotavler: admin, Service: planlegger, BusBar: ingen admin), og bekreft at ingen andre er berørt.

## Samordning
- Revisjonen av den gamle og nye rettighetslagringen og den doble Ressursplan-rollen fortsetter separat.
- Hans Jakobs roller kan begrenses til BusBar med samme mekanisme, men bare etter en egen diff.

## Teknisk
- `user_roles_v2.scope_company_id` settes for Sindre. Rollen må også finnes på samme måte i den gamle tabellen `user_role_assignments`, som appen fortsatt leser. Derfor lar vi `usePermissions` bruke v2 med selskapsgrense når den finnes, og ignorere v1-duplikater av samme rolle.
- Den doble medlemskapsraden settes til `is_active=false`. Den slettes ikke.
- `employment_profiles.is_primary` settes for Elektrotavler-raden.
