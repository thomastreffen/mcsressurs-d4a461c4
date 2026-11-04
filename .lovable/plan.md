# Hans Jakob Risnes – feil selskapstilknytning til MCS Service AS

Ingenting er endret ennå. Planen inneholder bekreftede funn, en konsekvensdiff og det som skal utføres etter din godkjenning av akkurat denne diffen.

## Bekreftede funn (lest i produksjon)
1. **Hvorfor han ikke vises i Personer-listen:** Listen filtrerer på ansettelse. Hans Jakob har én ansettelse, i BusBar AS (primær). Selskapsmedlemskapet styrer tilgang, ikke listen, og derfor vises han ikke under MCS Service.
2. **Medlemskapet i MCS Service gir reell tilgang.** Han har et aktivt medlemskap i MCS Service AS med rollen «Ressursplan». Data-reglene i omtrent 88 tabeller gir tilgang til alle som er medlem av selskapet. Det gjelder blant annet kunder, leads, saker, tilbud, kalkyler, bestillinger, materiell, HMS og jobber. Han kan altså lese og delvis endre MCS Service-data, selv om han ikke er ansatt der.
3. **Rollene er globale.** Rollene Prosjektleder og Planlegger/Admin er tildelt uten selskapsgrense. Serverens rettighetssjekk ser bort fra rollens selskap, så adminrettighetene gjelder i praksis også i MCS Service. Dette er det mest alvorlige funnet.
4. **Ingen samhandling i MCS Service å bevare:**
   - 0 prosjektmedlemskap i MCS Service-prosjekter
   - 0 jobbtildelinger i MCS Service
   - 0 deltakelser i Planlegging

   Å fjerne medlemskapet bryter derfor ingen pågående samarbeid.
5. **Overstyringene for MCS Service** (jobs.view, resourceplan.view_external_titles): Siden den forrige rettingen virker de bare i MCS Service. De dekkes uansett av rollene hans.

## Konsekvensdiff (forslag)
| Endring | Før | Etter |
|---|---|---|
| A. Deaktiver medlemskapet i MCS Service (settes inaktivt, slettes ikke) | Tilgang til MCS Service-data i ~88 tabeller | Ingen tilgang via medlemskap. BusBar uendret |
| B. Fjern de to overstyringene som gjelder MCS Service | jobs.view og resourceplan.view_external_titles i MCS Service | Fjernet. Ingen effekt i BusBar |
| C. Begrens rollene Prosjektleder og Planlegger/Admin til BusBar AS | Adminrettigheter i alle selskaper | Bare i BusBar *(virker først når serversjekken tar hensyn til rollens selskap, se Teknisk)* |
| Beholdes | regulation.review og task_thread.email_external i BusBar, ansettelse, innlogging | Uendret |

**Valgfritt i stedet for A:** Hvis han skal se Ressursplanen til MCS Service, gis det som eksplisitt lesetilgang til den ene modulen. Det er det godkjente mønsteret for tilgang på tvers av selskaper. Han får da ikke innsyn i kunder, salg, HMS og lignende. Dette gjøres bare hvis du ber om det.

**Prosjekter på tvers:** Fremtidig samarbeid på enkeltprosjekter i MCS Service skjer via prosjektinvitasjon eller ekstern deltakelse i Planlegging. Det krever ingen intern selskapsrolle.

## Utførelse etter godkjenning
1. Les tilstanden på nytt rett før endringen. Avviker den fra diffen, stopper jeg og viser en ny diff.
2. Utfør A og B (og C hvis du godkjenner den) bare for Hans Jakob, med en revisjonslogg per endring og deg som godkjenner.
3. Etterkontroll: les tilbake medlemskap, roller og overstyringer. Bekreft at BusBar-tilgangen er uendret og at ingen andre er berørt.
4. Legg funnet og resultatet inn i tilgangsrapporten.

## Teknisk
- Personer-listen filtrerer på `employment_profiles.company_id`. Datatilgangen bygger på `user_memberships` (`is_company_member` og lignende funksjoner).
- Endring A: `user_memberships.is_active = false` for raden i MCS Service. Endring B: sletting av to rader i `user_permission_overrides_v2`, med verdiene lagret i `access_audit_log`. Endring C: setter `user_roles_v2.scope_company_id` til BusBar.
- Endring C får effekt først når `check_permission_v2` og `usePermissions` tar hensyn til rollens selskap. Det er en separat, additiv kodeendring med en egen diff for alle brukere, fordi ingen roller har selskapsgrense i dag.
- Ny integritetssjekk i revisjonen: aktive medlemskap uten tilhørende ansettelse i samme selskap. Den kjøres for alle, og resultatet rapporteres uten at noe endres.
