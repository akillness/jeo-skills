#!/usr/bin/env python3
"""Validate game-ui-contract.json without modifying it.

Python 3.9+, standard library only. Exit 0 for valid, 1 for invalid, and 2 for
file or command errors.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Set, Tuple

PLACEHOLDER = re.compile(r"(?:\bTBD\b|\bTODO\b|\bFIXME\b|\bCHANGEME\b|\bUNKNOWN\b|<[^>]+>)", re.I)
Error = Dict[str, str]


def add(errors: List[Error], path: str, message: str) -> None:
    errors.append({"path": path, "message": message})


def obj(value: Any, path: str, errors: List[Error]) -> Dict[str, Any]:
    if not isinstance(value, dict):
        add(errors, path, "must be an object")
        return {}
    return value


def text(value: Any, path: str, errors: List[Error], minimum: int = 8) -> str:
    if not isinstance(value, str) or len(value.strip()) < minimum:
        add(errors, path, "must be a descriptive string")
        return ""
    return value.strip()


def seq(value: Any, path: str, errors: List[Error], minimum: int = 1) -> List[Any]:
    if not isinstance(value, list):
        add(errors, path, "must be an array")
        return []
    if len(value) < minimum:
        add(errors, path, "must contain at least %d item(s)" % minimum)
    return value


def require(value: Dict[str, Any], fields: Sequence[str], path: str, errors: List[Error]) -> None:
    for field in fields:
        if field not in value:
            add(errors, path + "." + field, "is required")


def text_list(value: Any, path: str, errors: List[Error], minimum: int = 1) -> List[Any]:
    items = seq(value, path, errors, minimum)
    for index, item in enumerate(items):
        text(item, "%s[%d]" % (path, index), errors, 2)
    return items


def placeholders(value: Any, path: str, errors: List[Error]) -> None:
    if isinstance(value, str) and PLACEHOLDER.search(value):
        add(errors, path, "contains an unresolved placeholder")
    elif isinstance(value, dict):
        for key, child in value.items():
            placeholders(child, path + "." + str(key), errors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            placeholders(child, "%s[%d]" % (path, index), errors)


def validate(data: Any) -> List[Error]:
    errors: List[Error] = []
    root = obj(data, "$", errors)
    root_fields = (
        "contract_version", "project", "player_decisions", "screens",
        "information_hierarchy", "navigation", "layout", "localization",
        "accessibility", "data_bindings", "verification", "decisions", "route_out",
    )
    require(root, root_fields, "$", errors)
    if root.get("contract_version") != 1:
        add(errors, "$.contract_version", "must equal 1")

    project = obj(root.get("project"), "$.project", errors)
    require(project, ("name", "build", "target_devices", "input_methods", "locales"), "$.project", errors)
    text(project.get("name"), "$.project.name", errors)
    text(project.get("build"), "$.project.build", errors)
    text_list(project.get("target_devices"), "$.project.target_devices", errors)
    text_list(project.get("input_methods"), "$.project.input_methods", errors)
    text_list(project.get("locales"), "$.project.locales", errors)

    decisions = seq(root.get("player_decisions"), "$.player_decisions", errors)
    for index, item in enumerate(decisions):
        path = "$.player_decisions[%d]" % index
        row = obj(item, path, errors)
        require(row, ("decision", "required_information", "urgency"), path, errors)
        text(row.get("decision"), path + ".decision", errors)
        text(row.get("required_information"), path + ".required_information", errors)
        text(row.get("urgency"), path + ".urgency", errors, 3)

    screens = seq(root.get("screens"), "$.screens", errors)
    screen_ids: Set[str] = set()
    for index, item in enumerate(screens):
        path = "$.screens[%d]" % index
        row = obj(item, path, errors)
        fields = ("id", "type", "decision", "states", "entry", "exit", "back_behavior", "initial_focus")
        require(row, fields, path, errors)
        screen_id = text(row.get("id"), path + ".id", errors, 2)
        if screen_id:
            if screen_id in screen_ids:
                add(errors, path + ".id", "must be unique")
            screen_ids.add(screen_id)
        text(row.get("type"), path + ".type", errors, 3)
        for field in ("decision", "entry", "exit", "back_behavior", "initial_focus"):
            text(row.get(field), path + "." + field, errors)
        text_list(row.get("states"), path + ".states", errors)

    hierarchy = obj(root.get("information_hierarchy"), "$.information_hierarchy", errors)
    require(hierarchy, ("critical", "current", "contextual", "hidden"), "$.information_hierarchy", errors)
    text_list(hierarchy.get("critical"), "$.information_hierarchy.critical", errors)
    text_list(hierarchy.get("current"), "$.information_hierarchy.current", errors)
    text_list(hierarchy.get("contextual"), "$.information_hierarchy.contextual", errors, 0)
    text_list(hierarchy.get("hidden"), "$.information_hierarchy.hidden", errors, 0)

    navigation = obj(root.get("navigation"), "$.navigation", errors)
    navigation_fields = ("methods", "focus_order", "device_switch", "modal_behavior", "destructive_behavior")
    require(navigation, navigation_fields, "$.navigation", errors)
    text_list(navigation.get("methods"), "$.navigation.methods", errors)
    text_list(navigation.get("focus_order"), "$.navigation.focus_order", errors)
    for field in ("device_switch", "modal_behavior", "destructive_behavior"):
        text(navigation.get(field), "$.navigation." + field, errors)

    layout = obj(root.get("layout"), "$.layout", errors)
    layout_fields = ("aspect_families", "safe_area", "anchors", "text_scaling", "reflow", "scrolling")
    require(layout, layout_fields, "$.layout", errors)
    text_list(layout.get("aspect_families"), "$.layout.aspect_families", errors)
    text_list(layout.get("anchors"), "$.layout.anchors", errors)
    for field in ("safe_area", "text_scaling", "reflow", "scrolling"):
        text(layout.get(field), "$.layout." + field, errors)

    localization = obj(root.get("localization"), "$.localization", errors)
    localization_fields = ("externalized", "expansion", "bidirectional", "fonts", "input_glyphs")
    require(localization, localization_fields, "$.localization", errors)
    for field in localization_fields:
        text(localization.get(field), "$.localization." + field, errors)

    accessibility = obj(root.get("accessibility"), "$.accessibility", errors)
    require(accessibility, ("signals", "settings_entry", "motion", "media_alternatives"), "$.accessibility", errors)
    text_list(accessibility.get("signals"), "$.accessibility.signals", errors, 2)
    for field in ("settings_entry", "motion", "media_alternatives"):
        text(accessibility.get(field), "$.accessibility." + field, errors)

    bindings = seq(root.get("data_bindings"), "$.data_bindings", errors)
    for index, item in enumerate(bindings):
        path = "$.data_bindings[%d]" % index
        row = obj(item, path, errors)
        fields = ("element", "source", "initial_state", "update", "stale", "error", "permission")
        require(row, fields, path, errors)
        for field in fields:
            text(row.get(field), path + "." + field, errors)

    verification = obj(root.get("verification"), "$.verification", errors)
    require(verification, ("matrix", "acceptance", "evidence"), "$.verification", errors)
    matrix = seq(verification.get("matrix"), "$.verification.matrix", errors)
    for index, item in enumerate(matrix):
        path = "$.verification.matrix[%d]" % index
        row = obj(item, path, errors)
        fields = ("state", "device", "input", "locale", "setting", "expected")
        require(row, fields, path, errors)
        for field in fields:
            text(row.get(field), path + "." + field, errors, 3)
    text_list(verification.get("acceptance"), "$.verification.acceptance", errors, 2)
    text(verification.get("evidence"), "$.verification.evidence", errors)

    records = seq(root.get("decisions"), "$.decisions", errors)
    for index, item in enumerate(records):
        path = "$.decisions[%d]" % index
        row = obj(item, path, errors)
        require(row, ("decision", "basis", "owner"), path, errors)
        for field in ("decision", "basis", "owner"):
            text(row.get(field), path + "." + field, errors, 3)

    route = obj(root.get("route_out"), "$.route_out", errors)
    require(route, ("next_owner", "reason"), "$.route_out", errors)
    text(route.get("next_owner"), "$.route_out.next_owner", errors)
    text(route.get("reason"), "$.route_out.reason", errors)
    placeholders(root, "$", errors)
    return errors


def report(data: Any) -> Dict[str, Any]:
    errors = validate(data)
    unique: List[Error] = []
    seen = set()
    for error in errors:
        if error["path"] not in seen:
            seen.add(error["path"])
            unique.append(error)
    return {"valid": not unique, "error_count": len(unique), "errors": unique}


def fixture() -> Dict[str, Any]:
    return {
        "contract_version": 1,
        "project": {"name": "test inventory", "build": "test branch", "target_devices": ["desktop display"], "input_methods": ["controller"], "locales": ["English"]},
        "player_decisions": [{"decision": "Choose an item action", "required_information": "Identity action and consequence", "urgency": "current"}],
        "screens": [{"id": "inventory", "type": "pause screen", "decision": "Choose an item action", "states": ["populated", "empty"], "entry": "Open from gameplay", "exit": "Resume gameplay", "back_behavior": "Close safely without applying changes", "initial_focus": "Restore the last valid item"}],
        "information_hierarchy": {"critical": ["destructive consequence"], "current": ["selected item and actions"], "contextual": [], "hidden": ["other player private state"]},
        "navigation": {"methods": ["controller"], "focus_order": ["category then item then action"], "device_switch": "Preserve selection and update prompts", "modal_behavior": "Contain and restore focus", "destructive_behavior": "Back cancels and never confirms"},
        "layout": {"aspect_families": ["landscape desktop"], "safe_area": "Constrain actions to runtime safe region", "anchors": ["title in safe top region"], "text_scaling": "Controls expand with text", "reflow": "Detail stacks below collection", "scrolling": "Focused control scrolls into view"},
        "localization": {"externalized": "All visible strings are externalized", "expansion": "Containers wrap expanded labels", "bidirectional": "Logical layout supports direction changes", "fonts": "Fallback covers required glyphs", "input_glyphs": "Prompts follow active mapping with text alternative"},
        "accessibility": {"signals": ["Selection is not color only", "Status has a persistent text signal"], "settings_entry": "Settings are reachable before gameplay", "motion": "Reduced motion preserves state confirmation", "media_alternatives": "No decision depends on audio or haptics alone"},
        "data_bindings": [{"element": "inventory list", "source": "authorized inventory snapshot", "initial_state": "Show explicit loading state", "update": "Apply item state events", "stale": "Disable actions and refresh", "error": "Show retry and safe exit", "permission": "Do not bind unauthorized private data"}],
        "verification": {"matrix": [{"state": "populated inventory", "device": "desktop", "input": "controller", "locale": "English", "setting": "expanded text", "expected": "Focus layout text and back behavior remain correct"}], "acceptance": ["All states are reachable and escapable", "Critical signals remain readable"], "evidence": "Record exact build input locale settings capture and event trace"},
        "decisions": [{"decision": "Use one responsive flow", "basis": "The decision and data are shared", "owner": "game UI"}],
        "route_out": {"next_owner": "engine UI implementation", "reason": "The interaction contract is frozen"},
    }


def self_test() -> int:
    base = fixture()
    cases: List[Tuple[str, Any, bool]] = [("valid accepted", base, True)]
    no_back = json.loads(json.dumps(base))
    del no_back["screens"][0]["back_behavior"]
    cases.append(("missing back behavior rejected", no_back, False))
    placeholder = json.loads(json.dumps(base))
    placeholder["layout"]["safe_area"] = "TBD"
    cases.append(("placeholder rejected", placeholder, False))
    failed = 0
    for name, data, expected in cases:
        actual = report(data)["valid"]
        ok = actual == expected
        print(("PASS" if ok else "FAIL") + ": " + name)
        failed += 0 if ok else 1
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", nargs="?", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.contract is None:
        parser.error("contract path is required unless --self-test is used")
    try:
        data = json.loads(args.contract.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 2
    output = report(data)
    if args.as_json:
        print(json.dumps(output, indent=2, sort_keys=True, ensure_ascii=False))
    elif output["valid"]:
        print("PASS: valid game UI contract")
    else:
        for error in output["errors"]:
            print("ERROR %s: %s" % (error["path"], error["message"]))
    return 0 if output["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
