-- The coverage target CTE (contextCoverageCTE / covTargetCTE / scopeTargetCTE)
-- joins assets to task_scope on an OR of per-kind predicates. PostgreSQL plans it
-- as one BitmapOr probe of task_scope per asset. Every branch had an index except
-- kind='icp', which fell back to uq_task_scope_v2 with only "kind = 'icp'" as the
-- index condition (task_id is the leading column), so each probe walked the
-- whole unique index: about 70% of the buffer hits of the coverage-graph query on
-- a 3,000-asset task scoped by 800 subdomains. This partial index makes the icp
-- probe an equality lookup on value.
CREATE INDEX IF NOT EXISTS idx_ts_icp ON task_scope(value) WHERE kind = 'icp';
