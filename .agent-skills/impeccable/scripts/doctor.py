#!/usr/bin/env python3
"""Inspect local Impeccable state offline: no engine execution, network access, or writes.

Reports the pinned upstream release, the host's engine asset and digest, every
engine candidate the upstream launcher would consider (metadata only), installed
`impeccable` skill folders and whether each is the upstream skill or this catalog
operator, design-hook manifests that mention Impeccable, telemetry opt-outs, and
the project's Impeccable artifacts. Exit 0 means the inspection completed, 1 means
something could not be inspected, 2 is an argument error.
"""
import argparse
import errno
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "references" / "source.json"
TEXT_CAP = 1 << 20
CHUNK = 1 << 20
VARIABLE = re.compile(r"\$\{([A-Z_][A-Z0-9_]*):-([^}]*)\}")
FRONTMATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.S)
VERSION_LINE = re.compile(r"^\s*version:\s*[\"']?([0-9][0-9A-Za-z.+-]*)", re.M)
OS_NAMES = {"Darwin": "darwin", "Linux": "linux", "Windows": "windows"}
ARCH_NAMES = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "amd64": "x64"}


class Inspection:
    def __init__(self):
        self.errors = []

    def failed(self, path, exc):
        error = {"path": str(path), "errno": exc.errno, "message": exc.strerror or str(exc)}
        self.errors.append(error)
        return error

    def stat(self, path):
        """Return os.stat(path), None when absent, or raise-free error record."""
        try:
            return os.stat(path), None
        except OSError as exc:
            if exc.errno in (errno.ENOENT, errno.ENOTDIR):
                return None, None
            return None, self.failed(path, exc)

    def read_text(self, path):
        try:
            with open(path, "rb") as handle:
                data = handle.read(TEXT_CAP)
        except OSError as exc:
            if exc.errno in (errno.ENOENT, errno.ENOTDIR):
                return None
            self.failed(path, exc)
            return None
        return data.decode("utf-8", errors="replace")


def expand(template, home):
    def substitute(match):
        return os.environ.get(match.group(1), "").strip() or match.group(2)

    text = VARIABLE.sub(substitute, template)
    if text == "~" or text.startswith("~/"):
        text = str(home) + text[1:]
    return Path(text)


def host_target():
    system = platform.system()
    machine = platform.machine().lower()
    os_name = OS_NAMES.get(system)
    if os_name is None and system.upper().startswith(("MINGW", "MSYS", "CYGWIN")):
        os_name = "windows"
    return system, machine, os_name, ARCH_NAMES.get(machine)


def pinned_digest(source, asset):
    for row in source["engine"]["checksums"]:
        if row["version"] == source["engine_version"] and row["asset"] == asset:
            return row["sha256"]
    return None


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def inspect_candidate(inspection, origin, path, verify, expected, version=None):
    info = {"origin": origin, "path": None if path is None else str(path), "found": False,
            "regular_file": False, "executable": False, "kind": None, "error": None}
    if version is not None:
        info["engine_version"] = version
    if path is None:
        return info
    status, error = inspection.stat(path)
    if error is not None:
        info.update(found=None, regular_file=None, executable=None, error=error)
        return info
    if status is None:
        return info
    info["found"] = True
    info["regular_file"] = stat.S_ISREG(status.st_mode)
    info["executable"] = info["regular_file"] and os.access(path, os.X_OK)
    if not info["regular_file"]:
        return info
    try:
        with open(path, "rb") as handle:
            info["kind"] = "script" if handle.read(2) == b"#!" else "binary"
        if verify:
            info["sha256"] = sha256(path)
            info["matches_pinned_digest"] = None if expected is None else info["sha256"] == expected
    except OSError as exc:
        info["error"] = inspection.failed(path, exc)
    if origin == "versioned-cache":
        stamp = inspection.read_text(Path(str(path) + ".verified"))
        info["verified_stamp"] = None if stamp is None else (stamp.strip() == expected if expected else False)
    return info


def inspect_install(inspection, skill_dir, scope):
    skill_md = skill_dir / "SKILL.md"
    text = inspection.read_text(skill_md)
    if text is None:
        return None
    match = FRONTMATTER.match(text)
    front = match.group(1) if match else ""
    scripts = skill_dir / "scripts"
    if (scripts / "triage_findings.py").is_file() and "upstream_commit:" in front:
        kind = "catalog-operator"
    elif (scripts / "impeccable").is_file() or (scripts / "command-metadata.json").is_file():
        kind = "upstream"
    else:
        kind = "unknown"
    version = VERSION_LINE.search(front)
    engine = inspection.read_text(scripts / "VERSION") if kind == "upstream" else None
    return {
        "path": str(skill_dir),
        "scope": scope,
        "symlink": skill_dir.is_symlink(),
        "kind": kind,
        "version": version.group(1) if version else None,
        "engine_version": engine.strip() if engine else None,
    }


