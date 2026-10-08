-- Civil Craft currency storage, PostgreSQL 14+.
-- Run ONCE as a migration administrator, never with the runtime connection.
-- Existing PlayFab wallets/receipts are NOT imported or reset by this migration.
-- Receipts never expire and must not be pruned, deleted, or reused.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'civilcraft_currency') THEN
    RAISE EXCEPTION 'Currency schema already exists; use a reviewed migration, not reinitialization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civilcraft_currency_app') THEN
    CREATE ROLE civilcraft_currency_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA civilcraft_currency;
REVOKE ALL ON SCHEMA civilcraft_currency FROM PUBLIC;
GRANT USAGE ON SCHEMA civilcraft_currency TO civilcraft_currency_app;

CREATE TABLE civilcraft_currency.installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  database_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title_id text NOT NULL CHECK (title_id ~ '^[A-F0-9]{1,16}$'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  protocol text NOT NULL CHECK (protocol = 'atomic-diamonds-permanent-coin-claims-v1')
);
-- Change this title ONLY before the first installation, if using another test title.
INSERT INTO civilcraft_currency.installation(singleton, title_id, schema_version, protocol)
VALUES (true, '17FA03', 1, 'atomic-diamonds-permanent-coin-claims-v1');
ALTER TABLE civilcraft_currency.installation ADD CONSTRAINT installation_title_unique UNIQUE(title_id);

CREATE TABLE civilcraft_currency.accounts (
  title_id text NOT NULL,
  player_id text NOT NULL CHECK (player_id ~ '^[A-F0-9]{1,128}$'),
  entity_id text NOT NULL CHECK (entity_id ~ '^[A-F0-9]{1,128}$'),
  entity_type text NOT NULL CHECK (entity_type = 'title_player_account'),
  diamond_balance bigint NOT NULL DEFAULT 0 CHECK (diamond_balance BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (title_id, player_id),
  FOREIGN KEY (title_id) REFERENCES civilcraft_currency.installation(title_id)
);

-- One global order namespace across both currencies and every player.
CREATE TABLE civilcraft_currency.receipts (
  title_id text NOT NULL,
  order_id text NOT NULL CHECK (order_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  player_id text NOT NULL,
  entity_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type = 'title_player_account'),
  currency text NOT NULL CHECK (currency IN ('DI', 'CO')),
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991 AND (currency <> 'CO' OR amount <= 2147483647)),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  attempt_id uuid,
  state text NOT NULL CHECK (state IN ('pending', 'granted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (title_id, order_id),
  FOREIGN KEY (title_id, player_id) REFERENCES civilcraft_currency.accounts(title_id, player_id),
  CHECK ((currency = 'DI' AND state = 'granted' AND attempt_id IS NULL) OR (currency = 'CO' AND attempt_id IS NOT NULL))
);
CREATE INDEX coin_pending_by_account ON civilcraft_currency.receipts(title_id, player_id)
  WHERE currency = 'CO' AND state = 'pending';

-- No direct browser/player access; runtime receives EXECUTE only, not table rights.
ALTER TABLE civilcraft_currency.installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE civilcraft_currency.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE civilcraft_currency.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA civilcraft_currency FROM PUBLIC, civilcraft_currency_app;

CREATE FUNCTION civilcraft_currency._protect_installation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN RAISE EXCEPTION 'Currency installation identity is immutable'; END $$;
CREATE TRIGGER immutable_installation BEFORE UPDATE OR DELETE ON civilcraft_currency.installation
FOR EACH ROW EXECUTE FUNCTION civilcraft_currency._protect_installation();

CREATE FUNCTION civilcraft_currency._protect_account() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Currency accounts must not be deleted'; END IF;
  IF (NEW.title_id, NEW.player_id, NEW.entity_id, NEW.entity_type) IS DISTINCT FROM
     (OLD.title_id, OLD.player_id, OLD.entity_id, OLD.entity_type) OR NEW.diamond_balance < OLD.diamond_balance THEN
    RAISE EXCEPTION 'Currency account identity and credited balance are permanent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_account BEFORE UPDATE OR DELETE ON civilcraft_currency.accounts
FOR EACH ROW EXECUTE FUNCTION civilcraft_currency._protect_account();

CREATE FUNCTION civilcraft_currency._protect_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Purchase receipts must never be deleted'; END IF;
  IF (NEW.title_id, NEW.order_id, NEW.player_id, NEW.entity_id, NEW.entity_type, NEW.currency,
      NEW.amount, NEW.fingerprint, NEW.attempt_id, NEW.created_at) IS DISTINCT FROM
     (OLD.title_id, OLD.order_id, OLD.player_id, OLD.entity_id, OLD.entity_type, OLD.currency,
      OLD.amount, OLD.fingerprint, OLD.attempt_id, OLD.created_at) OR
     NOT (NEW.state = OLD.state OR (OLD.currency = 'CO' AND OLD.state = 'pending' AND NEW.state = 'granted')) THEN
    RAISE EXCEPTION 'Purchase receipt is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_receipt BEFORE UPDATE OR DELETE ON civilcraft_currency.receipts
FOR EACH ROW EXECUTE FUNCTION civilcraft_currency._protect_receipt();

CREATE FUNCTION civilcraft_currency._require_installation(p_database uuid, p_title text, p_version integer)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM civilcraft_currency.installation i WHERE i.singleton
    AND i.database_id = p_database AND i.title_id = p_title AND i.schema_version = p_version
    AND i.protocol = 'atomic-diamonds-permanent-coin-claims-v1') THEN
    RAISE EXCEPTION 'Currency installation mismatch';
  END IF;
END $$;

CREATE FUNCTION civilcraft_currency._require_identity(p_title text, p_player text, p_entity text, p_type text)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  IF p_player IS NULL OR p_entity IS NULL OR p_type IS DISTINCT FROM 'title_player_account'
    OR p_player !~ '^[A-F0-9]{1,128}$' OR p_entity !~ '^[A-F0-9]{1,128}$' THEN
    RAISE EXCEPTION 'Currency account invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM civilcraft_currency.accounts a WHERE a.title_id = p_title AND a.player_id = p_player
    AND (a.entity_id <> p_entity OR a.entity_type <> p_type)) THEN
    RAISE EXCEPTION 'Currency account identity mismatch';
  END IF;
