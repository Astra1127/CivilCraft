import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import vm from "node:vm";
import postgres from "postgres";
import ts from "typescript";
import * as catalog from "../src/lib/game-wallet/catalog.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";

// This fixture does not emulate wallet SQL or use a real database. It advertises
// PostgreSQL's JSONB parameter OID and inspects the actual installed driver's
// Parse/Describe/Bind exchange. No URL, credentials or configuration are read.
const JSONB_OID = 3802;
const MAX_FRAME = 1024 * 1024;
const require = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const zeroTerminated = (value) => Buffer.from(`${value}\0`);
function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}
function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}
function message(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from(type), uint32(body.length + 4), body]);
}
function reader(body) {
  let index = 0;
  const take = (length) => {
    assert.ok(Number.isInteger(length) && length >= 0 && index + length <= body.length);
    const result = body.subarray(index, (index += length));
    return result;
  };
  return {
    string() {
      const end = body.indexOf(0, index);
      assert.ok(end >= index, "wire string must be terminated");
      const result = body.toString("utf8", index, end);
      index = end + 1;
      return result;
    },
    int16: () => take(2).readUInt16BE(),
    int32: () => take(4).readInt32BE(),
    bytes: take,
    done: () => assert.equal(index, body.length, "unexpected trailing wire bytes"),
  };
}
function decodeBind(body, parameterCount) {
  const input = reader(body);
  assert.equal(input.string(), "", "fixture uses only the unnamed portal");
  assert.equal(input.string(), "", "prepare:false must use the unnamed statement");
  assert.equal(input.int16(), 0, "JSONB parameters must use text format");
  assert.equal(input.int16(), parameterCount);
  const parameters = Array.from({ length: parameterCount }, () => {
    const length = input.int32();
    if (length === -1) return null;
    assert.ok(length >= 0 && length <= MAX_FRAME, "invalid parameter length");
    return input.bytes(length).toString("utf8");
  });
  assert.equal(input.int16(), 0, "fixture expects text result format");
  input.done();
  return parameters;
}
async function wireFixture(run) {
  const captures = [];
  const failures = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", (error) => failures.push(error));
    let pending = Buffer.alloc(0),
      started = false,
      parameterCount = 0;
    socket.on("data", (chunk) => {
      try {
        pending = Buffer.concat([pending, chunk]);
        assert.ok(pending.length <= MAX_FRAME);
        while (pending.length >= (started ? 5 : 4)) {
          const length = pending.readUInt32BE(started ? 1 : 0);
          assert.ok(length >= (started ? 4 : 8) && length <= MAX_FRAME);
          const total = length + (started ? 1 : 0);
          if (pending.length < total) break;
          const frame = pending.subarray(0, total);
          pending = pending.subarray(total);
          if (!started) {
            assert.equal(frame.readUInt32BE(4), 196608, "only protocol 3 startup is allowed");
            const input = reader(frame.subarray(8)),
              settings = new Map();
            for (let key; (key = input.string()) !== "";) settings.set(key, input.string());
            input.done();
            assert.equal(settings.get("user"), "wire_fixture");
            assert.equal(settings.get("database"), "wire_fixture");
            started = true;
            socket.write(
              Buffer.concat([
                message("R", uint32(0)),
                message("S", zeroTerminated("server_version"), zeroTerminated("16.0")),
                message("S", zeroTerminated("in_hot_standby"), zeroTerminated("off")),
                message(
                  "S",
                  zeroTerminated("default_transaction_read_only"),
                  zeroTerminated("off"),
                ),
                message("Z", Buffer.from("I")),
              ]),
            );
            continue;
          }
          const type = frame.toString("ascii", 0, 1),
            body = frame.subarray(5);
          if (type === "P") {
            const input = reader(body);
            assert.equal(input.string(), "", "prepare:false must not name statements");
            const query = input.string();
            parameterCount = input.int16();
            assert.ok(parameterCount > 0 && parameterCount <= 16);
            assert.equal(
              query,
              `SELECT ${Array.from({ length: parameterCount }, (_, i) => `$${i + 1}::jsonb`).join(", ")}`,
            );
            const initialTypes = Array.from({ length: parameterCount }, () => input.int32());
            assert.ok(
              initialTypes.every((oid) => oid === 0),
              "JSONB types must be inferred by Describe",
            );
            input.done();
            socket.write(message("1"));
          } else if (type === "D") {
            const input = reader(body);
            assert.equal(body.toString("ascii", 0, 1), "S");
            input.bytes(1);
            assert.equal(input.string(), "");
            input.done();
            socket.write(
              Buffer.concat([
                message(
                  "t",
                  uint16(parameterCount),
                  ...Array.from({ length: parameterCount }, () => uint32(JSONB_OID)),
                ),
                message("n"),
              ]),
            );
          } else if (type === "B") {
            captures.push(decodeBind(body, parameterCount));
            socket.write(message("2"));
          } else if (type === "E") {
            const input = reader(body);
            assert.equal(input.string(), "");
            assert.equal(input.int32(), 0);
            input.done();
            socket.write(
              Buffer.concat([
                message("C", zeroTerminated("SELECT 0")),
                message("Z", Buffer.from("I")),
              ]),
            );
          } else if (type === "H") {
            assert.equal(body.length, 0);
          } else if (type === "S") {
            assert.equal(body.length, 0);
            socket.write(message("Z", Buffer.from("I")));
          } else if (type === "X") {
            assert.equal(body.length, 0);
            socket.end();
          } else {
            assert.fail(`unexpected frontend message ${type}`);
          }
        }
      } catch (error) {
        failures.push(error);
        socket.destroy(error);
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const sql = postgres({
    host: "127.0.0.1",
    port: server.address().port,
    username: "wire_fixture",
    database: "wire_fixture",
    password: "fixture-unused",
    ssl: false,
    prepare: false,
    fetch_types: false,
    target_session_attrs: "read-write",
    connection: { application_name: "wallet_jsonb_wire_test" },
    max: 1,
    connect_timeout: 2,
    idle_timeout: 1,
    max_lifetime: 10,
    keep_alive: 0,
  });
  const send = async (values) => {
    const before = captures.length;
    await sql.unsafe(`SELECT ${values.map((_, i) => `$${i + 1}::jsonb`).join(", ")}`, values);
    assert.equal(captures.length, before + 1);
    return captures.at(-1).map((parameter) => (parameter === null ? null : JSON.parse(parameter)));
  };
  try {
    await run({ send, captures });
    assert.deepEqual(failures, []);
  } finally {
    await sql.end({ timeout: 1 });
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function serviceHarness(send) {
  const state = { imported: false, covered: [], transmitted: [] };
  const config = { databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
  const identity = [config.databaseId, "TEST", "FIXTURE", "ENTITY", "title_player_account"];
  const balance = () => ({
    ready: state.imported,
    coins: state.imported ? 0 : null,
    version: state.imported ? 1 : 0,
    lifetime_gold_earned: 0,
    lifetime_gold_spent: 0,
  });
  const mocks = {
    "../playfab/admin-client.server.ts": {
      AdminApiError,
      object: (value) => (value && typeof value === "object" ? value : {}),
    },
    "../playfab/premium-wallet.server.ts": {
      resolvePremiumEntity: async () => ({ Id: "ENTITY", Type: "title_player_account" }),
      getDiamondBalance: async () => 0,
    },
    "../payments/products.ts": {},
    "../payments/orders.server.ts": {},
    "../payments/coin-maintenance.server.ts": {},
    "../payments/coin-beta.server.ts": {},
    "./config.server.ts": {
      isGameWalletEnabled: () => true,
      isGameWalletInstalled: () => true,
      requireGameWalletReady: () => config,
      requireGameWalletSettlementReady: () => config,
    },
    "./catalog.server.ts": catalog,
    "./types.ts": { MAX_GAME_COINS: 2147483647 },
    "./legacy.server.ts": {
      withAccountGate: async (_player, _reason, run) => run("11111111-2222-3333-4444-555555555555"),
      legacyOpeningSnapshot: async () => ({ classic: 0, covered: state.covered }),
      GateBeforeMutationError: class extends Error {},
    },
    "./database.server.ts": {
      walletIdentity: () => identity,
      walletInteger: Number,
      balanceRow: (row) => ({ ready: row.ready, coins: row.coins, version: row.version }),
      walletUnavailable: () => new AdminApiError(503, "Fixture unavailable"),
      walletCall: async (name, args) => {
        if (name === "wallet_balance") return [balance()];
        const values = name === "import_wallet" ? args.slice(9, 12) : [args.at(-1)];
        assert.ok(["import_wallet", "reward", "purchase"].includes(name), name);
        const decoded = await send(values);
        state.transmitted.push({ name, decoded });
        if (name === "import_wallet") {
          assert.ok(
            decoded.every(Array.isArray),
            "import arrays must arrive as JSON arrays, never JSON strings",
          );
          state.imported = true;
          return [balance()];
        }
        assert.ok(
          decoded[0] && typeof decoded[0] === "object" && !Array.isArray(decoded[0]),
          `${name} payload must arrive as a JSON object`,
        );
        return name === "purchase"
          ? [{ result: { status: "fulfilled", entitlement: decoded[0] } }]
          : [];
      },
    },
  };
  const exports = {};
  const output = ts.transpileModule(
    readFileSync(new URL("../src/lib/game-wallet/service.server.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  vm.runInNewContext(output, {
    exports,
    Buffer,
    URL,
    URLSearchParams,
    Date,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith("node:")) return require(name);
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { service: exports, state };
}

test(
  "installed postgres-js infers JSONB and encodes native arrays and objects exactly once",
  { timeout: 5000 },
  async () => {
    assert.equal(
      JSON.parse(readFileSync(new URL("../package.json", import.meta.resolve("postgres")), "utf8"))
        .version,
      "3.4.9",
    );
    await wireFixture(async ({ send, captures }) => {
      const array = [{ key: "contract:fixture", fingerprint: "a".repeat(64) }];
      const object = { kind: "contract", evidence: { tutorial: true, finalCost: 0 } };
      assert.deepEqual(await send([[], array, object]), [[], array, object]);
      assert.deepEqual(captures[0].map(JSON.parse), [[], array, object]);
      assert.deepEqual(
        await send([JSON.stringify([]), JSON.stringify(array), JSON.stringify(object)]),
        [JSON.stringify([]), JSON.stringify(array), JSON.stringify(object)],
      );
      assert.ok(
        captures[1].every((parameter) => typeof JSON.parse(parameter) === "string"),
        "the old double-encoding bug must remain reproducible",
      );
    });
  },
);

test(
  "service-produced zero import sends three empty arrays through the real PostgreSQL driver",
  { timeout: 5000 },
  async () => {
    await wireFixture(async ({ send }) => {
      const { service, state } = serviceHarness(send);
      const result = await service.importGameWallet("FIXTURE", {
        gold: 0,
        saveHash: "a".repeat(64),
      });
      assert.equal(result.ready, true);
      assert.deepEqual(plain(state.transmitted), [
        { name: "import_wallet", decoded: [[], [], []] },
      ]);
    });
  },
);

test(
  "service-produced receipt coverage, rewards and entitlements stay structured on import",
  { timeout: 5000 },
  async () => {
    await wireFixture(async ({ send }) => {
      const { service, state } = serviceHarness(send);
      state.covered = [
        {
          orderId: "postgres:fixture",
          fingerprint: "a".repeat(64),
          provider: "postgres",
          entityId: "ENTITY",
          amount: 0,
          originalFingerprint: "b".repeat(64),
        },
      ];
      const item = catalog.gameCatalog.items[0],
        contract = catalog.gameCatalog.contracts[0];
      const body = {
        gold: 0,
        saveHash: "c".repeat(64),
        completedContracts: [contract.id],
        unlockedCosmeticIDs: [item.cosmeticId],
      };
      await service.importGameWallet("FIXTURE", body);
      const decoded = state.transmitted[0].decoded;
      assert.deepEqual(decoded[0], state.covered);
      assert.deepEqual(decoded[1], plain(catalog.importCatalogState(body).rewards));
      assert.deepEqual(decoded[2], plain(catalog.importCatalogState(body).entitlements));
    });
  },
);

test(
  "service-produced rewards, cosmetic purchases and material purchases encode JSONB objects",
  { timeout: 5000 },
  async () => {
    await wireFixture(async ({ send }) => {
      const { service, state } = serviceHarness(send);
      state.imported = true;
      const achievement = catalog.gameCatalog.achievements[0];
      const reward = {
        kind: "achievement",
        sourceId: achievement.id,
        eventId: `achievement:${achievement.id}`,
      };
      await service.grantGameRewards("FIXTURE", [reward]);
      const cosmetic = catalog.gameCatalog.items[0];
      await service.purchaseGameItem("FIXTURE", {
        operationId: "11111111-2222-3333-4444-555555555555",
        targetKind: "cosmetic",
        targetId: cosmetic.itemId,
      });
      const contract = catalog.gameCatalog.contracts.find(
        (entry) =>
          !entry.allowedMaterialIds.length ||
          catalog.gameCatalog.materials.some((material) =>
            entry.allowedMaterialIds.includes(material.id),
          ),
      );
      const material = catalog.gameCatalog.materials.find(
        (entry) =>
          !contract.allowedMaterialIds.length || contract.allowedMaterialIds.includes(entry.id),
      );
      await service.purchaseGameItem("FIXTURE", {
        operationId: "22222222-2222-3333-4444-555555555555",
        targetKind: "material",
        targetId: material.id,
        contractId: contract.id,
      });
      assert.deepEqual(plain(state.transmitted), [
        { name: "reward", decoded: [plain(catalog.rewardEvent(reward).payload)] },
        {
          name: "purchase",
          decoded: [plain(catalog.purchaseTarget("cosmetic", cosmetic.itemId).payload)],
        },
        {
          name: "purchase",
          decoded: [plain(catalog.purchaseTarget("material", material.id, contract.id).payload)],
        },
      ]);
    });
  },
);

test(
  "malformed import/reward inputs are rejected before any JSONB query is transmitted",
  { timeout: 5000 },
  async () => {
    await wireFixture(async ({ send, captures }) => {
      const { service } = serviceHarness(send);
      const base = { gold: 0, saveHash: "a".repeat(64) };
      await assert.rejects(
        service.importGameWallet("FIXTURE", { ...base, completedContracts: "[]" }),
        (error) => error.status === 400,
      );
      await assert.rejects(
        service.importGameWallet("FIXTURE", { ...base, unlockedCosmeticIDs: [null] }),
        (error) => error.status === 400,
      );
      await assert.rejects(
        service.grantGameRewards("FIXTURE", [
          {
            kind: "contract",
            sourceId: catalog.gameCatalog.contracts[0].id,
            eventId: "incorrect",
            evidence: {},
          },
        ]),
        (error) => error.status === 400,
      );
      assert.equal(captures.length, 0);
    });
  },
);

test("wire capture decoder rejects truncation, invalid lengths and trailing data", () => {
  const valid = Buffer.concat([
    zeroTerminated(""),
    zeroTerminated(""),
    uint16(0),
    uint16(1),
    uint32(2),
    Buffer.from("[]"),
    uint16(0),
  ]);
  assert.deepEqual(decodeBind(valid, 1), ["[]"]);
  assert.throws(() => decodeBind(valid.subarray(0, -1), 1));
  assert.throws(() => decodeBind(Buffer.concat([valid, Buffer.from([0])]), 1));
  const invalid = Buffer.from(valid);
  invalid.writeInt32BE(-2, 6);
  assert.throws(() => decodeBind(invalid, 1));
  assert.throws(() => decodeBind(valid, 2));
});
