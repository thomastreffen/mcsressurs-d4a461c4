# Kompetansedokumenter uten nettleser: hva som finnes og hva som mangler

## Funn (kun lesing)

- Ingen server-funksjon gjør dette i dag. Ingen av de over 100 server-funksjonene leser eller skriver `compliance_competences`.
- Den eneste veien er nettleseren: `useCompetenceMutations().save` i `src/hooks/useCompliance.ts` (linje 219–248). Den kjører med den innloggede brukerens sesjon og gjør dette:
  1. Laster opp filen til `job-attachments` på stien `compliance/{company_id}/{competence_id}/{ts}_{navn}`.
  2. Lager en rad i `documents` med entity_type `compliance_competence`, category `kompetanse`, storage_bucket `job-attachments` og public_url.
  3. Setter `compliance_competences.document_id`.
- De tre stegene skjer uten transaksjon. Feiler et steg, kan det bli liggende en fil uten rad, eller en rad uten kobling.
- `job-attachments` er en åpen bøtte, så kompetansebevis (personopplysninger) kan åpnes av alle som har lenken. Den skal fortsatt være åpen av hensyn til gamle lenker, men nye sensitive filer bør ikke legges der.
- Andre opplastingsfunksjoner (`sharepoint-upload`, `extract-user-document`, `planning-external-file`) passer ikke. De har andre formål og ingen kompetansekobling.

**Konklusjon:** En ekstern integrasjon har ingen trygg vei for dette i dag. Den kan bare etterligne nettleseren med en ekte brukersesjon, og det anbefales ikke.

## Minste trygge tillegg (forslag, ikke bygget)

Én ny server-funksjon, `competence-document-upload`, kalt med POST og multipart-skjema: `competence_id` + `file` (kun PDF, maks 10 MB).

Autentisering, ett av to alternativer:
- **A (anbefalt): innlogget bruker.** Bearer-token verifiseres med getClaims. Deretter sjekkes rettigheten med `check_permission_v2` eller samme regel som for kompetanse-redigering (RLS), i kompetansepostens eget selskap.
- **B: maskin-til-maskin.** En egen nøkkel `COMPETENCE_INTEGRATION_KEY` legges inn under Secrets. Den sammenlignes i konstant tid og gjelder kun ett angitt selskap. Den gir ingen annen tilgang.

Serveren gjør dette:
1. Slår opp kompetanseposten og avgjør selskapet selv. `company_id` fra klienten godtas aldri.
2. Sjekker filen (PDF-signatur `%PDF`) og renser filnavnet.
3. Laster opp til den private bøtta `compliance-documents` (ny, med samme stimønster). Alternativt `job-attachments` hvis dere bevisst vil holde dere til den.
4. Lager `documents`-raden og setter `document_id` via én databasefunksjon med SECURITY DEFINER. Den er idempotent på `client_request_id`. Feiler databasesteget, slettes filen igjen.
5. Svarer med `document_id` og file_path, men ingen offentlig lenke. Visning skjer via kortlivede signerte lenker.
6. Logger hendelsen i `activity_log`.

Tilpasning i UI: `PersonCompetenceTab` åpner dokumentet via en signert lenke i stedet for `public_url`. Gamle `job-attachments`-lenker fortsetter å virke.

## Spørsmål før bygging

1. Skal integrasjonen bruke A (brukertoken) eller B (integrasjonsnøkkel)?
2. Skal filene i privat bøtte (anbefalt), eller bevisst i `job-attachments`?
3. Test: kun på Emil Strids tre poster, eller på en egen testperson først?
