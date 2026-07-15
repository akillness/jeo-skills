#!/usr/bin/env bash
# Self-contained validator: Python 3 standard library only; no network or packages.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
fail() { printf 'validation failed: %s\n' "$*" >&2; exit 1; }
need_file() { [ -f "$ROOT/$1" ] || fail "missing $1"; }
need_text() { grep -Fq -- "$2" "$ROOT/$1" || fail "$1 lacks $2"; }

for f in SKILL.md references/role-contracts.json references/workflow-contract.json references/artifact-contract.md references/quality-gates.md references/runtime-adapters.md evals/trigger-cases.json SKILL.toon; do
  need_file "$f"
done

need_text SKILL.md "name: abyssal-game-studio"
need_text SKILL.md "description:"
need_text SKILL.md "allowed-tools:"
need_text SKILL.md "bmad-gds"
need_text SKILL.md "survey"
need_text SKILL.md "pm"
need_text SKILL.md "qa"
need_text SKILL.md ".harness/abyssal-game-studio/<run-id>/"
need_text SKILL.md "20"
need_text SKILL.md "P2W"
need_text SKILL.md "STOP-SHIP"
need_text SKILL.toon "N:abyssal-game-studio"
compact_p2_step="$(grep -F '4,Run P2 policy then systems,' "$ROOT/SKILL.toon" || true)"
[ -n "$compact_p2_step" ] || fail "SKILL.toon lacks P2 policy step"
need_compact_p2_text() {
  [[ "$compact_p2_step" == *"$1"* ]] || fail "SKILL.toon P2 lacks $1"
}
compact_policy_fragments=(
  "before purchase"
  "reject"
  "direct price"
  "contents"
  "functional impact"
  "region/tax/refund information"
  "fairness result"
  "P2W"
  "paid random rewards"
  "deceptive direct pricing"
  "unclear direct pricing"
  "hidden odds/acquisition conditions"
  "loss-targeted/loss-induced offers"
  "references/role-contracts.json"
  "typed source of truth"
)
for fragment in "${compact_policy_fragments[@]}"; do
  need_compact_p2_text "$fragment"
done

roles=(
  game-production-director
  game-trend-researcher
  player-experience-narrative-director
  product-monetization-pm
  systems-economy-designer
  game-engineering-lead
  adversarial-qa-lead
  live-operations-lead
)
headings=("## Core Responsibilities" "## Operational Principles" "## Input Protocol" "## Output Protocol" "## Error Handling" "## Team Communication")
count=0
for role in "${roles[@]}"; do
  file="templates/agents/$role.md"
  need_file "$file"
  need_text "$file" "name: $role"
  for heading in "${headings[@]}"; do need_text "$file" "$heading"; done
  count=$((count + 1))
done
[ "$(find "$ROOT/templates/agents" -type f -name '*.md' | wc -l | tr -d '[:space:]')" = "8" ] || fail "templates/agents must contain exactly eight markdown profiles"

need_text references/runtime-adapters.md "jeopi"
need_text references/runtime-adapters.md "jeo"
need_text references/runtime-adapters.md "Codex"
need_text references/runtime-adapters.md "Antigravity"
need_text references/runtime-adapters.md "GJC"
need_text references/runtime-adapters.md "Claude Code"
need_text references/runtime-adapters.md "common skill discovery"
need_text references/runtime-adapters.md "Do **not** claim native custom subagent spawning"
need_text references/runtime-adapters.md "file-backed sequential"

command -v python3 >/dev/null 2>&1 || fail "python3 standard-library runtime is required for JSON validation"
python3 - "$ROOT" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])

def die(message):
    raise SystemExit(f"validation failed: {message}")

def load(relative):
    try:
        return json.loads((root / relative).read_text(encoding="utf-8"))
    except Exception as error:
        die(f"invalid JSON {relative}: {error}")

def require(condition, message):
    if not condition:
        die(message)

def unique_strings(values, message):
    require(isinstance(values, list) and all(isinstance(value, str) and value for value in values), message)
    require(len(values) == len(set(values)), f"{message}: duplicate values")

roles_doc = load("references/role-contracts.json")
workflow = load("references/workflow-contract.json")
evals = load("evals/trigger-cases.json")

