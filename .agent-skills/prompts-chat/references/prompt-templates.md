# Prompt Template Reference Guide

This guide documents common prompt templates from the prompts.chat collection and how to adapt them for your use cases.

## Template Categories

### 1. Coding & Development

**Code Review Prompt**
- **Source**: prompts.chat/coding/code-review
- **Use case**: Automated code analysis, quality gates, best practices checks
- **Customization**: Add your tech stack, coding standards, framework conventions

**Bug Analysis & Debugging**
- **Source**: prompts.chat/coding/debug
- **Use case**: Error diagnosis, root cause analysis, solution generation
- **Customization**: Include stack traces, error logs, reproduction steps

**API Documentation**
- **Source**: prompts.chat/coding/api-documentation
- **Use case**: Generate API docs from code, create SDK tutorials
- **Customization**: Add API version, target language, audience level

### 2. Writing & Content

**Technical Writing**
- **Source**: prompts.chat/writing/technical-doc
- **Use case**: Architecture docs, implementation guides, runbooks
- **Customization**: Project scope, technical level, audience role

**Blog Post Writing**
- **Source**: prompts.chat/writing/blog-post
- **Use case**: SEO-optimized content, thought leadership articles
- **Customization**: Target keywords, tone, publication guidelines

**Social Media Captions**
- **Source**: prompts.chat/writing/social-media
- **Use case**: Platform-specific content (Twitter, LinkedIn, Instagram)
- **Customization**: Platform, tone, call-to-action strategy

### 3. Analysis & Research

**Summarization**
- **Source**: prompts.chat/analysis/summarize
- **Use case**: Extract key points, create abstracts, generate summaries
- **Customization**: Length, detail level, audience expertise

**Market Research Analysis**
- **Source**: prompts.chat/analysis/market-research
- **Use case**: Competitive analysis, trend identification
- **Customization**: Industry, geography, time frame

**Data Analysis Report**
- **Source**: prompts.chat/analysis/data-report
- **Use case**: Transform raw data into insights and visualizations
- **Customization**: Dataset type, metric definitions, audience

### 4. Role-Based Prompts

**Software Architect**
- **Source**: prompts.chat/roles/architect
- **Use case**: Design system decisions, architecture reviews
- **Customization**: Company scale, tech constraints, team structure

**Product Manager**
- **Source**: prompts.chat/roles/product-manager
- **Use case**: Feature specs, requirements gathering, roadmap planning
- **Customization**: Product domain, user base, release cycles

**DevOps Engineer**
- **Source**: prompts.chat/roles/devops
- **Use case**: Infrastructure design, deployment automation, monitoring
- **Customization**: Cloud provider, scale, compliance requirements

## Adaptation Workflow

### Step 1: Select Base Prompt
```markdown
Goal: Improve code review workflow
Search term: "code review"
Source: prompts.chat/coding/code-review.md
```

### Step 2: Extract Core Template
```markdown
Original prompt structure:
  1. Context setting
  2. Specific instructions
  3. Output format
  4. Examples (if provided)
  5. Edge case handling
```

### Step 3: Customize for Your Context
```markdown
Customization checklist:
  - [ ] Replace generic examples with your codebase patterns
  - [ ] Add company-specific coding standards
  - [ ] Include framework/language-specific rules
  - [ ] Define output format for your tools/platform
  - [ ] Add team-specific conventions
```

### Step 4: Document & Version
```markdown
File: prompts/approved/code-review-v1.md
Source: prompts.chat/coding/code-review
Date: 2024-01-15
Version: 1.0
Status: Active
Notes: Tailored for Python/FastAPI projects
```

### Step 5: Test & Validate
```markdown
Test cases:
  1. Sample PR with obvious issues
  2. Complex refactoring scenario
  3. Documentation-only changes
  4. Performance optimization
  5. Security-sensitive code
```

## Common Prompt Patterns

### Pattern: Task + Context + Format

**Template**:
```
You are a [ROLE].

Your task: [SPECIFIC_TASK]

Context:
- [Context point 1]
- [Context point 2]
- [Context point 3]

Output format:
[Desired output structure]

Examples:
[Optional: concrete examples]
```

**Usage**: Best for structured outputs, role-based responses

### Pattern: Few-Shot Learning

**Template**:
```
Analyze the following examples and apply the same logic:

Example 1:
Input: [example input]
Output: [example output]

Example 2:
Input: [example input]
Output: [example output]

Now analyze this:
Input: [user input]
```

**Usage**: Teaching complex patterns, classification tasks

### Pattern: Chain-of-Thought

**Template**:
```
Think step-by-step:

Step 1: [Define the problem]
Step 2: [Identify constraints]
Step 3: [Brainstorm solutions]
Step 4: [Evaluate options]
Step 5: [Provide recommendation]

Reasoning: [Explain your thinking]
```

**Usage**: Complex analysis, strategic decisions, problem-solving

### Pattern: Structured JSON Output

**Template**:
```
Analyze the following and return valid JSON:

Input: [your content]

Return a JSON object with these fields:
{
  "summary": "...",
  "key_points": [...],
  "risks": [...],
  "recommendations": [...]
}

Ensure the JSON is valid and parseable.
```

**Usage**: Machine-readable outputs, API integrations

## Best Practices for Prompt Customization

### 1. Be Specific, Not Generic
❌ Bad: "Review this code"
✅ Good: "Review this Python/FastAPI endpoint for security vulnerabilities, performance issues, and adherence to PEP 8"

### 2. Provide Context
❌ Bad: "Summarize this"
✅ Good: "Summarize this technical document for a non-technical stakeholder who needs to understand the business impact"

### 3. Define Output Format
❌ Bad: "Tell me what to fix"
✅ Good: "Return a bullet list with: issue severity (critical/major/minor), description, and suggested fix"

### 4. Use Examples When Possible
When prompting for classification, generation, or analysis, include 2-3 concrete examples of desired output.

### 5. Clarify Constraints
- Audience expertise level
- Output length / detail level
- Technical terminology expectations
- Format requirements (markdown, JSON, plain text)

## Troubleshooting Prompt Performance

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Output is too generic | Prompt lacks specificity or context | Add examples, constraints, or detail requirements |
| Output is too verbose | No length guidance | Add "brief", "concise", or character limit |
| Wrong format | Output format unclear | Specify format explicitly with examples |
| Inconsistent results | Prompt ambiguity | Clarify instructions and add examples |
| Low quality/accuracy | Prompt too complex | Break into steps or use chain-of-thought |

## Integration Examples

### Integration with CI/CD
```yaml
# .github/workflows/review.yml
- name: AI Code Review
  run: |
    PROMPT=$(cat prompts/approved/code-review.md)
    # Use with your AI API or local model
```

### Integration with Documentation Generation
```bash
# Generate docs using curated prompt
PROMPT=$(cat prompts/approved/api-documentation.md)
claude-api --model claude-3-sonnet --system "$PROMPT" < code.py
```

### Integration with Content Pipeline
```bash
# Batch content generation
for topic in $(cat content-list.txt); do
  PROMPT=$(cat prompts/approved/blog-post.md)
  # Replace {{TOPIC}} placeholder
  PROMPT="${PROMPT//\{\{TOPIC\}\}/$topic}"
  # Generate content
done
```

## Resources

- [prompts.chat GitHub](https://github.com/f/prompts.chat)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic System Prompts](https://docs.anthropic.com/claude/docs/how-to-use-system-prompts)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
