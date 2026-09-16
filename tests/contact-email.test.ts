import assert from "node:assert/strict";
import { test } from "node:test";
import { syncContactEmail, type ContactProfile } from "../src/lib/playfab/contact-email.ts";

const input = {
  playFabId: "ABC123",
  sessionTicket: "player-ticket",
  accountEmail: "player@example.test",
};
function backend(initial: ContactProfile = { PlayerId: input.playFabId }) {
  let profile = initial;
  const calls: {
    path: string;
    body: Record<string, unknown>;
    options: { sessionTicket: string };
  }[] = [];
  const call = async <T>(
    path: string,
    body: Record<string, unknown>,
    options: { sessionTicket: string },
  ): Promise<T> => {
    calls.push({ path, body, options });
    if (path === "/Client/GetPlayerProfile") return { PlayerProfile: profile } as T;
    assert.equal(path, "/Client/AddOrUpdateContactEmail");
    profile = {
      PlayerId: input.playFabId,
      ContactEmailAddresses: [{ EmailAddress: String(body["EmailAddress"]) }],
    };
    return {} as T;
  };
  return { call, calls };
}
test("new registration uses its ticket to set contact once without a profile lookup or manual email send", async () => {
  const b = backend();
  await syncContactEmail(b.call, { ...input, newAccount: true });
  assert.deepEqual(b.calls, [
    {
      path: "/Client/AddOrUpdateContactEmail",
      body: { EmailAddress: input.accountEmail },
      options: { sessionTicket: input.sessionTicket },
    },
  ]);
});
test("existing blank contact is synced once; second login reads backend and does not update", async () => {
  const b = backend();
  await syncContactEmail(b.call, input);
  await syncContactEmail(b.call, input);
  assert.deepEqual(
    b.calls.map((c) => c.path),
    ["/Client/GetPlayerProfile", "/Client/AddOrUpdateContactEmail", "/Client/GetPlayerProfile"],
  );
  assert.deepEqual(b.calls[0]!.body, {
    PlayFabId: input.playFabId,
    ProfileConstraints: { ShowContactEmailAddresses: true },
  });
  assert.ok(b.calls.every((c) => c.options.sessionTicket === input.sessionTicket));
});
test("existing same or different contact is preserved, including unverified contacts", async () => {
  for (const email of [input.accountEmail, "different@example.test"]) {
    const profile = { PlayerId: input.playFabId, ContactEmailAddresses: [{ EmailAddress: email }] };
    const b = backend(profile);
    await syncContactEmail(b.call, { ...input, profile });
    assert.equal(b.calls.length, 0);
  }
});
test("unknown email or ticket never triggers contact API calls", async () => {
  const b = backend();
  for (const accountEmail of [undefined, "", "not-an-email"])
    await syncContactEmail(b.call, { ...input, accountEmail });
  await syncContactEmail(b.call, { ...input, sessionTicket: "" });
  assert.equal(b.calls.length, 0);
});
test("profile failure, mismatched identity and malformed data cannot overwrite contact or fail login", async () => {
  let count = 0;
  await syncContactEmail(async () => {
    count++;
    throw new Error("private provider failure");
  }, input);
  assert.equal(count, 1);
  for (const profile of [
    { PlayerId: "OTHER" },
    { PlayerId: input.playFabId, ContactEmailAddresses: [null] },
    { PlayerId: input.playFabId, ContactEmailAddresses: "unavailable" },
  ]) {
    const b = backend(profile as ContactProfile);
    await syncContactEmail(b.call, input);
    assert.equal(b.calls.length, 1);
  }
});
test("failed update is tolerated and later explicit login rechecks before attempting sync", async () => {
  const paths: string[] = [];
  const call = async <T>(path: string): Promise<T> => {
    paths.push(path);
    if (path.endsWith("GetPlayerProfile"))
      return { PlayerProfile: { PlayerId: input.playFabId, ContactEmailAddresses: [] } } as T;
    throw new Error("update unavailable");
  };
  await syncContactEmail(call, input);
  assert.deepEqual(paths, ["/Client/GetPlayerProfile", "/Client/AddOrUpdateContactEmail"]);
});
