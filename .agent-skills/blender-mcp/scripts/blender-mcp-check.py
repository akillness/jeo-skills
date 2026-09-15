#!/usr/bin/env python3
"""Offline readiness and posture checker for MCP for Blender.

Read-only and offline by design. It never opens the Blender socket, launches
Blender, installs or writes anything, calls a provider, or prints a credential
value. Credentials and tokens are reported as set or unset only.

Verified against upstream commit 7684c6b3ad2aa0710bbdb1cb06b497c90899ae00
(package 1.9.4, addon protocol 7).

Subcommands:
  doctor    host tools, installed addon, and variable presence
  posture   computed safety and privacy posture
  upstream  commit-pinned source URLs

Exit codes: 0 ok, 2 a non-local Blender host is configured, 1 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import sys
from pathlib import Path

PINNED_COMMIT = "7684c6b3ad2aa0710bbdb1cb06b497c90899ae00"
BASE = "https://github.com/ahujasid/blender-mcp"
EXPECTED_ADDON_PROTOCOL_VERSION = 7
DEFAULT_HOST = "localhost"
DEFAULT_PORT = 9876

TRUTHY = {"true", "1", "yes", "on"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

TELEMETRY_OPT_OUT_VARS = (
    "DISABLE_TELEMETRY",
    "BLENDER_MCP_DISABLE_TELEMETRY",
    "MCP_DISABLE_TELEMETRY",
)

CREDENTIAL_VARS = (
    "BLENDERMCP_SKETCHFAB_API_KEY",
    "BLENDERMCP_POLYPIZZA_API_KEY",
    "BLENDERMCP_HYPER3D_API_KEY",
    "BLENDERMCP_HUNYUAN3D_SECRET_ID",
    "BLENDERMCP_HUNYUAN3D_SECRET_KEY",
    "BLENDERMCP_HUNYUAN3D_API_URL",
)

HOST_TOOLS = (
    ("blender", "the Blender application itself", ("blender",)),
    ("python3", "3.10+ required by the server", ("python3", "python")),
    ("uv", "recommended package manager", ("uv",)),
    ("uvx", "how clients normally launch the server", ("uvx",)),
    ("pipx", "alternative install path", ("pipx",)),
    ("docker", "optional containerised server", ("docker",)),
)

ADDON_FILENAMES = ("blender_mcp.py", "addon.py")
_VERSION_RE = re.compile(r"^ADDON_PROTOCOL_VERSION\s*=\s*(\d+)", re.MULTILINE)

# `addon.py` is a generic filename, so a file only counts as this project's addon
# when it identifies itself. Upstream's addon_manager matches the current name and
# the pre-rename "Blender MCP" so older installs are still recognised.
_IDENTITY_RE = re.compile(r"[\"']name[\"']\s*:\s*[\"'](MCP for Blender|Blender MCP)[\"']")


def truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in TRUTHY


def blender_addon_roots() -> list[Path]:
    """Candidate Blender addon directories for this platform.

    An explicit BLENDERMCP_ADDONS_DIR wins, matching upstream's override.
    """
    override = os.environ.get("BLENDERMCP_ADDONS_DIR", "").strip()
    if override:
        return [Path(override).expanduser()]

    home = Path.home()
    system = platform.system()
    if system == "Darwin":
        base = home / "Library" / "Application Support" / "Blender"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) / "Blender Foundation" / "Blender" if appdata else home
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "blender"

    if not base.is_dir():
        return []
    roots = []
    for version_dir in sorted(base.iterdir()):
        if not version_dir.is_dir():
            continue
        for tail in (("scripts", "addons"), ("scripts", "addons_core")):
            candidate = version_dir.joinpath(*tail)
            if candidate.is_dir():
                roots.append(candidate)
    return roots


def inspect_addon_file(path: Path) -> dict[str, object] | None:
    """Return addon details, or None when the file is not this project's addon."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    version_match = _VERSION_RE.search(text)
    identity_match = _IDENTITY_RE.search(text)
    if version_match is None and identity_match is None:
        return None

    version = int(version_match.group(1)) if version_match else None
    return {
        "path": str(path),
        "protocol_version": version,
        "declared_name": identity_match.group(1) if identity_match else None,
        "outdated": version is None or version < EXPECTED_ADDON_PROTOCOL_VERSION,
        "predates_protocol_constant": version is None,
    }


