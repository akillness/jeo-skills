# Fabric Patterns for BMAD Workflows

[fabric](https://github.com/danielmiessler/fabric) is an AI prompt CLI with 250+ reusable patterns. Use it to analyze, improve, and summarize BMAD phase documents.

**Prerequisite:** `fabric --setup` (configure API keys and default model)

---

## Per-Phase Fabric Usage

### Phase 1: Analysis

```bash
# Extract insights from product brief
cat docs/product-brief-*.md | fabric -p analyze_paper --stream

# Extract wisdom, insights, and lessons
cat docs/product-brief-*.md | fabric -p extract_wisdom

# Summarize research findings
cat docs/research-*.md | fabric -p create_summary
```

### Phase 2: Planning

```bash
# Deep analysis of PRD
cat docs/prd-*.md | fabric -p analyze_paper --stream

# Check for strong vs weak claims in requirements
cat docs/prd-*.md | fabric -p analyze_claims

# Improve PRD writing quality before plannotator review
cat docs/prd-*.md | fabric -p improve_writing > /tmp/prd-improved.md

# Extract key decisions and risks
cat docs/tech-spec-*.md | fabric -p extract_wisdom
```

### Phase 3: Solutioning

```bash
# Summarize architecture decisions
cat docs/architecture-*.md | fabric -p create_summary

# Extract wisdom from architecture doc
cat docs/architecture-*.md | fabric -p extract_wisdom

# Security review of architecture
cat docs/architecture-*.md | fabric -p ask_secure_by_design

# Improve architecture doc before review
cat docs/architecture-*.md | fabric -p improve_writing > /tmp/arch-improved.md

# Then submit improved version for gate review
bash scripts/phase-gate-review.sh /tmp/arch-improved.md "Architecture Review"
```

### Phase 4: Implementation

```bash
# Explain a code diff before code review
git diff HEAD~1 | fabric -p explain_code

# Summarize sprint status
cat docs/sprint-status.yaml | fabric -p create_summary

# Analyze test failures
npm test 2>&1 | fabric -p analyze_logs

# Create PR description from git log
git log --oneline origin/main..HEAD | fabric -p create_summary

# Security check on implementation
cat src/auth.ts | fabric -p ask_secure_by_design
```

### Integration with TEA

```bash
# Analyze test coverage summary
cat docs/stories/*.md | fabric -p extract_wisdom | fabric -p create_summary

# Review acceptance criteria quality
cat docs/stories/*.feature | fabric -p analyze_claims

# Extract test insights for release gate
cat test-results/*.xml | fabric -p analyze_logs > /tmp/test-summary.md
```

---

## Key Fabric Patterns for BMAD

| Pattern | Best For | BMAD Phase |
|---------|----------|-----------|
| `analyze_paper` | Deep analysis of spec documents | Phase 1, 2, 3 |
| `extract_wisdom` | Extract insights, decisions, risks | All phases |
| `create_summary` | Create structured markdown summaries | All phases |
| `improve_writing` | Polish docs before plannotator review | Phase 2, 3 |
| `analyze_claims` | Fact-check technical assumptions | Phase 2, 3 |
| `explain_code` | Understand implementation changes | Phase 4 |
| `ask_secure_by_design` | Security review | Phase 3, 4 |
| `analyze_logs` | Process build/test output | Phase 4 |
| `create_tags` | Generate tags for docs | All phases |

---

## Creating Custom BMAD Patterns

Create project-specific patterns in `~/.config/fabric/patterns/`:

### Pattern: bmad-prd-review

```bash
mkdir -p ~/.config/fabric/patterns/bmad-prd-review
cat > ~/.config/fabric/patterns/bmad-prd-review/system.md << 'EOF'
# IDENTITY AND PURPOSE

You are an expert product manager reviewing a PRD for completeness and clarity.

# STEPS

1. Check for: clear problem statement, target users, success metrics, acceptance criteria
2. Identify missing or ambiguous requirements
3. Rate each section: Complete / Needs Work / Missing
4. Provide specific improvement recommendations

# OUTPUT INSTRUCTIONS

- Output in Markdown
- Use ## sections: Summary, Missing Elements, Improvement Suggestions
- Be concise and actionable
EOF
```

### Pattern: bmad-architecture-check

```bash
mkdir -p ~/.config/fabric/patterns/bmad-architecture-check
cat > ~/.config/fabric/patterns/bmad-architecture-check/system.md << 'EOF'
# IDENTITY AND PURPOSE

You are a senior architect reviewing a BMAD architecture document.

# STEPS

1. Verify: system overview, component design, API contracts, security, performance
2. Identify gaps vs requirements (assumes PRD context was provided)
3. Flag scalability, security, and operational risks

# OUTPUT INSTRUCTIONS

- Output in Markdown
- ## sections: Architecture Summary, Gaps, Risks, Recommendations
EOF
```

---

## Pro Tips

```bash
# Stream output for long documents
cat docs/prd-*.md | fabric -p analyze_paper --stream

# Save analysis to file
cat docs/architecture-*.md | fabric -p extract_wisdom > docs/arch-insights.md

# Chain patterns for richer analysis
cat docs/prd-*.md | fabric -p extract_wisdom | fabric -p create_summary

# Per-pattern model routing (~/.config/fabric/.env)
FABRIC_MODEL_PATTERN_ANALYZE_PAPER=anthropic|claude-opus-4-5
FABRIC_MODEL_PATTERN_EXTRACT_WISDOM=openai|gpt-4o
FABRIC_MODEL_PATTERN_IMPROVE_WRITING=google|gemini-2.5-flash
```
