import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  collectEntityReviewCandidate,
  parseCollectorArguments,
  runEntityReviewCollection,
  savePrivateReviewCandidate,
  reservePrivateReviewCandidate,
} from "../scripts/collect-game-wallet-entity-review.mjs";
import {
  entityAuthoritySnapshotHash,
  parseOriginalEntityReceipts,
} from "../src/lib/game-wallet/receipt-authority.server.ts";

const previous = {
  VITE_PLAYFAB_TITLE_ID: process.env.VITE_PLAYFAB_TITLE_ID,
  GAME_WALLET_ENABLED: process.env.GAME_WALLET_ENABLED,
};
process.env.VITE_PLAYFAB_TITLE_ID = "17FA03";
process.env.GAME_WALLET_ENABLED = "false";
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const CONFIG = {
  storage: "postgres",
  namespace: "civilcraft_game_wallet_v3",
  databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  targetId: "a".repeat(64),
  protocolVersion: 3,
};
const PLAYER = "ABCDEF";
const ENTITY = { Id: "FACE123", Type: "title_player_account" };
function fixture() {
  const calls = [];
  const state = { source: { Entity: ENTITY, ProfileVersion: 3, Objects: {} } };
  return {
    calls,
    state,
    deps: {
      playerId: PLAYER.toLowerCase(),
      configRead: () => CONFIG,
      healthCheck: async () => {
        calls.push("health");
        return { databaseId: CONFIG.databaseId, titleId: "17FA03", schemaVersion: 1 };
      },
      entityRead: async (player) => {
        assert.equal(player, PLAYER);
        calls.push("Admin/GetUserAccountInfo");
        return ENTITY;
      },
      objectsRead: async (operation, body) => {
        assert.equal(operation, "Object/GetObjects");
        assert.deepEqual(body, { Entity: ENTITY, EscapeObject: false });
        calls.push(operation);
        return state.source;
      },
      now: () => new Date("2026-10-10T00:00:00.000Z"),
    },
  };
}
function ledger(receipts = {}) {
  return {
    ObjectName: "civilcraft.coin-purchases.v1",
    DataObject: {
      schemaVersion: 1,
      titleId: "17FA03",
      playFabId: PLAYER,
      entityId: ENTITY.Id,
      receipts,
    },
  };
}

test("absent/empty ledgers stay UNAPPROVED; unrelated source objects are never exported", async () => {
  for (const exists of [false, true]) {
    const h = fixture();
    if (exists) h.state.source.Objects["civilcraft.coin-purchases.v1"] = ledger();
    h.state.source.Objects.private = { DataObject: { token: "PRIVATE unrelated source" } };
    const candidate = await collectEntityReviewCandidate(h.deps);
    assert.equal(candidate.approval, "UNAPPROVED");
    assert.equal(candidate.historicalCompleteness, "NOT_ESTABLISHED");
    assert.equal(candidate.deploymentBinding, "NOT_ATTESTED");
    assert.equal(candidate.receiptSet.exists, exists);
    assert.deepEqual(candidate.receiptSet.receipts, []);
    assert.equal(candidate.pendingReceiptCount, 0);
    assert.equal(candidate.playerId, PLAYER);
    assert.equal(candidate.entityId, ENTITY.Id);
    assert.equal(
      candidate.ledgerHash,
      entityAuthoritySnapshotHash(
        CONFIG,
        PLAYER,
        ENTITY,
        parseOriginalEntityReceipts(h.state.source, PLAYER, ENTITY),
      ),
    );
    assert.deepEqual(h.calls, ["health", "Admin/GetUserAccountInfo", "Object/GetObjects"]);
    assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
    assert.match(candidate.reviewRequired, /empty\/absent.*cannot approve/);
    assert.equal(process.env.GAME_WALLET_ENABLED, "false");
  }
});

test("orphan granted and pending hashed receipts are collected without audit reads or grants", async () => {
  const h = fixture();
  h.state.source.Objects["civilcraft.coin-purchases.v1"] = ledger({
    [`order-${"1".repeat(64)}`]: {
      fingerprint: "2".repeat(64),
      code: "CO",
      amount: 500,
      attemptId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      state: "granted",
    },
    [`order-${"3".repeat(64)}`]: {
      fingerprint: "4".repeat(64),
      code: "CO",
      amount: 250,
      attemptId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      state: "pending",
    },
  });
  const candidate = await collectEntityReviewCandidate(h.deps);
  assert.equal(candidate.receiptSet.receipts.length, 2);
  assert.equal(candidate.pendingReceiptCount, 1);
  assert.equal(candidate.approval, "UNAPPROVED");
  assert.equal(
    candidate.receiptSet.receipts[0].receiptKey,
    `entity-objects:${ENTITY.Id}:order-${"1".repeat(64)}`,
  );
  assert.deepEqual(h.calls, ["health", "Admin/GetUserAccountInfo", "Object/GetObjects"]);
});

