-- Reviewed ADDITIVE upgrade for an UNUSED original v3 capability.
-- Never run against an imported/money-bearing v3 wallet: authority backfill needs a separate reviewed migration.
-- Preserves v1 installation/receipts and all original v3 tables/data. Does not enable flags.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='civilcraft_game_wallet_v3') THEN
    RAISE EXCEPTION 'Existing v3 capability required; use fresh game-wallet-v3.sql otherwise';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civilcraft_game_wallet_v3' AND c.relname='entity_manifests') THEN
    RAISE EXCEPTION 'Receipt authority capability already upgraded; do not rerun';
  END IF;
  -- Held until COMMIT: old workers cannot create money after the unused-state check.
  LOCK TABLE civilcraft_game_wallet_v3.accounts, civilcraft_game_wallet_v3.ledger,
    civilcraft_game_wallet_v3.legacy_coverage, civilcraft_game_wallet_v3.operations,
    civilcraft_game_wallet_v3.entitlements IN ACCESS EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.accounts WHERE imported)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.accounts WHERE gate_owner IS NOT NULL)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.ledger)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.legacy_coverage) THEN
    RAISE EXCEPTION 'Existing wallet money/history requires reviewed permanent-authority backfill; upgrade refused without changing data';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.installation g JOIN civilcraft_currency.installation c
    ON c.database_id=g.database_id AND c.title_id=g.title_id WHERE g.protocol_version=3 AND c.schema_version=1) THEN
    RAISE EXCEPTION 'Original installation binding mismatch';
  END IF;
END $$;
ALTER TABLE civilcraft_game_wallet_v3.legacy_coverage
  ADD COLUMN provider text NOT NULL CHECK(provider IN ('postgres','entity-objects')),
  ADD COLUMN entity_id text NOT NULL CHECK(entity_id ~ '^[A-F0-9]{1,64}$'),
  ADD COLUMN amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 2147483647),
  ADD COLUMN original_fingerprint text NOT NULL CHECK(original_fingerprint ~ '^[a-f0-9]{64}$');
