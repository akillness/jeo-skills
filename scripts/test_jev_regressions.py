#!/usr/bin/env python3
"""Public CLI Jev regressions using isolated homes and genuine loopback HTTP.

Run: python3 scripts/test_jev_regressions.py -v
Only external installer/service CLIs are faked; Jev setup and invocation are real.
"""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "jev/jev-harness.mjs"
SETUP = ROOT / "jev/jev-setup.sh"
TASK = "Repair React performance"
PROPOSAL = {"patch": "fix render", "evidence": "focused test passed"}
FAVORABLE = {"addresses_task": .96, "evidence_supports": .94,
             "unrelated_changes": .03, "needs_clarification": .04}


class JevRegressions(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="jev-regression-")
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name)
        self.home = self.work / "home with spaces"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        node = os.environ.get("INSTALLER_TEST_NODE") or shutil.which("node")
        self.assertIsNotNone(node, "A real Node.js binary is required")
        self.node = str(node)
        (self.bin / "node").symlink_to(node)
        (self.bin / "python3").symlink_to(sys.executable)
        self.env = {"HOME": str(self.home), "PATH": str(self.bin) + os.pathsep + os.defpath,
                    "TMPDIR": str(self.work), "PYTHONDONTWRITEBYTECODE": "1"}
        self.catalog = self.work / "catalog.json"
        self.catalog.write_text(json.dumps({
            "categories": {"web": {}, "infrastructure": {}},
            "skills": [
                {"name": "react-performance", "category": "web", "description": "Repair React performance"},
                {"name": "database-performance", "category": "infrastructure", "description": "Repair database performance"},
            ],
        }))
        self.env["JEV_CATALOG_PATH"] = str(self.catalog)
        self.external_log = self.work / "external.log"
        self.stub("curl", "exit 91")
        self.stub("pip", "exit 91")

    def stub(self, name, body):
        path = self.bin / name
        path.write_text(f"#!/bin/sh\nprintf '%s\\n' '{name}' \"$*\" >> '{self.external_log}'\n{body}\n")
        path.chmod(0o700)

    def run_cli(self, *args, env=None, input=None, harness=None):
        return self.execute([self.node, str(harness or HARNESS), *args], env, input)

    def execute(self, command, env=None, input=None, cwd=None):
        return subprocess.run(command, env={**self.env, **(env or {})},
                              cwd=cwd or self.work, input=input or "", text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)

    def successful(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def config(self, **values):
        path = self.home / ".agents/jev/.env"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
        path.chmod(0o600)
        return path

    @contextmanager
    def backend(self, response=None, code=200, raw=None, models=None, stall_path=None):
        requests = []
        release_body = threading.Event()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def stalled_body(self):
                if self.path != stall_path:
                    return False
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{')
                self.wfile.flush()
                release_body.wait()
                return True

            def do_GET(self):
                requests.append(("GET", self.path, dict(self.headers), None))
                if self.stalled_body():
                    return
                payload = {"data": models if models is not None else [{"id": "fixture-JEV-9B"}]}
                self.send_response(code)
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append(("POST", self.path, dict(self.headers), body))
                if self.stalled_body():
                    return
                if response is not None:
                    payload = response(body) if callable(response) else response
                elif self.path == "/v1/systemone":
                    if "family" in body["questions"]:
                        payload = {"answers": {"family": {"choice": "infrastructure"}}}
                    elif "essential" in body["questions"]:
                        payload = {"answers": {"essential": {"probability": body["state"]["probability"]}}}
                    else:
                        payload = {"model": "fixture-JEV-9B", "answers": FAVORABLE}
                else:
                    user = body["messages"][-1]["content"]
                    decision = {"probabilities": {"web": .02, "infrastructure": .97}}
                    if "Options:" not in user:
                        decision = {"probability": .96 if "directly address" in user or "evidence support" in user else .03}
                    content = json.dumps(decision)
                    payload = ({"message": {"content": content}} if self.path == "/api/chat"
                               else {"choices": [{"message": {"content": content}}]})
                self.send_response(code)
                self.end_headers()
                self.wfile.write(raw if raw is not None else json.dumps(payload).encode())

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", requests
        finally:
            release_body.set()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_standalone_skip_and_unset_without_tty_leave_home_untouched(self):
        for mode in (None, "skip"):
            with self.subTest(mode=mode):
                env = {} if mode is None else {"JEO_SKILLS_JEV": mode}
                result = self.execute(["/bin/bash", str(SETUP)], env)
                self.successful(result)
                self.assertEqual(list(self.home.iterdir()), [])
                self.assertFalse(self.external_log.exists())

    def test_setup_guide_optional_block_is_noop_with_and_without_checkout(self):
        text = (ROOT / "setup-all-skills-prompt.md").read_text()
        section = text.split("### Jev control-plane harness (System One)", 1)[1].split("\n### ", 1)[0]
        block = re.search(r"```(?:bash|sh)\n(.*?)\n```", section, re.S).group(1)
        for cwd in (ROOT, self.work):
            for mode in (None, "skip"):
                with self.subTest(checkout=cwd == ROOT, mode=mode):
                    home = self.work / f"guide-home-{cwd == ROOT}-{mode}"
                    home.mkdir()
                    self.external_log.unlink(missing_ok=True)
                    env = {"USER_HOME": str(home), "HOME": str(home)}
                    if mode is not None:
                        env["JEO_SKILLS_JEV"] = mode
                    self.successful(self.execute(["/bin/bash"], env, block, cwd))
                    self.assertEqual(list(home.iterdir()), [])
                    self.assertFalse(self.external_log.exists())

    def test_setup_modes_preserve_endpoint_and_write_private_usable_configuration(self):
        self.stub("pgrep", "exit 0")
        self.stub("ollama", "exit 0")
        self.stub("lms", "exit 0")
        venv = self.home / ".agents/jev/venv/bin"
        venv.mkdir(parents=True)
        (venv / "python").symlink_to(sys.executable)
        dependencies = self.work / "dependencies"
        dependencies.mkdir()
        for name in ("torch", "transformers", "accelerate", "huggingface_hub"):
            (dependencies / f"{name}.py").write_text("")
        with self.backend() as (base, requests):
            for mode in ("api", "local", "ollama", "lmstudio"):
                with self.subTest(mode=mode):
                    endpoint = base + "/v1/systemone" if mode in ("api", "local") else base
                    env = {"JEO_SKILLS_JEV": mode, "JEV_ENDPOINT": endpoint,
                           "JEV_API_KEY": "fixture-secret-$-equals=", "JEV_LOCAL_MODEL": "fixture-JEV-9B",
                           "JEV_SKIP_MODEL_DOWNLOAD": "true", "PYTHONPATH": str(dependencies)}
                    result = self.execute(["/bin/bash", str(SETUP)], env, cwd=ROOT)
                    self.successful(result)
                    path = self.home / ".agents/jev/.env"
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                    self.assertNotIn(env["JEV_API_KEY"], result.stdout + result.stderr)
                    routed = self.run_cli("route-skills", "--top-k", "1", TASK,
                                          harness=path.parent / "jev-harness.mjs")
                    self.successful(routed)
                    self.assertEqual(json.loads(routed.stdout)["topK"][0]["name"], "database-performance")
                    posts = [row for row in requests if row[0] == "POST"]
                    self.assertGreater(len(posts), 0)
                    self.assertEqual(posts[-1][2].get("Authorization"),
                                     "Bearer fixture-secret-$-equals=" if mode == "api" else None)
                    requests.clear()

    def test_missing_api_key_fails_before_installing_files(self):
        result = self.execute(["/bin/bash", str(SETUP)], {"JEO_SKILLS_JEV": "api"})
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list(self.home.iterdir()), [])
        self.assertFalse(self.external_log.exists())

    def test_multiline_config_values_cannot_inject_persistent_configuration(self):
        for key, value in (("JEV_API_KEY", "token\nJEV_MODE=local"),
                           ("JEV_ENDPOINT", "http://127.0.0.1\nJEV_API_KEY=leaked")):
            with self.subTest(key=key):
                env = {"JEO_SKILLS_JEV": "api", "JEV_API_KEY": "fixture-secret", key: value}
                result = self.execute(["/bin/bash", str(SETUP)], env)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(list(self.home.iterdir()), [])

    def test_local_rerun_repairs_dependencies_and_resumes_partial_model(self):
        dependencies = self.work / "dependencies"
        dependencies.mkdir()
        (dependencies / "torch.py").write_text("raise ImportError('interrupted dependency install')\n")
        for name in ("transformers", "accelerate"):
            (dependencies / f"{name}.py").write_text("")
        (dependencies / "huggingface_hub.py").write_text(
            "from pathlib import Path\n"
            "def snapshot_download(repo_id, local_dir):\n"
            "    import torch\n"
            "    Path(local_dir, 'weights.fixture').write_bytes(b'completed download')\n")
        venv = self.home / ".agents/jev/venv/bin"
        venv.mkdir(parents=True)
        (venv / "python").symlink_to(sys.executable)
        pip = dependencies / "pip.py"
        pip.write_text("import os, pathlib, sys\n"
                       "if 'torch' in sys.argv:\n"
                       "    assert sys.prefix != sys.base_prefix, 'dependency install escaped the virtualenv'\n"
                       "    pathlib.Path(os.environ['PYTHONPATH'], 'torch.py').write_text('')\n")
        model = self.home / ".agents/jev/models/JEV-9B"
        model.mkdir(parents=True)
        (model / "partial.fixture").write_bytes(b'partial prior download')
        with self.backend() as (base, requests):
            env = {"JEO_SKILLS_JEV": "local", "JEV_SKIP_MODEL_DOWNLOAD": "false",
                   "JEV_ENDPOINT": base + "/v1/systemone", "PYTHONPATH": str(dependencies)}
            self.successful(self.execute(["/bin/bash", str(SETUP)], env))
            self.assertEqual((model / "weights.fixture").read_bytes(), b'completed download')
            # Once dependencies work, a rerun must not require their installer.
            pip.write_text("import sys\nif '--version' not in sys.argv: raise SystemExit(91)\n")
            self.successful(self.execute(["/bin/bash", str(SETUP)], env))
            routed = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(routed)
            self.assertEqual(json.loads(routed.stdout)["families"], ["infrastructure"])

    def test_existing_unreadable_configuration_is_invalid_not_optional_bypass(self):
        path = self.home / ".agents/jev/.env"
        path.mkdir(parents=True)
        status = self.run_cli("status")
        self.assertEqual(status.returncode, 3, status.stdout + status.stderr)
        reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL))
        self.successful(reviewed)
        self.assertEqual(json.loads(reviewed.stdout)["verdict"], "unavailable")
        routed = self.run_cli("route-skills", TASK)
        self.assertNotEqual(routed.returncode, 0, routed.stdout + routed.stderr)
        self.assertEqual(routed.stdout, "")
        with self.backend() as (base, requests):
            env = {"JEV_MODE": "api", "JEV_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "explicit-secret"}
            reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL), env=env)
            self.successful(reviewed)
            self.assertEqual(json.loads(reviewed.stdout)["verdict"], "permit")
            self.assertEqual(requests[0][2]["Authorization"], "Bearer explicit-secret")

    def test_empty_and_partial_saved_configuration_cannot_become_inactive_bypass(self):
        path = self.config(JEV_MODE="api")
        with self.backend() as (base, requests):
            for name, content in (("empty", ""), ("missing-key", "JEV_MODE=api\n"),
                                  ("missing-mode", "JEV_ENDPOINT=http://127.0.0.1\n"),
                                  ("invalid-mode", "JEV_MODE=invalid\n")):
                with self.subTest(case=name):
                    path.write_text(content)
                    status = self.run_cli("status")
                    self.assertEqual(status.returncode, 3, status.stdout + status.stderr)
                    reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL))
                    self.successful(reviewed)
                    self.assertEqual(json.loads(reviewed.stdout)["verdict"], "unavailable")
                    env = {"JEV_MODE": "api", "JEV_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "explicit-secret"}
                    overridden = self.run_cli("review", TASK, json.dumps(PROPOSAL), env=env)
                    self.successful(overridden)
                    self.assertEqual(json.loads(overridden.stdout)["verdict"], "permit")

    def test_status_distinguishes_no_opt_in_from_unreachable_configured_backend(self):
        inactive = self.run_cli("status")
        self.assertEqual(inactive.returncode, 2, inactive.stderr)
        self.assertFalse(json.loads(inactive.stdout)["active"])
        # Reserve an unlistening socket so no unrelated local process can answer.
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            endpoint = f"http://127.0.0.1:{reserved.getsockname()[1]}/v1/systemone"
            self.config(JEV_MODE="local", JEV_ENDPOINT=endpoint)
            configured = self.run_cli("status")
            report = json.loads(configured.stdout)
            self.assertEqual(configured.returncode, 3, configured.stderr)
            self.assertTrue(report["active"])
            self.assertFalse(report["ready"])
            operation = self.run_cli("review", TASK, json.dumps(PROPOSAL))
            self.successful(operation)
            self.assertEqual(json.loads(operation.stdout)["verdict"], "unavailable")
        self.config(JEV_MODE="api", JEV_API_KEY="unverified-secret", JEV_ENDPOINT=endpoint)
        api = self.run_cli("status")
        self.successful(api)
        self.assertTrue(json.loads(api.stdout)["active"])
        self.assertIsNone(json.loads(api.stdout)["ready"])

    def test_all_adapters_use_real_backend_decisions_not_task_keyword_mock(self):
        with self.backend(models=[{"id": "unrelated-model"}, {"id": "fixture-JEV-9B"}]) as (base, requests):
            for mode, path in (("api", "/v1/systemone"), ("local", "/v1/systemone"),
                               ("ollama", "/api/chat"), ("lmstudio", "/v1/chat/completions")):
                with self.subTest(mode=mode):
                    self.config(JEV_MODE=mode, JEV_ENDPOINT=base + path if mode in ("api", "local") else base,
                                JEV_API_KEY="routing-secret", **({"JEV_LOCAL_MODEL": "fixture-JEV-9B"} if mode == "ollama" else {}))
                    result = self.run_cli("route-skills", "--top-k", "1", TASK)
                    self.successful(result)
                    report = json.loads(result.stdout)
                    self.assertEqual(report["families"], ["infrastructure"])
                    self.assertEqual([skill["name"] for skill in report["topK"]], ["database-performance"])
                    posts = [row for row in requests if row[0] == "POST"]
                    self.assertEqual(posts[-1][1], path)
                    if mode in ("api", "local"):
                        self.assertEqual(posts[-1][3]["state"]["task"], TASK)
                    else:
                        self.assertEqual(posts[-1][3]["model"], "fixture-JEV-9B")
                        self.assertIn(TASK, posts[-1][3]["messages"][-1]["content"])
                    requests.clear()
                    reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL))
                    self.successful(reviewed)
                    self.assertEqual(json.loads(reviewed.stdout)["verdict"], "permit")
                    requests.clear()

    def test_process_env_overrides_dotenv_routing_and_credentials(self):
        with self.backend(response={"answers": {"family": {"choice": "web"}}}) as (stored, stored_requests):
            with self.backend() as (explicit, explicit_requests):
                self.config(JEV_MODE="api", JEV_ENDPOINT=stored + "/v1/systemone", JEV_API_KEY="stored-secret")
                result = self.run_cli("route-skills", "--top-k", "1", TASK,
                                      env={"JEV_ENDPOINT": explicit + "/v1/systemone", "JEV_API_KEY": "explicit-secret"})
                self.successful(result)
                self.assertEqual(json.loads(result.stdout)["families"], ["infrastructure"])
                self.assertEqual(stored_requests, [])
                self.assertEqual(explicit_requests[0][2]["Authorization"], "Bearer explicit-secret")

    def test_malformed_and_error_backends_never_authorize_or_route_via_fallback(self):
        failures = (("bad-json", 200, b"not json", None),
                    ("missing-answers", 200, None, {}),
                    ("server-error", 503, None, {"error": "fixture unavailable"}),
                    ("invalid-probability", 200, None, {"answers": {**FAVORABLE, "addresses_task": "yes"}}))
        failures += (("empty-choice", 200, None, {"answers": {"family": {"choice": []}}}),
                     ("empty-probabilities", 200, None, {"answers": {"family": {"probabilities": {}}}}),
                     ("unknown-choice", 200, None, {"answers": {"family": {"choice": "unknown"}}}))
        failures += (("no-relevant-category", 200, None,
                      {"answers": {"family": {"probabilities": {"web": 0, "infrastructure": 0}}}}),)
        for mode in ("api", "local"):
            for name, code, raw, response in failures:
                with self.subTest(mode=mode, case=name):
                    with self.backend(response=response, code=code, raw=raw) as (base, requests):
                        self.config(JEV_MODE=mode, JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="fixture-secret")
                        reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL))
                        self.successful(reviewed)
                        self.assertEqual(json.loads(reviewed.stdout)["verdict"], "unavailable")
                        routed = self.run_cli("route-skills", TASK)
                        self.assertNotEqual(routed.returncode, 0, routed.stdout)
                        self.assertEqual(routed.stdout, "")
                        self.assertEqual(len(requests), 2)

    def test_explicit_empty_api_key_suppresses_saved_secret_without_network(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="saved-secret")
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_API_KEY": ""})
            self.successful(result)
            self.assertEqual(json.loads(result.stdout)["verdict"], "unavailable")
            self.assertEqual(requests, [])
            status = self.run_cli("status", env={"JEV_API_KEY": ""})
            self.assertEqual(status.returncode, 2, status.stdout + status.stderr)
            self.assertFalse(json.loads(status.stdout)["active"])

    def test_incomplete_api_mode_override_cannot_disable_saved_local_opt_in(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            env = {"JEV_MODE": "api"}
            status = self.run_cli("status", env=env)
            self.assertEqual(status.returncode, 3, status.stdout + status.stderr)
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env=env)
            self.successful(result)
            self.assertEqual(json.loads(result.stdout)["verdict"], "unavailable")
            self.assertEqual(requests, [])

    def test_setup_rejects_symlink_destinations_before_any_writes(self):
        (self.bin / "python3").unlink()
        self.stub("python3", "exit 91")
        destinations = ((".agents", True), (".agents/jev", True), (".agents/rules", True),
                        (".agents/jev/.env", False), (".agents/jev/jev-harness.mjs", False),
                        (".agents/jev/jev-setup.sh", False), (".agents/jev/jev_local_server.py", False),
                        (".agents/jev/README.md", False), (".agents/jev/jev-control-plane.rule.md", False),
                        (".agents/rules/jev-control-plane.md", False))
        destinations += ((".agents/jev/venv", True), (".agents/jev/venv/bin", True),
                         (".agents/jev/models", True), (".agents/jev/models/JEV-9B", True),
                         ("custom-model-root", True), ("custom-model-root/JEV-9B", True))
        for i, (destination, directory) in enumerate(destinations):
            with self.subTest(destination=destination):
                home = self.work / f"symlink-home-{i}"
                home.mkdir()
                outside = self.work / f"outside-{i}"
                if directory:
                    outside.mkdir()
                    (outside / "sentinel").write_bytes(b'preserve user files')
                else:
                    outside.write_bytes(b'preserve user files')
                target = home / destination
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(outside, target_is_directory=directory)
                snapshot = lambda: {str(path.relative_to(self.work)):
                                    ("link", os.readlink(path)) if path.is_symlink()
                                    else ("file", path.read_bytes()) if path.is_file() else ("directory",)
                                    for path in self.work.rglob("*")}
                env = {"HOME": str(home), "JEO_SKILLS_JEV": "api" if i < 10 else "local",
                       "JEV_API_KEY": "fixture-secret", "JEV_SKIP_MODEL_DOWNLOAD": "true"}
                if destination.startswith("custom-model-root"):
                    env["JEV_LOCAL_MODEL_DIR"] = str(home / "custom-model-root/JEV-9B")
                before = snapshot()
                result = self.execute(["/bin/bash", str(SETUP)], env)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(snapshot(), before)

    def test_registry_fallback_shell_command_keeps_task_substitutions_literal(self):
        npx = self.bin / "npx"
        npx.write_text(f"#!{sys.executable}\nimport json, sys\nprint(json.dumps(sys.argv[1:]))\n")
        npx.chmod(0o700)
        payloads = ("unknown $(touch compromised-dollar)", "unknown `touch compromised-backtick`",
                    "unknown '; touch compromised-quote; '", "unknown \"; touch compromised-double; #")
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="fixture-secret")
            for i, task in enumerate(payloads):
                with self.subTest(task=task):
                    shell_cwd = self.work / f"shell-case-{i}"
                    shell_cwd.mkdir()
                    result = self.run_cli("route-skills", "--top-k", "1", task)
                    self.successful(result)
                    command = json.loads(result.stdout)["publicRegistryFallback"]["command"]
                    searched = self.execute(["/bin/bash", "-c", command], cwd=shell_cwd)
                    self.successful(searched)
                    self.assertEqual(list(shell_cwd.iterdir()), [])
                    self.assertEqual(json.loads(searched.stdout), ["skills", "find", task])

    def test_pruning_preserves_uncertain_blocks_and_drops_only_confident_no(self):
        response = lambda body: {"answers": {"essential": float(body["state"]["text"])}}
        with self.backend(response=response) as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            blocks = [{"id": name, "text": str(prob)} for name, prob in
                      (("confident-no", .19), ("uncertain-no", .21),
                       ("near-even", .49), ("uncertain-yes", .6), ("confident-yes", .95))]
            result = self.run_cli("prune-context", input="\n".join(map(json.dumps, blocks)))
            self.successful(result)
            self.assertEqual([json.loads(line) for line in result.stdout.splitlines()],
                             [{"id": block["id"], "verdict": "drop" if i == 0 else "keep"}
                              for i, block in enumerate(blocks)])

    def test_setup_guide_explicit_project_opt_in_rejects_without_side_effects(self):
        text = (ROOT / "setup-all-skills-prompt.md").read_text()
        section = text.split("### Jev control-plane harness (System One)", 1)[1].split("\n### ", 1)[0]
        block = re.search(r"```(?:bash|sh)\n(.*?)\n```", section, re.S).group(1)
        result = self.execute(["/bin/bash"], {"USER_HOME": str(self.home),
                              "INSTALL_GLOBAL": "false", "JEO_SKILLS_JEV": "api",
                              "JEV_API_KEY": "fixture-secret"}, block, ROOT)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list(self.home.iterdir()), [])
        self.assertFalse(self.external_log.exists())

    def test_deadlines_cover_stalled_response_bodies_not_just_headers(self):
        scenarios = [(mode, "request") for mode in ("api", "local", "ollama", "lmstudio")]
        scenarios += [(mode, "status") for mode in ("local", "ollama", "lmstudio")]
        for mode, operation in scenarios:
            with self.subTest(mode=mode, operation=operation):
                stall_path = ({"ollama": "/api/chat", "lmstudio": "/v1/chat/completions"}.get(mode, "/v1/systemone")
                              if operation == "request" else "/healthz" if mode == "local" else "/v1/models")
                with self.backend(stall_path=stall_path) as (base, requests):
                    self.config(JEV_MODE=mode, JEV_API_KEY="fixture-secret", JEV_LOCAL_MODEL="fixture-JEV-9B",
                                JEV_ENDPOINT=base + "/v1/systemone" if mode in ("api", "local") else base)
                    script = self.work / "deadline.mjs"
                    expression = ("requestJev({}, {essential: {type: 'noul', instructions: 'Keep?'}}, {timeoutMs: 100})"
                                  if operation == "request" else "jevStatus({timeoutMs: 100})")
                    script.write_text(f"import {{requestJev, jevStatus}} from {json.dumps(HARNESS.as_uri())};\n"
                                      f"console.log(JSON.stringify(await {expression}));\n")
                    result = self.execute([self.node, str(script)])
                    self.successful(result)
                    report = json.loads(result.stdout)
                    if operation == "request":
                        self.assertEqual(report["error"], "Timeout after 100ms")
                        self.assertIsNone(report["answers"])
                    else:
                        self.assertTrue(report["active"])
                        self.assertFalse(report["ready"])
                    self.assertTrue(any(row[1] == stall_path for row in requests))

    def test_generative_missing_choice_probabilities_fail_closed(self):
        for mode in ("ollama", "lmstudio"):
            for name, probabilities in (("missing", {}), ("no-relevant-category", {"probabilities": {"web": 0, "infrastructure": 0}})):
                with self.subTest(mode=mode, case=name):
                    content = json.dumps(probabilities)
                    response = ({"message": {"content": content}} if mode == "ollama"
                                else {"choices": [{"message": {"content": content}}]})
                    with self.backend(response=response) as (base, requests):
                        self.config(JEV_MODE=mode, JEV_ENDPOINT=base, JEV_LOCAL_MODEL="fixture-JEV-9B")
                        result = self.run_cli("route-skills", TASK)
                        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                        self.assertEqual(result.stdout, "")

    def test_lmstudio_unrelated_model_cannot_become_an_active_jev_backend(self):
        with self.backend(models=[{"id": "unrelated-model"}]) as (base, requests):
            self.config(JEV_MODE="lmstudio", JEV_ENDPOINT=base)
            status = self.run_cli("status")
            self.assertEqual(status.returncode, 3, status.stdout + status.stderr)
            self.assertTrue(json.loads(status.stdout)["active"])
            self.assertFalse(json.loads(status.stdout)["ready"])
            route = self.run_cli("route-skills", TASK)
            self.assertNotEqual(route.returncode, 0, route.stdout + route.stderr)
            self.assertFalse(any(row[0] == "POST" for row in requests))

    def test_mock_review_cannot_authorize_or_persist_activation(self):
        result = self.run_cli("review", "Apply a tested patch", json.dumps(PROPOSAL), "--mock")
        self.successful(result)
        self.assertEqual(json.loads(result.stdout)["verdict"], "proposal_only")
        status = self.run_cli("status")
        self.assertEqual(status.returncode, 2, status.stderr)
        self.assertFalse(json.loads(status.stdout)["active"])
        live = self.run_cli("review", TASK, json.dumps(PROPOSAL))
        self.successful(live)
        self.assertEqual(json.loads(live.stdout)["verdict"], "unavailable")
        self.assertEqual(list(self.home.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
