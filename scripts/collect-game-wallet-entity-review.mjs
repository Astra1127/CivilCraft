import { open, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminGameConfig } from "../src/lib/playfab/admin-client.server.ts";
import {
  entityObjectsRequest,
  resolvePremiumEntity,
} from "../src/lib/playfab/premium-wallet.server.ts";
import {
  assertCurrencyDatabaseHealthy,
  closeCurrencyDatabasePool,
} from "../src/lib/payments/currency-database.server.ts";
import { gameWalletConfig } from "../src/lib/game-wallet/config.server.ts";
import {
  entityAuthoritySnapshotHash,
  parseOriginalEntityReceipts,
} from "../src/lib/game-wallet/receipt-authority.server.ts";

const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const FAILURE =
  "Unapproved Entity review candidate could not be collected. No approval, currency, SQL or flags were changed; review configuration privately. No provider details were printed.";

/** Privileged READS only. A current snapshot is not historical completeness evidence. */
export async function collectEntityReviewCandidate({
  playerId,
  healthCheck = assertCurrencyDatabaseHealthy,
  configRead = gameWalletConfig,
  entityRead = resolvePremiumEntity,
  objectsRead = entityObjectsRequest,
  now = () => new Date(),
} = {}) {
  try {
    if (
      process.env["GAME_WALLET_ENABLED"]?.trim().toLowerCase() === "true" ||
      typeof playerId !== "string" ||
      !/^[a-f0-9]{1,32}$/i.test(playerId)
    )
      throw new Error();
    const player = playerId.toUpperCase();
    const title = adminGameConfig().titleId.toUpperCase();
    const config = configRead();
    const health = await healthCheck();
    if (
      health?.databaseId !== config.databaseId ||
      health.titleId !== title ||
      health.schemaVersion !== 1 ||
      config.protocolVersion !== 3
    )
      throw new Error();
    const entity = await entityRead(player);
    if (
      entity?.Type !== "title_player_account" ||
      typeof entity.Id !== "string" ||
      !/^[a-f0-9]{1,64}$/i.test(entity.Id)
    )
      throw new Error();
    const source = await objectsRead("Object/GetObjects", { Entity: entity, EscapeObject: false });
    const snapshot = parseOriginalEntityReceipts(source, player, entity);
    const hash = entityAuthoritySnapshotHash(config, player, entity, snapshot);
    const sourceVersion = source.ProfileVersion;
    return {
      format: "civilcraft.entity-manifest-review-candidate.v1",
      approval: "UNAPPROVED",
      historicalCompleteness: "NOT_ESTABLISHED",
      deploymentBinding: "NOT_ATTESTED",
      collectedAt: now().toISOString(),
      titleId: title,
      playerId: player,
      entityId: entity.Id.toUpperCase(),
      entityType: entity.Type,
      databaseId: config.databaseId,
      targetId: config.targetId,
      ledgerHash: hash,
      sourceProfileVersion:
        Number.isSafeInteger(sourceVersion) && sourceVersion >= 0 ? sourceVersion : null,
      receiptSet: snapshot,
      pendingReceiptCount: snapshot.receipts.filter((receipt) => receipt.state === "pending")
        .length,
      reviewRequired:
        "Review historical server-only provenance, archives and every retired consumer. Current empty/absent Objects or API policy alone cannot approve completeness. Pending or uncertain grants stay blocked.",
    };
  } catch {
    throw new Error(FAILURE);
  }
}

const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Reserve the explicit private path BEFORE privileged reads; no overwrite or junction alias. */
export async function reservePrivateReviewCandidate(outputPath, repository = REPOSITORY) {
  try {
    if (typeof outputPath !== "string" || !path.isAbsolute(outputPath)) throw new Error();
    const privateRoot = await realpath(path.join(repository, ".private-wallet-review"));
    const repoRoot = await realpath(repository);
    if (!samePath(privateRoot, path.join(repoRoot, ".private-wallet-review"))) throw new Error();
    const resolved = path.resolve(outputPath);
    const parent = await realpath(path.dirname(resolved));
    if (!samePath(parent, privateRoot) || path.extname(resolved).toLowerCase() !== ".json")
      throw new Error();
    const ignored = spawnSync("git", ["check-ignore", "-q", "--", resolved], {
      cwd: repository,
      stdio: "ignore",
      windowsHide: true,
    });
    if (ignored.status !== 0) throw new Error();
    const handle = await open(resolved, "wx", 0o600);
    return {
      write: async (candidate) => {
        try {
          await handle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
        } catch {
          throw new Error(FAILURE);
        }
      },
      close: async () => {
        try {
          await handle.close();
        } catch {
          /* No private filesystem diagnostics. */
        }
      },
    };
  } catch {
    throw new Error(FAILURE);
  }
}

export async function savePrivateReviewCandidate(outputPath, candidate, repository = REPOSITORY) {
  const reservation = await reservePrivateReviewCandidate(outputPath, repository);
  try {
    await reservation.write(candidate);
  } finally {
    await reservation.close();
  }
}

export function parseCollectorArguments(args) {
  if (args.length !== 4 || args[0] !== "--player" || args[2] !== "--output" || !args[1] || !args[3])
    throw new Error(FAILURE);
  return { playerId: args[1], outputPath: args[3] };
}

export async function runEntityReviewCollection({
  playerId,
  outputPath,
  collect = collectEntityReviewCandidate,
  reserve = reservePrivateReviewCandidate,
  close = closeCurrencyDatabasePool,
  writeLine = console.log,
  writeError = console.error,
} = {}) {
  let reservation;
  try {
    // Validation and exclusive reservation precede every privileged provider read.
    reservation = await reserve(outputPath);
    const candidate = await collect({ playerId });
    await reservation.write(candidate);
    writeLine(
      "Saved a private UNAPPROVED review candidate. Historical completeness and deployed target binding were NOT attested. No account import, approval, currency, SQL or flags changed.",
    );
    return 0;
  } catch {
    writeError(FAILURE);
    return 1;
  } finally {
    try {
      await reservation?.close();
    } catch {
      /* No private filesystem diagnostics. */
    }
    try {
      await close();
    } catch {
      // Closing a failed connection must not expose private provider diagnostics.
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: node --env-file=.env scripts/collect-game-wallet-entity-review.mjs --player <PlayFabId> --output <absolute private JSON path>\nRequires wallet disabled, original restricted v1 health and an existing Git-ignored .private-wallet-review directory in this repository. Uses Admin/GetUserAccountInfo and Object/GetObjects only. Never approves historical completeness, creates SQL, writes wallets, changes flags or prints account/source data.",
    );
  } else {
    try {
      process.exitCode = await runEntityReviewCollection(parseCollectorArguments(args));
    } catch {
      console.error(FAILURE);
      process.exitCode = 1;
    }
  }
}
