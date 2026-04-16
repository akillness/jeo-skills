# Install, auth, and bootstrap guide

## Installation paths

### npm install (preferred when Node.js is available)
Current `firebase-tools` releases require **Node.js 20+**.

```bash
node --version
npm --version
npm install -g firebase-tools
firebase --version
```

### Standalone installer (macOS/Linux)
Useful when Node.js is unavailable and you only need the CLI binary.

```bash
curl -sL https://firebase.tools | bash
firebase --version
```

## Authentication choices

### Local interactive work
```bash
firebase login
firebase login:list
```

### Non-interactive / CI work
Prefer service-account credentials via `GOOGLE_APPLICATION_CREDENTIALS`.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
firebase projects:list --non-interactive
```

Treat `firebase login:ci`, `--token`, and `FIREBASE_TOKEN` as deprecated compatibility paths, not the default recommendation.

## Bootstrap checklist

### Minimal repo setup
```bash
firebase init
```

### Common focused init flows
```bash
firebase init hosting
firebase init functions
firebase init firestore
firebase init emulators
firebase init apphosting
firebase init hosting:github
```

### Project alias management
```bash
firebase use --add
firebase use <alias>
firebase use --clear
```

## Files to inspect after bootstrap
- `firebase.json`
- `.firebaserc`
- target-specific directories such as `functions/`, rules files, hosting output directory

## Good bootstrap habits
1. Initialize only the Firebase surfaces the repo actually uses
2. Commit `.firebaserc` when aliases are part of team workflow
3. Keep secrets and service-account JSON files out of version control
4. If the repo mixes Firebase platform work with AI app logic, document the route-out to `genkit` / `firebase-ai-logic`
