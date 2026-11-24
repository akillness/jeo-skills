-- Rewrite rules of the capture proxy. Global configuration: the table is not
-- part of a task archive.
--
-- matchers and actions are sealed at rest by db/secrets.go (two JSON secret
-- columns): a row holds {"__artex_enc":"enc:v1:..."} in each, and an empty
-- object stays in clear. Migrations run before InitSecrets, which checks the
-- key against these columns and encrypts any plaintext row it finds.
--
-- Execution order is priority ascending, then id ascending: the highest
-- priority applies last. A rule is created disabled.
CREATE TABLE IF NOT EXISTS traffic_rewrite_rules (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT false,
    phase      TEXT NOT NULL CHECK (phase IN ('request', 'response')),
    priority   INTEGER NOT NULL DEFAULT 0,
    matchers   JSONB NOT NULL,
    actions    JSONB NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_traffic_rewrite_rules_upd ON traffic_rewrite_rules;
CREATE TRIGGER trg_traffic_rewrite_rules_upd BEFORE UPDATE ON traffic_rewrite_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
