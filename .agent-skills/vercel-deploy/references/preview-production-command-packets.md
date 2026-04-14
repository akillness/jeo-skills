# Preview / Production Command Packets

Use these packets as starting points. Adjust only after checking project state.

## Preview deploy packet
```bash
# Link once per repo if needed
vercel link

# Pull preview env metadata/config
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

## Stable preview alias packet
```bash
url="$(vercel deploy --prebuilt)"
vercel alias set "$url" preview.example.com
```

## Promote preview to production packet
```bash
vercel list --environment preview
vercel inspect <deployment-url>
vercel curl /api/health --deployment <deployment-url>
vercel httpstat / --deployment <deployment-url>
vercel logs --deployment <deployment-url> --level error --limit 50
vercel promote <deployment-url> --yes
vercel promote status
vercel logs --environment production --level error --since 5m
vercel httpstat /
```

## Direct production deploy packet
```bash
vercel pull --yes --environment=production
vercel deploy --prod

# or, for prebuilt flows
vercel build --prod
vercel deploy --prebuilt --prod
```

## Packet review questions
Before finalizing a response, answer:
1. Did I clearly say whether this was preview, production, or promotion?
2. Did I verify the exact deployment before promoting or aliasing it?
3. Did I report the resulting URL/domain instead of only listing commands?
4. Did I route out generic release-policy work to `deployment-automation` if it appeared?
