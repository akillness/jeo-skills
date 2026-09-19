# langchain-bmad setup and handoff

Use this file only when the user needs installation, package selection, or a
clear handoff between BMAD and the LangChain ecosystem skills.

## Install surface

Install BMAD from this repo:

```bash
npx skills add https://github.com/akillness/oh-my-gods --skill bmad --skill langchain-bmad
```

Install the LangChain skill collection:

```bash
npx skills add langchain-ai/langchain-skills --skill '*' --yes
```

If the host needs an explicit target agent, add `--agent claude-code`,
`--agent codex`, `--agent gemini`, or the host-specific equivalent.

## Package bundles to mention during planning

### Python

```bash
pip install -qU langchain langgraph langchain-openai
```

Add narrower packages only when the chosen framework lane requires them.

### TypeScript

```bash
npm install @langchain/core @langchain/openai @langchain/langgraph
```

## BMAD handoff rules

- Use `bmad` when the user needs project level, artifact sequence, or review
  status.
- Use `langchain-bmad` when the user needs both BMAD context and a framework
  routing choice.
- Use the narrower framework skill once the next lane is clear.

## Review-gate reminder

Before moving from one major BMAD artifact to the next:

- confirm the current artifact exists
- confirm the artifact passed review or was explicitly revised after review
- then hand off to the next framework skill

The bridge skill should keep that boundary explicit instead of flattening
planning and implementation into one answer.
