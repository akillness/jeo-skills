# Triage
- Problem: The existing `genkit` skill still reads broader than necessary and can be tightened into a more routing-first front door for server-owned AI workflows, especially around backend flow ownership vs direct Firebase app integration vs plain SDK / framework-choice fallbacks.
- Audience: Agent maintainers and developers using `oh-my-skills` for web, backend, and fullstack AI work, especially Firebase-leaning app teams deciding where Genkit actually fits.
- Why now: `genkit` remains on the graph watchlist as an oversized front-door skill, while adjacent boundaries (`firebase-ai-logic`, `firebase-cli`) are already sharper. The next bounded improvement is to reduce overlap and make fallback / route-out decisions more explicit instead of adding another Firebase/AI wrapper.
