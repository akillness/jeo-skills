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
import sys
from pathlib import Path

root = Path(sys.argv[1])

def die(message):
    raise SystemExit(f"validation failed: {message}")

def load(relative):
    try:
        return json.loads((root / relative).read_text())
    except Exception as error:
        die(f"invalid JSON {relative}: {error}")

def same_json(actual, expected):
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(
            same_json(actual[key], value) for key, value in expected.items()
        )
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(
            same_json(value, expected[index]) for index, value in enumerate(actual)
        )
    return type(actual) is type(expected) and actual == expected

roles_doc = load("references/role-contracts.json")
workflow = load("references/workflow-contract.json")
evals = load("evals/trigger-cases.json")

expected_roles = [
    {"name":"game-production-director","owns":["production_pipeline","milestone_brief","decision_log","ownership_register","bounded_reentry"],"prohibitions":{"may_author_game_design":False,"may_author_code":False,"may_modify_qa":False,"may_author_commercial_policy":False,"may_override_veto":False},"inputs":["raw_intake","constraints","phase_artifacts","qa_verdict","ops_release_readiness"],"outputs":["production_brief","task_manifest","research_question","player_fantasy","product_constraints","systems_goals","technical_constraints","milestone_brief","decision_log","ownership_register","reentry_order"],"veto":"none","required_skill":None},
    {"name":"game-trend-researcher","owns":["survey_execution","market_research","source_provenance","comparables_catalog","claim_confidence"],"prohibitions":{"may_commit_features":False,"may_commit_pricing":False,"may_commit_release_scope":False,"may_make_unsourced_trend_claims":False},"inputs":["research_question","research_reuse_decision","survey_package"],"outputs":["survey_decision_packet","comparables_table","claim_traceability","research_blocked"],"veto":"none","required_skill":"survey"},
    {"name":"player-experience-narrative-director","owns":["world_bible","narrative_rule_consistency","interaction_map","visual_readability","accessibility"],"prohibitions":{"may_author_economy_values":False,"may_author_code":False,"may_author_pricing":False,"may_issue_qa_verdict":False},"inputs":["player_fantasy","optional_research_context","systems_rule_contract"],"outputs":["world_bible","interaction_map","readability_accessibility_spec","narrative_rule_traceability"],"veto":"none","required_skill":None},
    {"name":"product-monetization-pm","owns":["player_segments","direct_price_catalog","monetization_policy","value_metrics"],"prohibitions":{"allows_p2w":False,"allows_paid_random_rewards":False,"allows_deceptive_pricing":False,"allows_unclear_direct_pricing":False,"allows_hidden_odds_or_acquisition_conditions":False,"allows_loss_targeted_offers":False,"allows_loss_induced_offers":False,"allows_sale_missing_direct_price":False,"allows_sale_missing_contents":False,"allows_sale_missing_functional_impact":False,"allows_sale_missing_region_tax_refund_information":False,"allows_sale_missing_fairness_result":False,"may_author_combat_balance":False,"may_issue_qa_verdict":False},"inputs":["evidence_ready_survey","product_constraints","world_bible"],"outputs":["segments_jtbd","value_pricing_catalog","monetization_policy","metrics_contract"],"veto":"none","required_skill":"pm"},
    {"name":"systems-economy-designer","owns":["rpg_rts_rule_contract","p50_p90_progression","economy_source_sink","balance_model","counterplay","simulator_evidence"],"prohibitions":{"may_author_pricing":False,"may_allow_p2w_exception":False,"may_author_engine_implementation":False,"may_issue_qa_verdict":False},"inputs":["systems_goals","survey_decision_packet","immutable_monetization_policy"],"outputs":["rule_contract","economy_ledger","balance_model","simulator_evidence"],"veto":"none","required_skill":None},
    {"name":"game-engineering-lead","owns":["deterministic_replay","performance_budget","memory_budget","input_contract","pathing_contract","risky_tech_validation","engine_agnostic_architecture"],"prohibitions":{"may_change_rule_values":False,"may_change_commercial_policy":False,"may_set_qa_severity":False,"may_issue_qa_verdict":False,"may_force_engine_selection":False},"inputs":["immutable_rule_contract","immutable_interaction_map","technical_constraints"],"outputs":["architecture_contract","determinism_replay_contract","performance_evidence","risky_tech_validation"],"veto":"none","required_skill":None},
    {"name":"adversarial-qa-lead","owns":["adversarial_qa_20_iterations","seven_archetype_red_team","defect_severity","qa_verdict","regression_matrix"],"prohibitions":{"may_fix_defects":False,"may_waive_defects":False,"may_relax_gates":False,"may_change_schedule":False,"may_override_own_verdict":False},"inputs":["milestone_brief","immutable_rule_contract","experience_specifications","engineering_evidence","immutable_monetization_policy","quality_gates"],"outputs":["qa_iterations_01_20","defect_register","regression_matrix","qa_verdict"],"veto":"FAIL","required_skill":None},
    {"name":"live-operations-lead","owns":["telemetry_contract","release_readiness","rollback_runbook","feedback_intake","operations_stop_ship"],"prohibitions":{"may_override_qa":False,"may_clear_qa_fail":False,"may_direct_price_economy_changes":False,"may_approve_unverified_rollback":False},"inputs":["metrics_contract","qa_verdict","performance_evidence"],"outputs":["telemetry_contract","release_readiness","rollback_runbook","feedback_intake"],"veto":"STOP-SHIP","required_skill":None},
]
expected_roles_doc = {
    "schema_version": "2.0",
    "source_of_truth": "typed_role_governance",
    "roles": expected_roles,
}
if not same_json(roles_doc, expected_roles_doc):
    die("closed role contract schema/content")

