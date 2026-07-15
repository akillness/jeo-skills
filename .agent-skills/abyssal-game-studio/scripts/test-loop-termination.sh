#!/usr/bin/env bash
# Regression test for finite Abyssal Game Studio workflow re-entry.
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PACKAGE_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/abyssal-loop-termination.XXXXXX")"
trap 'rm -rf -- "$TEMP_ROOT"' EXIT HUP INT TERM

command -v python3 >/dev/null 2>&1 || {
  printf '%s\n' 'python3 is required for loop-termination assertions' >&2
  exit 1
}

python3 - "$PACKAGE_ROOT" "$TEMP_ROOT" <<'PY'
"""Assert finite re-entry and prove the package validator rejects regressions."""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

package_root = Path(sys.argv[1]).resolve()
temp_root = Path(sys.argv[2]).resolve()
workflow_path = package_root / "references" / "workflow-contract.json"
quality_path = package_root / "references" / "quality-gates.md"
role_path = package_root / "references" / "role-contracts.json"
validator_path = package_root / "scripts" / "validate-package.sh"

assert workflow_path.is_file(), f"missing workflow contract: {workflow_path}"
assert quality_path.is_file(), f"missing quality gates: {quality_path}"
assert validator_path.is_file(), f"missing package validator: {validator_path}"

workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
quality = quality_path.read_text(encoding="utf-8")
roles_doc = json.loads(role_path.read_text(encoding="utf-8"))
roles = roles_doc.get("roles")
assert isinstance(roles, list), "role contract must declare roles"
qa_roles = [
    role
    for role in roles
    if isinstance(role, dict) and role.get("name") == "adversarial-qa-lead"
]
assert len(qa_roles) == 1, "role contract must declare exactly one adversarial QA lead"
assert qa_roles[0].get("required_skill") == "qa", "adversarial QA lead must require qa"
qa_required_inputs = {"economy_ledger", "balance_model", "simulator_evidence", "narrative_rule_traceability"}
assert qa_required_inputs <= set(qa_roles[0].get("inputs", [])), "QA must consume quantitative and narrative proof"

assert isinstance(workflow, dict), "workflow contract must be a JSON object"

phases = workflow.get("phases")
assert isinstance(phases, list), "workflow contract must declare phases"
phase_by_id = {phase.get("id"): phase for phase in phases if isinstance(phase, dict)}
assert set(phase_by_id) >= {"P0", "P1", "P2", "P3", "P4", "P5"}, "P0-P5 phases are required"
assert len(phase_by_id) == len(phases), "phase IDs must be unique"

# The dependency graph must be rooted at P0, acyclic, and reach every declared phase.
dependencies = {}
for phase_id, phase in phase_by_id.items():
    depends_on = phase.get("depends_on")
    assert isinstance(depends_on, list), f"{phase_id} must declare dependency list"
    assert all(dependency in phase_by_id for dependency in depends_on), f"{phase_id} has an unknown dependency"
    dependencies[phase_id] = set(depends_on)

reachable = {"P0"}
for _ in range(len(phase_by_id)):
    newly_reachable = {
        phase_id
        for phase_id, depends_on in dependencies.items()
        if phase_id not in reachable and depends_on <= reachable
    }
    if not newly_reachable:
        break
    reachable.update(newly_reachable)
else:
    raise AssertionError("phase reachability exceeded its finite phase budget")
assert reachable == set(phase_by_id), "every phase must be reachable from P0 without a cycle"

