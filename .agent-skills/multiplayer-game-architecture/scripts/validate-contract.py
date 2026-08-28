#!/usr/bin/env python3
"""Validate a multiplayer architecture contract without external dependencies."""

import argparse
import copy
import json
import re
import sys
from pathlib import Path


PLACEHOLDER_RE = re.compile(
    r"\b(?:TBD|TODO|FIXME|CHANGEME|UNKNOWN)\b|<[^>\n]+>", re.IGNORECASE
)
REQUIRED_OBJECTS = (
    "game",
    "session",
    "topology",
    "simulation",
    "replication",
    "transport",
    "lifecycle",
    "security",
    "observability",
    "verification",
)
PEER_MODELS = {
    "listen-server",
    "peer-to-peer",
    "relay-assisted-peer",
}


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def add(errors, path, message):
    errors.append({"path": path, "message": message})


def require_object(parent, key, path, errors):
    value = parent.get(key) if isinstance(parent, dict) else None
    if not isinstance(value, dict):
        add(errors, path, "must be an object")
        return {}
    return value


def require_text(parent, key, path, errors, minimum=1):
    value = parent.get(key) if isinstance(parent, dict) else None
    if not isinstance(value, str) or len(value.strip()) < minimum:
        add(errors, path, "must be a non-empty string")
        return ""
    return value.strip()


def require_list(parent, key, path, errors, minimum=1, text_items=False):
    value = parent.get(key) if isinstance(parent, dict) else None
    if not isinstance(value, list) or len(value) < minimum:
        add(errors, path, "must be a list with at least {} item(s)".format(minimum))
        return []
    if text_items:
        for index, item in enumerate(value):
            if not isinstance(item, str) or not item.strip():
                add(errors, "{}[{}]".format(path, index), "must be a non-empty string")
    return value


