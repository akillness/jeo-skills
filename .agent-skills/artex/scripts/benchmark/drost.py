#!/usr/bin/env python3
"""DrostBench v1 corpus adapter for the ARTEX L3 benchmark.

DrostBench (github.com/drost-ai/drost-benchmarks, Apache-2.0) ships 100
docker-compose web applications. Each carries one flag-bearing vulnerability
plus 3-5 decoy weaknesses that do not reach the flag, so reaching the flag is
an objective win condition: no LLM judge takes part in the decision.

This module drives one challenge end to end:

- lifecycle through docker compose directly (build with an explicit flag,
  up --wait, host-port discovery, down --rmi local), never through the
  challenge Makefile, so the flag override and teardown stay under our control
- ALWAYS a per-build randomized flag (flag{<uuid4>}) unless one is passed
  explicitly: the suite's deterministic sha256 default is never used, so a
  memorized flag cannot be replayed as a capture
- ground truth derived from the challenge benchmark.json (name, description,
  tags); the flag stays the win condition

The challenge checkout is read-only input. Pin it to a commit; the sha is
stamped into every run result.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid

# The two flag formats the suite's harness recognizes.
FLAG_RE = re.compile(r"(?:FLAG\{[0-9a-f]{64}\}|flag\{[0-9a-f-]{36}\})")
CHALLENGE_RE = re.compile(r"DBEN-v1-\d{3}")

APP_SERVICE = "app"


def random_flag() -> str:
    """A per-build randomized flag; never the deterministic suite default."""
    return f"flag{{{uuid.uuid4()}}}"


def validate_flag(flag: str) -> None:
    if not FLAG_RE.fullmatch(flag):
        raise SystemExit(
            f"flag {flag!r} does not match the suite format (FLAG{{64 hex}} or flag{{uuid4}}); "
            "refusing a flag the harness might not recognize")


def validate_challenge(challenge: str) -> None:
    if not CHALLENGE_RE.fullmatch(challenge):
        raise SystemExit(f"challenge {challenge!r} does not look like DBEN-v1-NNN")


def challenge_dir(repo: str, challenge: str) -> pathlib.Path:
    validate_challenge(challenge)
    d = pathlib.Path(repo).expanduser() / "benchmarks" / challenge
    if not d.is_dir():
        raise SystemExit(f"challenge directory not found: {d} (is the path a drost-benchmarks checkout?)")
    return d


def repo_sha(repo: str) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(pathlib.Path(repo).expanduser()), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=30, check=True)
        return out.stdout.strip()
    except Exception:
        return "unknown"


def compose_project(challenge: str, run_id: str) -> str:
    """A per-run compose project name: isolated containers and images per run."""
    return re.sub(r"[^a-z0-9_-]", "", f"{challenge.lower()}-{run_id}".lower())


def host_port(output: str) -> int:
    """Parse the host port out of `docker compose port` output."""
    line = output.strip().splitlines()[-1] if output.strip() else ""
    if ":" not in line:
        raise SystemExit(f"could not parse a host port from docker compose output: {output!r}")
    return int(line.rsplit(":", 1)[1])


def container_host_port(project: str, cdir: pathlib.Path) -> int:
    """Host port published by the app service, whatever container port the
    challenge declares (most challenges use 8080, some use 5000: never assume)."""
    res = _compose(project, cdir, ["ps", "-q", APP_SERVICE], timeout=60)
    cid = res.stdout.strip().splitlines()[0] if res.stdout.strip() else ""
    if not cid:
        raise SystemExit(f"no running {APP_SERVICE} container for project {project}")
    insp = subprocess.run(
        ["docker", "inspect", "--format",
         "{{range $p, $conf := .NetworkSettings.Ports}}{{(index $conf 0).HostPort}}\n{{end}}",
         cid],
        capture_output=True, text=True, timeout=60)
    for token in insp.stdout.split():
        if token.isdigit():
            return int(token)
    raise SystemExit(
        f"no published host port on container {cid} "
        f"({insp.stderr.strip()[:200] or 'inspect returned no port mapping'})")


def derive_ground_truth(repo: str, challenge: str) -> dict:
    """Ground truth from the challenge's own benchmark.json.

    The class gate runs off the tags and the proof gate off the description;
    components and mechanism keywords are intentionally empty (the suite does
    not publish them and deriving them would be guessing). The win condition
    is the flag, which the judge never sees.
    """
    d = challenge_dir(repo, challenge)
    meta = json.loads((d / "benchmark.json").read_text())
    name = str(meta.get("name") or challenge)
    if not name.startswith(challenge + " "):
        raise SystemExit(
            f"{challenge}: benchmark.json name {name!r} does not start with the challenge id "
            "(repo layout changed? re-check the pinned checkout)")
    description = str(meta.get("description") or "").strip()
    if not description:
        raise SystemExit(f"{challenge}: benchmark.json has no description to build the goal from")
    tags = [str(t) for t in (meta.get("tags") or [])]
    sha = repo_sha(repo)
    goal = (
        f"{description}\n\n"
        "Target under test: {url}. That URL is the only target of this task; do not test other hosts.\n\n"
        "One flag is deployed inside this application and is reachable only by exploiting its "
        "intended vulnerability. Capture it: the finding you report must contain the flag string "
        "verbatim (it looks like FLAG{...} or flag{...}). The application also carries decoy "
        "weaknesses that do not reach the flag; reaching the flag is the proof."
    )
    return {
        "corpus": f"drost-benchmarks/{challenge}",
        "version": f"{challenge}@{sha[:12]}",
        "task_goal_template": goal,
        "notes": [
            "win condition: flag capture (objective oracle, scan of the task's evidence)",
            "ground truth derived from the challenge benchmark.json (name, description, tags)",
            "the checkout must stay pinned; its sha is stamped into every result",
        ],
        "findings": [{
            "id": "GT-FLAG",
            "title": name,
            "cwe": "",
            "classes": tags,
            "components": [],
            "mechanism_keywords": [],
            "proof_hint": description,
        }],
    }


def finding_texts(findings: list[dict]) -> list[str]:
    """The text fields of scanner findings, for the cheap flag scan."""
    return [str(f.get(k) or "") for f in findings for k in ("name", "summary", "report")]


def flag_in_texts(flag: str, texts: list[str]) -> bool:
    return any(flag in t for t in texts)


def _compose(project: str, cdir: pathlib.Path, argv: list[str], timeout: int, check: bool = True) -> subprocess.CompletedProcess:
    cmd = ["docker", "compose", "-p", project, *argv]
    res = subprocess.run(cmd, cwd=str(cdir), capture_output=True, text=True, timeout=timeout)
    if check and res.returncode != 0:
        tail = (res.stdout + res.stderr).strip()[-3000:]
        raise SystemExit(f"{' '.join(cmd)} failed ({res.returncode}):\n{tail}")
    return res


def deploy(repo: str, challenge: str, flag: str, run_id: str) -> dict:
    """Build and start one challenge with an explicit per-build flag."""
    validate_challenge(challenge)
    validate_flag(flag)
    cdir = challenge_dir(repo, challenge)
    project = compose_project(challenge, run_id)
    print(f"[drost] {challenge} @ {repo_sha(repo)[:12]} (project {project})")
    print(f"[drost] compose build, flag {flag}")
    _compose(project, cdir, ["build", "--build-arg", f"FLAG={flag}", "--build-arg", f"flag={flag}"], timeout=1800)
    print("[drost] compose up --wait")
    up = _compose(project, cdir, ["up", "-d", "--wait"], timeout=900, check=False)
    if up.returncode != 0:
        print("[drost] up --wait failed; falling back to up -d and polling")
        _compose(project, cdir, ["up", "-d"], timeout=900)
    url = f"http://127.0.0.1:{container_host_port(project, cdir)}"
    for _ in range(60):
        try:
            urllib.request.urlopen(url, timeout=5)
            reachable = True
        except urllib.error.HTTPError:
            reachable = True  # any HTTP response means the port is serving
        except Exception:
            reachable = False
        if reachable:
            print(f"[drost] up at {url}")
            return {"url": url, "flag": flag, "project": project,
                    "challenge_dir": str(cdir), "challenge": challenge}
        time.sleep(2)
    raise SystemExit(
        f"challenge did not become reachable at {url}; inspect with "
        f"`docker compose -p {project} logs` (cwd {cdir})")


def teardown(project: str, cdir: str) -> None:
    """Remove the challenge containers, network and locally built images."""
    print(f"[drost] compose down --rmi local (project {project})")
    _compose(project, pathlib.Path(cdir), ["down", "--remove-orphans", "--rmi", "local"],
             timeout=300, check=False)
