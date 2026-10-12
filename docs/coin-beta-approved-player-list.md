# Additional approved TEST players

Implementation only; checkout stays closed. No players are enrolled by this file.

`COIN_BETA_ADDITIONAL_ACCOUNTS` is a server-only JSON array, default `[]`, maximum
32 entries / 16,384 characters. Each entry has exactly these fields:

```json
[
  {
    "scopeId": "example-reviewed-pilot",
    "playerId": "ABC789",
    "entityId": "FACE789",
    "checkoutEnabled": false,
    "deliveryEnabled": false
  }
]
```

The example identities are fictional. Use reviewed classic player and title-player
Entity IDs in uppercase. Scope IDs, players and entities must be unique, including
against the original and second scopes. Boolean permissions must be actual JSON
booleans. Missing, malformed, oversized or overlapping lists reject additional
players; they do not change the original two scopes or their accepted deliveries.

The existing global checkout/delivery settings, absolute 30-minute maximum window,
main origin, TEST-only provider and 500-Coin product restrictions still apply.
An entry does not approve a migration: checkout still resolves the authenticated
Entity and requires a migrated wallet. Existing migration holds are not cleared.

To close an additional player's checkout, retain the same identity/scope and set
`checkoutEnabled:false`. Keep `deliveryEnabled:true` for previously accepted orders.
Do not remove, rotate or repurpose accepted entries: their immutable orders depend
on them for late delivery. A malformed list also blocks its accepted deliveries
until corrected, so validate configuration before deployment. Original scope
compatibility and order binding format remain unchanged.

Before activation, privately configure the reviewed cohort with checkout closed,
review deployment and database binding, and approve a separate TEST window.
Keep global Coin fulfillment maintenance enabled to fence unrelated legacy orders.
This is bounded cohort support, not unrestricted checkout or live payments.

## Local verification (2026-10-12)

- Coin beta suite: 124 passed.
- Currency regression suite: 483 passed.
- Migration suite: 125 passed, 1 skipped.
- TypeScript check, production build, formatting and diff whitespace checks passed.

The added integration test uses fictional players and a local SQL fixture. It
checks unmigrated-player rejection, owner isolation, unpaid checkout, duplicate
payment delivery and audit-write recovery after checkout closes. These results
do not enroll real players, verify a deployment or authorize a payment window.
