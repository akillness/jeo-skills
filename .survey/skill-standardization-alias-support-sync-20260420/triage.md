# Triage
- Problem: `skill-standardization` already covers canonical-vs-alias cleanup, but its reusable guidance is still too easy to stop at SKILL.md + catalog surfaces and miss alias-side support docs that quietly preserve stale packet shapes.
- Audience: Maintainers of `oh-my-skills/.agent-skills` and any agent loops that standardize or canonicalize overlapping skills.
- Why now: The repo has repeated alias hardening wins (`frontend-design-system`, `vercel-react-best-practices`, `remotion-video-production`, `marketing-skills-collection`), and the latest marketing ratchet again touched alias-side references; the meta-skill should encode that lesson explicitly instead of relying on wiki memory.
