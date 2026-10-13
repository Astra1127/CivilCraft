// Operator-only preparation; never called by the website or game runtime.
import { readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminGameConfig } from "../src/lib/playfab/admin-client.server.ts";
import {
  entityObjectsRequest,
  resolvePremiumEntity,
} from "../src/lib/playfab/premium-wallet.server.ts";
import { requireGameWalletSettlementReady } from "../src/lib/game-wallet/config.server.ts";
import { assertGameWalletHealthy, walletInteger } from "../src/lib/game-wallet/database.server.ts";
import {
  entityAuthoritySnapshotHash,
  parseOriginalEntityReceipts,
  postgresReceiptFingerprint,
} from "../src/lib/game-wallet/receipt-authority.server.ts";
import {
  assertCurrencyDatabaseHealthy,
  closeCurrencyDatabasePool,
  currencyDatabaseConnection,
  requireCurrencyDatabaseReady,
} from "../src/lib/payments/currency-database.server.ts";
import { reservePrivateReviewCandidate } from "./collect-game-wallet-entity-review.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORIGIN = "https://civil-craft.vercel.app";
const FAILURE =
  "Migration preparation could not be collected. No approval, import, currency, gate, SQL migration or flags were changed. Review configuration privately; no provider details were printed.";
const MAX_ROWS = 10_000;
const HEX = /^[a-f0-9]{64}$/;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = () => {
  throw new Error(FAILURE);
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const exact = (value, keys) =>
  isRecord(value) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

export function validateMigrationBinding(binding) {
  if (
    !exact(binding, ["format", "origin", "titleId", "databaseId", "targetId", "protocolVersion"]) ||
    binding.format !== "civilcraft.game-wallet-migration-target.v1" ||
    binding.origin !== ORIGIN ||
    typeof binding.titleId !== "string" ||
    !/^[a-f0-9]{1,16}$/i.test(binding.titleId) ||
    typeof binding.databaseId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(binding.databaseId) ||
    typeof binding.targetId !== "string" ||
    !HEX.test(binding.targetId) ||
    binding.protocolVersion !== 3
  )
    fail();
  return {
    ...binding,
    titleId: binding.titleId.toUpperCase(),
    databaseId: binding.databaseId.toLowerCase(),
  };
}
function preparationWindow() {
  const value = (key) => process.env[key]?.trim().toLowerCase();
  if (
    !["true", "false"].includes(value("GAME_WALLET_ENABLED")) ||
    value("COIN_FULFILLMENT_MAINTENANCE") !== "true" ||
    value("COIN_BETA_CHECKOUT_ENABLED") !== "false"
  )
    fail();
}
export function migrationPreparationGuard(binding) {
  const pin = validateMigrationBinding(binding);
  preparationWindow();
  const currency = requireCurrencyDatabaseReady(),
    config = requireGameWalletSettlementReady();
  const configuredOrigin = (
    process.env.PUBLIC_APP_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    ORIGIN
  ).trim();
  if (
    ![ORIGIN, `${ORIGIN}/`].includes(configuredOrigin) ||
    adminGameConfig().titleId.toUpperCase() !== pin.titleId ||
    currency.databaseId !== pin.databaseId ||
    currency.targetId !== pin.targetId ||
    config.databaseId !== pin.databaseId ||
    config.targetId !== pin.targetId ||
    config.namespace !== "civilcraft_game_wallet_v3" ||
    config.storage !== "postgres" ||
    config.protocolVersion !== 3
  )
    fail();
  return config;
}

/** Health is a known nonmutating SELECT outside READ ONLY: its capability policy
 * deliberately requires transaction_read_only=off. Snapshot queries below are READ ONLY. */
async function healthRead() {
  return { v1: await assertCurrencyDatabaseHealthy(), v3: await assertGameWalletHealthy() };
}

export async function readMigrationDatabase({
  config,
  titleId,
  playerId,
  entity,
  ledgerHash,
  connection = currencyDatabaseConnection,
}) {
  try {
    if (
      !config ||
      !/^[a-f0-9]{1,16}$/i.test(titleId) ||
      !/^[a-f0-9]{1,32}$/i.test(playerId) ||
      entity?.Type !== "title_player_account" ||
      !/^[a-f0-9]{1,64}$/i.test(entity.Id) ||
      !HEX.test(ledgerHash)
    )
      fail();
    const identity = [
      config.databaseId,
      titleId.toUpperCase(),
      playerId.toUpperCase(),
      entity.Id.toUpperCase(),
      entity.Type,
    ];
    // No walletCall dispatcher, interpolated operation name, direct table access or writer capability.
    return await connection().begin("isolation level repeatable read, read only", async (sql) => ({
      balanceRows: [
        ...(await sql.unsafe(
          "SELECT * FROM civilcraft_game_wallet_v3.wallet_balance($1::uuid,$2,$3,$4,$5)",
          identity,
        )),
      ],
      postgresRows: [
        ...(await sql.unsafe(
          "SELECT * FROM civilcraft_game_wallet_v3.legacy_receipts($1::uuid,$2,$3,$4,$5)",
          identity,
        )),
      ],
      manifestRows: [
        ...(await sql.unsafe(
          "SELECT * FROM civilcraft_game_wallet_v3.entity_manifest($1::uuid,$2,$3,$4,$5,$6,$7)",
          [...identity, config.targetId, ledgerHash],
        )),
      ],
    }));
  } catch {
    throw new Error(FAILURE);
  }
}
function postgresProjection(rows, config, player, entity) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) fail();
  const receipts = rows
    .map((row) => {
      if (
        !isRecord(row) ||
        typeof row.order_id !== "string" ||
        !/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(row.order_id) ||
        row.player_id !== player ||
        row.entity_id !== entity.Id ||
        row.entity_type !== entity.Type ||
        row.currency !== "CO" ||
        !["pending", "granted"].includes(row.state) ||
        typeof row.original_fingerprint !== "string" ||
        !HEX.test(row.original_fingerprint)
      )
        fail();
      const amount = walletInteger(row.amount);
      if (
        amount < 1 ||
        row.original_fingerprint !==
          postgresReceiptFingerprint(config, player, entity, row.order_id, amount)
      )
        fail();
      return {
        provider: "postgres",
        receiptKey: `postgres:${row.order_id}`,
        originalFingerprint: row.original_fingerprint,
        amount,
        state: row.state,
      };
    })
    .sort((a, b) => a.receiptKey.localeCompare(b.receiptKey));
  if (new Set(receipts.map((row) => row.receiptKey)).size !== receipts.length) fail();
  return receipts;
}
function walletProjection(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !isRecord(rows[0]) ||
    typeof rows[0].ready !== "boolean"
  )
    fail();
  const row = rows[0];
  if (
    !row.ready &&
    (row.coins !== null || row.lifetime_gold_earned !== null || row.lifetime_gold_spent !== null)
  )
    fail();
  return {
    imported: row.ready,
    coins: row.ready ? walletInteger(row.coins) : null,
    version: walletInteger(row.version, Number.MAX_SAFE_INTEGER),
    lifetimeGoldEarned: row.ready ? walletInteger(row.lifetime_gold_earned) : null,
    lifetimeGoldSpent: row.ready ? walletInteger(row.lifetime_gold_spent) : null,
  };
}
function manifestProjection(rows, ledgerHash, snapshot) {
  if (!Array.isArray(rows) || rows.length > 1) fail();
  if (!rows.length) return "MISSING"; // No matching current snapshot, not proof all older manifests are absent.
  if (
    !isRecord(rows[0]) ||
    typeof rows[0].ledger_hash !== "string" ||
    !HEX.test(rows[0].ledger_hash) ||
    !isRecord(rows[0].receipt_set)
  )
    fail();
  return rows[0].ledger_hash === ledgerHash &&
    JSON.stringify(canonical(rows[0].receipt_set)) === JSON.stringify(canonical(snapshot))
    ? "MATCHED"
    : "MISMATCHED";
}

