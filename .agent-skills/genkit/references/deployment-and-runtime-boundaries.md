# Genkit deployment and runtime boundaries

## Use Firebase when
- the product already lives deeply inside Firebase
- callable/API integration should stay close to existing Firebase app workflows
- teams want one platform story for auth, app surfaces, and deployment

Watch for:
- secret handling
- deployment ownership
- keeping app-side AI work and backend AI work clearly separated

## Use Cloud Run or another backend runtime when
- the team wants a clearer service boundary
- the AI workflow serves multiple surfaces or non-Firebase systems
- runtime control, networking, or scaling policy matters more than Firebase coupling

Watch for:
- auth between services
- rollout strategy
- cold starts / latency budgets
- logging and metrics ownership

## Keep local-first when
- the flow boundary is still changing
- prompt quality is unstable
- tools or retrieval steps still need inspection

But do not confuse local trace success with production readiness.

## Decision prompt
Ask:
1. Who owns the workflow in production?
2. Which clients must call it?
3. Does the team want Firebase alignment or a more explicit service boundary?
4. What must stay server-side for security or policy reasons?
