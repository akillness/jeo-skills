#!/usr/bin/env bash

set -euo pipefail

VERSION_VALUE=""
SKIP_IMAGE=false
SKIP_DOCKER_CHECK=false
STRIX_IMAGE_DEFAULT="${STRIX_IMAGE:-ghcr.io/usestrix/strix-sandbox:0.1.13}"

usage() {
  cat <<'EOF'
Usage: bash scripts/install.sh [options]

Options:
  --version <version>      Install a specific Strix release version
  --skip-image             Skip pulling the sandbox image
  --skip-docker-check      Skip Docker preflight checks
  -h, --help               Show this help
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION_VALUE="${2:-}"
      if [[ -z "$VERSION_VALUE" ]]; then
        echo "--version requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --skip-image)
      SKIP_IMAGE=true
      shift
      ;;
    --skip-docker-check)
      SKIP_DOCKER_CHECK=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

need_cmd curl

if ! command -v strix >/dev/null 2>&1; then
  echo "Installing Strix..."
  if [[ -n "$VERSION_VALUE" ]]; then
    env VERSION="$VERSION_VALUE" bash -lc 'curl -sSL https://strix.ai/install | bash'
  else
    bash -lc 'curl -sSL https://strix.ai/install | bash'
  fi
else
  echo "Strix already present on PATH; skipping binary install."
fi

if ! command -v strix >/dev/null 2>&1; then
  echo "Strix installation failed or the binary is not on PATH." >&2
  exit 1
fi

echo "Installed version:"
strix --version || true

if [[ "$SKIP_DOCKER_CHECK" == true ]]; then
  exit 0
fi

need_cmd docker

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but the daemon is not running." >&2
  exit 1
fi

if [[ "$SKIP_IMAGE" == false ]]; then
  if docker image inspect "$STRIX_IMAGE_DEFAULT" >/dev/null 2>&1; then
    echo "Sandbox image already present: $STRIX_IMAGE_DEFAULT"
  else
    echo "Pulling sandbox image: $STRIX_IMAGE_DEFAULT"
    docker pull "$STRIX_IMAGE_DEFAULT"
  fi
fi

cat <<'EOF'
Next steps:
  export STRIX_LLM="openai/gpt-5.4"
  export LLM_API_KEY="your-api-key"
  bash scripts/run-scan.sh --target ./app --scan-mode quick --dry-run
EOF