/** A review packet is not authority. Even a matched old approval does not select
 * a save, inspect a hold, prove historic completeness, or authorize this operator to import. */
export async function collectMigrationReview({
  playerId,
  binding,
  guard = migrationPreparationGuard,
  healthCheck = healthRead,
  entityRead = resolvePremiumEntity,
  objectsRead = entityObjectsRequest,
  databaseRead = readMigrationDatabase,
  now = () => new Date(),
} = {}) {
  try {
    if (typeof playerId !== "string" || !/^[a-f0-9]{1,32}$/i.test(playerId)) fail();
    const player = playerId.toUpperCase(),
      pin = validateMigrationBinding(binding);
    preparationWindow();
    const config = guard(pin);
    if (
      config?.storage !== "postgres" ||
      config.namespace !== "civilcraft_game_wallet_v3" ||
      config.databaseId !== pin.databaseId ||
      config.targetId !== pin.targetId ||
      config.protocolVersion !== 3
    )
      fail();
    const health = await healthCheck();
    if (
      health?.v1?.databaseId !== pin.databaseId ||
      health.v1.titleId !== pin.titleId ||
      health.v1.schemaVersion !== 1 ||
      health?.v3?.databaseId !== pin.databaseId ||
      health.v3.titleId !== pin.titleId ||
      health.v3.protocolVersion !== 3
    )
      fail();
    const entityResult = await entityRead(player);
    if (
      entityResult?.Type !== "title_player_account" ||
      typeof entityResult.Id !== "string" ||
      !/^[a-f0-9]{1,64}$/i.test(entityResult.Id)
    )
      fail();
    const entity = { Id: entityResult.Id.toUpperCase(), Type: entityResult.Type };
    const source = await objectsRead("Object/GetObjects", { Entity: entity, EscapeObject: false });
    const receiptSet = parseOriginalEntityReceipts(source, player, entity);
    const sourceVersion = source.ProfileVersion;
    if (
      receiptSet.receipts.length > MAX_ROWS ||
      adminGameConfig().titleId.toUpperCase() !== pin.titleId
    )
      fail();
    const ledgerHash = entityAuthoritySnapshotHash(config, player, entity, receiptSet);
    const database = await databaseRead({
      config,
      titleId: pin.titleId,
      playerId: player,
      entity,
      ledgerHash,
    });
    const wallet = walletProjection(database?.balanceRows);
    const postgresReceipts = postgresProjection(database?.postgresRows, config, player, entity);
    const manifestStatus = manifestProjection(database?.manifestRows, ledgerHash, receiptSet);
    const pendingReceiptCount = [...receiptSet.receipts, ...postgresReceipts].filter(
      (row) => row.state === "pending",
    ).length;
    const candidate = {
      format: "civilcraft.game-wallet-migration-review.v1",
      approval: "UNAPPROVED",
      historicalCompleteness: "NOT_ESTABLISHED",
      deploymentBinding: "NOT_ATTESTED",
      gateState: "UNKNOWN",
      selectedSaveReview: "NOT_COLLECTED",
      collectedAt: now().toISOString(),
      origin: pin.origin,
      titleId: pin.titleId,
      playerId: player,
      entityId: entity.Id,
      entityType: entity.Type,
      databaseId: pin.databaseId,
      targetId: pin.targetId,
      protocolVersion: 3,
      sourceProfileVersion:
        Number.isSafeInteger(sourceVersion) && sourceVersion >= 0 ? sourceVersion : null,
      receiptSet,
      ledgerHash,
      postgresReceipts,
      pendingReceiptCount,
      manifestStatus,
      wallet,
      preparationStatus: wallet.imported
        ? "DO_NOT_REIMPORT"
        : pendingReceiptCount > 0
          ? "PENDING_RECEIPTS_REQUIRE_REVIEW"
          : "ACCOUNT_AND_SAVE_REVIEW_REQUIRED",
      noMigrationAuthorityGranted: true,
      requiredReviews: [
        "Fresh deployed physical-target binding and retired-consumer evidence",
        "Account gate/hold state from separately audited owner READ ONLY inspection",
        "Original Entity historical completeness, including absent or empty ledgers",
        "Unknown historic paid orders, pending receipts and manual grants; never infer delivery from balance",
        "Settled selected save on the intended device, explicit guest-import decision, ownership and queued-reward overlap",
      ],
      limitations: [
        "PlayFab and PostgreSQL observations are not a single globally atomic snapshot; recollect before any approval/import.",
        "Missing manifest means no matching approval for this exact snapshot, not proof no historical approval exists.",
        "Imported readiness cannot prove an account is unheld. This packet cannot release or create holds.",
        "No classic balance, save contents, order polling/repair, payment provider request, gate acquisition, import, credit, SQL migration, manifest approval or checkout change.",
      ],
    };
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > 4 * 1024 * 1024) fail();
    return candidate;
  } catch {
    throw new Error(FAILURE);
  }
}

