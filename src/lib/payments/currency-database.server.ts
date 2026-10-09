import crypto from "node:crypto";
import postgres from "postgres";
import { AdminApiError, adminGameConfig } from "../playfab/admin-client.server.ts";

export interface DatabaseWalletConfig {
  readonly storage: "postgres";
  readonly collectionId: "premium-wallet";
  readonly databaseId: string;
  /** Binds immutable orders to the physical endpoint/database, not its credentials. */
  readonly targetId: string;
  readonly schemaVersion: 1;
}

export interface DatabaseGrantInput {
  readonly orderId: string;
  readonly playFabId: string;
  readonly entity: { readonly Id: string; readonly Type: "title_player_account" };
  readonly currency: "DI" | "CO";
  readonly amount: number;
  readonly databaseId: string;
  readonly targetId: string;
  readonly schemaVersion: 1;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEX_ID = /^[a-f0-9]{1,128}$/i;
const ORDER_ID = /^[a-z0-9][a-z0-9._:-]{0,199}$/i;
const UNAVAILABLE = "Currency services are temporarily unavailable. Please try again later.";
const COIN_MAXIMUM = 2_147_483_647;
let pool: ReturnType<typeof postgres> | undefined;
let poolKey = "";

function unavailable(): AdminApiError {
  // Never expose database exceptions, SQL, connection strings or provider credentials.
  return new AdminApiError(503, UNAVAILABLE);
}

function databaseUrl(): URL {
  try {
    const url = new URL(process.env["CURRENCY_DATABASE_URL"]?.trim() || "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.pathname.length < 2 ||
      url.hash ||
      [...url.searchParams.keys()].some((key) => !["sslmode", "channel_binding"].includes(key))
    )
      throw unavailable();
    const mode = url.searchParams.get("sslmode");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      mode &&
      !["require", "verify-ca", "verify-full", ...(local ? ["disable"] : [])].includes(mode)
    )
      throw unavailable();
    return url;
  } catch {
    throw unavailable();
  }
}

export function currencyDatabaseConfig(): DatabaseWalletConfig {
  const url = databaseUrl();
  const databaseId = process.env["CURRENCY_DATABASE_ID"]?.trim().toLowerCase() || "";
  if (!UUID.test(databaseId)) throw unavailable();
  let targetId: string;
  try {
    // A cloned database can retain its installation UUID. An order must not
    // silently move to that clone merely because both metadata rows match.
    // Credentials/query options are excluded so credential rotation is safe.
    targetId = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          protocol: url.protocol,
          hostname: url.hostname.toLowerCase(),
          port: url.port || "5432",
          database: decodeURIComponent(url.pathname.slice(1)),
        }),
      )
      .digest("hex");
  } catch {
    throw unavailable();
  }
  return Object.freeze({
    storage: "postgres",
    collectionId: "premium-wallet",
    databaseId,
    targetId,
    schemaVersion: 1,
  });
}

export function currencyDatabaseVerificationFingerprint(): string {
  const wallet = currencyDatabaseConfig();
  const { titleId } = adminGameConfig();
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        titleId: titleId.toUpperCase(),
        ...wallet,
        protocol: "atomic-diamonds-permanent-coin-claims-v1",
      }),
    )
    .digest("hex");
}

export function requireCurrencyDatabaseReady(): DatabaseWalletConfig {
  const wallet = currencyDatabaseConfig();
  const { titleId } = adminGameConfig();
  if (
    process.env["CURRENCY_DATABASE_VERIFIED"]?.trim().toLowerCase() !== "true" ||
    process.env["CURRENCY_DATABASE_VERIFIED_TITLE_ID"]?.trim().toUpperCase() !==
      titleId.toUpperCase() ||
    process.env["CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256"]?.trim().toLowerCase() !==
      currencyDatabaseVerificationFingerprint()
  )
    throw new AdminApiError(503, "Currency checkout requires verified database setup.");
  return wallet;
}