expected_phases = [
    {"id":"P0","depends_on":[],"requires":["raw_intake","constraints"],"outputs":["production_brief","task_manifest","research_question","player_fantasy","product_constraints","systems_goals","technical_constraints"],"parallel_tasks":[],"sequence":["derive_production_brief","derive_task_manifest","derive_research_question","derive_player_fantasy","derive_product_constraints","derive_systems_goals","derive_technical_constraints"]},
    {"id":"P1","depends_on":["P0"],"requires":["production_brief","task_manifest","research_question","player_fantasy"],"outputs":["survey_decision_packet","comparables_table","claim_traceability","world_bible","interaction_map","readability_accessibility_spec"],"parallel_tasks":["survey","experience"],"sequence":["fan_out_survey_experience"]},
    {"id":"P2","depends_on":["P1"],"requires":["evidence_ready_survey","product_constraints","systems_goals","world_bible"],"outputs":["segments_jtbd","value_pricing_catalog","monetization_policy","metrics_contract","rule_contract","economy_ledger","balance_model","simulator_evidence","narrative_rule_traceability"],"parallel_tasks":[],"sequence":["evidence_ready_survey_before_pm","immutable_pm_policy_before_systems","systems_rule_contract_before_narrative_traceability"]},
    {"id":"P3","depends_on":["P2"],"requires":["immutable_rule_contract","immutable_interaction_map","technical_constraints"],"outputs":["architecture_contract","determinism_replay_contract","performance_evidence","risky_tech_validation"],"parallel_tasks":[],"sequence":["validate_engine_agnostic_implementation"]},
    {"id":"P4","depends_on":["P3"],"requires":["engineering_evidence","immutable_rule_contract","experience_specifications","immutable_monetization_policy"],"outputs":["qa_iterations_01_20","defect_register","regression_matrix","qa_verdict"],"parallel_tasks":[],"sequence":["execute_adversarial_qa"]},
    {"id":"P5","depends_on":["P4"],"requires":["qa_verdict","metrics_contract","performance_evidence"],"outputs":["telemetry_contract","rollback_runbook","release_readiness","feedback_intake"],"parallel_tasks":[],"sequence":["produce_telemetry_contract","produce_rollback_runbook","verify_release_readiness"]},
]
expected_workflow = {
    "schema_version": "2.0",
    "source_of_truth": "typed_workflow_governance",
    "run_root": "<repo-root>/.harness/abyssal-game-studio/<run-id>/",
    "immutability": {"new_version_required": True, "append_only_decision_log": True},
    "phases": expected_phases,
    "completion": {"requires_all":["qa_pass","ops_ready"],"blocks_on":["qa_fail","ops_stop_ship"],"veto_override_allowed":False},
    "reentry": {"opens_only_after":"qa_verdict","max_cycles":2,"cycle":["qa_defect_evidence","director_single_owner_scope","new_immutable_artifact","qa_regression","operations_reassessment"],"on_exhausted":"close_milestone_start_new_run"},
}
if not same_json(workflow, expected_workflow):
    die("closed workflow contract schema/content")

quality = (root / "references/quality-gates.md").read_text()
required_policy = (
    "P2W, paid random rewards, deceptive pricing, unclear direct pricing, hidden odds or acquisition "
    "conditions, and loss-targeted or loss-induced offers are prohibited; every sale has a visible direct "
    "price and contents before purchase."
)
if required_policy not in quality:
    die("complete monetization policy")

heading = "## Mandatory 20-loop adversarial QA"
try:
    qa_section = quality.split(heading, 1)[1].split("\n## ", 1)[0]
except IndexError:
    die("QA matrix section")

table_lines = [line for line in qa_section.splitlines() if line.startswith("|")]
if len(table_lines) != 22:
    die("QA matrix row count")

def parse_table_row(line):
    if not line.endswith("|"):
        die("QA matrix table shape")
    cells = [cell.strip() for cell in line[1:-1].split("|")]
    if len(cells) != 6 or any(not cell for cell in cells):
        die("QA matrix cell shape")
    return tuple(cells)

if parse_table_row(table_lines[0]) != ("#", "Archetype", "Attack family", "Stimulus", "Required evidence", "Pass condition"):
    die("QA matrix header")
if table_lines[1] != "|---:|---|---|---|---|---|":
    die("QA matrix separator")
