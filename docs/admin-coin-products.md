# Admin-created Coin products (TEST checkout)

Create or edit a product in Admin → Products. Select Coins, enter a positive whole
Coin quantity and a PHP price, leave Active enabled, and save. Refresh the player
shop to reload the catalog and checkout availability. No code deployment is needed
for subsequent valid product additions or edits.

- Eligible shared-wallet players can purchase active currency products. Legacy
  unmigrated accounts remain excluded, and existing wallet/account guards apply.
- Inactive, missing, malformed, or non-currency products cannot start Coin checkout.
- Prices are stored in centavos. Price and Coin quantity must be positive integers
  within the existing product schema limits. Browser-supplied monetary values are
  never used; the server reads the saved admin product.
- New cohort orders use Coin binding version 2 to freeze product ID, price,
  quantity, account, and wallet destination. The wallet protocol remains version 3.
- Editing, disabling, or deleting a product does not change an accepted order's
  reward or prevent a verified paid order from settling. New orders use current
  catalog values; permanent receipts prevent repeat delivery.
- Historical binding version 1 keeps its fixed package validation and original
  fingerprint. Do not rewrite old orders or receipts.
- All purchases remain PayMongo TEST-only. This does not activate live payments
  or alter Diamond checkout.

To stop new cohort orders globally, disable `COIN_COHORT_TEST_CHECKOUT_ENABLED` and
redeploy while retaining delivery for accepted orders. A rollback to code without
version-2 binding support cannot settle newly accepted catalog orders; retain the
compatible settlement code even when checkout is paused.
