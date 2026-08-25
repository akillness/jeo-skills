#!/usr/bin/env bash
# Drama Skills helper — read-only inspection only.
# Never clones, installs, updates, links skills, starts the Dashboard, runs
# upstream Python, prints secret values, confirms jobs, or calls providers.
#
# Usage:
#   drama-skills.sh doctor  [repo_or_skill_root]
#   drama-skills.sh routes
#   drama-skills.sh project [project_path]

set -euo pipefail

cmd="${1:-}"
arg="${2:-.}"

usage() {
  sed -n '2,9p' "$0"
  exit 1
}

# Reject unsupported actions before resolving any path or binary. This keeps
# production, install, update, and server actions unreachable through this helper.
case "$cmd" in
  doctor|routes|project) ;;
  *) usage ;;
esac

expected_skills=(
  short-drama
  short-drama-novel-analyze
  short-drama-develop
  short-drama-write
  short-drama-assets
  short-drama-image-prompts
  short-drama-storyboard
  short-drama-video-prompts
  short-drama-produce
  short-drama-review
)

print_credential_presence() {
  echo "== optional provider credentials (names only) =="
  for key in ARK_API_KEY OPENAI_API_KEY MINIMAX_API_KEY; do
    if [[ -n "${!key:-}" ]]; then
      printf '  set     %s\n' "$key"
    else
      printf '  unset   %s\n' "$key"
    fi
  done
  echo "  note  normal creation and offline checks need none of these keys."
}

case "$cmd" in
  routes)
    cat <<'EOF'
== Drama Skills stage routes ==
  short-drama                 init, status, Dashboard, cross-stage routing
  short-drama-novel-analyze   read-only long-source triage and analysis
  short-drama-develop         adaptation direction, brief, story engine, episode map
  short-drama-write           剧本.md — one episode screenplay
  short-drama-assets          视觉设定.md — identities, locations, props, continuity
  short-drama-image-prompts   图片提示词.md — copy-ready asset/image prompts
  short-drama-storyboard      分镜.md — shots, blocking, continuity, frozen keyframes
  short-drama-video-prompts   视频提示词.md — motion, performance, camera, audio/music intent
  short-drama-produce         prepare -> exact user confirmation -> run external adapters
  short-drama-review          independent findings; never silently rewrites owner files

