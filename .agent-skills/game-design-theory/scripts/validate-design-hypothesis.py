#!/usr/bin/env python3
"""Validate game-design-hypothesis.json without modifying it.

Python 3.9+, standard library only. Exit 0 for valid, 1 for invalid, and 2 for
file or command errors.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

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


def require_fields(value: Dict[str, Any], fields: Sequence[str], path: str, errors: List[Error]) -> None:
    for field in fields:
        if field not in value:
            add(errors, path + "." + field, "is required")


def scan_placeholders(value: Any, path: str, errors: List[Error]) -> None:
    if isinstance(value, str) and PLACEHOLDER.search(value):
        add(errors, path, "contains an unresolved placeholder")
    elif isinstance(value, dict):
        for key, child in value.items():
            scan_placeholders(child, path + "." + str(key), errors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            scan_placeholders(child, "%s[%d]" % (path, index), errors)


def text_list(value: Any, path: str, errors: List[Error], minimum: int = 1) -> List[Any]:
    items = seq(value, path, errors, minimum)
    for index, item in enumerate(items):
        text(item, "%s[%d]" % (path, index), errors)
    return items


def validate(data: Any) -> List[Error]:
    errors: List[Error] = []
    root = obj(data, "$", errors)
    required = (
        "contract_version",
        "design_question",
        "context",
        "desired_experience",
        "lens",
        "causal_chain",
        "hypotheses",
        "prototype",
        "evidence_plan",
        "ethics",
        "decisions",
        "route_out",
    )
    require_fields(root, required, "$", errors)
    if root.get("contract_version") != 1:
        add(errors, "$.contract_version", "must equal 1")
    text(root.get("design_question"), "$.design_question", errors, 20)

    context = obj(root.get("context"), "$.context", errors)
    require_fields(context, ("build", "player_context", "evidence", "decision"), "$.context", errors)
    text(context.get("build"), "$.context.build", errors)
    text(context.get("player_context"), "$.context.player_context", errors)
    text_list(context.get("evidence"), "$.context.evidence", errors)
    text(context.get("decision"), "$.context.decision", errors)

    desired = obj(root.get("desired_experience"), "$.desired_experience", errors)
    require_fields(desired, ("statement", "observable_signals"), "$.desired_experience", errors)
    text(desired.get("statement"), "$.desired_experience.statement", errors)
    text_list(desired.get("observable_signals"), "$.desired_experience.observable_signals", errors, 2)

    lens = obj(root.get("lens"), "$.lens", errors)
    require_fields(lens, ("name", "why", "limitations"), "$.lens", errors)
    text(lens.get("name"), "$.lens.name", errors, 2)
    text(lens.get("why"), "$.lens.why", errors)
    text(lens.get("limitations"), "$.lens.limitations", errors)

    chain = seq(root.get("causal_chain"), "$.causal_chain", errors)
    chain_fields = ("mechanic", "interaction", "dynamic", "perceived_signal", "experience", "assumption", "evidence")
    for index, item in enumerate(chain):
        path = "$.causal_chain[%d]" % index
        row = obj(item, path, errors)
        require_fields(row, chain_fields, path, errors)
        for field in chain_fields:
            text(row.get(field), path + "." + field, errors)

    hypotheses = seq(root.get("hypotheses"), "$.hypotheses", errors)
    hypothesis_fields = ("claim", "change", "expected_signal", "falsifier", "competing_explanation", "unchanged")
    for index, item in enumerate(hypotheses):
        path = "$.hypotheses[%d]" % index
        row = obj(item, path, errors)
        require_fields(row, hypothesis_fields, path, errors)
        for field in hypothesis_fields:
            text(row.get(field), path + "." + field, errors)
        if row.get("expected_signal") == row.get("falsifier") and row.get("falsifier"):
            add(errors, path + ".falsifier", "must differ from expected_signal")

    prototype = obj(root.get("prototype"), "$.prototype", errors)
    require_fields(prototype, ("control", "variant", "scope", "risks"), "$.prototype", errors)
    for field in ("control", "variant", "scope", "risks"):
        text(prototype.get(field), "$.prototype." + field, errors)
    if prototype.get("control") == prototype.get("variant") and prototype.get("control"):
        add(errors, "$.prototype.variant", "must differ from control")

    plan = obj(root.get("evidence_plan"), "$.evidence_plan", errors)
    plan_fields = (
        "participants_context",
        "observations",
        "behavioral_measures",
        "qualitative_prompts",
        "decision_rule",
        "integrity_checks",
    )
    require_fields(plan, plan_fields, "$.evidence_plan", errors)
    text(plan.get("participants_context"), "$.evidence_plan.participants_context", errors)
    for field in ("observations", "behavioral_measures", "qualitative_prompts", "integrity_checks"):
        text_list(plan.get(field), "$.evidence_plan." + field, errors)
    text(plan.get("decision_rule"), "$.evidence_plan.decision_rule", errors, 20)

    ethics = obj(root.get("ethics"), "$.ethics", errors)
    require_fields(ethics, ("dark_patterns", "accessibility", "privacy"), "$.ethics", errors)
    for field in ("dark_patterns", "accessibility", "privacy"):
        text(ethics.get(field), "$.ethics." + field, errors)

    decisions = seq(root.get("decisions"), "$.decisions", errors)
    for index, item in enumerate(decisions):
        path = "$.decisions[%d]" % index
        row = obj(item, path, errors)
        require_fields(row, ("decision", "basis", "owner"), path, errors)
        for field in ("decision", "basis", "owner"):
            text(row.get(field), path + "." + field, errors, 3)

    route = obj(root.get("route_out"), "$.route_out", errors)
    require_fields(route, ("next_owner", "reason"), "$.route_out", errors)
    text(route.get("next_owner"), "$.route_out.next_owner", errors)
    text(route.get("reason"), "$.route_out.reason", errors)

    scan_placeholders(root, "$", errors)
    return errors


def result(data: Any) -> Dict[str, Any]:
    errors = validate(data)
    unique: List[Error] = []
    seen = set()
    for error in errors:
        if error["path"] not in seen:
            seen.add(error["path"])
            unique.append(error)
    return {"valid": not unique, "error_count": len(unique), "errors": unique}


def self_test() -> int:
    base: Dict[str, Any] = {
        "contract_version": 1,
        "design_question": "Will visible threat information improve informed choice in this prototype?",
        "context": {"build": "test branch", "player_context": "returning test players", "evidence": ["Observed repeated glossary checks"], "decision": "Choose information order"},
        "desired_experience": {"statement": "Informed tension before confirmation", "observable_signals": ["Players explain the tradeoff", "Players attribute the outcome to their choice"]},
        "lens": {"name": "MDA", "why": "Information mechanics may change runtime choices", "limitations": "Interpretation still requires player evidence"},
        "causal_chain": [{"mechanic": "Threat is visible", "interaction": "Player compares two options", "dynamic": "Safe and risky choices compete", "perceived_signal": "The tradeoff is visible", "experience": "Informed tension", "assumption": "Neither option becomes universally correct", "evidence": "Needs controlled comparison"}],
        "hypotheses": [{"claim": "Earlier information supports agency", "change": "Reveal threat before selection", "expected_signal": "Players explain a meaningful tradeoff", "falsifier": "One option becomes obviously correct", "competing_explanation": "Copy clarity may explain the change", "unchanged": "Rules rewards inputs and encounter state"}],
        "prototype": {"control": "Reveal after selection", "variant": "Reveal before selection", "scope": "One encounter set", "risks": "Learning and order effects"},
        "evidence_plan": {"participants_context": "Players familiar with current vocabulary", "observations": ["Decision explanation"], "behavioral_measures": ["Selected option by state"], "qualitative_prompts": ["What tradeoff did you consider?"], "decision_rule": "Keep only if the tradeoff remains meaningful and explainable", "integrity_checks": ["Verify the intended reveal order"]},
        "ethics": {"dark_patterns": "No artificial urgency or concealed cost", "accessibility": "Threat uses text and shape as well as color", "privacy": "Store only consented decision evidence"},
        "decisions": [{"decision": "Test information order", "basis": "Current evidence is ambiguous", "owner": "combat design"}],
        "route_out": {"next_owner": "prototype implementation", "reason": "The causal claim needs runtime evidence"},
    }
    cases: List[Tuple[str, Any, bool]] = [("valid accepted", base, True)]
    missing = json.loads(json.dumps(base))
    del missing["hypotheses"][0]["falsifier"]
    cases.append(("missing falsifier rejected", missing, False))
    placeholder = json.loads(json.dumps(base))
    placeholder["prototype"]["variant"] = "TODO later"
    cases.append(("placeholder rejected", placeholder, False))
    failed = 0
    for name, value, expected in cases:
        actual = result(value)["valid"]
        ok = actual == expected
        print(("PASS" if ok else "FAIL") + ": " + name)
        if not ok:
            failed += 1
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
    output = result(data)
    if args.as_json:
        print(json.dumps(output, indent=2, sort_keys=True, ensure_ascii=False))
    elif output["valid"]:
        print("PASS: valid game design hypothesis contract")
    else:
        for error in output["errors"]:
            print("ERROR %s: %s" % (error["path"], error["message"]))
    return 0 if output["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
