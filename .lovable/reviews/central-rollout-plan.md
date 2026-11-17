# Sentral kalender + systemavsender – utrullingsplan (17.11.2026)
## Status
- Kalender: Mats one-shot POST 201 lagret. Endring/sletting: lesekontroll deployet; skriving låst (MUTATIONS_APPROVED=false). Engangskrav-tabell job_calendar_one_shot_mutations (én per versjon, sletting én gang) finnes.
- E-post: superadmin-kontroll `system-sender-diagnostics` (kun token, ingen Graph-kall) + én testmelding til innlogget superadmin bak frase og alle porter. Testkrav: system_sender_test_runs (én åpen per person).
## Oppgave for Simen (Microsoft)
1. Bekreft at e-postappen (AZURE_CLIENT_ID) har Application-tillatelsen Mail.Send med admin consent; fjern brede skriverettigheter som ikke trengs, eller lag egen app kun med Mail.Send.
2. Begrens appen til postkontoret@mcsservice.no (Exchange RBAC for Applications management scope, eller ApplicationAccessPolicy RestrictAccess mot en mail-aktivert gruppe som bare inneholder postkontoret).
3. Verifiser: Test-ServicePrincipalAuthorization / Test-ApplicationAccessPolicy → postkontoret = tillatt, en vanlig ansatt = nektet. Send resultatet til Thomas.
## Thomas etterpå (krever samtykke)
- Sett M365_MAILBOX_SCOPE_VERIFIED=true og M365_PILOT_RECIPIENTS=<kun egen adresse>. IKKE sett SYSTEM_SENDER_MODE før testmeldingen er mottatt.
- Kjør «Kontroller avsender», deretter «Send én testmelding til meg».
## Utrulling kalender (senere, hver gang eksplisitt)
- Én postboks + én dag om gangen via job_outlook_app_pilot_targets; aldri alle brukere.
- Før sentral skriving for en montør: deaktiver delegert skriving for samme (jobb, montør, dag) – adopter eksisterende day links, aldri dobbel kopi.
- Gammel kø frigis aldri automatisk; hvert element krever release_key.
- Annen Outlook-avtale = varsel + auditert overstyring; samme oppdrag/ukjent identitet = stopp.
- Status per mottaker: event_recipient_delivery (e-post og Outlook separat; 202 = akseptert, ikke levert).
