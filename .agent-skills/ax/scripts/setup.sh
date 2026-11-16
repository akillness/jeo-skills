#!/bin/bash
# ax Setup Script — Install ax for your project or system
#
# Usage:
#   ./setup.sh                    # Interactive setup
#   ./setup.sh --system           # System-wide install
#   ./setup.sh --project          # Project-local install
#   ./setup.sh --verify           # Verify existing installation
#   ./setup.sh --uninstall        # Remove ax
#   ./setup.sh --help             # Show this help

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AX_VERSION="${AX_VERSION:-1.1.2}"
AX_REPO="${AX_REPO:-https://github.com/yusukebe/ax}"
AX_INSTALL_SCRIPT="${AX_INSTALL_SCRIPT:-https://ax.yusuke.run/install}"
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
  esac
done

# Detect OS and architecture
detect_platform() {
  local os arch
  
  case "$(uname -s)" in
    Linux*)     os="linux" ;;
    Darwin*)    os="macos" ;;
    MINGW*|MSYS*) os="windows" ;;
    *)          os="unknown" ;;
  esac
  
  case "$(uname -m)" in
    x86_64)     arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)          arch="unknown" ;;
  esac
  
  echo "$os" "$arch"
}

# Print colored output
log_info() {
  echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
  echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
  echo -e "${RED}✗${NC} $*" >&2
}

# Check if ax is installed
check_ax_installed() {
  if command -v ax &> /dev/null; then
    return 0
  fi
  return 1
}

# Get ax version
get_ax_version() {
  if check_ax_installed; then
    ax --version 2>/dev/null || echo "unknown"
  else
    echo "not installed"
  fi
}

# Verify ax installation
verify_installation() {
  log_info "Verifying ax installation..."
  
  if ! check_ax_installed; then
    log_error "ax is not installed or not in PATH"
    return 1
  fi
  
  local version
  version=$(get_ax_version)
  log_success "ax is installed: version $version"
  
  # Test basic functionality
  if ax --help &> /dev/null; then
    log_success "ax --help works"
  else
    log_error "ax --help failed"
    return 1
  fi
  
  if ax agent-context &> /dev/null; then
    log_success "ax agent-context works"
  else
    log_error "ax agent-context failed"
    return 1
  fi
  
  log_success "All verification checks passed"
  return 0
}

# Install ax via official script
install_official() {
  log_info "Installing ax via official install script..."
  
  if ! command -v curl &> /dev/null; then
    log_error "curl is required for installation"
    return 1
  fi
  
  if [[ "$AUTO_YES" == false && -t 0 ]]; then
    read -r -p "Download and execute official ax installer from ${AX_INSTALL_SCRIPT}? [y/N] " confirm_install
    if [[ ! "$confirm_install" =~ ^[Yy]$ ]]; then
      log_info "Installation cancelled"
      return 0
    fi
  fi
  local tmp_script
  tmp_script="$(mktemp "${TMPDIR:-/tmp}/ax-install.XXXXXX.sh")"
  trap 'rm -f -- "$tmp_script"' RETURN
  if curl -fsSL --proto '=https' --tlsv1.2 "$AX_INSTALL_SCRIPT" -o "$tmp_script" && [ -s "$tmp_script" ]; then
    if [ -n "${AX_INSTALL_SHA256:-}" ]; then
      local actual_sha256
      actual_sha256="$(shasum -a 256 "$tmp_script" | awk '{print $1}')"
      if [ "$actual_sha256" != "$AX_INSTALL_SHA256" ]; then
        log_error "Checksum verification failed (expected ${AX_INSTALL_SHA256}, got ${actual_sha256})"
        return 1
      fi
    fi
    if bash "$tmp_script"; then
      log_success "ax installed successfully"
      if verify_installation; then
        return 0
      else
        log_warn "Installation completed but verification failed"
        return 1
      fi
    else
      log_error "Installation failed"
      return 1
    fi
  else
    log_error "Failed to download installer from $AX_INSTALL_SCRIPT"
    return 1
  fi
}

# Install via Homebrew
install_homebrew() {
  log_info "Installing ax via Homebrew..."
  
  if ! command -v brew &> /dev/null; then
    log_error "Homebrew is not installed. Install from https://brew.sh"
    return 1
  fi
  
  if brew install yusukebe/tap/ax; then
    log_success "ax installed via Homebrew"
    verify_installation
  else
    log_error "Homebrew installation failed"
    return 1
  fi
}

# Install via npm
install_npm() {
  log_info "Installing ax via npm..."
  
  if ! command -v npm &> /dev/null; then
    log_error "npm is not installed. Install Node.js from https://nodejs.org"
    return 1
  fi
  
  if npm install -g ax-cli; then
    log_success "ax installed via npm"
    verify_installation
  else
    log_error "npm installation failed"
    return 1
  fi
}

