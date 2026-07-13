#!/bin/bash
# fetch-docs.sh - Fetch documentation for react-bits

set -e

TARGET="${1:-readme}"
REPO="DavidHDev/react-bits"
BRANCH="main"

case "$TARGET" in
  readme)
    curl -sSf "https://raw.githubusercontent.com/$REPO/$BRANCH/README.md"
    ;;
  package)
    curl -sSf "https://raw.githubusercontent.com/$REPO/$BRANCH/package.json"
    ;;
  contributing)
    curl -sSf "https://raw.githubusercontent.com/$REPO/$BRANCH/CONTRIBUTING.md"
    ;;
  *)
    echo "Unknown target: $TARGET. Supported: readme, package, contributing" >&2
    exit 1
    ;;
esac
