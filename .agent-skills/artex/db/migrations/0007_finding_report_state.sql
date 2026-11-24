-- Report stage on findings, separate from triage status. Existing rows stay
-- 'none'. Values are validated server-side (no CHECK): none / submitted /
-- accepted / rejected / duplicate. RSI lessons still read findings.status.
ALTER TABLE findings ADD COLUMN IF NOT EXISTS report_state TEXT NOT NULL DEFAULT 'none';
CREATE INDEX IF NOT EXISTS idx_findings_report_state ON findings (report_state, created_at DESC);
