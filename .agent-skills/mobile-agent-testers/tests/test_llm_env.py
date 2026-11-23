"""scripts/llm_env.sh: another Anthropic-compatible API instead of Claude (llm_base_url input)."""
import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOWN = ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
         "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL",
         "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC")


def source(show=True, **env):
    """Sources the helper like run_agent.sh does, then prints the variables it may change."""
    clean = {k: v for k, v in os.environ.items()
             if not k.startswith(("ANTHROPIC_", "CLAUDE_CODE_", "LLM_", "API_TIMEOUT")) and k != "MODEL"}
    script = f'source "{ROOT / "scripts/llm_env.sh"}" || exit 3'
    if show:
        script += "".join(f'; echo "{v}=${{{v}-<unset>}}"' for v in SHOWN)
    return subprocess.run(["bash", "-c", script], env={**clean, **env}, capture_output=True, text=True)


def values(out):
    return dict(line.split("=", 1) for line in out.stdout.splitlines() if "=" in line)


class LlmEnv(unittest.TestCase):
    def test_claude_stays_when_no_base_url(self):
        out = source(CLAUDE_CODE_OAUTH_TOKEN="oauth", MODEL="sonnet")
        self.assertEqual(out.returncode, 0, out.stderr)
        v = values(out)
        self.assertEqual(v["CLAUDE_CODE_OAUTH_TOKEN"], "oauth")
        self.assertEqual(v["ANTHROPIC_BASE_URL"], "<unset>")
        self.assertEqual(v["ANTHROPIC_MODEL"], "<unset>")

    def test_provider_replaces_claude(self):
        out = source(LLM_BASE_URL="https://api.deepseek.com/anthropic/", LLM_API_KEY="sk-provider",
                     MODEL="provider-model", CLAUDE_CODE_OAUTH_TOKEN="oauth", ANTHROPIC_API_KEY="sk-ant")
        self.assertEqual(out.returncode, 0, out.stderr)
        v = values(out)
        self.assertEqual(v["ANTHROPIC_BASE_URL"], "https://api.deepseek.com/anthropic")
        self.assertEqual(v["ANTHROPIC_AUTH_TOKEN"], "sk-provider")
        self.assertEqual(v["ANTHROPIC_API_KEY"], "")
        self.assertEqual(v["CLAUDE_CODE_OAUTH_TOKEN"], "<unset>")
        for name in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL"):
            self.assertEqual(v[name], "provider-model")
        self.assertEqual(v["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"], "1")

    def test_log_shows_the_host_never_the_key(self):
        out = source(show=False, LLM_BASE_URL="https://user:pw@openrouter.ai/api", LLM_API_KEY="sk-provider",
                     MODEL="vendor/vision-model")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "Model vendor/vision-model through openrouter.ai")
        self.assertNotIn("sk-provider", out.stdout + out.stderr)
        self.assertNotIn("pw", out.stdout + out.stderr)

    def test_missing_key_stops_the_agent(self):
        out = source(LLM_BASE_URL="https://api.moonshot.ai/anthropic", MODEL="provider-model")
        self.assertEqual(out.returncode, 3)
        self.assertIn("LLM_API_KEY", out.stderr)

    def test_claude_alias_sent_to_a_provider_stops_the_agent(self):
        for model in ("sonnet", "haiku", ""):
            out = source(LLM_BASE_URL="https://api.z.ai/api/anthropic", LLM_API_KEY="k", MODEL=model)
            self.assertEqual(out.returncode, 3, model)
            self.assertIn("model input", out.stderr)


if __name__ == "__main__":
    unittest.main()
