# Godkjenning A – 09.11.2026 kl. 07:17 UTC

## Resultat: blokkert, ingen produksjonsendring
Thomas Treffen godkjente uttrykkelig én ekstra `user_roles(super_admin)` til Simen Kjeksli, med eksisterende `admin` og alle andre tilganger bevart.

Identiteten ble kontrollert på nytt i produksjon: auth user `9ee227c5-7cc0-409a-93aa-1ef0696d27ca`, aktiv/verifisert user_account `507dc92c-72af-4d86-90c2-8ce5ef3c70ee`, aktiv person `29884db7-d620-487a-a6e0-169b7bdfdacd`, navn Simen Kjeksli, aktiv ansettelse. Thomas sin aktive konto og opprinnelige super_admin-rad `cad9ef7a-ffc9-4ad1-8919-b238f94a691a` ble bekreftet.

Én atomisk INSERT-handling med identitetsvakt, idempotens via UNIQUE(user_id,role), audit_log og før/etter-snapshot ble forsøkt. Produksjonen avviste hele handlingen med SQLSTATE 23505 på `user_roles_user_id_unique`: UNIQUE(user_id). Denne ekstra begrensningen tillater kun én legacy-rolle per bruker, selv om UNIQUE(user_id,role) også finnes.

Ingen grant eller audit-grantpost ble opprettet. Det er derfor ikke skrevet noen uriktig vellykket produksjonsaudit. Forsøket og eksplisitt godkjenning dokumenteres her. Ingen schemaendring, RLS-gates, Microsoft-kall eller andre personrettigheter ble endret.

## Før og faktisk etterkontroll
Alle 12 user_roles-rader identiske før og etter. Simens admin-rad `7bf27509-ed16-4cdc-b2a6-553bbef21b99` uendret, ingen super_admin. Thomas sin super_admin-rad uendret.

| Kontroll | Før | Etter |
|---|---|---|
| is_super_admin(Thomas) | true | true |
| is_super_admin(Simen) | false | false |
| audit-logg for A-grant til Simen | 0 | 0 |
| user_memberships hash | 097ca20b1f6c9fd64bc7d820ce621025 | identisk |
| user_roles_v2 hash | d9c37dadc3430ee4a84196224d4291b5 | identisk |
| user_role_assignments hash | 5b988a3cb5c36a9dc1c0d234a9a59e51 | identisk |
| user_permission_overrides_v2 hash | 0e7ff8cad4f38bd331bb565db1803099 | identisk |
| user_permission_overrides hash | 332e4352e65fec988ce3eb1ff9db8aab | identisk |
| user_accounts hash | 8ddf2aeba3875fd45d14e5c2dfc00d7c | identisk |
| company_admin_assignments hash | 09dd29b951d6bc66b84c5bd7ba6a9754 | identisk |
| company_module_access hash | 1d628dc8b514f4b515401c42df0599fd | identisk |

`is_global_superadmin` sin produksjonsdefinisjon er kontrollert: den bruker samme `has_role(uid,'super_admin')` som `is_super_admin`. Direkte kjøring av is_global_superadmin er ikke tillatt for lesetilgangsverktøyet; ingen EXECUTE-grant lagt til for å omgå dette. Ingen innlogging/UI testet.

## Avgrenset teknisk beslutning kreves
En ekstra legacy-rolle kan ikke legges til mens UNIQUE(user_id) står. Ikke erstatt admin med super_admin: det ville bryte godkjenningen om å bevare admin. Ikke bruk v2 eller parallelle roller som alternativ.

Før eventuell schemaendring må alle lesere/skrivere som forventer én legacy-rolle undersøkes, og en kontrollert kompatibel overgang utformes. Kun fjerning av UNIQUE(user_id) uten denne kontrollen kan bryte `.single()`-baserte lesere eller `ON CONFLICT(user_id)`-skrivere. Ingen slik endring er godkjent eller utført i A.

## Rollback
Ingen rollback nødvendig nå; hele forsøket rullet automatisk tilbake. Ved senere vellykket grant skal den faktiske nye grant-ID lagres i audit_log. Rollback, kun etter godkjenning, fjerner akkurat den nye raden med både grant-ID, Simens user_id og role=super_admin samt kontrollerbar audit-proveniens; behold opprinnelig admin, alle andre roller, Thomas og audit-historikken. Ikke kjør generell sletting av Simens roller.
## Oppfølging 2026-11-09 07:21 – kompatibilitetsanalyse (ingen produksjonsendring)
- Begrensninger: UNIQUE(user_id) + UNIQUE(user_id, role); ingen triggere.
- 0 RLS-regler/DB-funksjoner krever 'admin' uten å godta super_admin.
- ~16 kodesteder forutsetter én rad (.single/.maybeSingle, manage-role upsert onConflict user_id, varsellister uten dedup) → å fjerne UNIQUE(user_id) ville låse Simen ute av adminfunksjoner.
- Valgt løsning (B): UPDATE én rad 7bf27509-ed16-4cdc-b2a6-553bbef21b99 admin→super_admin. Rollback: samme rad super_admin→admin.
- Snapshot før: 12 rader (1 super_admin Thomas, 4 admin, 7 montør).
- Isolert test src/test/simen-superadmin-swap.test.ts: 4/4 OK (blokkering gjenskapt, nøyaktig én rad endret, idempotent, rollback rører ikke Thomas).
- Status: VENTER på eksplisitt godkjenning av produksjons-UPDATE.

## Utført 2026-11-09 (eksplisitt godkjent av Thomas Treffen)
- Rad 7bf27509-… (Simen) endret admin→super_admin; revisjonspost `legacy_role_changed` i audit_log.
- Etterkontroll: 12 rader (uendret antall); super_admin = Thomas + Simen; 3 admin og 7 montør identiske med snapshot.
- Rollback: UPDATE user_roles SET role='admin' WHERE id='7bf27509-ed16-4cdc-b2a6-553bbef21b99' AND role='super_admin'.
- Ikke testet: innlogget visning som Simen.
