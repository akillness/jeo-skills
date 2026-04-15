# Triage
- Problem: `firebase-ai-logic` has sharper trigger wording after the `genkit` rewrite, but it is still a legacy command/example dump with no `references/` or `evals/`, plus stale setup guidance that blurs client SDK integration with backend orchestration.
- Audience: Agents working on Firebase-based mobile/web/fullstack apps that need to choose between direct in-app Gemini features, server-owned workflows, and Firebase platform operations.
- Why now: PR #66 already modernizes `genkit` and clarifies the boundary. The open PR is the clean place to ratchet the adjacent client-SDK skill so the Firebase AI lane has support coverage on both sides of the boundary instead of only on the backend side.
