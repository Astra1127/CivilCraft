import { createHmac } from "node:crypto";
import type { AdminAuthConfig } from "./config.server.ts";

interface Bucket {
  attempts: number;
  expires: number;
}
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 1024;
/** Bounded, best-effort per-instance limiter. Restarts and other instances have independent limits. */
export function limitLoginAttempts(config: AdminAuthConfig, email: string): number {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.expires <= now) buckets.delete(key);
  const scope = createHmac("sha256", config.sessionSecret).update(config.origin).digest("hex");
  const identity = createHmac("sha256", config.sessionSecret).update(email).digest("hex");
  const increment = (key: string, seconds: number, limit: number) => {
    let value = buckets.get(key);
    if (!value) {
      if (buckets.size >= MAX_BUCKETS) return 60;
      value = { attempts: 0, expires: now + seconds * 1000 };
      buckets.set(key, value);
    }
    value.attempts++;
    return value.attempts > limit ? Math.ceil((value.expires - now) / 1000) : 0;
  };
  return Math.max(increment(scope + ":all", 60, 30), increment(scope + ":" + identity, 900, 5));
}
