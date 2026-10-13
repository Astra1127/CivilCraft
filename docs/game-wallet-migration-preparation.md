# Other-player wallet migration: preparation and pilots

Status: preparation only. This runbook and its tools do not approve receipt history,
select a player's save, import Coins, release a hold or enable checkout. Keep main-site
Coin maintenance on, beta checkout paused, accepted beta delivery unchanged, and
existing wallet/Diamond verification and permanent records intact. Do not toggle
production wallet availability just to collect evidence.

## Scope and first pilots

Choose two explicitly identified accounts before collecting: one unused account
and one with existing game progress. Obtain the **classic PlayFab ID**, not merely
the title-player Entity ID; the collector resolves and verifies that mapping with
PlayFab. Do not enumerate or approve every account in a batch. Accounts with
uncertain historical grants, including the existing held account, remain separate
support cases. A website signup alone does not prove import eligibility.

The verified migrated account is a regression reference, not permission to reuse its
manifest, save hash, receipts, opening amount or account approval for another player.

## 1. Read-only source collection for an installed wallet

`scripts/prepare-game-wallet-migration.mjs` is an operator-only, single-account
collector. It is not an API endpoint and cannot submit a migration. The original
disabled-window collector and capability verifier retain their existing behavior.

Configure the existing restricted runtime **privately**. The new tool requires:

- Both v1 currency and v3 game-wallet installation/configuration verification.
- `COIN_FULFILLMENT_MAINTENANCE=true` and `COIN_BETA_CHECKOUT_ENABLED=false`.
- An explicit local `GAME_WALLET_ENABLED=true` or `false`; it never changes it.
- The main origin, title, installation UUID, physical-target digest and protocol
  matching a reviewed private target pin. A local pin is not live-deployment proof.

Create a credential-free JSON pin in the Git-ignored `.private-wallet-review`
directory, using values from independently reviewed deployment/Neon evidence:

```json
{
  "format": "civilcraft.game-wallet-migration-target.v1",
  "origin": "https://civil-craft.vercel.app",
  "titleId": "REVIEWED_TITLE_HEX",
  "databaseId": "REVIEWED_INSTALLATION_UUID",
  "targetId": "REVIEWED_PHYSICAL_TARGET_SHA256",
  "protocolVersion": 3
}
```

The placeholders deliberately fail validation. The pin contains no connection
string, key, session ticket, approval Boolean or individual player's authority.
Restrict private-directory access to authorized operators; do not commit candidate
files, environment files, receipt details, save snapshots or account review records.

```text
node --env-file=<private-runtime-env-path> scripts/prepare-game-wallet-migration.mjs --player <CLASSIC_PLAYFAB_ID> --binding <absolute-private-target-pin.json> --output <absolute-private-new-candidate.unapproved.json>
```

Use a new output name for every collection. The collector reserves an exclusive
private file before privileged reads. A failed attempt may leave an empty reserved
file; it is not a candidate and must never be mistaken for an approval.

Reads are limited to existing restricted v1/v3 health, the selected account's
verified Entity mapping, original Coin Entity object, and fixed `wallet_balance`,
`legacy_receipts`, `entity_manifest` functions. Database source queries run inside
a repeatable-read **READ ONLY** transaction. Known nonmutating health checks run
outside that transaction because their existing capability policy requires
`transaction_read_only=off`. Entity transport may acquire an ephemeral title token
to read Objects; it does not create a new persistent API key.

The tool does not read classic CO or selected saves, poll/repair payment orders,
contact PayMongo, dispatch arbitrary SQL/function names, acquire/release a gate,
insert a manifest, generate approval SQL, import, credit or set flags. Unrelated
Entity Objects, upstream errors, credentials and source payloads are not printed.

## 2. Interpret the packet without treating it as approval

Every packet is `UNAPPROVED`; historical completeness and deployed binding remain
unattested. PlayFab and PostgreSQL observations are not globally atomic.

