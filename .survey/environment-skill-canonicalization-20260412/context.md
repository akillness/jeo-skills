# Context: environment skill canonicalization

## Workflow Context
Environment setup problems appear at the boundary between **application configuration correctness** and **reproducible developer setup**. In real workflows, teams do not experience `.env` files, local services, toolchains, and onboarding as isolated topics; they experience one broader question: **how do I get this project running correctly on a fresh machine and keep it stable across local/dev/staging/prod flows?**

Official docs reinforce that split:
- The Twelve-Factor config principle keeps deploy-specific config out of code and treats env vars as the canonical config surface: https://12factor.net/config
- Docker Compose has dedicated docs for environment variables and interpolation because env-layer precedence is a recurring source of confusion: https://docs.docker.com/compose/ and https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- VS Code dev containers and GitHub dev-container docs position reproducible environments as a way to standardize tools and runtime setup, not just env var loading: https://code.visualstudio.com/docs/devcontainers/containers and https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/introduction-to-dev-containers

That means a skills repo should distinguish a **broader runnable-environment workflow** from the narrower **app config / `.env` / secrets handoff** workflow, but keep them visibly connected.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application developer | Make a project run locally; manage env vars, services, seeds, and secrets | Mixed |
| New team member / OSS contributor | Bootstrap a fresh machine from docs and templates | Beginner to intermediate |
| Platform / DevEx engineer | Standardize onboarding, local-prod parity, and shared setup automation | Intermediate to advanced |
| Security-conscious team member | Keep secrets out of repos while preserving a usable local workflow | Intermediate |
| AI coding agent | Choose the right setup layer: app config, services, toolchains, containers, or secret injection | Mixed |

## Current Workarounds
1. **`.env.example` + README happy path**
   - Common baseline for naming required variables.
   - Weak on secret sourcing, value correctness, precedence, and local dependency orchestration.
2. **Docker Compose for local services**
   - Common for app + DB + cache stacks.
   - Helps with local parity, but does not fully solve credentials, per-developer overrides, or host-tooling drift.
3. **Dev containers / Codespaces / containerized dev environments**
   - Stronger for standardizing runtimes and onboarding.
   - Usually still depend on separate secret/bootstrap instructions.
4. **Bootstrap scripts / Makefiles / task runners**
   - Practical glue for copying env templates, installing deps, and starting services.
   - Can hide complexity without removing it.
5. **Secret manager + local injection**
   - Used when `.env` files are not enough or too risky.
   - Adds auth/bootstrap friction and still needs local conventions.
6. **Wiki / Notion / tribal-knowledge fallback**
   - Teams keep human troubleshooting docs because real setup drift spans more than one automation tool.

## Adjacent Problems
- Secret management and secure local handoff
- Config drift between local `.env`, container settings, CI, and production
- Toolchain/version management (`asdf`, `mise`, `pyenv`, etc.)
- Local-prod parity for service-heavy apps
- Multi-service orchestration and onboarding state
- Cross-platform issues (macOS Apple Silicon, WSL, Linux package differences)

## User Voices
> "When you work in a codespace, the environment you are working in is created using a development container, or dev container, hosted on a virtual machine."  
Source: GitHub Docs — Introduction to dev containers: https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/introduction-to-dev-containers

> "Developing inside a Container using Visual Studio Code Remote Development"  
Source: VS Code docs title/description showing the framing around full containerized development environments: https://code.visualstudio.com/docs/devcontainers/containers

> "Easily set up Doppler to manage secrets across environments. Follow our docs to help you get started improving workflows and enhance security for your projects."  
Source: Doppler docs meta description; evidence that secret handoff is treated as a cross-environment workflow, not just a file-format issue: https://docs.doppler.com/docs

> "Learn to add and access environment variables in your Next.js application."  
Source: Next.js environment variable guide title; evidence that application env guidance is still a narrower, framework-specific sub-problem inside the larger environment workflow: https://nextjs.org/docs/app/guides/environment-variables