test("invalid identity, enabled wallet and wrong v1 binding stop before privileged source reads", async () => {
  const h = fixture();
  await assert.rejects(
    collectEntityReviewCandidate({ ...h.deps, playerId: "not-a-player" }),
    /could not be collected/,
  );
  assert.deepEqual(h.calls, []);
  process.env.GAME_WALLET_ENABLED = "true";
  await assert.rejects(collectEntityReviewCandidate(h.deps), /could not be collected/);
  process.env.GAME_WALLET_ENABLED = "false";
  assert.deepEqual(h.calls, []);
  await assert.rejects(
    collectEntityReviewCandidate({
      ...h.deps,
      healthCheck: async () => ({ databaseId: "wrong", titleId: "17FA03", schemaVersion: 1 }),
    }),
    /could not be collected/,
  );
  assert.deepEqual(h.calls, []);
});

test("malformed ledgers and private upstream failures are sanitized, never approved", async () => {
  const h = fixture();
  h.state.source.Entity = { ...ENTITY, Id: "DEADBEEF" };
  await assert.rejects(collectEntityReviewCandidate(h.deps), /could not be collected/);
  await assert.rejects(
    collectEntityReviewCandidate({
      ...h.deps,
      objectsRead: async () => {
        throw new Error("PRIVATE ticket postgres://secret");
      },
    }),
    (error) => !error.message.includes("PRIVATE") && !error.message.includes("postgres://"),
  );
});

test("CLI prints only a fixed safe summary and always closes, including save failure", async () => {
  for (const fails of [false, true]) {
    const lines = [];
    let closed = 0;
    const code = await runEntityReviewCollection({
      playerId: PLAYER,
      outputPath: path.join(tmpdir(), "PRIVATE-output.json"),
      collect: async () => ({ approval: "UNAPPROVED", privateSource: "PRIVATE" }),
      reserve: async () => ({
        write: async () => {
          if (fails) throw new Error("PRIVATE file path and receipt");
        },
        close: async () => undefined,
      }),
      close: async () => {
        closed++;
      },
      writeLine: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    });
    assert.equal(code, fails ? 1 : 0);
    assert.equal(closed, 1);
    assert.equal(lines.join(" ").includes("PRIVATE"), false);
    assert.equal(lines.join(" ").includes(PLAYER), false);
    assert.equal(lines.join(" ").includes(CONFIG.targetId), false);
  }
});

test("only explicit absolute Git-ignored private output is created; no overwrite", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "civilcraft-wallet-review-test-"));
  assert.equal(
    spawnSync("git", ["init", "-q"], { cwd: repository, stdio: "ignore", windowsHide: true })
      .status,
    0,
  );
  await writeFile(path.join(repository, ".gitignore"), ".private-wallet-review/\n");
  const privateDirectory = path.join(repository, ".private-wallet-review");
  await mkdir(privateDirectory);
  const output = path.join(privateDirectory, "candidate.unapproved.json");
  const candidate = await collectEntityReviewCandidate(fixture().deps);
  await savePrivateReviewCandidate(output, candidate, repository);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), candidate);
  await assert.rejects(
    savePrivateReviewCandidate(output, { replaced: true }, repository),
    /could not be collected/,
  );
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), candidate);
  await assert.rejects(
    savePrivateReviewCandidate(path.join(repository, "public.json"), candidate, repository),
    /could not be collected/,
  );
  await assert.rejects(
    savePrivateReviewCandidate("candidate.json", candidate, repository),
    /could not be collected/,
  );
  await writeFile(path.join(repository, ".gitignore"), "# deliberately not ignored\n");
  await assert.rejects(
    savePrivateReviewCandidate(
      path.join(privateDirectory, "not-ignored.json"),
      candidate,
      repository,
    ),
    /could not be collected/,
  );
});