def find_placeholders(value, path="$"):
    findings = []
    if isinstance(value, dict):
        for key, child in value.items():
            findings.extend(find_placeholders(child, "{}.{}".format(path, key)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(find_placeholders(child, "{}[{}]".format(path, index)))
    elif isinstance(value, str) and PLACEHOLDER_RE.search(value):
        findings.append(path)
    return findings


def validate_contract(data):
    errors = []
    if not isinstance(data, dict):
        return [{"path": "$", "message": "contract root must be an object"}]

    if data.get("contract_version") != 1:
        add(errors, "$.contract_version", "must equal 1")

    objects = {}
    for key in REQUIRED_OBJECTS:
        objects[key] = require_object(data, key, "$.{}".format(key), errors)

    game = objects["game"]
    require_text(game, "name", "$.game.name", errors)
    require_text(game, "genre", "$.game.genre", errors)
    require_list(
        game,
        "target_platforms",
        "$.game.target_platforms",
        errors,
        minimum=1,
        text_items=True,
    )

    session = objects["session"]
    require_text(session, "pace", "$.session.pace", errors)
    fairness = require_text(session, "fairness", "$.session.fairness", errors)
    require_text(session, "join_model", "$.session.join_model", errors)
    require_text(session, "late_join", "$.session.late_join", errors)
    players_min = session.get("players_min")
    players_max = session.get("players_max")
    if not isinstance(players_min, int) or isinstance(players_min, bool) or players_min < 1:
        add(errors, "$.session.players_min", "must be an integer of at least 1")
    if not isinstance(players_max, int) or isinstance(players_max, bool) or players_max < 1:
        add(errors, "$.session.players_max", "must be an integer of at least 1")
    if (
        isinstance(players_min, int)
        and not isinstance(players_min, bool)
        and isinstance(players_max, int)
        and not isinstance(players_max, bool)
        and players_max < players_min
    ):
        add(errors, "$.session.players_max", "must be greater than or equal to players_min")

    topology = objects["topology"]
    topology_model = require_text(topology, "model", "$.topology.model", errors)
    require_text(topology, "authority_owner", "$.topology.authority_owner", errors)
    require_list(
        topology,
        "trust_assumptions",
        "$.topology.trust_assumptions",
        errors,
        minimum=1,
        text_items=True,
    )
    require_text(topology, "host_migration", "$.topology.host_migration", errors)
    risk_acceptance = topology.get("risk_acceptance")
    if not isinstance(risk_acceptance, list):
        add(errors, "$.topology.risk_acceptance", "must be a list, which may be empty")
        risk_acceptance = []
    elif any(not isinstance(item, str) or not item.strip() for item in risk_acceptance):
        add(errors, "$.topology.risk_acceptance", "must contain only non-empty strings")

    fairness_lower = fairness.lower()
    if (
        ("ranked" in fairness_lower or "competitive" in fairness_lower)
        and topology_model.lower() in PEER_MODELS
        and not risk_acceptance
    ):
        add(
            errors,
            "$.topology.risk_acceptance",
            "ranked or competitive peer/listen topology requires explicit risk acceptance",
        )

    authority = data.get("authority")
    if not isinstance(authority, list) or len(authority) < 3:
        add(errors, "$.authority", "must contain at least three state-domain rows")
        authority = []
    domains = set()
    for index, row in enumerate(authority):
        path = "$.authority[{}]".format(index)
        if not isinstance(row, dict):
            add(errors, path, "must be an object")
            continue
        domain = require_text(row, "domain", path + ".domain", errors)
        if domain:
            key = domain.casefold()
            if key in domains:
                add(errors, path + ".domain", "must be unique")
            domains.add(key)
        require_text(row, "owner", path + ".owner", errors)
        require_list(
            row,
            "client_can_request",
            path + ".client_can_request",
            errors,
            minimum=1,
            text_items=True,
        )
        require_list(
            row,
            "authority_validation",
            path + ".authority_validation",
            errors,
            minimum=1,
            text_items=True,
        )

    simulation = objects["simulation"]
    require_text(simulation, "clock", "$.simulation.clock", errors)
    tick_rate = simulation.get("tick_rate_hz")
    if tick_rate is not None and (not is_number(tick_rate) or tick_rate <= 0):
        add(errors, "$.simulation.tick_rate_hz", "must be null or a positive number")
    tick_basis = require_text(
        simulation, "tick_rate_basis", "$.simulation.tick_rate_basis", errors, minimum=20
    )
    require_text(simulation, "prediction", "$.simulation.prediction", errors)
    require_text(simulation, "reconciliation", "$.simulation.reconciliation", errors)
    measurement_plan = require_text(
        simulation, "measurement_plan", "$.simulation.measurement_plan", errors, minimum=20
    )
    if tick_rate is not None and (len(tick_basis) < 20 or len(measurement_plan) < 20):
        add(
            errors,
            "$.simulation.tick_rate_hz",
            "a numeric tick rate requires mechanics rationale and a measurement plan",
        )

    replication = objects["replication"]
    require_text(replication, "model", "$.replication.model", errors)
    reliability = replication.get("reliability_classes")
    if not isinstance(reliability, dict) or not reliability:
        add(errors, "$.replication.reliability_classes", "must be a non-empty object")
    else:
        for key, value in reliability.items():
            if not isinstance(key, str) or not key.strip() or not isinstance(value, str) or not value.strip():
                add(
                    errors,
                    "$.replication.reliability_classes",
                    "keys and values must be non-empty strings",
                )
                break
    require_text(
        replication, "interest_management", "$.replication.interest_management", errors
    )
    require_text(replication, "hidden_state", "$.replication.hidden_state", errors)

    transport = objects["transport"]
    require_text(transport, "primary", "$.transport.primary", errors)
    require_text(transport, "rationale", "$.transport.rationale", errors, minimum=20)
    require_text(transport, "fallback", "$.transport.fallback", errors)
    require_text(transport, "backpressure", "$.transport.backpressure", errors, minimum=20)

    lifecycle = objects["lifecycle"]
    states = require_list(
        lifecycle, "states", "$.lifecycle.states", errors, minimum=4, text_items=True
    )
    normalized_states = [item.casefold() for item in states if isinstance(item, str)]
    if len(normalized_states) != len(set(normalized_states)):
        add(errors, "$.lifecycle.states", "must not contain duplicate states")
    require_text(lifecycle, "reconnect", "$.lifecycle.reconnect", errors)
    require_text(lifecycle, "disconnect", "$.lifecycle.disconnect", errors)
    require_text(lifecycle, "version_policy", "$.lifecycle.version_policy", errors)

    security = objects["security"]
    require_text(security, "identity", "$.security.identity", errors)
    require_text(security, "authorization", "$.security.authorization", errors)
    require_list(
        security,
        "validation",
        "$.security.validation",
        errors,
        minimum=2,
        text_items=True,
    )
    require_list(
        security,
        "abuse_controls",
        "$.security.abuse_controls",
        errors,
        minimum=2,
        text_items=True,
    )
    require_text(security, "logging", "$.security.logging", errors)

    observability = objects["observability"]
    require_list(
        observability,
        "metrics",
        "$.observability.metrics",
        errors,
        minimum=2,
        text_items=True,
    )
    require_list(
        observability,
        "traces",
        "$.observability.traces",
        errors,
        minimum=2,
        text_items=True,
    )
    require_list(
        observability,
        "alerts",
        "$.observability.alerts",
        errors,
        minimum=1,
        text_items=True,
    )

    verification = objects["verification"]
    conditions = verification.get("network_conditions")
    if not isinstance(conditions, list) or len(conditions) < 2:
        add(
            errors,
            "$.verification.network_conditions",
            "must contain at least one clean and one impaired condition",
        )
        conditions = []
    has_clean = False
    has_impaired = False
    for index, condition in enumerate(conditions):
        path = "$.verification.network_conditions[{}]".format(index)
        if not isinstance(condition, dict):
            add(errors, path, "must be an object")
            continue
        require_text(condition, "name", path + ".name", errors)
        values = []
        for key in ("latency_ms", "jitter_ms", "loss_percent", "reorder_percent"):
            value = condition.get(key)
            if not is_number(value) or value < 0:
                add(errors, path + "." + key, "must be a non-negative number")
                values.append(None)
                continue
            if key.endswith("percent") and value > 100:
                add(errors, path + "." + key, "must not exceed 100")
            values.append(value)
        if values and all(value == 0 for value in values if value is not None) and None not in values:
            has_clean = True
        if any(value and value > 0 for value in values if value is not None):
            has_impaired = True
    if conditions and not has_clean:
        add(errors, "$.verification.network_conditions", "must include a clean all-zero control")
    if conditions and not has_impaired:
        add(errors, "$.verification.network_conditions", "must include an impaired condition")
    require_list(
        verification,
        "scenarios",
        "$.verification.scenarios",
        errors,
        minimum=3,
        text_items=True,
    )
    require_list(
        verification,
        "acceptance",
        "$.verification.acceptance",
        errors,
        minimum=3,
        text_items=True,
    )

    decisions = data.get("decisions")
    if not isinstance(decisions, list) or not decisions:
        add(errors, "$.decisions", "must contain at least one decision record")
        decisions = []
    for index, decision in enumerate(decisions):
        path = "$.decisions[{}]".format(index)
        if not isinstance(decision, dict):
            add(errors, path, "must be an object")
            continue
        require_text(decision, "decision", path + ".decision", errors)
        require_text(decision, "reason", path + ".reason", errors)
        require_text(decision, "evidence", path + ".evidence", errors)

    for path in find_placeholders(data):
        add(errors, path, "contains an unresolved placeholder")

    return errors


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def self_test():
    example_path = Path(__file__).resolve().parents[1] / "references" / "contract-example.json"
    try:
        valid = load_json(example_path)
    except (OSError, json.JSONDecodeError) as error:
        print("FAIL: could not load example: {}".format(error), file=sys.stderr)
        return 1

    valid_errors = validate_contract(valid)
    if valid_errors:
        print("FAIL: valid example was rejected", file=sys.stderr)
        for item in valid_errors:
            print("  {}: {}".format(item["path"], item["message"]), file=sys.stderr)
        return 1
    print("PASS: valid example accepted")

    missing_authority = copy.deepcopy(valid)
    missing_authority.pop("authority", None)
    if not any(item["path"] == "$.authority" for item in validate_contract(missing_authority)):
        print("FAIL: missing authority was not rejected", file=sys.stderr)
        return 1
    print("PASS: missing authority rejected")

    unsafe_peer = copy.deepcopy(valid)
    unsafe_peer["session"]["fairness"] = "ranked competitive"
    unsafe_peer["topology"]["model"] = "peer-to-peer"
    unsafe_peer["topology"]["risk_acceptance"] = []
    unsafe_errors = validate_contract(unsafe_peer)
    if not any(item["path"] == "$.topology.risk_acceptance" for item in unsafe_errors):
        print("FAIL: competitive peer risk was not rejected", file=sys.stderr)
        return 1
    print("PASS: competitive peer risk rejected")
    return 0


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate multiplayer-contract.json without changing it."
    )
    parser.add_argument("path", nargs="?", type=Path, help="contract JSON path")
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    parser.add_argument("--self-test", action="store_true", help="run built-in positive and negative tests")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if args.self_test:
        if args.path is not None:
            print("error: --self-test does not take a contract path", file=sys.stderr)
            return 2
        return self_test()
    if args.path is None:
        print("error: contract path is required", file=sys.stderr)
        return 2

    path = args.path.expanduser().resolve()
    try:
        data = load_json(path)
    except FileNotFoundError:
        print("error: file not found: {}".format(path), file=sys.stderr)
        return 2
    except PermissionError:
        print("error: permission denied: {}".format(path), file=sys.stderr)
        return 2
    except json.JSONDecodeError as error:
        print("error: invalid JSON at line {}, column {}: {}".format(error.lineno, error.colno, error.msg), file=sys.stderr)
        return 2

    errors = validate_contract(data)
    result = {"valid": not errors, "path": str(path), "errors": errors}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif errors:
        print("FAIL: {} validation issue(s)".format(len(errors)))
        for item in errors:
            print("  {}: {}".format(item["path"], item["message"]))
    else:
        print("PASS: multiplayer contract is structurally complete")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