def inspect_config(inspection, path):
    text = inspection.read_text(path)
    report = {"present": text is not None, "valid_json": None, "telemetry": None, "hook_enabled": None}
    if text is None:
        return report
    try:
        data = json.loads(text)
    except ValueError:
        report["valid_json"] = False
        return report
    report["valid_json"] = isinstance(data, dict)
    if isinstance(data, dict):
        if isinstance(data.get("telemetry"), bool):
            report["telemetry"] = data["telemetry"]
        hook = data.get("hook")
        if isinstance(hook, dict) and isinstance(hook.get("enabled"), bool):
            report["hook_enabled"] = hook["enabled"]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--project", default=".", help="project root to inspect (default: current directory)")
    parser.add_argument("--verify-digest", action="store_true",
                        help="hash found engine candidates (reads bytes; never executes them)")
    args = parser.parse_args()
    project = Path(args.project).resolve()
    if not project.is_dir():
        parser.error(f"--project is not a directory: {args.project}")

    inspection = Inspection()
    try:
        source = json.loads(SOURCE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": f"cannot load {SOURCE}: {exc}"}), file=sys.stderr)
        return 1

    home = Path.home()
    system, machine, os_name, arch = host_target()
    exe = ".exe" if os_name == "windows" else ""
    asset = f"impeccable-{os_name}-{arch}{exe}" if os_name and arch else None
    expected = pinned_digest(source, asset) if asset else None
    fallback = None
    if expected is None and os_name == "windows" and arch == "arm64":
        # The launcher runs the x64 engine on Windows on ARM when no arm64 asset is pinned.
        fallback = "impeccable-windows-x64.exe"
        expected = pinned_digest(source, fallback)

    installs = []
    seen = set()
    roots = [(project / name / "skills", "project") for name in source["provider_skill_roots"]["project"]]
    roots += [(expand(template, home), "global") for template in source["provider_skill_roots"]["global"]]
    for root, scope in roots:
        skill_dir = root / "impeccable"
        key = os.path.normcase(os.path.abspath(skill_dir))
        if key in seen:
            continue
        seen.add(key)
        found = inspect_install(inspection, skill_dir, scope)
        if found is not None:
            installs.append(found)

    candidates = []
    override = os.environ.get("IMPECCABLE_BIN", "").strip()
    if override:
        candidates.append(inspect_candidate(inspection, "IMPECCABLE_BIN", Path(override), args.verify_digest, expected))
    if os_name and arch:
        for install in installs:
            if install["kind"] == "upstream":
                sibling = Path(install["path"]) / "scripts" / "bin" / f"{os_name}-{arch}" / f"impeccable{exe}"
                candidates.append(inspect_candidate(inspection, "sibling", sibling, args.verify_digest, expected))
    candidates.append(inspect_candidate(inspection, "home", home / ".impeccable" / "bin" / f"impeccable{exe}",
                                        args.verify_digest, expected))
    cache_root = expand("${IMPECCABLE_HOME:-~/.impeccable}", home)
    versions = [source["engine_version"]]
    versions += sorted({i["engine_version"] for i in installs if i["engine_version"]} - set(versions))
    for version in versions:
        digest = expected if version == source["engine_version"] else None
        candidates.append(inspect_candidate(inspection, "versioned-cache", cache_root / "bin" / version / f"impeccable{exe}",
                                            args.verify_digest, digest, version))
    on_path = shutil.which("impeccable")
    candidates.append(inspect_candidate(inspection, "path", Path(on_path) if on_path else None, args.verify_digest, expected))

    hooks = []
    manifests = [(project / rel, "project") for rel in source["hook_manifests"]["project"]]
    manifests += [(expand(template, home), "global") for template in source["hook_manifests"]["global"]]
    for path, scope in manifests:
        status, error = inspection.stat(path)
        present = status is not None
        mentions = False
        if present and stat.S_ISDIR(status.st_mode):
            mentions = "impeccable" in path.name
        elif present:
            text = inspection.read_text(path)
            mentions = text is not None and "impeccable" in text.lower()
        hooks.append({"path": str(path), "scope": scope, "present": present if error is None else None,
                      "mentions_impeccable": mentions})

    config = inspect_config(inspection, project / ".impeccable" / "config.json")
    config_local = inspect_config(inspection, project / ".impeccable" / "config.local.json")
    critique_dir = project / ".impeccable" / "critique"
    snapshots = []
    if critique_dir.is_dir():
        try:
            snapshots = sorted(entry.name for entry in os.scandir(critique_dir)
                               if entry.name.endswith(".md") and entry.name != "ignore.md")
        except OSError as exc:
            inspection.failed(critique_dir, exc)
    gitignore = inspection.read_text(project / ".gitignore") or ""
    do_not_track = os.environ.get("DO_NOT_TRACK")

    report = {
        "pinned": {
            "repository": source["repository"],
            "commit": source["commit"],
            "skill_version": source["skill_version"],
            "engine_version": source["engine_version"],
            "asset": asset,
            "asset_sha256": expected,
            "fallback_asset": fallback,
            "release_url": source["engine"]["release_url_template"].format(
                version=source["engine_version"], asset=fallback or asset) if asset else None,
        },
        "platform": system,
        "architecture": machine,
        "platform_supported": asset is not None and expected is not None,
        "installs": installs,
        "upstream_installed": any(i["kind"] == "upstream" for i in installs),
        "catalog_operator_installed": any(i["kind"] == "catalog-operator" for i in installs),
        "engine_candidates": candidates,
        "hooks": hooks,
        "hook_manifests_mentioning_impeccable": sum(1 for h in hooks if h["mentions_impeccable"]),
        "telemetry": {
            "do_not_track_env": "unset" if do_not_track is None else "set" if do_not_track == "1" else "other",
            "project_opt_out": config["telemetry"] is False or config_local["telemetry"] is False,
        },
        "project": {
            "root": str(project),
            "product_md": (project / "PRODUCT.md").is_file(),
            "design_md": (project / "DESIGN.md").is_file(),
            "impeccable_dir": (project / ".impeccable").is_dir(),
            "design_sidecar": (project / ".impeccable" / "design.json").is_file(),
            "config": config,
            "config_local": config_local,
            "critique_snapshots": snapshots,
            "gitignore_block": "# impeccable-ignore-start" in gitignore,
        },
        "errors": inspection.errors,
        "network_accessed": False,
        "engine_executed": False,
        "files_written": False,
    }
    print(json.dumps(report, sort_keys=True))
    return 1 if inspection.errors else 0


if __name__ == "__main__":
    sys.exit(main())
