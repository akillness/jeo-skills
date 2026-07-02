#!/usr/bin/env bash
# Install the open-code-review (`ocr`) CLI.
# Usage: bash scripts/install.sh [--method npm|release|source] [--version vX.Y.Z] [--dir DIR]
set -euo pipefail

METHOD="${METHOD:-npm}"
OCR_VERSION="${OCR_VERSION:-}"
INSTALL_DIR="${OCR_INSTALL_DIR:-}"
REPO="alibaba/open-code-review"

while (($# > 0)); do
  case "$1" in
    --method)
      METHOD="$2"
      shift 2
      ;;
    --version)
      OCR_VERSION="$2"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash scripts/install.sh [--method npm|release|source] [--version vX.Y.Z] [--dir DIR]" >&2
      exit 2
      ;;
  esac
done

case "$METHOD" in
  npm)
    if ! command -v npm >/dev/null 2>&1; then
      echo "npm not found — install Node.js first, or use --method release." >&2
      exit 1
    fi
    npm install -g "@alibaba-group/open-code-review${OCR_VERSION:+@$OCR_VERSION}"
    ;;
  release)
    if ! command -v curl >/dev/null 2>&1; then
      echo "curl not found — required for the release installer." >&2
      exit 1
    fi
    # Official one-shot installer: picks the right release binary, verifies the
    # SHA-256 checksum, and installs it as `ocr`. Honors OCR_INSTALL_DIR / OCR_VERSION.
    OCR_INSTALL_DIR="${INSTALL_DIR}" OCR_VERSION="${OCR_VERSION}" \
      sh -c "$(curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/install.sh")"
    ;;
  source)
    for tool in git make; do
      command -v "$tool" >/dev/null 2>&1 || { echo "$tool not found — required for --method source." >&2; exit 1; }
    done
    workdir="$(mktemp -d)"
    git clone --depth 1 ${OCR_VERSION:+--branch "$OCR_VERSION"} "https://github.com/${REPO}.git" "$workdir/open-code-review"
    (cd "$workdir/open-code-review" && make build)
    target="${INSTALL_DIR:-/usr/local/bin}"
    if [[ -w "$target" ]]; then
      cp "$workdir/open-code-review/dist/opencodereview" "$target/ocr"
    else
      sudo cp "$workdir/open-code-review/dist/opencodereview" "$target/ocr"
    fi
    rm -rf "$workdir"
    ;;
  *)
    echo "Unsupported method: $METHOD (expected npm, release, or source)" >&2
    exit 2
    ;;
esac

if command -v ocr >/dev/null 2>&1; then
  ocr version || true
  echo
  echo "Next: configure an LLM provider, then verify connectivity:"
  echo "  ocr config provider && ocr config model   # interactive"
  echo "  ocr llm test                              # check connectivity"
else
  echo "ocr installed, but not on PATH yet — add the install directory to PATH." >&2
fi
