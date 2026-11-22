#!/usr/bin/env bash
# Checks supporting files shipped next to a SKILL.md:
# - every supporting file is linked from its SKILL.md with a markdown link
#   (agents resolve file references one level deep, so unlinked files are dead weight)
# - shell scripts have a shebang and pass a bash syntax check
# - python scripts parse
# A skill's own README.md is exempt from the link rule: it documents the skill
# for the agents and humans working ON the skill, not for the agent running it,
# so linking it would spend body words and invite a runtime agent to read
# maintainer notes as instructions.
# In an expert tool, a link to a subfolder such as scripts/AgentKit/ also
# covers the files under it: those skills ship code trees (Unity C# kits,
# shader sets) that the agent copies into a project whole.
# Only files git knows about (tracked or staged) are checked, so untracked
# junk like .DS_Store or editor swap files never blocks a commit.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

expert_dirs=" $(node scripts/lib/skills.mjs --expert | tr '\n' ' ') "

# True when SKILL.md links a subfolder (never scripts/ or references/ itself)
# that holds the file.
folder_linked() {
  local skill=$1 dir=${2%/*}
  while case "$dir" in */*) true ;; *) false ;; esac do
    grep -qF "](${dir}/)" "${skill}SKILL.md" && return 0
    dir=${dir%/*}
  done
  return 1
}

# Family folders of the expert tools hold skill folders and one README.md.
node scripts/lib/skills.mjs --check || fail=1

while IFS= read -r skill; do
  while IFS= read -r -d '' file; do
    [ "$file" = "${skill}SKILL.md" ] && continue
    rel=${file#"$skill"}

    # Require a markdown link target, "](rel" or "](./rel", so an unrelated
    # path that merely contains rel as a substring does not count as a link.
    # The skill's own README.md is maintainer documentation, so it is exempt.
    if [ "$rel" != "README.md" ] &&
      ! grep -qF "](${rel}" "${skill}SKILL.md" &&
      ! grep -qF "](./${rel}" "${skill}SKILL.md" &&
      ! { case "$expert_dirs" in *" $skill "*) true ;; *) false ;; esac && folder_linked "$skill" "$rel"; }; then
      echo "$file: not linked from ${skill}SKILL.md (expected a markdown link like [...](${rel}))"
      fail=1
    fi

    case "$file" in
      *.sh)
        head -1 "$file" | grep -q '^#!' || {
          echo "$file: missing shebang"
          fail=1
        }
        bash -n "$file" || {
          echo "$file: bash syntax check failed"
          fail=1
        }
        ;;
      *.py)
        python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read())' "$file" || {
          echo "$file: python syntax check failed"
          fail=1
        }
        ;;
    esac
  done < <(git ls-files -z -- "$skill")
done < <(node scripts/lib/skills.mjs)

exit $fail
