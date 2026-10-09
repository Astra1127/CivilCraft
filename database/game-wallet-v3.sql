-- ADDITIVE migration, PostgreSQL 14+. Review/run once as migration administrator.
-- Never rerun currency-schema.sql, reset wallets, or alter the v1 installation.
-- No money is imported by this DDL. All enable/verification flags remain off.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'civilcraft_game_wallet_v3') THEN
    RAISE EXCEPTION 'Game wallet v3 already exists; use a reviewed additive migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'civilcraft_currency') THEN
    RAISE EXCEPTION 'Existing v1 currency installation required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civilcraft_game_wallet_app') THEN
    CREATE ROLE civilcraft_game_wallet_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA civilcraft_game_wallet_v3;
REVOKE ALL ON SCHEMA civilcraft_game_wallet_v3 FROM PUBLIC;
GRANT USAGE ON SCHEMA civilcraft_game_wallet_v3 TO civilcraft_game_wallet_app;
CREATE TABLE civilcraft_game_wallet_v3.installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  database_id uuid NOT NULL,
  title_id text NOT NULL UNIQUE,
  protocol_version integer NOT NULL CHECK(protocol_version = 3)
);
INSERT INTO civilcraft_game_wallet_v3.installation(database_id,title_id,protocol_version)
  SELECT database_id,title_id,3 FROM civilcraft_currency.installation WHERE singleton;
DO $$ BEGIN
  IF (SELECT count(*) FROM civilcraft_game_wallet_v3.installation) <> 1 THEN
    RAISE EXCEPTION 'Exactly one existing installation required';
  END IF;
END $$;
CREATE TABLE civilcraft_game_wallet_v3.accounts (
  title_id text NOT NULL REFERENCES civilcraft_game_wallet_v3.installation(title_id),
  player_id text NOT NULL CHECK(player_id ~ '^[A-F0-9]{1,32}$'),
  entity_id text NOT NULL CHECK(entity_id ~ '^[A-F0-9]{1,64}$'),
  entity_type text NOT NULL CHECK(entity_type = 'title_player_account'),
  coins bigint NOT NULL DEFAULT 0 CHECK(coins BETWEEN 0 AND 2147483647),
  imported boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 0 CHECK(version >= 0),
  lifetime_gold_earned bigint NOT NULL DEFAULT 0 CHECK(lifetime_gold_earned BETWEEN 0 AND 2147483647),
  lifetime_gold_spent bigint NOT NULL DEFAULT 0 CHECK(lifetime_gold_spent BETWEEN 0 AND 2147483647),
  gate_owner uuid,
  gate_reason text,
  PRIMARY KEY(title_id,player_id),
  CHECK((gate_owner IS NULL) = (gate_reason IS NULL))
);
CREATE TABLE civilcraft_game_wallet_v3.ledger (
  title_id text NOT NULL,
  entry_id text NOT NULL CHECK(length(entry_id) BETWEEN 1 AND 250),
  player_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('opening','payment','legacy','reward','purchase','tombstone')),
  amount bigint NOT NULL CHECK(amount BETWEEN -2147483647 AND 2147483647),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(title_id,entry_id),
  FOREIGN KEY(title_id,player_id) REFERENCES civilcraft_game_wallet_v3.accounts
);
CREATE TABLE civilcraft_game_wallet_v3.legacy_coverage (
  title_id text NOT NULL, order_id text NOT NULL, player_id text NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(title_id,order_id),
  FOREIGN KEY(title_id,player_id) REFERENCES civilcraft_game_wallet_v3.accounts
);
CREATE TABLE civilcraft_game_wallet_v3.entitlements (
  title_id text NOT NULL, player_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('cosmetic','material')), target_key text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(title_id,player_id,kind,target_key),
  FOREIGN KEY(title_id,player_id) REFERENCES civilcraft_game_wallet_v3.accounts
);
CREATE TABLE civilcraft_game_wallet_v3.operations (
  title_id text NOT NULL, operation_id uuid NOT NULL, player_id text NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), result jsonb NOT NULL,
  PRIMARY KEY(title_id,operation_id),
  FOREIGN KEY(title_id,player_id) REFERENCES civilcraft_game_wallet_v3.accounts
);
CREATE TABLE civilcraft_game_wallet_v3.shop_links (
  title_id text NOT NULL REFERENCES civilcraft_game_wallet_v3.installation(title_id),
  token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  player_id text NOT NULL CHECK(player_id ~ '^[A-F0-9]{1,32}$'),
  currency text NOT NULL CHECK(currency IN ('coins','diamonds')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(title_id,token_hash)
);
CREATE FUNCTION civilcraft_game_wallet_v3._immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Wallet history and identity are permanent'; END $$;
CREATE FUNCTION civilcraft_game_wallet_v3._protect_account() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.title_id,NEW.player_id,NEW.entity_id,NEW.entity_type)
    IS DISTINCT FROM (OLD.title_id,OLD.player_id,OLD.entity_id,OLD.entity_type)
    OR (OLD.imported AND NOT NEW.imported) OR NEW.version < OLD.version
    OR NEW.lifetime_gold_earned < OLD.lifetime_gold_earned OR NEW.lifetime_gold_spent < OLD.lifetime_gold_spent THEN
    RAISE EXCEPTION 'Wallet identity and import marker are permanent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_account BEFORE UPDATE OR DELETE ON civilcraft_game_wallet_v3.accounts
  FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._protect_account();
