# Validation Playbook

Validate the harness itself before trusting it.

## Required checks

### 1. Trigger checks

Write:

- 3 to 5 prompts that should trigger the harness
- 3 to 5 prompts that should not

The goal is to verify description clarity, not just keyword presence.

### 2. With-skill vs baseline

Compare:

- a run where the harness guidance is loaded
- a run where the same task is attempted without the harness

Look for differences in topology clarity, ownership boundaries, and validation coverage.

### 3. Artifact completeness

The harness should define:

- agents
- skills
- orchestrator or coordination contract
- validation plan

If any of these are missing, the harness is incomplete.

### 4. Portability review

Ask whether the design still makes sense if you strip out vendor names. If the answer is no, the harness is too coupled to one runtime.

### 5. Collision review

For every concurrent lane, list the files or directories it owns. Any overlap should be justified or removed.

## Exit condition

The harness is ready when it is:

- clear enough to execute
- scoped enough to avoid collisions
- validated enough to compare against a baseline
- honest about native support vs adapter behavior
