#!/usr/bin/env bash
# mcp-setup.sh — Vibe Kanban MCP 서버 설정 스크립트
# 사용법: bash mcp-setup.sh [--claude|--codex|--all]
#
# 예시:
#   bash mcp-setup.sh --claude   # Claude Code 설정만
#   bash mcp-setup.sh --codex    # Codex CLI 설정만
#   bash mcp-setup.sh --all      # 모든 에이전트 설정

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}ℹ️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
error() { echo -e "${RED}❌ $*${NC}" >&2; }

# ─── 인자 파싱 ───────────────────────────────────────────────────────────────
SETUP_CLAUDE=false
SETUP_CODEX=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude) SETUP_CLAUDE=true; shift ;;
    --codex)  SETUP_CODEX=true; shift ;;
    --all)    SETUP_CLAUDE=true; SETUP_CODEX=true; shift ;;
    *) shift ;;
  esac
done

# 기본값: 모두 설정
if [[ "$SETUP_CLAUDE" == "false" && "$SETUP_CODEX" == "false" ]]; then
  SETUP_CLAUDE=true
  SETUP_CODEX=true
fi

echo "╔══════════════════════════════════════╗"
echo "║  Vibe Kanban MCP 설정                ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── MCP 설정 JSON 생성 ──────────────────────────────────────────────────────
MCP_CONFIG=$(cat <<'EOF'
{
  "vibe-kanban": {
    "command": "npx",
    "args": ["vibe-kanban", "--mcp"],
    "env": {
      "MCP_HOST": "127.0.0.1",
      "MCP_PORT": "3001"
    }
  }
}
EOF
)

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

cleanup_temp() {
  local temp="$1"

  if [[ -e "$temp" || -L "$temp" ]]; then
    if [[ -L "$temp" || ! -f "$temp" ]]; then
      error "임시 설정 파일 상태가 안전하지 않아 삭제하지 않습니다: $temp"
      return 1
    fi
    if ! rm -f -- "$temp"; then
      error "임시 설정 파일을 삭제할 수 없습니다: $temp"
      return 1
    fi
  fi
  return 0
}

validate_json_file() {
  local config="$1"

  python3 - "$config" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    json.load(config_file)
PY
}

validate_toml_file() {
  local config="$1"

  python3 - "$config" <<'PY'
import sys
import tomllib

with open(sys.argv[1], "rb") as config_file:
    tomllib.load(config_file)
PY
}

require_regular_file() {
  local target="$1"
  local label="$2"

  if [[ -L "$target" ]]; then
    error "$label 심볼릭 링크입니다: $target"
    return 1
  fi
  if [[ ! -f "$target" ]]; then
    error "$label 일반 파일이 아닙니다: $target"
    return 1
  fi
  return 0
}

require_absent_path() {
  local target="$1"
  local label="$2"

  if [[ -L "$target" || -e "$target" ]]; then
    error "$label 경로 상태가 변경되었습니다: $target"
    return 1
  fi
  return 0
}

replace_with_temp() {
  local target="$1"
  local temp="$2"
  local mode="${3:-}"
  local expected_state="$4"

  if [[ -L "$temp" || ! -f "$temp" ]]; then
    error "임시 설정 파일이 일반 파일이 아닙니다: $temp"
    return 1
  fi

  if [[ -n "$mode" ]] && ! chmod "$mode" "$temp"; then
    cleanup_temp "$temp" || true
    error "설정 파일 권한을 보존할 수 없습니다: $target"
    return 1
  fi

  case "$expected_state" in
    existing)
      if ! require_regular_file "$target" "설정 파일"; then
        cleanup_temp "$temp" || true
        return 1
      fi
      ;;
    absent)
      if ! require_absent_path "$target" "설정 파일"; then
        cleanup_temp "$temp" || true
        return 1
      fi
      ;;
    *)
      cleanup_temp "$temp" || true
      error "알 수 없는 설정 파일 교체 상태입니다: $expected_state"
      return 1
      ;;
  esac

  if ! mv -f -- "$temp" "$target"; then
    cleanup_temp "$temp" || true
    error "설정 파일을 원자적으로 교체할 수 없습니다: $target"
    return 1
  fi
  return 0
}

