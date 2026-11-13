#!/usr/bin/env python3
"""Offline browser-use host, project and source-checkout preflight.

Reads host facts, tool and browser presence, environment variable *names*, the
existence of a few state paths and (with --project) a project's browser-use pin.
It never runs browser-use, uv, pip, a browser or git beyond reading a checkout's
HEAD, opens no socket, reads no key or credential value, and writes nothing.
`runtime_verified` is always false: nothing here proves a browser, a key or a
cloud account works.
"""
from __future__ import annotations

import argparse
import glob as globlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any

SKILL = "browser-use"
SCOPE = "offline-preflight"
PINNED_COMMIT = "dfb6a73d520809341c975c6a01c228327991e88b"
PINNED_VERSION = "1.0.3"
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
MAX_MARKER_BYTES = 1_048_576
MAX_PROJECT_BYTES = 4_194_304
HEAD_BYTES = 4096
MAX_REQUIREMENTS_FILES = 20

# Public files of browser-use/browser-use at the audited tag; presence only.
STRUCTURE = (
    "README.md",
    "LICENSE",
    "pyproject.toml",
    "AGENTS.md",
    "MIGRATING.md",
    "browser_use/__init__.py",
    "browser_use/cli.py",
    "browser_use/skills/install.py",
    "skills/browser-use/SKILL.md",
)

# The CLI is installed already, or one documented install route must exist.
INSTALL_ROUTE_TOOLS = ("browser-use", "browseruse", "uv", "pip", "pip3")

OPTIONAL_TOOLS = (
    ("cli", ("browser-use",), "Browser Use CLI"),
    ("cli_alias", ("browseruse",), "`browseruse` alias of the CLI"),
    ("installer_uv", ("uv",), "uv, the documented install route"),
    ("installer_uvx", ("uvx",), "uvx, used by `browser-use install` for Playwright's Chromium"),
    ("installer_pip", ("pip", "pip3"), "pip, the documented alternative install route"),
    ("vcs", ("git",), "git, needed only to verify a source checkout commit"),
)

# Names and booleans only: a value is never read into the report.
CREDENTIAL_ENV = (
    ("BROWSER_USE_API_KEY", "Browser Use Cloud key (default model, cloud browsers)"),
    ("OPENAI_API_KEY", "OpenAI key for ChatOpenAI"),
    ("ANTHROPIC_API_KEY", "Anthropic key for ChatAnthropic"),
    ("GOOGLE_API_KEY", "Google key for ChatGoogle"),
)

# Endpoint, routing and path overrides. BU_CDP_URL / BU_CDP_WS can embed a key.
OVERRIDE_ENV = (
    "BU_NAME", "BU_CDP_URL", "BU_CDP_WS", "BH_OPEN_LIVE_URL", "BH_DOMAIN_SKILLS",
    "BH_REQUIRE_EXISTING_DAEMON", "BH_RECORD", "BH_TAB_MARKER", "BH_CHROME_PATH", "CHROME_PATH",
    "BH_HOME", "BROWSER_HARNESS_HOME", "BH_CONFIG_DIR", "BH_RUNTIME_DIR", "BH_TMP_DIR",
    "BH_AGENT_WORKSPACE", "BROWSER_USE_CONFIG_DIR", "BROWSER_USE_CONFIG_PATH",
    "PLAYWRIGHT_BROWSERS_PATH", "BROWSER_USE_LOGGING_LEVEL", "BROWSER_USE_DEVICE_ID",
)

# 0.x variables 1.0 no longer honors.
LEGACY_ENV = (
    "BROWSER_USE_ALLOWED_DOMAINS", "BROWSER_USE_PROXY_URL", "BROWSER_USE_NO_PROXY",
    "BROWSER_USE_PROXY_USERNAME", "BROWSER_USE_PROXY_PASSWORD",
)

HARNESS_TELEMETRY_ENV = ("BH_TELEMETRY", "BROWSER_HARNESS_TELEMETRY", "ANONYMIZED_TELEMETRY")

# `browser-use skill install --target all` writes <root>/browser-use/SKILL.md for each
# of these (browser_use/skills/install.py TARGET_DIR_BUILDERS at the audited tag).
SKILL_TARGETS = ("agents", "claude", "codex", "copilot", "cursor", "gemini", "openclaw", "opencode")

HOST_ENV_KEYS = (
    "PATH",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
)


