#!/bin/bash

###############################################################################
# AMRouter Setup Script
# Install, configure, and verify AMRouter for agents
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
MODE="help"
INSTALL_DIR="$HOME/.local/amrouter"
AUTO_YES=false

###############################################################################
# Functions
###############################################################################

print_header() {
  echo -e "\n${BLUE}▼▼▼ $1 ▼▼▼${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

confirm() {
  if [[ "$AUTO_YES" == "true" ]]; then
    return 0
  fi
  
  local prompt="$1"
  local response
  read -p "$prompt (y/n) " -n 1 -r response
  echo
  [[ "$response" =~ ^[Yy]$ ]]
}

check_requirements() {
  print_header "Checking Requirements"
  
  local missing=false
  
  # Check Node.js
  if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Install from https://nodejs.org/"
    missing=true
  else
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 20 ]]; then
      print_error "Node.js 20+ required (found v$node_version)"
      missing=true
    else
      print_success "Node.js $(node -v)"
    fi
  fi
  
  # Check npm
  if ! command -v npm &> /dev/null; then
    print_error "npm not found"
    missing=true
  else
    print_success "npm $(npm -v)"
  fi
  
  # Check git
  if ! command -v git &> /dev/null; then
    print_warning "git not found (optional, for cloning)"
  else
    print_success "git $(git -v | cut -d' ' -f3)"
  fi
  
  if [[ "$missing" == "true" ]]; then
    print_error "Missing requirements. Please install and try again."
    exit 1
  fi
}

install_amrouter() {
  print_header "Installing AMRouter"
  
  if [[ -d "$INSTALL_DIR" ]]; then
    print_warning "AMRouter already installed at $INSTALL_DIR"
    if ! confirm "Reinstall?"; then
      return
    fi
    rm -rf "$INSTALL_DIR"
  fi
  
  mkdir -p "$INSTALL_DIR"
  
  if command -v git &> /dev/null; then
    print_info "Cloning from GitHub..."
    git clone --depth=1 https://github.com/ahwanulm/AMRouter.git "$INSTALL_DIR" 2>&1 | grep -E "(Cloning|Updating)"
  else
    print_error "git required for installation. Install from https://git-scm.com/"
    exit 1
  fi
  
  cd "$INSTALL_DIR"
  
  print_info "Installing dependencies..."
  npm install --production > /dev/null 2>&1
  
  print_info "Building frontend..."
  cd frontend
  npm install > /dev/null 2>&1
  npm run build > /dev/null 2>&1
  cd ..
  
  print_success "AMRouter installed to $INSTALL_DIR"
  
  # Create .env if not exists
  if [[ ! -f "backend/.env" ]]; then
    print_info "Creating .env file..."
    cp backend/.env.template backend/.env
    sed -i.bak "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$(openssl rand -hex 16)/" backend/.env
    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" backend/.env
    print_success ".env created with random secrets"
  fi
}

configure_amrouter() {
  print_header "Configuring AMRouter"
  
  if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
    print_error ".env not found at $INSTALL_DIR/backend/.env"
    exit 1
  fi
  
  print_info "Current configuration:"
  grep -E "^(PORT|NODE_ENV|ADMIN_PASSWORD|REQUIRE_LOGIN)=" "$INSTALL_DIR/backend/.env" | head -4
  
  if ! confirm "Edit configuration?"; then
    return
  fi
  
  if [[ -n "$EDITOR" ]]; then
    $EDITOR "$INSTALL_DIR/backend/.env"
  else
    nano "$INSTALL_DIR/backend/.env"
  fi
  
  print_success "Configuration updated"
}

