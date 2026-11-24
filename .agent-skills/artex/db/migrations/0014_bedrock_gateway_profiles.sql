-- The idempotent schema supplies the DDL; this migration records the feature version.
ALTER TABLE llm_profiles ADD COLUMN IF NOT EXISTS custom_headers TEXT NOT NULL DEFAULT '';
ALTER TABLE llm_profiles DROP CONSTRAINT IF EXISTS llm_profiles_format_check;
ALTER TABLE llm_profiles ADD CONSTRAINT llm_profiles_format_check
    CHECK (format IN ('openai','anthropic','openai-responses','ollama','bedrock-gateway'));