class InputError(ValueError):
    """Raised for invalid command-line input without printing a traceback."""


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def parser() -> argparse.ArgumentParser:
    value = Parser(
        prog="preflight.py",
        description="Inspect local host, project and source-checkout prerequisites for browser-use. "
        f"Audited release {PINNED_VERSION} ({PINNED_COMMIT}).",
    )
    value.add_argument("--json", action="store_true", help="Emit preflight results as structured JSON.")
    value.add_argument(
        "--repo",
        type=str,
        default=None,
        help="Path to an existing, non-symlinked browser-use source checkout.",
    )
    value.add_argument(
        "--expect-commit",
        type=str,
        default=None,
        help="Expected 40-character hexadecimal git commit SHA (requires --repo).",
    )
    value.add_argument(
        "--project",
        type=str,
        default=None,
        help="Path to a project directory whose browser-use pin (pyproject.toml, requirements*.txt, "
        "uv.lock) and .env presence should be reported. No file other than those three is read.",
    )
    return value


def check(name: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    return item


def payload(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "skill": SKILL,
        "scope": SCOPE,
        "status": status,
        "runtime_verified": False,
        "checks": checks,
    }


def emit(value: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(value, indent=2))
    else:
        print(f"[{value['status'].upper()}] {value['skill']} ({value['scope']})")
        for item in value.get("checks", []):
            print(f"- {item['name']}: {item['detail']}")


# --------------------------------------------------------------------------- paths


def _home() -> Path | None:
    try:
        return Path.home()
    except (RuntimeError, KeyError, OSError):
        return None


def first_on_path(names: tuple[str, ...]) -> str | None:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


def _env_path(name: str) -> Path | None:
    raw = os.environ.get(name)
    return Path(raw).expanduser() if raw else None


def harness_home() -> Path | None:
    """browser-harness paths.home_dir()."""
    for name in ("BH_HOME", "BROWSER_HARNESS_HOME"):
        value = _env_path(name)
        if value is not None:
            return value
    base = _env_path("XDG_CONFIG_HOME")
    if base is not None:
        return base / "browser-harness"
    home = _home()
    return home / ".config" / "browser-harness" if home else None


def harness_config_dir() -> Path | None:
    return _env_path("BH_CONFIG_DIR") or harness_home()


def harness_runtime_dir() -> Path | None:
    explicit = _env_path("BH_RUNTIME_DIR") or _env_path("BH_TMP_DIR")
    if explicit is not None:
        return explicit
    base = harness_home()
    return base / "runtime" if base else None


def harness_workspace_dir() -> Path | None:
    explicit = _env_path("BH_AGENT_WORKSPACE")
    if explicit is not None:
        return explicit
    base = harness_home()
    return base / "agent-workspace" if base else None


def browser_use_config_dir() -> Path | None:
    explicit = _env_path("BROWSER_USE_CONFIG_DIR")
    if explicit is not None:
        return explicit
    base = _env_path("XDG_CONFIG_HOME")
    if base is not None:
        return base / "browseruse"
    home = _home()
    return home / ".config" / "browseruse" if home else None


def _lstat(path: Path) -> os.stat_result | None:
    try:
        return path.lstat()
    except OSError:
        return None


def _symlink_component(path: Path) -> Path | None:
    """Return the first symlink in a path, without following it or normalizing `..` away."""
    candidate = path if path.is_absolute() else Path(os.getcwd()) / path
    current = Path(candidate.parts[0])
    for part in candidate.parts[1:]:
        current = current / part
        try:
            target = current.lstat()
            if stat.S_ISLNK(target.st_mode):
                return current
        except OSError:
            return current
    return None


def _read_head(path: Path, limit: int) -> bytes | None:
    """Read at most `limit` bytes of a regular file; never follow a final symlink."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode):
            return None
        descriptor = os.open(path, flags)
    except OSError:
        return None
    try:
        with os.fdopen(descriptor, "rb") as handle:
            return handle.read(limit)
    except OSError:
        return None


# ------------------------------------------------------------------- host checks


def _platform_key() -> str:
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform == "win32":
        return "win32"
    return "linux"


def _is_snap(path: str) -> bool:
    """Ubuntu Snap Chromium cannot open DevTools for a browser it did not start itself."""
    if not sys.platform.startswith("linux"):
        return False
    try:
        real = os.path.realpath(path)
    except OSError:
        return False
    head = _read_head(Path(real), HEAD_BYTES) or b""
    return "/snap/" in real or (head.startswith(b"#!") and b"/snap/" in head)


def local_browser_candidates() -> list[str]:
    """Browsers browser-use's find_binary would consider, in its order. Presence only: never executed."""
    found: list[str] = []
    for name in ("BH_CHROME_PATH", "CHROME_PATH"):
        raw = (os.environ.get(name) or "").strip()
        if raw and Path(raw).expanduser().is_file():
            found.append(str(Path(raw).expanduser()))
    kind = _platform_key()
    if kind == "darwin":
        roots = [Path("/Applications")]
        home = _home()
        if home:
            roots.append(home / "Applications")
        for app in ("Google Chrome", "Chromium", "Microsoft Edge", "Google Chrome Canary"):
            for root in roots:
                candidate = root / f"{app}.app" / "Contents" / "MacOS" / app
                if candidate.is_file():
                    found.append(str(candidate))
    elif kind == "win32":
        rels = (
            r"Google\Chrome\Application\chrome.exe",
            r"Chromium\Application\chrome.exe",
            r"Microsoft\Edge\Application\msedge.exe",
        )
        roots = [Path(value) for key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA") if (value := os.environ.get(key))]
        for rel in rels:
            for root in roots:
                candidate = root / rel
                if candidate.is_file():
                    found.append(str(candidate))
    else:
        for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser",
                     "microsoft-edge-stable", "microsoft-edge"):
            path = shutil.which(name)
            if path:
                found.append(path)
    seen: set[str] = set()
    unique: list[str] = []
    for path in found:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique


def playwright_chromium_builds() -> int:
    """Count `chromium-*` build directories left by `browser-use install`; names only."""
    raw = (os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or "").strip()
    kind = _platform_key()
    home = _home()
    if raw in ("", "0"):
        if home is None:
            return 0
        if kind == "darwin":
            root = home / "Library" / "Caches" / "ms-playwright"
        elif kind == "win32":
            local = os.environ.get("LOCALAPPDATA")
            root = (Path(local) if local else home / "AppData" / "Local") / "ms-playwright"
        else:
            root = home / ".cache" / "ms-playwright"
    else:
        root = Path(raw).expanduser()
    try:
        return sum(1 for entry in root.glob("chromium-*") if entry.is_dir())
    except OSError:
        return 0


def library_telemetry_enabled() -> bool:
    """browser_use.config.Config.ANONYMIZED_TELEMETRY: unset means on."""
    value = os.environ.get("ANONYMIZED_TELEMETRY", "true").strip().lower()
    return value != "" and value[0] in "ty1"


def harness_telemetry_env_disabled() -> bool:
    """browser_harness.telemetry._env_disabled()."""
    return any((os.environ.get(name) or "").lower() in {"0", "false", "no", "off"} for name in HARNESS_TELEMETRY_ENV)


def state_checks(checks: list[dict[str, Any]]) -> None:
    config = harness_config_dir()
    if config is None:
        checks.append(check("state_stored_key", "info", "home directory is undetermined; stored-key file not inspected", optional=True))
    else:
        auth = config / "auth.json"
        info = _lstat(auth)
        present = info is not None
        checks.append(
            check(
                "state_stored_key",
                "info",
                f"the key file `browser-use login` writes {'exists' if present else 'is absent'}; contents were not read",
                path=str(auth),
                present=present,
                symlink=bool(info and stat.S_ISLNK(info.st_mode)),
                optional=True,
            )
        )

    product = browser_use_config_dir()
    if product is not None:
        try:
            present = product.is_dir()
        except OSError:
            present = False
        checks.append(
            check(
                "state_browser_use_config",
                "info",
                f"{'exists' if present else 'is absent'}; holds the telemetry device id and any 0.x config; contents were not read",
                path=str(product),
                present=present,
                optional=True,
            )
        )

    workspace = harness_workspace_dir()
    if workspace is not None:
        helpers = workspace / "agent_helpers.py"
        info = _lstat(helpers)
        present = info is not None
        checks.append(
            check(
                "state_agent_helpers",
                "warn" if present else "info",
                "agent_helpers.py exists: the CLI and `--cli-mcp` execute it on every call; review it as code (contents were not read)"
                if present
                else "no agent_helpers.py in the harness agent workspace",
                path=str(helpers),
                present=present,
                domain_skills_enabled=os.environ.get("BH_DOMAIN_SKILLS") == "1",
                optional=True,
            )
        )

    runtime = harness_runtime_dir()
    markers: list[str] = []
    if runtime is not None:
        try:
            with os.scandir(runtime) as entries:
                for entry in entries:
                    if not entry.name.endswith(".cloud"):
                        continue
                    info = _lstat(Path(entry.path))
                    if info is not None and stat.S_ISREG(info.st_mode) and info.st_size > 0:
                        markers.append(entry.name)
        except OSError:
            markers = []
    checks.append(
        check(
            "state_cloud_markers",
            "warn" if markers else "info",
            f"{len(markers)} cloud browser marker(s) hold a browser id (a stopped browser leaves an empty file); "
            "a recorded browser may still bill until stop_remote_daemon(name) succeeds; ids were not read"
            if markers
            else "no recorded cloud browser id found in the daemon runtime directory",
            markers=sorted(markers),
            optional=True,
        )
    )


def skill_collision_check(checks: list[dict[str, Any]]) -> None:
    """Where `browser-use skill install` would write, and who owns what is there now. Read-only."""
    home = _home()
    if home is None:
        checks.append(check("skill_install_collision", "info", "home directory is undetermined; skill roots not inspected", optional=True))
        return
    xdg = _env_path("XDG_CONFIG_HOME")
    roots: list[tuple[str, Path]] = []
    for target in SKILL_TARGETS:
        if target == "opencode":
            roots.append((target, (xdg or home / ".config") / "opencode" / "skills"))
        else:
            roots.append((target, home / f".{target}" / "skills"))
    entries: list[dict[str, Any]] = []
    for target, root in roots:
        entry = root / "browser-use"
        info = _lstat(entry)
        if info is None:
            continue
        kind = "symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "other"
        owner = "absent"
        if kind in {"symlink", "directory"}:
            head = _read_head(entry / "SKILL.md", HEAD_BYTES)
            if head is None:
                owner = "unreadable"
            elif b"openclaw" in head or b"homepage: https://browser-use.com" in head:
                owner = "upstream"
            elif b"upstream_commit:" in head:
                owner = "catalog"
            else:
                owner = "unknown"
        entries.append({"target": target, "path": str(entry), "kind": kind, "skill_md": owner})
    upstream = [item for item in entries if item["skill_md"] == "upstream"]
    detail = (
        "`browser-use skill install` (default target `all`) overwrites <root>/browser-use/SKILL.md in ~/.agents/skills and every "
        "installed agent directory, also through symlinks, and replaces this catalog skill's SKILL.md; "
        f"{len(upstream)} existing copy(ies) carry upstream-authored text"
        if upstream
        else "`browser-use skill install` would overwrite <root>/browser-use/SKILL.md in ~/.agents/skills and every installed "
        "agent directory, also through symlinks; no upstream-authored copy was found"
    )
    checks.append(check("skill_install_collision", "warn" if upstream else "info", detail, entries=entries, optional=True))


def host_checks(checks: list[dict[str, Any]]) -> None:
    os_name = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    checks.append(
        check(
            "host",
            "ok",
            "host facts observed without executing browser-use",
            os=os_name,
            arch=arch,
            release=platform.release() or "unknown",
        )
    )
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    checks.append(
        check(
            "python",
            "ok" if (py.major, py.minor) >= (3, 10) else "blocked",
            f"Python {py_text}; helper requires Python 3.10+",
            version=py_text,
            minimum="3.10",
        )
    )
    meets = (py.major, py.minor) >= (3, 11)
    checks.append(
        check(
            "python_for_pip_install",
            "ok" if meets else "info",
            "this interpreter satisfies browser-use's Python >=3.11,<4.0 requirement for a pip install"
            if meets
            else "this interpreter is below Python 3.11; use `uv tool install` (uv fetches a suitable Python) or a newer interpreter",
            version=py_text,
            minimum="3.11",
            optional=True,
        )
    )

    route = next((tool for tool in INSTALL_ROUTE_TOOLS if shutil.which(tool)), None)
    checks.append(
        check(
            "install_route",
            "ok" if route else "blocked",
            f"{route} discoverable; the CLI is installed or an install route exists (version unverified, not invoked)"
            if route
            else "none of browser-use, browseruse, uv, pip, pip3 is discoverable on PATH; browser-use cannot be installed from this host",
            path=shutil.which(route) if route else None,
        )
    )
    for name, executables, label in OPTIONAL_TOOLS:
        path = first_on_path(executables)
        detail = (
            f"{label} discoverable; version unverified because it was not invoked"
            if path
            else f"{label} not discoverable on PATH"
        )
        checks.append(check(name, "ok" if path else "info", detail, path=path, optional=True))

    candidates = local_browser_candidates()
    usable = [path for path in candidates if not _is_snap(path)]
    snaps = [path for path in candidates if path not in usable]
    builds = playwright_chromium_builds()
    if usable:
        checks.append(
            check(
                "local_browser",
                "ok",
                f"{len(usable)} local Chrome/Chromium/Edge candidate(s) found; none was executed",
                candidates=usable,
                optional=True,
            )
        )
    else:
        checks.append(
            check(
                "local_browser",
                "info",
                "no local Chrome, Chromium or Edge found; `browser-use install` downloads Playwright's Chromium "
                "(needs uvx), or use a Browser Use Cloud browser (needs a key)",
                candidates=[],
                optional=True,
            )
        )
    if snaps:
        checks.append(
            check(
                "snap_chromium",
                "warn",
                "Snap Chromium cannot open DevTools for a browser it did not start itself; install Google Chrome "
                "or set BH_CHROME_PATH (`browser-use doctor --fix-snap` prints the steps)",
                candidates=snaps,
                optional=True,
            )
        )
    checks.append(
        check(
            "playwright_chromium",
            "ok" if builds else "info",
            f"{builds} Playwright Chromium build(s) in the cache" if builds else "no Playwright Chromium build in the cache",
            builds=builds,
            optional=True,
        )
    )
    if _platform_key() == "linux":
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        checks.append(
            check(
                "display",
                "ok" if has_display else "info",
                "a display is configured" if has_display else "no DISPLAY or WAYLAND_DISPLAY: only a headless own Chromium or a cloud browser "
                "can run; attaching to a visible Chrome needs a display",
                optional=True,
            )
        )

    present = {name: bool(os.environ.get(name)) for name, _ in CREDENTIAL_ENV}
    checks.append(
        check(
            "credentials_env",
            "info",
            "credential variables set (names only; values are never read or printed): "
            + (", ".join(name for name, flag in present.items() if flag) or "none"),
            present=present,
            optional=True,
        )
    )
    library_on = library_telemetry_enabled()
    harness_off = harness_telemetry_env_disabled()
    sends = library_on and not harness_off
    checks.append(
        check(
            "telemetry",
            "info",
            "usage telemetry is ON by default, including CLI events for `--help` and `--version`: set ANONYMIZED_TELEMETRY=false "
            "and BH_TELEMETRY=0 before the first call if the user has not agreed"
            if sends
            else "usage telemetry is switched off by the environment (a telemetry.json setting, not read here, can also switch it off)",
            library_enabled=library_on,
            harness_env_disabled=harness_off,
            optional=True,
        )
    )
    overrides = sorted(name for name in OVERRIDE_ENV if os.environ.get(name))
    checks.append(
        check(
            "env_overrides",
            "info",
            "routing, path and behavior overrides set (names only): " + (", ".join(overrides) or "none")
            + ("; BU_CDP_URL / BU_CDP_WS route every CLI call to that endpoint and may embed a key" if {"BU_CDP_URL", "BU_CDP_WS"} & set(overrides) else ""),
            present=overrides,
            optional=True,
        )
    )
    legacy = sorted(name for name in LEGACY_ENV if os.environ.get(name))
    checks.append(
        check(
            "env_legacy",
            "warn" if legacy else "info",
            "0.x variables set: Browser() raises while BROWSER_USE_ALLOWED_DOMAINS is set (use Browser(allowed_domains=[...])); "
            "the proxy variables make `browser-use --mcp` exit 2: " + ", ".join(legacy)
            if legacy
            else "no removed 0.x environment variable is set",
            present=legacy,
            optional=True,
        )
    )
    state_checks(checks)
    skill_collision_check(checks)

    supported = os_name in {"Darwin", "Linux", "Windows"}
    checks.append(
        check(
            "platform",
            "ok" if supported else "info",
            "platform is in the upstream CI matrix (macOS, Linux, Windows)"
            if supported
            else "platform is outside the upstream CI matrix; readiness unverified",
            os=os_name,
        )
    )
    checks.append(
        check(
            "data_boundary",
            "info",
            "preflight status does not assert that browser-use, a browser, Chrome remote debugging, a Browser Use key, provider access, "
            "cloud credit or any stored login works; no browser-use, uv, pip, browser, installer, server, download, network request, "
            "credential read or write was performed",
        )
    )


# ----------------------------------------------------------------- repo checkout


def _safe_marker(repo: Path, relative: str, checks: list[dict[str, Any]]) -> None:
    current = repo
    parts = PurePosixPath(relative).parts
    for part in parts[:-1]:
        current = current / part
        try:
            marker = current.lstat()
        except FileNotFoundError:
            checks.append(check(f"repo.file:{relative}", "blocked", "required public source marker is missing", path=str(repo / relative)))
            return
        except OSError as exc:
            checks.append(check(f"repo.file:{relative}", "blocked", f"could not inspect source marker: {type(exc).__name__}", path=str(repo / relative)))
            return
        if stat.S_ISLNK(marker.st_mode):
            checks.append(check(f"repo.file:{relative}", "blocked", "source marker path component is a symlink", path=str(repo / relative)))
            return
        if not stat.S_ISDIR(marker.st_mode):
            checks.append(check(f"repo.file:{relative}", "blocked", "source marker parent is not a directory", path=str(repo / relative)))
            return

    path = current / parts[-1]
    try:
        marker = path.lstat()
    except FileNotFoundError:
        checks.append(check(f"repo.file:{relative}", "blocked", "required public source marker is missing", path=str(path)))
        return
    except OSError as exc:
        checks.append(check(f"repo.file:{relative}", "blocked", f"could not inspect source marker: {type(exc).__name__}", path=str(path)))
        return
    if stat.S_ISLNK(marker.st_mode):
        checks.append(check(f"repo.file:{relative}", "blocked", "source marker is a symlink", path=str(path)))
    elif not stat.S_ISREG(marker.st_mode):
        checks.append(check(f"repo.file:{relative}", "blocked", "source marker is not a regular file", path=str(path)))
    elif marker.st_size > MAX_MARKER_BYTES:
        checks.append(check(f"repo.file:{relative}", "blocked", f"source marker exceeds {MAX_MARKER_BYTES} bytes", path=str(path), size=marker.st_size))
    else:
        checks.append(check(f"repo.file:{relative}", "ok", "required public source marker is present; contents were not read", path=str(path), size=marker.st_size))


def _approved_git_environment() -> dict[str, str]:
    environment = {key: os.environ[key] for key in HOST_ENV_KEYS if key in os.environ}
    environment.update(
        {
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_ALLOW_PROTOCOL": "",
        }
    )
    return environment


def _inspect_commit(repo: Path, expected: str | None, checks: list[dict[str, Any]]) -> None:
    git_bin = shutil.which("git")
    if git_bin is None:
        checks.append(check("repo_commit", "blocked", "git is unavailable; checkout commit cannot be inspected"))
        return
    try:
        process = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=5,
            env=_approved_git_environment(),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        checks.append(check("repo_commit", "blocked", f"bounded git inspection failed: {type(exc).__name__}"))
        return
    lines = process.stdout.splitlines()
    if process.returncode != 0 or len(lines) != 2:
        checks.append(check("repo_commit", "blocked", "bounded git inspection did not return checkout root and full commit"))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == repo.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(check("repo_root", "blocked", "git show-toplevel does not match supplied checkout", expected=str(repo.resolve())))
        return
    if not SHA_RE.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "bounded git inspection did not return a full commit"))
        return
    if expected is None:
        checks.append(check("repo_commit", "ok", "observed checkout commit; no comparison requested", observed=observed))
    else:
        matches = observed.lower() == expected.lower()
        checks.append(
            check(
                "repo_commit",
                "ok" if matches else "blocked",
                "checkout commit matches --expect-commit" if matches else "checkout commit mismatches --expect-commit",
                observed=observed,
                expected=expected,
            )
        )