start_amrouter() {
  print_header "Starting AMRouter"
  
  if [[ ! -d "$INSTALL_DIR" ]]; then
    print_error "AMRouter not installed. Run 'setup.sh --install' first"
    exit 1
  fi
  
  cd "$INSTALL_DIR"
  
  print_info "Starting backend (port 3001)..."
  
  if command -v pm2 &> /dev/null; then
    pm2 start backend/index.js --name amrouter --cwd "$INSTALL_DIR"
    pm2 save
    print_success "AMRouter started (pm2)"
    echo ""
    echo "View logs: pm2 logs amrouter"
    echo "Stop: pm2 stop amrouter"
  else
    npm start &
    print_success "AMRouter started (background)"
    echo ""
    echo "To stop, run: killall node"
  fi
  
  sleep 2
  
  print_info "Testing backend..."
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Backend running on http://localhost:3001"
  else
    print_warning "Backend not responding yet (may need more time to start)"
  fi
}

verify_amrouter() {
  print_header "Verifying AMRouter"
  
  local passed=0
  local failed=0
  
  # Test 1: Backend running
  print_info "Testing backend..."
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Backend running"
    ((passed++))
  else
    print_error "Backend not responding"
    ((failed++))
  fi
  
  # Test 2: Models endpoint
  print_info "Testing /v1/models endpoint..."
  if curl -s http://localhost:3001/v1/models 2>&1 | grep -q '"data"'; then
    print_success "Models endpoint working"
    ((passed++))
  else
    print_error "Models endpoint failed"
    ((failed++))
  fi
  
  # Test 3: Check provider keys
  if [[ -n "$AMROUTER_KEY" ]]; then
    print_info "Testing authenticated request..."
    if curl -s -H "Authorization: Bearer $AMROUTER_KEY" \
        http://localhost:3001/api/quota/providers 2>&1 | grep -q '"provider"'; then
      print_success "Authentication working"
      ((passed++))
    else
      print_warning "Authentication may not be configured yet"
    fi
  fi
  
  echo ""
  print_info "Results: $passed passed, $failed failed"
  
  if [[ $failed -eq 0 ]]; then
    print_success "All tests passed!"
  else
    print_warning "Some tests failed. Check logs and configuration."
  fi
}

generate_agent_code() {
  print_header "Generating Agent Code"
  
  local lang="${1:-javascript}"
  local output_dir="${2:-.}"
  
  mkdir -p "$output_dir"
  
  case "$lang" in
    javascript|js)
      cat > "$output_dir/amrouter-agent.js" << 'EOF'
#!/usr/bin/env node

/**
 * AMRouter Agent Integration
 * Use AMRouter as an OpenAI SDK drop-in replacement
 */

import OpenAI from 'openai';

const AMROUTER_URL = process.env.AMROUTER_URL || 'http://localhost:3001';
const AMROUTER_KEY = process.env.AMROUTER_KEY || 'sk-amrouter-default';

// Create OpenAI client pointing to AMRouter
const client = new OpenAI({
  baseURL: `${AMROUTER_URL}/v1`,
  apiKey: AMROUTER_KEY,
});

async function main() {
  console.log('📡 Connecting to AMRouter at', AMROUTER_URL);

  // List available models
  const models = await client.models.list();
  console.log('✓ Available models:', models.data.slice(0, 5).map(m => m.id).join(', '), '...');

  // Chat with fallback combo
  console.log('\n💬 Sending chat request...');
  const res = await client.chat.completions.create({
    model: 'openai/gpt-4o',  // or combo name like 'vip'
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 2+2?' }
    ],
    temperature: 0.7,
  });

  console.log('Response:', res.choices[0].message.content);
  console.log('Tokens used:', res.usage.total_tokens);
}

main().catch(console.error);
EOF
      chmod +x "$output_dir/amrouter-agent.js"
      print_success "Generated: $output_dir/amrouter-agent.js"
      ;;
    python|py)
      cat > "$output_dir/amrouter_agent.py" << 'EOF'
#!/usr/bin/env python3

"""
AMRouter Agent Integration
Use AMRouter as an OpenAI Python SDK drop-in replacement
"""

import os
from openai import OpenAI

AMROUTER_URL = os.getenv('AMROUTER_URL', 'http://localhost:3001')
AMROUTER_KEY = os.getenv('AMROUTER_KEY', 'sk-amrouter-default')

