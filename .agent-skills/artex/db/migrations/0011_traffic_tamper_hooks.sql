-- Constrained Go tampering hooks of the capture proxy (P4.2). Global
-- configuration: neither table is part of a task archive.
--
-- source (TEXT) and matchers (JSONB) on BOTH traffic_tamper_hooks and
-- traffic_tamper_hook_versions are sealed at rest by db/secrets.go because a
-- hook can carry a hardcoded secret (for example an HMAC signing key).
--
-- Execution order is priority ascending, then id ascending. A hook is always
-- created disabled (enabled = false).
CREATE TABLE IF NOT EXISTS traffic_tamper_hooks (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT false,
    phase         TEXT NOT NULL CHECK (phase IN ('request', 'response')),
    priority      INTEGER NOT NULL DEFAULT 0,
    matchers      JSONB NOT NULL DEFAULT '{}'::jsonb,
    source        TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    version       INTEGER NOT NULL DEFAULT 1,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_traffic_tamper_hooks_upd ON traffic_tamper_hooks;
CREATE TRIGGER trg_traffic_tamper_hooks_upd BEFORE UPDATE ON traffic_tamper_hooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS traffic_tamper_hook_versions (
    id            BIGSERIAL PRIMARY KEY,
    hook_id       BIGINT NOT NULL REFERENCES traffic_tamper_hooks(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    name          TEXT NOT NULL,
    phase         TEXT NOT NULL CHECK (phase IN ('request', 'response')),
    priority      INTEGER NOT NULL DEFAULT 0,
    matchers      JSONB NOT NULL DEFAULT '{}'::jsonb,
    source        TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (hook_id, version)
);
CREATE INDEX IF NOT EXISTS idx_tamper_hook_versions_hook ON traffic_tamper_hook_versions(hook_id, version DESC);