END $$;

CREATE FUNCTION civilcraft_currency._require_request(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  PERFORM civilcraft_currency._require_installation(p_database, p_title, p_version);
  PERFORM civilcraft_currency._require_identity(p_title, p_player, p_entity, p_type);
  IF p_order IS NULL OR p_order !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    OR p_currency IS NULL OR p_currency NOT IN ('DI', 'CO') OR p_amount IS NULL
    OR p_amount < 1 OR p_amount > 9007199254740991 OR (p_currency = 'CO' AND p_amount > 2147483647)
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Purchase input invalid';
  END IF;
END $$;

CREATE FUNCTION civilcraft_currency._matching_receipt(
  p_title text, p_order text, p_player text, p_entity text, p_type text,
  p_currency text, p_amount bigint, p_fingerprint text)
RETURNS civilcraft_currency.receipts LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE r civilcraft_currency.receipts;
BEGIN
  SELECT * INTO r FROM civilcraft_currency.receipts WHERE title_id = p_title AND order_id = p_order;
  IF FOUND AND (r.player_id, r.entity_id, r.entity_type, r.currency, r.amount, r.fingerprint)
    IS DISTINCT FROM (p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint) THEN
    RAISE EXCEPTION 'Purchase receipt identity mismatch';
  END IF;
  RETURN r;
END $$;

CREATE FUNCTION civilcraft_currency._lock_account(p_title text, p_player text, p_entity text, p_type text)
RETURNS bigint LANGUAGE plpgsql SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE a civilcraft_currency.accounts;
BEGIN
  INSERT INTO civilcraft_currency.accounts(title_id, player_id, entity_id, entity_type)
  VALUES (p_title, p_player, p_entity, p_type) ON CONFLICT (title_id, player_id) DO NOTHING;
  SELECT * INTO STRICT a FROM civilcraft_currency.accounts WHERE title_id = p_title AND player_id = p_player FOR UPDATE;
  IF a.entity_id <> p_entity OR a.entity_type <> p_type THEN RAISE EXCEPTION 'Currency account identity mismatch'; END IF;
  RETURN a.diamond_balance;
END $$;

CREATE FUNCTION civilcraft_currency.health(p_database uuid, p_title text, p_version integer)
RETURNS TABLE(healthy boolean, database_id uuid, title_id text, schema_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE restricted boolean;
BEGIN
  PERFORM civilcraft_currency._require_installation(p_database, p_title, p_version);
  restricted := NOT EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(session_user, r.oid, 'MEMBER')
    AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))
    AND NOT pg_is_in_recovery()
    AND current_setting('transaction_read_only') = 'off'
    AND NOT has_schema_privilege(session_user, 'civilcraft_currency', 'CREATE')
    AND has_schema_privilege(session_user, 'civilcraft_currency', 'USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'civilcraft_currency' AND c.relkind IN ('r', 'p')
      AND (NOT c.relrowsecurity OR pg_has_role(session_user, c.relowner, 'MEMBER')
        OR has_table_privilege(session_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(session_user, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
    AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'civilcraft_currency' AND pg_has_role(session_user, p.proowner, 'MEMBER'))
    AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'civilcraft_currency' AND c.relkind = 'r'
      AND c.relname IN ('installation', 'accounts', 'receipts')) = 3
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'civilcraft_currency'
      AND p.oid IN (
        to_regprocedure('civilcraft_currency.health(uuid,text,integer)'),
        to_regprocedure('civilcraft_currency.diamond_balance(uuid,text,integer,text,text,text)'),
        to_regprocedure('civilcraft_currency.receipt_status(uuid,text,integer,text,text,text,text,text,bigint,text)'),
        to_regprocedure('civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text)'),
        to_regprocedure('civilcraft_currency.coin_capacity(uuid,text,integer,text,text,text,text,text,bigint,text)'),
        to_regprocedure('civilcraft_currency.claim_coins(uuid,text,integer,text,text,text,text,text,bigint,text,uuid)'),
        to_regprocedure('civilcraft_currency.complete_coins(uuid,text,integer,text,text,text,text,text,bigint,text,uuid)'))
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, civilcraft_currency']
      AND has_function_privilege(session_user, p.oid, 'EXECUTE')) = 7
    AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'civilcraft_currency'
      AND p.proname NOT IN ('health', 'diamond_balance', 'receipt_status', 'grant_diamonds', 'coin_capacity', 'claim_coins', 'complete_coins')
      AND has_function_privilege(session_user, p.oid, 'EXECUTE'))
    AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname = 'civilcraft_currency' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_namespace n,
      LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'civilcraft_currency' AND a.grantee = 0 AND a.privilege_type IN ('USAGE', 'CREATE'))
    AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE n.nspname = 'civilcraft_currency' AND c.relkind = 'r' AND a.grantee = 0)
    AND (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'civilcraft_currency'
      AND t.tgname IN ('immutable_installation', 'permanent_account', 'permanent_receipt') AND t.tgenabled = 'O') = 3;
  RETURN QUERY SELECT restricted, p_database, p_title, p_version;
