# Global admin: bare Thomas og Simen (målbilde)

## Bekreftet tilstand nå (lest uten endringer)
`is_admin()` blir sann hvis personen har gammel rolle `admin`, ELLER gammel rolle `super_admin`, ELLER v1-rettigheten `admin.manage_users`. Rettigheten gjelder i alle selskaper.

| Person | Gammel rolle | v1 admin.manage_users | v2-roller | Kilde til global admin |
|---|---|---|---|---|
| Thomas Treffen | super_admin | ja | Superadmin | MÅL – beholdes |
| Simen Kjeksli | admin | ja | Superadmin, Planlegger/Admin | MÅL – mangler `super_admin`, så /admin/* er sannsynligvis blokkert |
| John Aleksander Mandt | admin | ja | Planlegger/Admin, Prosjektleder | admin + v1 |
| Mats Lien Hansen | admin | ja | Planlegger/Admin, Prosjektleder | admin + v1 |
| Sindre Ulriksen | admin | ja | Planlegger/Admin, Prosjektleder | admin + v1 |
| Lars Erik Huseby | montør | ja | Planlegger/Admin, Prosjektleder | bare v1 (gjennom rolle) |
| Hans Jakob Risnes | – | ja | Planlegger/Admin, Prosjektleder | bare v1 |
| Stian Aarstad | – | ja | Planlegger/Admin, Prosjektleder | bare v1 |
| Rune Ørbeck | – | ja | ingen v2 | bare v1 (rolle/overstyring i v1 – spores i fase 1) |

Hovedårsak: v1-rollen «Planlegger/Admin» inneholder `admin.manage_users`, og `is_admin()` gjør den om til global systemadmin.

## Tre nivåer som skal skilles
1. **Global superadmin**: kun Thomas og Simen. Styrer roller, rettigheter, Microsoft og alle selskaper.
2. **Selskapsadministrator**: styrer drift i eget selskap (kunder, prosjekter, HMS-oppsett). Aldri roller eller rettigheter.
3. **Prosjektleder/planlegger**: planlegging, godkjenning, priser og HMS etter rolle og selskap.

## Fase 1 – Kartlegging uten endringer (nå)
- Klassifisere alle 164 regler som bruker `is_admin()`: (a) styring av roller/rettigheter/medlemskap → superadmin, (b) selskapsdata → selskapsadmin med selskapsfilter, (c) drift → vanlig tilgang i selskapet.
- Gå gjennom alle steder som skriver roller/rettigheter (tabeller, RPC-er, serverfunksjoner, `add-technicians`, PersonDetailPage) og finne veier der noen kan gi seg selv mer tilgang.
- Finne nøyaktig hvor Rune får v1 `admin.manage_users`.
- Kartlegge serverfunksjoner som bruker tjenestenøkkel uten selskapssjekk.
- Rapport: `.lovable/access-audit-report.md`, avsnitt «Global admin».

## Fase 2 – Kode som ikke endrer noen sin tilgang (kan gjøres før godkjenning)
- Nye hjelpefunksjoner: `is_global_superadmin(uid)` (bare `super_admin`) og `is_company_admin(uid, company)` (selskapsbevisst, uten `admin.manage_users`-snarveien).
- `is_admin()` beholdes uendret inntil aktivering.
- Skuggeberegning: en kontrollside/spørring som viser hva hver person ville mistet og beholdt per selskap med de nye reglene.
- Isolerte tester: ikke-superadmin kan ikke skrive roller/rettigheter/medlemskap, heller ikke via manipulerte API-kall; selskapsadmin når ikke andre selskaper; Thomas/Simen beholder alt; ressursplan, godkjenning, Outlook/e-post, HMS og prosjektarbeid fungerer for prosjektleder/montør.

## Fase 3 – Diff til godkjenning (ingen endring før du sier ja)
Per person og selskap: konkrete bortfall og hva som beholdes. Venter på godkjenning av:
- A. Gi Simen `super_admin` (ny global tilgang, krever eget ja).
- B. Fjerne `admin.manage_users` fra v1-rollen «Planlegger/Admin» og fra Rune sin kilde.
- C. Bytte gammel rolle `admin` mot selskapsadmin i riktige selskaper for John, Mats, Sindre.
- D. Bytte regler for roller/rettigheter/medlemskap til `is_global_superadmin`, og selskapsdata til `is_company_admin`.

## Fase 4 – Aktivering etter godkjenning
Rekkefølge mot lockout: A først (verifisere at Simen og Thomas fungerer), deretter D, så B og C. Hvert steg med revisjonslogg, etterkontroll og mulighet for å rulle tilbake ved å legge rettigheten inn igjen.

## Sikkerhetsregler
Ingen endring av produksjonsroller, medlemskap eller regler før egen diff er godkjent. Ingen publisering, ingen e-post eller Microsoft-endringer. Bare tillegg i databasen; ingen sletting.

## Tekniske detaljer
- `is_admin()` = `has_role(admin) OR has_role(super_admin) OR check_permission(uid,'admin.manage_users')`.
- `is_super_admin(uid)` = bare `has_role(super_admin)`; v2-rollen «Superadmin» styrer den ikke. Derfor er Simen ikke superadmin i dag selv om v2 sier det.
- Kontroll i frontend (`/admin/*`) og server må bruke samme kilde etter endringen.