def find_installed_addons() -> list[dict[str, object]]:
    found = []
    for root in blender_addon_roots():
        for name in ADDON_FILENAMES:
            candidate = root / name
            if candidate.is_file():
                details = inspect_addon_file(candidate)
                if details is not None:
                    found.append(details)
    return found


def resolve_connection() -> dict[str, object]:
    host = os.environ.get("BLENDER_HOST", "").strip() or DEFAULT_HOST
    raw_port = os.environ.get("BLENDER_PORT", "").strip()
    port: int | str = DEFAULT_PORT
    port_note = "default"
    if raw_port:
        try:
            port = int(raw_port)
            port_note = "from BLENDER_PORT"
        except ValueError:
            port_note = f"BLENDER_PORT is not a valid port number; server falls back to {DEFAULT_PORT}"
    return {
        "host": host,
        "port": port,
        "port_source": port_note,
        "host_is_local": host.lower() in LOCAL_HOSTS,
    }


def build_report() -> dict[str, object]:
    tools = []
    for label, note, candidates in HOST_TOOLS:
        resolved = next((shutil.which(c) for c in candidates if shutil.which(c)), None)
        tools.append({"name": label, "path": resolved, "present": bool(resolved), "note": note})

    telemetry_opt_out = [v for v in TELEMETRY_OPT_OUT_VARS if truthy(os.environ.get(v))]
    credentials = [
        {"name": v, "state": "set" if os.environ.get(v, "").strip() else "unset"}
        for v in CREDENTIAL_VARS
    ]

    return {
        "pinned_commit": PINNED_COMMIT,
        "expected_addon_protocol_version": EXPECTED_ADDON_PROTOCOL_VERSION,
        "platform": f"{platform.system()} {platform.machine()}",
        "network_requests": 0,
        "tools": tools,
        "addons": find_installed_addons(),
        "connection": resolve_connection(),
        "safe_mode_enabled": truthy(os.environ.get("BLENDER_MCP_SAFE_MODE")),
        "telemetry_opt_out_vars_set": telemetry_opt_out,
        "credentials": credentials,
    }


