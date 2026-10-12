-- Additive capability only. Does NOT configure a cutoff, enroll or credit players.
-- Apply once as the schema owner; never rerun the original initialization script.
BEGIN;
CREATE TABLE civilcraft_game_wallet_v3.new_account_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cutoff_at timestamptz NOT NULL CHECK(isfinite(cutoff_at)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE civilcraft_game_wallet_v3.new_account_policy ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER permanent_policy BEFORE UPDATE OR DELETE ON civilcraft_game_wallet_v3.new_account_policy
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._immutable();
REVOKE ALL ON civilcraft_game_wallet_v3.new_account_policy FROM PUBLIC,civilcraft_game_wallet_app;

CREATE FUNCTION civilcraft_game_wallet_v3.new_account_open(
  p_database uuid,p_title text,p_player text,p_entity text,p_type text,
  p_created timestamptz,p_cutoff timestamptz,p_fingerprint text)
RETURNS TABLE(coins bigint,ready boolean,version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; cutoff timestamptz;
BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  SELECT cutoff_at INTO cutoff FROM civilcraft_game_wallet_v3.new_account_policy WHERE singleton;
  IF cutoff IS NULL OR p_cutoff IS DISTINCT FROM cutoff OR cutoff>clock_timestamp()
    OR p_created IS NULL OR NOT isfinite(p_created) OR p_created<cutoff OR p_created>clock_timestamp()
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'New-account cohort unavailable or ineligible';
  END IF;
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF a.gate_owner IS NOT NULL THEN RAISE EXCEPTION 'Account remains held'; END IF;
  IF a.imported THEN RETURN QUERY SELECT a.coins,true,a.version; RETURN; END IF;
  IF a.coins<>0 OR a.version<>0 OR a.lifetime_gold_earned<>0 OR a.lifetime_gold_spent<>0
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.ledger WHERE title_id=p_title AND player_id=p_player)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.legacy_coverage WHERE title_id=p_title AND player_id=p_player)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.entity_manifests WHERE title_id=p_title AND player_id=p_player)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.entitlements WHERE title_id=p_title AND player_id=p_player)
    OR EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.operations WHERE title_id=p_title AND player_id=p_player) THEN
    RAISE EXCEPTION 'Existing account history requires review';
  END IF;
  INSERT INTO civilcraft_game_wallet_v3.ledger(title_id,entry_id,player_id,kind,amount,fingerprint,payload)
    VALUES(p_title,'opening:'||p_player,p_player,'opening',0,p_fingerprint,
      jsonb_build_object('source','new-account-zero','titleCreatedAt',p_created,'cutoffAt',cutoff));
  UPDATE civilcraft_game_wallet_v3.accounts SET imported=true,version=1
    WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT 0::bigint,true,1::bigint;
END $$;
REVOKE ALL ON FUNCTION civilcraft_game_wallet_v3.new_account_open(uuid,text,text,text,text,timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION civilcraft_game_wallet_v3.new_account_open(uuid,text,text,text,text,timestamptz,timestamptz,text) TO civilcraft_game_wallet_app;
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
      AND c.relname IN ('installation','accounts','ledger','legacy_coverage','entity_manifests','entitlements','operations','shop_links','new_account_policy'))=9
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3' AND pg_has_role(session_user,p.proowner,'MEMBER'))
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.oid IN (
        to_regprocedure('civilcraft_game_wallet_v3.health(uuid,text,integer)'),
        to_regprocedure('civilcraft_game_wallet_v3.new_account_open(uuid,text,text,text,text,timestamptz,timestamptz,text)'),
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
      AND has_function_privilege(session_user,p.oid,'EXECUTE'))=17
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.oid NOT IN (
        to_regprocedure('civilcraft_game_wallet_v3.health(uuid,text,integer)'),
        to_regprocedure('civilcraft_game_wallet_v3.new_account_open(uuid,text,text,text,text,timestamptz,timestamptz,text)'),
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
      WHERE n.nspname='civilcraft_game_wallet_v3' AND t.tgname IN ('permanent_account','permanent_history','permanent_policy') AND t.tgenabled='O')=9;
  RETURN QUERY SELECT ok,p_database,p_title,3;
END $$;
COMMIT;
