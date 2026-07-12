#!/bin/bash

###############################################################################
# AMRouter Agent Integration Scaffolder
# Generate project boilerplate for agents using AMRouter
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Defaults
LANGUAGE="javascript"
OUTPUT_DIR="."
PROJECT_NAME="amrouter-agent"

print_header() {
  echo -e "\n${BLUE}▼▼▼ $1 ▼▼▼${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1" >&2
}

show_help() {
  cat << 'EOF'
AMRouter Agent Integration Scaffolder

USAGE:
  scaffold-integration.sh [OPTIONS]

OPTIONS:
  --language LANG       Language: javascript, python, bash (default: javascript)
  --output-dir DIR      Output directory (default: .)
  --project-name NAME   Project name (default: amrouter-agent)
  --help                Show this help

EXAMPLES:
  # JavaScript (Node.js)
  scaffold-integration.sh --language javascript --output-dir ./my-agent

  # Python
  scaffold-integration.sh --language python --output-dir ./my-agent

  # Bash
  scaffold-integration.sh --language bash --output-dir ./my-agent
EOF
}

scaffold_javascript() {
  print_header "Scaffolding JavaScript Project"
  
  local dir="$OUTPUT_DIR/$PROJECT_NAME"
  mkdir -p "$dir"
  cd "$dir"
  
  # package.json
  cat > package.json << 'EOF'
{
  "name": "amrouter-agent",
  "version": "1.0.0",
  "description": "AI agent using AMRouter as LLM backend",
  "type": "module",
  "main": "agent.js",
  "scripts": {
    "start": "node agent.js",
    "dev": "node --watch agent.js",
    "test": "node --test test/**.js"
  },
  "dependencies": {
    "openai": "^4.28.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "node-test": "^1.0.0"
  }
}
EOF
  print_success "Created: package.json"
  
  # .env.example
  cat > .env.example << 'EOF'
# AMRouter Configuration
AMROUTER_URL=http://localhost:3001
AMROUTER_KEY=sk-amrouter-xxx

# Model preferences
PRIMARY_MODEL=openai/gpt-4o
FALLBACK_COMBO=vip

# Optional
DEBUG=false
LOG_LEVEL=info
EOF
  print_success "Created: .env.example"
  
  # .gitignore
  cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
*.log
dist/
build/
.DS_Store
EOF
  print_success "Created: .gitignore"
  
  # agent.js (main)
  cat > agent.js << 'EOF'
#!/usr/bin/env node

/**
 * AMRouter Agent Example
 * A simple agent using AMRouter for LLM backend
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(path.join(__dirname, '.env'))) {
  throw new Error('.env not found. Copy from .env.example and configure.');
}

import dotenv from 'dotenv';
dotenv.config();

const AMROUTER_URL = process.env.AMROUTER_URL || 'http://localhost:3001';
const AMROUTER_KEY = process.env.AMROUTER_KEY;
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || 'openai/gpt-4o';

if (!AMROUTER_KEY) {
  throw new Error('AMROUTER_KEY not set in .env');
}

// Create OpenAI client pointing to AMRouter
const client = new OpenAI({
  baseURL: `${AMROUTER_URL}/v1`,
  apiKey: AMROUTER_KEY,
});

async function main() {
  console.log('🤖 AMRouter Agent Initialized');
  console.log(`📡 Backend: ${AMROUTER_URL}`);
  console.log(`🧠 Model: ${PRIMARY_MODEL}\n`);

  // Example 1: Chat completion
  console.log('Example 1: Chat Completion');
  console.log('─'.repeat(40));
  
  const chatRes = await client.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Explain quantum computing in simple terms.' }
    ],
    temperature: 0.7,
    max_tokens: 200,
  });
  
  console.log('Response:', chatRes.choices[0].message.content);
  console.log('Tokens:', chatRes.usage.total_tokens);
  
  // Example 2: Streaming
  console.log('\nExample 2: Streaming Response');
  console.log('─'.repeat(40));
  
  const streamRes = await client.chat.completions.create({
    model: PRIMARY_MODEL,
    messages: [
      { role: 'user', content: 'Write a haiku about coding' }
    ],
    stream: true,
  });
  
  process.stdout.write('Streaming: ');
  for await (const chunk of streamRes) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
  console.log('\n');
  
  // Example 3: Embeddings
  console.log('Example 3: Embeddings');
  console.log('─'.repeat(40));
  
  const embRes = await client.embeddings.create({
    model: 'openai/text-embedding-3-small',
    input: ['hello world', 'goodbye world'],
  });
  
  console.log('Generated embeddings for 2 texts');
  console.log('Dimension:', embRes.data[0].embedding.length);
  
  // Example 4: List available models
  console.log('\nExample 4: Available Models');
  console.log('─'.repeat(40));
  
  const models = await client.models.list();
  console.log('Sample models:');
  models.data.slice(0, 5).forEach(m => {
    console.log(`  • ${m.id}`);
  });
  
  console.log('\n✓ All examples completed successfully!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
EOF
  chmod +x agent.js
  print_success "Created: agent.js (main script)"
  
  # libs/amrouter.js (utilities)
  mkdir -p libs
  cat > libs/amrouter.js << 'EOF'
/**
 * AMRouter Utilities
 */

import OpenAI from 'openai';

/**
 * Create AMRouter client
 */
export function createClient(url, apiKey) {
  return new OpenAI({
    baseURL: `${url}/v1`,
    apiKey,
  });
}

/**
 * Cost-aware model selection
 */
export async function selectModel(client, quota, budget = 0.01) {
  const openaiQ = quota.find(q => q.provider === 'openai');
  const groqQ = quota.find(q => q.provider === 'groq');
  
  if (openaiQ?.quotaRemaining > 50000) {
    return 'openai/gpt-4o';
  } else if (groqQ?.quotaRemaining > 100000) {
    return 'groq/mixtral-8x7b-32768';
  }
  
  throw new Error('Quota exhausted');
}

/**
 * Stream response with fallback
 */
export async function streamWithFallback(client, prompt, primaryModel, fallbackModel) {
  const models = [primaryModel, fallbackModel];
  
  for (const model of models) {
    try {
      return await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });
    } catch (err) {
      console.warn(`${model} failed, trying fallback...`);
      if (model === models[models.length - 1]) throw err;
    }
  }
}

