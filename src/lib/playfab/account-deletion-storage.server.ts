import fs from "node:fs/promises";
import path from "node:path";
import { AdminApiError } from "./admin-client.server.ts";

export type DeletionStatus = "pending" | "processing" | "completed" | "failed";

export interface AccountDeletionRecord {
  playFabId: string;
  status: DeletionStatus;
  requestedAt: string;
  startedAt?: string | undefined;
  jobReceiptId?: string | undefined;
  queuedAt?: string | undefined;
  completedAt?: string | undefined;
  failedAt?: string | undefined;
  error?: string | undefined;
  stepsCompleted: string[];
  affectedTitleIds: string[];
  pseudonymizedIdentifier: string;
  lockedAt?: string | undefined;
  lockedBy?: string | undefined;
  recoveryNote?: string | undefined;
  updatedAt: string;
}

const DEFAULT_FILE_STORAGE_PATH = path.resolve(process.cwd(), ".data/account-deletions.json");

function getStorageFilePath(): string {
  return process.env["ACCOUNT_DELETIONS_FILE"]?.trim() || DEFAULT_FILE_STORAGE_PATH;
}

// In-memory fallback map for local development and unit tests only
const memoryStore = new Map<string, AccountDeletionRecord>();

/**
 * Determines whether production storage enforcement is active.
 *
 * In production (Vercel serverless functions, NODE_ENV=production), ephemeral local files
 * and in-memory maps are NOT shared or persisted across instances.
 * Production mode REQUIRES an external durable database (PostgreSQL).
 */
export function isProductionStorageRequired(): boolean {
  if (process.env["CIVILCRAFT_FORCE_PRODUCTION_STORAGE"] === "true") return true;
  if (process.env["CIVILCRAFT_ALLOW_LOCAL_STORAGE"] === "true") return false;
  return (
    process.env["NODE_ENV"] === "production" ||
    process.env["VERCEL"] === "1" ||
    process.env["VERCEL_ENV"] === "production"
  );
}

/**
 * Resets storage for test execution.
 */
export async function resetDeletionStorageForTesting(): Promise<void> {
  memoryStore.clear();
  const filePath = getStorageFilePath();
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore if not found */
  }
}

/**
 * Loads the local JSON file store (strictly for local development / testing).
 */
async function loadFileStore(): Promise<Map<string, AccountDeletionRecord>> {
  if (isProductionStorageRequired()) {
    throw new AdminApiError(
      503,
      "Local file storage cannot be accessed in production. External durable database is required.",
    );
  }

  const filePath = getStorageFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(raw) as Record<string, AccountDeletionRecord>;
    const map = new Map<string, AccountDeletionRecord>();
    for (const [k, v] of Object.entries(json)) {
      if (v && typeof v.playFabId === "string") {
        map.set(k.toUpperCase(), v);
      }
    }
    return map;
  } catch {
    return new Map(memoryStore);
  }
}

/**
 * Atomically saves to the local JSON file store (strictly for local development / testing).
 */
async function persistToFile(map: Map<string, AccountDeletionRecord>): Promise<void> {
  if (isProductionStorageRequired()) {
    throw new AdminApiError(
      503,
      "Local file storage cannot be persisted in production. External durable database is required.",
    );
  }

  const filePath = getStorageFilePath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const obj: Record<string, AccountDeletionRecord> = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v;
  }

  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/**
 * Checks whether PostgreSQL database storage URL is configured.
 */
export function isPostgresConfigured(): boolean {
  const url =
    process.env["ACCOUNT_DELETIONS_DATABASE_URL"]?.trim() ||
    process.env["CURRENCY_DATABASE_URL"]?.trim() ||
    process.env["DATABASE_URL"]?.trim();
  return Boolean(url && (url.startsWith("postgres://") || url.startsWith("postgresql://")));
}

function getDatabaseUrl(): string | null {
  const url =
    process.env["ACCOUNT_DELETIONS_DATABASE_URL"]?.trim() ||
    process.env["CURRENCY_DATABASE_URL"]?.trim() ||
    process.env["DATABASE_URL"]?.trim();
  if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
    return url;
  }
  return null;
}

