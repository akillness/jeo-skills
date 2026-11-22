#!/usr/bin/env bash
# House style checks, shared by CI and the pre-commit hook.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# Every skill's SKILL.md, core and expert tools alike (scripts/lib/skills.mjs).
# Skill paths never hold spaces, so the list word-splits safely.
skill_files=$(node scripts/lib/skills.mjs | sed 's|$|SKILL.md|')

# Reporting helper for the em-dash rule. Every rule prints its diagnosis before
# its evidence, and the evidence has to name the offending character: a raw
# grep line that begins with a "- " list bullet reads like the bullet was the
# match, which is how a real em dash on a bulleted line got misdiagnosed as a
# false positive. So each hit is re-emitted as path:line:column with every em
# dash wrapped in >>> <<<.
#
# LC_ALL=C pins awk to byte semantics, so the column is the same number on BSD
# and GNU awk regardless of the caller's locale (an em dash is 3 UTF-8 bytes,
# and a UTF-8-aware awk would otherwise count it as one character). Text before
# an em dash is ASCII in practice, so the byte column is also the character
# column there.
#
# index()/substr() walk the line instead of gsub() so the em dash is matched
# literally, never as a regular expression.
annotate_em_dashes() {
  printf '%s\n' "$1" | LC_ALL=C awk -v dash='—' -v mark_open='>>>' -v mark_close='<<<' '
    {
      text = $0
      prefix = ""
      # Split off grep -n decoration ("path:line:") so the column counts from
      # the start of the file line, not from the start of grep output.
      if (match(text, /^[^:]+:[0-9]+:/)) {
        prefix = substr(text, 1, RLENGTH)
        text = substr(text, RLENGTH + 1)
      }
      out = ""
      rest = text
      column = 0
      consumed = 0
      while ((i = index(rest, dash)) > 0) {
        if (column == 0) {
          column = consumed + i
        }
        out = out substr(rest, 1, i - 1) mark_open dash mark_close
        consumed = consumed + i + length(dash) - 1
        rest = substr(rest, i + length(dash))
      }
      # A path that itself holds a colon cannot be split from grep decoration
      # reliably, so drop the column rather than print one counted from the
      # wrong place. The marker still shows which character failed.
      if (prefix == "") {
        printf "  %s\n", out rest
      } else {
        printf "  %s%d: %s\n", prefix, column, out rest
      }
    }
  '
}

# GNU grep exits 2 on any error (e.g. a missing path) even when matches were
# found, so treat 0 as "violations found" and >=2 as a loud config failure
# instead of letting either case pass silently.
grep_status=0
# CODE_OF_CONDUCT.md is excluded on purpose: it is the published Contributor
# Covenant text kept byte-identical to its source, like the vendored dev skills.
# tests/ is searched for the evidence READMEs that skills link as review records.
em_dash_hits=$(grep -rn --include='*.md' -e '—' skills README.md INSTALL.md AGENTS.md REVIEW.md CONTRIBUTING.md SECURITY.md SUPPORT.md docs tests .github .claude/commands .claude/agents) || grep_status=$?
if [ "$grep_status" -eq 0 ]; then
  echo 'Em dashes are forbidden (house style). Each hit below is path:line:column (column counts from 1) with the offending em dash (U+2014) wrapped in >>> <<<; a leading "- " list bullet is an ASCII hyphen, never the match.'
  annotate_em_dashes "$em_dash_hits"
  fail=1
elif [ "$grep_status" -ge 2 ]; then
  echo "check-style: grep failed (exit $grep_status); a checked path is probably missing"
  # grep can both error and match, so show whatever it did find, still marked up.
  if [ -n "$em_dash_hits" ]; then
    echo 'Em dashes found before that failure, as path:line:column with the em dash (U+2014) wrapped in >>> <<<:'
    annotate_em_dashes "$em_dash_hits"
  fi
  fail=1
fi

# MCP is the surface a skill teaches (AGENTS.md, "Authoring contract"), so skill
# documentation should not hand an agent the official SDK in place of a tool it
# could call itself. Scripts are free to use the SDK, so a hit here is a notice
# for review to weigh and never a failure: it asks whether the mention describes
# a script or teaches the agent's own route. The pattern is case insensitive, so
# it already covers the SCENARIO_SDK_API_KEY and _SECRET environment variables.
grep_status=0
sdk_hits=$(grep -rniE --include='*.md' -e 'scenario[-_]sdk' skills) || grep_status=$?
if [ "$grep_status" -eq 0 ]; then
  echo 'Notice (not a failure): skill documentation mentions the Scenario SDK. Confirm it describes a script rather than the route an agent takes at runtime, per AGENTS.md "Authoring contract". Mentions found:'
  printf '%s\n' "$sdk_hits" | sed 's/^/  /'
