-- Operator approval before acquiring third-party code.
-- Opt-in: apply with hardening/apply-intercept-rules.sh (restarting the artex
-- service reloads the rule cache). Idempotent: re-running replaces the
-- [hardening] rules and the skill-visibility rows.
--
-- Priority: these rules sit BELOW the built-in safety denies on purpose.
-- intercept.Match returns the first rule in priority-DESC order, and the
-- built-in destructive denies are 80/90/100. At 70-72 a command like
-- `pip install x && curl -X DELETE ...` still hits the built-in DELETE deny (80)
-- first, instead of being downgraded to an approval.
--
-- These regexes are a best-effort tripwire on the raw tool_input JSON, NOT a
-- security boundary. See skills/third-party-code-review/SKILL.md for the known
-- bypasses and false positives, and hardening/rulecheck for the tests.
BEGIN;

DELETE FROM intercept_rules WHERE name LIKE '[hardening]%';

-- (?:[^"\\]|\\.)*? walks inside the JSON string without stopping at an escaped
-- quote. RE2 syntax (no lookahead). Verified by hardening/rulecheck.

INSERT INTO intercept_rules(name, enabled, priority, match_target, match_type, pattern, action, message, timeout_enabled, timeout_seconds, timeout_action) VALUES
('[hardening] Third-party code download from code/exploit hosts', true, 70, 'tool_input', 'regex',
 $re$(?i)"(?:command|url|text|paste)"\s*:\s*"(?:[^"\\]|\\.)*?(?:raw\.githubusercontent\.com|gist\.githubusercontent\.com|gist\.github\.com|codeload\.github\.com|objects\.githubusercontent\.com|github\.com/[^\s"'\\]+/(?:raw|archive|releases/download|blob)/|gitlab\.com/[^\s"'\\]+/-/(?:raw|archive)/|bitbucket\.org/[^\s"'\\]+/(?:raw|get)/|pastebin\.com/(?:raw|dl)|paste\.ee/r/|hastebin|transfer\.sh|exploit-db\.com/(?:raw|download)|packetstormsecurity\.com|dl\.packetstormsecurity)$re$,
 'ask', 'Third-party code: waiting for operator approval. If denied or timed out, do NOT fetch the same code by another route; record the source and take another approach (skill third-party-code-review).', true, 1800, 'deny'),

('[hardening] git clone', true, 70, 'tool_input', 'regex',
 $re$(?i)"(?:command|text|paste)"\s*:\s*"(?:[^"\\]|\\.)*?\bgit\s+(?:(?:-[^\s]+|[^\s]+=[^\s]+)\s+)*(?:clone|submodule\s+update|fetch\s+https?://)$re$,
 'ask', 'Cloning a third-party repository requires operator approval. If denied, take another approach (skill third-party-code-review).', true, 1800, 'deny'),

('[hardening] Package installation', true, 70, 'tool_input', 'regex',
 $re$(?i)"(?:command|text|paste)"\s*:\s*"(?:[^"\\]|\\.)*?(?:\b(?:pip[0-9.]*|pipx|uv\s+pip|python[0-9.]*\s+-m\s+pip)\s+install\b|\bnpm\s+(?:i|install|exec)\b|\bnpx\s|\bpnpm\s+(?:add|install|dlx)\b|\byarn\s+(?:add|dlx)\b|\bgo\s+(?:install|get)\b|\bgem\s+install\b|\bcargo\s+install\b|\bcomposer\s+(?:require|create-project|global)\b|\bapt(?:-get)?\s+install\b)$re$,
 'ask', 'Installing a package requires operator approval. Prefer the tools already in the image. If denied, take another approach.', true, 1800, 'deny'),

('[hardening] Remote content piped to a shell', true, 71, 'tool_input', 'regex',
 $re$(?i)"(?:command|text|paste)"\s*:\s*"(?:[^"\\]|\\.)*?(?:\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|(?:ba|z|da|k)?sh\s+-c\s+(?:\\")?\$\(\s*(?:curl|wget)|(?:ba|z)?sh\s+(?:<|\\u003c)\(\s*(?:curl|wget)|\b(?:python[0-9.]*|perl|ruby|php|node)\s+(?:<|\\u003c)\(\s*(?:curl|wget)|\bbase64\s+(?:-d|--decode)\b[^|]*\|\s*(?:ba|z)?sh\b|\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:tar|unzip)\b|\b(?:curl|wget)\b[^|]*\|\s*(?:python[0-9.]*|perl|ruby|php|node)\s*(?:-\s*)?(?:$|[;&)"]|\\n|\\u0026))$re$,
 'ask', 'Executing remote or decoded content directly in an interpreter requires approval. Download to a file, review it (skill third-party-code-review), and request approval.', true, 1800, 'deny'),

('[hardening] Access to server keys or DSN', true, 72, 'tool_input', 'regex',
 $re$(?i)"(?:command|text|paste)"\s*:\s*"(?:[^"\\]|\\.)*?(?:/app/keys/|/proc/(?:[0-9]+|self|thread-self)/environ|\bARTEX_PG_DSN\b|\bARTEX_SECRET_KEY\b)$re$,
 'deny', 'Reading the server signing/secret keys or the database DSN from the agent shell is forbidden. This is enforced; the skill prose is not.', false, 0, 'deny');

-- Make the review skill visible to the executor agents. Only enabled=true rows
-- are visible (db/config.go). Match by stable agents.key (not display name).
INSERT INTO agent_skill_visibility(agent_id, skill_name, enabled)
SELECT a.id, 'third-party-code-review', true
FROM agents a
WHERE a.key IN ('mainagent', 'worker', 'auto', 'pentest', 'retester')
ON CONFLICT (agent_id, skill_name) DO UPDATE SET enabled = true;

COMMIT;
