# AMRouter Installation Guide

## System Requirements

- **Node.js 20+** (download from https://nodejs.org/)
- **npm 10+** (included with Node.js)
- **Python 3.10+** (optional, for automation features)
- **Chromium** (optional, for Playwright automation)

## Installation Methods

### Method 1: Bare Metal (Development)

Ideal for local development and testing.

```bash
# 1. Clone repository
git clone https://github.com/ahwanulm/AMRouter.git
cd AMRouter

# 2. Install dependencies
npm install

# 3. Configure environment
cp backend/.env.template backend/.env

# 4. Start development server
npm run dev

# Access:
# Backend API: http://localhost:3001
# Dashboard: http://localhost:5177
```

### Method 2: Bare Metal (Production)

For self-hosted deployments.

```bash
# 1. Clone repository
git clone https://github.com/ahwanulm/AMRouter.git
cd AMRouter

# 2. Install dependencies
npm install

# 3. Build frontend
cd frontend && npm run build && cd ..

# 4. Configure environment
cp backend/.env.template backend/.env
# Edit .env: set NODE_ENV=production, ADMIN_PASSWORD, provider keys

# 5. Start server
NODE_ENV=production npm start
# or use PM2 for process management:
npm i -g pm2
pm2 start backend/index.js --name amrouter
pm2 save
```

**Port:** 3001 (configurable via `PORT` env var)

### Method 3: Docker

```bash
# Build image
docker build -t amrouter:latest .

# Run container
docker run -d \
  -p 3001:3001 \
  --env-file .env \
  --name amrouter \
  amrouter:latest

# View logs
docker logs -f amrouter

# Stop
docker stop amrouter
```

**docker-compose.yml** example:

```yaml
version: '3.9'

services:
  amrouter:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./backend:/app/backend
    restart: unless-stopped

  # Optional: PostgreSQL for persistence
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

Start with:

```bash
docker-compose up -d
```

### Method 4: Kubernetes

**Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: amrouter
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: amrouter
  template:
    metadata:
      labels:
        app: amrouter
    spec:
      containers:
      - name: amrouter
        image: amrouter:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3001
          name: http
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3001"
        - name: ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: amrouter-secrets
              key: admin-password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: amrouter-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: amrouter
spec:
  selector:
    app: amrouter
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3001
  type: LoadBalancer
---
apiVersion: v1
kind: Secret
metadata:
  name: amrouter-secrets
type: Opaque
stringData:
  admin-password: <SECURE_PASSWORD>
  jwt-secret: <32_CHAR_RANDOM_SECRET>
```

Deploy:

```bash
kubectl apply -f amrouter-deployment.yaml

# Verify
kubectl get deployments
kubectl get pods
kubectl get svc amrouter
```

Scale:

```bash
kubectl scale deployment amrouter --replicas=5
```

### Method 5: CI/CD (GitHub Actions)

Deploy to production on push:

```yaml
name: Deploy AMRouter

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
    
    - name: Install dependencies
      run: npm install
    
    - name: Build frontend
      run: cd frontend && npm run build && cd ..
    
    - name: Build Docker image
      run: docker build -t amrouter:${{ github.sha }} .
    
    - name: Push to registry
      run: |
        echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
        docker push amrouter:${{ github.sha }}
    
    - name: Deploy to production
      env:
        DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
      run: |
        mkdir -p ~/.ssh
        echo "$DEPLOY_KEY" > ~/.ssh/id_rsa
        chmod 600 ~/.ssh/id_rsa
        ssh -o StrictHostKeyChecking=no deploy@prod.example.com \
          "docker pull amrouter:${{ github.sha }} && \
           docker stop amrouter || true && \
           docker run -d -p 3001:3001 --name amrouter amrouter:${{ github.sha }}"
```

### Method 6: AWS (EC2 + ECS)

**Push to ECR:**

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com
docker build -t amrouter:latest .
docker tag amrouter:latest <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/amrouter:latest
docker push <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/amrouter:latest
```

**ECS Task Definition:**

```json
{
  "family": "amrouter",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "amrouter",
      "image": "<ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/amrouter:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "ADMIN_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT>:secret:amrouter/admin-password"
        }
      ]
    }
  ]
}
```

## Environment Configuration

### Development (.env.template)

```bash
# Server
PORT=3001
NODE_ENV=development

