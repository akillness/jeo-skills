#!/usr/bin/env bash
set -euo pipefail

METHOD="auto"
REPO="akillness/rtk"
FORCE_UNINSTALL_WRONG=0
SKIP_VERIFY=0

usage() {
  cat <<'EOF'
Usage: bash scripts/install.sh [options]

Options:
  --method auto|brew|script|cargo
  --repo <owner/name>              Default: akillness/rtk
  --force-uninstall-wrong          Try cargo uninstall rtk before reinstalling
  --skip-verify                    Skip final rtk gain verification
  -h, --help                       Show this help
EOF
}

log() {
  printf '[rtk-install] %s\n' "$*"
}

warn() {
  printf '[rtk-install][warn] %s\n' "$*" >&2
}

die() {
  printf '[rtk-install][error] %s\n' "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

have_correct_rtk() {
  have_cmd rtk && rtk gain >/dev/null 2>&1
}

have_wrong_rtk() {
  have_cmd rtk && ! rtk gain >/dev/null 2>&1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --method)
      METHOD="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --force-uninstall-wrong)
      FORCE_UNINSTALL_WRONG=1
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

case "$METHOD" in
  auto|brew|script|cargo) ;;
  *)
    die "Unsupported method: $METHOD"
    ;;
esac

if have_correct_rtk; then
  log "Correct RTK already installed: $(rtk --version)"
  exit 0
fi

if have_wrong_rtk; then
  warn "rtk exists but 'rtk gain' failed. This is often the wrong package."
  if [[ "$FORCE_UNINSTALL_WRONG" -eq 1 ]]; then
    if have_cmd cargo; then
      cargo uninstall rtk || true
      log "Attempted cargo uninstall for the wrong RTK package."
    else
      warn "cargo is unavailable, so automatic uninstall was skipped."
    fi
  else
    warn "Continuing without uninstall. Re-run with --force-uninstall-wrong if PATH shadowing persists."
  fi
fi

choose_auto_method() {
  if [[ "$(uname -s)" == "Darwin" ]] && have_cmd brew; then
    printf 'brew\n'
    return
  fi
  if have_cmd curl; then
    printf 'script\n'
    return
  fi
  if have_cmd cargo; then
    printf 'cargo\n'
    return
  fi
  die "Need one of: Homebrew, curl, or cargo."
}

install_with_brew() {
  have_cmd brew || die "brew is not installed."
  if brew list rtk >/dev/null 2>&1; then
    log "Updating existing Homebrew RTK formula."
    brew upgrade rtk || brew reinstall rtk
  else
    log "Installing RTK with Homebrew."
    brew install rtk
  fi
}

install_with_script() {
  have_cmd curl || die "curl is required for --method script."
  local url="https://raw.githubusercontent.com/${REPO}/refs/heads/master/install.sh"
  log "Installing RTK via ${url}"
  curl -fsSL "$url" | sh
}

install_with_cargo() {
  have_cmd cargo || die "cargo is required for --method cargo."
  log "Installing RTK from git repository https://github.com/${REPO}"
  cargo install --git "https://github.com/${REPO}" --force
}

if [[ "$METHOD" == "auto" ]]; then
  METHOD="$(choose_auto_method)"
  log "Auto-selected install method: ${METHOD}"
fi

case "$METHOD" in
  brew) install_with_brew ;;
  script) install_with_script ;;
  cargo) install_with_cargo ;;
esac

if [[ "$SKIP_VERIFY" -eq 1 ]]; then
  log "Skipping verification by request."
  exit 0
fi

have_cmd rtk || die "Installation completed but 'rtk' is still not on PATH."
log "Installed binary: $(command -v rtk)"
rtk --version
rtk gain >/dev/null
log "Verification passed: 'rtk gain' works."