DO $$ DECLARE n text; BEGIN
  FOREACH n IN ARRAY ARRAY['installation','ledger','legacy_coverage','entitlements','operations','shop_links'] LOOP
    EXECUTE format('CREATE TRIGGER permanent_history BEFORE UPDATE OR DELETE ON civilcraft_game_wallet_v3.%I FOR EACH ROW EXECUTE FUNCTION civilcraft_game_wallet_v3._immutable()',n);
  END LOOP;
  FOREACH n IN ARRAY ARRAY['installation','accounts','ledger','legacy_coverage','entitlements','operations','shop_links'] LOOP
    EXECUTE format('ALTER TABLE civilcraft_game_wallet_v3.%I ENABLE ROW LEVEL SECURITY',n);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA civilcraft_game_wallet_v3 FROM PUBLIC,civilcraft_game_wallet_app;
CREATE FUNCTION civilcraft_game_wallet_v3._identity(p_database uuid,p_title text,p_player text,p_entity text,p_type text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.installation WHERE database_id=p_database AND title_id=p_title AND protocol_version=3)
    OR p_player IS NULL OR p_player !~ '^[A-F0-9]{1,32}$' OR p_entity IS NULL OR p_entity !~ '^[A-F0-9]{1,64}$'
    OR p_type IS DISTINCT FROM 'title_player_account' THEN RAISE EXCEPTION 'Wallet installation or identity mismatch'; END IF;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3._account(p_database uuid,p_title text,p_player text,p_entity text,p_type text)
RETURNS civilcraft_game_wallet_v3.accounts LANGUAGE plpgsql SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  INSERT INTO civilcraft_game_wallet_v3.accounts(title_id,player_id,entity_id,entity_type)
    VALUES(p_title,p_player,p_entity,p_type) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT a FROM civilcraft_game_wallet_v3.accounts WHERE title_id=p_title AND player_id=p_player FOR UPDATE;
  IF a.entity_id<>p_entity OR a.entity_type<>p_type THEN RAISE EXCEPTION 'Wallet entity mismatch'; END IF;
  RETURN a;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.health(p_database uuid,p_title text,p_version integer)
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
      AND c.relname IN ('installation','accounts','ledger','legacy_coverage','entitlements','operations','shop_links'))=7
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3' AND pg_has_role(session_user,p.proowner,'MEMBER'))
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.proname IN ('health','wallet_balance','gate_acquire','gate_release','import_wallet','credit','receipt','reward','purchase','reject_purchase','purchase_status','entitlements','link_issue','link_read')
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, civilcraft_game_wallet_v3, pg_temp']
      AND has_function_privilege(session_user,p.oid,'EXECUTE'))=14
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='civilcraft_game_wallet_v3'
      AND p.proname NOT IN ('health','wallet_balance','gate_acquire','gate_release','import_wallet','credit','receipt','reward','purchase','reject_purchase','purchase_status','entitlements','link_issue','link_read')
      AND has_function_privilege(session_user,p.oid,'EXECUTE'))
    AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE n.nspname='civilcraft_game_wallet_v3' AND x.grantee=0 AND x.privilege_type='EXECUTE')
    AND NOT EXISTS(SELECT 1 FROM pg_namespace n,LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x
      WHERE n.nspname='civilcraft_game_wallet_v3' AND x.grantee=0 AND x.privilege_type IN ('USAGE','CREATE'))
    AND (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='civilcraft_game_wallet_v3' AND t.tgname IN ('permanent_account','permanent_history') AND t.tgenabled='O')=7;
  RETURN QUERY SELECT ok,p_database,p_title,3;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.wallet_balance(p_database uuid,p_title text,p_player text,p_entity text,p_type text)
