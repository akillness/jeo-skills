# Platform Routing Notes

## Route to `workflow-automation`
Use `workflow-automation` when the real task is:
- writing or refactoring GitHub Actions / GitLab / Jenkins / Buildkite files
- deciding task runners or release scripts inside the repo
- building reusable pipeline templates
- local-vs-CI command parity or release-job structure

`deployment-automation` may consume an existing workflow, but should not become a CI-YAML encyclopedia.

## Route to `system-environment-setup`
Use `system-environment-setup` when the real task is:
- installing provider CLIs, Docker, kubectl, SDKs, or runtimes
- fixing PATH/auth/bootstrap issues on a machine
- making the local development or release machine runnable

`deployment-automation` may check whether required tools/auth exist, but should not own setup.

## Route to `monitoring-observability`
Use `monitoring-observability` when the real task is:
- creating dashboards or alerts
- setting up tracing or log aggregation
- defining long-lived telemetry or SLO monitoring
- incident detection architecture

`deployment-automation` may require immediate post-deploy health or smoke checks, but should not own the broader telemetry stack.

## Route to `vercel-deploy`
Use `vercel-deploy` when the task is specifically about:
- deploying directly to Vercel
- Vercel project linking, aliases, domains, environment variables, or claim URLs
- Vercel preview/prod workflow details

`deployment-automation` should stay vendor-neutral and only route into Vercel-specific operations when that platform is the real center of gravity.

## Route to security-specific skills
Use a security skill when the main concern is:
- secret rotation or storage architecture
- IAM scopes and least privilege
- artifact signing / SBOM / attestation
- compliance evidence or audit design

`deployment-automation` should refuse unsafe handling rather than trying to solve the whole security layer itself.
