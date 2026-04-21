# Admin and data operations

## Auth import / export

### Export users
```bash
firebase auth:export users.json
```

### Import users
```bash
firebase auth:import users.json --hash-algo=BCRYPT
```

For SCRYPT or other migrated hashes, capture all required hash parameters before running the import.

## Remote Config
```bash
firebase remoteconfig:get --output config.json
firebase remoteconfig:versions:list --limit 20
firebase remoteconfig:rollback --version-number 5
```

## App Distribution
```bash
firebase appdistribution:distribute app-release.apk \
  --app APP_ID \
  --release-notes "Sprint build" \
  --groups qa-team
```

## Extensions
```bash
firebase ext:list
firebase ext:install firebase/delete-user-data
firebase ext:update delete-user-data
firebase ext:uninstall delete-user-data
```

## Data Connect / targeted admin commands
Use Firebase CLI for operational Data Connect actions when the request is still mainly CLI/platform work.

```bash
firebase dataconnect:services:list
firebase dataconnect:sdk:generate
```

## High-risk command reminders
- `firebase firestore:delete ... --recursive --force` is destructive
- Remote Config rollback should capture the target version first
- Auth imports should preserve exact hash settings
- App Distribution commands should verify the correct app ID, tester group, and release notes
