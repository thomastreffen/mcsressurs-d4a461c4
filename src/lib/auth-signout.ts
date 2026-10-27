/**
 * Scope used when a Hub user presses "Logg ut".
 * Must stay "local": "global"/"others" revoke every session of the user,
 * including OAuth sessions held by connected assistants (ChatGPT MCP).
 */
export const HUB_SIGN_OUT_SCOPE = "local" as const;