require(
    roles_doc.get("schema_version") == "2.1" and roles_doc.get("source_of_truth") == "typed_role_governance",
    "role contract schema/version",
)
roles = roles_doc.get("roles")
require(isinstance(roles, list) and len(roles) == 8, "role contract must define exactly eight roles")
role_by_name = {}
for role in roles:
    require(isinstance(role, dict), "role contract entries must be objects")
    expected_keys = {"name", "owns", "prohibitions", "inputs", "outputs", "veto", "required_skill"}
    require(set(role) == expected_keys, f"role contract keys for {role.get('name')}")
    name = role.get("name")
    require(isinstance(name, str) and name not in role_by_name, "role names must be unique")
    unique_strings(role["owns"], f"{name} owns")
    unique_strings(role["inputs"], f"{name} inputs")
    unique_strings(role["outputs"], f"{name} outputs")
    require(isinstance(role["prohibitions"], dict) and role["prohibitions"], f"{name} prohibitions")
    require(all(value is False for value in role["prohibitions"].values()), f"{name} prohibition must be false")
    require(role["veto"] in {"none", "FAIL", "STOP-SHIP"}, f"{name} veto")
    require(role["required_skill"] is None or isinstance(role["required_skill"], str), f"{name} required skill")
    role_by_name[name] = role

expected_role_names = {
    "game-production-director",
    "game-trend-researcher",
    "player-experience-narrative-director",
    "product-monetization-pm",
    "systems-economy-designer",
    "game-engineering-lead",
    "adversarial-qa-lead",
    "live-operations-lead",
}
require(set(role_by_name) == expected_role_names, "canonical role set")
require(role_by_name["game-trend-researcher"]["required_skill"] == "survey", "trend researcher must require survey")
require(role_by_name["product-monetization-pm"]["required_skill"] == "pm", "PM must require pm")
require(role_by_name["adversarial-qa-lead"]["required_skill"] == "qa", "QA must require qa")
require(role_by_name["adversarial-qa-lead"]["veto"] == "FAIL", "QA veto")
require(role_by_name["live-operations-lead"]["veto"] == "STOP-SHIP", "operations veto")
require("operations_draft" in role_by_name["live-operations-lead"]["outputs"], "operations owns P3 draft")
qa_role = role_by_name["adversarial-qa-lead"]
qa_required_inputs = {"economy_ledger", "balance_model", "simulator_evidence", "narrative_rule_traceability"}
require(qa_required_inputs <= set(qa_role["inputs"]), "QA must consume quantitative and narrative proof")
require("qa_cases_01_20" in qa_role["outputs"], "QA must publish bounded case evidence")

require(
    workflow.get("schema_version") == "2.1" and workflow.get("source_of_truth") == "typed_workflow_governance",
    "workflow schema/version",
)
require(workflow.get("run_root") == "<repo-root>/.harness/abyssal-game-studio/<run-id>/", "workflow run root")
require(workflow.get("immutability") == {"new_version_required": True, "append_only_decision_log": True}, "workflow immutability")
phases = workflow.get("phases")
require(isinstance(phases, list) and len(phases) == 6, "workflow must define P0-P5")
phase_by_id = {}
phase_keys = {"id", "depends_on", "requires", "outputs", "parallel_tasks", "sequence"}
for phase in phases:
    require(isinstance(phase, dict) and set(phase) == phase_keys, "phase schema")
    phase_id = phase.get("id")
    require(isinstance(phase_id, str) and phase_id not in phase_by_id, "phase IDs must be unique")
    for field in ("depends_on", "requires", "outputs", "parallel_tasks", "sequence"):
        unique_strings(phase[field], f"{phase_id} {field}")
    phase_by_id[phase_id] = phase
require(list(phase_by_id) == ["P0", "P1", "P2", "P3", "P4", "P5"], "phase order")
require(phase_by_id["P0"]["depends_on"] == [], "P0 must be the root")
for index, phase_id in enumerate(("P1", "P2", "P3", "P4", "P5"), start=1):
    require(phase_by_id[phase_id]["depends_on"] == [f"P{index - 1}"], f"{phase_id} dependency")