elif [ "$grep_status" -ge 2 ]; then
  echo "check-style: grep failed (exit $grep_status); a checked path is probably missing"
  fail=1
fi

# An installed skill must not tell an agent to install this repository: an
# unversioned installer resolves a mutable package and revision, and scanners
# read it as an untrusted source. Siblings load through skill_get instead.
# Family READMEs sit outside every skill folder, so no install ships them.
grep_status=0
install_hits=$(grep -rnE -e 'skills(@[^ ]*)? add +scenario-labs/skills' skills) || grep_status=$?
if [ "$grep_status" -ge 2 ]; then
  echo "check-style: grep failed (exit $grep_status); a checked path is probably missing"
  fail=1
fi
install_hits=$(printf '%s\n' "$install_hits" | grep -vE '^skills/(dcc|game-engines)/[^/]+/README\.md:' | grep . || true)
if [ -n "$install_hits" ]; then
  echo 'Skill files must not carry an install command for this repository; point to skill_get or ask the user, per AGENTS.md "Scope and surface". Found:'
  printf '%s\n' "$install_hits" | sed 's/^/  /'
  fail=1
fi

# 1000-word target, 2500-word hard cap; AGENTS.md "Authoring contract" carries
# the why. The notice exists because two PRs that each pass can break main
# together: #320 and #321 took skills/scenario/SKILL.md to 2548 words.
word_cap=2500
word_notice_at=2400
near_cap_hits=""

for f in $skill_files; do
  # Prettier single-quotes a description that itself holds double quotes.
  grep -Eq "^description: [\"']?Use when" "$f" || {
    echo "$f: description must start with \"Use when\""
    fail=1
  }

  # Body is everything after the closing frontmatter ---.
  # The locale is pinned so a local count equals CI's: under LC_ALL=C, GNU wc
  # skips a word made only of non-ASCII bytes (a lone arrow), and BSD wc does not.
  body=$(awk 'BEGIN { fm = 0 } /^---$/ { fm++; next } fm >= 2 { print }' "$f")
  words=$(printf '%s\n' "$body" | LC_ALL=C.UTF-8 wc -w | tr -d ' ')
  if [ "$words" -gt "$word_cap" ]; then
    echo "$f: body is $words words, over the $word_cap-word hard cap"
    fail=1
  elif [ "$words" -ge "$word_notice_at" ]; then
    near_cap_hits="${near_cap_hits}  $f: $words words
"
  fi
done

if [ -n "$near_cap_hits" ]; then
  echo "Notice (not a failure): a skill body is within $((word_cap - word_notice_at)) words of the $word_cap-word cap. Two changes that each pass can still break main together, so trim before adding, per AGENTS.md \"Frontmatter and budget\". Bodies found:"
  printf '%s' "$near_cap_hits"
fi

# The frontmatter contract, AGENTS.md "Frontmatter and budget": name,
# description, and license: MIT, nothing else, and a description under 500
# characters. Expert tools follow the spec's 1024 (docs/expert-tools.md).
# skills-ref checks only 1024, for every skill. Lengths count code points, as
# scripts/check-groupings.mjs does. It runs from the repository root so `yaml`
# resolves from node_modules; when it cannot run or parse, it fails.
frontmatter_check=$(
  cat <<'EOF'
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { listSkills } from "./scripts/lib/skills.mjs";

const KEYS = ["name", "description", "license"];
const problems = [];
for (const skill of listSkills()) {
  const file = `${skill.dir}/SKILL.md`;
  const text = readFileSync(file, "utf8");
  const block = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  let frontmatter;
  try {
    frontmatter = block ? parse(block[1]) : null;
  } catch (error) {
    problems.push(`${file}: frontmatter is not valid YAML (${error.message.split("\n")[0]})`);
    continue;
  }
  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    problems.push(`${file}: no frontmatter mapping between --- lines`);
    continue;
  }
  for (const key of Object.keys(frontmatter)) {
    if (!KEYS.includes(key)) {
      problems.push(`${file}: frontmatter key "${key}"; only ${KEYS.join(", ")} are allowed`);
    }
  }
  if (frontmatter.license !== "MIT") {
    problems.push(`${file}: frontmatter needs license: MIT`);
  }
  const { description } = frontmatter;
  if (typeof description !== "string") {
    problems.push(`${file}: frontmatter needs a description string`);
    continue;
  }
  const length = [...description].length;
  if (skill.expert && length > 1024) {
    problems.push(`${file}: description is ${length} characters, over the spec's 1024`);
  } else if (!skill.expert && length >= 500) {
    problems.push(`${file}: description is ${length} characters; a core skill's stays under 500`);
  }
}
for (const problem of problems) console.log(problem);
process.exit(problems.length > 0 ? 1 : 0);
EOF
)
frontmatter_status=0
frontmatter_out=$(node --input-type=module -e "$frontmatter_check" 2>&1) || frontmatter_status=$?
if [ "$frontmatter_status" -ne 0 ]; then
  echo 'Frontmatter holds name, description, and license: MIT only, and a description under 500 characters (1024 for expert tools), per AGENTS.md "Frontmatter and budget". Found:'
  printf '%s\n' "$frontmatter_out" | sed 's/^/  /'
  fail=1
