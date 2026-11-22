#!/usr/bin/env bash
# Runs the test suites for scripts shipped with skills (see AGENTS.md):
# - every core skill that ships a .py or .ts file (at any depth) must have
#   at least one test file under tests/<name>/; expert tools are exempt
#   (docs/expert-tools.md), and check-skill-files.sh still parses every
#   Python script they ship
# - every tests/<name>/ directory must match an existing skill and hold
#   at least one test file
# - Python suites (test_*.py at the suite's top level) run with stdlib
#   unittest, one process per module, under uv when the suite declares a
#   requirements.txt and uv is installed
# - TypeScript suites (*.test.ts) run with vitest
# - jobs (a Python module, or a vitest suite) run in parallel,
#   SKILLS_TEST_JOBS at a time (default: one per CPU); each job's output is
#   printed once all are done, so concurrent output never interleaves
# - COVERAGE=1 also measures core skills' scripts, Python through
#   .coveragerc and JavaScript/TypeScript through vitest's v8 provider
#   (every core skill shipping either, suite or not), and writes
#   Cobertura reports (coverage/python.xml,
#   coverage/vitest/cobertura-coverage.xml) plus the Python table in
#   coverage/report.md; no threshold fails a run
# Suites may need system tools such as ffmpeg, so this runs in CI and on
# demand, not in the pre-commit hook.
set -euo pipefail
cd "$(dirname "$0")/.."
self="$PWD/scripts/test-skill-scripts.sh"

fail=0
coverage=${COVERAGE:-}
# 7.10 added patch = subprocess, which follows the scripts suites spawn.
COVERAGE_PY="coverage>=7.10"
# CI's Python. A suite's requirements can need more than the machine's python3
# (numpy 2.5 needs 3.12), so everything uv runs uses this version.
TEST_PYTHON=3.12

# The interpreter uv runs, always pinned by path: given a bare version, uv
# prefers an active conda or virtual environment of that version, whose
# packages leak into the suite, and `--system` skips them. With no such Python
# installed, uv installs TEST_PYTHON first; failing that, the run fails.
uv_python() {
  uv python find --system "$TEST_PYTHON" 2>/dev/null && return
  uv python install --quiet "$TEST_PYTHON" >&2 &&
    uv python find --system "$TEST_PYTHON" && return
  echo "uv could not provide Python ${TEST_PYTHON}" >&2
  return 1
}

# Whether the modules of suite directory $1 run under uv: they need packages
# beyond the stdlib. CI uses its hash-checked environment even when the runner
# has uv installed.
uses_uv() {
  [ "${SKILLS_TEST_USE_SYSTEM_PYTHON:-}" != 1 ] && command -v uv >/dev/null &&
    { [ -n "$coverage" ] || [ -f "${1}requirements.txt" ]; }
}

# Runs one Python test module (tests/<name>/test_x.py).
python_module() {
  local dir file req python with unittest
  dir=${1%/*}/
  file=${1##*/}
  # uv installs a suite's requirements into a cached environment of its
  # own, so a local run needs no pip step.
  python=(python3)
  if uses_uv "$dir"; then
    if [ -z "${SKILLS_TEST_UV_PYTHON:-}" ]; then
      echo "uv could not provide Python ${TEST_PYTHON}"
      return 1
    fi
    req="${dir}requirements.txt"
    with=()
    [ ! -f "$req" ] || with+=(--with-requirements "$req")
    [ -z "$coverage" ] || with+=(--with "$COVERAGE_PY")
    python=(uv run --quiet --no-project --python "$SKILLS_TEST_UV_PYTHON"
      "${with[@]}" python)
  fi
  # No -t: hyphenated skill names are not importable as packages, so each
  # suite directory is its own top level and modules load as bare names.
  unittest=(-m unittest discover -s "$dir" -p "$file")
  [ -z "$coverage" ] ||
    unittest=(-m coverage run --rcfile=.coveragerc "${unittest[@]}")
  "${python[@]}" -B "${unittest[@]}"
}

log_of() { echo "$SKILLS_TEST_LOGS/${1//\//_}.log"; }

# One job, started by xargs below: a Python module or a vitest suite
# directory. It prints one status line and leaves its output in a log.
if [ "${1:-}" = --job ]; then
  log=$(log_of "$2")
  start=$SECONDS
  case "$2" in
    *.py) python_module "$2" >"$log" 2>&1 || : >"$log.failed" ;;
    *) pnpm exec vitest run "$2" >"$log" 2>&1 || : >"$log.failed" ;;
  esac
  status=ok
  [ ! -e "$log.failed" ] || status=FAIL
  echo "$status $2 ($((SECONDS - start))s)"
  [ "$status" = ok ]
  exit
fi

[ -z "$coverage" ] || { rm -rf coverage && mkdir -p coverage; }
SKILLS_TEST_LOGS=$(mktemp -d)
export SKILLS_TEST_LOGS
trap 'rm -rf "$SKILLS_TEST_LOGS"' EXIT

has_tests() {
  find "$1" -type f \( -name 'test_*.py' -o -name '*.test.ts' \) 2>/dev/null |
    grep -q .
}

# Every script a core skill ships needs a suite with at least one test file.
# In a case pattern `*` crosses `/`, so nested scripts are covered too.
core_dirs=$(node scripts/lib/skills.mjs --core)
for dir in $core_dirs; do
  name=$(basename "$dir")
  while IFS= read -r -d '' file; do
    case "$file" in
      *.py | *.ts)
        if ! has_tests "tests/${name}"; then
          echo "$file: shipped script has no test files under tests/${name}/ (see AGENTS.md)"
          fail=1
        fi
        ;;
    esac
  done < <(git ls-files -z -- "$dir")
