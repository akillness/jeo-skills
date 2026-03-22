# TEA (Test Architect) — BMAD Integration Reference

TEA is an official BMAD v6 external module providing enterprise-grade test strategy. Agent persona: **Murat** — Master Test Architect focused on risk-based testing, fixture architecture, ATDD, and CI/CD governance.

**Source**: [bmad-code-org/bmad-method-test-architecture-enterprise](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise)

---

## TEA's 9 Workflows

| Code | Workflow | Command | Description |
|------|----------|---------|-------------|
| **TMT** | Teach Me Testing (TEA Academy) | `/tea-teach` | Interactive test strategy education for the team |
| **TF** | Framework Setup | `/tea-framework` | Configure test framework (Playwright, Cypress, Pact, etc.) |
| **CI** | CI/CD Integration | `/tea-ci` | Integrate tests into CI/CD pipeline with quality gates |
| **TD** | Test Design | `/tea-test-design` | System-level test design and coverage strategy |
| **AT** | ATDD / Acceptance TDD | `/tea-atdd` | Write acceptance tests before implementation (Gherkin BDD) |
| **TA** | Test Automation | `/tea-automate` | Automate tests for an epic or sprint |
| **RV** | Test Review | `/tea-review` | Review test quality, coverage, and completeness |
| **TR** | Requirements Tracing | `/tea-trace` | Map tests to requirements for full traceability |
| **NR** | NFR Assessment | `/tea-nfr` | Assess and prioritize non-functional requirements |

---

## TEA Per-Phase Integration

### Phase 2: Planning

**NFR Assessment (`/tea-nfr`)**
- Elicits non-functional requirements (performance, security, reliability, scalability)
- Applies risk-based prioritization P0–P3
- **Level 3+ required** | Level 2 recommended | Level 0-1 optional
- Output: `docs/nfr-assessment-{project}-{date}.md`

```bash
# Run NFR assessment during planning phase
/tea-nfr
```

### Phase 3: Solutioning

**Test Design (`/tea-test-design`)**
- Designs system-level test strategy based on architecture
- Identifies test boundaries, contract tests, integration points
- Output: `docs/test-design-{project}-{date}.md`

**Framework Setup (`/tea-framework`)**
- Configures Playwright, Cypress, Pact, or custom framework
- Sets up directory structure, config, CI integration hooks
- Supported: Playwright, Cypress, Jest, Pytest, Pact, MCP integrations

**CI Integration (`/tea-ci`)**
- Configures CI/CD pipeline with test gates
- Adds quality gates: coverage threshold, test pass rate, performance budget
- Output: Updated `.github/workflows/` or equivalent

### Phase 4: Implementation

Run TEA workflows **per epic** during sprint execution:

**ATDD — Acceptance TDD (`/tea-atdd`)**
- Writes Gherkin `.feature` files BEFORE implementation
- Links feature files to story acceptance criteria
- Enables BDD workflow: Red → Green → Refactor

**Test Automation (`/tea-automate`)**
- Automates acceptance tests for the current epic
- Generates test fixtures, mocks, and helpers
- Integrates with CI gate from Phase 3

**Test Review (`/tea-review`)**
- Reviews test quality, coverage, and completeness
- Checks for: missing edge cases, duplicate tests, brittle selectors
- **Level 2+ required** before story close

**Requirements Tracing (`/tea-trace`)**
- Maps every test to a requirement or acceptance criterion
- Generates traceability matrix
- **Level 3+ required** before sprint close

### Release Gate

**`/tea-release-gate`**
- Final evidence-backed go/no-go decision before release
- Verifies: all P0-P1 tests pass, coverage thresholds met, NFR criteria satisfied
- Produces: Release Gate Report with explicit PASS/FAIL verdict
- **Level 2+ required**

---

## Risk Prioritization (P0–P3)

| Priority | Risk Level | Criteria | Action |
|----------|-----------|----------|--------|
| **P0** | Critical | High probability + Critical impact | Must test, blocks release |
| **P1** | High | High probability + High impact | Must test before release |
| **P2** | Medium | Medium probability + Medium impact | Should test, recommend automation |
| **P3** | Low | Low probability + Low impact | Optional, document decision |

Formula: `Risk = Probability × Impact`

---

## Project Level Requirements

| Level | NFR Assess | Test Design | ATDD | Test Review | Trace | Release Gate |
|-------|-----------|-------------|------|-------------|-------|--------------|
| 0 | Optional | Optional | Optional | Optional | Skip | Skip |
| 1 | Optional | Optional | Recommended | Recommended | Skip | Optional |
| 2 | Recommended | **Required** | **Required** | **Required** | Optional | **Required** |
| 3 | **Required** | **Required** | **Required** | **Required** | **Required** | **Required** |
| 4 | **Required** | **Required** | **Required** | **Required** | **Required** | **Required** |

---

## Supported Test Frameworks

| Framework | Use Case | TEA Workflow |
|-----------|----------|-------------|
| **Playwright** | E2E browser tests | TF, TA |
| **Cypress** | Component/E2E tests | TF, TA |
| **Pact** | Contract testing | TF, TD |
| **Jest/Vitest** | Unit tests | TF, TA |
| **Pytest** | Python unit/integration | TF, TA |
| **MCP integrations** | AI agent tool testing | TD, TA |

---

## Quick Reference

```bash
# Phase 2
/tea-nfr                    # NFR Assessment (Level 3+ required)

# Phase 3
/tea-test-design            # Test Design
/tea-framework              # Framework Setup
/tea-ci                     # CI Integration

# Phase 4 (per epic)
/tea-atdd                   # Write acceptance tests first
/tea-automate               # Automate tests
/tea-review                 # Review test quality
/tea-trace                  # Requirements tracing (Level 3+)

# Release
/tea-release-gate           # Final go/no-go
```
