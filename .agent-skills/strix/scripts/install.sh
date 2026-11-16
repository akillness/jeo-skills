#!/usr/bin/env bash

set -euo pipefail

VERSION_VALUE=""
SKIP_IMAGE=false
SKIP_DOCKER_CHECK=false
AUTO_YES=false
STRIX_IMAGE_DEFAULT="${STRIX_IMAGE:-ghcr.io/usestrix/strix-sandbox:0.1.13}"

usage() {
  cat <<'EOF'
Usage: bash scripts/install.sh [options]

Options:
  --version <version>      Install a specific Strix release version
  --skip-image             Skip pulling the sandbox image
  --skip-docker-check      Skip Docker preflight checks
  -y, --yes                Skip interactive confirmation before running downloaded installer
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
    -y|--yes)
      AUTO_YES=true
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
  if [[ "$AUTO_YES" == false && -t 0 ]]; then
    read -r -p "Download and execute Strix installer from https://strix.ai/install? [y/N] " CONFIRM_INSTALL
    if [[ ! "$CONFIRM_INSTALL" =~ ^[Yy]$ ]]; then
      echo "Cancelled." >&2
      exit 0
    fi
  fi
  echo "Installing Strix..."
  INSTALLER_TMP="$(mktemp "${TMPDIR:-/tmp}/strix-install.XXXXXX.sh")"
  trap 'rm -f -- "$INSTALLER_TMP"' EXIT
  curl -fsSL --proto '=https' --tlsv1.2 https://strix.ai/install -o "$INSTALLER_TMP"
  if [[ ! -s "$INSTALLER_TMP" ]]; then
    echo "Downloaded installer is empty." >&2
    exit 1
  fi
  if [[ -n "${STRIX_INSTALL_SHA256:-}" ]]; then
    ACTUAL_SHA256="$(shasum -a 256 "$INSTALLER_TMP" | cut -d' ' -f1)"
    if [[ "$ACTUAL_SHA256" != "$STRIX_INSTALL_SHA256" ]]; then
      echo "Checksum verification failed (expected ${STRIX_INSTALL_SHA256}, got ${ACTUAL_SHA256})." >&2
      exit 1
    fi
  fi
  if [[ -n "$VERSION_VALUE" ]]; then
    env VERSION="$VERSION_VALUE" bash "$INSTALLER_TMP"
  else
    bash "$INSTALLER_TMP"
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
  case "$STRIX_IMAGE_DEFAULT" in
    *:latest)
      echo "Refusing unpinned :latest sandbox image: $STRIX_IMAGE_DEFAULT" >&2
      exit 1
      ;;
    *:*|*@sha256:*) ;;
    *)
      echo "Refusing sandbox image without explicit tag or @sha256 digest: $STRIX_IMAGE_DEFAULT" >&2
      exit 1
      ;;
  esac
  if docker image inspect "$STRIX_IMAGE_DEFAULT" >/dev/null 2>&1; then
    echo "Sandbox image already present: $STRIX_IMAGE_DEFAULT"
  else
    echo "Pulling sandbox image: $STRIX_IMAGE_DEFAULT"
    docker pull "${STRIX_IMAGE:-ghcr.io/usestrix/strix-sandbox:0.1.13}"
  fi
fi

cat <<'EOF'
Next steps:
  export STRIX_LLM="openai/gpt-5.4"
  export LLM_API_KEY="your-api-key"
  bash scripts/run-scan.sh --target ./app --scan-mode quick --dry-run
EOF
