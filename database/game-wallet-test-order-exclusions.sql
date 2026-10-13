-- Additive, owner-only audit mechanism for explicitly waived unversioned TEST orders.
-- Does not insert exclusions, approve a manifest, migrate a player, or grant access.
-- The existing unversioned-order rejection and retired legacy handlers MUST remain
-- in place: database triggers cannot intercept external classic PlayFab grants.
BEGIN;
CREATE TABLE civilcraft_game_wallet_v3.test_order_exclusions (
  title_id text NOT NULL REFERENCES civilcraft_game_wallet_v3.installation(title_id),
  order_id text NOT NULL CHECK(order_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  player_id text NOT NULL CHECK(player_id ~ '^[A-F0-9]{1,32}$'),
  entity_id text NOT NULL CHECK(entity_id ~ '^[A-F0-9]{1,64}$'),
  amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 2147483647),
  source_protocol integer NOT NULL CHECK(source_protocol=0),
  test_only boolean NOT NULL CHECK(test_only),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  approval text NOT NULL CHECK(length(approval) BETWEEN 16 AND 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(title_id,order_id)
);
ALTER TABLE civilcraft_game_wallet_v3.test_order_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON civilcraft_game_wallet_v3.test_order_exclusions FROM PUBLIC,civilcraft_game_wallet_app,civilcraft_currency_app;
CREATE TRIGGER immutable_test_exclusion BEFORE UPDATE OR DELETE
  ON civilcraft_game_wallet_v3.test_order_exclusions FOR EACH ROW
  EXECUTE FUNCTION civilcraft_game_wallet_v3._immutable();
CREATE TRIGGER no_truncate_test_exclusion BEFORE TRUNCATE
  ON civilcraft_game_wallet_v3.test_order_exclusions FOR EACH STATEMENT
  EXECUTE FUNCTION civilcraft_game_wallet_v3._immutable();

CREATE FUNCTION civilcraft_game_wallet_v3._check_test_exclusion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE original_order text;
BEGIN
  IF TG_TABLE_NAME='test_order_exclusions' THEN
    -- Install/register under the same locks used by credit/claim transactions.
    -- Reject conflicts even if an existing receipt belongs to a different player.
    LOCK TABLE civilcraft_currency.receipts,civilcraft_game_wallet_v3.ledger,civilcraft_game_wallet_v3.legacy_coverage IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS(SELECT 1 FROM civilcraft_currency.receipts r WHERE r.title_id=NEW.title_id AND r.order_id=NEW.order_id)
      OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.ledger l WHERE l.title_id=NEW.title_id AND l.entry_id='payment:'||NEW.order_id)
      OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.legacy_coverage c WHERE c.title_id=NEW.title_id
        AND c.order_id IN (NEW.order_id,'postgres:'||NEW.order_id,'entity-objects:'||NEW.order_id)) THEN
      RAISE EXCEPTION 'Existing receipt conflicts with TEST-order exclusion';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME='receipts' THEN
    original_order:=NEW.order_id;
  ELSIF TG_TABLE_NAME='ledger' THEN
    IF NEW.kind NOT IN ('payment','legacy') THEN RETURN NEW; END IF;
    original_order:=substring(NEW.entry_id FROM length('payment:')+1);
  ELSIF TG_TABLE_NAME='legacy_coverage' THEN
    original_order:=regexp_replace(NEW.order_id,'^(postgres:|entity-objects:)','');
  ELSE
    RAISE EXCEPTION 'Unexpected exclusion trigger target';
  END IF;
  IF EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.test_order_exclusions e
    WHERE e.title_id=NEW.title_id AND e.order_id=original_order) THEN
    RAISE EXCEPTION 'TEST order permanently excluded from automatic credit';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION civilcraft_game_wallet_v3._check_test_exclusion() FROM PUBLIC,civilcraft_game_wallet_app,civilcraft_currency_app;
CREATE TRIGGER check_test_exclusion BEFORE INSERT ON civilcraft_game_wallet_v3.test_order_exclusions
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._check_test_exclusion();
CREATE TRIGGER check_test_exclusion BEFORE INSERT OR UPDATE ON civilcraft_currency.receipts
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._check_test_exclusion();
CREATE TRIGGER check_test_exclusion BEFORE INSERT ON civilcraft_game_wallet_v3.ledger
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._check_test_exclusion();
CREATE TRIGGER check_test_exclusion BEFORE INSERT ON civilcraft_game_wallet_v3.legacy_coverage
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._check_test_exclusion();
COMMIT;