def posture_findings(report: dict[str, object]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    conn = report["connection"]  # type: ignore[index]

    if report["safe_mode_enabled"]:
        findings.append(
            {
                "level": "OK",
                "topic": "code",
                "message": "BLENDER_MCP_SAFE_MODE is on, so scripts are validated before they "
                "reach Blender. It guards the MCP path only and is not a sandbox.",
            }
        )
    else:
        findings.append(
            {
                "level": "WARN",
                "topic": "code",
                "message": "Safe mode is off, which is the upstream default. execute_blender_code "
                "runs unvalidated Python inside Blender. Tell the user to save their work, and "
                "set BLENDER_MCP_SAFE_MODE=1 for asset-browsing sessions.",
            }
        )

    if not conn["host_is_local"]:  # type: ignore[index]
        findings.append(
            {
                "level": "BLOCK",
                "topic": "network",
                "message": f"BLENDER_HOST points at {conn['host']!r}, which is not local. "  # type: ignore[index]
                "The addon socket has no authentication or encryption, so anyone who can reach "
                "the port can run Python inside Blender. Use an SSH tunnel instead.",
            }
        )
    else:
        findings.append(
            {"level": "OK", "topic": "network", "message": "Blender host is local."}
        )

    if report["telemetry_opt_out_vars_set"]:
        names = ", ".join(report["telemetry_opt_out_vars_set"])  # type: ignore[arg-type]
        findings.append(
            {
                "level": "OK",
                "topic": "privacy",
                "message": f"Telemetry is disabled in this environment via {names}.",
            }
        )
    else:
        findings.append(
            {
                "level": "WARN",
                "topic": "privacy",
                "message": "No telemetry opt-out variable is set, and the addon consent checkbox "
                "is on by default. Collection can include prompts, generated code, scene "
                "metadata, viewport screenshots, and manual Blender edits. Settle this before "
                "confidential or client work.",
            }
        )

    outdated = [a for a in report["addons"] if a.get("outdated")]  # type: ignore[union-attr]
    if not report["addons"]:
        findings.append(
            {
                "level": "INFO",
                "topic": "addon",
                "message": "No installed addon found in the scanned directories. Run "
                "'uvx blender-mcp install-addon', or set BLENDERMCP_ADDONS_DIR if Blender "
                "lives somewhere unusual.",
            }
        )
    elif outdated:
        findings.append(
            {
                "level": "WARN",
                "topic": "addon",
                "message": f"{len(outdated)} installed addon file(s) are older than protocol "
                f"{EXPECTED_ADDON_PROTOCOL_VERSION}. Run 'uvx blender-mcp install-addon', then "
                "re-enable the addon and start the server again.",
            }
        )
    else:
        findings.append(
            {
                "level": "OK",
                "topic": "addon",
                "message": "An installed addon matches the expected protocol version. Starting it "
                "from the Blender sidebar is still required.",
            }
        )

    return findings


def print_doctor(report: dict[str, object]) -> None:
    print("== MCP for Blender readiness (offline, read-only) ==")
    print(f"  platform        {report['platform']}")
    print(f"  pinned upstream {report['pinned_commit'][:12]} (addon protocol "
          f"{report['expected_addon_protocol_version']})")

    print("-- Host tools --")
    for tool in report["tools"]:  # type: ignore[union-attr]
        if tool["present"]:
            print(f"  ok    {tool['name']:<9} {tool['path']}")
        else:
            print(f"  info  {tool['name']:<9} missing ({tool['note']})")

    print("-- Installed addon --")
    if not report["addons"]:
        print("  info  none found in the scanned Blender addon directories")
    for addon in report["addons"]:  # type: ignore[union-attr]
        state = "WARN " if addon["outdated"] else "ok   "
        if addon["predates_protocol_constant"]:
            shown = "pre-protocol build"
        else:
            shown = f"protocol {addon['protocol_version']}"
        name = addon.get("declared_name") or "unnamed"
        print(f"  {state} {shown}  [{name}]  {addon['path']}")

    conn = report["connection"]  # type: ignore[index]
    print("-- Connection --")
    print(f"  host  {conn['host']}   port {conn['port']} ({conn['port_source']})")
    print(f"  safe mode: {'on' if report['safe_mode_enabled'] else 'off (upstream default)'}")
    print("  note  nothing was connected to; the addon must be started from the Blender sidebar")

    print("-- Provider credentials (names only, values never printed) --")
    for cred in report["credentials"]:  # type: ignore[union-attr]
        print(f"  {cred['state']:<5} {cred['name']}")

    print("== end of report; nothing was installed, started, changed, or billed ==")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Offline readiness and posture checker for MCP for Blender."
    )
    parser.add_argument("command", choices=["doctor", "posture", "upstream"])
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    if args.command == "upstream":
        lines = [
            f"MCP for Blender upstream pin: {PINNED_COMMIT}",
            f"Repository:        {BASE}",
            f"Pinned tree:       {BASE}/tree/{PINNED_COMMIT}",
            f"README:            {BASE}/blob/{PINNED_COMMIT}/README.md",
            f"Server:            {BASE}/blob/{PINNED_COMMIT}/src/blender_mcp/server.py",
            f"Safe mode policy:  {BASE}/blob/{PINNED_COMMIT}/src/blender_mcp/safe_mode.py",
            f"Addon:             {BASE}/blob/{PINNED_COMMIT}/addon.py",
            f"Terms and privacy: {BASE}/blob/{PINNED_COMMIT}/TERMS_AND_CONDITIONS.md",
            "Note: the repository publishes no Git tags or GitHub releases; pin this commit.",
        ]
        if args.json:
            print(json.dumps({"pinned_commit": PINNED_COMMIT, "repository": BASE}, indent=2))
        else:
            print("\n".join(lines))
        return 0

    report = build_report()
    findings = posture_findings(report)
    blocking = any(f["level"] == "BLOCK" for f in findings)

    if args.json:
        payload = dict(report)
        if args.command == "posture":
            payload["findings"] = findings
        payload["ok"] = not blocking
        print(json.dumps(payload, indent=2))
        return 2 if blocking else 0

    if args.command == "doctor":
        print_doctor(report)
        return 2 if blocking else 0

    print("== MCP for Blender posture (offline, read-only) ==")
    print(f"pinned upstream: {PINNED_COMMIT}")
    order = {"BLOCK": 0, "WARN": 1, "INFO": 2, "OK": 3}
    for finding in sorted(findings, key=lambda f: order.get(f["level"], 9)):
        print(f"  {finding['level']:<5} [{finding['topic']}] {finding['message']}")
    print("\nNo socket was opened and nothing was modified.")
    if blocking:
        print("Blocking finding present; resolve it before connecting.")
    return 2 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
