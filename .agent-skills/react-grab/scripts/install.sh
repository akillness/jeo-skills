#!/usr/bin/env bash
# react-grab install script
# Installs react-grab in the current project via the grab CLI
#
# Usage:
#   bash scripts/install.sh                        # auto-detect framework
#   bash scripts/install.sh --framework next-app   # Next.js App Router
#   bash scripts/install.sh --framework next-pages # Next.js Pages Router
#   bash scripts/install.sh --framework vite        # Vite
#   bash scripts/install.sh --framework webpack     # Webpack
#
# Requirements: Node.js >=22 and npm (with "npx")

set -euo pipefail

FRAMEWORK=""
YES_FLAG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --framework|-f)
      FRAMEWORK="$2"
      shift 2
      ;;
    --yes|-y)
      YES_FLAG="--yes"
      shift
      ;;
    --help|-h)
      echo "Usage: bash scripts/install.sh [--framework <next-app|next-pages|vite|webpack>] [--yes]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required. Install from https://nodejs.org/ (>=22 required)"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 22 ]]; then
  echo "❌ Node.js >=22 is required (current: $(node --version))"
  exit 1
fi

# Check "npx" binary
if ! command -v "npx" &>/dev/null; then
  echo "❌ Missing 'npx' binary. Install Node.js/npm so 'npx' is on PATH."
  exit 1
fi

echo "📦 Installing react-grab..."
echo ""

if [[ -n "$FRAMEWORK" ]]; then
  # Manual framework mode: install package, then add script tag
  echo "🔧 Framework: $FRAMEWORK"

  # Detect package manager
  PM="npm"
  if [[ -f "bun.lockb" ]] || command -v bun &>/dev/null && [[ -f "package.json" ]]; then
    PM="bun"
  elif [[ -f "pnpm-lock.yaml" ]]; then
    PM="pnpm"
  elif [[ -f "yarn.lock" ]]; then
    PM="yarn"
  fi

  echo "📦 Package manager: $PM"

  # Install react-grab package
  case "$PM" in
    bun)   bun add -d react-grab ;;
    pnpm)  pnpm add -D react-grab ;;
    yarn)  yarn add --dev react-grab ;;
    *)     npm install --save-dev react-grab ;;
  esac

  echo ""
  echo "✅ react-grab installed as dev dependency"
  echo ""
  echo "📋 See references/install-and-routing.md for the dev-only entry-point snippet."
  echo ""

  case "$FRAMEWORK" in
    next-app)
      echo "Target file: app/layout.tsx (Next.js App Router section in references/install-and-routing.md)"
      ;;
    next-pages)
      echo "Target file: pages/_document.tsx (Next.js Pages Router section in references/install-and-routing.md)"
      ;;
    vite)
      echo "Target file: client entry module (Vite section in references/install-and-routing.md)"
      ;;
    webpack)
      echo "Target file: webpack entry module (Webpack section in references/install-and-routing.md)"
      ;;
    *)
      echo "Unknown framework: $FRAMEWORK"
      echo "Supported: next-app, next-pages, vite, webpack"
      ;;
  esac

else
  # Auto-detect mode (recommended)
  echo "🔍 Auto-detecting framework..."
  npx -y grab@0.2.0 init $YES_FLAG
fi

echo ""
echo "✅ react-grab installation complete!"
echo ""
echo "Next steps:"
echo "  1. Start your dev server (npm run dev / bun dev)"
echo "  2. Open your app in the browser"
echo "  3. Hover over any element and press Cmd+C (Mac) or Ctrl+C (Win/Linux)"
echo "  4. Paste the context into your AI coding agent!"
echo ""
echo "Add to an AI agent: bash scripts/add-agent.sh <agent>"
echo "  Supported: claude-code, cursor, copilot, codex, gemini, opencode, amp, mcp"