require(phase_by_id["P3"]["parallel_tasks"] == [], "P3 must sequence engineering then operations draft")
require(
    phase_by_id["P3"]["sequence"] == ["validate_engine_agnostic_implementation", "produce_operations_draft"],
    "P3 production sequence",
)
require("operations_draft" in phase_by_id["P3"]["outputs"], "P3 operations draft output")
require("operations_draft" in phase_by_id["P4"]["requires"], "P4 operations draft requirement")
require("release_readiness" in phase_by_id["P5"]["outputs"], "P5 release readiness output")
require(phase_by_id["P4"]["outputs"] == qa_role["outputs"], "P4 outputs must match QA role contract")
require("release_readiness" not in phase_by_id["P3"]["outputs"], "P3 cannot produce final readiness")

allowed_handoff_statuses = {"evidence-ready"}
qa_terminal_statuses = {"PASS", "FAIL", "INCONCLUSIVE"}
handoffs = workflow.get("typed_handoffs")
require(isinstance(handoffs, list) and handoffs, "typed handoffs")
observed_edges = set()
phase_order = {phase["id"]: index for index, phase in enumerate(phases)}
for handoff in handoffs:
    require(isinstance(handoff, dict), "handoff schema")
    allowed_keys = {"from_phase", "to_phase", "artifact", "required_status", "accepted_statuses", "required_immutable", "minimum_comparables"}
    required_keys = {"from_phase", "to_phase", "artifact", "required_immutable"}
    require(set(handoff) <= allowed_keys and required_keys <= set(handoff), "handoff keys")
    has_required_status = "required_status" in handoff
    has_accepted_statuses = "accepted_statuses" in handoff
    require(has_required_status ^ has_accepted_statuses, "handoff must declare one status policy")
    source_id, target_id, artifact = handoff["from_phase"], handoff["to_phase"], handoff["artifact"]
    require(source_id in phase_by_id and target_id in phase_by_id and source_id != target_id, "handoff phases")
    require(phase_order[source_id] < phase_order[target_id], "handoff must move forward through phases")
    require(artifact in phase_by_id[source_id]["outputs"], f"{source_id} must output {artifact}")
    require(artifact in phase_by_id[target_id]["requires"], f"{target_id} must require {artifact}")
    require(handoff["required_immutable"] is True, f"{artifact} handoff must require immutable publication")
    if has_required_status:
        require(handoff["required_status"] in allowed_handoff_statuses, f"{artifact} handoff status")
    else:
        accepted_statuses = handoff["accepted_statuses"]
        require(
            source_id == "P4" and target_id == "P5" and artifact == "qa_verdict"
            and isinstance(accepted_statuses, list) and set(accepted_statuses) == qa_terminal_statuses,
            "only P4 QA verdict may carry terminal status alternatives",
        )
    if "minimum_comparables" in handoff:
        require(artifact == "survey_decision_packet" and handoff["minimum_comparables"] == 6, "survey comparable handoff")
    observed_edges.add((source_id, target_id, artifact))

required_handoff_count = sum(len(phase["requires"]) for phase in phases if phase["id"] != "P0")
require(len(handoffs) == required_handoff_count == len(observed_edges), "every non-P0 requirement has one typed handoff")
for target_id, phase in phase_by_id.items():
    if target_id == "P0":
        continue
    for artifact in phase["requires"]:
        matches = [edge for edge in observed_edges if edge[1] == target_id and edge[2] == artifact]
        require(len(matches) == 1, f"{target_id} requirement {artifact} must have exactly one direct typed handoff")