# Create OpenAI client pointing to AMRouter
client = OpenAI(
    base_url=f'{AMROUTER_URL}/v1',
    api_key=AMROUTER_KEY,
)

def main():
    print(f'📡 Connecting to AMRouter at {AMROUTER_URL}')

    # List available models
    models = client.models.list()
    model_ids = [m.id for m in models.data[:5]]
    print(f'✓ Available models: {", ".join(model_ids)}, ...')

    # Chat with fallback combo
    print('\n💬 Sending chat request...')
    res = client.chat.completions.create(
        model='openai/gpt-4o',  # or combo name like 'vip'
        messages=[
            {'role': 'system', 'content': 'You are a helpful assistant.'},
            {'role': 'user', 'content': 'What is 2+2?'}
        ],
        temperature=0.7,
    )

    print('Response:', res.choices[0].message.content)
    print('Tokens used:', res.usage.total_tokens)

if __name__ == '__main__':
    main()
EOF
      chmod +x "$output_dir/amrouter_agent.py"
      print_success "Generated: $output_dir/amrouter_agent.py"
      ;;
    bash|sh)
      cat > "$output_dir/amrouter-agent.sh" << 'EOF'
#!/bin/bash

# AMRouter Agent Integration via curl

AMROUTER_URL="${AMROUTER_URL:-http://localhost:3001}"
AMROUTER_KEY="${AMROUTER_KEY:-sk-amrouter-default}"

echo "📡 Connecting to AMRouter at $AMROUTER_URL"

# List available models
echo "✓ Available models:"
curl -s "$AMROUTER_URL/v1/models" \
  -H "Authorization: Bearer $AMROUTER_KEY" | \
  jq '.data[0:5] | .[].id' | head -5

# Chat with fallback combo
echo ""
echo "💬 Sending chat request..."
curl -X POST "$AMROUTER_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AMROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "temperature": 0.7
  }' | jq '.choices[0].message.content'
EOF
      chmod +x "$output_dir/amrouter-agent.sh"
      print_success "Generated: $output_dir/amrouter-agent.sh"
      ;;
    *)
      print_error "Unknown language: $lang (use: javascript, python, bash)"
      ;;
  esac
  
  echo ""
  print_info "Generated agent code. Environment variables required:"
  echo "  export AMROUTER_URL=http://localhost:3001"
  echo "  export AMROUTER_KEY=sk-amrouter-xxx"
}

show_help() {
  cat << 'EOF'
AMRouter Setup Script

USAGE:
  setup.sh [COMMAND] [OPTIONS]

COMMANDS:
  --install             Install AMRouter
  --configure           Configure .env file
  --start               Start AMRouter server
  --verify              Verify installation
  --generate-code LANG  Generate agent code (javascript, python, bash)
  --help                Show this help message

OPTIONS:
  --dir PATH            Installation directory (default: ~/.local/amrouter)
  -y, --yes             Skip confirmation prompts

EXAMPLES:
  # Full setup
  setup.sh --install --configure --start --verify

  # Quick start
  setup.sh -y --install --start

  # Generate Python agent code
  setup.sh --generate-code python --dir ./my-project

  # Verify existing installation
  setup.sh --verify
EOF
}

###############################################################################
# Main
###############################################################################

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --install)
      MODE="install"
      shift
      ;;
    --configure)
      MODE="configure"
      shift
      ;;
    --start)
      MODE="start"
      shift
      ;;
    --verify)
      MODE="verify"
      shift
      ;;
    --generate-code)
      MODE="generate-code"
      LANG="${2:-javascript}"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# Execute modes
case "$MODE" in
  install)
    check_requirements
    install_amrouter
    ;;
  configure)
    configure_amrouter
    ;;
  start)
    start_amrouter
    ;;
  verify)
    verify_amrouter
    ;;
  generate-code)
    generate_agent_code "$LANG" "."
    ;;
  help|*)
    show_help
    ;;
esac

echo ""