def _checked_directory(arg: str, label: str, checks: list[dict[str, Any]]) -> Path | None:
    try:
        path = Path(arg).expanduser()
    except (RuntimeError, OSError, ValueError) as exc:
        checks.append(check(label, "blocked", f"could not expand --{label} directory: {type(exc).__name__}"))
        return None
    symlink = _symlink_component(path)
    if symlink is not None:
        checks.append(check(label, "blocked", f"supplied --{label} path contains a symlink component", path=str(symlink)))
        return None
    try:
        status = path.resolve().stat()
    except FileNotFoundError:
        checks.append(check(label, "blocked", f"supplied --{label} directory does not exist", path=str(path)))
        return None
    except OSError as exc:
        checks.append(check(label, "blocked", f"could not inspect --{label} directory: {type(exc).__name__}", path=str(path)))
        return None
    if not stat.S_ISDIR(status.st_mode):
        checks.append(check(label, "blocked", f"supplied --{label} is not a directory", path=str(path)))
        return None
    checks.append(check(label, "ok", f"supplied --{label} is a directory without symlinks", path=str(path)))
    return path


def inspect_repo(repo_arg: str, expected: str | None, checks: list[dict[str, Any]]) -> None:
    repo = _checked_directory(repo_arg, "repo", checks)
    if repo is None:
        return
    for relative in STRUCTURE:
        _safe_marker(repo, relative, checks)
    _inspect_commit(repo, expected, checks)