# Every non-P0 prerequisite must have one direct, immutable, forward-only handoff.
handoffs = workflow.get("typed_handoffs")
assert isinstance(handoffs, list) and handoffs, "workflow contract must declare typed_handoffs"
phase_order = {phase["id"]: index for index, phase in enumerate(phases)}
observed_edges = set()
for handoff in handoffs:
    assert isinstance(handoff, dict), "each handoff must be an object"
    source_id, target_id, artifact = handoff.get("from_phase"), handoff.get("to_phase"), handoff.get("artifact")
    assert source_id in phase_by_id and target_id in phase_by_id and source_id != target_id, "handoff phases must exist and differ"
    assert phase_order[source_id] < phase_order[target_id], "handoffs may not loop backward"
    assert isinstance(artifact, str) and artifact, "handoff must name an artifact"
    assert artifact in phase_by_id[source_id]["outputs"], f"{source_id} does not output handoff artifact {artifact}"
    assert artifact in phase_by_id[target_id]["requires"], f"{target_id} does not require handoff artifact {artifact}"
    assert handoff.get("required_immutable") is True, f"{artifact} handoff must require immutable publication"
    has_required_status = "required_status" in handoff
    has_accepted_statuses = "accepted_statuses" in handoff
    assert has_required_status ^ has_accepted_statuses, "each handoff must have one status policy"
    if has_required_status:
        assert handoff["required_status"] == "evidence-ready", f"{artifact} evidence handoff status"
    else:
        assert (
            source_id == "P4" and target_id == "P5" and artifact == "qa_verdict"
            and set(handoff["accepted_statuses"]) == {"PASS", "FAIL", "INCONCLUSIVE"}
        ), "only the P4 QA verdict may pass terminal status alternatives"
    observed_edges.add((source_id, target_id, artifact))

required_handoff_count = sum(len(phase["requires"]) for phase in phases if phase["id"] != "P0")
assert len(handoffs) == required_handoff_count == len(observed_edges), "every non-P0 requirement must have one handoff"
for target_id, phase in phase_by_id.items():
    if target_id == "P0":
        continue
    for artifact in phase["requires"]:
        assert sum(edge[1] == target_id and edge[2] == artifact for edge in observed_edges) == 1, (
            f"{target_id} requirement {artifact} must have exactly one direct handoff"
        )

# Operations must draft before QA and issue final readiness only after QA.
p3_outputs = phase_by_id["P3"].get("outputs")
p4_requires = phase_by_id["P4"].get("requires")
p5_outputs = phase_by_id["P5"].get("outputs")
assert isinstance(p3_outputs, list) and "operations_draft" in p3_outputs, "P3 must produce operations_draft before QA"
assert isinstance(p4_requires, list) and "operations_draft" in p4_requires, "P4 QA must consume operations_draft"
assert phase_by_id["P3"].get("parallel_tasks") == [], "P3 operations draft must follow engineering sequentially"
assert phase_by_id["P3"].get("sequence") == ["validate_engine_agnostic_implementation", "produce_operations_draft"], "P3 sequence must be explicit"
assert isinstance(p5_outputs, list) and "release_readiness" in p5_outputs, "P5 must produce final release_readiness after QA"
assert "release_readiness" not in p3_outputs, "pre-QA operations draft cannot be final readiness"
reentry = workflow.get("reentry")
assert isinstance(reentry, dict), "workflow contract must declare reentry policy"
max_cycles = reentry.get("max_cycles")
assert max_cycles == 2, "re-entry must permit exactly two cycles"
assert type(max_cycles) is int and 0 < max_cycles <= 20, "re-entry max_cycles must be a finite positive integer"
terminal_states = reentry.get("terminal_states")
assert isinstance(terminal_states, list) and terminal_states, "re-entry must declare finite terminal_states"
assert all(isinstance(state, str) and state for state in terminal_states), "terminal states must be non-empty IDs"
assert len(set(terminal_states)) == len(terminal_states), "terminal states must be unique"
exhausted_state = reentry.get("on_exhausted")
assert exhausted_state in terminal_states, "re-entry exhaustion must enter a declared terminal state"
assert reentry.get("restart_phase") == "P3", "re-entry must restart at engineering and operations"
assert reentry.get("required_downstream_revalidation") == ["P3", "P4", "P5"], "re-entry must revalidate all downstream phases"
assert reentry.get("cycle") == [
    "evidence_record",
    "director_single_owner_scope",
    "new_immutable_artifact",
    "downstream_contract_revalidation",
    "qa_regression",
    "operations_reassessment",
], "re-entry must regenerate P3 evidence before QA and operations reassessment"
assert "new_run" not in exhausted_state.lower(), "re-entry exhaustion must never auto-start a new run"
assert reentry.get("automatic_restart_allowed") is False, "re-entry exhaustion must never auto-start a run"
evidence_sources = reentry.get("evidence_sources")
assert evidence_sources == ["qa_fail", "ops_stop_ship"], "only QA FAIL and operations STOP-SHIP may request re-entry"
assert reentry.get("requires_external_authorization") is True, "a later run requires external authorization"
assert reentry.get("requires_materially_changed_intake_constraints_fingerprint") is True, "a later run requires a materially changed intake/constraints fingerprint"
assert reentry.get("later_run_requires") == ["external_request_id", "new_run_id", "materially_changed_intake_or_constraints_fingerprint"], "later runs need explicit prerequisites"
assert reentry.get("rejects") == ["same_run_continuation", "same_fingerprint_restart"], "same-run and same-fingerprint restart must be rejected"

