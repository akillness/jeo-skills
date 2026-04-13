# Technical Documentation Quality Checklists

## Universal checklist
- The audience is explicit.
- The document tells the reader what decision or action it enables.
- Assumptions and unknowns are labeled.
- Terms are consistent with the codebase or operating environment.
- Related docs are linked instead of duplicated.

## Spec checklist
- Goals and non-goals are both present.
- Constraints are concrete.
- Risks and mitigations are named.
- Rollout and rollback are included when the change can ship.
- Open questions are separated from accepted decisions.

## Architecture doc checklist
- Component boundaries are clear.
- Interfaces / data flow are explained.
- Trade-offs and limits are named.
- Security / performance / operations notes are included only where relevant.
- The doc does not turn into a complete code walkthrough.

## ADR checklist
- Context explains why the decision matters now.
- Alternatives considered are real, not strawmen.
- Consequences include downsides.
- Status and date are recorded.
- Follow-up actions are explicit.

## Runbook checklist
- Preconditions and access requirements are listed first.
- Signals / symptoms are easy to scan.
- Immediate checks come before deep background.
- Recovery / rollback / escalation are explicit.
- The procedure is executable under time pressure.

## Migration checklist
- Scope and compatibility notes appear before the steps.
- Validation checkpoints exist.
- Rollback criteria are clear.
- Communication dependencies are named.
- Breaking changes are not hidden in footnotes.

## Internal guide checklist
- Ownership / boundary / when-to-use is stated early.
- Local or operational workflow is concrete.
- Common pitfalls are called out.
- Reader assumptions match engineer / maintainer skill level.
- It avoids end-user tutorial language unless intentionally linking outward.
