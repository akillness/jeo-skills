# Solution Landscape: deployment-automation modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub Actions | CI/CD workflow engine | Ubiquitous in GitHub repos, environments/secrets, reusable workflows | YAML sprawl, flaky runner/debug UX, weak higher-level release modeling unless composed manually | Core entry point, but not the whole release system |
| GitLab CI/CD | Integrated CI/CD + environments | Strong integrated DevSecOps model and review apps | Complexity and self-hosting/admin overhead in some teams | Common alternative anchor |
| Jenkins | Extensible CI orchestrator | Very flexible ecosystem | High maintenance burden, plugin fragility | Legacy-heavy, still present |
| Vercel | Hosted web deployment platform | Excellent previews and branch deploy UX | Platform coupling, pricing/runtime constraints | Route-out target for provider-specific depth |
| Netlify | Hosted web deployment platform | Atomic deploy model, strong frontend DX | Build/bandwidth/runtime limits | Similar preview-heavy route |
| Cloudflare Pages | Edge/web deploy platform | Fast global edge delivery, preview support | Product boundaries can be confusing; runtime portability constraints | Strong edge/web option |
| Render | App PaaS | Simpler than raw cloud/Kubernetes | Less control; some teams report slower/cold-start behavior | Common fullstack default |
| Fly.io | App platform | Good regional/containerized deployment model | Networking/debugging can get sharp quickly | Useful for containerized web apps |
| Docker | Packaging/runtime | Standard artifact containerization | Not enough alone for multi-env promotion/governance | Core building block |
| Kubernetes | Orchestration platform | Standard for rolling updates and complex deployments | High complexity; many assemble-it-yourself gaps | Keep as route-out, not sole center |
| Helm / Kustomize | K8s packaging/config layers | Common environment overlay / packaging tools | Templating and drift complexity | Adjacent to deployment execution |
| Argo CD / Flux | GitOps controllers | Declarative promotion/reconciliation | Kubernetes-centric, operational complexity | Promotion/sync pattern, not all-purpose deploy skill |
| Argo Rollouts / Flagger | Progressive delivery | Canary / blue-green / automated analysis | Requires metrics maturity and setup | Only recommend when org can support it |
| Octopus / Harness / Spinnaker | Release management / CD platforms | Strong approvals, orchestration, enterprise controls | Heavier, pricier, more operational buy-in | Important for route-outs and mental model |
| semantic-release / release-please / Changesets | Release automation tooling | Versioning/changelog/tag automation | More release metadata than deploy execution | Separate release-prep lane |

## Categories
1. **Pipeline execution** — GitHub Actions, GitLab CI, Jenkins, CircleCI, Buildkite.
2. **Hosted web/app platforms** — Vercel, Netlify, Cloudflare Pages, Render, Fly.io.
3. **Container and cluster delivery** — Docker, Kubernetes, Helm, Kustomize.
4. **GitOps and progressive delivery** — Argo CD, Flux, Argo Rollouts, Flagger.
5. **Release orchestration / governance** — Octopus, Harness, Spinnaker, Azure DevOps Releases.
6. **Release metadata automation** — semantic-release, release-please, Changesets.

## What People Actually Use
The practical median stack is not one tool. Teams usually combine a Git-hosted repo, a CI workflow engine, provider CLIs or deploy platform, preview/staging/prod environments, plus manual approval/verification/rollback rituals. Even when vendor docs promise full automation, teams keep human steps for schema changes, secrets, change windows, and post-deploy checks.

## Frequency Ranking
1. GitHub Actions
2. Vercel
3. Netlify
4. Docker
5. Kubernetes
6. GitLab CI/CD
7. Cloudflare Pages / Workers deploy flow
8. Argo CD
9. Render
10. semantic-release / release-please / Changesets class

## Key Gaps
- Most “CI/CD” solutions automate pipeline execution more than real release management.
- Preview environments are easy for frontend/static apps and much harder for stateful fullstack/backend systems.
- Rollback is often overstated because schema/data compatibility is a separate problem.
- Config/YAML sprawl creates drift between environments.
- Progressive delivery only works well when observability maturity exists.
- Teams still need explicit artifact-promotion, approval, verification, and rollback decisions.

## Contradictions
- **Vendor claim:** deployment automation is a push-button solved problem.  
  **Observed reality:** approvals, migrations, secrets, and verification frequently remain manual or semi-manual.
- **Vendor claim:** rollback is easy.  
  **Observed reality:** app rollback may be easy; schema/data rollback often is not.
- **Vendor claim:** preview environments generalize broadly.  
  **Observed reality:** they are much more mature for frontend apps than for stateful systems.

## Key Insight
The best reusable shape for `deployment-automation` is not a giant CI/CD or Kubernetes encyclopedia. It is a release-execution skill that classifies work by target runtime, environment model, promotion model, deployment strategy, rollback method, and post-deploy verification, while routing pipeline authoring, environment setup, observability architecture, and deep provider-specific operations to adjacent skills.

## Curated Sources
- GitHub Actions docs: https://docs.github.com/en/actions
- Vercel deployments: https://vercel.com/docs/deployments
- Netlify deploy docs: https://docs.netlify.com/site-deploys/
- Cloudflare Pages docs: https://developers.cloudflare.com/pages/
- Render docs: https://render.com/docs
- Fly.io docs: https://fly.io/docs/
- Docker docs: https://docs.docker.com/
- Kubernetes deployment docs: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- Argo CD docs: https://argo-cd.readthedocs.io/
- Flux docs: https://fluxcd.io/docs/
- Octopus docs: https://octopus.com/docs
- Harness docs: https://developer.harness.io/
- semantic-release docs: https://semantic-release.gitbook.io/
- release-please: https://github.com/googleapis/release-please
- Changesets: https://github.com/changesets/changesets

## Confidence note
This artifact uses curated source links and durable practitioner patterns because the run’s web search/extract tools returned authentication errors during the survey step.