| Packet observation                 | Required action                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DO_NOT_REIMPORT`                  | Account already has an imported wallet. Keep its balance/history; reconcile through existing game interfaces, never add another opening.               |
| `PENDING_RECEIPTS_REQUIRE_REVIEW`  | Stop the pilot for this account. Review the original permanent claim; never retry a grant because the current balance looks low.                       |
| `ACCOUNT_AND_SAVE_REVIEW_REQUIRED` | Finish independent history, hold and live-save review. It does **not** mean import-ready.                                                              |
| Manifest `MATCHED`                 | An existing exact-source manifest was observed. This packet grants no new approval and does not approve the selected save.                             |
| Manifest `MISSING`                 | No matching approval was returned for this exact current snapshot; an older/stale manifest may still exist.                                            |
| Manifest `MISMATCHED`              | Stop and review source/target drift. Do not rewrite an immutable manifest.                                                                             |
| `gateState=UNKNOWN`                | No restricted gate-inspection capability exists. Obtain separately audited owner READ ONLY evidence; never infer an unheld account from `ready=false`. |

Absent/empty Entity Objects, current policy denial, creation dates, classic balance,
an order's `fulfilled` label or a successful payment alone cannot prove complete
historical delivery. Review original permanent sources, unknown paid orders, manual
grants, archives, all retired consumers and any receipts that may have been replaced.
Use separately reviewed GET-only provider/history evidence when needed. Do not use
authenticated order/history endpoints as harmless audit probes: they can repair
fulfillment. Current held orders are not to be deleted, refunded or blindly retried.

## 3. Capture the selected save on the actual device

Inspect the packet and separately review the account's manifest/gate state **before
asking the player to sign in, reopen the game or refresh**. An unreviewed online game
client can automatically attempt first import whenever a matching manifest exists,
including a manifest installed before this preparation.

**Stop:** if an unimported account already has a `MATCHED` manifest, or existing
approval/hold state cannot be established, do not run an online save capture until
a separately authorized account/device freeze or import fence, or an already-reviewed
selected-save decision, is established. Do not delete/update the manifest, clear a
gate, toggle global wallet flags or reset a save to work around this. Collecting a
read-only packet does not itself impose a freeze or create a hold.

Any freeze/import fence must prevent **the selected capture client itself** from
auto-importing. Merely closing other devices does not stop that client's online
startup or refresh from submitting an import.

Only after that account-specific safety check:

1. Have the player use a genuine website/game account and the updated game.
2. Complete cloud/local save selection and conflict resolution. Preserve existing
   progress; never choose Start Fresh merely to remove review complexity.
3. Record title, classic player ID, Entity, account/session generation, settled save
   hash, local legacy gold and lifetime earned/spent counters, known/unknown wardrobe
   and contract-material IDs, completed reward IDs, reward outbox and wallet journal.
4. Record the actual guest-import choice. Guest gold is eligible only when the player
   deliberately chooses the existing guest-save import flow; declined guest progress
   must not silently become account money.
5. Review pending journal operations and queued rewards separately. Do not tombstone
   an unpaid queued reward as if it were already included in legacy gold.
6. Stop Play Mode/close the selected account on other devices before a separately
   approved manifest or import. Do not reset saves or clear queues to make them empty.

The Editor read-only checker is diagnostic evidence, not import permission. Nonempty
progress and legitimate starter ownership require review, not deletion or an automatic
failure. Android pilots need selected-save evidence from the actual intended device.

## 4. Separately approve and run a controlled migration

Preparation never executes these actions. They require explicit account-specific
approval after fresh deployed-target/consumer checks, complete receipt review,
gate inspection and selected-save review.

- Recollect changed sources into a new private packet. A stale hash cannot authorize
  the current snapshot. Review an existing manifest; never update/delete it.
- Deliberately install the exact immutable Entity completeness manifest with a
  separate authorized administrator only when the history is established.
- Under a controlled account/device window, let the existing authenticated game
  import its reviewed settled save. Import reads current classic CO under the durable
  gate and commits one opening for **classic CO + selected legacy gold**, import marker,
  covered receipts, ownership, counters and historical reward tombstones atomically.
- Reject negative or over-capacity inputs and combined Int32 overflow. Do not truncate,
  discard one source balance, reset counters or retry an uncertain monetary outcome.
- The receipt manifest is enforced server-side. The selected-save decision/hash review
  is an operational/client-selection control: the current server does not look up a
  separate preapproved save-hash record. Historical gold is client-authored; this is
  replay protection and audited migration, not anti-cheat certification.

Verify read-only afterward: the bound account is imported, exactly one opening exists
with the expected source hash and amount, coverage/ownership/counters agree, and no
unexpected payment/reward/purchase entry appeared. Zero must still create a permanent
marker. A lost response requires permanent commit proof, not another credit or blanket
gate release. Stop on uncertainty and preserve evidence.

## 5. Pilot acceptance before broader checkout

- Unused account: zero opening and legitimate starter ownership persist after retry.
- Existing save: preserve remaining gold, classic CO, ownership and counters; previously
  included rewards do not pay again, but genuinely queued unpaid rewards remain eligible.
- Another device/old save/Start Fresh cannot create a second opening or reset currency.
- Test explicit guest-import acceptance/refusal, cloud conflicts, account switching,
  expired sessions, offline earnings/reconnect, purchase timeout/restart and reconciliation.
- Verify on installed Android builds and independently concurrent devices/sessions;
  local PGlite and mocked HTTP tests do not prove those live boundaries.
- Preserve all holds and default to available **eligible, migrated players**, not every
  registered account. Broader Coin checkout and legacy settlement cutover require
  separate approval and production verification. Live payments remain off.

Run the local regression gate:

```text
npm run test:migration
```

The suite includes actual local SQL maximum/overflow/atomic rollback checks, receipt
authority, one-time import, structured JSONB driver binding and private read-only
preparation tests. It never imports a production player or pays a provider.