CREATE TABLE civilcraft_game_wallet_v3.entity_manifests (
  title_id text NOT NULL REFERENCES civilcraft_game_wallet_v3.installation(title_id),
  player_id text NOT NULL CHECK(player_id ~ '^[A-F0-9]{1,32}$'),
  entity_id text NOT NULL CHECK(entity_id ~ '^[A-F0-9]{1,64}$'),
  target_id text NOT NULL CHECK(target_id ~ '^[a-f0-9]{64}$'),
  ledger_hash text NOT NULL CHECK(ledger_hash ~ '^[a-f0-9]{64}$'),
  receipt_set jsonb NOT NULL CHECK(jsonb_typeof(receipt_set)='object'),
  approved_by text NOT NULL CHECK(length(approved_by) BETWEEN 8 AND 200),
  completeness_evidence text NOT NULL CHECK(length(completeness_evidence) BETWEEN 16 AND 4000),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(title_id,player_id,entity_id,target_id,ledger_hash)
);
ALTER TABLE civilcraft_game_wallet_v3.entity_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON civilcraft_game_wallet_v3.entity_manifests FROM PUBLIC,civilcraft_game_wallet_app;
CREATE TRIGGER permanent_history BEFORE UPDATE OR DELETE ON civilcraft_game_wallet_v3.entity_manifests
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._immutable();
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.health(p_database uuid,p_title text,p_version integer)
RETURNS TABLE(healthy boolean,database_id uuid,title_id text,protocol_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE ok boolean; BEGIN
  IF p_version<>3 OR NOT EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.installation i WHERE i.database_id=p_database AND i.title_id=p_title) THEN
    RAISE EXCEPTION 'Wallet installation mismatch'; END IF;
  ok := NOT EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER') AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))
    AND NOT pg_is_in_recovery() AND current_setting('transaction_read_only')='off'
    AND has_schema_privilege(session_user,'civilcraft_game_wallet_v3','USAGE')
    AND NOT has_schema_privilege(session_user,'civilcraft_game_wallet_v3','CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR pg_has_role(session_user,c.relowner,'MEMBER')
      OR has_table_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='civilcraft_game_wallet_v3' AND c.relkind='r'
      AND c.relname IN ('installation','accounts','ledger','legacy_coverage','entity_manifests','entitlements','operations','shop_links'))=8
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3' AND pg_has_role(session_user,p.proowner,'MEMBER'))
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.oid IN (
        to_regprocedure('civilcraft_game_wallet_v3.health(uuid,text,integer)'),
        to_regprocedure('civilcraft_game_wallet_v3.wallet_balance(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.gate_acquire(uuid,text,text,text,text,uuid,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.gate_release(uuid,text,text,text,text,uuid)'),
        to_regprocedure('civilcraft_game_wallet_v3.import_wallet(uuid,text,text,text,text,uuid,bigint,bigint,text,jsonb,jsonb,jsonb,bigint,bigint)'),
        to_regprocedure('civilcraft_game_wallet_v3.credit(uuid,text,text,text,text,text,bigint,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.receipt(uuid,text,text,text,text,text,bigint,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.reward(uuid,text,text,text,text,text,bigint,text,jsonb)'),
        to_regprocedure('civilcraft_game_wallet_v3.purchase(uuid,text,text,text,text,uuid,text,text,text,bigint,jsonb)'),
        to_regprocedure('civilcraft_game_wallet_v3.reject_purchase(uuid,text,text,text,text,uuid,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.purchase_status(uuid,text,text,text,text,uuid)'),
        to_regprocedure('civilcraft_game_wallet_v3.entitlements(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.link_issue(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.link_read(uuid,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.legacy_receipts(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.entity_manifest(uuid,text,text,text,text,text,text)'))
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, civilcraft_game_wallet_v3, pg_temp']
      AND has_function_privilege(session_user,p.oid,'EXECUTE'))=16
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.oid NOT IN (
        to_regprocedure('civilcraft_game_wallet_v3.health(uuid,text,integer)'),
        to_regprocedure('civilcraft_game_wallet_v3.wallet_balance(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.gate_acquire(uuid,text,text,text,text,uuid,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.gate_release(uuid,text,text,text,text,uuid)'),
        to_regprocedure('civilcraft_game_wallet_v3.import_wallet(uuid,text,text,text,text,uuid,bigint,bigint,text,jsonb,jsonb,jsonb,bigint,bigint)'),
        to_regprocedure('civilcraft_game_wallet_v3.credit(uuid,text,text,text,text,text,bigint,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.receipt(uuid,text,text,text,text,text,bigint,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.reward(uuid,text,text,text,text,text,bigint,text,jsonb)'),
        to_regprocedure('civilcraft_game_wallet_v3.purchase(uuid,text,text,text,text,uuid,text,text,text,bigint,jsonb)'),
        to_regprocedure('civilcraft_game_wallet_v3.reject_purchase(uuid,text,text,text,text,uuid,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.purchase_status(uuid,text,text,text,text,uuid)'),
        to_regprocedure('civilcraft_game_wallet_v3.entitlements(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.link_issue(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.link_read(uuid,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.legacy_receipts(uuid,text,text,text,text)'),
        to_regprocedure('civilcraft_game_wallet_v3.entity_manifest(uuid,text,text,text,text,text,text)'))
      AND has_function_privilege(session_user,p.oid,'EXECUTE'))
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE n.nspname='civilcraft_game_wallet_v3' AND x.grantee=0 AND x.privilege_type='EXECUTE')
    AND NOT EXISTS(SELECT 1 FROM pg_namespace n,LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x
      WHERE n.nspname='civilcraft_game_wallet_v3' AND x.grantee=0 AND x.privilege_type IN ('USAGE','CREATE'))
    AND (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='civilcraft_game_wallet_v3' AND t.tgname IN ('permanent_account','permanent_history') AND t.tgenabled='O')=8;
  RETURN QUERY SELECT ok,p_database,p_title,3;