# Model persistent QA/operations failure: exactly max_cycles re-entries, then terminal closure.
def next_state(state, failure_event):
    assert failure_event in {"qa_fail", "ops_stop_ship"}, "only QA or operations evidence may request re-entry"
    if state["terminal"]:
        return state
    if state["cycles"] >= max_cycles:
        return {"cycles": state["cycles"], "terminal": exhausted_state, "phase": None}
    return {"cycles": state["cycles"] + 1, "terminal": None, "phase": "P3"}

state = {"cycles": 0, "terminal": None, "phase": "P4"}
for event in ["qa_fail", "ops_stop_ship"] * (max_cycles + 1):
    state = next_state(state, event)
    if state["terminal"] is not None:
        break
assert state == {"cycles": max_cycles, "terminal": exhausted_state, "phase": None}, "persistent QA/operations failure must close after its re-entry budget"
assert next_state(state, "qa_fail") == state, "closed milestone must remain closed under further QA failure"
assert next_state(state, "ops_stop_ship") == state, "closed milestone must remain closed under further operations stop-ship"

# Repeated probes must show finite watchdog/budget evidence on the three loop-prone rows.
def bounded_marker_pattern(row_id):
    return re.compile(
        rf"(?im)^.*\bQA[- ]?{row_id}\b.*\bbounded watchdog\b.*\b(?:budget|max(?:imum)?|limit)\b.*\b[1-9][0-9]*\b.*$"
    )

markers = {}
expected_units = {"03": "simulated-tick", "06": "resource-state", "18": "simulated-tick"}
for row_id in ("03", "06", "18"):
    matches = list(bounded_marker_pattern(row_id).finditer(quality))
    assert len(matches) == 1, f"QA-{row_id} must declare exactly one finite bounded watchdog/budget marker"
    markers[row_id] = matches[0].group(0)
    assert expected_units[row_id] in markers[row_id], f"QA-{row_id} watchdog must declare a measurement unit"


def copied_package(name):
    destination = temp_root / name
    shutil.copytree(package_root, destination)
    return destination


def assert_validator_rejects(destination, reason):
    result = subprocess.run(
        [str(destination / "scripts" / "validate-package.sh")],
        cwd=destination,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=15,
        check=False,
    )
    assert result.returncode != 0, f"validator accepted unsafe mutation: {reason}"


# Mutation 1: a contract that auto-starts a run after exhaustion must be rejected.
auto_restart_copy = copied_package("auto-restart")
auto_restart_path = auto_restart_copy / "references" / "workflow-contract.json"
auto_restart_workflow = json.loads(auto_restart_path.read_text(encoding="utf-8"))
auto_restart_workflow["reentry"]["on_exhausted"] = "auto_start_new_run"
auto_restart_path.write_text(json.dumps(auto_restart_workflow, indent=2) + "\n", encoding="utf-8")
assert_validator_rejects(auto_restart_copy, "auto-restart after re-entry exhaustion")

