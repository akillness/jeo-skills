# Unity CLI CI/CD Integration Patterns

## GitHub Actions

### Basic build workflow

```yaml
name: Unity Build
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          lfs: true

      - name: Install Unity CLI
        run: bash .agent-skills/unity-cli/scripts/setup.sh --ci

      - name: Validate project
        run: unity-cli project validate --project .

      - name: Build WebGL
        run: |
          unity-cli build \
            --project . \
            --platform WebGL \
            --output ./dist/webgl \
            --verbose

      - name: Upload build artifact
        uses: actions/upload-artifact@v3
        with:
          name: webgl-build
          path: ./dist/webgl
          retention-days: 7
```

### Multi-platform matrix build

```yaml
name: Multi-Platform Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: WebGL
            output: dist/webgl
          - os: windows-latest
            platform: StandaloneWindows
            output: dist/windows
          - os: macos-latest
            platform: StandaloneOSX
            output: dist/macos

    steps:
      - uses: actions/checkout@v3
      - run: bash .agent-skills/unity-cli/scripts/setup.sh --ci
      - run: |
          unity-cli build \
            --project . \
            --platform ${{ matrix.platform }} \
            --output ${{ matrix.output }}
      - uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.platform }}-build
          path: ${{ matrix.output }}
```

### With licensing

```yaml
name: Build (Licensed)
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Unity CLI
        run: bash .agent-skills/unity-cli/scripts/setup.sh --ci

      - name: Validate license
        env:
          UNITY_SERIAL: ${{ secrets.UNITY_SERIAL }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        run: unity-cli manage licensing --validate

      - name: Build
        run: unity-cli build --project . --platform WebGL --output ./dist

      - name: Return license
        if: always()
        env:
          UNITY_SERIAL: ${{ secrets.UNITY_SERIAL }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        run: unity-cli manage licensing --return
```

## Jenkins

### Jenkinsfile (Declarative)

```groovy
pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup') {
      steps {
        sh 'bash .agent-skills/unity-cli/scripts/setup.sh --ci'
      }
    }

    stage('Validate') {
      steps {
        sh 'unity-cli project validate --project .'
      }
    }

    stage('Build') {
      steps {
        sh '''
          unity-cli build \\
            --project . \\
            --platform WebGL \\
            --output ./dist \\
            --verbose
        '''
      }
    }

    stage('Archive') {
      steps {
        archiveArtifacts artifacts: 'dist/**/*', allowEmptyArchive: false
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
```

### Jenkinsfile (Scripted)

```groovy
node {
  checkout scm

  stage('Setup') {
    sh 'bash .agent-skills/unity-cli/scripts/setup.sh --ci'
  }

  stage('Build') {
    try {
      sh 'unity-cli build --project . --platform WebGL --output ./dist'
    } catch (e) {
      error "Build failed: ${e}"
    } finally {
      archiveArtifacts artifacts: 'dist/**/*'
    }
  }
}
```

## GitLab CI

### .gitlab-ci.yml

```yaml
stages:
  - validate
  - build
  - deploy

before_script:
  - bash .agent-skills/unity-cli/scripts/setup.sh --ci

validate:
  stage: validate
  script:
    - unity-cli project validate --project .
  only:
    - merge_requests
    - main

build_webgl:
  stage: build
  script:
    - unity-cli build --project . --platform WebGL --output ./dist
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
  only:
    - main
    - tags

build_standalone:
  stage: build
  script:
    - unity-cli build --project . --platform StandaloneLinux64 --output ./dist-linux
  artifacts:
    paths:
      - dist-linux/
    expire_in: 1 week
  only:
    - main
    - tags

deploy:
  stage: deploy
  script:
    - echo "Deploying build artifacts"
    - ./scripts/deploy.sh ./dist
  environment:
    name: production
  only:
    - tags
```

## Docker-Based CI

### Dockerfile with Unity CLI

```dockerfile
FROM unityci/editor:2023.2.0-linux-il2cpp

WORKDIR /build

COPY . .

RUN apt-get update && apt-get install -y curl

RUN bash .agent-skills/unity-cli/scripts/setup.sh --ci

RUN unity-cli project validate --project .

RUN unity-cli build \
  --project . \
  --platform WebGL \
  --output /build/dist

FROM nginx:alpine
COPY --from=0 /build/dist /usr/share/nginx/html
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  builder:
    image: unityci/editor:2023.2.0-linux-il2cpp
    volumes:
      - .:/build
      - /build/Library
    working_dir: /build
    command: >
      bash -c "
        bash .agent-skills/unity-cli/scripts/setup.sh --ci &&
        unity-cli build --project . --platform WebGL --output ./dist
      "

  deploy:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./dist:/usr/share/nginx/html
    depends_on:
      - builder
```

## Best Practices

### Caching

**GitHub Actions:**

```yaml
- uses: actions/cache@v3
  with:
    path: |
      Library/
      .gradle/
    key: ${{ runner.os }}-unity-${{ hashFiles('Packages/packages-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-unity-
```

**Jenkins:**

```groovy
stage('Build') {
  steps {
    dir('Library') {
      deleteDir()
    }
    sh 'unity-cli build --project . --platform WebGL --output ./dist'
  }
}
```

### Secrets Management

**GitHub Actions:**

```yaml
env:
  UNITY_SERIAL: ${{ secrets.UNITY_SERIAL }}
  UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
  UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
```

**GitLab CI:**

```yaml
build:
  script:
    - export UNITY_SERIAL=$UNITY_SERIAL
    - export UNITY_EMAIL=$UNITY_EMAIL
    - export UNITY_PASSWORD=$UNITY_PASSWORD
    - unity-cli build --project . --platform WebGL --output ./dist
  only:
    - main
```

### Artifact Management

Keep builds lean:

```bash
# Clean before build
rm -rf dist/
mkdir -p dist

# Build only what's needed
unity-cli build --project . --platform WebGL --output ./dist

# Upload specific artifacts
tar -czf build-$(date +%s).tar.gz dist/
aws s3 cp build-*.tar.gz s3://my-bucket/builds/
```

## Troubleshooting CI Failures

### License validation fails

```bash
# In CI, ensure variables are set
echo "UNITY_SERIAL=${UNITY_SERIAL}"
echo "UNITY_EMAIL=${UNITY_EMAIL}"

# Add verbose output
unity-cli manage licensing --validate --verbose
```

### Build times out

Increase timeout and enable cache:

```yaml
# GitHub Actions
timeout-minutes: 120

# Jenkins
timeout(time: 2, unit: 'HOURS') {
  sh 'unity-cli build ...'
}
```

### Out of disk space

```bash
# Clean build artifacts between runs
rm -rf Library/Artifacts/
rm -rf Library/ScriptAssemblies/
```
