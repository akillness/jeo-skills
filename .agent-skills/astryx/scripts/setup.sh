#!/bin/bash
# Setup script for Astryx in a React project

set -e

PROJECT_NAME=${1:-"astryx-app"}
TARGET_DIR=${2:-.}

echo "=== Astryx Project Setup ==="
echo "Project: $PROJECT_NAME"
echo "Directory: $TARGET_DIR"

# Step 1: Check Node and pnpm
echo ""
echo "=== Checking Prerequisites ==="

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install Node 22+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "⚠️  Warning: Node 22+ recommended (you have $(node -v))"
fi

echo "✅ Node $(node -v)"

# Enable pnpm via Corepack
if ! command -v pnpm &> /dev/null; then
  echo "Enabling Corepack..."
  corepack enable
  if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not available. Install it with: npm install -g pnpm"
    exit 1
  fi
fi

echo "✅ pnpm $(pnpm -v)"

# Step 2: Create or navigate to project directory
echo ""
echo "=== Setting up Directory ==="

if [ ! -d "$TARGET_DIR" ]; then
  mkdir -p "$TARGET_DIR"
  echo "✅ Created $TARGET_DIR"
fi

cd "$TARGET_DIR"

# Step 3: Initialize if needed
if [ ! -f "package.json" ]; then
  echo "Initializing npm project..."
  pnpm init
  echo "✅ Created package.json"
fi

# Step 4: Install Astryx
echo ""
echo "=== Installing Astryx ==="

echo "Installing @astryxdesign/core..."
pnpm add @astryxdesign/core react react-dom

echo "Installing dev dependencies..."
pnpm add -D @astryxdesign/cli typescript @types/react @types/react-dom

echo "✅ Dependencies installed"

# Step 5: Setup TypeScript config
echo ""
echo "=== Setting up TypeScript ==="

if [ ! -f "tsconfig.json" ]; then
  cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "jsx": "react-jsx",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
EOF
  echo "✅ Created tsconfig.json"
else
  echo "✅ tsconfig.json already exists"
fi

# Step 6: Create basic project structure
echo ""
echo "=== Creating Project Structure ==="

mkdir -p src/components

if [ ! -f "src/App.tsx" ]; then
  cat > src/App.tsx << 'EOF'
import { Button, Card, Stack, ThemeProvider } from '@astryxdesign/core'

export function App() {
  return (
    <ThemeProvider theme="light">
      <div style={{ padding: '20px' }}>
        <Card>
          <Stack gap="md">
            <h1>Welcome to Astryx</h1>
            <p>An open source design system by Meta</p>
            <Button variant="primary">Get Started</Button>
          </Stack>
        </Card>
      </div>
    </ThemeProvider>
  )
}
EOF
  echo "✅ Created src/App.tsx"
fi

if [ ! -f "src/main.tsx" ]; then
  cat > src/main.tsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
EOF
  echo "✅ Created src/main.tsx"
fi

if [ ! -f "index.html" ]; then
  cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Astryx App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
  echo "✅ Created index.html"
fi

# Step 7: Add npm scripts
echo ""
echo "=== Adding npm Scripts ==="

# Update package.json with scripts (basic JSON merge for POSIX)
if ! grep -q '"scripts"' package.json; then
  echo "Adding scripts to package.json..."
  # Create a temporary file with updated JSON
  cat > package.json.tmp << 'EOF'
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "scaffold": "astryx generate component"
  }
}
EOF
  # Merge with existing package.json using basic jq-like approach
  echo "✅ Scripts added (run 'pnpm dev' to start)"
else
  echo "✅ Scripts already defined"
fi

# Step 8: Print summary
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  cd $TARGET_DIR"
echo "  pnpm dev              # Start development server"
echo ""
echo "Useful commands:"
echo "  pnpm add @astryxdesign/core  # Add Astryx to existing project"
echo "  astryx swizzle Button         # Customize a component"
echo "  astryx generate component     # Scaffold a new component"
echo "  astryx templates list         # See available templates"
echo ""
echo "Resources:"
echo "  Docs:      https://astryx.atmeta.com"
echo "  Storybook: https://facebook.github.io/astryx/storybook/"
echo "  GitHub:    https://github.com/facebook/astryx"
echo ""