# Mutation 2: omitting any required bounded QA marker must be rejected.
for row_id, marker in markers.items():
    omitted_marker_copy = copied_package(f"missing-qa-{row_id}")
    copied_quality_path = omitted_marker_copy / "references" / "quality-gates.md"
    copied_quality = copied_quality_path.read_text(encoding="utf-8")
    assert copied_quality.count(marker) == 1, f"QA-{row_id} marker must be unambiguous for mutation"
    copied_quality_path.write_text(copied_quality.replace(marker, "", 1), encoding="utf-8")
    assert_validator_rejects(omitted_marker_copy, f"missing QA-{row_id} bounded watchdog/budget marker")

# Mutation 3: an unimmutable handoff must not unlock a later phase.
mutable_handoff_copy = copied_package("mutable-handoff")
mutable_handoff_path = mutable_handoff_copy / "references" / "workflow-contract.json"
mutable_handoff_workflow = json.loads(mutable_handoff_path.read_text(encoding="utf-8"))
mutable_handoff_workflow["typed_handoffs"][0]["required_immutable"] = False
mutable_handoff_path.write_text(json.dumps(mutable_handoff_workflow, indent=2) + "\n", encoding="utf-8")
assert_validator_rejects(mutable_handoff_copy, "mutable phase handoff")

# Mutation 4: every P4 QA prerequisite must retain its direct typed handoff.
missing_handoff_copy = copied_package("missing-qa-handoff")
missing_handoff_path = missing_handoff_copy / "references" / "workflow-contract.json"
missing_handoff_workflow = json.loads(missing_handoff_path.read_text(encoding="utf-8"))
missing_handoff_workflow["typed_handoffs"] = [
    handoff
    for handoff in missing_handoff_workflow["typed_handoffs"]
    if not (
        handoff["from_phase"] == "P2"
        and handoff["to_phase"] == "P4"
        and handoff["artifact"] == "simulator_evidence"
    )
]
missing_handoff_path.write_text(json.dumps(missing_handoff_workflow, indent=2) + "\n", encoding="utf-8")
assert_validator_rejects(missing_handoff_copy, "missing direct QA simulator evidence handoff")

# Mutation 5: P5 must observe QA PASS, FAIL, and INCONCLUSIVE rather than hiding a veto state.
qa_status_copy = copied_package("missing-qa-terminal-status")
qa_status_path = qa_status_copy / "references" / "workflow-contract.json"
qa_status_workflow = json.loads(qa_status_path.read_text(encoding="utf-8"))
for handoff in qa_status_workflow["typed_handoffs"]:
    if handoff["from_phase"] == "P4" and handoff["to_phase"] == "P5" and handoff["artifact"] == "qa_verdict":
        handoff["accepted_statuses"] = ["PASS"]
        break
qa_status_path.write_text(json.dumps(qa_status_workflow, indent=2) + "\n", encoding="utf-8")
assert_validator_rejects(qa_status_copy, "hidden QA terminal status")

# Mutation 6: QA may not silently lose its required verification discipline.
qa_skill_copy = copied_package("qa-skill-removed")
qa_role_path = qa_skill_copy / "references" / "role-contracts.json"
qa_roles = json.loads(qa_role_path.read_text(encoding="utf-8"))
for role in qa_roles["roles"]:
    if role["name"] == "adversarial-qa-lead":
        role["required_skill"] = None
        break
qa_role_path.write_text(json.dumps(qa_roles, indent=2) + "\n", encoding="utf-8")
assert_validator_rejects(qa_skill_copy, "QA required_skill removal")

print("loop-termination regression assertions passed")
PY
