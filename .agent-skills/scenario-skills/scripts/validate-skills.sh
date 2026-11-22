#!/usr/bin/env bash
# Spec validation with skills-ref (the Agent Skills reference validator).
# Validates every published skill, the same command CI runs. With
# SPEC_STAGED_ONLY=1 (the pre-commit hook) only skills with staged changes.
set -euo pipefail
cd "$(dirname "$0")/.."

SKILLS_REF="git+https://github.com/agentskills/agentskills.git#subdirectory=skills-ref"
# skills-ref needs Python 3.11 or later. uv downloads this version when it is missing, so the
# machine's default python never decides whether a commit passes. 3.12 matches CI's Python jobs.
SPEC_PYTHON=3.12

# Listed with a trailing slash; skill paths never hold spaces.
skill_dirs=$(node scripts/lib/skills.mjs)

if [ "${SPEC_STAGED_ONLY:-}" = "1" ]; then
  # Runs before the GIT_* variables are dropped: in a hook they name the index
  # being committed, a temporary one for `git commit <paths>`.
  staged=$(git diff --cached --name-only --diff-filter=d)
  nl=$'\n'
  selected=""
  for d in $skill_dirs; do
    case "$nl$staged" in
      *"$nl$d"*) selected="$selected $d" ;;
    esac
  done
  skill_dirs=$selected
  if [ -z "$skill_dirs" ]; then
    echo "validate-skills: no staged skill changes; CI validates every skill"
    exit 0
  fi
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "validate-skills: uv not found; install uv (https://docs.astral.sh/uv/) to run spec validation" >&2
  exit 1
fi

# One process for every skill: a uvx call per skill re-resolved the git source
# each time, about 0.5 s apiece. Output matches `skills-ref validate`.
validate_all='
import sys
from pathlib import Path

from skills_ref import validate

failed = False
for path in map(Path, sys.argv[1:]):
    errors = validate(path)
    if errors:
        failed = True
        print(f"Validation failed for {path}:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
    else:
        print(f"Valid skill: {path}")
sys.exit(1 if failed else 0)
'

# uv fetches the validator with its own git commands, and inside a commit hook
# these variables point at this repo, so uv's git would act on it instead.
# shellcheck disable=SC2086 # skill_dirs word-splits on purpose
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_PREFIX -u GIT_COMMON_DIR \
  -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES \
  uv run --quiet --no-project --python "$SPEC_PYTHON" --with "$SKILLS_REF" -- python -I -c "$validate_all" $skill_dirs
