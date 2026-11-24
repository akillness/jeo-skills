-- Keep withdrawal history on rsi_lesson_evidence (#269): replace the composite
-- primary key (lesson_id, source_kind, source_id) with a surrogate id and a
-- partial unique index over live rows (withdrawn_at IS NULL). Re-confirming a
-- previously withdrawn finding inserts a new live row while preserving the old
-- withdrawal row and its withdrawn_at timestamp.
ALTER TABLE rsi_lesson_evidence ADD COLUMN IF NOT EXISTS id BIGSERIAL;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'rsi_lesson_evidence'::regclass
          AND contype = 'p'
          AND conname = 'rsi_lesson_evidence_pkey'
          AND array_length(conkey, 1) > 1
    ) THEN
        ALTER TABLE rsi_lesson_evidence DROP CONSTRAINT rsi_lesson_evidence_pkey;
        ALTER TABLE rsi_lesson_evidence ADD PRIMARY KEY (id);
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rsi_lesson_evidence_live
    ON rsi_lesson_evidence(lesson_id, source_kind, source_id)
    WHERE withdrawn_at IS NULL;