let initPromise: Promise<void> | null = null;
let pgTableInitialized = false;

function sanitizeDbError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/postgres(ql)?:\/\/[^@]+@/gi, "postgres://***:***@");
  }
  return "Unknown database error";
}

async function getPostgresClient() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return null;
  const { default: postgres } = await import("postgres");
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });

  if (!pgTableInitialized) {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          await sql`
            CREATE TABLE IF NOT EXISTS civilcraft_website_account_deletions (
              playfab_id VARCHAR(64) PRIMARY KEY,
              status VARCHAR(32) NOT NULL,
              requested_at TIMESTAMPTZ NOT NULL,
              started_at TIMESTAMPTZ,
              job_receipt_id VARCHAR(128),
              queued_at TIMESTAMPTZ,
              completed_at TIMESTAMPTZ,
              failed_at TIMESTAMPTZ,
              error TEXT,
              steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_title_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
              pseudonymized_identifier VARCHAR(64) NOT NULL,
              locked_at TIMESTAMPTZ,
              locked_by VARCHAR(128),
              recovery_note TEXT,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `;
          await sql`
            CREATE INDEX IF NOT EXISTS idx_civilcraft_deletions_receipt 
            ON civilcraft_website_account_deletions (job_receipt_id);
          `;
          // Ensure columns exist if migrating from earlier schema
          await sql`
            ALTER TABLE civilcraft_website_account_deletions 
            ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS locked_by VARCHAR(128),
            ADD COLUMN IF NOT EXISTS recovery_note TEXT;
          `;
          pgTableInitialized = true;
        } catch (e) {
          console.warn(
            "[account/storage] Failed to initialize Postgres deletions table:",
            sanitizeDbError(e),
          );
          if (isProductionStorageRequired()) {
            throw new AdminApiError(503, "Durable database table initialization failed.");
          }
        } finally {
          initPromise = null;
        }
      })();
    }
    await initPromise;
  }

  return sql;
}

/**
 * Health check: Verifies that durable external storage is available.
 * In production, fails closed with 503 if PostgreSQL is not configured or unavailable.
 */