RETURNS TABLE(coins bigint,ready boolean,version bigint,lifetime_gold_earned bigint,lifetime_gold_spent bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  SELECT * INTO a FROM civilcraft_game_wallet_v3.accounts WHERE title_id=p_title AND player_id=p_player;
  IF FOUND AND (a.entity_id<>p_entity OR a.entity_type<>p_type) THEN RAISE EXCEPTION 'Wallet entity mismatch'; END IF;
  RETURN QUERY SELECT CASE WHEN a.imported THEN a.coins ELSE NULL END,COALESCE(a.imported,false),COALESCE(a.version,0),
    CASE WHEN a.imported THEN a.lifetime_gold_earned ELSE NULL END,CASE WHEN a.imported THEN a.lifetime_gold_spent ELSE NULL END;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.gate_acquire(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_owner uuid,p_reason text)
RETURNS TABLE(acquired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF p_owner IS NULL OR p_reason NOT IN ('import','legacy') THEN RAISE EXCEPTION 'Invalid gate'; END IF;
  IF a.gate_owner IS NOT NULL THEN RETURN QUERY SELECT false; RETURN; END IF;
  UPDATE civilcraft_game_wallet_v3.accounts SET gate_owner=p_owner,gate_reason=p_reason WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT true;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.gate_release(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_owner uuid)
RETURNS TABLE(released boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF a.gate_owner IS DISTINCT FROM p_owner OR p_owner IS NULL THEN RAISE EXCEPTION 'Gate ownership mismatch'; END IF;
  UPDATE civilcraft_game_wallet_v3.accounts SET gate_owner=NULL,gate_reason=NULL WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT true;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.import_wallet(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_owner uuid,p_gold bigint,p_classic bigint,p_hash text,p_covered jsonb,p_rewards jsonb,p_entitlements jsonb,p_earned bigint DEFAULT 0,p_spent bigint DEFAULT 0)
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
    INSERT INTO civilcraft_game_wallet_v3.legacy_coverage VALUES(p_title,x->>'orderId',p_player,x->>'fingerprint');
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
CREATE FUNCTION civilcraft_game_wallet_v3.credit(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_order text,p_amount bigint,p_fingerprint text,p_kind text)
RETURNS TABLE(already_granted boolean,covered boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; l civilcraft_game_wallet_v3.ledger; c civilcraft_game_wallet_v3.legacy_coverage; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF p_order IS NULL OR length(p_order) NOT BETWEEN 1 AND 200 OR p_amount IS NULL OR p_amount<=0 OR p_amount>2147483647
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_kind NOT IN ('payment','legacy') THEN RAISE EXCEPTION 'Invalid credit'; END IF;
  IF p_kind='legacy' THEN
    SELECT * INTO c FROM civilcraft_game_wallet_v3.legacy_coverage WHERE title_id=p_title AND order_id=p_order;
    IF FOUND THEN
      IF c.player_id<>p_player OR c.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Legacy receipt identity mismatch'; END IF;
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
CREATE FUNCTION civilcraft_game_wallet_v3.receipt(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_order text,p_amount bigint,p_fingerprint text)
RETURNS TABLE(granted boolean,covered boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE l civilcraft_game_wallet_v3.ledger; c civilcraft_game_wallet_v3.legacy_coverage; BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  SELECT * INTO c FROM civilcraft_game_wallet_v3.legacy_coverage WHERE title_id=p_title AND order_id=p_order;
  IF FOUND THEN
    IF c.player_id<>p_player OR c.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Receipt identity mismatch'; END IF;
    RETURN QUERY SELECT true,true; RETURN;
  END IF;
  SELECT * INTO l FROM civilcraft_game_wallet_v3.ledger WHERE title_id=p_title AND entry_id='payment:'||p_order;
  IF FOUND AND (l.player_id<>p_player OR l.amount<>p_amount OR l.fingerprint<>p_fingerprint) THEN RAISE EXCEPTION 'Receipt identity mismatch'; END IF;
  RETURN QUERY SELECT FOUND,false;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.reward(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_key text,p_amount bigint,p_fingerprint text,p_payload jsonb)
RETURNS TABLE(already_granted boolean,coins bigint,version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; l civilcraft_game_wallet_v3.ledger; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF NOT a.imported THEN RAISE EXCEPTION 'Wallet import required'; END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 200 OR p_amount IS NULL OR p_amount<0 OR p_amount>2147483647
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid reward'; END IF;
  SELECT * INTO l FROM civilcraft_game_wallet_v3.ledger WHERE title_id=p_title AND entry_id='reward:'||p_player||':'||p_key;
  IF FOUND THEN
    -- Canonical first completion wins, even when another valid device's evidence differs.
    -- The server validates every incoming formula/quote before this call. Never rewrite the first receipt.
    IF l.player_id<>p_player OR l.kind NOT IN ('reward','tombstone') THEN RAISE EXCEPTION 'Reward identity mismatch'; END IF;
    RETURN QUERY SELECT true,a.coins,a.version; RETURN;
  END IF;
  IF a.coins>2147483647-p_amount OR a.lifetime_gold_earned>2147483647-p_amount THEN RAISE EXCEPTION 'Coin capacity exceeded'; END IF;
  INSERT INTO civilcraft_game_wallet_v3.ledger VALUES(p_title,'reward:'||p_player||':'||p_key,p_player,'reward',p_amount,p_fingerprint,p_payload,clock_timestamp());
  UPDATE civilcraft_game_wallet_v3.accounts SET coins=a.coins+p_amount,version=a.version+1,lifetime_gold_earned=a.lifetime_gold_earned+p_amount WHERE title_id=p_title AND player_id=p_player;
  RETURN QUERY SELECT false,a.coins+p_amount,a.version+1;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.purchase(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_operation uuid,p_fingerprint text,p_kind text,p_key text,p_price bigint,p_payload jsonb)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; o civilcraft_game_wallet_v3.operations; r jsonb; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF NOT a.imported THEN RAISE EXCEPTION 'Wallet import required'; END IF;
  IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_kind NOT IN ('cosmetic','material')
    OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 250 OR p_price IS NULL OR p_price<0 OR p_price>2147483647 OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid purchase'; END IF;
  SELECT * INTO o FROM civilcraft_game_wallet_v3.operations WHERE title_id=p_title AND operation_id=p_operation;
  IF FOUND THEN
    IF o.player_id<>p_player OR o.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Operation identity mismatch'; END IF;
    RETURN QUERY SELECT o.result; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.entitlements WHERE title_id=p_title AND player_id=p_player AND kind=p_kind AND target_key=p_key) THEN
    r:=jsonb_build_object('operationId',p_operation,'status','already-owned','coins',a.coins,'version',a.version,'entitlement',p_payload);
  ELSIF a.coins<p_price THEN
    r:=jsonb_build_object('operationId',p_operation,'status','rejected','reason','insufficient-coins','coins',a.coins,'version',a.version);
  ELSE
    IF a.lifetime_gold_spent>2147483647-p_price THEN RAISE EXCEPTION 'Spending counter capacity exceeded'; END IF;
    INSERT INTO civilcraft_game_wallet_v3.entitlements VALUES(p_title,p_player,p_kind,p_key,p_payload);
    INSERT INTO civilcraft_game_wallet_v3.ledger VALUES(p_title,'purchase:'||p_operation,p_player,'purchase',-p_price,p_fingerprint,p_payload,clock_timestamp());
    UPDATE civilcraft_game_wallet_v3.accounts SET coins=a.coins-p_price,version=a.version+1,lifetime_gold_spent=a.lifetime_gold_spent+p_price WHERE title_id=p_title AND player_id=p_player;
    r:=jsonb_build_object('operationId',p_operation,'status','fulfilled','coins',a.coins-p_price,'version',a.version+1,'entitlement',p_payload);
  END IF;
  INSERT INTO civilcraft_game_wallet_v3.operations VALUES(p_title,p_operation,p_player,p_fingerprint,r);
  RETURN QUERY SELECT r;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.purchase_status(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_operation uuid)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  RETURN QUERY SELECT o.result FROM civilcraft_game_wallet_v3.operations o WHERE o.title_id=p_title AND o.player_id=p_player AND o.operation_id=p_operation;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.reject_purchase(p_database uuid,p_title text,p_player text,p_entity text,p_type text,p_operation uuid,p_fingerprint text)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE a civilcraft_game_wallet_v3.accounts; o civilcraft_game_wallet_v3.operations; r jsonb; BEGIN
  a:=civilcraft_game_wallet_v3._account(p_database,p_title,p_player,p_entity,p_type);
  IF NOT a.imported THEN RAISE EXCEPTION 'Wallet import required'; END IF;
  IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid rejection'; END IF;
  SELECT * INTO o FROM civilcraft_game_wallet_v3.operations WHERE title_id=p_title AND operation_id=p_operation;
  IF FOUND THEN
    IF o.player_id<>p_player THEN RAISE EXCEPTION 'Operation identity mismatch'; END IF;
    RETURN QUERY SELECT o.result; RETURN;
  END IF;
  r:=jsonb_build_object('operationId',p_operation,'status','rejected','reason','invalid-catalog','coins',a.coins,'version',a.version);
  INSERT INTO civilcraft_game_wallet_v3.operations VALUES(p_title,p_operation,p_player,p_fingerprint,r);
  RETURN QUERY SELECT r;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.entitlements(p_database uuid,p_title text,p_player text,p_entity text,p_type text)
RETURNS TABLE(kind text,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  PERFORM civilcraft_game_wallet_v3._identity(p_database,p_title,p_player,p_entity,p_type);
  RETURN QUERY SELECT e.kind,e.payload FROM civilcraft_game_wallet_v3.entitlements e WHERE e.title_id=p_title AND e.player_id=p_player ORDER BY e.kind,e.target_key;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.link_issue(p_database uuid,p_title text,p_player text,p_token text,p_currency text)
RETURNS TABLE(expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
DECLARE expiry timestamptz:=clock_timestamp()+interval '60 minutes'; BEGIN
  IF NOT EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.installation WHERE database_id=p_database AND title_id=p_title)
    OR p_player IS NULL OR p_player !~ '^[A-F0-9]{1,32}$' OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_currency NOT IN ('coins','diamonds') THEN RAISE EXCEPTION 'Invalid shop link'; END IF;
  INSERT INTO civilcraft_game_wallet_v3.shop_links VALUES(p_title,p_token,p_player,p_currency,expiry);
  RETURN QUERY SELECT expiry;
END $$;
CREATE FUNCTION civilcraft_game_wallet_v3.link_read(p_database uuid,p_title text,p_token text)
RETURNS TABLE(player_id text,currency text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,civilcraft_game_wallet_v3,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM civilcraft_game_wallet_v3.installation WHERE database_id=p_database AND title_id=p_title) THEN RAISE EXCEPTION 'Wallet installation mismatch'; END IF;
  RETURN QUERY SELECT l.player_id,l.currency,l.expires_at FROM civilcraft_game_wallet_v3.shop_links l WHERE l.title_id=p_title AND l.token_hash=p_token;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA civilcraft_game_wallet_v3 FROM PUBLIC,civilcraft_game_wallet_app;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='civilcraft_game_wallet_v3' AND p.prosecdef LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO civilcraft_game_wallet_app',r.signature);
  END LOOP;
END $$;
COMMIT;