fi

# Codex reads 32 KiB of AGENTS.md by default and silently drops the rest; an
# untrusted checkout ignores the .codex/config.toml that could raise it.
# The notice gives warning while a change still fits, before the cap fails one.
agents_limit=32768
agents_notice_at=30720
agents_bytes=$(wc -c <AGENTS.md | tr -d ' ')
if [ "$agents_bytes" -gt "$agents_limit" ]; then
  echo "AGENTS.md is $agents_bytes bytes, over the $agents_limit Codex reads by default. Move content only some tasks need into docs/, behind a pointer, per AGENTS.md \"Conventions\"."
  fail=1
elif [ "$agents_bytes" -gt "$agents_notice_at" ]; then
  echo "Notice (not a failure): AGENTS.md is $agents_bytes bytes, past the $agents_notice_at-byte early warning; the check fails past $agents_limit. Move content only some tasks need into docs/, behind a pointer, per AGENTS.md \"Conventions\"."
fi

# Context fan-out: a skill plus the siblings it names in backticks, weighed
# against the token pool Claude Code re-attaches skills from after compaction.
# AGENTS.md "Authoring contract" carries the why. A notice and never a failure,
# because the total moves when a skill nobody touched grows.
reattach_pool=25000
reattach_per_skill=5000
fanout_notice_at=20000

# The pre-commit hook runs on the macOS system bash, 3.2, which has no
# associative arrays.
skill_tokens_file=$(mktemp)
trap 'rm -f "$skill_tokens_file"' EXIT

for f in $skill_files; do
  name=$(basename "$(dirname "$f")")
  body=$(awk 'BEGIN { fm = 0 } /^---$/ { fm++; next } fm >= 2 { print }' "$f")
  chars=$(printf '%s\n' "$body" | wc -c | tr -d ' ')
  tokens=$((chars / 4))
  if [ "$tokens" -gt "$reattach_per_skill" ]; then
    tokens=$reattach_per_skill
  fi
  printf '%s\t%s\n' "$name" "$tokens" >>"$skill_tokens_file"
done

# Empty means the name is not a skill (a model id, or ordinary prose).
skill_tokens() {
  awk -F'\t' -v want="$1" '$1 == want { print $2; exit }' "$skill_tokens_file"
}

fanout_hits=""
for f in $skill_files; do
  name=$(basename "$(dirname "$f")")
  body=$(awk 'BEGIN { fm = 0 } /^---$/ { fm++; next } fm >= 2 { print }' "$f")
  total=$(skill_tokens "$name")
  siblings=$(printf '%s\n' "$body" | grep -oE '`scenario(-[a-z0-9]+)*`' | tr -d '`' | sort -u | grep -vx "$name" || true)
  count=0
  for sibling in $siblings; do
    sibling_tokens=$(skill_tokens "$sibling")
    [ -n "$sibling_tokens" ] || continue
    total=$((total + sibling_tokens))
    count=$((count + 1))
  done
  if [ "$total" -ge "$fanout_notice_at" ]; then
    fanout_hits="${fanout_hits}  ${name}: with its ${count} named siblings, about ${total} tokens of the ${reattach_pool}-token pool
"
  fi
done

if [ -n "$fanout_hits" ]; then
  echo "Notice (not a failure): a skill's context fan-out is approaching the ${reattach_pool}-token re-attach pool Claude Code shares across skills after compaction. Past it, the least recently invoked skills are dropped entirely. Trim the body, or drop a sibling reference the skill does not need."
  printf '%s' "$fanout_hits"
fi