# --------------------------------------------------------------- project pin audit

_NAME = r"browser[-_.]use(?![A-Za-z0-9_.-])"
_EXTRAS = r"(?:\[[A-Za-z0-9_.,\s-]{0,200}\])?"
# Every pattern runs on one line at a time and uses [ \t] (never \s, which spans newlines) with bounded repetition,
# so a crafted file cannot make the scan super-linear.
PEP508_RE = re.compile(r"[\"'][ \t]*" + _NAME + _EXTRAS + r"[ \t]*(?P<spec>[^\"';,\]]*)", re.IGNORECASE)
POETRY_RE = re.compile(r"[ \t]*" + _NAME + r"[ \t]*=[ \t]*[\"'](?P<spec>[^\"']*)[\"']", re.IGNORECASE)
REQUIREMENT_RE = re.compile(r"[ \t]*" + _NAME + _EXTRAS + r"[ \t]*(?P<spec>[^#;\r\n]*)", re.IGNORECASE)
LOCK_VERSION_RE = re.compile(r"version[ \t]*=[ \t]*\"(?P<version>[^\"]+)\"")
EXACT_RE = re.compile(r"^={2,3}[ \t]*(?P<version>\d[A-Za-z0-9.+!_-]{0,63})[ \t]*$")
MAJOR_RE = re.compile(r"^\d+")
MAX_LINE_CHARS = 20_000
MAX_SPEC_CHARS = 200
MAX_PIN_CHECKS = 20