require(
    workflow.get("completion") == {
        "requires_all": ["qa_pass", "ops_ready"],
        "blocks_on": ["qa_fail", "ops_stop_ship"],
        "terminal_state": "COMPLETE",
        "veto_override_allowed": False,
    },
    "workflow completion policy",
)
reentry = workflow.get("reentry")
require(isinstance(reentry, dict), "workflow reentry schema")
require(reentry.get("evidence_sources") == ["qa_fail", "ops_stop_ship"], "reentry evidence sources")
require(reentry.get("max_cycles") == 2 and reentry.get("counter") == "monotonic_reentry_cycle", "finite reentry budget")
require(reentry.get("restart_phase") == "P3", "reentry must restart engineering and operations")
require(reentry.get("required_downstream_revalidation") == ["P3", "P4", "P5"], "reentry downstream revalidation")
require(
    reentry.get("cycle") == [
        "evidence_record",
        "director_single_owner_scope",
        "new_immutable_artifact",
        "downstream_contract_revalidation",
        "qa_regression",
        "operations_reassessment",
    ],
    "reentry sequence",
)
require(reentry.get("terminal_states") == ["MILESTONE_CLOSED"], "reentry terminal state")
require(reentry.get("on_exhausted") == "MILESTONE_CLOSED", "reentry exhaustion state")
require(reentry.get("automatic_restart_allowed") is False, "automatic restart prohibition")
require(reentry.get("requires_external_authorization") is True, "external authorization requirement")
require(reentry.get("requires_materially_changed_intake_constraints_fingerprint") is True, "material change requirement")
require(
    reentry.get("later_run_requires") == ["external_request_id", "new_run_id", "materially_changed_intake_or_constraints_fingerprint"],
    "later run prerequisites",
)
require(reentry.get("rejects") == ["same_run_continuation", "same_fingerprint_restart"], "reentry rejection policy")

quality = (root / "references/quality-gates.md").read_text(encoding="utf-8")
required_policy = (
    "P2W, paid random rewards, deceptive pricing, unclear direct pricing, hidden odds or acquisition "
    "conditions, and loss-targeted or loss-induced offers are prohibited; every sale has a visible direct "
    "price and contents before purchase."
)
require(required_policy in quality, "complete monetization policy")
heading = "## Mandatory 20-case adversarial QA"
try:
    qa_section = quality.split(heading, 1)[1].split("\n## ", 1)[0]
except IndexError:
    die("QA matrix section")
table_lines = [line for line in qa_section.splitlines() if line.startswith("|")]
require(len(table_lines) == 22, "QA matrix row count")
def parse_table_row(line):
    require(line.endswith("|"), "QA matrix table shape")
    cells = [cell.strip() for cell in line[1:-1].split("|")]
    require(len(cells) == 6 and all(cells), "QA matrix cell shape")
    return tuple(cells)
require(parse_table_row(table_lines[0]) == ("#", "Archetype", "Attack family", "Stimulus", "Required evidence", "Pass condition"), "QA matrix header")
require(table_lines[1] == "|---:|---|---|---|---|---|", "QA matrix separator")
qa_rows = [parse_table_row(line) for line in table_lines[2:]]
require([row[0] for row in qa_rows] == [f"{index:02d}" for index in range(1, 21)], "QA matrix row identities")
require(len({row[0] for row in qa_rows}) == 20, "QA matrix duplicate identities")
require({row[1] for row in qa_rows} == {"A1", "A2", "A3", "A4", "A5", "A6", "A7"}, "QA archetype coverage")
for row_id, marker in {
    "03": "QA-03 bounded watchdog: replan count limit 500 and simulated-tick budget 18000",
    "06": "QA-06 bounded watchdog: iteration count limit 10000 and defined resource-state coverage limit 12",
    "18": "QA-18 bounded watchdog: iteration count limit 300 and simulated-tick budget 900",
}.items():
    require(quality.count(marker) == 1, f"{row_id} finite watchdog marker")
require("The listed figures are absolute upper bounds." in quality, "watchdog upper-bound contract")
require("may set a stricter lower bound" in quality, "run-specific watchdog contract")

cases = evals.get("cases")
require(evals.get("skill") == "abyssal-game-studio" and isinstance(cases, list) and len(cases) == 20, "evaluation case count/skill")
expected_ids = [f"positive-{i:02d}" for i in range(1, 11)] + [f"negative-{i:02d}" for i in range(1, 11)]
require([case.get("id") for case in cases] == expected_ids, "canonical evaluation identities")
for index, case in enumerate(cases):
    require(case.get("should_trigger") is (index < 10), f"evaluation polarity {case.get('id')}")
    require(isinstance(case.get("prompt"), str) and case["prompt"].strip(), f"evaluation prompt {case.get('id')}")
    require(isinstance(case.get("expectation"), str) and case["expectation"].strip(), f"evaluation expectation {case.get('id')}")
PY

printf 'abyssal-game-studio: validated frontmatter, 8 roles, typed contracts, 20 QA gates, runtime boundaries, and 20 trigger cases\n'