done

# Every suite needs a skill, at least one test file, and a green run.
jobs=()
ts_dirs=()
ts_skills=()
ts_include=()
for dir in tests/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  if ! node scripts/lib/skills.mjs --dir "$name" >/dev/null 2>&1; then
    echo "$dir: no skill named ${name} under skills/"
    fail=1
    continue
  fi
  if ! has_tests "$dir"; then
    echo "$dir: no test files (expected test_*.py or *.test.ts)"
    fail=1
    continue
  fi
  # Each module runs as `discover -p <basename>` from the suite root, so a
  # nested one would never be queued: refuse it rather than skip it.
  nested=$(find "$dir" -mindepth 2 -type f -name 'test_*.py')
  if [ -n "$nested" ]; then
    echo "$nested" | while IFS= read -r file; do
      echo "$file: test modules sit at the top of tests/${name}/"
    done
    fail=1
  fi
  for file in "$dir"test_*.py; do
    [ ! -f "$file" ] || jobs+=("$file")
  done
  if find "$dir" -type f -name '*.test.ts' | grep -q .; then
    skill=$(node scripts/lib/skills.mjs --dir "$name")
    # Under coverage, core suites share one vitest run below: a run per
    # suite would overwrite the one Cobertura report the upload takes.
    if [ -n "$coverage" ] && grep -qx "${skill}/" <<<"$core_dirs"; then
      ts_dirs+=("$dir")
      ts_skills+=("$skill")
    else
      jobs+=("$dir")
    fi
  fi
done

if [ "${#jobs[@]}" -eq 0 ] && [ "${#ts_dirs[@]}" -eq 0 ]; then
  echo "No skill-script test suites to run."
fi

# Resolved once, before the jobs start, so parallel jobs never race to install
# it. A failure here fails the run; the uv jobs then fail too.
SKILLS_TEST_UV_PYTHON=
for target in "${jobs[@]+"${jobs[@]}"}"; do
  case "$target" in *.py) ;; *) continue ;; esac
  uses_uv "${target%/*}/" || continue
  SKILLS_TEST_UV_PYTHON=$(uv_python) || fail=1
  break
done
export SKILLS_TEST_UV_PYTHON

# The coverage run starts first and in the background: it is one long call.
vitest_log="$SKILLS_TEST_LOGS/vitest-coverage.log"
if [ "${#ts_dirs[@]}" -gt 0 ]; then
  # Every core skill shipping JavaScript counts too, suite or not, so an
  # untested file shows at 0% instead of dropping out. The extensions keep
  # markdown, HTML and JSON beside the scripts out of the report.
  for dir in $core_dirs; do
    if git ls-files -- "$dir" | grep -qE '\.(c|m)?js$|\.ts$'; then
      ts_skills+=("${dir%/}")
    fi
  done
  seen=" "
  for skill in "${ts_skills[@]}"; do
    case "$seen" in *" $skill "*) continue ;; esac
    seen="$seen$skill "
    ts_include+=(--coverage.include="${skill}/**/*.{js,mjs,cjs,ts}")
  done
  pnpm exec vitest run "${ts_dirs[@]}" --coverage "${ts_include[@]}" \
    --coverage.reporter=text --coverage.reporter=cobertura \
    --coverage.reportsDirectory=coverage/vitest >"$vitest_log" 2>&1 &
  vitest_pid=$!
fi

if [ "${#jobs[@]}" -gt 0 ]; then
  parallel=${SKILLS_TEST_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)}
  echo "== ${#jobs[@]} test jobs, ${parallel} at a time =="
  printf '%s\0' "${jobs[@]}" |
    xargs -0 -n 1 -P "$parallel" "$BASH" "$self" --job || fail=1
fi

if [ "${#ts_dirs[@]}" -gt 0 ]; then
  wait "$vitest_pid" || {
    fail=1
    echo "FAIL vitest with coverage: ${ts_dirs[*]}"
  }
fi

# Each log once, passing ones first, so a failure ends the output. GitHub
# Actions folds each passing log into a group.
group=
[ "${GITHUB_ACTIONS:-}" != true ] || group=1
failed=()
for target in "${jobs[@]+"${jobs[@]}"}"; do
  log=$(log_of "$target")
  if [ -e "$log.failed" ]; then
    failed+=("$target")
    continue
  fi
  [ -z "$group" ] || echo "::group::${target}"
  echo "== ${target} =="
  cat "$log"
  [ -z "$group" ] || echo "::endgroup::"
done
if [ "${#ts_dirs[@]}" -gt 0 ]; then
  echo "== vitest with coverage: ${ts_dirs[*]} =="
  cat "$vitest_log"
fi
for target in "${failed[@]+"${failed[@]}"}"; do
  echo "== FAILED: ${target} =="
  cat "$(log_of "$target")"
done

if [ -n "$coverage" ] && compgen -G 'coverage/.coverage.*' >/dev/null; then
  echo "== python coverage =="
  report=(python3)
  if uses_uv ./; then
    [ -n "$SKILLS_TEST_UV_PYTHON" ] || exit 1
    report=(uv run --quiet --no-project --python "$SKILLS_TEST_UV_PYTHON"
      --with "$COVERAGE_PY" python)
  fi
  report+=(-m coverage)
  "${report[@]}" combine --rcfile=.coveragerc -q &&
    "${report[@]}" report --rcfile=.coveragerc &&
    "${report[@]}" report --rcfile=.coveragerc --format=markdown \
      >coverage/report.md &&
    "${report[@]}" xml --rcfile=.coveragerc -q -o coverage/python.xml ||
    fail=1
fi

[ "${#failed[@]}" -eq 0 ] || echo "Failed: ${failed[*]}"
exit $fail