def classify_spec(spec: str) -> tuple[str, str | None]:
    """('exact-1x' | 'exact-0x' | 'exact-other' | 'range' | 'unpinned', version)"""
    spec = re.split(r"[ \t]+(?:--|;)", spec[:MAX_SPEC_CHARS].strip(), maxsplit=1)[0].strip()
    if not spec:
        return "unpinned", None
    exact = EXACT_RE.match(spec)
    if exact is None:
        return "range", None
    version = exact.group("version")
    major = int(MAJOR_RE.match(version).group())  # EXACT_RE guarantees a leading digit
    return ("exact-1x" if major == 1 else "exact-0x" if major == 0 else "exact-other"), version


def _code_lines(text: str) -> list[str]:
    """Non-comment lines, each cut to MAX_LINE_CHARS."""
    return [line[:MAX_LINE_CHARS] for line in text.splitlines() if not line.lstrip().startswith("#")]


def _lock_version(text: str) -> str | None:
    """The browser-use version in a uv.lock `[[package]]` entry: a name line followed by a version line."""
    lines = text.splitlines()
    for index in range(len(lines) - 1):
        if lines[index][:MAX_LINE_CHARS].replace(" ", "").replace("\t", "").lower() == 'name="browser-use"':
            match = LOCK_VERSION_RE.match(lines[index + 1][:MAX_LINE_CHARS].lstrip())
            if match:
                return match.group("version")
    return None


