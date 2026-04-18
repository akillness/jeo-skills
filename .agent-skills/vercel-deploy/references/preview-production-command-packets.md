# Preview / Production Command Packets

Use these packets as starting points. Adjust only after checking linked-project state, target environment, and verification depth.

## Preview deploy packet
```bash
# Link once per repo if needed
vercel link

# Pull preview config/env metadata when using CLI-based builds
vercel pull --yes --environment=preview

# Source-based preview deploy
vercel deploy

# Or prebuilt preview deploy
vercel build
vercel deploy --prebuilt

# Inspect and verify
vercel inspect <deployment-url>
vercel logs --deployment <deployment-url> --level error --limit 50
```

Preview packet reminders:
- Capture the deployment URL from stdout and report it back.
- If the user needs a stable URL, continue into alias/domain handling instead of hiding it inside the deploy step.

## Stable preview alias packet
```bash
url="$(vercel deploy --prebuilt)"
vercel alias set "$url" preview.example.com
```

Alias reminders:
- Keep the raw deployment URL in the report as fallback evidence.
- Say whether the alias is preview-only or intended to become production-facing later.

## Staged production + promote packet
```bash
# Prepare production config without switching traffic yet
vercel pull --yes --environment=production
vercel build --prod
url="$(vercel deploy --prebuilt --prod --skip-domain)"

# Verify the staged deployment before cutover
vercel inspect "$url"
vercel logs --deployment "$url" --level error --limit 50
vercel curl /api/health --deployment "$url"

# Promote after verification
vercel promote "$url" --yes
vercel promote status
vercel logs --environment production --level error --since 5m
```

Promotion reminders:
- Verify the exact deployment URL/commit before promoting.
- In team-scoped setups, be ready to add `--scope <team>` if promotion auth/team context is ambiguous.
- Treat post-promote health/log checks as a separate required step.

## Direct production deploy packet
```bash
vercel pull --yes --environment=production
vercel deploy --prod

# or, for prebuilt flows
vercel build --prod
vercel deploy --prebuilt --prod
```

Production packet reminders:
- State whether the deploy was source-build or prebuilt.
- Report the production URL/domain reached, not just command success.

## Packet review questions
Before finalizing a response, answer:
1. Did I clearly say whether this was preview, direct production, or staged promote?
2. Did I verify the exact deployment before promoting or aliasing it?
3. Did I report the resulting URL/domain instead of only listing commands?
4. Did I call out any team-scope, DNS, or manual verification caveat that still remains?
5. Did I route generic release-policy work to `deployment-automation` if it appeared?
