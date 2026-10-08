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
import urllib.error
import urllib.request


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
        skills = []
        catalog_groups = {
            "web": ["react-performance", "nextjs-performance", "browser-accessibility",
                    "css-layout", "frontend-testing", "api-design", "web-security", "ui-state"],
            "infrastructure": ["database-performance", "deploy-automation", "docker-hardening",
                                "kubernetes-operations", "observability", "network-security",
                                "ci-pipelines", "release-engineering"],
            "research": ["research-methods", "paper-writing", "benchmarking", "data-analysis",
                         "ml-evaluation", "experiment-tracking", "literature-review", "statistics"],
        }
        for category, names in catalog_groups.items():
            for name in names:
                skills.append({"name": name, "category": category,
                               "description": f"Use {name.replace('-', ' ')} to solve {category} tasks."})
        self.catalog.write_text(json.dumps({
            "categories": {name: {} for name in catalog_groups},
            "skills": skills,
            "model_policies": {"default": {
                "candidates": [{"provider": "openai", "model": "gpt-6.1-sol"},
                               {"provider": "ollama", "model": "qwen2.5:7b"}],
                "fallback": "next", "constraints": {"context": "bounded"}}},
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

    def write_profile(self, profile="fixture", base=None, kinds=None):
        directory = self.home / ".agents/jev/profiles"
        directory.mkdir(parents=True, exist_ok=True)
        values = {"JEV_ENABLED": "true", "JEV_MODE": "api", **(base or {})}
        path = directory / f"{profile}.env"
        path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
        path.chmod(0o600)
        for kind, settings in (kinds or {}).items():
            child = directory / f"{profile}.{kind}.env"
            child.write_text("".join(f"{key}={value}\n" for key, value in settings.items()))
            child.chmod(0o600)
        return profile

    @contextmanager
    def backend(self, response=None, code=200, raw=None, models=None, stall_path=None,
                decide_model="fixture-JEV-9B", completions_scores=None, discovery_raw=None):
        """A documented loopback backend for all five Jev transport shapes."""
        requests = []
        release_body = threading.Event()

        def probability_for(text, identifier="", state=None):
            text = str(text).lower()
            identifier = identifier.removeprefix("gate::")
            if identifier.startswith("essential::"):
                # Batched pruning keys questions by position; judge only that block.
                index = identifier.split("::", 1)[1]
                if isinstance(state, dict) and isinstance(state.get("blocks"), list) and index.isdigit() and int(index) < len(state["blocks"]):
                    text = str(state["blocks"][int(index)].get("text", "")).lower()
                match = re.search(r"(?:^|[^0-9])(0?\.\d+|1(?:\.0+)?)(?:$|[^0-9])", text)
                if match:
                    return float(match.group(1))
                if any(word in text for word in ("drop", "noise", "debug", "confident-no")):
                    return .08
                return .94
            if identifier in FAVORABLE:
                return FAVORABLE[identifier]
            if identifier.startswith("fits::"):
                name = identifier.split("::", 1)[1].lower()
                task_match = re.search(r'"(?:task|request)"\s*:\s*"([^"]*)"', text)
                task_text = task_match.group(1).lower() if task_match else text
                terms = [term for term in re.findall(r"[a-z0-9]+", task_text) if len(term) > 2]
                return .94 if any(term in name for term in terms) else .05
            if identifier == "acts_on_user_system":
                return .1 if "plain prose" in text else .94
            if identifier == "would_follow_documented_procedure":
                return .1 if "plain prose" in text else .94
            if identifier == "prose_suffices":
                return .88 if "plain prose" in text else .12
            return .94 if any(word in text for word in ("task", "repair", "performance", "evidence", "change")) else .5

        def choose(options, body_text):
            source = str(body_text).lower()
            scores = {}
            category_terms = {
                "web": ("react", "next", "frontend", "browser", "css", "web", "ui"),
                "infrastructure": ("database", "deploy", "docker", "server", "infra", "pipeline", "network"),
                "research": ("research", "paper", "benchmark", "experiment", "data", "statistics"),
            }
            for option in options:
                option_text = str(option).lower()
                score = 1.0
                for term in re.findall(r"[a-z0-9]+", source):
                    if len(term) > 2 and term in option_text:
                        score += 12.0
                for category, terms in category_terms.items():
                    if category in option_text and any(term in source for term in terms):
                        score += 20.0
                scores[option] = score
            total = sum(scores.values()) or 1.0
            probabilities = {option: score / total for option, score in scores.items()}
            best = max(probabilities, key=probabilities.get) if probabilities else None
            return best, probabilities

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

            def send_json(self, payload, status=None):
                self.send_response(code if status is None else status)
                self.send_header("Content-Type", "application/json")
                encoded = json.dumps(payload).encode()
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def do_GET(self):
                requests.append(("GET", self.path, dict(self.headers), None))
                if self.stalled_body():
                    return
                if discovery_raw is not None and self.path.rstrip("/") != "/healthz":
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(discovery_raw)))
                    self.end_headers()
                    self.wfile.write(discovery_raw)
                    return
                if self.path.rstrip("/") == "/healthz":
                    self.send_json({"ok": True})
                    return
                if self.path.rstrip("/") == "/v1/decide/info":
                    self.send_json({"protocol": "fixture", "model": decide_model, "max_options": 256,
                                    "native_choice_options": 16, "temperatures": {"noul": 1.0, "choice": 1.0}})
                    return
                payload = {"data": models if models is not None else [{"id": "fixture-JEV-9B"}]}
                self.send_json(payload)

            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                requests.append(("POST", self.path, dict(self.headers), body))
                if self.stalled_body():
                    return
                if self.path == "/v1/systemone":
                    if not body.get("model"):
                        self.send_json({"error": "model is required"}, 422)
                        return
                    for question in body.get("questions", {}).values():
                        if question.get("type") == "choice" and not isinstance(question.get("criteria"), dict):
                            if not isinstance(question.get("options"), list):
                                self.send_json({"error": "choice criteria is required"}, 422)
                                return
                    if response is not None:
                        payload = response(body) if callable(response) else response
                    else:
                        answers = {}
                        legacy = any(isinstance(q.get("options"), list) and "criteria" not in q
                                     for q in body.get("questions", {}).values())
                        state_text = json.dumps(body.get("state", {}), sort_keys=True)
                        for identifier, question in body.get("questions", {}).items():
                            instructions = question.get("instructions", "")
                            instructions = instructions if isinstance(instructions, str) else json.dumps(instructions, sort_keys=True)
                            if question.get("type") == "choice":
                                options = list((question.get("criteria") or {}).keys() or question.get("options", []))
                                best, probabilities = choose(options, state_text + " " + instructions)
                                if legacy:
                                    answers[identifier] = {"choice": [best] if best else [],
                                                          "probabilities": probabilities}
                                else:
                                    answers[identifier] = {"type": "choice", "choice": best,
                                                          "probabilities": probabilities,
                                                          "confidence": max(probabilities.values(), default=0.0)}
                            else:
                                probability = probability_for(state_text + " " + instructions, identifier, body.get("state"))
                                answers[identifier] = ({"probability": probability} if legacy
                                                       else {"type": "noul", "noul": probability,
                                                             "confidence": max(probability, 1 - probability)})
                        payload = {"model": body["model"], "usage": {"prompt_tokens": 1, "completion_tokens": 1},
                                   "answers": answers}
                    self.send_response(code)
                    self.send_header("Content-Type", "application/json")
                    encoded = raw if raw is not None else json.dumps(payload).encode()
                    self.send_header("Content-Length", str(len(encoded)))
                    self.end_headers()
                    self.wfile.write(encoded)
                    return
                if self.path == "/v1/decide":
                    question = body.get("question", {})
                    kind = body.get("kind")
                    options = list(body.get("options") or (["false", "true"] if kind == "noul" else []))
                    state_json = json.dumps(body.get("state", {}), sort_keys=True)
                    if kind == "noul":
                        p_true = probability_for(state_json + " " + str(question), "", body.get("state"))
                        probabilities = [1 - p_true, p_true]
                    else:
                        _, mapped = choose(options, state_json + " " + str(question))
                        probabilities = [mapped[option] for option in options]
                    best = max(range(len(options)), key=probabilities.__getitem__)
                    payload = {"kind": kind, "options": options, "probabilities": probabilities, "choice_index": best,
                               "choice": options[best], "model": decide_model, "protocol": "fixture",
                               "usage": {"prompt_tokens": 1, "completion_tokens": 0}}
                    if body.get("thinking") in ("auto", "on"):
                        payload["thinking"] = {"used": True}
                    self.send_json(payload)
                    return
                if self.path == "/v1/completions":
                    allowed = body.get("allowed_token_ids") or []
                    if completions_scores is not None:
                        scores = completions_scores(allowed)
                    else:
                        scores = {f"token_id:{token_id}": (0.0 if i == 0 else -1.0)
                                  for i, token_id in enumerate(allowed)}
                    payload = {"model": body.get("model"), "choices": [{"logprobs": {"top_logprobs": [scores]}}]}
                    self.send_json(payload)
                    return
                if response is not None:
                    payload = response(body) if callable(response) else response
                else:
                    user = body.get("messages", [{}])[-1].get("content", "")
                    options_match = re.search(r"Options:\s*(\[.*?\])", user, re.S)
                    if options_match:
                        listed = json.loads(options_match.group(1))
                        _, mapped = choose(listed, user)
                        decision = {"probabilities": mapped}
                    else:
                        decision = {"probability": probability_for(user)}
                    content = json.dumps(decision)
                    payload = ({"message": {"content": content}} if self.path == "/api/chat"
                               else {"choices": [{"message": {"content": content}}]})
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                encoded = raw if raw is not None else json.dumps(payload).encode()
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

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

    def fixture_systemone(self, base, payload):
        request = urllib.request.Request(base + "/v1/systemone", data=json.dumps(payload).encode(),
                                          headers={"Content-Type": "application/json"}, method="POST")
        try:
            urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            return code
        return 200

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
                    report = json.loads(routed.stdout)
                    self.assertTrue(report["topK"])
                    self.assertIn("selection", report)
                    posts = [row for row in requests if row[0] == "POST"]
                    self.assertGreater(len(posts), 0)
                    if mode == "api":
                        self.assertEqual(posts[-1][2].get("Authorization"), "Bearer fixture-secret-$-equals=")
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
            pip.write_text("import sys\nif '--version' not in sys.argv: raise SystemExit(91)\n")
            self.successful(self.execute(["/bin/bash", str(SETUP)], env))
            routed = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(routed)
            self.assertEqual(json.loads(routed.stdout)["families"], ["web"])

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
            self.assertEqual(json.loads(reviewed.stdout)["verdict"], "proposal_only")
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
                    self.assertEqual(json.loads(overridden.stdout)["verdict"], "proposal_only")

    def test_status_distinguishes_no_opt_in_from_unreachable_configured_backend(self):
        inactive = self.run_cli("status")
        self.assertEqual(inactive.returncode, 2, inactive.stderr)
        self.assertFalse(json.loads(inactive.stdout)["active"])
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            endpoint = f"http://127.0.0.1:{reserved.getsockname()[1]}/v1/systemone"
            self.config(JEV_MODE="local", JEV_ENDPOINT=endpoint)
            configured = self.run_cli("status")
            report = json.loads(configured.stdout)
            self.assertEqual(configured.returncode, 3, configured.stderr)
            self.assertTrue(report["active"])
            self.assertFalse(report["ready"])
            self.assertIn("backends", report)
            operation = self.run_cli("review", TASK, json.dumps(PROPOSAL))
            self.successful(operation)
            self.assertEqual(json.loads(operation.stdout)["verdict"], "unavailable")

    def test_all_adapters_use_real_backend_decisions_not_task_keyword_mock(self):
        with self.backend(models=[{"id": "unrelated-model"}, {"id": "fixture-JEV-9B"}]) as (base, requests):
            for mode, path in (("api", "/v1/systemone"), ("local", "/v1/systemone"),
                               ("ollama", "/api/chat"), ("lmstudio", "/v1/chat/completions")):
                with self.subTest(mode=mode):
                    self.config(JEV_MODE=mode, JEV_ENDPOINT=base + path if mode in ("api", "local") else base,
                                JEV_API_KEY="routing-secret", **({"JEV_LOCAL_MODEL": "fixture-JEV-9B"} if mode in ("ollama", "lmstudio") else {}))
                    result = self.run_cli("route-skills", "--top-k", "1", TASK)
                    self.successful(result)
                    report = json.loads(result.stdout)
                    self.assertTrue(report["topK"])
                    self.assertIn("backend", report)
                    self.assertEqual(report["backend"]["kind"], mode)
                    posts = [row for row in requests if row[0] == "POST"]
                    self.assertEqual(posts[-1][1], path)
                    if mode in ("api", "local"):
                        self.assertEqual(posts[-1][3].get("state", {}).get("task"), TASK)
                    else:
                        self.assertEqual(posts[-1][3]["model"], "fixture-JEV-9B")
                        self.assertIn(TASK, posts[-1][3]["messages"][-1]["content"])
                    requests.clear()
                    reviewed = self.run_cli("review", TASK, json.dumps(PROPOSAL))
                    self.successful(reviewed)
                    self.assertEqual(json.loads(reviewed.stdout)["verdict"], "proposal_only")
                    requests.clear()

    def test_process_env_overrides_dotenv_routing_and_credentials(self):
        with self.backend(response={"model": "fixture-JEV-9B", "answers": {"family": {"type": "choice", "choice": "web", "probabilities": {"web": .97, "infrastructure": .03}, "confidence": .94}}}) as (stored, stored_requests):
            with self.backend() as (explicit, explicit_requests):
                self.config(JEV_MODE="api", JEV_ENDPOINT=stored + "/v1/systemone", JEV_API_KEY="stored-secret")
                result = self.run_cli("route-skills", "--top-k", "1", TASK,
                                      env={"JEV_ENDPOINT": explicit + "/v1/systemone", "JEV_API_KEY": "explicit-secret"})
                self.successful(result)
                self.assertEqual(json.loads(result.stdout)["families"], ["web"])
                self.assertEqual(stored_requests, [])
                self.assertEqual(explicit_requests[0][2]["Authorization"], "Bearer explicit-secret")

    def test_malformed_and_error_backends_never_authorize_or_route_via_fallback(self):
        failures = (("bad-json", 200, b"not json", None),
                    ("missing-answers", 200, None, {"model": "fixture-JEV-9B"}),
                    ("server-error", 503, None, {"error": "fixture unavailable"}),
                    ("invalid-probability", 200, None, {"model": "fixture-JEV-9B", "answers": {"addresses_task": "yes"}}))
        failures += (("empty-choice", 200, None, {"model": "fixture-JEV-9B", "answers": {"family": {"choice": []}}}),
                     ("empty-probabilities", 200, None, {"model": "fixture-JEV-9B", "answers": {"family": {"probabilities": {}}}}),
                     ("unknown-choice", 200, None, {"model": "fixture-JEV-9B", "answers": {"family": {"choice": "unknown"}}}))
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
                        self.assertGreaterEqual(len(requests), 1)

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
                        (".agents/rules/jev-control-plane.md", False), (".agents/jev/skills.json", False))
        api_cases = len(destinations)
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
                    (outside / "sentinel").write_bytes(b"preserve user files")
                else:
                    outside.write_bytes(b"preserve user files")
                target = home / destination
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(outside, target_is_directory=directory)
                snapshot = lambda: {str(path.relative_to(self.work)):
                                    ("link", os.readlink(path)) if path.is_symlink()
                                    else ("file", path.read_bytes()) if path.is_file() else ("directory",)
                                    for path in self.work.rglob("*")}
                env = {"HOME": str(home), "JEO_SKILLS_JEV": "api" if i < api_cases else "local",
                       "JEV_API_KEY": "fixture-secret", "JEV_SKIP_MODEL_DOWNLOAD": "true"}
                if destination.startswith("custom-model-root"):
                    env["JEV_LOCAL_MODEL_DIR"] = str(home / "custom-model-root/JEV-9B")
                before = snapshot()
                result = self.execute(["/bin/bash", str(SETUP)], env)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(snapshot(), before)

    def test_setup_installs_catalog_snapshot_and_harness_resolves_catalogs_in_order(self):
        setup_env = {"JEO_SKILLS_JEV": "api", "JEV_API_KEY": "fixture-secret"}
        self.successful(self.execute(["/bin/bash", str(SETUP)], setup_env, cwd=ROOT))
        snapshot = self.home / ".agents/jev/skills.json"
        source = ROOT / ".agent-skills/skills.json"
        self.assertEqual(snapshot.read_bytes(), source.read_bytes())
        self.assertFalse(self.external_log.exists())
        del self.env["JEV_CATALOG_PATH"]  # setUp rebuilds it for every test
        standalone = self.work / "standalone"
        standalone.mkdir()
        harness = self.home / ".agents/jev/jev-harness.mjs"

        def catalog_size(**env):
            result = self.execute([self.node, str(harness), "route-skills", "--mock", "--top-k", "1",
                                   "Fix a React frontend performance bug"], env, cwd=standalone)
            self.successful(result)
            return json.loads(result.stdout)["fullCatalogSkills"]

        def tiny(path, count):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"categories": {"web": {}}, "skills": [
                {"name": f"tiny-{i}", "category": "web", "description": "Tiny fixture skill."} for i in range(count)]}))

        full = len(json.loads(source.read_text())["skills"])
        self.assertEqual(catalog_size(), full)  # standalone: the installed snapshot
        clone = self.home / ".agents/jeo-skills-repo/.agent-skills/skills.json"
        tiny(clone, 1)
        self.assertEqual(catalog_size(), full)  # a stale side clone never shadows the snapshot
        tiny(standalone / ".agent-skills/skills.json", 2)
        self.assertEqual(catalog_size(), 2)  # the checkout the host works in wins
        self.assertEqual(catalog_size(JEV_CATALOG_PATH=str(self.catalog)), 24)  # explicit path wins
        (standalone / ".agent-skills/skills.json").unlink()
        snapshot.unlink()
        self.assertEqual(catalog_size(), 1)  # the side clone is only the last resort
        clone.unlink()
        missing = self.execute([self.node, str(harness), "route-skills", "--mock", "task"], cwd=standalone)
        self.assertEqual(missing.returncode, 1)
        self.assertIn("Cannot load a valid skills catalog", missing.stderr)

    def test_unavailable_catalog_never_fails_setup_or_replaces_a_valid_snapshot(self):
        snapshot = self.home / ".agents/jev/skills.json"
        junk = self.work / "captive-portal.html"
        junk.write_text("<html>not a catalog</html>")
        base = {"JEO_SKILLS_JEV": "api", "JEV_API_KEY": "fixture-secret"}
        first = self.execute(["/bin/bash", str(SETUP)], {**base, "JEO_SKILLS_CATALOG": str(junk)}, cwd=ROOT)
        self.successful(first)
        self.assertFalse(snapshot.exists())
        self.assertIn("No skills catalog snapshot", first.stdout + first.stderr)
        self.successful(self.execute(["/bin/bash", str(SETUP)], base, cwd=ROOT))
        installed = snapshot.read_bytes()
        for source in (junk, self.work / "missing.json"):
            with self.subTest(source=source.name):
                rerun = self.execute(["/bin/bash", str(SETUP)], {**base, "JEO_SKILLS_CATALOG": str(source)}, cwd=ROOT)
                self.successful(rerun)
                self.assertEqual(snapshot.read_bytes(), installed)
                self.assertIn("keeping the existing one", rerun.stdout + rerun.stderr)
        # A missing source falls back to the catalog published beside the harness.
        self.assertIn("https://raw.githubusercontent.com/akillness/jeo-skills/main/.agent-skills/skills.json",
                      self.external_log.read_text())

    def test_excerpts_never_leave_the_catalog_root(self):
        root = self.work / "excerpt"
        outside = root / "outside"
        (outside / "secret-dir").mkdir(parents=True)
        (outside / "SKILL.md").write_text("OUTSIDE-SECRET-MARKER file\n")
        (outside / "secret-dir/SKILL.md").write_text("OUTSIDE-SECRET-MARKER directory\n")
        skills_root = root / "project/.agent-skills"
        (skills_root / "react-performance").mkdir(parents=True)
        (skills_root / "react-performance/SKILL.md").write_text(
            "---\nname: react-performance\n---\nINSIDE-EXCERPT-MARKER react render guidance\n")
        (skills_root / "react-dir-link").symlink_to(outside / "secret-dir", target_is_directory=True)
        (skills_root / "react-file-link").mkdir()
        (skills_root / "react-file-link/SKILL.md").symlink_to(outside / "SKILL.md")
        entries = [("react-performance", "react-performance/SKILL.md"), ("react-dir-link", "react-dir-link/SKILL.md"),
                   ("react-file-link", "react-file-link/SKILL.md"), ("react-traversal", "../../outside/SKILL.md")]
        skills = [{"name": name, "category": "web", "path": path, "description": "React performance fixture."}
                  for name, path in entries]
        skills += [{"name": f"filler-{i}", "category": "research", "path": f"filler-{i}/SKILL.md",
                    "description": "Unrelated filler."} for i in range(61)]
        catalog = skills_root / "skills.json"
        catalog.write_text(json.dumps({"categories": {"web": {}, "research": {}}, "skills": skills}))
        with self.backend() as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            result = self.run_cli("route-skills", "--top-k", "1", TASK, env={"JEV_CATALOG_PATH": str(catalog)})
            self.successful(result)
            self.assertEqual(json.loads(result.stdout)["selection"]["strategy"], "shortlist")
            sent = json.dumps([row[3] for row in requests if row[0] == "POST"])
            self.assertIn("INSIDE-EXCERPT-MARKER", sent)  # positive control: in-root excerpts are sent
            self.assertNotIn("OUTSIDE-SECRET-MARKER", sent)

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
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="fixture-secret")
            blocks = [{"id": name, "text": str(prob)} for name, prob in
                      (("confident-no", .19), ("uncertain-no", .21), ("near-even", .49),
                       ("uncertain-yes", .6), ("confident-yes", .95))]
            result = self.run_cli("prune-context", input="\n".join(map(json.dumps, blocks)))
            self.successful(result)
            self.assertEqual([json.loads(line)["verdict"] for line in result.stdout.splitlines()],
                             ["drop", "keep", "keep", "keep", "keep"])

    def test_setup_guide_explicit_project_opt_in_rejects_without_side_effects(self):
        text = (ROOT / "setup-all-skills-prompt.md").read_text()
        section = text.split("### Jev control-plane harness (System One)", 1)[1].split("\n### ", 1)[0]
        block = re.search(r"```(?:bash|sh)\n(.*?)\n```", section, re.S).group(1)
        for mode in ("api", "local", "ollama", "lmstudio", "systemone"):
            with self.subTest(mode=mode):
                result = self.execute(["/bin/bash"], {"USER_HOME": str(self.home),
                                      "INSTALL_GLOBAL": "false", "JEO_SKILLS_JEV": mode,
                                      "JEV_API_KEY": "fixture-secret"}, block, ROOT)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                # The home-scope refusal proves the block accepts the mode (not the invalid-mode branch).
                self.assertIn("Jev is home-scoped", result.stderr)
                self.assertEqual(list(self.home.iterdir()), [])
                self.assertFalse(self.external_log.exists())

    def test_setup_guide_block_configures_systemone_from_a_checkout(self):
        text = (ROOT / "setup-all-skills-prompt.md").read_text()
        section = text.split("### Jev control-plane harness (System One)", 1)[1].split("\n### ", 1)[0]
        block = re.search(r"```(?:bash|sh)\n(.*?)\n```", section, re.S).group(1)
        result = self.execute(["/bin/bash"], {"USER_HOME": str(self.home), "JEO_SKILLS_JEV": "systemone",
                                              "JEV_SYSTEMONE_ENDPOINT": "http://127.0.0.1:1/v1/systemone",
                                              "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B"}, block, ROOT)
        self.successful(result)
        saved = self.home / ".agents/jev/.env"
        self.assertEqual(saved.stat().st_mode & 0o777, 0o600)
        self.assertIn("JEV_MODE=systemone", saved.read_text())
        self.assertIn("JEV_SYSTEMONE_MODEL=fixture-JEV-9B", saved.read_text())
        self.assertTrue((self.home / ".agents/jev/skills.json").is_file())
        self.assertFalse(self.external_log.exists())  # no downloads, fetches, or server starts

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
                        self.assertIn("Timeout after 100ms", report["error"])
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
            self.assertNotEqual(route.returncode, 0, route.stdout)
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

    def test_api_request_sends_model_and_criteria_and_reads_noul(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="fixture-secret")
            script = self.work / "request.mjs"
            script.write_text(f"import {{requestJev}} from {json.dumps(HARNESS.as_uri())};\n"
                              "console.log(JSON.stringify(await requestJev({task:'React'}, {"
                              "check:{type:'noul',instructions:'Does this work?'}, "
                              "family:{type:'choice',instructions:'Pick one',criteria:{web:'web'}}})));\n")
            result = self.execute([self.node, str(script)])
            self.successful(result)
            envelope = json.loads(result.stdout)
            self.assertIsNone(envelope["error"])
            self.assertIn("check", envelope["answers"])
            self.assertIn("backend", envelope)
            posted = requests[-1][3]
            self.assertEqual(posted["model"], "jev-latest")
            self.assertEqual(posted["questions"]["family"]["criteria"], {"web": "web"})
            self.assertNotIn("options", posted["questions"]["family"])

    def test_per_operation_backend_keys_resolve_independently(self):
        with self.backend() as (base, requests):
            self.write_profile(base={"JEV_MODE": "api", "JEV_ROUTE_SKILLS_BACKEND": "local",
                                     "JEV_PRUNE_CONTEXT_BACKEND": "api", "JEV_REVIEW_BACKEND": "ollama"},
                              kinds={"api": {"JEV_API_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "key"},
                                     "local": {"JEV_LOCAL_ENDPOINT": base + "/v1/systemone"},
                                     "ollama": {"JEV_OLLAMA_ENDPOINT": base, "JEV_OLLAMA_MODEL": "fixture-JEV-9B"}})
            env = {"JEV_PROFILE": "fixture"}
            route = self.run_cli("route-skills", TASK, env=env)
            self.successful(route)
            prune = self.run_cli("prune-context", env=env, input=json.dumps({"id": "a", "text": "keep"}))
            self.successful(prune)
            review = self.run_cli("review", TASK, json.dumps(PROPOSAL), env=env)
            self.successful(review)
            kinds = [row[3] and row[3].get("model") for row in requests if row[0] == "POST"]
            self.assertGreaterEqual(len(kinds), 3)
            self.assertEqual(json.loads(route.stdout)["backend"]["kind"], "local")
            self.assertEqual(json.loads(review.stdout)["backend"]["kind"], "ollama")

    def test_fallback_follows_allow_list_order_and_reports_attempted(self):
        with self.backend() as (base, requests):
            offline = "http://127.0.0.1:1/v1/systemone"
            self.write_profile(base={"JEV_MODE": "local", "JEV_REVIEW_BACKEND": "local",
                                     "JEV_REVIEW_FALLBACK": "ollama,api"},
                              kinds={"local": {"JEV_LOCAL_ENDPOINT": offline},
                                     "ollama": {"JEV_OLLAMA_ENDPOINT": offline},
                                     "api": {"JEV_API_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "key"}})
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["backend"]["kind"], "api")
            self.assertEqual(report["attempted"], ["local", "ollama", "api"])

    def test_unavailable_primary_without_fallback_is_unavailable(self):
        offline = "http://127.0.0.1:1/v1/systemone"
        self.write_profile(base={"JEV_MODE": "local", "JEV_REVIEW_BACKEND": "local"},
                           kinds={"local": {"JEV_LOCAL_ENDPOINT": offline}})
        result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
        self.successful(result)
        report = json.loads(result.stdout)
        self.assertEqual(report["verdict"], "unavailable")
        self.assertEqual(report["attempted"], ["local"])

    def systemone_profile(self, base, **extra):
        settings = {"JEV_SYSTEMONE_ENDPOINT": base + "/v1/systemone", "JEV_SYSTEMONE_DRIVER": "typesafe",
                    "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B", **extra}
        self.write_profile(base={"JEV_MODE": "systemone", "JEV_REVIEW_BACKEND": "systemone"}, kinds={"systemone": settings})
        return settings

    def test_permit_requires_matching_validated_model_attestation(self):
        with self.backend() as (base, requests):
            self.systemone_profile(base)
            unvalidated = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(unvalidated)
            report = json.loads(unvalidated.stdout)
            self.assertEqual(report["verdict"], "proposal_only")
            self.assertIsNone(report["backend"]["attestation"])
            self.systemone_profile(base, JEV_SYSTEMONE_VALIDATED_MODEL="fixture-JEV-9B")
            validated = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(validated)
            report = json.loads(validated.stdout)
            self.assertEqual(report["verdict"], "permit")
            self.assertEqual(report["backend"]["tier"], "validated")
            self.assertTrue(report["backend"]["attestation"]["eligible"])

    def test_stale_attestation_downgrades_to_proposal_only(self):
        with self.backend() as (base, requests):
            self.systemone_profile(base, JEV_SYSTEMONE_VALIDATED_MODEL="other-model")
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["verdict"], "proposal_only")
            self.assertFalse(report["backend"]["attestation"]["matched"])
            self.assertEqual(report["backend"]["attestation"]["state"], "stale")
            self.assertIn("attestation stale", report["reason"])

    def test_generative_and_local_attestation_never_validates(self):
        with self.backend(models=[{"id": "fixture-JEV-9B"}]) as (base, requests):
            cases = (("ollama", {"JEV_OLLAMA_ENDPOINT": base, "JEV_OLLAMA_MODEL": "fixture-JEV-9B",
                                 "JEV_OLLAMA_VALIDATED_MODEL": "fixture-JEV-9B"}),
                     ("lmstudio", {"JEV_LMSTUDIO_ENDPOINT": base, "JEV_LMSTUDIO_MODEL": "fixture-JEV-9B",
                                   "JEV_LMSTUDIO_VALIDATED_MODEL": "fixture-JEV-9B"}),
                     ("local", {"JEV_LOCAL_ENDPOINT": base + "/v1/systemone", "JEV_LOCAL_MODEL": "fixture-JEV-9B",
                                "JEV_LOCAL_VALIDATED_MODEL": "fixture-JEV-9B"}))
            for kind, settings in cases:
                with self.subTest(kind=kind):
                    self.write_profile(base={"JEV_MODE": kind, "JEV_REVIEW_BACKEND": kind}, kinds={kind: settings})
                    result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
                    self.successful(result)
                    report = json.loads(result.stdout)
                    self.assertEqual(report["verdict"], "proposal_only", report)
                    self.assertEqual(report["backend"]["tier"], "unvalidated")
                    self.assertFalse(report["backend"]["attestation"]["eligible"])
                    self.assertEqual(report["backend"]["attestation"]["state"], "ineligible")
                    status = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
                    self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
                    entry = json.loads(status.stdout)["backends"][kind]
                    self.assertEqual(entry["tier"], "unvalidated")
                    self.assertFalse(entry["attestation"]["eligible"])

    def test_receipt_v2_binds_backend_model_tier(self):
        with self.backend() as (base, requests):
            self.systemone_profile(base, JEV_SYSTEMONE_VALIDATED_MODEL="fixture-JEV-9B")
            first = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(first)
            report = json.loads(first.stdout)
            self.assertEqual(report["receiptVersion"], 2)
            self.assertEqual(report["backend"]["tier"], "validated")
            self.assertEqual(len(report["receipt"]), 64)
            self.systemone_profile(base, JEV_SYSTEMONE_MODEL="fixture-other", JEV_SYSTEMONE_VALIDATED_MODEL="fixture-other")
            second = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(second)
            self.assertNotEqual(report["receipt"], json.loads(second.stdout)["receipt"])

    def test_selection_strategy_sharded_when_cap_fits_else_shortlist(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            sharded = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(sharded)
            self.assertEqual(json.loads(sharded.stdout)["selection"]["strategy"], "sharded")
            large = self.work / "large-catalog.json"
            entries = [{"name": f"skill-{i}", "category": "web" if i % 3 == 0 else "infrastructure" if i % 3 == 1 else "research",
                        "description": f"Skill {i} for general task work."} for i in range(70)]
            large.write_text(json.dumps({"categories": {"web": {}, "infrastructure": {}, "research": {}}, "skills": entries}))
            result = self.run_cli("route-skills", "--top-k", "1", "generic task",
                                  env={"JEV_CATALOG_PATH": str(large)})
            self.successful(result)
            self.assertEqual(json.loads(result.stdout)["selection"]["strategy"], "shortlist")

    def test_gate_and_fits_thresholds_yield_empty_topk_with_registry_fallback(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            gated = self.run_cli("route-skills", "plain prose only")
            self.successful(gated)
            gated_report = json.loads(gated.stdout)
            self.assertEqual(gated_report["topK"], [])
            self.assertEqual(gated_report["selection"]["reason"], "gate")
            self.assertIn("publicRegistryFallback", gated_report)
            fits = self.run_cli("route-skills", "unmatched astronomy task")
            self.successful(fits)
            fits_report = json.loads(fits.stdout)
            self.assertEqual(fits_report["topK"], [])
            self.assertEqual(fits_report["selection"]["reason"], "fits")
            self.assertIn("publicRegistryFallback", fits_report)

    def test_routing_field_from_model_policies_advisory(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            result = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertTrue(report["routing"])
            route = report["routing"][0]
            self.assertEqual(route["skill"], report["topK"][0]["name"])
            self.assertEqual(route["policy"]["fallback"], "next")
            self.assertIn("/", route["chosen"])
            self.assertEqual(route["provenance"]["backend"]["kind"], "api")

    def test_status_chain_readiness_exit_codes(self):
        with self.backend() as (base, requests):
            offline = "http://127.0.0.1:1/v1/systemone"
            self.write_profile(base={"JEV_MODE": "api", "JEV_REVIEW_BACKEND": "api", "JEV_REVIEW_FALLBACK": "local"},
                               kinds={"api": {"JEV_API_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "key"},
                                      "local": {"JEV_LOCAL_ENDPOINT": offline}})
            healthy_primary = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
            self.assertEqual(healthy_primary.returncode, 0, healthy_primary.stderr)
            self.assertTrue(json.loads(healthy_primary.stdout)["policies"]["review"]["usable"])
            self.write_profile(base={"JEV_MODE": "local", "JEV_REVIEW_BACKEND": "local", "JEV_REVIEW_FALLBACK": "api"},
                               kinds={"local": {"JEV_LOCAL_ENDPOINT": offline},
                                      "api": {"JEV_API_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "key"}})
            fallback_status = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
            self.assertEqual(fallback_status.returncode, 0, fallback_status.stderr)
            live = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(live)
            live_report = json.loads(live.stdout)
            self.assertEqual(live_report["backend"]["kind"], "api")
            self.assertEqual(live_report["attempted"], ["local", "api"])
            self.write_profile(base={"JEV_MODE": "local", "JEV_REVIEW_BACKEND": "local"},
                               kinds={"local": {"JEV_LOCAL_ENDPOINT": offline}})
            unavailable = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
            self.assertEqual(unavailable.returncode, 3)
            dead = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(dead)
            self.assertEqual(json.loads(dead.stdout)["verdict"], "unavailable")

    def vllm_assets(self):
        head = self.work / "decision_head.json"
        calibration = self.work / "calibration.json"
        head.write_text(json.dumps({"slots": {"ranges": {"noul": [0, 2], "score": [2, 8], "choice": [8, 24]}},
                                    "verbalizer_ids": list(range(1000, 1024)), "bias": [0.0] * 24}))
        calibration.write_text(json.dumps({"per_kind": {"noul": 1.0, "score": 1.0, "choice": 1.0}}))
        return {"JEV_SYSTEMONE_HEAD_JSON": str(head), "JEV_SYSTEMONE_CALIBRATION_JSON": str(calibration)}

    def test_systemone_decide_and_vllm_drivers_normalize_probabilities(self):
        with self.backend() as (base, requests):
            for driver, expected_path in (("decide", "/v1/decide"), ("vllm-jev-decision", "/v1/completions")):
                with self.subTest(driver=driver):
                    settings = {"JEV_SYSTEMONE_ENDPOINT": base, "JEV_SYSTEMONE_DRIVER": driver,
                                "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B", **self.vllm_assets()}
                    self.write_profile(base={"JEV_MODE": "systemone", "JEV_REVIEW_BACKEND": "systemone"},
                                       kinds={"systemone": settings})
                    result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
                    self.successful(result)
                    report = json.loads(result.stdout)
                    self.assertEqual(report["backend"]["driver"], driver)
                    self.assertIsNotNone(report["review"])
                    posts = [row for row in requests if row[0] == "POST" and row[1] == expected_path]
                    self.assertTrue(posts)
                    if driver == "decide":
                        self.assertEqual(posts[-1][3]["thinking"], "off")
                    else:
                        wire = posts[-1][3]
                        self.assertEqual(wire["max_tokens"], 1)
                        self.assertEqual(len(wire["allowed_token_ids"]), 2)
                        self.assertEqual({k: wire[k] for k in ("temperature", "top_p", "top_k", "min_p", "repetition_penalty")},
                                         {"temperature": 1.0, "top_p": 1.0, "top_k": 0, "min_p": 0.0, "repetition_penalty": 1.0})
                        self.assertFalse(wire["add_special_tokens"])
                        self.assertTrue(wire["return_tokens_as_token_ids"])
                    status = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
                    self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
                    requests.clear()

    def test_systemone_typesafe_status_probes_sibling_models_with_auth(self):
        with self.backend() as (base, requests):
            settings = {"JEV_SYSTEMONE_ENDPOINT": base + "/gateway/v1/systemone", "JEV_SYSTEMONE_DRIVER": "typesafe",
                        "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B", "JEV_SYSTEMONE_API_KEY": "gateway-secret"}
            self.write_profile(base={"JEV_MODE": "systemone"}, kinds={"systemone": settings})
            status = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
            self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
            report = json.loads(status.stdout)
            self.assertEqual(report["backends"]["systemone"]["state"], "ready")
            probes = [row for row in requests if row[0] == "GET"]
            self.assertEqual([row[1] for row in probes], ["/gateway/v1/models"])
            self.assertEqual(probes[0][2].get("Authorization"), "Bearer gateway-secret")

    def test_vllm_missing_option_logprob_is_unavailable(self):
        def drop_second(allowed):
            return {f"token_id:{token_id}": 0.0 for token_id in allowed[:1]}
        with self.backend(completions_scores=drop_second) as (base, requests):
            settings = {"JEV_SYSTEMONE_ENDPOINT": base, "JEV_SYSTEMONE_DRIVER": "vllm-jev-decision",
                        "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B", "JEV_SYSTEMONE_VALIDATED_MODEL": "fixture-JEV-9B",
                        **self.vllm_assets()}
            self.write_profile(base={"JEV_MODE": "systemone", "JEV_REVIEW_BACKEND": "systemone"}, kinds={"systemone": settings})
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["verdict"], "unavailable")
            self.assertIn("no logprob for token id", report["reason"])

    def test_oversized_review_is_rejected_before_io_and_only_explicit_fallback_may_take_it(self):
        big = {"patch": "x" * 7000, "evidence": "focused test passed"}
        with self.backend() as (base, requests):
            settings = {"JEV_SYSTEMONE_ENDPOINT": base, "JEV_SYSTEMONE_DRIVER": "decide",
                        "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B", "JEV_SYSTEMONE_VALIDATED_MODEL": "fixture-JEV-9B"}
            self.write_profile(base={"JEV_MODE": "systemone", "JEV_REVIEW_BACKEND": "systemone"}, kinds={"systemone": settings})
            result = self.run_cli("review", TASK, json.dumps(big), env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["verdict"], "unavailable")
            self.assertIn("state too large for systemone/decide", report["reason"])
            self.assertIn("input was not trimmed", report["reason"])
            self.assertEqual([row for row in requests if row[0] == "POST"], [])
            self.write_profile(base={"JEV_MODE": "systemone", "JEV_REVIEW_BACKEND": "systemone", "JEV_REVIEW_FALLBACK": "api"},
                               kinds={"systemone": settings, "api": {"JEV_API_ENDPOINT": base + "/v1/systemone", "JEV_API_KEY": "key"}})
            routed = self.run_cli("review", TASK, json.dumps(big), env={"JEV_PROFILE": "fixture"})
            self.successful(routed)
            report = json.loads(routed.stdout)
            self.assertEqual(report["backend"]["kind"], "api")
            self.assertEqual(report["attempted"], ["systemone", "api"])
            self.assertEqual(report["verdict"], "proposal_only")
            posted = [row[3] for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            self.assertEqual(len(posted), 1)
            self.assertEqual(posted[0]["state"]["proposal"]["patch"], big["patch"])

    def test_attested_backend_without_served_model_cannot_permit(self):
        favorable = {"model": "", "answers": {key: {"type": "noul", "noul": value, "confidence": max(value, 1 - value)}
                                              for key, value in FAVORABLE.items()}}
        with self.backend(response=favorable) as (base, requests):
            self.systemone_profile(base, JEV_SYSTEMONE_VALIDATED_MODEL="fixture-JEV-9B")
            result = self.run_cli("review", TASK, json.dumps(PROPOSAL), env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["verdict"], "proposal_only")
            self.assertEqual(report["backend"]["tier"], "unvalidated")
            self.assertIsNone(report["backend"]["model"])
            self.assertFalse(report["backend"]["attestation"]["matched"])

    def test_smoke_never_permits_even_when_attested(self):
        with self.backend() as (base, requests):
            self.systemone_profile(base, JEV_SYSTEMONE_VALIDATED_MODEL="fixture-JEV-9B")
            live = self.run_cli("review", "Repair React performance", json.dumps({"patch": "fix render", "evidence": "focused test passed"}),
                                env={"JEV_PROFILE": "fixture"})
            self.successful(live)
            self.assertEqual(json.loads(live.stdout)["verdict"], "permit")
            smoke = self.run_cli("smoke", "--task", TASK, env={"JEV_PROFILE": "fixture"})
            self.successful(smoke)
            rows = [json.loads(line) for line in smoke.stdout.splitlines() if line.startswith("{")]
            review_rows = [row for row in rows if row["op"] == "review"]
            self.assertEqual(len(review_rows), 1)
            self.assertEqual(review_rows[0]["verdict"], "proposal_only")
            self.assertEqual(review_rows[0]["liveVerdict"], "permit")
            self.assertNotIn('"verdict": "permit"', smoke.stdout)
            self.assertIn("never authorizes", smoke.stdout)

    def test_per_question_drivers_scope_fit_state_to_the_named_candidate(self):
        with self.backend() as (base, requests):
            self.write_profile(base={"JEV_MODE": "systemone", "JEV_ROUTE_SKILLS_BACKEND": "systemone"},
                               kinds={"systemone": {"JEV_SYSTEMONE_ENDPOINT": base, "JEV_SYSTEMONE_DRIVER": "decide",
                                                     "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B"}})
            result = self.run_cli("route-skills", "--top-k", "1", TASK, env={"JEV_PROFILE": "fixture"})
            self.successful(result)
            self.assertTrue(json.loads(result.stdout)["topK"])
            decides = [row[3] for row in requests if row[0] == "POST" and row[1] == "/v1/decide"]
            self.assertTrue(decides)
            fit_requests = [body for body in decides if "genuinely do what" in body["question"]]
            self.assertTrue(fit_requests)
            for body in fit_requests:
                candidates = body["state"]["candidates"]
                self.assertEqual(len(candidates), 1)
                self.assertIn(f"`{candidates[0]['name']}`", body["question"])
            which_requests = [body for body in decides if body["kind"] == "choice" and "candidate skills" in body["question"]]
            self.assertTrue(all(len(body["state"]["candidates"]) > 1 for body in which_requests))
            for body in decides:
                self.assertLessEqual(len(json.dumps(body["state"])), 3000)
        with self.backend() as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            result = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(result)
            posts = [row[3] for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            self.assertGreater(len(posts), 1)
            for body in posts:
                names = {c["name"] for c in body["state"].get("candidates", [])}
                for identifier in body["questions"]:
                    if identifier.startswith("fits::"):
                        self.assertEqual(names, {identifier.split("::", 1)[1]})

    def test_sharded_gate_is_evaluated_once_and_enforced(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            result = self.run_cli("route-skills", "--top-k", "1", TASK)
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertEqual(report["selection"]["strategy"], "sharded")
            posts = [row[3] for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            gate_posts = [body for body in posts if any(k.startswith("gate::") for k in body["questions"])]
            self.assertEqual(len(gate_posts), 1)
            self.assertTrue(any(k.startswith("shard::") for k in gate_posts[0]["questions"]))
            self.assertGreaterEqual(report["selection"]["gate"]["value"], 0.30)

    def test_systemone_status_fails_closed_on_stalled_or_malformed_discovery(self):
        for driver, stall_path in (("typesafe", "/v1/models"), ("decide", "/v1/decide/info")):
            with self.subTest(driver=driver, case="stalled"):
                with self.backend(stall_path=stall_path) as (base, requests):
                    endpoint = base + "/v1/systemone" if driver == "typesafe" else base
                    self.write_profile(base={"JEV_MODE": "systemone"},
                                       kinds={"systemone": {"JEV_SYSTEMONE_ENDPOINT": endpoint, "JEV_SYSTEMONE_DRIVER": driver,
                                                             "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B"}})
                    script = self.work / f"stall-{driver}.mjs"
                    script.write_text(f"import {{jevStatus}} from {json.dumps(HARNESS.as_uri())};\n"
                                      "console.log(JSON.stringify(await jevStatus({timeoutMs: 100, operation: 'review'})));\n")
                    result = self.execute([self.node, str(script)], {"JEV_PROFILE": "fixture"})
                    self.successful(result)
                    report = json.loads(result.stdout)
                    self.assertFalse(report["ready"])
                    self.assertEqual(report["backends"]["systemone"]["state"], "warming")
                    self.assertTrue(any(row[1] == stall_path for row in requests))
        with self.subTest(driver="typesafe", case="malformed"):
            with self.backend(discovery_raw=b"not json") as (base, requests):
                self.write_profile(base={"JEV_MODE": "systemone"},
                                   kinds={"systemone": {"JEV_SYSTEMONE_ENDPOINT": base + "/v1/systemone", "JEV_SYSTEMONE_DRIVER": "typesafe",
                                                         "JEV_SYSTEMONE_MODEL": "fixture-JEV-9B"}})
                status = self.run_cli("status", "--operation", "review", env={"JEV_PROFILE": "fixture"})
                self.assertEqual(status.returncode, 3, status.stdout + status.stderr)
                self.assertEqual(json.loads(status.stdout)["backends"]["systemone"]["state"], "unavailable")

    def test_local_prune_batches_are_bounded_by_server_state_limit(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="local", JEV_ENDPOINT=base + "/v1/systemone")
            filler = "x" * 1500
            blocks = [{"id": f"noise-{i}", "text": f"drop {filler}"} for i in range(6)]
            blocks.append({"id": "far-essential", "text": "0.97 essential decision at the end"})
            blocks.append({"id": "oversized", "text": "0.98 " + "y" * 7000})
            result = self.run_cli("prune-context", input="\n".join(json.dumps(block) for block in blocks))
            self.successful(result)
            verdicts = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual([v["id"] for v in verdicts], [b["id"] for b in blocks])
            self.assertEqual([v["verdict"] for v in verdicts[:6]], ["drop"] * 6)
            self.assertEqual(verdicts[6]["verdict"], "keep")
            self.assertEqual(verdicts[7]["verdict"], "keep")
            self.assertIn("preserved unjudged", verdicts[7]["reason"])
            posts = [row for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            self.assertGreater(len(posts), 1)
            for row in posts:
                self.assertLessEqual(len(json.dumps({"blocks": row[3]["state"]["blocks"]})), 6000)
            judged_ids = [block["id"] for row in posts for block in row[3]["state"]["blocks"]]
            self.assertEqual(sorted(judged_ids), sorted(b["id"] for b in blocks[:7]))
            for row in posts:
                self.assertEqual(list(row[3]["questions"]), [f"essential::{i}" for i in range(len(row[3]["state"]["blocks"]))])

    def test_route_skills_model_override_reaches_every_stage(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            result = self.run_cli("route-skills", "--top-k", "1", "--model", "jev-1.13.0", TASK)
            self.successful(result)
            report = json.loads(result.stdout)
            self.assertTrue(report["topK"])
            posts = [row for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            self.assertGreaterEqual(len(posts), 3)
            self.assertEqual({row[3]["model"] for row in posts}, {"jev-1.13.0"})
            self.assertEqual(report["routing"][0]["provenance"]["backend"]["model"], "jev-1.13.0")

    def test_prune_context_batches_blocks_into_one_request(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            blocks = [{"id": f"b{i}", "text": "keep" if i else "drop"} for i in range(4)]
            result = self.run_cli("prune-context", input="\n".join(json.dumps(block) for block in blocks))
            self.successful(result)
            posts = [row for row in requests if row[0] == "POST" and row[1] == "/v1/systemone"]
            self.assertEqual(len(posts), 1)
            self.assertEqual(list(posts[0][3]["questions"]), [f"essential::{i}" for i in range(4)])
            self.assertEqual(len(result.stdout.splitlines()), 4)

    def test_prune_context_preserves_duplicate_block_ids(self):
        with self.backend() as (base, requests):
            self.config(JEV_MODE="api", JEV_ENDPOINT=base + "/v1/systemone", JEV_API_KEY="key")
            blocks = [{"id": "duplicate", "text": "drop"}, {"id": "duplicate", "text": "keep"}]
            result = self.run_cli("prune-context", input="\n".join(json.dumps(block) for block in blocks))
            self.successful(result)
            actual = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual([(item["id"], item["verdict"]) for item in actual],
                             [("duplicate", "drop"), ("duplicate", "keep")])

    def test_systemone_fixture_rejects_missing_model_with_422(self):
        with self.backend() as (base, requests):
            self.assertEqual(self.fixture_systemone(base, {"state": {}, "questions": {}}), 422)


if __name__ == "__main__":
    unittest.main()