qa_rows = [parse_table_row(line) for line in table_lines[2:]]
expected_qa_rows = [
    ("01","A2","Deterministic replay divergence","Replay identical seed and command stream 100 times","100 state hashes, first divergent tick, rule/build version","All intermediate and final hashes match"),
    ("02","A2","Command flood and concurrent input","Inject select/move/attack/skill/cancel repeatedly in one second","input timeline, queue length, lost/duplicate command log","Only intended priority executes; no loss"),
    ("03","A2","Chokepoint pathing deadlock","Collide factions, summons, and retreat commands on a narrow bridge","path graph, replans, deadlock video/log","No infinite replan, clipping, or isolation"),
    ("04","A1","Core-command recovery without tutorial","Recover after first-fight bad target, camera, or selection","capture, inputs, help/feedback signal","Recovery signal exists within three steps"),
    ("05","A3","Early hero growth spike","Compare minimum and maximum efficiency economy routes at same battle point","growth curve, resource ledger, win-rate/TTK simulation","No out-of-range power spike"),
    ("06","A4","Unlimited-growth accumulation exploit","Repeat low-risk farming, duplication, or loop to maximum repeat","repeat count, growth/cost curve, saved state","Cost/exposure/diminishing return or counterplay works"),
    ("07","A4","Counterplay closure","Apply each matchup response to highest-growth configuration","response sets, outcomes, replay","At least one accessible response exists"),
    ("08","A3","Source/sink circulation collapse","Simulate 30/60/90 minute economy and extreme saving","faucet/sink ledger, distribution, inflation trend","No infinite accumulation or required-resource starvation"),
    ("09","A1","p50 progression friction","Measure target-entry time with representative mid-skill input distribution","p50 sample definition, distribution, time/failure causes","Declared p50 window holds"),
    ("10","A3","p90 progression and grind pressure","Measure top-decile optimized route and long sessions","p90 distribution, session length, repeated-action ratio","p90 does not collapse economy or content"),
    ("11","A6","P2W functional-impact intrusion","Map every catalog SKU to combat/economy state","SKU table, functional diff, policy ID","Zero competitive advantage or resource acceleration sales"),
    ("12","A6","Deceptive or unclear direct-price transparency","Inspect pre-purchase screens across region/platform/discount entry","captures, contents, tax/region disclosure","Price and contents match before purchase"),
    ("13","A6","Paid-random-reward or hidden acquisition-condition bypass","Search shop, bundle, season, reward paths for odds/key/draw or undisclosed acquisition conditions","all sales/reward flow map, odds/acquisition conditions, payment conditions","Zero paid random acquisition paths or hidden odds/acquisition conditions"),
    ("14","A6","Loss-targeted or loss-induced offer","Capture UI after repeated/narrow losses, scarcity, or loss-induced recovery prompts","event timeline, offer conditions, video","Zero loss-state-targeted or loss-induced offers"),
    ("15","A7","VFX/animation combat readability","Test similar colors, multiple ultimates, crowded fight","frames, signal list, observer reading","Threat, range, and outcome distinguishable"),
    ("16","A5","Accessibility breakage","Use color filters, photosensitivity, captions, remap, no-audio","settings, before/after captures, keyboard/controller log","Equivalent core signals and control remain"),
    ("17","A7","Narrative-rule contradiction","Cross-check world claims against hero and growth rules","narrative-rule trace, conflict IDs, scene evidence","Zero unexplained contradiction"),
    ("18","A2","Peak combat performance and memory","Repeat max units/projectiles/VFX/path requests","p50/p95 frame, memory/allocations, input latency, environment","Within budget; no cumulative leak"),
    ("19","A3","Live economy and telemetry manipulation","Simulate duplicate event reward, offline reconnect, version mix","event IDs, idempotency logs, metric partition results","No double grant, polluted aggregate, or fairness drift"),
    ("20","A1","Rollback and feedback safety","Rehearse release stop, rollback, feedback classification after Critical signal","stop-ship record, rollback timeline, data retention, feedback link","QA/ops veto works and recovery path verified"),
]
if [row[0] for row in qa_rows] != [f"{index:02d}" for index in range(1, 21)]:
    die("QA matrix row identities")
if len({row[0] for row in qa_rows}) != 20:
    die("QA matrix duplicate identities")
if qa_rows != expected_qa_rows:
    die("QA matrix archetype/attack contract")
if {row[2] for row in qa_rows} != {row[2] for row in expected_qa_rows}:
    die("QA attack-family coverage")

cases = evals.get("cases")
if evals.get("skill") != "abyssal-game-studio" or not isinstance(cases, list) or len(cases) != 20:
    die("evaluation case count/skill")
expected_ids = [f"positive-{i:02d}" for i in range(1, 11)] + [f"negative-{i:02d}" for i in range(1, 11)]
if [case.get("id") for case in cases] != expected_ids:
    die("canonical evaluation identities")
for index, case in enumerate(cases):
    if case.get("should_trigger") is not (index < 10):
        die(f"evaluation polarity {case.get('id')}")
    if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
        die(f"evaluation prompt {case.get('id')}")
    if not isinstance(case.get("expectation"), str) or not case["expectation"].strip():
        die(f"evaluation expectation {case.get('id')}")
PY

printf 'abyssal-game-studio: validated frontmatter, 8 roles, typed contracts, 20 QA gates, runtime boundaries, and 20 trigger cases\n'
