#!/usr/bin/env python3
"""Turn `impeccable detect --json` output into a ranked, command-routed triage plan.

Reads a findings array from a file or stdin ("-"), groups it by rule, ranks the
groups (error tier, then quality warnings, then slop warnings, then advisories),
and suggests the Impeccable command that owns each fix. The rule-to-command
routes are this catalog operator's heuristic, not upstream detector output; every
finding still needs verification in context. Snippets are never echoed. Offline,
read-only: exit 0 on success, 1 for unreadable or malformed input, 2 for argument
errors.
"""
import argparse
import json
import math
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "references" / "source.json"
SAMPLE_LOCATIONS = 5
BANDS = ("blocking", "quality", "slop", "advisory")

# Operator heuristic: the command whose playbook owns the fix for each built-in rule.
ROUTES = {
    "side-tab": "quieter",
    "border-accent-on-rounded": "quieter",
    "overused-font": "typeset",
    "flat-type-hierarchy": "typeset",
    "gradient-text": "typeset",
    "ai-color-palette": "colorize",
    "cream-palette": "colorize",
    "nested-cards": "layout",
    "monotonous-spacing": "layout",
    "bounce-easing": "animate",
    "pulsing-dot": "animate",
    "blinking-cursor": "animate",
    "shape-assembled-illustration": "polish",
    "organic-clip-path": "polish",
    "buried-raster": "polish",
    "hard-offset-shadow": "quieter",
    "dark-glow": "quieter",
    "radial-halo": "quieter",
    "radial-spotlight-glow": "quieter",
    "marquee": "quieter",
    "icon-tile-stack": "layout",
    "italic-serif-display": "typeset",
    "hero-eyebrow-chip": "typeset",
    "kicker-above-heading": "typeset",
    "numbered-section-labels": "layout",
    "em-dash-overuse": "clarify",
    "marketing-buzzword": "clarify",
    "aphoristic-cadence": "clarify",
    "oversized-h1": "typeset",
    "extreme-negative-tracking": "typeset",
    "broken-image": "harden",
    "script-error": "harden",
    "content-hidden-at-rest": "harden",
    "edge-flush-cards": "layout",
    "text-occlusion": "layout",
    "first-viewport-column-overflow": "layout",
    "gray-on-color": "colorize",
    "low-contrast": "polish",
    "line-length": "typeset",
    "cramped-padding": "layout",
    "body-text-viewport-edge": "layout",
    "tight-leading": "typeset",
    "skipped-heading": "polish",
    "heading-rhythm": "layout",
    "justified-text": "typeset",
    "straggler": "typeset",
    "unbalanced-heading": "typeset",
    "tiny-text": "typeset",
    "undersized-ui-text": "typeset",
    "all-caps-body": "typeset",
    "wide-tracking": "typeset",
    "text-overflow": "harden",
    "repeated-container-text": "clarify",
    "clipped-overflow-container": "layout",
    "design-system-font": "extract",
    "design-system-color": "extract",
    "design-system-radius": "extract",
    "design-system-font-size": "extract",
    "gpt-thin-border-wide-shadow": "quieter",
    "repeating-stripes-gradient": "quieter",
    "codex-grid-background": "quieter",
    "theater-slop-phrase": "clarify",
}


class InputError(ValueError):
    pass


def load_findings(path):
    try:
        text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise InputError(f"cannot read {path}: {exc}") from exc
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise InputError(f"input is not JSON: {exc}") from exc
    if not isinstance(data, list):
        raise InputError("input must be the JSON array printed by `impeccable detect --json`")
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            raise InputError(f"finding {index} is not an object")
        for key in ("antipattern", "file"):
            if not isinstance(item.get(key), str) or not item[key]:
                raise InputError(f"finding {index} has no string {key!r}")
        for key in ("severity", "category", "name"):
            if key in item and item[key] is not None and not isinstance(item[key], str):
                raise InputError(f"finding {index} has a non-string {key!r}")
        line = item.get("line", 0)
        if isinstance(line, bool) or not isinstance(line, (int, float)) or not math.isfinite(line):
            raise InputError(f"finding {index} has a non-numeric 'line'")
    return data


def band_of(finding, rule):
    tier = finding.get("severity") or (rule or {}).get("tier") or "warning"
    if finding.get("advisory") is True or tier == "advisory":
        return "advisory"
    if tier == "error":
        return "blocking"
    category = finding.get("category") or (rule or {}).get("category")
    return "slop" if category == "slop" else "quality"