# Sentence-length table cells. AGENTS.md "Writing" carries the rule
# and why it is a notice scoped to staged files. A cell is measured rather than
# a row, because prettier pads every row to the widest cell. CI stages nothing,
# so this only speaks in the pre-commit hook.
table_cell_limit=200
staged_markdown=$(git diff --cached --name-only --diff-filter=ACMR -- 'skills/*.md' 2>/dev/null || true)
if [ -n "$staged_markdown" ]; then
  # An escaped pipe is cell content, not a column boundary.
  table_hits=$(printf '%s\n' "$staged_markdown" | xargs awk -v limit="$table_cell_limit" '
    FNR == 1 { fence = 0 }
    /^ *```/ { fence = !fence; next }
    fence || !/^ *\|/ || /^ *\| *:?-+/ { next }
    {
      row = $0
      gsub(/\\\|/, "::", row)
      n = split(row, cell, "|")
      for (i = 2; i < n; i++) {
        text = cell[i]
        gsub(/^ +| +$/, "", text)
        if (length(text) > limit) {
          printf "  %s:%d: a %d-character cell\n", FILENAME, FNR, length(text)
          break
        }
      }
    }
  ')
  if [ -n "$table_hits" ]; then
    echo "Notice (not a failure): a table cell in staged skill markdown runs past ${table_cell_limit} characters. Tables never wrap, so rewrite the rows that need sentences as a list (- **term**: sentence), per AGENTS.md \"Writing\". Cells found:"
    printf '%s\n' "$table_hits"
  fi
fi

# Long sentences and the word "workflow", per AGENTS.md "Writing". Only lines
# the staged change adds count: prettier rewraps a paragraph around a one-word
# fix, and old prose is not the author's to answer for. The staged blob is read
# rather than the working tree, so line numbers match the diff.
sentence_word_limit=40
prose_hits=""
for f in $staged_markdown; do
  # ",3,4,9," lists the line numbers the staged change adds.
  added=$(git diff --cached -U0 -- "$f" | awk '
    /^@@/ {
      split($3, range, ",")
      start = substr(range[1], 2)
      count = (2 in range) ? range[2] : 1
      for (i = 0; i < count; i++) printf ",%d", start + i
    }
    END { print "," }
  ')
  # The workflow skills are where the word means what it should.
  case "$f" in
    skills/*workflow*/*) check_term=0 ;;
    *) check_term=1 ;;
  esac
  hits=$(git show ":$f" | awk -v file="$f" -v added="$added" -v limit="$sentence_word_limit" -v check_term="$check_term" '
    function finish() {
      if (words > limit && touched) printf "S  %s:%d: a %d-word sentence\n", file, start, words
      words = 0
      touched = 0
      after_etc = 0
    }
    FNR == 1 && $0 == "---" { front = 1; next }
    front { if ($0 == "---") front = 0; next }
    /^ *(```|~~~)/ { finish(); fence = !fence; next }
    fence { next }
    {
      is_added = index(added, "," FNR ",") > 0
      # A code span or a link target is never prose, and a span reads as one word.
      line = $0
      gsub(/`[^`]*`/, "code", line)
      gsub(/\]\([^)]*\)/, "]", line)
      if (check_term && is_added && tolower(line) ~ /(^|[^a-z0-9_-])workflows?([^a-z0-9_-]|$)/)
        printf "T  %s:%d\n", file, FNR
    }
    /^ *$/ || /^ *#/ || /^ *\|/ || /^ *<!--/ { finish(); next }
    {
      sub(/^ *> */, "", line)
      if (line ~ /^ *([-*+]|[0-9]+[.)]) /) {
        finish()
        sub(/^ *([-*+]|[0-9]+[.)]) +/, "", line)
      }
      n = split(line, word, /[ \t]+/)
      for (i = 1; i <= n; i++) {
        if (word[i] == "") continue
        # etc. ends a sentence only when the next word does not continue it.
        if (after_etc && word[i] !~ /^[("*_]*[a-z]/) finish()
        after_etc = 0
        if (words == 0) start = FNR
        words++
        if (is_added) touched = 1
        if (word[i] ~ /^\(?etc\.[)"*_]*$/) after_etc = 1
        else if (word[i] ~ /[.!?][)"*_]*$/ && word[i] !~ /^\(?(e\.g|i\.e|vs|cf)\.$/) finish()
      }
    }
    END { finish() }
  ')
  prose_hits="${prose_hits}${hits}
"
done
sentence_hits=$(printf '%s' "$prose_hits" | sed -n 's/^S//p')
term_hits=$(printf '%s' "$prose_hits" | sed -n 's/^T//p')

if [ -n "$sentence_hits" ]; then
  echo "Notice (not a failure): staged skill markdown adds a sentence past ${sentence_word_limit} words. Split it, or make it a list, per AGENTS.md \"Writing\". Sentences found, by their first line:"
  printf '%s\n' "$sentence_hits"
fi

if [ -n "$term_hits" ]; then
  echo 'Notice (not a failure): staged skill markdown adds "workflow" outside the workflow skills. The word names a Scenario workflow (`workflow_run`); for what a skill teaches, say steps or procedure, per AGENTS.md "Writing". Lines found:'
  printf '%s\n' "$term_hits"
fi

exit $fail
