#!/usr/bin/env python3
"""Offline posture audit for an Open Executive environment file.

Reads a .env file and reports provider coverage, billable-feature posture,
outbound-messaging exposure, and access-control gaps.

It performs no network request, starts nothing, and never prints a credential or
personal value. Only an explicit allowlist of non-sensitive posture settings,
such as feature flags, model names, and numeric windows, is echoed. Every other
variable, including keys, tokens, client identifiers, hostnames, and email
addresses, is reported as present or absent only.

Verified against upstream commit 3a48f77a35e6980335553b9bdd02724e00f6f239.
Exit codes: 0 clean or warnings only, 2 blocking findings, 1 usage error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PINNED_COMMIT = "3a48f77a35e6980335553b9bdd02724e00f6f239"

# Allowlist of variables whose values are safe and useful to display. Anything
# absent from this set is masked, so a new upstream credential or personal field
# is hidden by default rather than leaking because a pattern failed to match.
DISPLAYABLE = frozenset(
    {
        "ENABLE_WEB_SEARCH",
        "WEB_SEARCH_MAX_USES",
        "ENABLE_CACHING",
        "OPENROUTER_ENABLED",
        "LOCAL_MODELS_ENABLED",
        "LOCAL_TIMEOUT_S",
        "HONCHO_ENABLED",
        "XCRAWL_ENABLED",
        "CLIENT_ROTATION_ENABLED",
        "OUTBOUND_RESPECT_QUIET_HOURS",
        "OUTBOUND_MAX_PER_RECIPIENT_PER_WINDOW",
        "OUTBOUND_RATE_WINDOW_MINUTES",
        "OUTBOUND_DEDUP_WINDOW_MINUTES",
        "DEFAULT_MODEL",
        "DEEP_REASONING_MODEL",
        "ROUTING_MODEL",
        "EMAIL_POLL_INTERVAL_SECONDS",
    }
)
TRUTHY = {"1", "true", "yes", "on"}
FALSY = {"0", "false", "no", "off"}

PLACEHOLDER_HINTS = (
    "your-key-here",
    "your-token",
    "your-bot-token",
    "example.com",
    "changeme",
    "replace-me",
)

INTEGRATION_KEYS = {
    "SLACK_BOT_TOKEN": "Slack",
    "DISCORD_BOT_TOKEN": "Discord",
    "TELEGRAM_BOT_TOKEN": "Telegram",
    "GOOGLE_CHAT_PROJECT_NUMBER": "Google Chat",
    "GOOGLE_OAUTH_CLIENT_ID": "Gmail and Google Workspace",
}


def strip_value(raw_value: str) -> str:
    """Return the effective value of a dotenv assignment.

    Quoted values keep their contents verbatim. Unquoted values end at the first
    whitespace-preceded ``#``, which is how the upstream sample file annotates
    deliberately blank variables such as ``TELEGRAM_BOT_TOKEN=   # from @BotFather``.
    Treating that comment as a value would falsely report the channel as configured.
    """
    value = raw_value.strip()
    if value[:1] in {'"', "'"}:
        quote = value[0]
        closing = value.find(quote, 1)
        if closing != -1:
            return value[1:closing]
        return value[1:]
    match = re.search(r"(?:^|\s)#", value)
    if match:
        value = value[: match.start()]
    return value.strip()


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key:
            values[key] = strip_value(value)
    return values


def is_set(values: dict[str, str], key: str) -> bool:
    return bool(values.get(key, "").strip())


def as_bool(values: dict[str, str], key: str) -> bool | None:
    raw = values.get(key, "").strip().lower()
    if raw in TRUTHY:
        return True
    if raw in FALSY:
        return False
    return None


class Report:
    def __init__(self) -> None:
        self.findings: list[dict[str, str]] = []

    def add(self, level: str, topic: str, message: str) -> None:
        self.findings.append({"level": level, "topic": topic, "message": message})

    @property
    def blocking(self) -> bool:
        return any(f["level"] == "BLOCK" for f in self.findings)


def looks_placeholder(value: str) -> bool:
    lowered = value.strip().lower()
    return any(hint in lowered for hint in PLACEHOLDER_HINTS)


def audit_placeholders(values: dict[str, str], report: Report) -> None:
    flagged = sorted(
        key
        for key, value in values.items()
        if value.strip() and looks_placeholder(value) and key not in DISPLAYABLE
    )
    if flagged:
        report.add(
            "WARN",
            "placeholder",
            "These variables still hold sample placeholder text rather than real credentials: "
            + ", ".join(flagged)
            + ".",
        )


def audit_providers(values: dict[str, str], report: Report) -> None:
    anthropic = is_set(values, "ANTHROPIC_API_KEY")
    openrouter = as_bool(values, "OPENROUTER_ENABLED") is True
    local = as_bool(values, "LOCAL_MODELS_ENABLED") is True

    if not (anthropic or openrouter or local):
        report.add(
            "BLOCK",
            "provider",
            "No provider configured. The app refuses to start unless Anthropic, "
            "OpenRouter, or local models are set up.",
        )
    if openrouter and not is_set(values, "OPENROUTER_API_KEY"):
        report.add("BLOCK", "provider", "OPENROUTER_ENABLED is on but OPENROUTER_API_KEY is unset.")
    if local and not is_set(values, "LOCAL_BASE_URL"):
        report.add("BLOCK", "provider", "LOCAL_MODELS_ENABLED is on but LOCAL_BASE_URL is unset.")
    if local and not is_set(values, "LOCAL_MODELS"):
        report.add("WARN", "provider", "LOCAL_MODELS_ENABLED is on but LOCAL_MODELS lists no slugs.")
    if local and anthropic:
        report.add(
            "INFO",
            "provider",
            "Both a local backend and an Anthropic key are configured; model settings decide "
            "what actually bills.",
        )


def audit_spend(values: dict[str, str], report: Report) -> None:
    search = as_bool(values, "ENABLE_WEB_SEARCH")
    if search is None:
        report.add(
            "WARN",
            "spend",
            "ENABLE_WEB_SEARCH is unset, so the code default applies. That default is ON and "
            "each search is billed, despite the sample env file describing it as off.",
        )
    elif search:
        report.add(
            "WARN",
            "spend",
            "ENABLE_WEB_SEARCH is on. Cost scales with specialist fan-out; cap it with "
            "WEB_SEARCH_MAX_USES.",
        )
    else:
        report.add("OK", "spend", "ENABLE_WEB_SEARCH is explicitly off.")

    if as_bool(values, "XCRAWL_ENABLED") is True:
        report.add("WARN", "spend", "XCRAWL_ENABLED is on, which adds a paid scrape or SERP dependency.")
    if as_bool(values, "CLIENT_ROTATION_ENABLED") is True:
        report.add(
            "WARN",
            "spend",
            "CLIENT_ROTATION_ENABLED is on; each parked client costs model spend every night.",
        )
    if as_bool(values, "ENABLE_CACHING") is False:
        report.add(
            "WARN",
            "spend",
            "ENABLE_CACHING is off. Upstream reports that losing prompt caching multiplies cost.",
        )


def audit_outbound(values: dict[str, str], report: Report) -> None:
    live = [label for key, label in INTEGRATION_KEYS.items() if is_set(values, key)]
    if live:
        report.add(
            "WARN",
            "outbound",
            "Configured channels can deliver real messages: " + ", ".join(sorted(live)) + ".",
        )
    else:
        report.add("OK", "outbound", "No messaging channel credentials are configured.")

    if as_bool(values, "OUTBOUND_RESPECT_QUIET_HOURS") is False:
        report.add(
            "WARN",
            "outbound",
            "OUTBOUND_RESPECT_QUIET_HOURS is off, so proactive DMs can land outside availability "
            "windows and while a recipient is on leave.",
        )
    if is_set(values, "DISCORD_BOT_TOKEN") and not is_set(values, "DISCORD_APP_ID"):
        report.add("WARN", "outbound", "DISCORD_BOT_TOKEN is set but DISCORD_APP_ID is unset.")
    if is_set(values, "GOOGLE_OAUTH_CLIENT_ID") and not is_set(values, "EXEC_EMAIL_ADDRESS"):
        report.add(
            "WARN",
            "outbound",
            "Google OAuth is configured but EXEC_EMAIL_ADDRESS is unset; outbound mail has no "
            "intended identity.",
        )
    report.add(
        "INFO",
        "outbound",
        "The anti-spam guard dedups, rate-limits, and honors quiet hours, but it fails open and "
        "is not an approval gate.",
    )


def audit_access(values: dict[str, str], report: Report) -> None:
    deployed = is_set(values, "AUTH_URL") or is_set(values, "BACKEND_ALLOWED_ORIGINS")
    if deployed and not is_set(values, "BACKEND_SHARED_SECRET"):
        report.add(
            "WARN",
            "access",
            "A public origin is configured while BACKEND_SHARED_SECRET is unset. That is the "
            "documented local `make dev` setup, but in any deployed environment it leaves the "
            "API ungated behind the UI proxy.",
        )
    if is_set(values, "AUTH_GOOGLE_ID") and not is_set(values, "ALLOWED_EMAILS"):
        report.add(
            "WARN",
            "access",
            "Google sign-in is configured without ALLOWED_EMAILS, so the allow-list is empty.",
        )
    if is_set(values, "AUTH_GOOGLE_ID") and not is_set(values, "AUTH_SECRET"):
        report.add("WARN", "access", "AUTH_GOOGLE_ID is set but AUTH_SECRET is unset.")
    if deployed and not is_set(values, "AUTH_URL"):
        report.add(
            "WARN",
            "access",
            "Behind a proxy, a missing AUTH_URL makes the post-login redirect land on the bind "
            "address instead of the public host.",
        )
    if is_set(values, "BACKEND_SHARED_SECRET"):
        report.add(
            "INFO",
            "access",
            "BACKEND_SHARED_SECRET is set. Unset it in test shells or full-app tests return 401.",
        )


def audit_memory(values: dict[str, str], report: Report) -> None:
    if as_bool(values, "HONCHO_ENABLED") is True:
        if not is_set(values, "HONCHO_BASE_URL"):
            report.add("BLOCK", "memory", "HONCHO_ENABLED is on but HONCHO_BASE_URL is unset.")
        if not is_set(values, "HONCHO_API_KEY"):
            report.add("BLOCK", "memory", "HONCHO_ENABLED is on but HONCHO_API_KEY is unset.")


def summarize_presence(values: dict[str, str]) -> list[dict[str, str]]:
    tracked = [
        "ANTHROPIC_API_KEY",
        "OPENROUTER_ENABLED",
        "OPENROUTER_API_KEY",
        "LOCAL_MODELS_ENABLED",
        "LOCAL_BASE_URL",
        "DEFAULT_MODEL",
        "DEEP_REASONING_MODEL",
        "ROUTING_MODEL",
        "ENABLE_WEB_SEARCH",
        "WEB_SEARCH_MAX_USES",
        "ENABLE_CACHING",
        "BACKEND_SHARED_SECRET",
        "AUTH_GOOGLE_ID",
        "ALLOWED_EMAILS",
        "AUTH_URL",
        "EXEC_EMAIL_ADDRESS",
        "SLACK_BOT_TOKEN",
        "DISCORD_BOT_TOKEN",
        "TELEGRAM_BOT_TOKEN",
        "GOOGLE_CHAT_PROJECT_NUMBER",
        "GOOGLE_OAUTH_CLIENT_ID",
        "HONCHO_ENABLED",
        "XCRAWL_ENABLED",
        "OUTBOUND_RESPECT_QUIET_HOURS",
    ]
    rows = []
    for key in tracked:
        present = is_set(values, key)
        if key in DISPLAYABLE:
            shown = values.get(key, "").strip() or "-"
            if len(shown) > 40:
                shown = shown[:37] + "..."
        else:
            shown = "(hidden)"
        rows.append(
            {
                "name": key,
                "state": "set" if present else ("empty" if key in values else "absent"),
                "value": shown,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Audit an Open Executive .env file offline. Never prints secret values and makes no "
            "network request."
        )
    )
    parser.add_argument("env_file", nargs="?", default=".env", help="path to the .env file")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    path = Path(args.env_file)
    if not path.is_file():
        print(
            f"error: no environment file at {path}\n"
            "       Copy .env.example to .env and edit it. Note that unset variables fall back to "
            "code defaults, and the web-search default is ON and billed.",
            file=sys.stderr,
        )
        return 1

    values = parse_env_file(path)
    report = Report()
    audit_providers(values, report)
    audit_placeholders(values, report)
    audit_spend(values, report)
    audit_outbound(values, report)
    audit_access(values, report)
    audit_memory(values, report)

    presence = summarize_presence(values)

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not report.blocking,
                    "network_requests": 0,
                    "pinned_commit": PINNED_COMMIT,
                    "env_file": str(path),
                    "variables": presence,
                    "findings": report.findings,
                },
                indent=2,
            )
        )
        return 2 if report.blocking else 0

    print("== Open Executive configuration audit (offline; credentials and personal values masked) ==")
    print(f"file: {path}")
    print(f"pinned upstream: {PINNED_COMMIT}")
    print("\n-- Tracked variables --")
    for row in presence:
        print(f"  {row['state']:7} {row['name']:32} {row['value']}")

    print("\n-- Findings --")
    order = {"BLOCK": 0, "WARN": 1, "INFO": 2, "OK": 3}
    for finding in sorted(report.findings, key=lambda f: order.get(f["level"], 9)):
        print(f"  {finding['level']:5} [{finding['topic']}] {finding['message']}")

    print("\nNo provider was contacted and nothing was modified.")
    if report.blocking:
        print("Blocking findings present; resolve them before starting the app.")
    return 2 if report.blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