/**
 * Call with retry
 */
export async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}
EOF
  print_success "Created: libs/amrouter.js (utilities)"
  
  # test/agent.test.js
  mkdir -p test
  cat > test/agent.test.js << 'EOF'
/**
 * Agent Tests
 */

import { createClient } from '../libs/amrouter.js';

// Mock client for testing
const mockClient = {
  chat: {
    completions: {
      create: async (options) => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { total_tokens: 10 },
      }),
    },
  },
};

console.log('✓ Test suite loaded (add real tests)');
EOF
  print_success "Created: test/agent.test.js"
  
  # README.md
  cat > README.md << 'EOF'
# AMRouter Agent

Simple AI agent using AMRouter as LLM backend.

## Quick Start

1. **Install**
   ```bash
   npm install
   ```

2. **Configure**
   ```bash
   cp .env.example .env
   # Edit .env with your AMRouter URL and API key
   ```

3. **Run**
   ```bash
   npm start
   ```

## Features

- Chat completions with streaming
- Embeddings generation
- Multi-model access
- Cost tracking
- Fallback handling

## Project Structure

- `agent.js` — Main agent entry point
- `libs/amrouter.js` — AMRouter utilities
- `test/` — Tests
- `.env.example` — Environment template

## Environment Variables

```
AMROUTER_URL=http://localhost:3001
AMROUTER_KEY=sk-amrouter-xxx
PRIMARY_MODEL=openai/gpt-4o
```

## Integration with Agent Skills

Register with `deep-agents-core`:

```javascript
const tools = {
  amrouter_chat: {
    description: 'Call LLM via AMRouter',
    input_schema: { /* ... */ },
  },
};
```