const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
export async function readMigrationBinding(bindingPath, repository = ROOT) {
  try {
    if (
      typeof bindingPath !== "string" ||
      !path.isAbsolute(bindingPath) ||
      path.extname(bindingPath).toLowerCase() !== ".json"
    )
      fail();
    const root = await realpath(repository),
      privateRoot = await realpath(path.join(repository, ".private-wallet-review"));
    if (!samePath(privateRoot, path.join(root, ".private-wallet-review"))) fail();
    const file = await realpath(bindingPath);
    if (!samePath(path.dirname(file), privateRoot) || !samePath(file, path.resolve(bindingPath)))
      fail();
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > 4096) fail();
    const ignored = spawnSync("git", ["check-ignore", "-q", "--", file], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });
    if (ignored.status !== 0) fail();
    return validateMigrationBinding(JSON.parse(await readFile(file, "utf8")));
  } catch {
    throw new Error(FAILURE);
  }
}
export function parsePreparationArguments(args) {
  if (
    args.length !== 6 ||
    args[0] !== "--player" ||
    args[2] !== "--binding" ||
    args[4] !== "--output" ||
    !/^[a-f0-9]{1,32}$/i.test(args[1] || "") ||
    !args[3] ||
    !args[5]
  )
    fail();
  return { playerId: args[1].toUpperCase(), bindingPath: args[3], outputPath: args[5] };
}
export async function runMigrationPreparation({
  playerId,
  bindingPath,
  outputPath,
  bindingRead = readMigrationBinding,
  collect = collectMigrationReview,
  reserve = reservePrivateReviewCandidate,
  close = closeCurrencyDatabasePool,
  writeLine = console.log,
  writeError = console.error,
} = {}) {
  let reservation;
  try {
    // Exclusive private output is reserved before ALL privileged/provider reads.
    reservation = await reserve(outputPath);
    const binding = await bindingRead(bindingPath);
    const candidate = await collect({ playerId, binding });
    await reservation.write(candidate);
    writeLine(
      "Saved a private UNAPPROVED migration review packet. No historical completeness, deployed binding, hold clearance or selected-save approval was attested. No account import, currency, gate, SQL migration or flags changed.",
    );
    return 0;
  } catch {
    writeError(FAILURE);
    return 1;
  } finally {
    try {
      await reservation?.close();
    } catch {
      /* No filesystem/provider diagnostics. */
    }
    try {
      await close();
    } catch {
      /* No credential/provider diagnostics. */
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help")
    console.log(
      "Usage: node --env-file=<private runtime configuration> scripts/prepare-game-wallet-migration.mjs --player <classic PlayFabId> --binding <absolute private target-pin.json> --output <absolute private new-review.json>\nExplicit selected account only. Requires Coin maintenance, beta checkout paused, pinned verified restricted v1/v3 configuration. Existing wallet may remain enabled. Collects UNAPPROVED original Coin source and restricted READ ONLY database snapshots; never approves, selects saves, inspects/releases holds, imports, credits, creates SQL, activates checkout or prints private source data. Transport may acquire an ephemeral title Entity token to read Objects. Local pin/health is not deployed-target proof. No all-player enumeration.",
    );
  else {
    try {
      process.exitCode = await runMigrationPreparation(parsePreparationArguments(args));
    } catch {
      console.error(FAILURE);
      process.exitCode = 1;
    }
  }
}