validate_generated_json() {
  local temp="$1"

  if ! validate_json_file "$temp"; then
    cleanup_temp "$temp" || true
    error "생성된 Claude Code 설정 JSON이 유효하지 않습니다: $temp"
    return 1
  fi
  return 0
}

validate_generated_toml() {
  local temp="$1"

  if ! validate_toml_file "$temp"; then
    cleanup_temp "$temp" || true
    error "생성된 Codex CLI 설정 TOML이 유효하지 않습니다: $temp"
    return 1
  fi
  return 0
}

# ─── Claude Code 설정 ────────────────────────────────────────────────────────
if [[ "$SETUP_CLAUDE" == "true" ]]; then
  info "Claude Code MCP 설정 중..."
  
  CLAUDE_CONFIG="$HOME/.claude/claude_desktop_config.json"
  CLAUDE_DIR="$HOME/.claude"
  
  # 디렉토리 생성
  mkdir -p "$CLAUDE_DIR"

  if [[ -L "$CLAUDE_CONFIG" ]]; then
    error "Claude Code 설정 파일이 심볼릭 링크입니다: $CLAUDE_CONFIG"
    exit 1
  fi

  if [[ -e "$CLAUDE_CONFIG" ]]; then
    if ! require_regular_file "$CLAUDE_CONFIG" "Claude Code 설정 파일"; then
      exit 1
    fi

    if ! command -v jq &>/dev/null; then
      error "기존 Claude Code 설정을 안전하게 병합하려면 jq가 필요합니다."
      exit 1
    fi

    if ! require_regular_file "$CLAUDE_CONFIG" "Claude Code 설정 파일"; then
      exit 1
    fi

    if ! claude_mode=$(file_mode "$CLAUDE_CONFIG"); then
      error "Claude Code 설정 파일 권한을 읽을 수 없습니다: $CLAUDE_CONFIG"
      exit 1
    fi
    if ! claude_temp=$(mktemp "${CLAUDE_CONFIG}.tmp.XXXXXX"); then
      error "Claude Code 설정용 임시 파일을 만들 수 없습니다: $CLAUDE_CONFIG"
      exit 1
    fi
    if ! require_regular_file "$CLAUDE_CONFIG" "Claude Code 설정 파일"; then
      cleanup_temp "$claude_temp" || true
      exit 1
    fi

    if ! jq --argjson vk "$MCP_CONFIG" '.mcpServers += $vk' "$CLAUDE_CONFIG" > "$claude_temp"; then
      cleanup_temp "$claude_temp" || true
      error "Claude Code 설정 병합에 실패했습니다: $CLAUDE_CONFIG"
      exit 1
    fi
    if ! validate_generated_json "$claude_temp"; then
      exit 1
    fi
    if ! replace_with_temp "$CLAUDE_CONFIG" "$claude_temp" "$claude_mode" existing; then
      exit 1
    fi
    ok "Claude Code: 기존 설정에 병합됨"
  else
    if ! claude_temp=$(mktemp "${CLAUDE_CONFIG}.tmp.XXXXXX"); then
      error "Claude Code 설정용 임시 파일을 만들 수 없습니다: $CLAUDE_CONFIG"
      exit 1
    fi
    if ! printf '{\n  "mcpServers": %s\n}\n' "$MCP_CONFIG" > "$claude_temp"; then
      cleanup_temp "$claude_temp" || true
      error "새 Claude Code 설정을 생성할 수 없습니다: $CLAUDE_CONFIG"
      exit 1
    fi
    if ! validate_generated_json "$claude_temp"; then
      exit 1
    fi
    if ! replace_with_temp "$CLAUDE_CONFIG" "$claude_temp" "" absent; then
      exit 1
    fi
    ok "Claude Code: 새 설정 파일 생성됨"
  fi
  
  echo "  설정 파일: $CLAUDE_CONFIG"
  echo ""
fi

