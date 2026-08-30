#!/usr/bin/env python3
"""Read-only OpenOcta source, configuration, and release auditor.

The script never starts OpenOcta, writes configuration, extracts bundled archives,
downloads files, or makes network requests. Configuration values are hidden by
default: reports contain posture booleans, counts, integration names, and sensitive
field names only.

Verified against openocta/openocta commit
6b130c72cdc40d8b3bed304d3e6a64345e3d2622 (v1.0.8).

Exit codes:
  0  PASS, WARN, or READY
  1  usage/input error
  2  BLOCKED safety or source-integrity result
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

PACK = "openocta"
PINNED_COMMIT = "6b130c72cdc40d8b3bed304d3e6a64345e3d2622"
EXPECTED_ORIGINS = {
    "https://github.com/openocta/openocta",
    "https://github.com/openocta/openocta.git",
    "git@github.com:openocta/openocta.git",
}
SENSITIVE_KEY = re.compile(
    r"(?i)(api.?key|token|secret|password|credential|private.?key|client.?id|"
    r"app.?id|webhook|authorization|cookie|access.?key)"
)
LICENSE_NAME = re.compile(r"(?i)(^|/)(license|licence|notice|copying)(\.|$)")
TRUTHY = {"1", "true", "yes", "on"}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def read_regular_text(path: Path) -> str:
    if not path.is_file() or path.is_symlink():
        return ""
    return read_text(path)


def has_symlink_component(root: Path, relative: str) -> bool:
    current = root
    for part in Path(relative).parts:
        current /= part
        if current.is_symlink():
            return True
    return False


def git(root: Path, *args: str) -> str:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=5,
        env=env,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def bool_or_none(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def nested(root: Any, *keys: str) -> Any:
    value = root
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def display(report: dict[str, Any], mode: str) -> None:
    if mode == "json":
        print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True))
        return
    for key in sorted(report):
        value = report[key]
        if isinstance(value, dict):
            for child, child_value in sorted(value.items()):
                print(f"{key}.{child}={format_value(child_value)}")
        else:
            print(f"{key}={format_value(value)}")


def safe_scalar(value: Any) -> str:
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", "?", str(value))


def format_value(value: Any) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return ",".join(safe_scalar(item) for item in value) or "none"
    return safe_scalar(value)


def blocked(message: str) -> tuple[dict[str, Any], int]:
    return {"tool": PACK, "status": "BLOCKED", "issues": [message]}, 2


def parse_env_keys(path: Path) -> list[str]:
    if not path.is_file() or path.is_symlink():
        return []
    keys: list[str] = []
    for raw in read_text(path).splitlines():
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", raw)
        if match:
            keys.append(match.group(1))
    return sorted(set(keys))


def audit_source(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    raw_root = Path(args.repo).expanduser()
    if raw_root.is_symlink():
        return blocked("repo_path_is_symlink")
    if not raw_root.is_dir():
        return blocked("repo_not_found")
    root = raw_root.resolve()

    required = [
        "README.md",
        "LICENSE",
        "Makefile",
        "src/go.mod",
        "src/pkg/paths/paths.go",
        "src/cmd/openocta/commands/gateway.go",
        "src/pkg/config/schema.go",
        "src/pkg/agent/eino/cozeloop.go",
        "src/pkg/agent/tools/local_agent_tool.go",
        "docs/security.md",
        "docs/environment-variables.md",
    ]
    missing = [name for name in required if not (root / name).is_file()]
    required_symlinks = [name for name in required if has_symlink_component(root, name)]

    def source_text(name: str) -> str:
        return "" if name in required_symlinks else read_regular_text(root / name)

    origin = git(root, "remote", "get-url", "origin")
    commit = git(root, "rev-parse", "HEAD")
    tags = sorted(filter(None, git(root, "tag", "--points-at", "HEAD").splitlines()))
    issues: list[str] = []
    warnings: list[str] = []

    if missing:
        issues.append("missing_required_files")
    if required_symlinks:
        issues.append("required_file_symlink")
    if origin not in EXPECTED_ORIGINS:
        issues.append("unexpected_origin")
    expected = args.expect_commit or PINNED_COMMIT
    if not re.fullmatch(r"[0-9a-f]{40}", commit or ""):
        issues.append("commit_unavailable")
    elif expected and commit != expected:
        issues.append("commit_mismatch")

    license_text = source_text("LICENSE")
    license_ok = "Apache License" in license_text and "Version 2.0" in license_text
    if not license_ok:
        issues.append("apache_license_marker_missing")

    go_text = source_text("src/go.mod")
    go_match = re.search(r"^go\s+([^\s]+)", go_text, re.MULTILINE)
    go_version = go_match.group(1) if go_match else None

    readme = source_text("README.md")
    readme_match = re.search(r"Latest\s+\[?(v\d+\.\d+\.\d+)", readme)
    readme_latest = readme_match.group(1) if readme_match else None
    head_version_tags = [tag for tag in tags if re.fullmatch(r"v\d+\.\d+\.\d+", tag)]
    if readme_latest and head_version_tags and readme_latest not in head_version_tags:
        warnings.append("readme_release_version_drift")

    paths_text = source_text("src/pkg/paths/paths.go")
    port_match = re.search(r"defaultGatewayPort\s*=\s*(\d+)", paths_text)
    source_port = int(port_match.group(1)) if port_match else None
    gateway_text = source_text("src/cmd/openocta/commands/gateway.go")
    help_match = re.search(r"Gateway port \(default (\d+)\)", gateway_text)
    help_port = int(help_match.group(1)) if help_match else None
    if source_port and help_port and source_port != help_port:
        warnings.append("gateway_help_port_drift")

    schema_text = source_text("src/pkg/config/schema.go")
    cozeloop_text = source_text("src/pkg/agent/eino/cozeloop.go")
    local_agent_text = source_text("src/pkg/agent/tools/local_agent_tool.go")
    cozeloop_bundled_defaults = bool(
        re.search(r'DefaultCozeLoopAPIToken\s*=\s*"[^"]+"', schema_text)
        and "enabled = true" in cozeloop_text
        and "DefaultCozeLoopAPIToken" in cozeloop_text
    )
    local_agents_default_enabled = bool(
        "func (c *LocalAgentsConfig) IsEnabled()" in schema_text
        and "if c == nil || c.Enabled == nil" in schema_text
        and "return true" in schema_text
        and "AppendLocalAgentTool" in local_agent_text
    )
    local_agents_require_approval_referenced = "RequireApproval" in local_agent_text
    if cozeloop_bundled_defaults:
        warnings.append("cozeloop_trace_export_defaults_enabled_with_bundled_credentials")
    if local_agents_default_enabled:
        warnings.append("local_cli_agent_delegation_defaults_enabled")
    if "RequireApproval" in schema_text and not local_agents_require_approval_referenced:
        warnings.append("local_agents_require_approval_field_not_enforced_in_tool")

    dangling_known = [
        name
        for name in ("docs/compare-openclaw-hermes.md", "CONTRIBUTING.md", "SECURITY.md")
        if not (root / name).is_file()
    ]
    if "compare-openclaw-hermes.md" in readme and "docs/compare-openclaw-hermes.md" in dangling_known:
        warnings.append("readme_compare_link_dangling")
    if "CONTRIBUTING.md" in readme and "CONTRIBUTING.md" in dangling_known:
        warnings.append("readme_contributing_link_dangling")
    if "SECURITY.md" in dangling_known:
        warnings.append("security_disclosure_file_absent")

    archive_names: list[str] = []
    archives_without_license_file: list[str] = []
    archive_root = root / "deploy/inner_skills"
    if not issues and archive_root.is_dir() and not has_symlink_component(root, "deploy/inner_skills"):
        for archive in sorted(archive_root.glob("*.zip")):
            if archive.is_symlink():
                warnings.append("bundled_archive_symlink_skipped")
                continue
            archive_names.append(archive.name)
            try:
                with zipfile.ZipFile(archive) as handle:
                    members = handle.namelist()
                if not any(LICENSE_NAME.search(name) for name in members):
                    archives_without_license_file.append(archive.name)
            except (OSError, zipfile.BadZipFile):
                warnings.append("bundled_archive_unreadable")
    if archives_without_license_file:
        warnings.append("bundled_archives_without_license_file")

    env_keys: list[str] = []
    if not issues:
        for env_name in ("src/.env", "src/embed/.env", "ui/.env"):
            if has_symlink_component(root, env_name):
                warnings.append("tracked_env_symlink_skipped")
                continue
            env_keys.extend(parse_env_keys(root / env_name))
        env_keys = sorted(set(env_keys))
    go_tests = (
        len(list((root / "src").rglob("*_test.go")))
        if not issues and (root / "src").is_dir()
        else 0
    )
    ui_tests = 0
    if not issues and (root / "ui").is_dir() and not has_symlink_component(root, "ui"):
        ui_tests = sum(
            1
            for path in (root / "ui").rglob("*")
            if path.is_file()
            and ("test" in path.name.lower() or ".spec." in path.name.lower())
        )

    status = "BLOCKED" if issues else ("WARN" if warnings else "PASS")
    report: dict[str, Any] = {
        "tool": PACK,
        "mode": "source",
        "status": status,
        "deep_inspection_performed": not issues,
        "origin": origin or None,
        "commit": commit or None,
        "head_tags": head_version_tags,
        "license": "Apache-2.0" if license_ok else "unverified",
        "go_version": go_version,
        "readme_latest": readme_latest,
        "source_default_gateway_port": source_port,
        "cli_help_gateway_port": help_port,
        "go_test_files": go_tests,
        "ui_test_like_files": ui_tests,
        "cozeloop_trace_export_uses_bundled_defaults": cozeloop_bundled_defaults,
        "local_cli_agents_default_enabled": local_agents_default_enabled,
        "local_agents_require_approval_referenced_by_tool": local_agents_require_approval_referenced,
        "tracked_env_key_names": env_keys,
        "bundled_archives": archive_names,
        "bundled_archives_without_license_file": archives_without_license_file,
        "missing_required_files": missing,
        "required_file_symlinks": required_symlinks,
        "known_absent_files": dangling_known,
        "warnings": sorted(set(warnings)),
        "issues": sorted(set(issues)),
    }
    return report, 2 if issues else 0


def sensitive_fields(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            label = f"{prefix}.{key}" if prefix else str(key)
            if SENSITIVE_KEY.search(str(key)):
                found.append(label)
            if isinstance(child, (dict, list)):
                found.extend(sensitive_fields(child, label))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            if isinstance(child, (dict, list)):
                found.extend(sensitive_fields(child, f"{prefix}[{index}]"))
    return sorted(set(found))


def channel_posture(config: dict[str, Any]) -> tuple[list[str], list[str]]:
    channels = config.get("channels")
    if not isinstance(channels, dict):
        return [], []
    configured: list[str] = []
    explicitly_enabled: list[str] = []
    for name, value in channels.items():
        if str(name).lower() == "defaults":
            continue
        if isinstance(value, dict) and value:
            configured.append(str(name))
            if value.get("enabled") is True:
                explicitly_enabled.append(str(name))
    return sorted(configured), sorted(explicitly_enabled)


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return isinstance(value, str) and value.strip().lower() in TRUTHY


def audit_config(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    raw_path = Path(args.config).expanduser()
    if raw_path.is_symlink():
        return blocked("config_path_is_symlink")
    if not raw_path.is_file():
        return blocked("config_not_found")
    try:
        payload = json.loads(read_text(raw_path))
    except (OSError, json.JSONDecodeError):
        return blocked("config_invalid_json")
    if not isinstance(payload, dict):
        return blocked("config_root_not_object")

    security = payload.get("security") if isinstance(payload.get("security"), dict) else {}
    sandbox = security.get("sandbox") if isinstance(security.get("sandbox"), dict) else {}
    approval = security.get("approvalQueue") if isinstance(security.get("approvalQueue"), dict) else {}
    command_policy = security.get("commandPolicy") if isinstance(security.get("commandPolicy"), dict) else {}
    validator = security.get("validator") if isinstance(security.get("validator"), dict) else {}
    env_vars = nested(payload, "env", "vars")
    env_vars = env_vars if isinstance(env_vars, dict) else {}

    auth = nested(payload, "gateway", "auth")
    auth = auth if isinstance(auth, dict) else {}
    auth_mode = auth.get("mode") if auth.get("mode") in {"token", "password"} else None
    config_token = auth.get("token")
    config_password = auth.get("password")
    env_token = env_vars.get("OPENOCTA_GATEWAY_TOKEN")
    env_password = env_vars.get("OPENOCTA_GATEWAY_PASSWORD")
    auth_present = any(bool(value) for value in (config_token, config_password, env_token, env_password))
    raw_bind = nested(payload, "gateway", "bind")
    gateway_bind = raw_bind if raw_bind in {"loopback", "lan", "auto", "custom", "tailnet"} else None
    network_bind = gateway_bind in {"lan", "auto", "custom", "tailnet"}
    control_ui = nested(payload, "gateway", "controlUi")
    control_ui = control_ui if isinstance(control_ui, dict) else {}
    insecure_control_ui = control_ui.get("allowInsecureAuth") is True
    device_auth_disabled = control_ui.get("dangerouslyDisableDeviceAuth") is True

    uninstall_enabled = truthy(env_vars.get("OPENOCTA_ALLOW_UNINSTALL"))
    configured_channels, explicitly_enabled_channels = channel_posture(payload)
    mcp_servers = nested(payload, "mcp", "servers")
    if isinstance(mcp_servers, dict):
        mcp_count = len(mcp_servers)
    elif isinstance(mcp_servers, list):
        mcp_count = len(mcp_servers)
    else:
        mcp_count = 0
    providers = nested(payload, "models", "providers")
    provider_count = len(providers) if isinstance(providers, (dict, list)) else 0

    sandbox_enabled = bool_or_none(sandbox.get("enabled"))
    approval_enabled = bool_or_none(approval.get("enabled"))
    validator_enabled = bool_or_none(validator.get("enabled"))
    policy_enabled = bool_or_none(command_policy.get("enabled"))
    default_policy = command_policy.get("defaultPolicy")
    if default_policy not in {"allow", "ask", "deny"}:
        default_policy = None

    local_agents = payload.get("localAgents") if isinstance(payload.get("localAgents"), dict) else None
    local_agents_enabled = True if local_agents is None else local_agents.get("enabled") is not False
    local_agents_allow_count = (
        len(local_agents.get("allowed", []))
        if isinstance(local_agents, dict) and isinstance(local_agents.get("allowed"), list)
        else 0
    )
    local_agents_require_approval = (
        bool_or_none(local_agents.get("requireApproval")) if isinstance(local_agents, dict) else None
    )

    cozeloop = payload.get("cozeloop") if isinstance(payload.get("cozeloop"), dict) else None
    cozeloop_config_explicit = cozeloop is not None
    if cozeloop is None:
        cozeloop_config_enabled = None
    elif isinstance(cozeloop.get("enable"), bool):
        cozeloop_config_enabled = cozeloop["enable"]
    else:
        cozeloop_config_enabled = bool_or_none(cozeloop.get("enabled")) or False
    cozeloop_bundled_defaults = cozeloop is None
    cozeloop_config_token = cozeloop.get("apiToken") if isinstance(cozeloop, dict) else None
    cozeloop_config_workspace = cozeloop.get("workspaceId") if isinstance(cozeloop, dict) else None
    process_cozeloop_keys = sorted(
        key
        for key in ("COZELOOP_API_TOKEN", "COZELOOP_WORKSPACE_ID")
        if bool(os.environ.get(key))
    )
    cozeloop_token_present = bool(
        cozeloop_config_token
        or env_vars.get("COZELOOP_API_TOKEN")
        or os.environ.get("COZELOOP_API_TOKEN")
    )
    cozeloop_workspace_present = bool(
        cozeloop_config_workspace
        or env_vars.get("COZELOOP_WORKSPACE_ID")
        or os.environ.get("COZELOOP_WORKSPACE_ID")
    )
    cozeloop_credentials_present = cozeloop_token_present and cozeloop_workspace_present
    cozeloop_explicit_credentials = bool(cozeloop_config_token and cozeloop_config_workspace)
    cozeloop_effective_export_known = (
        True if cozeloop_bundled_defaults else cozeloop_credentials_present
    )
    cozeloop_shell_env_enabled = nested(payload, "env", "shellEnv", "enabled") is True

    hooks_enabled = nested(payload, "hooks", "enabled") is True
    hooks_token = nested(payload, "hooks", "token")
    cron_enabled = nested(payload, "cron", "enabled") is True

    issues: list[str] = []
    warnings: list[str] = []
    if args.run_mode == "service" and not auth_present:
        issues.append("service_mode_without_gateway_auth")
    if network_bind and not auth_present:
        issues.append("network_bind_without_gateway_auth")
    if args.run_mode == "service" and uninstall_enabled:
        issues.append("service_mode_remote_uninstall_enabled")
    if (args.run_mode == "service" or network_bind) and insecure_control_ui:
        issues.append("network_control_ui_allows_insecure_auth")
    if (args.run_mode == "service" or network_bind) and device_auth_disabled:
        issues.append("network_control_ui_device_auth_disabled")
    if hooks_enabled and not hooks_token:
        issues.append("hooks_enabled_without_token")
    if cozeloop_bundled_defaults:
        issues.append("cozeloop_trace_export_uses_bundled_defaults")
    elif cozeloop_config_enabled is False and cozeloop_effective_export_known:
        issues.append("cozeloop_disabled_but_credentials_reenable_export")

    if sandbox_enabled is False:
        warnings.append("sandbox_explicitly_disabled")
    elif sandbox_enabled is None:
        warnings.append("sandbox_not_explicitly_configured")
    if approval_enabled is not True:
        warnings.append("approval_queue_not_enabled")
    if not command_policy:
        warnings.append("command_policy_not_explicitly_configured")
    if default_policy == "allow":
        warnings.append("command_policy_defaults_to_allow")
    if policy_enabled is False or validator_enabled is False:
        warnings.append("command_validation_explicitly_disabled")
    if configured_channels:
        warnings.append("configured_channels_require_allowlist_review")
    if mcp_count:
        warnings.append("mcp_servers_require_tool_review")
    if cron_enabled:
        warnings.append("scheduled_runs_enabled")
    if local_agents_enabled:
        warnings.append("local_cli_agent_delegation_enabled")
        if local_agents_allow_count == 0:
            warnings.append("local_cli_agents_have_no_allowlist")
        warnings.append("local_agents_require_approval_field_not_enforced_at_audited_pin")
    if cozeloop_config_enabled is True and cozeloop_effective_export_known:
        warnings.append("cozeloop_trace_export_explicitly_enabled")
    elif cozeloop_config_enabled is True:
        warnings.append("cozeloop_enabled_but_credentials_not_resolved")
    elif cozeloop_config_explicit and cozeloop_shell_env_enabled:
        warnings.append("cozeloop_shell_environment_can_reenable_export")
    if insecure_control_ui and "network_control_ui_allows_insecure_auth" not in issues:
        warnings.append("control_ui_allows_insecure_auth")
    if device_auth_disabled and "network_control_ui_device_auth_disabled" not in issues:
        warnings.append("control_ui_device_auth_disabled")

    status = "BLOCKED" if issues else ("WARN" if warnings else "PASS")
    report: dict[str, Any] = {
        "tool": PACK,
        "mode": "config",
        "status": status,
        "run_mode": args.run_mode,
        "top_level_keys": sorted(str(key) for key in payload.keys()),
        "gateway_bind": gateway_bind,
        "gateway_auth_mode": auth_mode,
        "gateway_auth_present": auth_present,
        "control_ui_allow_insecure_auth": insecure_control_ui,
        "control_ui_device_auth_disabled": device_auth_disabled,
        "hooks_enabled": hooks_enabled,
        "hooks_token_present": bool(hooks_token),
        "cron_enabled": cron_enabled,
        "cozeloop_config_explicit": cozeloop_config_explicit,
        "cozeloop_config_enabled_flag": cozeloop_config_enabled,
        "cozeloop_effective_export_known": cozeloop_effective_export_known,
        "cozeloop_uses_bundled_defaults": cozeloop_bundled_defaults,
        "cozeloop_explicit_credentials_present": cozeloop_explicit_credentials,
        "cozeloop_known_credentials_present": cozeloop_credentials_present,
        "cozeloop_shell_env_enabled": cozeloop_shell_env_enabled,
        "process_environment_key_names_present": process_cozeloop_keys,
        "local_cli_agents_enabled": local_agents_enabled,
        "local_cli_agents_allow_count": local_agents_allow_count,
        "local_cli_agents_require_approval": local_agents_require_approval,
        "sandbox_enabled": sandbox_enabled,
        "allowed_paths_count": len(sandbox.get("allowedPaths", []))
        if isinstance(sandbox.get("allowedPaths"), list)
        else 0,
        "network_allow_count": len(sandbox.get("networkAllow", []))
        if isinstance(sandbox.get("networkAllow"), list)
        else 0,
        "command_policy_enabled": policy_enabled,
        "command_policy_default": default_policy,
        "validator_enabled": validator_enabled,
        "approval_queue_enabled": approval_enabled,
        "configured_channel_names": configured_channels,
        "explicitly_enabled_channel_names": explicitly_enabled_channels,
        "model_provider_count": provider_count,
        "mcp_server_count": mcp_count,
        "sensitive_field_names": sensitive_fields(payload),
        "env_var_key_names": sorted(str(key) for key in env_vars.keys()),
        "warnings": sorted(set(warnings)),
        "issues": sorted(set(issues)),
    }
    return report, 2 if issues else 0


def default_package(os_name: str) -> str:
    return {"darwin": "dmg", "windows": "exe", "linux": "tar.gz"}[os_name]


def asset_matches(name: str, os_name: str, arch: str, package: str) -> bool:
    lower = name.lower()
    if os_name == "darwin":
        return f"darwin-{arch}" in lower and lower.endswith(f".{package}")
    if os_name == "windows":
        return arch in lower and lower.endswith(".exe") and "installer" in lower
    return f"linux_{arch}" in lower and lower.endswith(f".{package}")


def audit_release(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    raw_path = Path(args.metadata).expanduser()
    if raw_path.is_symlink():
        return blocked("metadata_path_is_symlink")
    if not raw_path.is_file():
        return blocked("metadata_not_found")
    try:
        payload = json.loads(read_text(raw_path))
    except (OSError, json.JSONDecodeError):
        return blocked("metadata_invalid_json")
    if not isinstance(payload, dict):
        return blocked("metadata_root_not_object")
    assets = payload.get("assets")
    if not isinstance(assets, list):
        return blocked("metadata_assets_missing")

    package = args.package or default_package(args.os)
    candidates = [
        asset
        for asset in assets
        if isinstance(asset, dict)
        and isinstance(asset.get("name"), str)
        and asset_matches(asset["name"], args.os, args.arch, package)
    ]
    checksum_candidates = [
        asset
        for asset in assets
        if isinstance(asset, dict)
        and isinstance(asset.get("name"), str)
        and "checksum" in asset["name"].lower()
    ]
    issues: list[str] = []
    tag = payload.get("tag_name")
    release_url = payload.get("html_url")
    if not isinstance(tag, str) or not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        issues.append("release_tag_invalid")
    if not isinstance(release_url, str) or release_url != f"https://github.com/openocta/openocta/releases/tag/{tag}":
        issues.append("release_provenance_mismatch")
    if payload.get("draft") is True or payload.get("prerelease") is True:
        issues.append("release_not_stable")
    if len(candidates) != 1:
        issues.append("release_asset_not_unique")
    if len(checksum_candidates) != 1:
        issues.append("checksum_asset_not_unique")

    selected = candidates[0] if len(candidates) == 1 else None
    checksum = checksum_candidates[0] if len(checksum_candidates) == 1 else None
    expected_download_prefix = f"https://github.com/openocta/openocta/releases/download/{tag}/"
    for asset in (selected, checksum):
        if asset is not None and not str(asset.get("browser_download_url", "")).startswith(expected_download_prefix):
            issues.append("release_asset_url_provenance_mismatch")
    report: dict[str, Any] = {
        "tool": PACK,
        "mode": "release",
        "status": "BLOCKED" if issues else "READY",
        "tag": tag,
        "published_at": payload.get("published_at"),
        "target_commitish": payload.get("target_commitish"),
        "os": args.os,
        "arch": args.arch,
        "package": package,
        "selected_asset": {
            "name": selected.get("name"),
            "size": selected.get("size"),
            "url": selected.get("browser_download_url"),
        }
        if selected
        else None,
        "checksum_asset": {
            "name": checksum.get("name"),
            "size": checksum.get("size"),
            "url": checksum.get("browser_download_url"),
        }
        if checksum
        else None,
        "asset_count": len(assets),
        "issues": issues,
    }
    return report, 2 if issues else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only OpenOcta auditor")
    sub = parser.add_subparsers(dest="command", required=True)

    source = sub.add_parser("source", help="audit a source checkout")
    source.add_argument("--repo", required=True)
    source.add_argument("--expect-commit")
    source.add_argument("--format", choices=("text", "json"), default="text")

    config = sub.add_parser("config", help="audit config posture without values")
    config.add_argument("--config", required=True)
    config.add_argument("--run-mode", choices=("desktop", "service"), default="desktop")
    config.add_argument("--format", choices=("text", "json"), default="text")

    release = sub.add_parser("release", help="select an asset from saved release JSON")
    release.add_argument("--metadata", required=True)
    release.add_argument("--os", choices=("darwin", "windows", "linux"), required=True)
    release.add_argument("--arch", choices=("amd64", "arm64"), required=True)
    release.add_argument("--package", choices=("dmg", "exe", "deb", "rpm", "tar.gz"))
    release.add_argument("--format", choices=("text", "json"), default="text")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "source":
            report, code = audit_source(args)
        elif args.command == "config":
            report, code = audit_config(args)
        else:
            report, code = audit_release(args)
        display(report, args.format)
        return code
    except (OSError, subprocess.TimeoutExpired, zipfile.LargeZipFile) as exc:
        print(f"audit-openocta: {type(exc).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
