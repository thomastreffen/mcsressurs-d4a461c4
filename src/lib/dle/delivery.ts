export const DLE_DIRECT_LIMIT = 3 * 1024 * 1024;
export const DLE_LINK_SECONDS = 7 * 24 * 60 * 60;

export function parseDleRecipients(input: string): string[] {
  const addresses = [...new Set(input.split(/[;,\s]+/).filter(Boolean).map((s) => s.toLowerCase()))];
  if (addresses.length > 20 || addresses.some((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))) throw new Error("Kontroller e-postadressene (maks 20).");
  return addresses;
}

export function dleDeliveryMode(bytes: number): "attachment" | "link" {
  return bytes < DLE_DIRECT_LIMIT ? "attachment" : "link";
}