# ─── Codex CLI 설정 ──────────────────────────────────────────────────────────
if [[ "$SETUP_CODEX" == "true" ]]; then
  info "Codex CLI MCP 설정 중..."
  
  CODEX_CONFIG="$HOME/.codex/config.toml"
  CODEX_DIR="$HOME/.codex"
  
  # 디렉토리 생성
  mkdir -p "$CODEX_DIR"

  # TOML 형식으로 변환
  CODEX_MCP_CONFIG=$(cat <<'EOF'

# Vibe Kanban MCP Server
[[mcp_servers]]
name = "vibe-kanban"
command = "npx"
args = ["vibe-kanban", "--mcp"]

[mcp_servers.env]
MCP_HOST = "127.0.0.1"
MCP_PORT = "3001"
EOF
)

  if [[ -L "$CODEX_CONFIG" ]]; then
    error "Codex CLI 설정 파일이 심볼릭 링크입니다: $CODEX_CONFIG"
    exit 1
  fi

  if [[ -e "$CODEX_CONFIG" ]]; then
    if ! require_regular_file "$CODEX_CONFIG" "Codex CLI 설정 파일"; then
      exit 1
    fi


    if ! validate_toml_file "$CODEX_CONFIG"; then
      error "기존 Codex CLI 설정 TOML이 유효하지 않습니다: $CODEX_CONFIG"
      exit 1
    fi

    if ! require_regular_file "$CODEX_CONFIG" "Codex CLI 설정 파일"; then
      exit 1
    fi

    if grep -q -- "vibe-kanban" "$CODEX_CONFIG"; then
      warn "Codex CLI: 이미 vibe-kanban 설정이 존재합니다."
    else
      grep_status=$?
      if (( grep_status != 1 )); then
        error "Codex CLI 설정을 읽을 수 없습니다: $CODEX_CONFIG"
        exit "$grep_status"
      fi

      if ! require_regular_file "$CODEX_CONFIG" "Codex CLI 설정 파일"; then
        exit 1
      fi

      if ! codex_mode=$(file_mode "$CODEX_CONFIG"); then
        error "Codex CLI 설정 파일 권한을 읽을 수 없습니다: $CODEX_CONFIG"
        exit 1
      fi
      if ! codex_temp=$(mktemp "${CODEX_CONFIG}.tmp.XXXXXX"); then
        error "Codex CLI 설정용 임시 파일을 만들 수 없습니다: $CODEX_CONFIG"
        exit 1
      fi
      if ! require_regular_file "$CODEX_CONFIG" "Codex CLI 설정 파일"; then
        cleanup_temp "$codex_temp" || true
        exit 1
      fi

      if ! { cat -- "$CODEX_CONFIG"; printf '%s\n' "$CODEX_MCP_CONFIG"; } > "$codex_temp"; then
        cleanup_temp "$codex_temp" || true
        error "Codex CLI 설정 추가에 실패했습니다: $CODEX_CONFIG"
        exit 1
      fi
      if ! validate_generated_toml "$codex_temp"; then
        exit 1
      fi
      if ! replace_with_temp "$CODEX_CONFIG" "$codex_temp" "$codex_mode" existing; then
        exit 1
      fi
      ok "Codex CLI: 기존 설정에 추가됨"
    fi
  else
    if ! codex_temp=$(mktemp "${CODEX_CONFIG}.tmp.XXXXXX"); then
      error "Codex CLI 설정용 임시 파일을 만들 수 없습니다: $CODEX_CONFIG"
      exit 1
    fi
    if ! printf '# Codex CLI Configuration\n%s\n' "$CODEX_MCP_CONFIG" > "$codex_temp"; then
      cleanup_temp "$codex_temp" || true
      error "새 Codex CLI 설정을 생성할 수 없습니다: $CODEX_CONFIG"
      exit 1
    fi
    if ! validate_generated_toml "$codex_temp"; then
      exit 1
    fi
    if ! replace_with_temp "$CODEX_CONFIG" "$codex_temp" "" absent; then
      exit 1
    fi
    ok "Codex CLI: 새 설정 파일 생성됨"
  fi
  
  echo "  설정 파일: $CODEX_CONFIG"
  echo ""
fi

# ─── 완료 ────────────────────────────────────────────────────────────────────
ok "MCP 설정 완료!"
echo ""
echo "다음 단계:"
echo "  1. 에이전트를 재시작하세요"
echo "  2. 'npx vibe-kanban --mcp'로 MCP 서버 시작"
echo "  3. 에이전트에서 vibe-kanban MCP 도구 사용 가능"
echo ""
echo "MCP 도구 목록:"
echo "  - vk_list_cards: 카드 목록 조회"
echo "  - vk_create_card: 새 카드 생성"
echo "  - vk_move_card: 카드 이동"
echo "  - vk_get_logs: 에이전트 로그 조회"
