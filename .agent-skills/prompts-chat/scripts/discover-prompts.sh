#!/bin/bash
# discover-prompts.sh — Fetch and search prompts.chat collection
# Usage: ./discover-prompts.sh [search-term] [output-format]
# Formats: list (default), json, markdown

set -e

REPO_URL="https://github.com/f/prompts.chat"
REPO_DIR="${PROMPTS_CHAT_DIR:-./.prompts-cache}"
SEARCH_TERM="${1:-}"
OUTPUT_FORMAT="${2:-list}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== prompts.chat Discovery Tool ===${NC}"
echo "Repository: $REPO_URL"
echo ""

# Step 1: Clone or update repository
if [ ! -d "$REPO_DIR" ]; then
    echo "Fetching prompts.chat repository..."
    git clone --depth 1 "$REPO_URL" "$REPO_DIR" 2>/dev/null || {
        echo "Could not clone repository. Using API fallback..."
        mkdir -p "$REPO_DIR"
    }
else
    echo "Updating local cache..."
    cd "$REPO_DIR"
    git pull origin main 2>/dev/null || echo "Cache update skipped"
    cd - > /dev/null
fi

# Step 2: Find and list prompts
echo "Scanning for prompts..."
echo ""

if [ -d "$REPO_DIR/prompts" ]; then
    # If directory structure exists
    if [ -z "$SEARCH_TERM" ]; then
        # List all categories
        echo -e "${GREEN}Available Categories:${NC}"
        find "$REPO_DIR/prompts" -maxdepth 1 -type d | sort | tail -n +2 | while read -r dir; do
            CATEGORY=$(basename "$dir")
            COUNT=$(find "$dir" -name "*.md" 2>/dev/null | wc -l)
            echo "  • $CATEGORY ($COUNT prompts)"
        done
    else
        # Search for matching prompts
        echo -e "${GREEN}Matching Prompts:${NC}"
        find "$REPO_DIR/prompts" -name "*.md" -type f | while read -r file; do
            if grep -q "$SEARCH_TERM" "$file" -i; then
                PROMPT_NAME=$(basename "$file" .md)
                PROMPT_DIR=$(dirname "$file" | xargs basename)
                echo "  ✓ $PROMPT_NAME (Category: $PROMPT_DIR)"
                
                if [ "$OUTPUT_FORMAT" = "markdown" ]; then
                    echo "    Source: $file"
                    echo "    Content preview:"
                    head -5 "$file" | sed 's/^/      /'
                    echo ""
                fi
            fi
        done
    fi
    
    echo ""
    echo -e "${GREEN}Tip:${NC} Use 'cat $REPO_DIR/prompts/<category>/<prompt>.md' to view full prompt"
else
    echo "Repository structure not found. Please check the prompts.chat repository."
    echo "Visit: $REPO_URL"
fi

# Step 3: Show usage tips
echo ""
echo -e "${BLUE}=== Usage Tips ===${NC}"
echo "1. Export a prompt: cat '$REPO_DIR/prompts/<category>/<name>.md'"
echo "2. Copy to local library: cp '$REPO_DIR/prompts/<category>/<name>.md' ./prompts/approved/"
echo "3. Search by keyword: ./discover-prompts.sh 'keyword'"
echo "4. Get JSON output: ./discover-prompts.sh 'keyword' json"
echo ""
echo "Repository: $REPO_URL"
echo "Cache location: $REPO_DIR"