def location(finding):
    line = finding.get("line", 0)
    return f"{finding['file']}:{int(line)}" if line else finding["file"]


def triage(findings, source):
    rules = {rule["id"]: rule for rule in source["detector"]["rules"]}
    groups = {}
    for finding in findings:
        rule_id = finding["antipattern"]
        rule = rules.get(rule_id)
        band = band_of(finding, rule)
        group = groups.setdefault((band, rule_id), {
            "rule": rule_id,
            "name": finding.get("name") or (rule or {}).get("name") or rule_id,
            "band": band,
            "category": finding.get("category") or (rule or {}).get("category"),
            "known_rule": rule is not None,
            "suggested_command": ROUTES.get(rule_id),
            "count": 0,
            "files": set(),
            "locations": [],
        })
        group["count"] += 1
        group["files"].add(finding["file"])
        if len(group["locations"]) < SAMPLE_LOCATIONS:
            group["locations"].append(location(finding))
    ordered = sorted(groups.values(), key=lambda g: (BANDS.index(g["band"]), -g["count"], g["rule"]))
    for group in ordered:
        group["files"] = sorted(group["files"])
    primary = sum(g["count"] for g in ordered if g["band"] != "advisory")
    commands = {}
    for group in ordered:
        if group["band"] != "advisory" and group["suggested_command"]:
            commands.setdefault(group["suggested_command"], {"command": group["suggested_command"],
                                                             "findings": 0, "rules": []})
            commands[group["suggested_command"]]["findings"] += group["count"]
            commands[group["suggested_command"]]["rules"].append(group["rule"])
    return {
        "source": {"repository": source["repository"], "commit": source["commit"],
                   "rule_count": source["detector"]["rule_count"]},
        "total_findings": len(findings),
        "primary_findings": primary,
        "advisory_findings": len(findings) - primary,
        "detector_exit_expected": 2 if primary else 0,
        "by_band": {band: sum(g["count"] for g in ordered if g["band"] == band) for band in BANDS},
        "groups": ordered,
        "next_commands": list(commands.values()),
        "unknown_rules": sorted({g["rule"] for g in ordered if not g["known_rule"]}),
        "routes_are_heuristic": True,
        "snippets_included": False,
    }


def cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def markdown(plan):
    lines = [
        f"# Impeccable detector triage ({plan['source']['repository']}@{plan['source']['commit'][:7]})",
        "",
        f"{plan['total_findings']} findings: {plan['primary_findings']} primary, "
        f"{plan['advisory_findings']} advisory. Detector exit for this set: {plan['detector_exit_expected']}.",
        "",
    ]
    if plan["groups"]:
        lines += ["| Band | Rule | Count | Files | Suggested command | Sample locations |",
                  "|---|---|---|---|---|---|"]
        for group in plan["groups"]:
            command = f"`{group['suggested_command']}`" if group["suggested_command"] else "unmapped"
            lines.append("| " + " | ".join(cell(v) for v in (
                group["band"], f"`{group['rule']}` {group['name']}", group["count"], len(group["files"]),
                command, ", ".join(group["locations"]))) + " |")
        lines.append("")
    if plan["next_commands"]:
        lines.append("Next commands, in triage order:")
        lines += [f"{n}. `{c['command']}` for {c['findings']} findings ({', '.join(c['rules'])})"
                  for n, c in enumerate(plan["next_commands"], 1)]
        lines.append("")
    if plan["unknown_rules"]:
        lines += ["Rules outside the pinned registry (rule pack or newer engine): "
                  + ", ".join(f"`{r}`" for r in plan["unknown_rules"]), ""]
    lines.append("Suggested commands are this operator's routing heuristic, not detector output. "
                 "Advisories never change the exit code. Verify every finding in context before fixing.")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("input", help="findings JSON file, or - for stdin")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    try:
        source = json.loads(SOURCE.read_text(encoding="utf-8"))
        plan = triage(load_findings(args.input), source)
    except InputError as exc:
        print(f"triage_findings: {exc}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"triage_findings: cannot load {SOURCE}: {exc}", file=sys.stderr)
        return 1
    sys.stdout.write(markdown(plan) if args.format == "markdown" else json.dumps(plan, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