END $$;
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.import_wallet(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_owner uuid,p_gold bigint,p_classic bigint,p_hash text,p_covered jsonb,p_rewards jsonb,p_entitlements jsonb,p_earned bigint DEFAULT 0,p_spent bigint DEFAULT 0)
RETURNS TABLE(coins bigint,ready boolean,version bigint,already_imported boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; x jsonb; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF a.imported THEN RETURN QUERY SELECT a.coins,true,a.version,true; RETURN; END IF;
  IF a.gate_owner IS DISTINCT FROM p_owner OR a.gate_reason<>'import' OR p_owner IS NULL THEN RAISE EXCEPTION 'Import gate required'; END IF;
  IF p_gold IS NULL OR p_classic IS NULL OR p_gold<0 OR p_classic<0 OR p_gold+p_classic>2147483647-a.coins
    OR p_earned IS NULL OR p_spent IS NULL OR p_earned NOT BETWEEN 0 AND 2147483647 OR p_spent NOT BETWEEN 0 AND 2147483647
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_covered)<>'array' OR jsonb_typeof(p_rewards)<>'array' OR jsonb_typeof(p_entitlements)<>'array' THEN RAISE EXCEPTION 'Invalid import'; END IF;
  INSERT INTO civilcraft_game_wallet_v3.ledger VALUES(p_title,'opening:'||p_player,p_player,'opening',p_gold+p_classic,p_hash,
    jsonb_build_object('gold',p_gold,'classic',p_classic,'saveHash',p_hash),clock_timestamp());
  FOR x IN SELECT value FROM jsonb_array_elements(p_covered) LOOP
    IF x->>'entityId' IS DISTINCT FROM p_entity THEN RAISE EXCEPTION 'Coverage entity mismatch'; END IF;
    INSERT INTO civilcraft_game_wallet_v3.legacy_coverage VALUES(p_title,x->>'orderId',p_player,x->>'fingerprint',
      x->>'provider',p_entity,(x->>'amount')::bigint,x->>'originalFingerprint');
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(p_rewards) LOOP
    INSERT INTO civilcraft_game_wallet_v3.ledger VALUES(p_title,'reward:'||p_player||':'||(x->>'key'),p_player,'tombstone',0,x->>'fingerprint',x,clock_timestamp()) ON CONFLICT DO NOTHING;
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(p_entitlements) LOOP
    INSERT INTO civilcraft_game_wallet_v3.entitlements VALUES(p_title,p_player,x->>'kind',x->>'targetKey',x->'payload') ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE civilcraft_game_wallet_v3.accounts SET coins=a.coins+p_gold+p_classic,imported=true,version=a.version+1,lifetime_gold_earned=p_earned,lifetime_gold_spent=p_spent WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT a.coins+p_gold+p_classic,true,a.version+1,false;
