---
name: prompts-chat
description: >
  Discover and apply curated prompts from the prompts.chat collection to optimize
  AI interactions. Use when refining prompt engineering, finding domain-specific
  prompt templates, improving response quality, or building prompt-based workflows.
  Triggers on: prompt optimization, prompt templates, prompt engineering, prompt
  library, curated prompts, prompt discovery, and AI prompt patterns.
allowed-tools: Read Write Edit Bash Glob Grep
compatibility: >
  Works across all AI platforms (Claude, ChatGPT, Gemini, Codex, and agents).
  Integrates with workflow agents for prompt pipeline automation and prompt
  versioning. Requires network access to fetch prompts.chat repository data.
license: MIT
metadata:
  tags: prompts, prompt-engineering, ai-optimization, prompt-templates, prompt-library, prompt-discovery, workflow-automation, prompt-curation
  platforms: Claude, ChatGPT, Gemini, Codex, jeo, jeopi
  version: "1.0.0"
  source: https://github.com/f/prompts.chat
---

# prompts-chat — Curated AI Prompt Discovery & Application

Discover and apply high-quality prompts from the prompts.chat collection to enhance AI interactions, workflows, and prompt engineering.

> **Reference**: [prompts.chat](https://github.com/f/prompts.chat) — a community-driven repository of useful prompts for various AI tasks and workflows.

## When to use this skill

- You need a well-crafted prompt template for a specific task or domain
- You're optimizing an AI workflow and want proven prompt patterns
- You're building a prompt library or managing prompt versions
- You want to discover prompts for roles, tasks, or use cases you're unfamiliar with
- You're troubleshooting response quality by refining the prompt structure

## When not to use this skill

- **The main job is building a full LLM application framework** → use `pydantic-ai`, `crewai-multi-agent`, or `langgraph-human-in-the-loop`
- **The main job is prompt optimization via RLHF or fine-tuning** → use `dspy`, `openrlhf-training`, or `moe-training`
- **The main job is building an agent system** → use `deep-agents-core`, `crewai-multi-agent`, or workflow skills like `team`
- **The main job is RAG pipeline construction** → use `llamaindex` or `supabase-agent-skills`

## Instructions

### Step 1: Classify your prompt need

Identify the category and use case:

```yaml
prompt_need:
  category: writing | coding | analysis | brainstorming | role-play | instruction-tuning | other
  use_case: single-task | template-library | workflow-pipeline | prompt-versioning
  domain: software | marketing | education | science | creative | business | other
  current_pain: quality | consistency | structure | discovery | version-control
```

### Step 2: Fetch and explore prompts.chat data

Access the prompts.chat repository to find relevant prompts:

```bash
# Clone or fetch the latest prompts collection
git clone https://github.com/f/prompts.chat.git /tmp/prompts-chat 2>/dev/null || \
  curl -s https://api.github.com/repos/f/prompts.chat/contents/ | jq '.[] | select(.type=="dir") | .name'

# List available categories
ls /tmp/prompts-chat 2>/dev/null || echo "Use online repository"
```

### Step 3: Evaluate and select prompts

For each candidate prompt, assess:

1. **Relevance**: Does it match your task or domain?
2. **Quality**: Is the prompt structure clear and well-organized?
3. **Adoptability**: Can you integrate it into your workflow without modification?
4. **Reusability**: Does it work as a template for variations?

### Step 4: Adapt prompts to your context

Customize selected prompts:

- Replace placeholders with your specific context
- Adjust tone, length, or output format to fit your workflow
- Test on representative inputs before full deployment
- Document variations and version changes

### Step 5: Store and manage prompt versions

Create a local prompt library for your project:

```bash
# Example structure
prompts/
  ├── approved/
  │   ├── code-review.md
  │   ├── technical-writing.md
  │   └── summarization.md
  ├── drafts/
  └── VERSIONS.md  # Track changes
```

Document:
- Source (prompts.chat or custom)
- Version date
- Intended use case
- Known limitations or tips

### Step 6: Integrate into workflows

Embed prompts into agent workflows:

```bash
# Reference prompt files in scripts
PROMPT=$(cat prompts/approved/technical-writing.md)
curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -d @- <<EOF
{
  "model": "gpt-4",
  "messages": [{"role": "system", "content": "$PROMPT"}]
}
EOF
```

### Step 7: Monitor and iterate

Track prompt performance:

- Note which prompts yield the best outputs
- Collect feedback from users or automated quality metrics
- Refine based on performance data
- Share improvements back to the community (optional)

## Examples

### Example 1: Finding a code-review prompt

**Goal**: Improve code review quality using a template prompt

```markdown
Search prompts.chat for "code review" or "code analysis" category
→ Find the "Code Review" prompt
→ Adapt it with your repo's standards and style guide
→ Store in `prompts/approved/code-review.md`
→ Use in code review workflows
```

### Example 2: Building a prompt library for content creation

**Goal**: Create consistent content across multiple topics

```markdown
Collect prompts for:
  - SEO-optimized blog post writing
  - Social media caption generation
  - Newsletter content curation
  - Video script structuring
→ Store each in prompts/approved/
→ Version and document in VERSIONS.md
→ Integrate into content pipeline
```

### Example 3: Prompt versioning and A/B testing

**Goal**: Compare prompt effectiveness

```markdown
Create versions:
  - prompts/approved/summarization-v1.md (original)
  - prompts/approved/summarization-v2.md (refined)
→ Test both on sample inputs
→ Measure quality metrics (brevity, accuracy, completeness)
→ Keep best version, document learnings
```

## Best practices

1. **Start with curated sources** — prompts.chat is battle-tested; use it as a foundation
2. **Document your source** — track which prompts come from where and why
3. **Version your prompts** — treat prompts like code; version and track changes
4. **Test before deploying** — validate new or modified prompts on representative inputs
5. **Share learnings** — contribute back to communities like prompts.chat when you improve a prompt
6. **Separate by use case** — organize prompts by domain, role, or task for discoverability
7. **Keep feedback loops** — collect data on which prompts work best and iterate
8. **Avoid prompt bloat** — retire or consolidate underused prompts regularly

## Integration with other skills

- **`dspy`** — Use prompts.chat prompts as seed optimizers for DSPy pipelines
- **`pydantic-ai`** — Embed curated prompts into Pydantic AI agent systems
- **`crewai-multi-agent`** — Structure multi-agent teams with role-specific prompts
- **`llm-wiki`** — Store and version prompts in your durable knowledge base
- **`user-guide-writing`** — Use prompts to help structure documentation workflows

## References

- [prompts.chat GitHub](https://github.com/f/prompts.chat)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Writing Guide](https://docs.anthropic.com/claude/docs/how-to-use-system-prompts)
- [Prompt Engineering Guide (community)](https://www.promptingguide.ai/)
