import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  adminPlayerMessages,
  handlePlayerMessages,
} from "../src/lib/playfab/player-messages.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
const originalFetch = globalThis.fetch;
const prior = process.env["PLAYFAB_SECRET_KEY"];
const records = new Map<string, Record<string, { Value: string }>>();
let writes = 0;
beforeEach(() => {
  records.clear();
  writes = 0;
  process.env["PLAYFAB_SECRET_KEY"] = "test-only";
  globalThis.fetch = async (url, init) => {
    const data = JSON.parse(String(init?.body));
    const operation = String(url).split("/").at(-1);
    if (operation === "AuthenticateSessionTicket")
      return Response.json({
        code: 200,
        data: {
          UserInfo: { PlayFabId: data.SessionTicket === "A-ticket" ? "AAA" : "BBB" },
          IsSessionTicketExpired: data.SessionTicket === "expired",
        },
      });
    const saved = records.get(data.PlayFabId) ?? {};
    if (operation === "GetUserInternalData")
      return Response.json({ code: 200, data: { Data: saved } });
    if (operation === "UpdateUserInternalData") {
      writes++;
      for (const [key, value] of Object.entries(data.Data ?? {}))
        saved[key] = { Value: String(value) };
      for (const key of data.KeysToRemove ?? []) delete saved[key];
      records.set(data.PlayFabId, saved);
      return Response.json({ code: 200, data: {} });
    }
    throw new Error("Unexpected network request");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  if (prior === undefined) delete process.env["PLAYFAB_SECRET_KEY"];
  else process.env["PLAYFAB_SECRET_KEY"] = prior;
});
const admin = (player: string, body?: unknown) =>
  new Request(
    `https://civilcraft.test/api/admin/players/${player}/messages`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
const player = (ticket?: string, query = "") =>
  new Request(`https://civilcraft.test/api/player/messages${query}`, {
    headers: ticket ? { Authorization: `Bearer ${ticket}` } : {},
  });

test("messages are private to verified ticket owner; client-supplied recipient is ignored", async () => {
  await adminPlayerMessages(admin("AAA", { action: "send", title: "Private", body: "For A only" }));
  const a = await handlePlayerMessages(player("A-ticket"));
  assert.match(a!.headers.get("Cache-Control")!, /no-store/);
  assert.equal((await a!.json()).messages[0].body, "For A only");
  assert.deepEqual(
    (await (await handlePlayerMessages(player("B-ticket", "?playFabId=AAA")))!.json()).messages,
    [],
  );
  assert.equal((await handlePlayerMessages(player()))!.status, 401);
  assert.equal((await handlePlayerMessages(player("expired")))!.status, 401);
});
test("delete only removes selected player's message and is safely repeatable", async () => {
  const result = (await adminPlayerMessages(
    admin("AAA", { action: "send", title: "Notice", body: "Body" }),
  )) as { message: { id: string } };
  await adminPlayerMessages(admin("BBB", { action: "delete", id: result.message.id }));
  assert.equal((await (await handlePlayerMessages(player("A-ticket")))!.json()).messages.length, 1);
  await adminPlayerMessages(admin("AAA", { action: "delete", id: result.message.id }));
  await adminPlayerMessages(admin("AAA", { action: "delete", id: result.message.id }));
  assert.deepEqual((await (await handlePlayerMessages(player("A-ticket")))!.json()).messages, []);
});
test("invalid messages, namespace deletion and non-admin writes are rejected", async () => {
  for (const body of [
    { action: "send", title: "", body: "x" },
    { action: "send", title: "x", body: "x".repeat(2001) },
    { action: "delete", id: "other-save-data" },
  ])
    await assert.rejects(() => adminPlayerMessages(admin("AAA", body)));
  assert.equal(writes, 0);
  const response = await handlePlayFabAdminRequest(
    admin("AAA", { action: "send", title: "x", body: "x" }),
  );
  assert.equal(response!.status, 401);
  assert.equal(writes, 0);
  assert.equal(
    (await handlePlayerMessages(
      new Request("https://civilcraft.test/api/player/messages", { method: "POST" }),
    ))!.status,
    405,
  );
});
test("plain text is retained and unrelated internal data never leaks", async () => {
  records.set("AAA", { save: { Value: "private save" } });
  await adminPlayerMessages(
    admin("AAA", { action: "send", title: "<b>Notice</b>", body: "<script>text</script>" }),
  );
  const result = await (await handlePlayerMessages(player("A-ticket")))!.json();
  assert.equal(result.messages[0].title, "<b>Notice</b>");
  assert.doesNotMatch(JSON.stringify(result), /private save/);
  assert.equal(records.get("AAA")!["save"]!.Value, "private save");
});
