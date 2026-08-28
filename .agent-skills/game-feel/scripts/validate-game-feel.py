#!/usr/bin/env python3
"""Validate game-feel-contract.json without modifying it.

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
        text(item, "%s[%d]" % (path, index), errors, 3)
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
        "contract_version", "mechanic", "goal", "baseline", "response_chain",
        "primary_hypothesis", "event_channels", "safety", "accessibility",
        "comparison", "performance", "decisions", "route_out",
    )
    require(root, root_fields, "$", errors)
    if root.get("contract_version") != 1:
        add(errors, "$.contract_version", "must equal 1")

    mechanic = obj(root.get("mechanic"), "$.mechanic", errors)
    mechanic_fields = ("name", "build", "scene", "target_devices", "network_state", "camera")
    require(mechanic, mechanic_fields, "$.mechanic", errors)
    for field in ("name", "build", "scene", "network_state", "camera"):
        text(mechanic.get(field), "$.mechanic." + field, errors)
    text_list(mechanic.get("target_devices"), "$.mechanic.target_devices", errors)
    text(root.get("goal"), "$.goal", errors, 20)

    baseline = obj(root.get("baseline"), "$.baseline", errors)
    require(baseline, ("capture", "observations", "measured_stages", "inferred_stages"), "$.baseline", errors)
    text(baseline.get("capture"), "$.baseline.capture", errors)
    text_list(baseline.get("observations"), "$.baseline.observations", errors, 2)
    text_list(baseline.get("measured_stages"), "$.baseline.measured_stages", errors)
    text_list(baseline.get("inferred_stages"), "$.baseline.inferred_stages", errors, 0)

    chain = seq(root.get("response_chain"), "$.response_chain", errors, 5)
    seen: Set[str] = set()
    measured = 0
    for index, item in enumerate(chain):
        path = "$.response_chain[%d]" % index
        row = obj(item, path, errors)
        require(row, ("stage", "owner", "evidence", "status"), path, errors)
        stage = text(row.get("stage"), path + ".stage", errors, 3).lower()
        if stage:
            if stage in seen:
                add(errors, path + ".stage", "must be unique")
            seen.add(stage)
        text(row.get("owner"), path + ".owner", errors, 3)
        text(row.get("evidence"), path + ".evidence", errors)
        status = row.get("status")
        if status not in ("measured", "observed", "inferred"):
            add(errors, path + ".status", "must be measured, observed, or inferred")
        if status == "measured":
            measured += 1
    if "recovery" not in seen:
        add(errors, "$.response_chain", "must include a recovery stage")
    if measured == 0:
        add(errors, "$.response_chain", "must include at least one measured stage")

    hypothesis = obj(root.get("primary_hypothesis"), "$.primary_hypothesis", errors)
    hypothesis_fields = ("weak_link", "problem", "change", "expected_signal", "falsifier", "competing_explanation")
    require(hypothesis, hypothesis_fields, "$.primary_hypothesis", errors)
    for field in hypothesis_fields:
        text(hypothesis.get(field), "$.primary_hypothesis." + field, errors)
    if hypothesis.get("expected_signal") == hypothesis.get("falsifier") and hypothesis.get("falsifier"):
        add(errors, "$.primary_hypothesis.falsifier", "must differ from expected_signal")

    events = seq(root.get("event_channels"), "$.event_channels", errors)
    for index, item in enumerate(events):
        path = "$.event_channels[%d]" % index
        row = obj(item, path, errors)
        fields = ("event", "importance", "channels", "necessary_information", "accessibility_alternative")
        require(row, fields, path, errors)
        text(row.get("event"), path + ".event", errors, 3)
        if row.get("importance") not in ("critical", "high", "routine", "contextual"):
            add(errors, path + ".importance", "must be critical, high, routine, or contextual")
        text_list(row.get("channels"), path + ".channels", errors)
        text(row.get("necessary_information"), path + ".necessary_information", errors)
        text(row.get("accessibility_alternative"), path + ".accessibility_alternative", errors)

    safety = obj(root.get("safety"), "$.safety", errors)
    safety_fields = ("simulation_truth", "input_policy", "return_to_rest", "multiplayer_authority")
    require(safety, safety_fields, "$.safety", errors)
    for field in safety_fields:
        text(safety.get(field), "$.safety." + field, errors)

    accessibility = obj(root.get("accessibility"), "$.accessibility", errors)
    require(accessibility, ("settings", "redundant_signals"), "$.accessibility", errors)
    settings = seq(accessibility.get("settings"), "$.accessibility.settings", errors)
    for index, item in enumerate(settings):
        path = "$.accessibility.settings[%d]" % index
        row = obj(item, path, errors)
        require(row, ("control", "affected_channels", "behavior", "persistence"), path, errors)
        text(row.get("control"), path + ".control", errors, 3)
        text_list(row.get("affected_channels"), path + ".affected_channels", errors)
        text(row.get("behavior"), path + ".behavior", errors)
        text(row.get("persistence"), path + ".persistence", errors)
    text(accessibility.get("redundant_signals"), "$.accessibility.redundant_signals", errors)

    comparison = obj(root.get("comparison"), "$.comparison", errors)
    comparison_fields = ("control", "variant", "matched_conditions", "repetition_basis", "acceptance")
    require(comparison, comparison_fields, "$.comparison", errors)
    text(comparison.get("control"), "$.comparison.control", errors)
    text(comparison.get("variant"), "$.comparison.variant", errors)
    if comparison.get("control") == comparison.get("variant") and comparison.get("control"):
        add(errors, "$.comparison.variant", "must differ from control")
    text_list(comparison.get("matched_conditions"), "$.comparison.matched_conditions", errors, 3)
    text(comparison.get("repetition_basis"), "$.comparison.repetition_basis", errors)
    text_list(comparison.get("acceptance"), "$.comparison.acceptance", errors, 2)

    performance = obj(root.get("performance"), "$.performance", errors)
    require(performance, ("budgets", "basis", "measurement"), "$.performance", errors)
    for field in ("budgets", "basis", "measurement"):
        text(performance.get(field), "$.performance." + field, errors)

    decisions = seq(root.get("decisions"), "$.decisions", errors)
    for index, item in enumerate(decisions):
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
        "mechanic": {"name": "test impact", "build": "test build", "scene": "training room", "target_devices": ["desktop controller"], "network_state": "offline authority", "camera": "follow camera"},
        "goal": "Make the trusted impact classification clear without changing gameplay state.",
        "baseline": {"capture": "Synchronized input state and render capture", "observations": ["Trusted contact resolves once", "Heavy and light events look similar"], "measured_stages": ["input read", "state change"], "inferred_stages": ["player intent"]},
        "response_chain": [
            {"stage": "intent", "owner": "player", "evidence": "Documented held input action", "status": "observed"},
            {"stage": "input", "owner": "input system", "evidence": "Input marker in capture", "status": "measured"},
            {"stage": "simulation", "owner": "combat system", "evidence": "State transition marker", "status": "measured"},
            {"stage": "render", "owner": "animation system", "evidence": "Visible contact pose capture", "status": "observed"},
            {"stage": "feedback", "owner": "presentation system", "evidence": "Visual and audio event capture", "status": "observed"},
            {"stage": "recovery", "owner": "state and cleanup", "evidence": "Input and camera restored after interruption", "status": "measured"},
        ],
        "primary_hypothesis": {"weak_link": "impact recognition", "problem": "Events lack distinct channel priority", "change": "Change the contact pose only", "expected_signal": "Players distinguish the event", "falsifier": "The event remains unclear or obscures state", "competing_explanation": "Startup timing may own the symptom"},
        "event_channels": [{"event": "confirmed heavy hit", "importance": "high", "channels": ["shape", "audio"], "necessary_information": "Heavy classification connected", "accessibility_alternative": "Stable shape and text do not rely on motion or audio"}],
        "safety": {"simulation_truth": "Damage collision and score stay unchanged", "input_policy": "Buffer and recovery rules stay unchanged", "return_to_rest": "All transient presentation state is restored", "multiplayer_authority": "Offline only; network port requires review"},
        "accessibility": {"settings": [{"control": "camera motion", "affected_channels": ["camera"], "behavior": "Off preserves stable shape confirmation", "persistence": "Use product settings persistence"}], "redundant_signals": "Critical state uses more than one permitted channel"},
        "comparison": {"control": "Current presentation", "variant": "Changed contact pose", "matched_conditions": ["same build", "same device", "same encounter"], "repetition_basis": "Repeat normal and interrupted paths until cleanup is consistent", "acceptance": ["Classification remains readable", "Trusted state matches control"]},
        "performance": {"budgets": "Use project-owned budgets", "basis": "Measure on target device", "measurement": "Capture frame pacing and effect lifetime"},
        "decisions": [{"decision": "Test recognition first", "basis": "Trusted timing is correct", "owner": "combat presentation"}],
        "route_out": {"next_owner": "animation implementation", "reason": "The controlled presentation change is defined"},
    }


def self_test() -> int:
    base = fixture()
    cases: List[Tuple[str, Any, bool]] = [("valid accepted", base, True)]
    no_recovery = json.loads(json.dumps(base))
    no_recovery["response_chain"][-1]["stage"] = "cleanup"
    cases.append(("missing recovery rejected", no_recovery, False))
    placeholder = json.loads(json.dumps(base))
    placeholder["comparison"]["variant"] = "TODO tune it"
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
        print("PASS: valid game feel contract")
    else:
        for error in output["errors"]:
            print("ERROR %s: %s" % (error["path"], error["message"]))
    return 0 if output["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