test("argument parsing does not accept credentials, approval options or output defaults", () => {
  assert.deepEqual(parseCollectorArguments(["--player", PLAYER, "--output", "private.json"]), {
    playerId: PLAYER,
    outputPath: "private.json",
  });
  for (const args of [
    [],
    ["--player", PLAYER],
    ["--ticket", "PRIVATE", "--output", "private.json"],
    ["--player", PLAYER, "--output", "private.json", "--approve"],
  ])
    assert.throws(() => parseCollectorArguments(args), /could not be collected/);
});

test("synchronous close failures stay private and help performs no provider requests", async () => {
  const lines = [];
  const exit = await runEntityReviewCollection({
    outputPath: path.join(tmpdir(), "review.json"),
    collect: async () => ({ approval: "UNAPPROVED" }),
    reserve: async () => ({ write: async () => undefined, close: async () => undefined }),
    close: () => {
      throw new Error("PRIVATE close credentials");
    },
    writeLine: (line) => lines.push(line),
    writeError: (line) => lines.push(line),
  });
  assert.equal(exit, 0);
  assert.equal(lines.join(" ").includes("PRIVATE"), false);
  const help = spawnSync(
    process.execPath,
    ["scripts/collect-game-wallet-entity-review.mjs", "--help"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        CURRENCY_DATABASE_URL: "INVALID DO NOT CONNECT",
        PLAYFAB_SECRET_KEY: "PRIVATE",
      },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Never approves historical completeness/);
  assert.equal((help.stdout + help.stderr).includes("PRIVATE"), false);
});

test("private-folder junction aliases into source are rejected before privileged reads", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "civilcraft-wallet-review-junction-test-"));
  assert.equal(
    spawnSync("git", ["init", "-q"], { cwd: repository, stdio: "ignore", windowsHide: true })
      .status,
    0,
  );
  await writeFile(path.join(repository, ".gitignore"), ".private-wallet-review/\n");
  const sourceDirectory = path.join(repository, "src");
  await mkdir(sourceDirectory);
  await symlink(
    sourceDirectory,
    path.join(repository, ".private-wallet-review"),
    process.platform === "win32" ? "junction" : "dir",
  );
  let reads = 0;
  const code = await runEntityReviewCollection({
    outputPath: path.join(repository, ".private-wallet-review", "candidate.json"),
    reserve: (output) => reservePrivateReviewCandidate(output, repository),
    collect: async () => {
      reads++;
      return {};
    },
    close: async () => undefined,
    writeLine: () => undefined,
    writeError: () => undefined,
  });
  assert.equal(code, 1);
  assert.equal(reads, 0);
  await assert.rejects(readFile(path.join(sourceDirectory, "candidate.json")), { code: "ENOENT" });
});

test("exclusive reservation precedes source reads; source failure leaves only empty private file", async () => {
  const repository = await mkdtemp(
    path.join(tmpdir(), "civilcraft-wallet-review-reservation-test-"),
  );
  assert.equal(
    spawnSync("git", ["init", "-q"], { cwd: repository, stdio: "ignore", windowsHide: true })
      .status,
    0,
  );
  await writeFile(path.join(repository, ".gitignore"), ".private-wallet-review/\n");
  await mkdir(path.join(repository, ".private-wallet-review"));
  const outputPath = path.join(repository, ".private-wallet-review", "candidate.json");
  let reads = 0;
  const options = {
    outputPath,
    reserve: (output) => reservePrivateReviewCandidate(output, repository),
    collect: async () => {
      reads++;
      assert.equal(await readFile(outputPath, "utf8"), "");
      throw new Error("PRIVATE provider failure");
    },
    close: async () => undefined,
    writeLine: () => undefined,
    writeError: () => undefined,
  };
  assert.equal(await runEntityReviewCollection(options), 1);
  assert.equal(reads, 1);
  assert.equal(await readFile(outputPath, "utf8"), "");
  assert.equal(await runEntityReviewCollection(options), 1);
  assert.equal(reads, 1, "existing reserved output stops before another source read");
});

test("upstream profile-version serialization is a bounded integer or null, never arbitrary data", async () => {
  const h = fixture();
  let versionReads = 0;
  Object.defineProperty(h.state.source, "ProfileVersion", {
    get: () => (versionReads++ === 0 ? 3 : { secret: "PRIVATE version blob" }),
  });
  const candidate = await collectEntityReviewCandidate(h.deps);
  assert.equal(candidate.sourceProfileVersion, null);
  assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
});
