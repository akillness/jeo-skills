# Solution Landscape: environment skill canonicalization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| dotenv / framework-native env systems | App-level `.env` loading and env var access | Familiar, lightweight, everywhere | Weak typing, precedence confusion, easy drift | Strong evidence that app config is a real sub-problem |
| Typed env validation (`envalid`, `envsafe`, `T3 Env`, Zod-based patterns) | Validate required env vars and types at app startup | Fail-fast correctness, clearer contracts | Does not provision toolchains/services/secrets | Good supporting pattern for a narrower config skill |
| Docker Compose | Reproducible local services and env interpolation | Common local parity layer for DB/cache/queues | Still leaves host tooling, auth, and secret sourcing unresolved | Strong fit for the broader canonical environment skill |
| Dev containers / Codespaces | Reproducible editor + runtime environment | Strong onboarding story; standardizes runtime/tools | Editor/platform coupling; still needs secrets/bootstrap fallback | Strong fit for the broader canonical environment skill |
| direnv | Per-directory shell activation and local env automation | Good glue layer; reduces shell friction | Not a full setup system; can hide state | Supporting tactic, not canonical skill boundary |
| Runtime managers (`asdf`, `mise`, `pyenv`, etc.) | Pin language/tool versions | Practical and common | Only solves part of the setup problem | Supporting tactic inside broader environment setup |
| Secret managers (`Doppler`, `Infisical`, Vault, cloud secret stores) | Secure secret delivery and local injection | Stronger security posture, team-level control | Adds auth/bootstrap complexity | Important adjacent pattern; should be covered as part of boundaries and handoffs |
| Nix / Devbox / reproducible-shell tools | Fully declarative toolchains and shells | Highest reproducibility ceiling | Steeper learning curve and debug burden | Good optional branch for advanced environment reproducibility |
| Bootstrap scripts / Makefiles / task runners | One-command project setup | Pragmatic, easy to adopt incrementally | Often become stale glue rather than real source of truth | Belongs in the broader canonical setup story |

## Categories
- **Application config correctness**: dotenv, framework env guides, typed validators (`T3 Env`, envalid, envsafe)
- **Secrets delivery**: Doppler, Infisical, Vault, cloud secret stores
- **Runtime/service reproducibility**: Docker Compose, containerized local stacks
- **Toolchain/system reproducibility**: dev containers, Codespaces, Nix, Devbox, runtime managers
- **Glue / activation / onboarding**: direnv, Makefiles, task runners, bootstrap scripts

## What People Actually Use
The actual market behavior is hybrid:
- README + `.env.example`
- bootstrap scripts
- Docker only for backing services
- local runtime managers for the app itself
- secret tooling only where security pressure is higher
- manual wiki/troubleshooting fallbacks when automation breaks

That means users typically begin with **"make this repo runnable"**, not **"choose between env vars and system setup"**.

## Frequency Ranking
1. `.env` / framework-native env handling
2. Docker Compose for local dependencies
3. Runtime/version managers (`asdf`, `mise`, `nvm`, `pyenv`)
4. Bootstrap scripts / Makefiles / one-command onboarding
5. Typed env validation
6. Dev containers / Codespaces
7. direnv
8. Secret managers
9. Nix / Devbox / advanced reproducible-shell stacks

## Key Gaps
- Many solution categories solve only one layer: config correctness, secret delivery, service parity, or toolchain reproducibility.
- Teams still need a human decision layer to choose the right setup tactic for the current repo.
- Discovery surfaces often blur **app config** and **system reproducibility**, which causes duplicate or vague guidance.
- Skills that do not clearly route between env files, container parity, runtime managers, and secrets become bloated catch-alls.

## Contradictions
- "One-command setup" products still rely on docs and tribal knowledge for auth, access, and cross-platform fixes.
- Typed env tooling looks comprehensive, but it only validates app startup state; it does not make a fresh machine runnable.
- Reproducible-shell tools promise determinism, but teams often keep fallback docs and imperative scripts for day-to-day debugging.

## Key Insight
The space is best modeled as a **canonical broader environment-setup skill** plus a **narrower application-config alias/compatibility skill**. The broader skill should own runnable local environments, toolchains, service parity, onboarding, and setup diagnosis. The narrower alias should explicitly focus on `.env`, env precedence, validation, secret handoff, and framework-specific config guidance, while routing outward whenever the problem is really about containers, runtimes, or reproducible machines.
