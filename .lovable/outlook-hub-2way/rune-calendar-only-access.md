# Rune Ørbeck – kalendertilgang uten e-posttilgang (minste privilegium)

Status: KUN FORSLAG. Ingen endring er gjort i Microsoft 365.

## Faktum
- Graph app-only svarer `ErrorAccessDenied – [RAOP] Blocked by tenant configured AppOnly AccessPolicy settings` for Rune, Eirik, Hans Jakob, Lars Erik. Thomas/Mats: 200.
- En Application Access Policy (RAOP) gjelder ALLE Exchange-tillatelser appen har i Entra samtidig (Mail.*, Calendars.*, Contacts.*). Den kan ikke begrenses til kalender. Å legge Rune i RAOP-gruppen gir Hub også Mail.Read/Mail.ReadWrite/Mail.Send mot hans postkasse (i den grad appen har dem i Entra).

## Anbefalt: Exchange RBAC for Applications (kalender-only for Rune)
RBAC-tildelinger kommer i tillegg til Entra-tillatelser og kan avgrenses til én postkasse og én rolle.

```powershell
Connect-ExchangeOnline
# 1. Les gjeldende policy (read-only)
Get-ApplicationAccessPolicy | fl AppId,PolicyScopeGroupId,AccessRight
Test-ApplicationAccessPolicy -Identity rune.orbeck@mcsservice.no -AppId <HUB_APP_ID>
Test-ApplicationAccessPolicy -Identity mats@mcsservice.no -AppId <HUB_APP_ID>

# 2. Kalender-only for Rune (krever egen godkjenning)
New-ServicePrincipal -AppId <HUB_APP_ID> -ObjectId <HUB_SP_OBJECT_ID> -DisplayName "MCS Hub"   # hopp over hvis finnes
New-ManagementScope -Name "Hub-Kalender-Rune" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'rune.orbeck@mcsservice.no'"
New-ManagementRoleAssignment -App <HUB_SP_OBJECT_ID> -Role "Application Calendars.ReadWrite" -CustomResourceScope "Hub-Kalender-Rune"

# 3. Kontroll (read-only)
Test-ServicePrincipalAuthorization -Identity <HUB_SP_OBJECT_ID> -Resource rune.orbeck@mcsservice.no
```

Konsekvens: Hub får lese/skrive Runes kalender. Mail.Read / Mail.ReadWrite / Mail.Send mot Rune forblir blokkert av RAOP (han legges IKKE i gruppen). Bruk `Application Calendars.Read` hvis kun import ønskes før toveis er aktivert.

Rollback: `Remove-ManagementRoleAssignment` + `Remove-ManagementScope`. Endring kan ta opptil ~30 min (cache).

Eirik, Hans Jakob, Lars Erik: samme mønster, men kun etter individuell beslutning.
