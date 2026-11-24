-- Provenance flag on evidence snapshots recording whether the capture proxy
-- applied at least one rewrite rule to the bound exchange, and which rule IDs
-- were applied. Excluded from the content-addressed snapshot ID.
ALTER TABLE traffic_evidence_snapshots ADD COLUMN IF NOT EXISTS rewritten boolean NOT NULL DEFAULT false;
ALTER TABLE traffic_evidence_snapshots ADD COLUMN IF NOT EXISTS rewrite_rule_ids bigint[] NOT NULL DEFAULT '{}'::bigint[];