function connection(): ReturnType<typeof postgres> {
  const url = databaseUrl();
  const key = crypto.createHash("sha256").update(url.href).digest("hex");
  if (pool && poolKey !== key) {
    const old = pool;
    pool = undefined;
    void old.end({ timeout: 1 }).catch(() => undefined);
  }
  if (!pool) {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // Driver options override URL options: remote TLS always verifies certificates.
    pool = postgres(url.href, {
      ssl: local ? false : { rejectUnauthorized: true },
      max: 2,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 300,
      prepare: false,
      onnotice: () => undefined,
      // PgBouncer can reject statement_timeout in the startup packet. Configure
      // the restricted login's timeout with ALTER ROLE instead of session SET,
      // which would not persist reliably through transaction-mode pooling.
      connection: { application_name: "civilcraft-currency" },
    });
    poolKey = key;
  }
  return pool;
}

export async function closeCurrencyDatabasePool(): Promise<void> {
  const closing = pool;
  pool = undefined;
  poolKey = "";
  if (closing) {
    try {
      await closing.end({ timeout: 1 });
    } catch {
      // Closing a failed connection must not reveal provider diagnostics.
    }
  }
}

/** Read-only verification is permitted before checkout flags are enabled. */
export async function assertCurrencyDatabaseHealthy(): Promise<{
  databaseId: string;
  titleId: string;
  schemaVersion: 1;
}> {
  const config = currencyDatabaseConfig();
  const titleId = adminGameConfig().titleId.toUpperCase();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.health(${config.databaseId}::uuid, ${titleId}, ${config.schemaVersion})
    `;
    if (
      rows.length !== 1 ||
      rows[0]?.["healthy"] !== true ||
      String(rows[0]?.["database_id"]).toLowerCase() !== config.databaseId ||
      rows[0]?.["title_id"] !== titleId ||
      rows[0]?.["schema_version"] !== 1
    )
      throw unavailable();
    return { databaseId: config.databaseId, titleId, schemaVersion: 1 };
  } catch {
    throw unavailable();
  }
}

function identity(playFabId: string, entity: DatabaseGrantInput["entity"]): void {
  if (
    !HEX_ID.test(playFabId) ||
    !HEX_ID.test(entity?.Id || "") ||
    entity?.Type !== "title_player_account"
  )
    throw unavailable();
}

function grantIdentity(input: DatabaseGrantInput): { titleId: string; fingerprint: string } {
  const config = requireCurrencyDatabaseReady();
  identity(input?.playFabId || "", input?.entity);
  if (
    !ORDER_ID.test(input?.orderId || "") ||
    !["CO", "DI"].includes(input?.currency) ||
    !Number.isSafeInteger(input?.amount) ||
    input.amount <= 0 ||
    (input.currency === "CO" && input.amount > COIN_MAXIMUM) ||
    input.databaseId !== config.databaseId ||
    input.targetId !== config.targetId ||
    input.schemaVersion !== config.schemaVersion
  )
    throw unavailable();
  const titleId = adminGameConfig().titleId.toUpperCase();
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        databaseId: input.databaseId,
        targetId: input.targetId,
        schemaVersion: input.schemaVersion,
        titleId,
        orderId: input.orderId,
        playFabId: input.playFabId.toUpperCase(),
        entityId: input.entity.Id.toUpperCase(),
        entityType: input.entity.Type,
        currency: input.currency,
        amount: input.amount,
      }),
    )
    .digest("hex");
  return { titleId, fingerprint };
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[0-9]+$/.test(String(value)))
    throw unavailable();
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > maximum) throw unavailable();
  return amount;
}

export async function databaseDiamondBalance(
  playFabId: string,
  entity: DatabaseGrantInput["entity"],
): Promise<number> {
  const config = requireCurrencyDatabaseReady();
  identity(playFabId, entity);
  const { titleId } = await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.diamond_balance(${config.databaseId}::uuid, ${titleId}, ${config.schemaVersion}, ${playFabId.toUpperCase()}, ${entity.Id.toUpperCase()}, ${entity.Type})
    `;
    if (rows.length !== 1) throw unavailable();
    return integer(rows[0]?.["balance"]);
  } catch {
    throw unavailable();
  }
}