def _read_project_file(path: Path) -> tuple[str | None, str | None]:
    """(text, skip_reason). Regular, non-symlink, bounded."""
    info = _lstat(path)
    if info is None:
        return None, None
    if stat.S_ISLNK(info.st_mode):
        return None, "is a symlink; skipped"
    if not stat.S_ISREG(info.st_mode):
        return None, "is not a regular file; skipped"
    if info.st_size > MAX_PROJECT_BYTES:
        return None, f"exceeds {MAX_PROJECT_BYTES} bytes; skipped"
    head = _read_head(path, MAX_PROJECT_BYTES)
    if head is None:
        return None, "could not be read; skipped"
    return head.decode("utf-8", errors="replace"), None


def _pin_check(label: str, version_spec: str, checks: list[dict[str, Any]]) -> None:
    kind, version = classify_spec(version_spec)
    if kind == "exact-1x":
        note = "" if version == PINNED_VERSION else f"; references were audited against {PINNED_VERSION}"
        checks.append(check(f"project.pin:{label}", "ok", f"pinned exactly to {version}{note}", kind=kind, version=version))
    elif kind in {"exact-0x", "exact-other"}:
        checks.append(
            check(
                f"project.pin:{label}",
                "warn",
                f"pinned to {version}, a different major line: 1.0 replaced the engine and the 0.x API "
                "(see references/library-and-cloud.md) before changing any code",
                kind=kind,
                version=version,
            )
        )
    else:
        checks.append(
            check(
                f"project.pin:{label}",
                "warn",
                "not pinned exactly; upstream pins with == because releases move fast and can break APIs",
                kind=kind,
            )
        )