See [AMRouter SKILL.md](https://github.com/akillness/jeo-skills/blob/main/.agent-skills/amrouter/SKILL.md) for more patterns.
EOF
  print_success "Created: README.md"
  
  cd - > /dev/null
  print_success "JavaScript project scaffolded at: $dir"
}

scaffold_python() {
  print_header "Scaffolding Python Project"
  
  local dir="$OUTPUT_DIR/$PROJECT_NAME"
  mkdir -p "$dir"
  cd "$dir"
  
  # requirements.txt
  cat > requirements.txt << 'EOF'
openai>=1.3.0
python-dotenv>=1.0.0
requests>=2.31.0
EOF
  print_success "Created: requirements.txt"
  
  # .env.example
  cat > .env.example << 'EOF'
AMROUTER_URL=http://localhost:3001
AMROUTER_KEY=sk-amrouter-xxx
PRIMARY_MODEL=openai/gpt-4o
FALLBACK_COMBO=vip
EOF
  print_success "Created: .env.example"
  
  # .gitignore
  cat > .gitignore << 'EOF'
__pycache__/
*.py[cod]
*$py.class
.env
.venv
venv/
.DS_Store
*.log
EOF
  print_success "Created: .gitignore"
  
  # agent.py (main)
  cat > agent.py << 'EOF'
#!/usr/bin/env python3

"""
AMRouter Agent Example
Simple agent using AMRouter for LLM backend
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

# Load environment
load_dotenv()

AMROUTER_URL = os.getenv('AMROUTER_URL', 'http://localhost:3001')
AMROUTER_KEY = os.getenv('AMROUTER_KEY')
PRIMARY_MODEL = os.getenv('PRIMARY_MODEL', 'openai/gpt-4o')

if not AMROUTER_KEY:
    raise ValueError('AMROUTER_KEY not set in .env')

# Create OpenAI client pointing to AMRouter
client = OpenAI(
    base_url=f'{AMROUTER_URL}/v1',
    api_key=AMROUTER_KEY,
)

def main():
    print('🤖 AMRouter Agent Initialized')
    print(f'📡 Backend: {AMROUTER_URL}')
    print(f'🧠 Model: {PRIMARY_MODEL}\n')

    # Example 1: Chat completion
    print('Example 1: Chat Completion')
    print('─' * 40)
    
    chat_res = client.chat.completions.create(
        model=PRIMARY_MODEL,
        messages=[
            {'role': 'system', 'content': 'You are a helpful assistant.'},
            {'role': 'user', 'content': 'Explain quantum computing in simple terms.'}
        ],
        temperature=0.7,
        max_tokens=200,
    )
    
    print('Response:', chat_res.choices[0].message.content)
    print('Tokens:', chat_res.usage.total_tokens)

    # Example 2: Streaming
    print('\nExample 2: Streaming Response')
    print('─' * 40)
    
    with client.chat.completions.create(
        model=PRIMARY_MODEL,
        messages=[{'role': 'user', 'content': 'Write a haiku about coding'}],
        stream=True,
    ) as stream:
        print('Streaming: ', end='', flush=True)
        for text in stream.text_stream:
            print(text, end='', flush=True)
    print()

    # Example 3: Embeddings
    print('\nExample 3: Embeddings')
    print('─' * 40)
    
    emb_res = client.embeddings.create(
        model='openai/text-embedding-3-small',
        input=['hello world', 'goodbye world'],
    )
    
    print('Generated embeddings for 2 texts')
    print('Dimension:', len(emb_res.data[0].embedding))

    # Example 4: List available models
    print('\nExample 4: Available Models')
    print('─' * 40)
    
    models = client.models.list()
    print('Sample models:')
    for m in list(models.data)[:5]:
        print(f'  • {m.id}')
    
    print('\n✓ All examples completed successfully!')

if __name__ == '__main__':
    main()
EOF
  chmod +x agent.py
  print_success "Created: agent.py (main script)"
  
  # libs/amrouter.py (utilities)
  mkdir -p libs
  touch libs/__init__.py
  cat > libs/amrouter.py << 'EOF'
"""
AMRouter Utilities
"""

from openai import OpenAI

def create_client(url, api_key):
    """Create AMRouter client"""
    return OpenAI(
        base_url=f'{url}/v1',
        api_key=api_key,
    )

def select_model(quota, budget=0.01):
    """Cost-aware model selection"""
    openai_q = next((q for q in quota if q['provider'] == 'openai'), None)
    groq_q = next((q for q in quota if q['provider'] == 'groq'), None)
    
    if openai_q and openai_q['quotaRemaining'] > 50000:
        return 'openai/gpt-4o'
    elif groq_q and groq_q['quotaRemaining'] > 100000:
        return 'groq/mixtral-8x7b-32768'
    
    raise ValueError('Quota exhausted')

async def call_with_retry(fn, max_retries=3):
    """Call with exponential backoff"""
    for i in range(max_retries):
        try:
            return await fn()
        except Exception as err:
            if err.status == 429 and i < max_retries - 1:
                import asyncio
                delay = 2 ** i * 1000
                print(f'Rate limited, retrying in {delay}ms...')
                await asyncio.sleep(delay / 1000)
            else:
                raise
EOF
  print_success "Created: libs/amrouter.py (utilities)"
  
  # tests/test_agent.py
  mkdir -p tests
  touch tests/__init__.py
  cat > tests/test_agent.py << 'EOF'
"""
Agent Tests
"""

import unittest
from libs.amrouter import create_client

class TestAgent(unittest.TestCase):
    def test_create_client(self):
        client = create_client('http://localhost:3001', 'sk-test')
        self.assertIsNotNone(client)

if __name__ == '__main__':
    unittest.main()
EOF
  print_success "Created: tests/test_agent.py"
  
  # README.md
  cat > README.md << 'EOF'
# AMRouter Agent (Python)

Simple AI agent using AMRouter as LLM backend.

## Quick Start

1. **Install**
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configure**
   ```bash
   cp .env.example .env
   # Edit .env with your AMRouter URL and API key
   ```

3. **Run**
   ```bash
   python agent.py
   ```

## Environment Variables

- `AMROUTER_URL` — Backend URL (default: http://localhost:3001)
- `AMROUTER_KEY` — API key (required)
- `PRIMARY_MODEL` — Default model (default: openai/gpt-4o)

## Integration

See [AMRouter SKILL.md](https://github.com/akillness/jeo-skills/blob/main/.agent-skills/amrouter/SKILL.md) for patterns and deep-agents-core integration.
EOF
  print_success "Created: README.md"
  
  cd - > /dev/null
  print_success "Python project scaffolded at: $dir"
}

scaffold_bash() {
  print_header "Scaffolding Bash Project"
  
  local dir="$OUTPUT_DIR/$PROJECT_NAME"
  mkdir -p "$dir"
  cd "$dir"
  
  # .env.example
  cat > .env.example << 'EOF'
AMROUTER_URL=http://localhost:3001
AMROUTER_KEY=sk-amrouter-xxx
PRIMARY_MODEL=openai/gpt-4o
EOF
  print_success "Created: .env.example"
  
  # .gitignore
  cat > .gitignore << 'EOF'
.env
.env.local
*.log
.DS_Store
EOF
  print_success "Created: .gitignore"
  
  # agent.sh (main)
  cat > agent.sh << 'EOF'
#!/bin/bash

# AMRouter Agent (Bash)
# Simple shell agent using AMRouter

set -e

# Load environment
if [[ ! -f .env ]]; then
  echo "Error: .env not found. Copy from .env.example"
  exit 1
fi
source .env

AMROUTER_URL="${AMROUTER_URL:-http://localhost:3001}"
AMROUTER_KEY="${AMROUTER_KEY}"
PRIMARY_MODEL="${PRIMARY_MODEL:-openai/gpt-4o}"

if [[ -z "$AMROUTER_KEY" ]]; then
  echo "Error: AMROUTER_KEY not set"
  exit 1
fi

echo "🤖 AMRouter Agent (Bash)"
echo "📡 Backend: $AMROUTER_URL"
echo "🧠 Model: $PRIMARY_MODEL"
echo ""

# Example 1: Chat completion
echo "Example 1: Chat Completion"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -s -X POST "$AMROUTER_URL/v1/chat/completions" \
  -H "Authorization: Bearer $AMROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$PRIMARY_MODEL"'",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "temperature": 0.7
  }' | jq '.choices[0].message.content'

echo ""
echo "Example 2: List Models"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -s "$AMROUTER_URL/v1/models" \
  -H "Authorization: Bearer $AMROUTER_KEY" | \
  jq '.data[0:3] | .[].id'

echo ""
echo "✓ Examples completed!"
EOF
  chmod +x agent.sh
  print_success "Created: agent.sh (main script)"
  
  # libs/amrouter.sh (utilities)
  mkdir -p libs
  cat > libs/amrouter.sh << 'EOF'
#!/bin/bash

# AMRouter Bash Utilities

# List available models
function amrouter_list_models() {
  local url="${1:-http://localhost:3001}"
  local key="${2}"
  
  curl -s "$url/v1/models" \
    -H "Authorization: Bearer $key" | \
    jq '.data[].id'
}

# Chat completion
function amrouter_chat() {
  local url="$1"
  local key="$2"
  local model="$3"
  local message="$4"
  
  curl -s -X POST "$url/v1/chat/completions" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$model\",
      \"messages\": [{\"role\": \"user\", \"content\": \"$message\"}]
    }" | jq '.choices[0].message.content'
}

# Get quota
function amrouter_quota() {
  local url="${1:-http://localhost:3001}"
  local key="${2}"
  
  curl -s "$url/api/quota/providers" \
    -H "Authorization: Bearer $key" | \
    jq '.[] | {provider, quotaUsed, quotaLimit}'
}
EOF
  chmod +x libs/amrouter.sh
  print_success "Created: libs/amrouter.sh (utilities)"
  
  # README.md
  cat > README.md << 'EOF'
# AMRouter Agent (Bash)

Simple shell agent using AMRouter via curl and jq.

## Quick Start

1. **Configure**
   ```bash
   cp .env.example .env
   # Edit .env with your AMRouter URL and API key
   ```

2. **Run**
   ```bash
   bash agent.sh
   ```

## Dependencies

- `curl` — HTTP client
- `jq` — JSON query tool
- `bash` — Shell (4.0+)

Install on macOS:
```bash
brew install jq
```

Install on Linux (Ubuntu/Debian):
```bash
sudo apt-get install curl jq
```

## Usage

```bash
# Load utilities
source libs/amrouter.sh

# List models
amrouter_list_models "$AMROUTER_URL" "$AMROUTER_KEY"

# Chat
amrouter_chat "$AMROUTER_URL" "$AMROUTER_KEY" "openai/gpt-4o" "Hello"

# Check quota
amrouter_quota "$AMROUTER_URL" "$AMROUTER_KEY"
```

See [AMRouter SKILL.md](https://github.com/akillness/jeo-skills/blob/main/.agent-skills/amrouter/SKILL.md) for more patterns.
EOF
  print_success "Created: README.md"
  
  cd - > /dev/null
  print_success "Bash project scaffolded at: $dir"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --language)
      LANGUAGE="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --project-name)
      PROJECT_NAME="$2"
      shift 2
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

# Scaffold based on language
case "$LANGUAGE" in
  javascript|js)
    scaffold_javascript
    ;;
  python|py)
    scaffold_python
    ;;
  bash|sh)
    scaffold_bash
    ;;
  *)
    print_error "Unknown language: $LANGUAGE"
    show_help
    exit 1
    ;;
esac

echo ""
print_success "Scaffolding complete!"
echo ""
echo "Next steps:"
echo "  cd $OUTPUT_DIR/$PROJECT_NAME"
echo "  # Edit .env with your AMRouter credentials"
echo "  # Run the agent (see README.md for commands)"
echo ""
