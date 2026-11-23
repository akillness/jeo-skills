"""setup.sh, offline: stand-ins for gh, git and curl, answers typed on stdin."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE_GH = """#!/usr/bin/env bash
case "$*" in
  "auth status") exit 0 ;;
  "repo view --json nameWithOwner -q .nameWithOwner") echo "someone/testers" ;;
  "repo view --json visibility -q .visibility") echo "$FAKE_VISIBILITY" ;;
  "secret list --json name -q .[].name") echo "ARTIFACT_PASSPHRASE" ;;
  "secret set "*) cat > "$FAKE_SECRETS/$3" ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
"""
FAKE_GIT = "#!/usr/bin/env bash\nexit 0\n"   # public key already committed
# Anthropic answers 401 to a key containing "bad", 200 otherwise; logs its arguments
FAKE_CURL = """#!/usr/bin/env bash
echo "$*" >> "$FAKE_SECRETS/curl-args"
if grep -q bad; then printf 401; else printf 200; fi
"""


class Setup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = Path(tempfile.mkdtemp())
        keys = cls.home / ".mobile-agent-testers"
        keys.mkdir()
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                        "-out", str(keys / "someone_testers.pem")], check=True, capture_output=True)

    def run_setup(self, answers, visibility="PUBLIC"):
        work = Path(tempfile.mkdtemp())
        bin_dir, secrets = work / "bin", work / "secrets"
        bin_dir.mkdir()
        secrets.mkdir()
        for name, body in (("gh", FAKE_GH), ("git", FAKE_GIT), ("curl", FAKE_CURL)):
            (bin_dir / name).write_text(body)
            (bin_dir / name).chmod(0o755)
        shutil.copy(ROOT / "setup.sh", work / "setup.sh")
        env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "HOME": str(self.home),
               "FAKE_SECRETS": str(secrets), "FAKE_VISIBILITY": visibility}
        proc = subprocess.run(["bash", "setup.sh"], cwd=work, input=answers, capture_output=True,
                              text=True, env=env)
        return proc, secrets

    def test_subscription_token_after_a_wrong_choice_and_an_empty_paste(self):
        proc, secrets = self.run_setup("5\n1\n\n  sk-ant-oat01-abc \n")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual((secrets / "CLAUDE_CODE_OAUTH_TOKEN").read_text(), "sk-ant-oat01-abc")
        self.assertIn("Nothing pasted", proc.stdout)
        self.assertNotIn("Warning", proc.stdout)
        self.assertFalse((secrets / "curl-args").exists())   # tokens are not checked online
        self.assertIn("about 20 min", proc.stdout)
        self.assertIn("gh run watch", proc.stdout)

    def test_api_key_refused_then_accepted_never_on_the_command_line(self):
        proc, secrets = self.run_setup("2\nsk-ant-api03-bad\nsk-ant-api03-good\n")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual((secrets / "ANTHROPIC_API_KEY").read_text(), "sk-ant-api03-good")
        self.assertIn("Anthropic refused this key (401)", proc.stdout)
        self.assertIn("Key checked with Anthropic", proc.stdout)
        self.assertNotIn("sk-ant", (secrets / "curl-args").read_text())

    def test_warns_about_an_unexpected_prefix_and_a_private_repo(self):
        proc, secrets = self.run_setup("1\nsomething-else\n", visibility="PRIVATE")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("does not start with sk-ant-oat", proc.stdout)
        self.assertIn("someone/testers is private", proc.stdout)
        self.assertEqual((secrets / "CLAUDE_CODE_OAUTH_TOKEN").read_text(), "something-else")


if __name__ == "__main__":
    unittest.main()
