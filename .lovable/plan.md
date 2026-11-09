# Simen super_admin – kompatibilitetsvalg (kun etter egen godkjenning)

## Funn (read-only, produksjon 9.11)
- `user_roles` har to begrensninger: `user_roles_user_id_unique` UNIQUE(user_id) og `user_roles_user_id_role_key` UNIQUE(user_id, role). Ingen triggere på tabellen.
- Ingen RLS-regel eller databasefunksjon sjekker `'admin'` uten også å godta `super_admin` (0 treff). `is_admin`, `is_global_superadmin`, `has_company_access`, `_notif_admin_user_ids` godtar alle `super_admin`. Ingen skjerm skiller admin fra super_admin.
- Kode som forutsetter én rad per bruker (ville feile for Simen med to rader – `.single()/.maybeSingle()` gir feil, og koden tolker feil som «ingen rolle»):
  - Nettleser: `useAuth.tsx` (rolle beholdes som før = stille feil), `usePreviewMode.tsx` (faller til «montør»), `PreviewModeDialog.tsx` (Map – siste rad vinner, tilfeldig).
  - Serverfunksjoner med `.single()/.maybeSingle()`: manage-role, list-users, create-approval, fetch-employees, delete-person, create-person, add-technicians, portal-notify, customer-portal-invite, auth-callback, fag-image-analyze → Simen ville bli avvist (403) i alle.
  - `manage-role` bruker `upsert … onConflict: "user_id"` → feiler for alle brukere hvis UNIQUE(user_id) fjernes.
  - Lister uten dedup (handle-approval, outlook-sync, offer-public-view, ms-calendar): Simen ville få doble varsler.
  - Tåler flere rader: inbox-scan, contract-alerts-cron (`.in().limit(1)`), customer-portal-invite/add-technicians upsert (`user_id,role`).

## Konklusjon
Å fjerne UNIQUE(user_id) er ikke en «minste» endring: krever retting av ~16 kodesteder og utrulling før skjemaendringen, ellers låses Simen ute av adminfunksjoner.

## Anbefalt: Alternativ B – samme effekt, ingen skjemaendring
Endre Simens eksisterende rad fra `admin` til `super_admin` (én UPDATE, én rad, i transaksjon med revisjonslogg).
- Effekt: alt `admin` gir i dag (RLS, funksjoner, edge, UI) gis også av `super_admin` – verifisert over. I tillegg får han /admin/* og superadmin-funksjoner, som er det godkjente målet.
- Ingen andre rader, roller, medlemskap eller overstyringer berøres. Thomas berøres ikke.
- Avvik fra ordlyden «bevare admin»: raden får ny verdi; den eksplisitte `admin`-verdien forsvinner, men ingen tilgang forsvinner. Krever derfor din eksplisitte godkjenning.
- Rollback: `UPDATE user_roles SET role='admin' WHERE id=<Simens rad-id> AND user_id='9ee227c5-…' AND role='super_admin'` – treffer aldri Thomas.

## Alternativ A (ikke anbefalt nå)
1. Rett de 16 kodestedene til å lese alle rader og velge høyeste rolle (super_admin > admin > øvrige), dedup varselmottakere, endre manage-role til slett+sett inn i én operasjon.
2. Deploy, test.
3. Deretter migrering: `DROP CONSTRAINT user_roles_user_id_unique` (UNIQUE(user_id, role) beholdes). Rollback: slett ekstra rader, legg constraint tilbake.

## Steg etter godkjenning av B
1. Snapshot før: alle `user_roles`-rader, Simens person/konto/medlemskap.
2. Isolert test (PGlite) før produksjon: B-oppdatering + rollback; `is_admin`, `is_global_superadmin`, `has_role` gir forventet verdi før/etter; Thomas uendret; UPDATE nekter andre rader.
3. Én transaksjon i produksjon: UPDATE Simens rad + revisjonslogg med Thomas som godkjenner.
4. Etterkontroll read-back: Thomas `super_admin`, Simen `super_admin`, totalt antall rader uendret, øvrige rader identiske med snapshot; ellers rollback.
5. Rapport på norsk i `.lovable/security-2026-11-09/approval-A-result.md`.

## Utenfor
Ingen RLS-gates, ingen endring hos andre administratorer, ingen Microsoft/e-post. Innlogget test som Simen er ikke mulig herfra; han bør selv åpne /admin etterpå.
