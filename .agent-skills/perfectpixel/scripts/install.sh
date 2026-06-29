#!/usr/bin/env bash
# install.sh — PerfectPixel 스킬용 헤드리스 생성기(ppgen) 설치 스크립트.
#
# 설치 우선순위:
#   1) skill/bin/ppgen 이 이미 정상 동작하면 그대로 사용 (재설치 생략).
#   2) GitHub Releases 에서 OS/arch 에 맞는 프리빌트 바이너리 다운로드 (Go 불필요).
#   3) (다운로드 실패 시) Go 소스 빌드: $PERFECTPIXEL_SRC > 동봉 .src > 저장소 클론.
# 성공 시 바이너리 절대경로를 마지막 줄(stdout)로 출력한다.
#
# 환경변수:
#   PP_VERSION   다운로드할 릴리스 태그 (기본: latest)
#   PP_BUILD=1   다운로드를 건너뛰고 항상 소스 빌드
#   PERFECTPIXEL_SRC  로컬 Go 소스 경로 (go.mod 포함)
set -euo pipefail

REPO="gykim80/perfectpixel-studio"
REPO_URL="https://github.com/${REPO}.git"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$SKILL_DIR/bin"
BIN="$BIN_DIR/ppgen"
mkdir -p "$BIN_DIR"

valid() { [ -x "$1" ] && "$1" -dump >/dev/null 2>&1; }

# 1) 이미 동작하는 바이너리 재사용
if valid "$BIN"; then
  echo "$BIN"; exit 0
fi

# OS/arch → 릴리스 자산 이름 매핑
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
esac
ext=""
case "$os" in
  msys*|mingw*|cygwin*) os="windows"; ext=".exe" ;;
esac
asset="ppgen-${os}-${arch}${ext}"

# 2) 프리빌트 바이너리 다운로드 (PP_BUILD=1 이면 건너뜀)
if [ "${PP_BUILD:-0}" != "1" ]; then
  ver="${PP_VERSION:-latest}"
  if [ "$ver" = "latest" ]; then
    url="https://github.com/${REPO}/releases/latest/download/${asset}"
  else
    url="https://github.com/${REPO}/releases/download/${ver}/${asset}"
  fi
  echo "프리빌트 바이너리 다운로드 시도: $url" >&2
  tmp="$(mktemp)"
  if curl -fsSL "$url" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    chmod +x "$tmp"
    mv "$tmp" "$BIN"
    if valid "$BIN"; then
      echo "$BIN"; exit 0
    fi
    echo "다운로드한 바이너리가 동작하지 않음 → 소스 빌드로 폴백" >&2
  else
    rm -f "$tmp"
    echo "프리빌트 바이너리 없음/다운로드 실패 → 소스 빌드로 폴백" >&2
  fi
fi

# 3) 소스 빌드
if ! command -v go >/dev/null 2>&1; then
  echo "오류: 프리빌트 바이너리를 받지 못했고 Go(1.25+)도 없습니다. https://go.dev/dl/ 설치 후 재시도하세요." >&2
  exit 1
fi

SRC=""
if [ -n "${PERFECTPIXEL_SRC:-}" ] && [ -f "${PERFECTPIXEL_SRC}/go.mod" ]; then
  SRC="$PERFECTPIXEL_SRC"
elif [ -f "$SKILL_DIR/.src/go.mod" ]; then
  SRC="$SKILL_DIR/.src"
else
  probe="$SKILL_DIR"
  for _ in 1 2 3 4 5 6; do
    probe="$(dirname "$probe")"
    if [ -f "$probe/go.mod" ] && [ -d "$probe/cmd/ppgen" ]; then
      SRC="$probe"; break
    fi
  done
fi

if [ -z "$SRC" ]; then
  SRC="$SKILL_DIR/.src"
  if [ ! -d "$SRC/.git" ]; then
    echo "공개 저장소에서 소스 클론 중: $REPO_URL" >&2
    git clone --depth 1 "$REPO_URL" "$SRC" >&2
  else
    git -C "$SRC" pull --ff-only >&2 || true
  fi
fi

echo "ppgen 빌드 중 (소스: $SRC)" >&2
( cd "$SRC" && go build -o "$BIN" ./cmd/ppgen )
if ! valid "$BIN"; then
  echo "오류: 빌드에 실패했습니다." >&2
  exit 1
fi
echo "$BIN"
