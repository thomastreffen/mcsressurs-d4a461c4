import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateClientState, isCronBearer } from "./security-boundary.ts";

function mockClient(result: { data: unknown; error: unknown }, captured?: { args?: Record<string, unknown> }) {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      if (captured) captured.args = { name, ...args };
      return Promise.resolve(result);
    },
  };
}

Deno.test("isCronBearer: godtar gyldig cron-bearer via verify_cron_secret", async () => {
  const captured: { args?: Record<string, unknown> } = {};
  const client = mockClient({ data: true, error: null }, captured);
  const ok = await isCronBearer(client, "Bearer " + "a".repeat(64));
  assertEquals(ok, true);
  assertEquals(captured.args?.name, "verify_cron_secret");
});

Deno.test("isCronBearer: avviser feil token (DB svarer false)", async () => {
  const client = mockClient({ data: false, error: null });
  assertEquals(await isCronBearer(client, "Bearer " + "b".repeat(64)), false);
});

Deno.test("isCronBearer: avviser manglende/feilformatert header og korte tokens uten DB-kall", async () => {
  let called = false;
  const client = {
    rpc() {
      called = true;
      return Promise.resolve({ data: true, error: null });
    },
  };
  assertEquals(await isCronBearer(client, null), false);
  assertEquals(await isCronBearer(client, ""), false);
  assertEquals(await isCronBearer(client, "Basic abc"), false);
  assertEquals(await isCronBearer(client, "Bearer kort"), false);
  assertEquals(called, false);
});

Deno.test("isCronBearer: feiler lukket ved RPC-feil", async () => {
  const client = mockClient({ data: null, error: new Error("db nede") });
  assertEquals(await isCronBearer(client, "Bearer " + "c".repeat(64)), false);
});

Deno.test("generateClientState: kryptografisk tilfeldig, 51 tegn, unikt per kall", () => {
  const a = generateClientState();
  const b = generateClientState();
  assert(a.startsWith("mcs-"));
  assertEquals(a.length, 4 + 48); // "mcs-" + 24 bytes hex
  assert(/^[0-9a-f]+$/.test(a.slice(4)));
  assertNotEquals(a, b);
  // Ikke forutsigbart mønster fra tid eller selskap
  assert(!a.includes("postkontoret"));
});
