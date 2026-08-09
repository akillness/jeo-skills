#!/usr/bin/env python3
"""Static contract check for a WAI Play GameFlowAgentAPI integration file.

Stdlib-only. Reads one or more JavaScript files (or stdin) and reports what
the upstream contract (waiterve/wai-play `integration_templates.py`) expects
but cannot be found, plus template residue that means the bridge was never
wired to real game logic.

This is a TEXT check. A clean result means the file looks contract-shaped.
It is never proof that `observe()` returns live state or that `step()` calls
the same code path a human input calls -- confirm that separately.

Usage:
  check_integration.py --game-type survivor_like path/to/integration.js
  check_integration.py --game-type platformer a.js b.js
  cat integration.js | check_integration.py --game-type puzzle_card -

Output: one ```review fenced JSON block.
Exit code: 1 if any blocker finding is present, else 0.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# Mirrors game_profiles.py GAME_TYPE_PROFILES / GAME_TYPE_ALIASES upstream.
GAME_TYPES = {
    "survivor_like": {
        "label": "survival / roguelike / survivor-like",
        "state": [
            "player.hp",
            "player.level",
            "player.exp",
            "enemy_count",
            "combat.kills",
            "upgrade",
            "boss",
            "status",
        ],
        "scenarios": [
            "early_core_loop",
            "first_upgrade",
            "enemy_pressure",
            "boss_phase",
        ],
    },
    "arcade_shooter": {
        "label": "arcade / action shooter",
        "state": ["player.hp", "enemies", "bullets", "score", "status"],
        "scenarios": ["basic_movement", "basic_shooting", "enemy_avoidance", "score_result"],
    },
    "platformer": {
        "label": "platformer / side-scroller",
        "state": ["player.x", "player.y", "player.on_ground", "goal", "obstacles", "status"],
        "scenarios": ["basic_movement", "jump_test", "hazard_avoidance", "goal_reach"],
    },
    "puzzle_card": {
        "label": "puzzle / card",
        "state": ["board", "hand", "valid_actions", "target", "turn", "status"],
        "scenarios": ["basic_choice", "state_progress", "success_result"],
    },
    "visual_novel": {
        "label": "visual novel / interactive fiction",
        "state": ["scene_text", "choices", "relationship", "chapter", "status"],
        "scenarios": ["story_progress", "story_choice", "success_result"],
    },
}

ALIASES = {
    "survivor": "survivor_like",
    "survivor-like": "survivor_like",
    "roguelike": "survivor_like",
    "arcade": "arcade_shooter",
    "shooter": "arcade_shooter",
    "arcade-shooter": "arcade_shooter",
    "platform": "platformer",
    "puzzle": "puzzle_card",
    "card": "puzzle_card",
    "puzzle-card": "puzzle_card",
    "visual-novel": "visual_novel",
    "interactive-fiction": "visual_novel",
    "vn": "visual_novel",
}

# method -> severity when absent
CORE_METHODS = {
    "getGameInfo": "warning",
    "observe": "blocker",
    "availableActions": "blocker",
    "step": "blocker",
    "evaluate": "warning",
    "listTestScenarios": "warning",
}

OPTIONAL_METHODS = [
    "reset",
    "checkScenarioPreconditions",
    "repairScenario",
    "jumpToScenario",
    "evaluateScenario",
]

PLACEHOLDERS = [
    "请在这里填写",
    "请填写核心玩法",
    "请填写胜利条件",
    "请填写失败条件",
    "Untitled Web Game",
    "请接入真实动作处理逻辑",
    "TODO_REPLACE_ME",
]


def normalize_type(raw: str) -> str:
    key = (raw or "").strip().lower().replace(" ", "_")
    if key in GAME_TYPES:
        return key
    return ALIASES.get(key.replace("_", "-"), ALIASES.get(key, key))


def find_method(source: str, name: str) -> bool:
    """Match `name() {`, `name: function`, `name:(a)=>`, `name = function`."""
    patterns = [
        rf"\b{re.escape(name)}\s*\([^)]*\)\s*\{{",
        rf"\b{re.escape(name)}\s*:\s*(async\s+)?function\b",
        rf"\b{re.escape(name)}\s*:\s*(async\s+)?\([^)]*\)\s*=>",
        rf"\b{re.escape(name)}\s*=\s*(async\s+)?(function\b|\([^)]*\)\s*=>)",
    ]
    return any(re.search(p, source) for p in patterns)


def method_body(source: str, name: str) -> str:
    """Best-effort brace-matched body for `name(...) { ... }`."""
    m = re.search(rf"\b{re.escape(name)}\s*\([^)]*\)\s*\{{", source)
    if not m:
        return ""
    start = m.end() - 1
    depth = 0
    for i in range(start, len(source)):
        ch = source[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : i]
    return source[start + 1 :]


def line_of(source: str, needle: str) -> int:
    idx = source.find(needle)
    return source.count("\n", 0, idx) + 1 if idx >= 0 else 0


def check(source: str, game_type: str, label: str) -> list[dict]:
    findings: list[dict] = []

    def add(severity, check_id, message, remediation, line=0):
        findings.append(
            {
                "id": check_id,
                "severity": severity,
                "file": label,
                "line": line,
                "message": message,
                "remediation": remediation,
            }
        )

    profile = GAME_TYPES[game_type]

    # 1. API is mounted at all.
    if not re.search(r"window\.GameFlowAgentAPI\s*=", source):
        add(
            "blocker",
            "api_mount",
            "No `window.GameFlowAgentAPI = ...` assignment found.",
            "Mount the API on window; WAI Play discovers the game through it. "
            "Without it only black-box testing is possible.",
        )

    uses_bridge = bool(re.search(r"window\.GameFlowIntegration", source))

    # 2. Required methods.
    for name, severity in CORE_METHODS.items():
        if not find_method(source, name):
            add(
                severity,
                f"method_{name}",
                f"Required method `{name}()` not found.",
                f"Implement `{name}()` per references/integration-api.md.",
            )

    missing_optional = [n for n in OPTIONAL_METHODS if not find_method(source, n)]
    if "reset" in missing_optional:
        add(
            "warning",
            "method_reset",
            "`reset()` not found; failure-and-retry key nodes cannot be driven.",
            "Implement `reset()` calling the game's real restart path.",
        )
    scenario_methods = [n for n in missing_optional if n != "reset"]
    if scenario_methods:
        add(
            "info",
            "scenario_methods",
            "Optional key-node methods absent: " + ", ".join(scenario_methods) + ".",
            "Without them the agent can only reach key nodes by natural play; "
            "that is valid, just slower and less reliable.",
        )

    # 3. Unimplemented throw-stubs in methods that must do real work.
    for name in ("observe", "step", "reset"):
        body = method_body(source, name)
        if body and re.search(r"\bthrow\s+new\s+Error\b", body):
            add(
                "blocker" if name != "reset" else "warning",
                f"stub_{name}",
                f"`{name}()` still throws — the v2 template's unimplemented marker.",
                f"Wire `{name}()` to real game state/logic. Leaving the throw is "
                "correct-but-unfinished: the run will abort rather than fake data.",
                line_of(source, f"{name}("),
            )

    # 4. Template residue.
    for token in PLACEHOLDERS:
        if token in source:
            add(
                "warning",
                "placeholder_text",
                f"Template placeholder left in place: {token!r}.",
                "Replace with real game metadata; the planner otherwise models "
                "the template instead of your game.",
                line_of(source, token),
            )
            break

    if re.search(r"console\.warn\(\s*[\"'`]请接入真实动作处理逻辑", source):
        add(
            "blocker",
            "v1_action_stub",
            "v1 template action handler is still a `console.warn` stub.",
            "Connect applyAction/step to real game input handling.",
        )

    # 5. Terminal status block.
    for field in ("done", "success", "failed"):
        if not re.search(rf"\b{field}\s*:", source):
            add(
                "warning",
                f"status_{field}",
                f"No `status.{field}` field found.",
                "Expose `status: { done, success, failed }`; evaluate(), the "
                "ending key node, and the core-flow dimension all depend on it.",
            )

    # 6. Type-specific state coverage (leaf-token heuristic).
    missing_state = []
    for path in profile["state"]:
        leaf = path.split(".")[-1]
        if not re.search(rf"\b{re.escape(leaf)}\b", source):
            missing_state.append(path)
    if missing_state:
        add(
            "warning",
            "required_state_fields",
            f"State fields expected for `{game_type}` not found: "
            + ", ".join(missing_state)
            + ".",
            "Add them to observe(); checkScenarioPreconditions() reports these "
            "as `missing` and blocks the key nodes that judge on them.",
        )

    # 7. Key-node coverage.
    if find_method(source, "listTestScenarios"):
        missing_scen = [s for s in profile["scenarios"] if s not in source]
        if missing_scen:
            add(
                "info",
                "scenario_coverage",
                f"Key nodes for `{game_type}` not referenced: "
                + ", ".join(missing_scen)
                + ".",
                "listTestScenarios() should surface this type's required nodes "
                "so coverage is judged against the profile, not ad hoc.",
            )

    # 8. Dynamic action list.
    body = method_body(source, "availableActions")
    if body and not re.search(r"\b(if|filter|switch|\?)\b", body):
        add(
            "info",
            "static_actions",
            "`availableActions()` looks unconditional.",
            "Return only currently-legal actions (e.g. upgrade choices while an "
            "upgrade modal is open); step() rejects anything not in this list.",
            line_of(source, "availableActions("),
        )

    if uses_bridge and not re.search(r"window\.GameFlowIntegration\s*=", source):
        add(
            "info",
            "bridge_reference_only",
            "File references `GameFlowIntegration` but never defines it.",
            "Confirm the bridge is defined in another file loaded before this one.",
        )

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Static GameFlowAgentAPI contract check for WAI Play."
    )
    ap.add_argument(
        "--game-type",
        required=True,
        help="survivor_like | arcade_shooter | platformer | puzzle_card | visual_novel",
    )
    ap.add_argument("files", nargs="+", help="JavaScript file(s), or - for stdin")
    args = ap.parse_args()

    game_type = normalize_type(args.game_type)
    if game_type not in GAME_TYPES:
        print(
            f"error: unknown game type {args.game_type!r}. "
            f"Supported: {', '.join(GAME_TYPES)}",
            file=sys.stderr,
        )
        return 2

    findings: list[dict] = []
    read: list[str] = []
    for path in args.files:
        try:
            if path == "-":
                source, label = sys.stdin.read(), "<stdin>"
            else:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    source, label = fh.read(), path
        except OSError as exc:
            print(f"error: cannot read {path}: {exc}", file=sys.stderr)
            return 2
        read.append(label)
        findings.extend(check(source, game_type, label))

    counts = {level: 0 for level in ("blocker", "warning", "info")}
    for item in findings:
        counts[item["severity"]] += 1

    report = {
        "tool": "wai-play/check_integration",
        "check": "GameFlowAgentAPI static contract",
        "game_type": game_type,
        "game_type_label": GAME_TYPES[game_type]["label"],
        "files": read,
        "counts": counts,
        "verdict": "blocked" if counts["blocker"] else ("review" if counts["warning"] else "clean"),
        "findings": findings,
        "limits": [
            "Static text analysis only.",
            "Cannot verify observe() returns live state.",
            "Cannot verify step() calls the same path a human input calls.",
            "A clean result is not authorization to trust a score.",
        ],
    }

    print("```review")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("```")
    return 1 if counts["blocker"] else 0


if __name__ == "__main__":
    sys.exit(main())
