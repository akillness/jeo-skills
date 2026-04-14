# Vercel Env / Domain / Rollback Troubleshooting

## Environment variables

### Reliable facts to preserve
- Environment-variable changes apply to **new deployments**, not previous ones.
- Variables can be scoped to production, preview, development, or custom environments.
- System vars like `VERCEL_ENV`, `VERCEL_TARGET_ENV`, and `VERCEL_URL` help, but app-specific canonical URLs may still need explicit configuration.

### Troubleshooting checklist
1. Confirm which environment the variable should target.
2. Confirm a new deployment happened after the variable changed.
3. Use `vercel env ls` or environment-specific settings as the trusted state check if the UI seems inconsistent.
4. Check whether the app expects a canonical callback/base URL instead of only `VERCEL_URL`.
5. Report whether the issue is Vercel env scope, app config, or both.

## Aliases and domains

### Common distinctions
- **Generated deployment URL**: unique `*.vercel.app` deployment address
- **Stable preview alias**: team-defined URL pointed at the latest preview deployment
- **Custom domain**: production-facing or long-lived host name requiring domain ownership / DNS correctness

### Troubleshooting checklist
1. Confirm whether the target is preview-only or production-facing.
2. Confirm whether the alias/domain should move with each deployment or stay on production only.
3. Report DNS/manual verification steps separately from Vercel CLI success.
4. If alias errors appear, keep the deployment URL available as fallback evidence.

## Rollback

### Caveats from Vercel docs
- rollback restores a previous deployment state; it is not a magical patch of the current one
- environment/config may be stale relative to current project settings
- cron-job state can revert with the rolled-back deployment
- rollback eligibility differs by plan

### Rollback checklist
1. Identify the currently bad production deployment.
2. Identify the target rollback deployment.
3. State stale-config caveats before calling rollback complete.
4. Re-check logs/health on production after rollback.
5. Record any follow-up needed (reapply env changes, re-run migrations, review cron config, etc.).
