# Multi-company: skille ansettelse og tilgang, hard brannvegg mellom selskaper

## Hva jeg fant i dag
- 127 av 247 tabeller har selskapstilknytning. Tilgangen bygger i hovedsak på «medlem av selskap» (bred tilgang til alt i selskapet).
- Eirik Oseth står i dag som **ansatt i både MCS Elektrotavler og MCS Service**, uten avdeling, og er fullt medlem av begge selskapene. Det er feil i dag, ikke bare et designproblem.
- Det finnes allerede to smale ordninger for tilgang på tvers (bestillinger og Planlegging). De skal samles i den nye modellen.

Dette er for stort til én trygg runde, så jeg deler det i fire faser. Hver fase leveres testet før neste starter.

## Fase 1 – Datamodell og Eirik (denne runden)
1. **Ansettelsesforhold**: ansattregisteret blir eneste kilde til «er ansatt». Hver person får nøyaktig én primær arbeidsgiver (det håndheves i databasen).
2. **Tilgang til andre selskaper** (ny): per bruker, selskap og modul (Ressursplan, Planlegging, Kunder, HMS, Økonomi, Organisasjon, Ansatte, Dokumenter). Nivåene er Se, Endre og Admin, med fra- og tildato og begrunnelse. «Se» gir aldri «Endre».
3. **Én felles tilgangssjekk i databasen**: brukerens eget selskap, eller en eksplisitt modultilgang, eller superadmin. Alt annet nektes.
4. **Revisjonsspor** for alle tilganger på tvers: hvem som ga dem, når, og hva som ble endret eller fjernet. Bruk av superadmin på tvers logges også.
5. **Eirik**: primær arbeidsgiver MCS Elektrotavler, avdeling Mjøndalen. Ansettelsen i MCS Service arkiveres (slettes ikke). Han får Ressursplan Se+Endre i MCS Service med begrunnelse.
6. **Admin-side «Tilgang til andre selskaper»** på personens side under Admin → Personer (fanen Tilganger), med liste og revisjonsspor.

## Fase 2 – Hard RLS på de viktigste modulene
Disse modulene byttes til den nye tilgangssjekken, med egne regler for lese, opprette, endre og slette:
- **HMS/HR**: ansatte, håndbok, bekreftelser, stoffkartotek, avvik/RUH, SJA, kompetanse, arbeidstid
- **Organisasjon og roller**, compliance
- **Ressursplan**: oppdrag og montørtildeling
- **Planlegging**
- **Kunder og kontakter**
- **Økonomi**: kalkyler, tilbud, fakturagrunnlag

Lenker med token og funksjoner i bakgrunnen kontrolleres mot det samme selskapet.

## Fase 3 – Grensesnitt
- Personer vises alltid med sin faktiske arbeidsgiver og avdeling, og får merket «Delt ressurs» når de brukes i et annet selskap. Det gjelder i Ressursplan, oppdrag og Planlegging.
- På oppdrag og prosjekt vises tre selskaper: arbeidsgiver, selskapet som eier prosjektet og selskapet som leverer ressursen.
- Valg av ansvarlig person i Organisasjon og roller viser bare egne aktive ansatte. Valget «Inkluder delt/ekstern ressurs» viser andre med merket «MCS Elektrotavler AS – delt ressurs».
- Åpner man en modul via direkte adresse uten tilgang, vises «Ingen tilgang», ikke bare en skjult meny.

## Fase 4 – Kontrollside og regresjonstest
- **/admin/access/kontroll** viser:
  - personer som er ansatt i flere selskaper
  - medlemskap uten ansettelse
  - skrivetilgang på tvers av selskaper
  - HMS-tilgang i et annet selskap
  - brede tilganger
  - ansattgrunnlag som ikke stemmer med primær arbeidsgiver
- Hvert avvik får et forslag til retting, og ingenting rettes automatisk.
- Regresjonstest A–F fra beskrivelsen: som ekte brukere i nettleseren og med direkte databasekall.

## Viktige avklaringer underveis
- Andre som i dag er ansatt i flere selskaper blir **bare rapportert** på kontrollsiden, ikke endret, før dere har bekreftet.
- Bredt medlemskap i selskap fortsetter å virke til fase 2 er ferdig for hver modul, slik at ingen mister tilgang midt i arbeidet.

## Technical details
- New tables: `company_module_access(user_id, company_id, module, level view|edit|admin, valid_from, valid_to, reason, granted_by, revoked_at)` and `access_audit_log`. `employment_profiles.is_primary` with a partial unique index per person.
- `has_company_access(_uid, _company, _module, _level)` SECURITY DEFINER: home employment OR a valid grant at that level OR super_admin (logged). `planning_company_access` and `cross_company_access_grants` are mapped into the model.
- Phase 2 replaces `is_company_member`/`has_hms_view` checks per table with separate SELECT/INSERT/UPDATE/DELETE policies. Tables without `company_id` are linked through their parent row.
- Edge functions resolve `company_id` server-side and call the same function.