END $$;
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.credit(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_order text,p_amount bigint,p_fingerprint text,p_kind text,p_receipt_key text)
RETURNS TABLE(already_granted boolean,covered boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; l civilcraft_game_wallet_v3.ledger; c civilcraft_game_wallet_v3.legacy_coverage; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF p_order IS NULL OR length(p_order) NOT BETWEEN 1 AND 200 OR p_amount IS NULL OR p_amount<=0 OR p_amount>2147483647
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_kind NOT IN ('payment','legacy') THEN RAISE EXCEPTION 'Invalid credit'; END IF;
  IF p_kind='legacy' THEN
    IF p_receipt_key IS NULL OR length(p_receipt_key) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Permanent source receipt key required'; END IF;
    SELECT * INTO c FROM civilcraft_game_wallet_v3.legacy_coverage WHERE title_id=p_title AND order_id=p_receipt_key;
    IF FOUND THEN
      IF c.player_id<>p_player OR c.entity_id<>p_entity OR c.amount<>p_amount OR c.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Legacy receipt identity mismatch'; END IF;
      RETURN QUERY SELECT true,true; RETURN;
    END IF;
    -- Before opening, the classic grant will be included in the snapshot. No PG overlay yet.
    IF NOT a.imported THEN RETURN QUERY SELECT false,false; RETURN; END IF;
  ELSE
    IF NOT a.imported THEN RAISE EXCEPTION 'Wallet import required'; END IF;
  END IF;
  SELECT * INTO l FROM civilcraft_game_wallet_v3.ledger WHERE title_id=p_title AND entry_id='payment:'||p_order;
  IF FOUND THEN
    IF l.player_id<>p_player OR l.kind<>p_kind OR l.amount<>p_amount OR l.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Receipt identity mismatch'; END IF;
    RETURN QUERY SELECT true,false; RETURN;
  END IF;
  IF a.coins>2147483647-p_amount THEN RAISE EXCEPTION 'Coin capacity exceeded'; END IF;
  INSERT INTO civilcraft_game_wallet_v3.ledger VALUES(p_title,'payment:'||p_order,p_player,p_kind,p_amount,p_fingerprint,'{}',clock_timestamp());
  UPDATE civilcraft_game_wallet_v3.accounts SET coins=a.coins+p_amount,version=a.version+1 WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT false,false;
END $$;
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.receipt(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_order text,p_amount bigint,p_fingerprint text)
RETURNS TABLE(granted boolean,covered boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE l civilcraft_game_wallet_v3.ledger; BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  SELECT * INTO l FROM civilcraft_game_wallet_v3.ledger WHERE title_id=p_title AND entry_id='payment:'||p_order;
  IF FOUND AND (l.player_id<>p_player OR l.amount<>p_amount OR l.fingerprint<>p_fingerprint) THEN RAISE EXCEPTION 'Receipt identity mismatch'; END IF;
  RETURN QUERY SELECT FOUND,false;
END $$;
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.legacy_receipts(p_database uuid,p_title text,p_player text,p_entity text,p_type text)
RETURNS TABLE(order_id text,player_id text,entity_id text,entity_type text,currency text,amount bigint,original_fingerprint text,state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  IF NOT EXISTS(SELECT 1 FROM civilcraft_currency.installation i WHERE i.database_id=p_database AND i.title_id=p_title AND i.schema_version=1) THEN
    RAISE EXCEPTION 'Original receipt installation mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM civilcraft_currency.receipts r WHERE r.title_id=p_title AND r.player_id=p_player AND r.currency='CO'
    AND (r.entity_id<>p_entity OR r.entity_type<>p_type)) THEN RAISE EXCEPTION 'Original receipt entity mismatch'; END IF;
  RETURN QUERY SELECT r.order_id,r.player_id,r.entity_id,r.entity_type,r.currency,r.amount,r.fingerprint,r.state
    FROM civilcraft_currency.receipts r WHERE r.title_id=p_title AND r.player_id=p_player AND r.currency='CO' ORDER BY r.order_id;
END $$;
CREATE OR REPLACE FUNCTION civilcraft_game_wallet_v3.entity_manifest(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_target text,p_hash text)
RETURNS TABLE(ledger_hash text,receipt_set jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  RETURN QUERY SELECT m.ledger_hash,m.receipt_set FROM civilcraft_game_wallet_v3.entity_manifests m
    WHERE m.title_id=p_title AND m.player_id=p_player AND m.entity_id=p_entity AND m.target_id=p_target AND m.ledger_hash=p_hash;
END $$;
-- The old nine-argument credit routine is retained for history/inspection but must never be executable.
REVOKE ALL ON FUNCTION civilcraft_game_wallet_v3.credit(uuid,text,text,text,text,text,bigint,text,text)
  FROM PUBLIC,civilcraft_game_wallet_app;
REVOKE ALL ON FUNCTION civilcraft_game_wallet_v3.credit(uuid,text,text,text,text,text,bigint,text,text,text),
  civilcraft_game_wallet_v3.legacy_receipts(uuid,text,text,text,text),
  civilcraft_game_wallet_v3.entity_manifest(uuid,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION civilcraft_game_wallet_v3.credit(uuid,text,text,text,text,text,bigint,text,text,text),
  civilcraft_game_wallet_v3.legacy_receipts(uuid,text,text,text,text),
  civilcraft_game_wallet_v3.entity_manifest(uuid,text,text,text,text,text,text) TO civilcraft_game_wallet_app;
COMMIT;
