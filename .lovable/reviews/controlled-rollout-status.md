# Kontrollert utrulling – status 17.11.2026 (kun lesing)
1. Mats-pilot f0f9102a: state succeeded, HTTP 201, Graph-ID (68 tegn) + changeKey lagret, showAs busy, 19.11 07–15 UTC (08–16 Oslo), jobblenke i body. Audit: preflight, consumed, receipt. Live Graph GET ikke kjørt (krever innlogget økt). "Mats har sett" ikke bekreftet.
2. E-post: postkontoret@mcsservice.no i kode; SYSTEM_SENDER_MODE, M365_MAILBOX_SCOPE_VERIFIED, M365_PILOT_RECIPIENTS ikke satt → systemavsender inaktiv (legacy). Mail.Send/ApplicationAccessPolicy ikke verifisert.
3. UPDATE/DELETE-pilot: ikke bygget; ingen PATCH/DELETE-tillatelse i one-shot.
4. Globale brytere: enabled=false, dry_run=true, pilot_mailboxes=[], scope_verified_at=NULL; 5 køelementer pending, attempts 0, ikke frigitt.
Avvik: Ståle Roar Jensen user_accounts.is_active=true (ikke endret). Andre Midtgard inaktiv.
