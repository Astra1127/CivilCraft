import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { handlePasswordReset } from "../src/lib/playfab/reset-password.server.ts";
import {
  expiredResetLink,
  resetFailure,
  resetFormSchema,
} from "../src/lib/playfab/reset-password.ts";

const originalFetch = globalThis.fetch;
const env = { VITE_PLAYFAB_TITLE_ID: "17FA03", PLAYFAB_SECRET_KEY: "reset-test-secret-canary" };
const prior = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
const password = "ResetTest123!",
  token = "simulated-token+with/symbols=";
let calls: { url: string; body: unknown; headers: Headers }[] = [];
let code = 200,
  providerError = "",
  failNetwork = false;
beforeEach(() => {
  Object.assign(process.env, env);
  calls = [];
  code = 200;
  providerError = "";
  failNetwork = false;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    if (failNetwork) throw new Error(token + password + env.PLAYFAB_SECRET_KEY);
    return Response.json(
      {
        code,
        error: providerError,
        errorMessage: token + password + env.PLAYFAB_SECRET_KEY,
        data: {},
      },
      { status: code },
    );
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function reset(body: unknown = { token, password }, headers: Record<string, string> = {}) {
  return handlePasswordReset(
    new Request("https://civilcraft.test/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://civilcraft.test",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}
test("simulated callback token is decoded once and reset reaches the privileged helper with exact fields", async () => {
  const url = new URL("https://civilcraft.test/reset-password?token=" + encodeURIComponent(token));
  const response = (await reset({
    token: url.searchParams.get("token"),
    password,
    PlayFabId: "ignored",
  }))!;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://17FA03.playfabapi.com/Admin/ResetPassword");
  assert.deepEqual(calls[0]!.body, { Token: token, Password: password });
  assert.equal(calls[0]!.headers.get("X-SecretKey"), env.PLAYFAB_SECRET_KEY);
});
test("invalid form and server input cannot submit weak passwords or missing tokens", async () => {
  assert.equal(resetFormSchema.safeParse({ token, password, confirm: "different" }).success, false);
  assert.equal(resetFormSchema.safeParse({ token, password, confirm: password }).success, true);
  for (const body of [
    { password },
    { token: " ", password },
    { token, password: "" },
    { token, password: "Short1" },
    { token, password: "lowercase123" },
    { token, password: "UPPERCASE123" },
    { token, password: "NoNumbersHere" },
    { token, password: "Aa1".repeat(44) },
    { token: "x".repeat(4097), password },
  ]) {
    const response = (await reset(body))!;
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: resetFailure });
  }
  assert.equal(calls.length, 0);
});
test("expired, invalid, used tokens and provider/password failures never leak raw details", async () => {
  code = 400;
  for (const error of [
    "AuthTokenExpired",
    "InvalidAuthToken",
    "AuthTokenDoesNotExist",
    "AuthTokenAlreadyUsedToResetPassword",
  ]) {
    providerError = error;
    const response = (await reset())!;
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: expiredResetLink });
  }
  providerError = "InvalidPassword";
  assert.deepEqual(await (await reset())!.json(), { error: resetFailure });
  failNetwork = true;
  assert.deepEqual(await (await reset())!.json(), { error: resetFailure });
  delete process.env["PLAYFAB_SECRET_KEY"];
  const count = calls.length;
  assert.deepEqual(await (await reset())!.json(), { error: resetFailure });
  assert.equal(calls.length, count);
});
test("reset endpoint rejects GET, cross-site and non-JSON requests without contacting PlayFab", async () => {
  assert.equal(
    (await handlePasswordReset(new Request("https://civilcraft.test/api/auth/reset-password")))!
      .status,
    405,
  );
  assert.equal((await reset(undefined, { Origin: "https://other.test" }))!.status, 403);
  assert.equal((await reset(undefined, { "Sec-Fetch-Site": "cross-site" }))!.status, 403);
  assert.notEqual((await reset(undefined, { "Content-Type": "text/plain" }))!.status, 200);
  assert.equal(
    await handlePasswordReset(new Request("https://civilcraft.test/forgot-password")),
    null,
  );
  assert.equal(calls.length, 0);
});