def _pin_checks(label: str, specs: list[str], checks: list[dict[str, Any]], hits: list[str]) -> None:
    """One check per browser-use entry in a file, capped so a crafted file cannot flood the report."""
    if specs:
        hits.append(label)
    for index, spec in enumerate(specs[:MAX_PIN_CHECKS]):
        _pin_check(label if index == 0 else f"{label}#{index + 1}", spec, checks)
    if len(specs) > MAX_PIN_CHECKS:
        extra = len(specs) - MAX_PIN_CHECKS
        checks.append(check(f"project.pin_truncated:{label}", "info", f"{extra} further browser-use entries in {label} were not listed"))


def inspect_project(project_arg: str, checks: list[dict[str, Any]]) -> None:
    project = _checked_directory(project_arg, "project", checks)
    if project is None:
        return
    hits: list[str] = []

    text, skipped = _read_project_file(project / "pyproject.toml")
    if skipped:
        checks.append(check("project.pin:pyproject.toml", "info", f"pyproject.toml {skipped}"))
    elif text is not None:
        specs: list[str] = []
        for line in _code_lines(text):
            specs.extend(m.group("spec") for m in PEP508_RE.finditer(line))
            poetry = POETRY_RE.match(line)
            if poetry:
                spec = poetry.group("spec").strip()
                specs.append("==" + spec if spec[:1].isdigit() else spec)  # Poetry: a bare version is an exact pin
        _pin_checks("pyproject.toml", specs, checks, hits)

    try:
        names = sorted(
            Path(path).name for path in globlib.glob(os.path.join(globlib.escape(str(project)), "requirements*.txt"))
        )[:MAX_REQUIREMENTS_FILES]
    except OSError:
        names = []
    for name in names:
        text, skipped = _read_project_file(project / name)
        if skipped:
            checks.append(check(f"project.pin:{name}", "info", f"{name} {skipped}"))
            continue
        if text is None:
            continue
        _pin_checks(name, [m.group("spec") for m in map(REQUIREMENT_RE.match, _code_lines(text)) if m], checks, hits)

    text, skipped = _read_project_file(project / "uv.lock")
    if skipped:
        checks.append(check("project.pin:uv.lock", "info", f"uv.lock {skipped}"))
    elif text is not None:
        locked = _lock_version(text)
        if locked:
            _pin_checks("uv.lock", ["==" + locked], checks, hits)

    if not hits:
        checks.append(check("project_dependency", "info", "no browser-use dependency found in pyproject.toml, requirements*.txt or uv.lock"))
    else:
        checks.append(check("project_dependency", "info", f"browser-use dependency found in: {', '.join(hits)}", sources=hits))
    dotenv = _lstat(project / ".env")
    checks.append(
        check(
            "project_dotenv",
            "info",
            "a .env exists in the project; Agent and Browser load a .env from the working directory or a parent on import "
            "(contents were not read)"
            if dotenv is not None
            else "no .env in the project directory (a parent directory's .env would still be loaded)",
            present=dotenv is not None,
            optional=True,
        )
    )


# ------------------------------------------------------------------------- main


def parse(raw: list[str]) -> tuple[argparse.Namespace | None, str | None]:
    if "--help" in raw or "-h" in raw:
        parser().print_help()
        return None, None
    try:
        return parser().parse_args(raw), None
    except (InputError, SystemExit) as exc:
        return None, str(exc) or "invalid arguments"


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    args, error = parse(raw)
    if args is None and error is None:
        return 0
    if error is not None:
        emit(payload("error", [check("input", "blocked", error)]), wants_json)
        return 2
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        emit(payload("error", [check("input", "blocked", "--expect-commit requires --repo")]), args.json)
        return 2
    if args.expect_commit is not None and not SHA_RE.fullmatch(args.expect_commit):
        emit(payload("error", [check("input", "blocked", "--expect-commit must be exactly 40 hexadecimal characters")]), args.json)
        return 2

    checks: list[dict[str, Any]] = []
    host_checks(checks)
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)
    if args.project is not None:
        inspect_project(args.project, checks)

    blocked = any(item["status"] == "blocked" for item in checks)
    emit(payload("blocked" if blocked else "ok", checks), args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