# Project-local installation
install_project_local() {
  local project_dir="${1:-.}"
  local bin_dir="$project_dir/.bin"
  
  log_info "Setting up project-local ax in $bin_dir..."
  
  mkdir -p "$bin_dir"
  
  if ! command -v curl &> /dev/null; then
    log_error "curl is required for downloading"
    return 1
  fi
  
  local os arch
  read -r os arch <<< "$(detect_platform)"
  
  if [ "$os" = "unknown" ] || [ "$arch" = "unknown" ]; then
    log_error "Unsupported platform: $os $arch"
    return 1
  fi
  
  local binary_url="https://ax.yusuke.run/download/ax-${os}-${arch}"
  log_info "Downloading from $binary_url..."
  
  local tmp_bin
  tmp_bin="$(mktemp "${bin_dir}/.ax.XXXXXX")"
  if curl -fsSL --proto '=https' --tlsv1.2 "$binary_url" -o "$tmp_bin" && [ -s "$tmp_bin" ]; then
    if [ -n "${AX_BINARY_SHA256:-}" ]; then
      local actual_bin_sha256
      actual_bin_sha256="$(shasum -a 256 "$tmp_bin" | awk '{print $1}')"
      if [ "$actual_bin_sha256" != "$AX_BINARY_SHA256" ]; then
        unlink "$tmp_bin"
        log_error "Binary checksum verification failed"
        return 1
      fi
    fi
    install -m 0755 "$tmp_bin" "$bin_dir/ax"
    unlink "$tmp_bin"
    log_success "ax downloaded to $bin_dir/ax"
    log_info "Add $bin_dir to your PATH for this shell:"
    log_info "  export PATH=\"$bin_dir:\$PATH\""
    log_info "Then run: ax --version"
    
    return 0
  else
    log_error "Failed to download ax"
    return 1
  fi
}

# Interactive setup
interactive_setup() {
  echo ""
  echo -e "${BLUE}ax Setup${NC}"
  echo "=================="
  echo ""
  
  # Check if already installed
  if check_ax_installed; then
    local version
    version=$(get_ax_version)
    log_success "ax is already installed: version $version"
    
    read -p "Reinstall? (y/N) " -n 1 -r reinstall
    echo
    if [[ ! $reinstall =~ ^[Yy]$ ]]; then
      return 0
    fi
  fi
  
  echo "Choose installation method:"
  echo "  1) Official installer (recommended)"
  echo "  2) Homebrew (macOS/Linux)"
  echo "  3) npm (requires Node.js)"
  echo "  4) Project-local (./.bin/ax)"
  echo ""
  
  read -p "Select (1-4): " -n 1 choice
  echo ""
  
  case "$choice" in
    1) install_official ;;
    2) install_homebrew ;;
    3) install_npm ;;
    4) install_project_local "." ;;
    *)
      log_error "Invalid choice"
      return 1
      ;;
  esac
}

# Uninstall ax
uninstall() {
  log_info "Uninstalling ax..."
  
  if check_ax_installed; then
    log_warn "This will uninstall ax from your system"
    read -p "Continue? (y/N) " -n 1 -r confirm
    echo
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
      log_info "Uninstall cancelled"
      return 0
    fi
    
    # Try different uninstall methods
    if command -v brew &> /dev/null && brew list ax &> /dev/null 2>&1; then
      brew uninstall ax
      log_success "Uninstalled via Homebrew"
    elif command -v npm &> /dev/null; then
      npm uninstall -g ax-cli
      log_success "Uninstalled via npm"
    else
      log_warn "Could not detect installation method"
      log_info "Manual uninstall:"
      log_info "  Remove the installed binary from ~/.local/bin/ax and any unused ax cache directory."
    fi
  else
    log_info "ax is not installed"
  fi
}

# Show help
show_help() {
  cat << 'EOF'
ax Setup Script

Usage:
  ./setup.sh                    Interactive setup
  ./setup.sh --system           System-wide install (official)
  ./setup.sh --homebrew         Install via Homebrew
  ./setup.sh --npm              Install via npm
  ./setup.sh --project          Project-local install (./.bin/)
  ./setup.sh --verify           Verify existing installation
  ./setup.sh --uninstall        Remove ax
  ./setup.sh --help             Show this help

Environment Variables:
  AX_VERSION                    Version to install (default: 1.1.2)
  AX_REPO                       Repository URL
  AX_INSTALL_SCRIPT             Official install script URL

Examples:
  # System-wide installation
  ./setup.sh --system

  # Project-local (no system modifications)
  ./setup.sh --project
  export PATH="$PWD/.bin:$PATH"

  # Verify installation
  ./setup.sh --verify

  # Then test
  ax --version
  ax https://example.com --outline
EOF
}

# Main
main() {
  local cmd="${1:-}"
  
  case "$cmd" in
    --system)
      install_official
      ;;
    --homebrew)
      install_homebrew
      ;;
    --npm)
      install_npm
      ;;
    --project)
      install_project_local "${2:-.}"
      ;;
    --verify)
      verify_installation
      ;;
    --uninstall)
      uninstall
      ;;
    --help|-h)
      show_help
      ;;
    "")
      interactive_setup
      ;;
    *)
      log_error "Unknown option: $cmd"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