Start at the stage whose real input exists. Do not fabricate upstream files,
auto-add review, or enter production from a writing request.
EOF
    ;;

  doctor)
    repo="$arg"
    echo "== Drama Skills readiness report (read-only) =="
    printf '  info  path           %s\n' "$repo"

    os="$(uname -s 2>/dev/null || echo unknown)"
    arch="$(uname -m 2>/dev/null || echo unknown)"
    printf '  info  host           %s %s\n' "$os" "$arch"

    py=""
    for candidate in python3 python; do
      if command -v "$candidate" >/dev/null 2>&1; then
        py="$(command -v "$candidate")"
        break
      fi
    done
    if [[ -n "$py" ]]; then
      py_version="$("$py" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))' 2>/dev/null || echo unknown)"
      py_ok="$("$py" -c 'import sys; print(1 if sys.version_info >= (3, 9) else 0)' 2>/dev/null || echo 0)"
      if [[ "$py_ok" == "1" ]]; then
        printf '  ok    python         %s (%s, requires >=3.9)\n' "$py_version" "$py"
      else
        printf '  ERROR python         %s (%s, requires >=3.9)\n' "$py_version" "$py"
      fi
    else
      echo "  ERROR python         not on PATH (requires >=3.9)"
    fi

    if command -v git >/dev/null 2>&1; then
      printf '  ok    git            %s\n' "$(git --version 2>/dev/null || echo present)"
    else
      echo "  info  git            not on PATH (needed only for checkout/update)"
    fi

    skill_root=""
    layout=""
    if [[ -f "$repo/skills/short-drama/SKILL.md" ]]; then
      skill_root="$repo/skills"
      layout="source checkout"
    elif [[ -f "$repo/short-drama/SKILL.md" ]]; then
      skill_root="$repo"
      layout="installed skill root"
    fi

    if [[ -n "$skill_root" ]]; then
      printf '  ok    suite          %s detected at %s\n' "$layout" "$skill_root"
      present=0
      selftests=0
      for skill in "${expected_skills[@]}"; do
        if [[ -f "$skill_root/$skill/SKILL.md" ]]; then
          present=$((present + 1))
          if [[ -f "$skill_root/$skill/scripts/selftest.py" ]]; then
            selftests=$((selftests + 1))
            printf '  ok    %-27s SKILL.md + selftest.py\n' "$skill"
          else
            printf '  WARN  %-27s SKILL.md present, selftest.py missing\n' "$skill"
          fi
        else
          printf '  ERROR %-27s missing SKILL.md\n' "$skill"
        fi
      done
      printf '  info  inventory      %s/10 skills, %s/10 self-tests\n' "$present" "$selftests"

      if [[ -f "$skill_root/short-drama-produce/scripts/production_tool.py" \
         && -f "$skill_root/short-drama-produce/scripts/provider_adapters.py" ]]; then
        echo "  ok    production     tool + provider adapters present (not executed)"
      else
        echo "  WARN  production     production tool or provider adapters missing"
      fi

      if [[ "$layout" == "source checkout" ]]; then
        [[ -f "$repo/README_EN.md" ]] \
          && echo "  ok    docs           README_EN.md present" \
          || echo "  WARN  docs           README_EN.md missing"
        [[ -f "$repo/docs/comic-drama-workflow.md" ]] \
          && echo "  ok    docs           comic-drama-workflow.md present" \
          || echo "  WARN  docs           comic-drama-workflow.md missing"
        if [[ -d "$repo/maintainers/skills/short-drama-knowhow" ]]; then
          echo "  info  maintainer     short-drama-knowhow exists; do not install it"
        fi
      fi
    else
      echo "  info  suite          no checkout/skill root detected"
      echo "        expected either '$repo/skills/short-drama/SKILL.md'"
      echo "        or '$repo/short-drama/SKILL.md'"
    fi

    if command -v git >/dev/null 2>&1 \
       && git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git_root="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || true)"
      # Report a commit only when the enclosing repository has the upstream
      # source layout. An installed skill root may sit inside an unrelated repo.
      if [[ -n "$git_root" && -f "$git_root/skills/short-drama/SKILL.md" ]]; then
        sha="$(git -C "$git_root" rev-parse HEAD 2>/dev/null || true)"
        desc="$(git -C "$git_root" describe --tags --always --dirty 2>/dev/null || true)"
        [[ -n "$sha" ]] && printf '  info  commit         %s\n' "$sha"
        [[ -n "$desc" ]] && printf '  info  describe       %s\n' "$desc"
      fi
    fi

    print_credential_presence
    echo "  note  self-tests were not run and no file, server, link, or job was changed."
    echo "== end of report =="
    ;;

  project)
    project="$arg"
    echo "== Drama Skills project report (read-only) =="
    printf '  info  path           %s\n' "$project"

    if [[ ! -d "$project" ]]; then
      echo "  ERROR project        directory does not exist"
      exit 1
    fi

    if [[ -f "$project/short-drama.json" ]]; then
      echo "  ok    config         short-drama.json present"
    else
      echo "  info  config         short-drama.json absent (may be a standalone stage workspace)"
    fi
    if [[ -f "$project/.short-drama/state.json" ]]; then
      echo "  ok    state          .short-drama/state.json present"
    else
      echo "  info  state          .short-drama/state.json absent"
    fi

    episodes="$project/剧集"
    episodes_label="剧集"
    if [[ ! -d "$episodes" && -d "$project/episodes" ]]; then
      episodes="$project/episodes"
      episodes_label="episodes (legacy English layout)"
    fi
    episode_count=0
    if [[ -d "$episodes" ]]; then
      printf '  info  episode_root   %s\n' "$episodes_label"
      while IFS= read -r episode; do
        episode_count=$((episode_count + 1))
        name="$(basename "$episode")"
        present=0
        missing=()
        for doc in 剧本.md 视觉设定.md 分镜.md 图片提示词.md 视频提示词.md; do
          if [[ -f "$episode/$doc" ]]; then
            present=$((present + 1))
          else
            missing+=("$doc")
          fi
        done
        printf '  info  episode        %s: %s/5 creator documents' "$name" "$present"
        if [[ "${#missing[@]}" -gt 0 ]]; then
          printf ' (missing:'
          printf ' %s' "${missing[@]}"
          printf ')'
        fi
        printf '\n'
      done < <(find "$episodes" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | LC_ALL=C sort)
    else
      echo "  info  episodes       neither 剧集/ nor legacy episodes/ exists"
    fi
    printf '  info  episode_count  %s\n' "$episode_count"
    echo "  note  missing documents are not automatically errors; create only real scoped outputs."
    echo "  note  no project file was parsed, modified, accepted, reviewed, or produced."
    echo "== end of report =="
    ;;
esac