END $$;

CREATE FUNCTION civilcraft_currency.diamond_balance(
  p_database uuid, p_title text, p_version integer, p_player text, p_entity text, p_type text)
RETURNS TABLE(balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  PERFORM civilcraft_currency._require_installation(p_database, p_title, p_version);
  PERFORM civilcraft_currency._require_identity(p_title, p_player, p_entity, p_type);
  RETURN QUERY SELECT COALESCE((SELECT a.diamond_balance FROM civilcraft_currency.accounts a
    WHERE a.title_id = p_title AND a.player_id = p_player), 0::bigint);
END $$;

CREATE FUNCTION civilcraft_currency.receipt_status(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text)
RETURNS TABLE(state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE r civilcraft_currency.receipts;
BEGIN
  PERFORM civilcraft_currency._require_request(p_database, p_title, p_version, p_order, p_player,
    p_entity, p_type, p_currency, p_amount, p_fingerprint);
  r := civilcraft_currency._matching_receipt(p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint);
  RETURN QUERY SELECT COALESCE(r.state, 'absent');
END $$;

CREATE FUNCTION civilcraft_currency.grant_diamonds(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text)
RETURNS TABLE(already_granted boolean, balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE r civilcraft_currency.receipts; current_balance bigint;
BEGIN
  PERFORM civilcraft_currency._require_request(p_database, p_title, p_version, p_order, p_player,
    p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF p_currency <> 'DI' THEN RAISE EXCEPTION 'Diamond currency required'; END IF;
  current_balance := civilcraft_currency._lock_account(p_title, p_player, p_entity, p_type);
  r := civilcraft_currency._matching_receipt(p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF r.order_id IS NOT NULL THEN
    IF r.state <> 'granted' THEN RAISE EXCEPTION 'Diamond receipt invalid'; END IF;
    RETURN QUERY SELECT true, current_balance;
    RETURN;
  END IF;
  IF current_balance > 9007199254740991 - p_amount THEN RAISE EXCEPTION 'Diamond capacity exceeded'; END IF;
  UPDATE civilcraft_currency.accounts a SET diamond_balance = current_balance + p_amount
  WHERE a.title_id = p_title AND a.player_id = p_player;
  INSERT INTO civilcraft_currency.receipts(title_id, order_id, player_id, entity_id, entity_type, currency, amount, fingerprint, state)
  VALUES (p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint, 'granted');
  -- Account increment and receipt insert commit together, or both roll back.
  RETURN QUERY SELECT false, current_balance + p_amount;
END $$;

CREATE FUNCTION civilcraft_currency.coin_capacity(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text)
RETURNS TABLE(pending_amount bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
BEGIN
  PERFORM civilcraft_currency._require_request(p_database, p_title, p_version, p_order, p_player,
    p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF p_currency <> 'CO' THEN RAISE EXCEPTION 'Coin currency required'; END IF;
  PERFORM civilcraft_currency._matching_receipt(p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint);
  RETURN QUERY SELECT COALESCE(sum(r.amount), 0)::bigint FROM civilcraft_currency.receipts r
    WHERE r.title_id = p_title AND r.player_id = p_player AND r.currency = 'CO' AND r.state = 'pending';
END $$;

CREATE FUNCTION civilcraft_currency.claim_coins(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text, p_attempt uuid)
RETURNS TABLE(claimed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE r civilcraft_currency.receipts; pending_total bigint;
BEGIN
  PERFORM civilcraft_currency._require_request(p_database, p_title, p_version, p_order, p_player,
    p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF p_currency <> 'CO' OR p_attempt IS NULL THEN RAISE EXCEPTION 'Coin claim invalid'; END IF;
  PERFORM civilcraft_currency._lock_account(p_title, p_player, p_entity, p_type);
  r := civilcraft_currency._matching_receipt(p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF r.order_id IS NOT NULL THEN
    -- Even the same attempt may have already issued an external grant: no reacquisition.
    RETURN QUERY SELECT false;
    RETURN;
  END IF;
  SELECT COALESCE(sum(x.amount), 0)::bigint INTO pending_total FROM civilcraft_currency.receipts x
    WHERE x.title_id = p_title AND x.player_id = p_player AND x.currency = 'CO' AND x.state = 'pending';
  IF pending_total > 2147483647 - p_amount THEN RAISE EXCEPTION 'Coin reservation capacity exceeded'; END IF;
  INSERT INTO civilcraft_currency.receipts(title_id, order_id, player_id, entity_id, entity_type, currency, amount, fingerprint, attempt_id, state)
  VALUES (p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint, p_attempt, 'pending');
  RETURN QUERY SELECT true;
END $$;

CREATE FUNCTION civilcraft_currency.complete_coins(
  p_database uuid, p_title text, p_version integer, p_order text, p_player text,
  p_entity text, p_type text, p_currency text, p_amount bigint, p_fingerprint text, p_attempt uuid)
RETURNS TABLE(completed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, civilcraft_currency AS $$
DECLARE r civilcraft_currency.receipts;
BEGIN
  PERFORM civilcraft_currency._require_request(p_database, p_title, p_version, p_order, p_player,
    p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF p_currency <> 'CO' OR p_attempt IS NULL THEN RAISE EXCEPTION 'Coin completion invalid'; END IF;
  PERFORM civilcraft_currency._lock_account(p_title, p_player, p_entity, p_type);
  r := civilcraft_currency._matching_receipt(p_title, p_order, p_player, p_entity, p_type, p_currency, p_amount, p_fingerprint);
  IF r.order_id IS NULL OR r.attempt_id IS DISTINCT FROM p_attempt THEN RAISE EXCEPTION 'Coin claim ownership mismatch'; END IF;
  IF r.state = 'pending' THEN
    UPDATE civilcraft_currency.receipts x SET state = 'granted' WHERE x.title_id = p_title AND x.order_id = p_order;
  END IF;
  RETURN QUERY SELECT true;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA civilcraft_currency FROM PUBLIC, civilcraft_currency_app;
GRANT EXECUTE ON FUNCTION civilcraft_currency.health(uuid,text,integer),
  civilcraft_currency.diamond_balance(uuid,text,integer,text,text,text),
  civilcraft_currency.receipt_status(uuid,text,integer,text,text,text,text,text,bigint,text),
  civilcraft_currency.grant_diamonds(uuid,text,integer,text,text,text,text,text,bigint,text),
  civilcraft_currency.coin_capacity(uuid,text,integer,text,text,text,text,text,bigint,text),
  civilcraft_currency.claim_coins(uuid,text,integer,text,text,text,text,text,bigint,text,uuid),
  civilcraft_currency.complete_coins(uuid,text,integer,text,text,text,text,text,bigint,text,uuid)
TO civilcraft_currency_app;

COMMIT;

-- Administrator next steps (keep these credentials out of the browser/repository):
-- CREATE ROLE civilcraft_currency_runtime LOGIN PASSWORD 'choose-a-strong-secret';
-- GRANT civilcraft_currency_app TO civilcraft_currency_runtime;
-- SELECT database_id, title_id, schema_version FROM civilcraft_currency.installation;
-- Use the runtime login URL + database_id in server environment variables.
-- Do NOT grant tables, ownership, schema CREATE, BYPASSRLS, or an administrator role.