export async function verifyStorageHealth(): Promise<{ ok: boolean; storageType: string }> {
  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) {
      throw new AdminApiError(
        503,
        "Durable external database storage is required in production but CURRENCY_DATABASE_URL is not configured. Account deletion rejected.",
      );
    }

    try {
      const sql = await getPostgresClient();
      if (!sql) {
        throw new AdminApiError(503, "Unable to establish durable database connection.");
      }
      try {
        await sql`SELECT 1 as health_check`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      return { ok: true, storageType: "postgres" };
    } catch (err) {
      console.error("[account/storage] Production database health check failed:", err);
      throw new AdminApiError(
        503,
        "Durable external storage is currently unreachable. Account deletion rejected to prevent data loss.",
      );
    }
  }

  // Development/Test mode
  if (isPostgresConfigured()) {
    try {
      const sql = await getPostgresClient();
      if (sql) {
        try {
          await sql`SELECT 1 as health_check`;
          return { ok: true, storageType: "postgres" };
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    } catch {
      // Fall through to local file/memory in dev mode
    }
  }

  return { ok: true, storageType: "local_dev_storage" };
}

/**
 * Maps a Postgres row into an AccountDeletionRecord.
 */
function rowToRecord(r: Record<string, unknown>): AccountDeletionRecord {
  return {
    playFabId: String(r["playfab_id"]),
    status: String(r["status"]) as DeletionStatus,
    requestedAt: new Date(r["requested_at"] as string | number | Date).toISOString(),
    startedAt: r["started_at"]
      ? new Date(r["started_at"] as string | number | Date).toISOString()
      : undefined,
    jobReceiptId: r["job_receipt_id"] ? String(r["job_receipt_id"]) : undefined,
    queuedAt: r["queued_at"]
      ? new Date(r["queued_at"] as string | number | Date).toISOString()
      : undefined,
    completedAt: r["completed_at"]
      ? new Date(r["completed_at"] as string | number | Date).toISOString()
      : undefined,
    failedAt: r["failed_at"]
      ? new Date(r["failed_at"] as string | number | Date).toISOString()
      : undefined,
    error: r["error"] ? String(r["error"]) : undefined,
    stepsCompleted: Array.isArray(r["steps_completed"]) ? (r["steps_completed"] as string[]) : [],
    affectedTitleIds: Array.isArray(r["affected_title_ids"])
      ? (r["affected_title_ids"] as string[])
      : [],
    pseudonymizedIdentifier: String(r["pseudonymized_identifier"]),
    lockedAt: r["locked_at"]
      ? new Date(r["locked_at"] as string | number | Date).toISOString()
      : undefined,
    lockedBy: r["locked_by"] ? String(r["locked_by"]) : undefined,
    recoveryNote: r["recovery_note"] ? String(r["recovery_note"]) : undefined,
    updatedAt: new Date(r["updated_at"] as string | number | Date).toISOString(),
  };
}

/**
 * Retrieves a deletion record by PlayFab ID from durable website storage.
 * Does NOT depend on PlayFab player data.
 * In production, fails closed if Postgres is unavailable.
 */
export async function getDeletionRecord(playFabId: string): Promise<AccountDeletionRecord | null> {
  if (!playFabId || typeof playFabId !== "string") return null;
  const cleanId = playFabId.trim().toUpperCase();

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) {
      throw new AdminApiError(
        503,
        "Durable database is required in production but not configured.",
      );
    }
    try {
      const sql = await getPostgresClient();
      if (!sql) throw new AdminApiError(503, "Database client unavailable.");
      try {
        const rows = await sql`
          SELECT * FROM civilcraft_website_account_deletions
          WHERE UPPER(playfab_id) = ${cleanId}
          LIMIT 1
        `;
        if (rows.length > 0) {
          return rowToRecord(rows[0] as unknown as Record<string, unknown>);
        }
        return null;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (err) {
      if (err instanceof AdminApiError) throw err;
      console.error("[account/storage] Postgres lookup error in production:", err);
      throw new AdminApiError(503, "Durable database read failure.");
    }
  }

  // Non-production: check Postgres if configured, else fallback to file/memory
  if (isPostgresConfigured()) {
    try {
      const sql = await getPostgresClient();
      if (sql) {
        try {
          const rows = await sql`
            SELECT * FROM civilcraft_website_account_deletions
            WHERE UPPER(playfab_id) = ${cleanId}
            LIMIT 1
          `;
          if (rows.length > 0) {
            return rowToRecord(rows[0] as unknown as Record<string, unknown>);
          }
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    } catch (err) {
      console.warn("[account/storage] Dev Postgres lookup error, checking local store:", err);
    }
  }

  const fileStore = await loadFileStore();
  return fileStore.get(cleanId) ?? memoryStore.get(cleanId) ?? null;
}

/**
 * Retrieves a deletion record by PlayFab JobReceiptId from durable website storage.
 */
export async function getDeletionRecordByReceiptId(
  receiptId: string,
): Promise<AccountDeletionRecord | null> {
  if (!receiptId || typeof receiptId !== "string") return null;
  const cleanReceipt = receiptId.trim();

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) {
      throw new AdminApiError(
        503,
        "Durable database is required in production but not configured.",
      );
    }
    try {
      const sql = await getPostgresClient();
      if (!sql) throw new AdminApiError(503, "Database client unavailable.");
      try {
        const rows = await sql`
          SELECT * FROM civilcraft_website_account_deletions
          WHERE job_receipt_id = ${cleanReceipt}
          LIMIT 1
        `;
        if (rows.length > 0) {
          return rowToRecord(rows[0] as unknown as Record<string, unknown>);
        }
        return null;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (err) {
      if (err instanceof AdminApiError) throw err;
      console.error("[account/storage] Postgres receipt lookup error in production:", err);
      throw new AdminApiError(503, "Durable database read failure.");
    }
  }

  // Non-production fallback
  if (isPostgresConfigured()) {
    try {
      const sql = await getPostgresClient();
      if (sql) {
        try {
          const rows = await sql`
            SELECT * FROM civilcraft_website_account_deletions
            WHERE job_receipt_id = ${cleanReceipt}
            LIMIT 1
          `;
          if (rows.length > 0) {
            return rowToRecord(rows[0] as unknown as Record<string, unknown>);
          }
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    } catch (err) {
      console.warn("[account/storage] Dev Postgres receipt lookup error:", err);
    }
  }

  const fileStore = await loadFileStore();
  for (const record of fileStore.values()) {
    if (record.jobReceiptId === cleanReceipt) return record;
  }
  for (const record of memoryStore.values()) {
    if (record.jobReceiptId === cleanReceipt) return record;
  }
  return null;
}

/**
 * Saves or updates a deletion record in durable website storage.
 * In production, writes directly to PostgreSQL and fails closed if write fails.
 */
export async function saveDeletionRecord(record: AccountDeletionRecord): Promise<void> {
  if (!record?.playFabId) return;
  const cleanId = record.playFabId.trim().toUpperCase();
  const normalized: AccountDeletionRecord = {
    ...record,
    playFabId: cleanId,
    updatedAt: new Date().toISOString(),
  };

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) {
      throw new AdminApiError(
        503,
        "Durable database is required in production but CURRENCY_DATABASE_URL is not configured.",
      );
    }
    try {
      const sql = await getPostgresClient();
      if (!sql) throw new AdminApiError(503, "Database client unavailable.");
      try {
        await sql`
          INSERT INTO civilcraft_website_account_deletions (
            playfab_id, status, requested_at, started_at, job_receipt_id,
            queued_at, completed_at, failed_at, error, steps_completed,
            affected_title_ids, pseudonymized_identifier, locked_at, locked_by,
            recovery_note, updated_at
          ) VALUES (
            ${cleanId},
            ${normalized.status},
            ${normalized.requestedAt},
            ${normalized.startedAt ?? null},
            ${normalized.jobReceiptId ?? null},
            ${normalized.queuedAt ?? null},
            ${normalized.completedAt ?? null},
            ${normalized.failedAt ?? null},
            ${normalized.error ?? null},
            ${sql.json(normalized.stepsCompleted)},
            ${sql.json(normalized.affectedTitleIds)},
            ${normalized.pseudonymizedIdentifier},
            ${normalized.lockedAt ?? null},
            ${normalized.lockedBy ?? null},
            ${normalized.recoveryNote ?? null},
            ${normalized.updatedAt}
          )
          ON CONFLICT (playfab_id) DO UPDATE SET
            status = EXCLUDED.status,
            started_at = COALESCE(EXCLUDED.started_at, civilcraft_website_account_deletions.started_at),
            job_receipt_id = COALESCE(EXCLUDED.job_receipt_id, civilcraft_website_account_deletions.job_receipt_id),
            queued_at = COALESCE(EXCLUDED.queued_at, civilcraft_website_account_deletions.queued_at),
            completed_at = COALESCE(EXCLUDED.completed_at, civilcraft_website_account_deletions.completed_at),
            failed_at = EXCLUDED.failed_at,
            error = EXCLUDED.error,
            steps_completed = EXCLUDED.steps_completed,
            affected_title_ids = EXCLUDED.affected_title_ids,
            pseudonymized_identifier = EXCLUDED.pseudonymized_identifier,
            locked_at = EXCLUDED.locked_at,
            locked_by = EXCLUDED.locked_by,
            recovery_note = EXCLUDED.recovery_note,
            updated_at = EXCLUDED.updated_at
        `;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (err) {
      if (err instanceof AdminApiError) throw err;
      console.error("[account/storage] Production Postgres save error:", err);
      throw new AdminApiError(503, "Durable database write failure.");
    }
    return;
  }

  // Non-production: memory store + optional Postgres + file store
  memoryStore.set(cleanId, normalized);

  if (isPostgresConfigured()) {
    try {
      const sql = await getPostgresClient();
      if (sql) {
        try {
          await sql`
            INSERT INTO civilcraft_website_account_deletions (
              playfab_id, status, requested_at, started_at, job_receipt_id,
              queued_at, completed_at, failed_at, error, steps_completed,
              affected_title_ids, pseudonymized_identifier, locked_at, locked_by,
              recovery_note, updated_at
            ) VALUES (
              ${cleanId},
              ${normalized.status},
              ${normalized.requestedAt},
              ${normalized.startedAt ?? null},
              ${normalized.jobReceiptId ?? null},
              ${normalized.queuedAt ?? null},
              ${normalized.completedAt ?? null},
              ${normalized.failedAt ?? null},
              ${normalized.error ?? null},
              ${sql.json(normalized.stepsCompleted)},
              ${sql.json(normalized.affectedTitleIds)},
              ${normalized.pseudonymizedIdentifier},
              ${normalized.lockedAt ?? null},
              ${normalized.lockedBy ?? null},
              ${normalized.recoveryNote ?? null},
              ${normalized.updatedAt}
            )
            ON CONFLICT (playfab_id) DO UPDATE SET
              status = EXCLUDED.status,
              started_at = COALESCE(EXCLUDED.started_at, civilcraft_website_account_deletions.started_at),
              job_receipt_id = COALESCE(EXCLUDED.job_receipt_id, civilcraft_website_account_deletions.job_receipt_id),
              queued_at = COALESCE(EXCLUDED.queued_at, civilcraft_website_account_deletions.queued_at),
              completed_at = COALESCE(EXCLUDED.completed_at, civilcraft_website_account_deletions.completed_at),
              failed_at = EXCLUDED.failed_at,
              error = EXCLUDED.error,
              steps_completed = EXCLUDED.steps_completed,
              affected_title_ids = EXCLUDED.affected_title_ids,
              pseudonymized_identifier = EXCLUDED.pseudonymized_identifier,
              locked_at = EXCLUDED.locked_at,
              locked_by = EXCLUDED.locked_by,
              recovery_note = EXCLUDED.recovery_note,
              updated_at = EXCLUDED.updated_at
          `;
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    } catch (err) {
      console.warn("[account/storage] Dev Postgres save error, falling back to local file:", err);
    }
  }

  try {
    const fileStore = await loadFileStore();
    fileStore.set(cleanId, normalized);
    await persistToFile(fileStore);
  } catch (err) {
    console.warn("[account/storage] Dev file store error:", err);
  }
}

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Acquires a durable deletion lock across server instances.
 * Returns true if the lock was successfully acquired, false if held by another active process.
 */
export async function acquireDeletionLock(playFabId: string, instanceId: string): Promise<boolean> {
  const cleanId = playFabId.trim().toUpperCase();
  const now = new Date();
  const nowIso = now.toISOString();

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) {
      throw new AdminApiError(503, "Durable database is required to acquire deletion lock.");
    }
    const sql = await getPostgresClient();
    if (!sql) throw new AdminApiError(503, "Database client unavailable.");
    try {
      // Atomic lock acquisition: only lock if unlocked, locked by this instance, or lock lease expired
      const rows = await sql`
        UPDATE civilcraft_website_account_deletions
        SET locked_at = ${nowIso}, locked_by = ${instanceId}, updated_at = ${nowIso}
        WHERE UPPER(playfab_id) = ${cleanId}
          AND (
            locked_at IS NULL 
            OR locked_at < NOW() - INTERVAL '5 minutes'
            OR locked_by = ${instanceId}
          )
        RETURNING playfab_id
      `;
      return rows.length > 0;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  // Non-production: in-memory / file check
  let record = (await loadFileStore()).get(cleanId) ?? memoryStore.get(cleanId);
  if (!record) {
    record = {
      playFabId: cleanId,
      status: "pending",
      requestedAt: nowIso,
      stepsCompleted: [],
      affectedTitleIds: [],
      pseudonymizedIdentifier: `PSEUDO_LOCK_${cleanId}`,
      lockedAt: nowIso,
      lockedBy: instanceId,
      updatedAt: nowIso,
    };
    memoryStore.set(cleanId, record);
    return true;
  }

  if (record.lockedAt && record.lockedBy && record.lockedBy !== instanceId) {
    const lockAge = Date.now() - new Date(record.lockedAt).getTime();
    if (lockAge < LOCK_TTL_MS) {
      return false; // Active lock held by another instance
    }
  }

  record.lockedAt = nowIso;
  record.lockedBy = instanceId;
  record.updatedAt = nowIso;
  await saveDeletionRecord(record);
  return true;
}

/**
 * Releases a durable deletion lock.
 */
export async function releaseDeletionLock(playFabId: string, instanceId: string): Promise<void> {
  const cleanId = playFabId.trim().toUpperCase();
  const nowIso = new Date().toISOString();

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) return;
    try {
      const sql = await getPostgresClient();
      if (!sql) return;
      try {
        await sql`
          UPDATE civilcraft_website_account_deletions
          SET locked_at = NULL, locked_by = NULL, updated_at = ${nowIso}
          WHERE UPPER(playfab_id) = ${cleanId}
            AND (locked_by = ${instanceId} OR locked_at < NOW() - INTERVAL '5 minutes')
        `;
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (e) {
      console.warn("[account/storage] Failed to release Postgres lock:", e);
    }
    return;
  }

  const record = (await loadFileStore()).get(cleanId) ?? memoryStore.get(cleanId);
  if (record && (record.lockedBy === instanceId || !record.lockedBy)) {
    record.lockedAt = undefined;
    record.lockedBy = undefined;
    await saveDeletionRecord(record);
  }
}

/**
 * Renews an actively held deletion lock lease.
 * Fails (returns false) if the lock was stolen, expired and reclaimed,
 * or lost to another server instance. Acts as a fencing check.
 */
export async function renewDeletionLock(playFabId: string, instanceId: string): Promise<boolean> {
  const cleanId = playFabId.trim().toUpperCase();
  const nowIso = new Date().toISOString();

  if (isProductionStorageRequired()) {
    if (!isPostgresConfigured()) return false;
    const sql = await getPostgresClient();
    if (!sql) return false;
    try {
      const rows = await sql`
        UPDATE civilcraft_website_account_deletions
        SET locked_at = ${nowIso}, updated_at = ${nowIso}
        WHERE UPPER(playfab_id) = ${cleanId}
          AND locked_by = ${instanceId}
        RETURNING playfab_id
      `;
      return rows.length > 0;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  // Non-production: check local/memory store
  const record = (await loadFileStore()).get(cleanId) ?? memoryStore.get(cleanId);
  if (!record || record.lockedBy !== instanceId) {
    return false;
  }
  record.lockedAt = nowIso;
  record.updatedAt = nowIso;
  await saveDeletionRecord(record);
  return true;
}

/**
 * Checks whether an account is deleted, undergoing deletion,
 * or locked due to incomplete/failed cleanup.
 *
 * Security policy blocks access for:
 * - "completed": Account is permanently deleted
 * - "processing": Deletion is actively running in PlayFab
 * - "pending": Deletion lifecycle has started and cleanup is underway
 * - "failed": Deletion failed or cleanup is incomplete (account must remain locked)
 */
export async function isAccountDeleted(playFabId: string): Promise<boolean> {
  if (!playFabId || typeof playFabId !== "string") return false;
  try {
    const record = await getDeletionRecord(playFabId);
    if (!record) return false;
    return (
      record.status === "completed" ||
      record.status === "processing" ||
      record.status === "pending" ||
      record.status === "failed"
    );
  } catch {
    // In production, if database is unreachable, fail closed: do not permit access!
    if (isProductionStorageRequired()) {
      return true;
    }
    return false;
  }
}