export async function databaseReceiptStatus(
  input: DatabaseGrantInput,
): Promise<"absent" | "pending" | "granted"> {
  const { titleId, fingerprint } = grantIdentity(input);
  await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.receipt_status(${input.databaseId}::uuid, ${titleId}, ${input.schemaVersion}, ${input.orderId}, ${input.playFabId.toUpperCase()}, ${input.entity.Id.toUpperCase()}, ${input.entity.Type}, ${input.currency}, ${input.amount}, ${fingerprint})
    `;
    const state = rows[0]?.["state"];
    if (rows.length !== 1 || !["absent", "pending", "granted"].includes(state)) throw unavailable();
    return state;
  } catch {
    throw unavailable();
  }
}

export async function grantDatabaseDiamonds(
  input: DatabaseGrantInput,
): Promise<{ alreadyGranted: boolean; balance: number }> {
  const { titleId, fingerprint } = grantIdentity(input);
  if (input.currency !== "DI") throw unavailable();
  await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.grant_diamonds(${input.databaseId}::uuid, ${titleId}, ${input.schemaVersion}, ${input.orderId}, ${input.playFabId.toUpperCase()}, ${input.entity.Id.toUpperCase()}, ${input.entity.Type}, ${input.currency}, ${input.amount}, ${fingerprint})
    `;
    if (rows.length !== 1 || typeof rows[0]?.["already_granted"] !== "boolean") throw unavailable();
    return { alreadyGranted: rows[0]["already_granted"], balance: integer(rows[0]["balance"]) };
  } catch {
    // A committed transaction may have lost its response. Only its permanent receipt
    // proves success. An absent/uncertain read does not fabricate a grant.
    try {
      if ((await databaseReceiptStatus(input)) === "granted")
        return {
          alreadyGranted: true,
          balance: await databaseDiamondBalance(input.playFabId, input.entity),
        };
    } catch {
      // Preserve ambiguity for webhook retry; the SQL operation is idempotent.
    }
    throw unavailable();
  }
}

export async function assertDatabaseCoinCapacity(
  input: DatabaseGrantInput,
): Promise<{ pendingAmount: number }> {
  const { titleId, fingerprint } = grantIdentity(input);
  if (input.currency !== "CO") throw unavailable();
  await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.coin_capacity(${input.databaseId}::uuid, ${titleId}, ${input.schemaVersion}, ${input.orderId}, ${input.playFabId.toUpperCase()}, ${input.entity.Id.toUpperCase()}, ${input.entity.Type}, ${input.currency}, ${input.amount}, ${fingerprint})
    `;
    if (rows.length !== 1) throw unavailable();
    return { pendingAmount: integer(rows[0]?.["pending_amount"], COIN_MAXIMUM) };
  } catch {
    throw unavailable();
  }
}

export async function claimDatabaseCoins(
  input: DatabaseGrantInput,
  attemptId: string,
): Promise<boolean> {
  const { titleId, fingerprint } = grantIdentity(input);
  if (input.currency !== "CO" || !UUID.test(attemptId)) throw unavailable();
  await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.claim_coins(${input.databaseId}::uuid, ${titleId}, ${input.schemaVersion}, ${input.orderId}, ${input.playFabId.toUpperCase()}, ${input.entity.Id.toUpperCase()}, ${input.entity.Type}, ${input.currency}, ${input.amount}, ${fingerprint}, ${attemptId}::uuid)
    `;
    if (rows.length !== 1 || typeof rows[0]?.["claimed"] !== "boolean") throw unavailable();
    return rows[0]["claimed"];
  } catch {
    // Never reread a pending attempt and infer that it is safe to issue an external
    // Coin grant. A lost claim response requires support review, not a second grant.
    throw unavailable();
  }
}

export async function completeDatabaseCoins(
  input: DatabaseGrantInput,
  attemptId: string,
): Promise<void> {
  const { titleId, fingerprint } = grantIdentity(input);
  if (input.currency !== "CO" || !UUID.test(attemptId)) throw unavailable();
  await assertCurrencyDatabaseHealthy();
  try {
    const sql = connection();
    const rows = await sql`
      SELECT * FROM civilcraft_currency.complete_coins(${input.databaseId}::uuid, ${titleId}, ${input.schemaVersion}, ${input.orderId}, ${input.playFabId.toUpperCase()}, ${input.entity.Id.toUpperCase()}, ${input.entity.Type}, ${input.currency}, ${input.amount}, ${fingerprint}, ${attemptId}::uuid)
    `;
    if (rows.length !== 1 || rows[0]?.["completed"] !== true) throw unavailable();
  } catch {
    throw unavailable();
  }
}
