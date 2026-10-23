# ChatGPT-kobling til MCS Hub – diagnose (ingen kodeendring)

## 1) Hva som finnes nå (verifisert live 23.10 11:24)
- MCP-endepunkt `https://nmqycanqumelmfpdmkpr.supabase.co/functions/v1/mcp` er publisert. Kall uten innlogging gir 401 med `WWW-Authenticate: Bearer resource_metadata=".../functions/v1/mcp/.well-known/oauth-protected-resource"`.
- Protected resource metadata svarer: resource = MCP-URL, authorization_servers = `.../auth/v1`.
- Authorization-server metadata (RFC 8414) svarer: issuer stemmer, PKCE S256, `registration_endpoint` (DCR) finnes, `token_endpoint_auth_methods` inkluderer `none`.
- Godkjenningssiden `/.lovable/oauth/consent` finnes og svarer 200 på publisert app; innlogging bevarer returadressen.
- Tre verktøy i manifestet: find_employee, list_employee_competences, upload_competence_document, alle med OAuth på servernivå.

## 2) Avvik mot OpenAI/MCP-kravene
- Serverens auth-oppdagelse oppfyller kravene. Ingen feil funnet i 401-svar, metadata, PKCE eller DCR.
- `securitySchemes` per verktøy finnes ikke i manifestet. Hele serveren krever OAuth, så ChatGPT ber om innlogging uansett. Dette er sannsynligvis ikke grunnen til at pluginen mangler ved @.
- Sannsynlig hovedårsak: en «privat plugin» som bare har MCP-URL-en i pakken er ikke det samme som en registrert ChatGPT-app eller kobling. ChatGPT viser et verktøy ved @ først når koblingen er laget i Innstillinger → Apper og koblinger (utviklermodus), OAuth er fullført og verktøylisten er hentet. Uten dette har pluginen ingen aktiv tilkobling å vise.
- I tillegg må utviklermodus være på, og i Work/Business må en administrator tillate egendefinerte koblinger.

## 3) Minste sikre retting
1. Opprett koblingen direkte i ChatGPT. Slå på utviklermodus, velg «Opprett app/kobling», lim inn MCP-URL-en, velg OAuth og la ChatGPT registrere seg selv automatisk (DCR).
2. Fullfør innlogging og «Godkjenn» på MCS-siden. Bekreft deretter at de tre verktøyene vises.
3. Hvis koblingen feiler, sjekk serverloggene samtidig. Da ser vi om ChatGPT når 401-svaret, metadataen, registreringen og byttet til tilgangsnøkkel.
4. Legg til `securitySchemes` (oauth2) per verktøy bare hvis koblingen fortsatt ikke vises. Det er en liten, trygg endring som krever ny publisering.
- Ingen tjenestenøkler, ingen kopierte innloggingsnøkler og ingen endring i tilgangsregler.

## 4) Kobling først, deretter pluginen?
Ja. Lag og verifiser koblingen direkte i ChatGPT først. Når den virker, lar du pluginen peke på den registrerte koblingen eller app-ID-en, i stedet for å legge inn URL-en på nytt. Da finnes én OAuth-registrering og én godkjenning, og det blir ingen dobbel registrering med en klient som ikke lar seg finne.
