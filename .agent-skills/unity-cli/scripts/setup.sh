#!/bin/bash
# Unity CLI Setup Script
# Installs or validates the Unity Command Line Interface
# Usage: bash setup.sh [--install|--ci|--check|--diagnose] [--yes]

set -e

COMMAND="${1:---check}"
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
  esac
done
UNITY_CLI_CHANNEL="${UNITY_CLI_CHANNEL:-stable}"

download_and_run_installer() {
  local url="https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh"
  if [[ "$AUTO_YES" == false && -t 0 ]]; then
    read -r -p "Download and run official Unity CLI installer from ${url}? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "Cancelled."
      exit 0
    fi
  fi
  local tmp_script
  tmp_script="$(mktemp "${TMPDIR:-/tmp}/unity-cli-install.XXXXXX.sh")"
  trap 'rm -f -- "$tmp_script"' RETURN
  curl -fsSL --proto '=https' --tlsv1.2 "$url" -o "$tmp_script"
  if [[ ! -s "$tmp_script" ]]; then
    echo "Downloaded installer is empty." >&2
    exit 1
  fi
  if [[ -n "${UNITY_CLI_INSTALL_SHA256:-}" ]]; then
    local actual_sha256
    actual_sha256="$(shasum -a 256 "$tmp_script" | awk '{print $1}')"
    if [[ "$actual_sha256" != "$UNITY_CLI_INSTALL_SHA256" ]]; then
      echo "Checksum verification failed (expected ${UNITY_CLI_INSTALL_SHA256}, got ${actual_sha256})." >&2
      exit 1
    fi
  fi
  bash "$tmp_script"
}
echo "[Unity CLI Setup]"

case "$COMMAND" in
  --install)
    echo "Installing Unity CLI..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      echo "Detected macOS"
      download_and_run_installer
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      # Linux
      echo "Detected Linux"
      download_and_run_installer
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
      # Windows
      echo "Detected Windows"
      echo "Download https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1, inspect it, and run it in PowerShell."
    else
      echo "Unknown OS: $OSTYPE"
      exit 1
    fi
    echo "✓ Unity CLI installed"
    ;;
    
  --ci)
    echo "Setting up for CI environment..."
    # In CI, ensure .NET runtime is available
    if ! command -v dotnet &> /dev/null; then
      echo "⚠ .NET runtime not found. Installing..."
      if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        apt-get update
        apt-get install -y dotnet-runtime-7.0
      elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install dotnet
      else
        echo "Please install .NET 6.0 or later manually"
        exit 1
      fi
    fi
    
    # Install Unity CLI
    bash "$(dirname "$0")/setup.sh" --install --yes
    
    # Validate
    bash "$(dirname "$0")/setup.sh" --check
    echo "✓ CI environment ready"
    ;;
    
  --check)
    echo "Checking installation..."
    
    # Check .NET
    if command -v dotnet &> /dev/null; then
      DOTNET_VERSION=$(dotnet --version)
      echo "✓ .NET runtime: $DOTNET_VERSION"
    else
      echo "✗ .NET runtime not found"
      echo "  Install from: https://dotnet.microsoft.com/"
      exit 1
    fi
    
    # Check Unity CLI
    if command -v unity-cli &> /dev/null; then
      CLI_VERSION=$(unity-cli --version 2>/dev/null || echo "unknown")
      echo "✓ Unity CLI: $CLI_VERSION"
    elif command -v unity &> /dev/null; then
      echo "✓ Unity CLI found (as 'unity' command)"
    else
      echo "✗ Unity CLI not found in PATH"
      echo "  Run: bash setup.sh --install"
      exit 1
    fi
    
    echo "✓ All checks passed"
    ;;
    
  --diagnose)
    echo "Diagnosing installation issues..."
    echo ""
    
    echo "=== Environment ==="
    echo "OS: $OSTYPE"
    echo "Shell: $SHELL"
    echo "PATH: $PATH"
    echo ""
    
    echo "=== .NET Runtime ==="
    if command -v dotnet &> /dev/null; then
      dotnet --version
      dotnet --list-runtimes
    else
      echo "✗ .NET not found"
    fi
    echo ""
    
    echo "=== Unity CLI ==="
    if command -v unity-cli &> /dev/null; then
      echo "✓ Found at: $(which unity-cli)"
      unity-cli --version
      unity-cli doctor
    elif command -v unity &> /dev/null; then
      echo "✓ Found as 'unity' at: $(which unity)"
      unity --version
      unity doctor
    else
      echo "✗ Unity CLI not found"
      echo "  Expected in: $HOME/.unity/cli or system PATH"
    fi
    echo ""
    
    echo "=== Suggestions ==="
    if ! command -v dotnet &> /dev/null; then
      echo "1. Install .NET 6.0+: https://dotnet.microsoft.com/"
    fi
    if ! command -v unity-cli &> /dev/null && ! command -v unity &> /dev/null; then
      echo "2. Install Unity CLI: bash setup.sh --install"
    fi
    ;;
    
  *)
    echo "Usage: bash setup.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  --install   Install Unity CLI from official source"
    echo "  --ci        Setup for CI/CD environment"
    echo "  --check     Verify installation (default)"
    echo "  --diagnose  Diagnose installation issues"
    echo ""
    echo "Environment:"
    echo "  UNITY_CLI_CHANNEL  Channel to install: stable (default) or beta"
    exit 1
    ;;
esac
