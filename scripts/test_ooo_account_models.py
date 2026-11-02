#!/usr/bin/env python3
"""Account-model CLI regressions using installed-upstream fixtures, never user auth."""

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
SETUP = ROOT / ".agent-skills/ooo/scripts/account-model-setup.py"


class AccountFixture(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="ooo-account-model-test-")
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name).resolve()
        self.home = self.work / "home"
        self.home.mkdir()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.modules = self.work / "installed"
        self.modules.mkdir()
        self.state_path = self.work / "account.json"
        self.config = self.home / ".ouroboros/config.yaml"
        self.state = {
            "copilot": {"models": ["account/current-a", "account/current-b"]},
            "kiro": {"models": ["stage/current-a", "stage/current-b"]},
            "codex": {"selection": "sentinel", "models": ["native/alpha", "native/beta"],
                      "current": "native/beta", "authenticated": True},
        }
        self.env = {
            "HOME": str(self.home), "PATH": str(self.bin),
            "TMPDIR": str(self.work), "PYTHONPATH": str(self.modules),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "PYTHONDONTWRITEBYTECODE": "1", "FIXTURE_STATE": str(self.state_path),
            "FIXTURE_BIN": str(self.bin),
        }
        self.module("fixture_account.py", '''import json, os
from pathlib import Path
import yaml

def native_cli(backend):
    env = os.environ.get('OUROBOROS_' + backend.upper() + '_CLI_PATH')
    config = Path.home() / '.ouroboros/config.yaml'
    saved = yaml.safe_load(config.read_text()) if config.exists() else {}
    return env or saved.get('orchestrator', {}).get(backend + '_cli_path') or os.path.join(os.environ['FIXTURE_BIN'], backend)

def account(backend):
    entry = json.loads(Path(os.environ["FIXTURE_STATE"]).read_text())[backend]
    entry = entry.get('accounts', {}).get(native_cli(backend), entry)
    if entry.get("error"):
        raise RuntimeError("fixture discovery unavailable")
    return entry
''')
        self.module("ouroboros/__init__.py", "")
        self.module("ouroboros/backends/__init__.py", '''def resolve_runtime_backend_name(name):
    if name not in ("codex", "copilot", "kiro", "claude"):
        raise ValueError("unsupported runtime: " + name)
    return name

def resolve_llm_backend_name(name):
    return resolve_runtime_backend_name(name)
''')
        self.module("ouroboros/backends/model_catalog.py", '''import os
from types import SimpleNamespace
from fixture_account import account, native_cli

def get_model_catalog(backend):
    entry = account(backend)
    if entry.get("unsupported"):
        raise ValueError("installed upstream does not support " + backend)
    return SimpleNamespace(model_selection=entry.get("selection", "explicit"))

def detect_backend_cli(backend):
    if account(backend).get("missing_cli"):
        return None
    return native_cli(backend)

def refresh_models(backend):
    value = account(backend).get("models")
    return tuple(value) if isinstance(value, list) else value
''')
        self.module("ouroboros/copilot/__init__.py", "")
        self.module("ouroboros/copilot/model_discovery.py", '''from types import SimpleNamespace
from fixture_account import account

def list_copilot_models(refresh=False):
    if not refresh:
        raise RuntimeError("account discovery requires refresh")
    value = account("copilot").get("models")
    return [SimpleNamespace(id=model) for model in value] if isinstance(value, list) else value

def used_fallback():
    return account("copilot").get("fallback", False)
''')
        self.module("ouroboros/config/__init__.py", "")
        self.module("ouroboros/config/models.py", '''from types import SimpleNamespace
class OuroborosConfig:
    @classmethod
    def model_validate(cls, value):
        if value.get("fixture_invalid"):
            raise ValueError("fixture upstream schema rejected config")
        return SimpleNamespace(data=value, llm_role_profiles=value.get('llm_role_profiles', {}))
''')
        self.module("ouroboros/orchestrator_stage.py", "LLM_ROLE_STAGE_MAP = {'interview': 'interview', 'qa': 'qa', 'semantic_evaluation': 'evaluate'}\n")
        self.module("ouroboros/config/model_selection.py", '''import os
from types import SimpleNamespace
from fixture_account import account

def _load_config():
    raise RuntimeError('fixture requires validated target config loader')

def resolve_role_model(role, backend):
    data = _load_config().data
    chosen = os.environ.get('OUROBOROS_MODEL', data.get('models', {}).get('default'))
    if chosen in (None, 'auto'):
        section, key = {'interview': ('clarification', 'default_model'),
                        'qa': ('llm', 'qa_model'),
                        'semantic_evaluation': ('evaluation', 'semantic_model')}[role]
        chosen = data.get(section, {}).get(key) or account(backend)['models'][0]
    return SimpleNamespace(model=chosen)
''')
        self.module("ouroboros/providers/__init__.py", "")
        self.module("ouroboros/providers/base.py", '''class CompletionConfig:
    def __init__(self, model, role, profile=None, model_is_explicit=False):
        self.model, self.role = model, role
        self.profile, self.model_is_explicit = profile, model_is_explicit
''')
        self.module("ouroboros/providers/profiles.py", '''from types import SimpleNamespace

def load_config():
    raise RuntimeError('fixture requires target profile config loader')

def resolve_completion_profile(request, backend):
    data = load_config().data
    name = data.get('llm_role_profiles', {}).get(request.role)
    profile = data.get('llm_profiles', {}).get(name, {})
    model = profile.get('providers', {}).get(backend, {}).get('model', profile.get('model', request.model))
    if request.role and not request.profile and request.model_is_explicit and request.model != 'default':
        model = request.model
    backend_profile = profile.get('providers', {}).get(backend, {}).get('profile')
    return SimpleNamespace(config=SimpleNamespace(model=model), backend_profile=backend_profile)
''')
        for runtime in ("copilot", "kiro"):
            self.executable(runtime, '''import sys
if sys.argv[1:] != ["--version"]:
    raise SystemExit("fixture forbids direct provider calls")
print("fixture installed runtime")
''')

    def module(self, name, body):
        path = self.modules / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")

    def executable(self, name, body):
        path = self.bin / name
        path.write_text(f"#!{sys.executable}\n{body}", encoding="utf-8")
        path.chmod(0o700)

    def run_setup(self, *args, runner=None):
        self.state_path.write_text(json.dumps(self.state), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(runner or SETUP), "--config", str(self.config), *args],
            cwd=self.work, env=self.env, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=15,
        )

    def run_injected(self, injection, *args):
        runner = self.work / "injected-cli.py"
        runner.write_text(
            "import importlib.util, sys\n"
            f"spec = importlib.util.spec_from_file_location('account_setup', {str(SETUP)!r})\n"
            "setup = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(setup)\n"
            + injection + "\nsys.exit(setup.main())\n", encoding="utf-8")
        return self.run_setup(*args, runner=runner)

    def report(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def write_config(self, value):
        self.config.parent.mkdir(parents=True, exist_ok=True)
        self.config.write_text(yaml.safe_dump(value), encoding="utf-8")

    def snapshot(self):
        roots = [("home", self.home)]
        if not self.config.is_relative_to(self.home):
            roots.append(("target", self.config.parent))
        return {f"{label}/{path.relative_to(root)}": (
            "file", path.read_bytes(), stat.S_IMODE(path.stat().st_mode)
        ) if path.is_file() else ("directory", stat.S_IMODE(path.stat().st_mode))
            for label, root in roots for path in root.rglob("*")}

    def assert_refused_unchanged(self, result, before):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "error")
        self.assertEqual(self.snapshot(), before, "Failure must not alter config or create backups")


