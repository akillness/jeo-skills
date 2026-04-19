# Lane C: Actual behavior

## What People Actually Use
- Stack Overflow’s 2025 AI survey shows most practitioners still use simpler copilots and single-agent helpers rather than full autonomous agent stacks.
- Common tooling among agent builders still leans on familiar infrastructure and workflow engines rather than bespoke all-in-one orchestration layers.
- Planning, deployment, and code review remain areas where practitioners often keep explicit human oversight.
- Anthropic’s own guidance recommends choosing the simplest workflow that works rather than defaulting to elaborate agent systems.

## Common Workarounds
- Human verification remains the default backstop when trust is low.
- Teams externalize state into versioned prompt files, repo-local docs, or code-adjacent config instead of relying on hidden chat context.
- Approval gates stay explicit whenever tools can touch external systems.
- Predictable workflows plus explicit handoffs beat wide autonomy in most real delivery loops.

## Pain Points With Current Solutions
- Accuracy concerns remain the biggest blocker to full autonomous loops.
- Security and integration concerns still force route-outs and human checks.
- Collaboration and traceability remain weaker than individual productivity gains.
- Oversized orchestration surfaces risk mixing routing, state, approvals, and runtime details into one hard-to-maintain front door.

## Sources
- https://survey.stackoverflow.co/2025/ai/
- https://www.anthropic.com/engineering/building-effective-agents
- https://humanloop.com/blog/prompt-management
- https://humanloop.com/blog/prompt-files
- https://humanloop.com/blog/mcp
