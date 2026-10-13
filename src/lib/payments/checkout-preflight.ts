import { normalizeProductReward } from "./products.ts";
import type { PaymentProduct } from "./types.ts";

/** Request-local bounded concurrency: no balance/eligibility caching or skipped guards. */
export async function availableCoinPackages(
  products: (PaymentProduct | null | undefined)[],
  verify: (product: PaymentProduct) => Promise<boolean>,
): Promise<string[]> {
  const candidates = products.filter((product): product is PaymentProduct => {
    try {
      return (
        !!product &&
        product.active !== false &&
        normalizeProductReward(product).rewardCurrency === "CO"
      );
    } catch {
      return false;
    }
  });
  const results = new Array<string | undefined>(candidates.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const index = cursor++;
        const product = candidates[index]!;
        try {
          if (await verify(product)) results[index] = product.id;
        } catch {
          /* Individual failures disable that package only. */
        }
      }
    }),
  );
  return [...new Set(results.filter((id): id is string => id !== undefined))];
}
