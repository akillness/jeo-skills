# Emulator and release workflows

## Emulator patterns

### Persistent local development
```bash
bash scripts/emulators.sh --persistent
```

Equivalent raw command:
```bash
firebase emulators:start --import ./emulator-data --export-on-exit
```

### Focused emulator startup
```bash
firebase emulators:start --only auth,firestore,functions
```

### Run tests against emulators then exit
```bash
firebase emulators:exec "npm test" --only auth,firestore
```

## Ports worth checking
- Emulator UI: 4000
- Hosting: 5000
- Functions: 5001
- Firestore: 8080
- Database: 9000
- Auth: 9099
- Storage: 9199

## Release / deploy patterns

### Safe selective deploy
```bash
firebase deploy --only hosting
firebase deploy --only functions:myFunction
firebase deploy --only firestore:indexes
```

### Preview channel flow
```bash
firebase hosting:channel:create staging --expires 7d
firebase hosting:channel:deploy staging
firebase hosting:channel:open staging
```

### App Hosting operator flow
```bash
firebase init apphosting
firebase apphosting:backends:create --location us-central1
firebase deploy --only apphosting
```

## CI execution pattern
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
firebase deploy --only hosting --non-interactive
```

## Verification checklist
- Did the deploy scope match the intended surface?
- Was a preview/staging URL captured when relevant?
- Did emulator data import/export succeed?
- Are the repo config files (`firebase.json`, `.firebaserc`) consistent with the deploy target?
