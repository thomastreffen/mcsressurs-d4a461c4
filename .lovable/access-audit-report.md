# Tilstandsrapport – tilgangsstyring MCS Hub (2026-11-04, kun lesing)

Ingen produksjonsdata eller kode er endret i denne fasen.

## Funn rangert

### HØY-1 Serveren ignorerer selskapsavgrensning på individuelle overstyringer
`check_permission_v2` leser `user_permission_overrides_v2` uten å se på `scope_company_id`. Frontend (`usePermissions.ts`) bruker bare selskapsbundne overstyringer i riktig selskap. 8 selskapsbundne «tillat» finnes (bl.a. hms.manage, hms.view, jobs.view, jobs.view_pricing, task_thread.email_external, regulation.review). På serveren gjelder disse i alle selskaper -> mulig lekkasje mellom selskaper, og meny ≠ server.

### HØY-2 Unik nøkkel uten scope
`UNIQUE (user_account_id, permission_key)` gjør at én person ikke kan ha ulik overstyring per selskap. Dette er rotårsaken til at duplikatfeilen i det hele tatt kunne oppstå. Lagringsfeilen er rettet i koden (bare endrede nøkler), men modellen kan fortsatt ikke uttrykke «tillat i Service, ikke i BusBar».

### HØY-3 To parallelle overstyringslagre
v1 `user_permission_overrides` (144 rader) og v2 (148) brukes samtidig:
- `usePermissions.ts` slår sammen begge (v2 vinner per nøkkel)
- `UsersAccessTab.tsx` sletter/skriver fortsatt v1
- `usePreviewMode.tsx` og `check_permission` (v1) leser v1
I dag er det 0 avvik mellom v1 og v2 for aktive brukere, men to skrivesteder kan glippe når som helst.

### MIDDELS-1 Duplisert rolle «Ressursplan»
To roller: `Ressursplan` (6 rettigheter, inkl. security.view) og `Ressursplan ` med etterstilt mellomrom (5, uten security.view). Hvilken en person har gir ulike rettigheter uten at det synes i UI.

### MIDDELS-2 Rolle-scope ignoreres
`user_roles_v2.scope_company_id` brukes ikke av `check_permission_v2` (0 rader har scope i dag, så ingen faktisk effekt nå).

### MIDDELS-3 Identitetsavvik
- 2 aktive innlogginger uten rolle
- 1 inaktiv konto med rolle fortsatt
- 1 aktiv konto uten aktivt medlemskap
Ingen innlogging har mer enn én aktiv personkobling.

### LAV-1 Montører med samme rolle har ulike individuelle avslag
Montører med samme rolle har ulike individuelle avslag. Dette er bevisste overstyringer, men det mangler forklaring og historikk i UI.

## Marcus vs Emil (kilde per avvik)

| | Marcus | Emil |
|---|---|---|
| Roller | Montør | Montør + Ressursplan |
| resourceplan.view | **nei** (ingen kilde) | ja (rolle Ressursplan) |
| leads.view | nekt (individuell) | nekt (individuell) |
| regulation.review | tillat (individuell, selskapsbundet; gjelder globalt på server, jf. HØY-1) | – |

Ressursplanforskjellen kommer fra rollen, ikke fra overstyring. Riktig handling for admin etter publisering er en av disse:
- gi Marcus individuell «Se ressursplan»
- gi Marcus rollen Ressursplan

## Forslag til sikker retting (krever godkjenning før produksjon)
1. `check_permission_v2`: bruk selskapsbundne overstyringer bare i aktuelt selskap. **Effekt:** de 8 selskapsbundne tillatelsene slutter å virke i andre selskaper. En diff per person vises før endring.
2. Ny unik nøkkel `(user_account_id, permission_key, coalesce(scope_company_id))` (additiv, gammel fjernes først etter godkjenning).
3. Stopp skriving til v1 (`UsersAccessTab`), les kun v2. Merk v1 DEPRECATED.
4. Slå sammen «Ressursplan »-rollen inn i «Ressursplan». Avklar først om security.view skal være med.
5. Felles serverfunksjon «effektiv rettighet med kilde», tilgangsoversikt, endringslogg og integritetsdashbord (plan fase 3–4).

## Rettighetsmatrise v1 (til godkjenning)
Se planen. Den brukes som fasit i tester først etter godkjenning.