# Authentication
REQUIRE_LOGIN=false
ADMIN_PASSWORD=admin

# Providers (add as needed)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
MISTRAL_API_KEY=
COHERE_API_KEY=
```

### Production (.env)

```bash
# Server
PORT=3001
NODE_ENV=production

# Authentication
REQUIRE_LOGIN=true
ADMIN_PASSWORD=<STRONG_PASSWORD>
JWT_SECRET=<32_CHAR_RANDOM_HEX>

# CORS
CORS_ORIGIN=https://yourdomain.com

# Logging
LOG_LEVEL=info

# Providers (add securely)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk-...
MISTRAL_API_KEY=...
COHERE_API_KEY=...

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost/amrouter

# Automation (optional)
PLAYWRIGHT_BROWSER_TYPE=chromium
PROXY_LIST=http://proxy1.com:8080,http://proxy2.com:8080
```

## Post-Installation Setup

### Step 1: Access Dashboard

```
http://localhost:3001 (for production)
http://localhost:5177 (for development)
```

### Step 2: Login

- Default password: `admin` (from `.env` `ADMIN_PASSWORD`)
- Change in **Settings** → **Change Password**

### Step 3: Add Provider Keys

1. Navigate to **Providers** tab
2. Click **Add Provider**
3. Select provider (OpenAI, Anthropic, Gemini, etc.)
4. Paste API key
5. Test connection
6. Save

### Step 4: Create Fallback Combos

1. Navigate to **Combos** tab
2. Click **New Combo**
3. Define provider chain (e.g., OpenAI → Anthropic → Gemini)
4. Set fallback strategy (round-robin, least-cost, etc.)
5. Save

### Step 5: Get API Key

1. Navigate to **Settings** → **API Keys**
2. Click **Generate Key**
3. Copy key (starts with `sk-amrouter-`)
4. Use in agent code: `Authorization: Bearer sk-amrouter-xxx`

## Verification

### Test Backend

```bash
curl http://localhost:3001/v1/models \
  -H "Authorization: Bearer sk-amrouter-xxx" | jq '.data[].id'
```

Expected output: List of available models.

### Test Chat Endpoint

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-amrouter-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

### Test Embeddings

```bash
curl -X POST http://localhost:3001/v1/embeddings \
  -H "Authorization: Bearer sk-amrouter-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "Hello world"
  }' | jq '.data[0].embedding | length'
```

Expected output: `1536` (OpenAI embedding dimension)

## Troubleshooting

| Issue | Fix |
|---|---|
| **Port 3001 in use** | Change `PORT` in `.env` or kill process: `lsof -i :3001 \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |
| **Module not found** | Run `npm install` again, ensure Node 20+ |
| **Dashboard 404** | Frontend not built; run `cd frontend && npm run build && cd ..` |
| **Provider key invalid** | Check key format, test in provider's dashboard |
| **Quota exceeded** | Check dashboard quota tab, add more keys or adjust combos |
| **CORS errors** | Set `CORS_ORIGIN` to your domain in `.env` |
| **Authentication fails** | Reset password: delete JWT token from browser storage, clear cookies |

## Maintenance

### Update AMRouter

```bash
git pull origin main
npm install
npm run build
npm restart  # or `pm2 restart amrouter`
```

### Backup Configuration

```bash
# Backup .env and provider configs
cp backend/.env ~/backup/.env.backup.$(date +%s)

# Backup database (if using PostgreSQL)
pg_dump -h localhost -U amrouter > ~/backup/amrouter.sql
```

### Monitor Performance

```bash
# View logs
docker logs -f amrouter

# Check CPU/memory
docker stats amrouter

# Monitor uptime
pm2 monit
```

---

**Next Steps:** See [../SKILL.md](../SKILL.md) for usage patterns and [../references/api-reference.md](../references/api-reference.md) for API docs.