class OooAccountModels(AccountFixture):
    def test_preview_uses_refreshed_account_membership_without_writing(self):
        for runtime, model in (("copilot", "account/current-b"), ("kiro", "stage/current-b")):
            with self.subTest(runtime=runtime):
                before = self.snapshot()
                result = self.run_setup("--runtime", runtime, "--llm-backend", runtime, "--model", model)
                report = self.report(result)
                self.assertEqual(report["status"], "preview")
                self.assertEqual(report["model"], model)
                self.assertEqual(report["inventories"][runtime]["models"], self.state[runtime]["models"])
                self.assertEqual(self.snapshot(), before)

    def test_removed_account_model_cannot_survive_as_static_or_saved_fallback(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                           "llm": {"backend": "copilot"},
                           "models": {"default": "account/current-a"}})
        self.state["copilot"]["models"] = ["account/new-generation"]
        before = self.snapshot()
        result = self.run_setup("--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("model", (result.stdout + result.stderr).lower())
        explicit = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                  "--model", "account/current-a", "--apply")
        self.assert_refused_unchanged(explicit, before)
        report = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                           "--model", "account/new-generation"))
        self.assertEqual(report["model"], "account/new-generation")
        self.assertEqual(report["inventories"]["copilot"]["models"], ["account/new-generation"])

    def test_valid_saved_selection_preserves_secrets_and_unrelated_config(self):
        config = {
            "orchestrator": {"runtime_backend": "copilot", "max_iterations": 17},
            "llm": {"backend": "copilot"},
            "models": {"default": "account/current-b", "planner": "custom/planner"},
            "api_keys": {"openai": "fixture-secret-do-not-print"},
            "extension": {"nested": ["keep", {"enabled": True}]},
        }
        self.write_config(config)
        before = self.snapshot()
        report = self.report(self.run_setup("--apply"))
        self.assertEqual(report["model"], "account/current-b")
        self.assertEqual(report["status"], "unchanged")
        self.assertEqual(self.snapshot(), before)
        self.assertNotIn("fixture-secret-do-not-print", json.dumps(report))

    def test_apply_backs_up_original_privately_and_is_idempotent(self):
        original = {"orchestrator": {"runtime_backend": "copilot"},
                    "llm": {"backend": "copilot"},
                    "models": {"default": "account/current-a", "reviewer": "custom/reviewer"},
                    "api_keys": {"openai": "fixture-private-secret"},
                    "extension": {"keep": [1, 2, 3]}}
        self.write_config(original)
        self.config.chmod(0o644)
        original_bytes = self.config.read_bytes()
        report = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                           "--model", "account/current-b", "--apply"))
        self.assertEqual(report["status"], "applied")
        expected = {**original, "models": {**original["models"], "default": "account/current-b"}}
        self.assertEqual(yaml.safe_load(self.config.read_text()), expected)
        backup = Path(report["backup"])
        self.assertTrue(backup.is_relative_to(self.config.parent))
        self.assertEqual(backup.read_bytes(), original_bytes)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)
        self.assertNotIn("fixture-private-secret", json.dumps(report))
        before_repeat = self.snapshot()
        repeated = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                             "--model", "account/current-b", "--apply"))
        self.assertEqual(repeated["status"], "unchanged")
        self.assertEqual(self.snapshot(), before_repeat)

    def test_discovery_failures_never_write_or_use_catalog_fallback(self):
        cases = {
            "unavailable": {"error": True},
            "empty": {"models": []},
            "malformed": {"models": "account/current-b"},
            "invalid_model_id": {"models": [None]},
            "public_cached_fallback": {"models": ["account/current-b"], "fallback": True},
            "unsupported_upstream": {"models": ["account/current-b"], "unsupported": True},
            "missing_runtime_cli": {"models": ["account/current-b"], "missing_cli": True},
        }
        for name, state in cases.items():
            with self.subTest(name=name):
                self.state["copilot"] = state
                before = self.snapshot()
                result = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                        "--model", "account/current-b", "--apply")
                self.assert_refused_unchanged(result, before)

    def test_runtime_and_llm_model_namespaces_are_validated_independently(self):
        before = self.snapshot()
        result = self.run_setup("--runtime", "copilot", "--llm-backend", "kiro",
                                "--model", "account/current-b", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("kiro", (result.stdout + result.stderr).lower())
        self.state["kiro"]["models"].append("account/current-b")
        report = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "kiro",
                                           "--model", "account/current-b", "--apply"))
        self.assertEqual(report["status"], "applied")
        written = yaml.safe_load(self.config.read_text())
        self.assertEqual(written["orchestrator"]["runtime_backend"], "copilot")
        self.assertEqual(written["llm"]["backend"], "kiro")
        self.assertEqual(written["models"]["default"], "account/current-b")

    def test_apply_requires_selection_without_inventing_first_model(self):
        preview = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "copilot"))
        self.assertTrue(preview["selection_required"])
        self.assertIsNone(preview["model"])
        before = self.snapshot()
        self.assert_refused_unchanged(
            self.run_setup("--runtime", "copilot", "--llm-backend", "copilot", "--apply"), before)

    def test_native_config_validation_failure_keeps_original_and_no_backup(self):
        self.write_config({"fixture_invalid": True, "models": {"default": "account/current-a"}})
        before = self.snapshot()
        result = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                "--model", "account/current-b", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("schema rejected", result.stdout + result.stderr)

    def test_kiro_malformed_inventory_is_not_split_into_callable_model_ids(self):
        for inventory in (None, [], "stage/current-a", [None]):
            with self.subTest(inventory=inventory):
                self.state["kiro"]["models"] = inventory
                before = self.snapshot()
                result = self.run_setup("--runtime", "kiro", "--llm-backend", "kiro",
                                        "--model", "s", "--apply")
                self.assert_refused_unchanged(result, before)

    def test_missing_upstream_discovery_api_is_explicit_and_does_not_write(self):
        self.module("ouroboros/copilot/model_discovery.py", "def used_fallback():\n    return False\n")
        before = self.snapshot()
        result = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                "--model", "account/current-a", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("APIs unavailable", result.stdout)

    def test_unsupported_account_adapter_does_not_invent_catalog(self):
        self.state["claude"] = {"models": ["unverified/model"]}
        self.executable("claude", "raise SystemExit('fixture forbids provider requests')\n")
        before = self.snapshot()
        result = self.run_setup("--runtime", "claude", "--llm-backend", "claude",
                                "--model", "unverified/model", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("No verified account discovery adapter", result.stdout)

    def test_malformed_config_is_not_overwritten_or_exposed_in_errors(self):
        self.config.parent.mkdir()
        self.config.write_text("api_keys: [fixture-secret-unclosed\n", encoding="utf-8")
        before = self.snapshot()
        result = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                "--model", "account/current-a", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertNotIn("fixture-secret-unclosed", result.stdout + result.stderr)

    def test_unavailable_environment_model_cannot_be_hidden_by_valid_file_or_cli_selection(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                           "llm": {"backend": "copilot"}, "models": {"default": "account/current-a"}})
        self.env["OUROBOROS_MODEL"] = "account/no-longer-available"
        for args in ((), ("--model", "account/current-b")):
            for mode in ((), ("--apply",)):
                with self.subTest(args=args, mode=mode):
                    before = self.snapshot()
                    result = self.run_setup(*args, *mode)
                    self.assert_refused_unchanged(result, before)
                    self.assertIn("OUROBOROS_MODEL", result.stdout)

    def test_matching_environment_model_is_allowed_but_conflicting_override_is_refused(self):
        self.env["OUROBOROS_MODEL"] = "account/current-b"
        report = self.report(self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                           "--model", "account/current-b"))
        self.assertEqual(report["model"], "account/current-b")
        before = self.snapshot()
        result = self.run_setup("--runtime", "copilot", "--llm-backend", "copilot",
                                "--model", "account/current-a", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("OUROBOROS_MODEL", result.stdout)

    def test_auto_environment_cannot_hide_effective_legacy_stage_selection(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                           "llm": {"backend": "copilot", "qa_model": "account/removed-stage-model"},
                           "models": {"default": "account/current-a"}})
        self.env["OUROBOROS_MODEL"] = "auto"
        before = self.snapshot()
        result = self.run_setup("--model", "account/current-b", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("OUROBOROS_MODEL", result.stdout)

    def test_ignored_legacy_stage_pins_are_preserved_and_effective_roles_are_reported(self):
        for pin in ("account/current-a", "account/removed-stage-model"):
            with self.subTest(pin=pin):
                self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                                   "llm": {"backend": "copilot", "qa_model": pin},
                                   "clarification": {"default_model": pin},
                                   "evaluation": {"semantic_model": pin},
                                   "models": {"default": "account/current-a"}})
                report = self.report(self.run_setup("--model", "account/current-b", "--apply"))
                self.assertEqual(report["effective_roles"]["copilot"], {
                    "interview": "account/current-b", "qa": "account/current-b",
                    "semantic_evaluation": "account/current-b"})
                written = yaml.safe_load(self.config.read_text())
                self.assertEqual(written["llm"]["qa_model"], pin)
                self.assertEqual(written["clarification"]["default_model"], pin)
                self.assertEqual(written["evaluation"]["semantic_model"], pin)

    def test_effective_role_profile_override_is_validated_not_hidden_by_global_model(self):
        for profile in ({"model": "account/removed-profile-model"},
                        {"model": "account/current-b", "providers": {"copilot": {"model": "account/removed-provider-model"}}}):
            with self.subTest(profile=profile):
                self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                                   "llm": {"backend": "copilot"}, "models": {"default": "account/current-a"},
                                   "llm_role_profiles": {"qa": "careful"}, "llm_profiles": {"careful": profile}})
                before = self.snapshot()
                self.assert_refused_unchanged(self.run_setup("--model", "account/current-b", "--apply"), before)

    def test_valid_provider_specific_role_profile_survives_and_controls_effective_model(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"}, "llm": {"backend": "copilot"},
                           "models": {"default": "account/current-a"}, "llm_role_profiles": {"qa": "careful"},
                           "llm_profiles": {"careful": {"model": "account/current-a", "providers": {
                               "copilot": {"model": "account/current-b"}}}}})
        before = self.snapshot()
        report = self.report(self.run_setup("--apply"))
        self.assertEqual(report["effective_roles"]["copilot"]["qa"], "account/current-b")
        self.assertEqual(report["effective_roles"]["copilot"]["interview"], "account/current-a")
        self.assertEqual(self.snapshot(), before)

    def test_unscoped_runtime_profile_accounts_are_refused_without_writes(self):
        original_env = self.env.copy()
        for source, value in (("environment", "other-account"),
                              ("structured-config", {"backend_profile": "other-account"}),
                              ("legacy-config", "other-account")):
            with self.subTest(source=source):
                self.env = original_env.copy()
                config = {"orchestrator": {"runtime_backend": "copilot"},
                          "llm": {"backend": "copilot"}, "models": {"default": "account/current-a"}}
                if source == "environment":
                    self.env["OUROBOROS_RUNTIME_PROFILE"] = value
                else:
                    config["orchestrator"]["runtime_profile"] = value
                self.write_config(config)
                for mode in ((), ("--apply",)):
                    with self.subTest(mode=mode):
                        before = self.snapshot()
                        result = self.run_setup("--model", "account/current-b", *mode)
                        self.assert_refused_unchanged(result, before)
                        self.assertIn("profile", result.stdout.lower())

    def test_completion_profile_cannot_switch_account_behind_validated_inventory(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"}, "llm": {"backend": "copilot"},
                           "models": {"default": "account/current-a"}, "llm_role_profiles": {"qa": "careful"},
                           "llm_profiles": {"careful": {"model": "account/current-b", "providers": {
                               "copilot": {"model": "account/current-b", "profile": "other-account"}}}}})
        before = self.snapshot()
        result = self.run_setup("--model", "account/current-b", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("profile", result.stdout.lower())

    def test_failed_config_commit_removes_unreported_backup_and_temporary_files(self):
        self.write_config({"orchestrator": {"runtime_backend": "copilot"},
                           "llm": {"backend": "copilot"}, "models": {"default": "account/current-a"}})
        for fault in ("backup-write", "partial-backup-write", "temporary-create", "replace"):
            with self.subTest(fault=fault):
                before = self.snapshot()
                injection = '''from types import SimpleNamespace
real_os = setup.os
real_tempfile = setup.tempfile
def denied(*args, **kwargs):
    raise OSError("fixture filesystem refused commit")
'''
                if fault == "replace":
                    injection += "setup.os = SimpleNamespace(**{**vars(real_os), 'replace': denied})\n"
                elif fault == "temporary-create":
                    injection += '''def mkstemp(*args, **kwargs):
    if '.tmp-' in kwargs.get('prefix', ''):
        return denied()
    return real_tempfile.mkstemp(*args, **kwargs)
setup.tempfile = SimpleNamespace(**{**vars(real_tempfile), 'mkstemp': mkstemp})
'''
                elif fault == "partial-backup-write":
                    injection += '''class PartialBackup:
    def __init__(self, stream):
        self.stream = stream
    def __enter__(self):
        return self
    def __exit__(self, *exception):
        self.stream.close()
    def write(self, data):
        self.stream.write(data[:max(1, len(data) // 2)])
        self.stream.flush()
        return denied()
def fdopen(fd, mode, **kwargs):
    stream = real_os.fdopen(fd, mode, **kwargs)
    return PartialBackup(stream) if mode == 'wb' else stream
setup.os = SimpleNamespace(**{**vars(real_os), 'fdopen': fdopen})
'''
                else:
                    injection += '''def fdopen(fd, mode, **kwargs):
    if mode == 'wb':
        real_os.close(fd)
        return denied()
    return real_os.fdopen(fd, mode, **kwargs)
setup.os = SimpleNamespace(**{**vars(real_os), 'fdopen': fdopen})
'''
                result = self.run_injected(injection, "--runtime", "copilot", "--llm-backend", "copilot",
                                           "--model", "account/current-b", "--apply")
                self.assert_refused_unchanged(result, before)


class OooCodexModels(AccountFixture):
    def setUp(self):
        super().setUp()
        self.executable("codex", '''import json, os, sys
from pathlib import Path

if sys.argv[1:2] != ["app-server"]:
    raise SystemExit("fixture forbids auth extraction, turns and provider requests")
state = json.loads(Path(os.environ["FIXTURE_STATE"]).read_text())["codex"]
state = state.get('accounts', {}).get(str(Path(sys.argv[0]).resolve()), state)
for line in sys.stdin:
    message = json.loads(line)
    if "id" not in message:
        continue
    method = message["method"]
    if state.get("malformed"):
        print("not-json", flush=True)
        break
    if method == "initialize":
        result = {"capabilities": {}}
        if state.get('oversized_response'):
            result['padding'] = 'x' * 4096
    elif method == "account/read":
        result = {"account": {"type": "chatgpt", "email": "fixture@example.invalid"}
                  if state.get("authenticated") else None}
    elif method == "model/list":
        pages = state.get("pages", [state["models"]])
        page = int(message["params"].get("cursor") or 0)
        result = {"data": [{"model": model} for model in pages[page]],
                  "nextCursor": str(page + 1) if page + 1 < len(pages) else None}
        if state.get("repeated_cursor"):
            result["nextCursor"] = "0"
        if state.get("bad_catalog"):
            result["data"] = {"native/alpha": True}
    elif method == "config/read":
        result = {"config": {"model": state.get("current")}}
    else:
        raise SystemExit("fixture forbids non-read-only method: " + method)
    for _ in range(state.get('notifications', 0)):
        print(json.dumps({'method': 'fixture/notification'}), flush=True)
    print(json.dumps({"id": message["id"], "result": result}), flush=True)
''')

    def test_codex_inherits_current_selection_without_pinning_legacy_model(self):
        self.state["codex"]["pages"] = [["native/alpha"], ["native/beta"]]
        for selected in ("native/beta", "native/alpha"):
            with self.subTest(selected=selected):
                self.state["codex"]["current"] = selected
                before = self.snapshot()
                report = self.report(self.run_setup("--runtime", "codex", "--llm-backend", "codex"))
                inventory = report["inventories"]["codex"]
                self.assertEqual(inventory["current_model"], selected)
                self.assertEqual(inventory["models"], ["native/alpha", "native/beta"])
                self.assertEqual(inventory["selection"], "inherit-current")
                self.assertIn("cache", inventory["account_scope"].lower())
                self.assertIn("not independently verified", inventory["account_scope"].lower())
                self.assertEqual(self.snapshot(), before)
        report = self.report(self.run_setup("--runtime", "codex", "--llm-backend", "codex", "--apply"))
        self.assertEqual(report["status"], "applied")
        self.assertEqual(yaml.safe_load(self.config.read_text())["models"]["default"], "default")

    def test_codex_exact_model_requires_authenticated_native_catalog_membership(self):
        report = self.report(self.run_setup("--runtime", "codex", "--llm-backend", "codex",
                                           "--model", "native/beta", "--apply"))
        self.assertEqual(report["status"], "applied")
        self.assertEqual(yaml.safe_load(self.config.read_text())["models"]["default"], "native/beta")
        self.state["codex"]["models"] = ["native/alpha"]
        self.state["codex"]["current"] = "native/alpha"
        before = self.snapshot()
        self.assert_refused_unchanged(self.run_setup("--apply"), before)

    def test_explicit_codex_model_with_concrete_generic_profile_migrates_dormant_native_selection(self):
        self.state["codex"]["current"] = "native/removed"
        self.write_config({"orchestrator": {"runtime_backend": "codex"}, "llm": {"backend": "codex"},
                           "models": {"default": "native/alpha"}, "llm_role_profiles": {"agent_runtime": "concrete"},
                           "llm_profiles": {"concrete": {"model": "native/beta"}}})
        self.state_path.write_text(json.dumps(self.state), encoding="utf-8")
        native_before = self.state_path.read_bytes()
        report = self.report(self.run_setup("--runtime", "codex", "--llm-backend", "codex",
                                           "--model", "native/beta", "--apply"))
        self.assertEqual(report["status"], "applied")
        self.assertEqual(report["model"], "native/beta")
        self.assertEqual(report["inventories"]["codex"]["current_model"], "native/removed")
        self.assertEqual(set(report["effective_roles"]["codex"].values()), {"native/beta"})
        self.assertEqual(yaml.safe_load(self.config.read_text())["models"]["default"], "native/beta")
        self.assertEqual(self.state_path.read_bytes(), native_before)

    def test_explicit_codex_model_cannot_hide_unavailable_generic_inheritance(self):
        self.state["codex"]["current"] = "native/removed"
        before = self.snapshot()
        result = self.run_setup("--runtime", "codex", "--llm-backend", "codex",
                                "--model", "native/beta", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("current", result.stdout.lower())

    def test_generic_runtime_profile_cannot_hide_removed_model_or_native_account_switch(self):
        cases = (("agent_runtime", {"model": "native/removed"}),
                 ("agent_runtime_worker", {"model": "native/removed"}),
                 ("agent_runtime", {"model": "native/alpha", "providers": {"codex": {"profile": "other-account"}}}))
        for role, profile in cases:
            with self.subTest(role=role, profile=profile):
                self.write_config({"orchestrator": {"runtime_backend": "codex"}, "llm": {"backend": "codex"},
                                   "models": {"default": "native/alpha"}, "llm_role_profiles": {role: "careful"},
                                   "llm_profiles": {"careful": profile}})
                before = self.snapshot()
                result = self.run_setup("--model", "native/beta", "--apply")
                self.assert_refused_unchanged(result, before)

    def test_valid_generic_runtime_member_is_preserved_and_reported_independently(self):
        self.write_config({"orchestrator": {"runtime_backend": "codex"}, "llm": {"backend": "codex"},
                           "models": {"default": "native/beta"}, "llm_role_profiles": {"agent_runtime": "careful"},
                           "llm_profiles": {"careful": {"model": "native/alpha"}}})
        before = self.snapshot()
        report = self.report(self.run_setup("--model", "native/beta", "--apply"))
        self.assertEqual(report["effective_roles"]["codex"]["agent_runtime"], "native/alpha")
        self.assertEqual(report["effective_roles"]["codex"]["interview"], "native/beta")
        self.assertEqual(self.snapshot(), before)

    def test_generic_runtime_uses_native_completion_fallback_not_stage_global_resolution(self):
        self.write_config({"orchestrator": {"runtime_backend": "codex"}, "llm": {"backend": "codex"},
                           "models": {"default": "native/alpha"}, "llm_role_profiles": {"agent_runtime": "careful"},
                           "llm_profiles": {"careful": {"temperature": 0.2}}})
        report = self.report(self.run_setup("--model", "native/beta", "--apply"))
        self.assertEqual(report["effective_roles"]["codex"]["agent_runtime"], "default")
        self.assertEqual(report["effective_roles"]["codex"]["interview"], "native/beta")
        self.assertEqual(yaml.safe_load(self.config.read_text())["models"]["default"], "native/beta")

    def test_codex_auth_protocol_and_inventory_fail_closed(self):
        cases = {
            "missing_auth": {"authenticated": False},
            "missing_cli": {"missing_cli": True},
            "unsupported_upstream": {"selection": "explicit"},
            "malformed_rpc": {"malformed": True},
            "malformed_inventory": {"bad_catalog": True},
            "empty_inventory": {"models": []},
            "current_model_not_available": {"current": "native/removed"},
            "pagination_loop": {"repeated_cursor": True},
        }
        initial = self.state["codex"].copy()
        for name, override in cases.items():
            with self.subTest(name=name):
                self.state["codex"] = {**initial, **override}
                before = self.snapshot()
                result = self.run_setup("--runtime", "codex", "--llm-backend", "codex", "--apply")
                self.assert_refused_unchanged(result, before)

    def different_cli_accounts(self, runtime):
        home_cli = self.bin / runtime
        target_cli = self.bin / (runtime + "-target")
        target_cli.write_bytes(home_cli.read_bytes())
        target_cli.chmod(0o700)
        target_model = runtime + "/target-only"
        original = self.state[runtime].copy()
        self.state[runtime]["accounts"] = {
            str(home_cli): original,
            str(target_cli): {**original, "models": [target_model], "current": target_model},
        }
        home_config = self.home / ".ouroboros/config.yaml"
        home_config.parent.mkdir(exist_ok=True)
        home_config.write_text(yaml.safe_dump({"orchestrator": {runtime + "_cli_path": str(home_cli)}}))
        self.config = self.work / (runtime + " target project") / "config.yaml"
        self.write_config({"orchestrator": {"runtime_backend": runtime, runtime + "_cli_path": str(target_cli)},
                           "llm": {"backend": runtime}, "models": {"default": target_model}})
        return target_model

    def test_target_config_cli_uses_target_account_not_home_account(self):
        for runtime in ("codex", "kiro"):
            with self.subTest(runtime=runtime):
                target_model = self.different_cli_accounts(runtime)
                before = self.snapshot()
                report = self.report(self.run_setup())
                self.assertEqual(report["inventories"][runtime]["models"], [target_model])
                self.assertEqual(report["model"], target_model)
                self.assertEqual(self.snapshot(), before)

    def test_unavailable_target_cli_does_not_fall_back_to_other_account(self):
        for runtime in ("codex", "kiro"):
            with self.subTest(runtime=runtime):
                self.different_cli_accounts(runtime)
                config = yaml.safe_load(self.config.read_text())
                config["orchestrator"][runtime + "_cli_path"] = str(self.bin / "missing-target-runtime")
                config["models"]["default"] = self.state[runtime]["models"][0]
                self.write_config(config)
                before = self.snapshot()
                self.assert_refused_unchanged(self.run_setup("--apply"), before)

    def test_explicit_backends_cannot_hide_conflicting_runtime_environment(self):
        original_env = self.env.copy()
        for key in ("OUROBOROS_RUNTIME", "OUROBOROS_AGENT_RUNTIME", "OUROBOROS_LLM_BACKEND"):
            with self.subTest(key=key):
                self.env = {**original_env, key: "kiro"}
                before = self.snapshot()
                result = self.run_setup("--runtime", "codex", "--llm-backend", "codex", "--apply")
                self.assert_refused_unchanged(result, before)
                self.assertIn(key, result.stdout)

    def test_winning_matching_backend_environment_masks_lower_priority_shared_runtime(self):
        self.env.update({"OUROBOROS_RUNTIME": "kiro", "OUROBOROS_AGENT_RUNTIME": "codex",
                         "OUROBOROS_LLM_BACKEND": "codex"})
        report = self.report(self.run_setup("--runtime", "codex", "--llm-backend", "codex", "--apply"))
        self.assertEqual(report["runtime"], "codex")
        self.assertEqual(report["llm_backend"], "codex")
        self.assertEqual(yaml.safe_load(self.config.read_text())["orchestrator"]["runtime_backend"], "codex")

    def test_unique_catalog_pages_have_a_finite_discovery_limit(self):
        self.state["codex"]["pages"] = [["native/beta"] for _ in range(4)]
        before = self.snapshot()
        result = self.run_injected("setup.MAX_MODEL_PAGES = 2\n", "--runtime", "codex",
                                   "--llm-backend", "codex", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertIn("page", result.stdout.lower())

    def test_oversized_native_response_is_rejected_before_configuration_write(self):
        self.state["codex"]["oversized_response"] = True
        before = self.snapshot()
        result = self.run_injected("setup.MAX_LINE_BYTES = 256\n", "--runtime", "codex",
                                   "--llm-backend", "codex", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertRegex(result.stdout.lower(), "size|large|limit")

    def test_expired_deadline_cannot_be_extended_by_notifications_and_reaps_runtime(self):
        self.state["codex"]["notifications"] = 32
        pid_file = self.work / "owned-runtime.pid"
        sent_file = self.work / "native-requests.jsonl"
        injection = f'''from types import SimpleNamespace
import itertools, threading, time
ready = threading.Event()
class InputAudit:
    def __init__(self, source):
        self.source = source
    def write(self, data):
        message = setup.json.loads(data)
        if 'id' in message:
            with open({str(sent_file)!r}, 'a') as log:
                log.write(setup.json.dumps(message['method']) + '\\n')
        return self.source.write(data)
    def flush(self):
        self.source.flush()
    def close(self):
        self.source.close()
class ReadyStream:
    def __init__(self, source):
        self.source, self.reads = source, 0
    def readline(self, limit=-1):
        self.reads += 1
        if self.reads == 34:
            ready.set()  # All 32 notifications and initialize response are queued.
        return self.source.readline(limit)
    def close(self):
        self.source.close()
real_subprocess = setup.subprocess
def popen(*args, **kwargs):
    child = real_subprocess.Popen(*args, **kwargs)
    open({str(pid_file)!r}, 'w').write(str(child.pid))
    child.stdin, child.stdout = InputAudit(child.stdin), ReadyStream(child.stdout)
    return child
setup.subprocess = SimpleNamespace(**{{**vars(real_subprocess), 'Popen': popen}})
clock = itertools.count(0, 2)
def monotonic():
    tick = next(clock)
    if tick and not ready.wait(timeout=5):
        raise RuntimeError('fixture stream did not signal ready')
    return tick
proxy_time = SimpleNamespace(**{{**vars(time), 'monotonic': monotonic}})
setup.time = proxy_time
sys.modules['time'] = proxy_time
setup.REQUEST_TIMEOUT_SECONDS = 1
setup.DISCOVERY_TIMEOUT_SECONDS = 1
'''
        before = self.snapshot()
        result = self.run_injected(injection, "--runtime", "codex", "--llm-backend", "codex", "--apply")
        self.assert_refused_unchanged(result, before)
        self.assertRegex(result.stdout.lower(), "deadline|timeout|timed out")
        self.assertEqual([json.loads(line) for line in sent_file.read_text().splitlines()], ["initialize"],
                         "An expired discovery must not advance to account/model requests even with queued messages")
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)


class OooInstallerAccountModels(AccountFixture):
    def run_installer(self, **options):
        self.state_path.write_text(json.dumps(self.state), encoding="utf-8")
        dirname = self.bin / "dirname"
        if not dirname.exists():
            dirname.symlink_to("/usr/bin/dirname")
        env = {**self.env, "PYTHON_BIN": sys.executable, "SKIP_SKILL": "1", "SKIP_PACKAGE": "1",
               "OOO_GIT_INTERVIEW": "0", "OOO_SPEC_KIT": "0", "OOO_CLI_ANYTHING": "0",
               "OOO_RUNTIME": "copilot", "OOO_LLM_BACKEND": "copilot",
               "OOO_MODEL": "account/current-b", "OOO_CONFIG": str(self.config), **options}
        env = {key: value for key, value in env.items() if value is not None}
        return subprocess.run(["/bin/bash", str(SETUP.parent / "install.sh")], cwd=self.work, env=env,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)

    def test_installer_previews_model_config_until_explicit_model_apply(self):
        before = self.snapshot()
        preview = self.run_installer()
        self.assertEqual(preview.returncode, 0, preview.stdout)
        report = next(json.loads(line) for line in preview.stdout.splitlines() if line.startswith("{"))
        self.assertEqual(report["status"], "preview")
        self.assertEqual(report["model"], "account/current-b")
        self.assertEqual(self.snapshot(), before)
        applied = self.run_installer(OOO_MODEL_APPLY="1")
        self.assertEqual(applied.returncode, 0, applied.stdout)
        written = yaml.safe_load(self.config.read_text())
        self.assertEqual(written["models"]["default"], "account/current-b")
        self.assertEqual(written["orchestrator"]["runtime_backend"], "copilot")
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)

    def test_installer_apply_fails_without_account_inventory_or_config_writes(self):
        self.state["copilot"]["fallback"] = True
        before = self.snapshot()
        applied = self.run_installer(OOO_MODEL_APPLY="1")
        self.assertNotEqual(applied.returncode, 0, applied.stdout)
        self.assertIn("fallback refused", applied.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_skipped_package_without_runtime_intent_never_executes_selected_python(self):
        marker = self.work / "unexpected-interpreter-run"
        self.executable("selected-python", f"from pathlib import Path\nPath({str(marker)!r}).write_text('invoked')\nraise SystemExit(91)\n")
        before = self.snapshot()
        result = self.run_installer(PYTHON_BIN=str(self.bin / "selected-python"), OOO_RUNTIME=None,
                                    OOO_LLM_BACKEND=None, OOO_MODEL=None)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(marker.exists(), "No-package/no-runtime installation must not execute Python")
        self.assertEqual(self.snapshot(), before)

    def test_helper_help_documents_accepted_cli_without_discovery_or_writes(self):
        self.state["copilot"]["error"] = True
        before = self.snapshot()
        result = self.run_setup("--help")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for flag in ("--runtime", "--llm-backend", "--model", "--config", "--apply"):
            self.assertIn(flag, result.stdout)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
