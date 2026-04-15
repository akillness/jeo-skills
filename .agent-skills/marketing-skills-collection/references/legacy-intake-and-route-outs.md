# Legacy intake and route-outs

Use this packet when the old alias is invoked but the real work still needs to land in the correct canonical lane.

## Translate the old ask into the canonical brief
Normalize the request into this minimum shape before routing:

```yaml
marketing_brief:
  objective: acquisition | activation | conversion | retention | revenue | awareness | unknown
  primary_kpi: "single number that matters most right now"
  audience: "main segment"
  asset_or_surface: landing-page | onboarding-flow | launch | lifecycle-email | seo-page | analytics | unknown
  main_question: "what should happen next?"
```

If the original request is messy, continue with explicit assumptions instead of blocking.

## Canonical lane reminders
- **CRO** — page / funnel / form / paywall conversion work
- **Copy & messaging** — positioning, copy, CTA, lifecycle words
- **SEO & content** — search demand, comparison pages, structure, content planning
- **Ads & analytics** — tracking, paid acquisition, readout setup
- **Strategy & growth** — launch, pricing, retention, churn, experiments

Choose one lane that reduces ambiguity fastest.

## Route-outs that should stay explicit
### Route to `steam-store-launch-ops`
Use the specialist game-launch skill when the request is mainly about:
- Steam store pages or capsules
- Next Fest or wishlist operations
- game demo/store positioning inside a storefront launch workflow
- launch calendars and store-ops checkpoints tied to Steam

### Stay with `marketing-automation`
Use the canonical broad router when the task is still fundamentally:
- general website or SaaS conversion work
- launch messaging that is not storefront-ops specific
- onboarding / lifecycle / pricing / growth packet design
- KPI-aware packet routing before specialist execution

## Anti-drift rule
The alias can preserve the old name, but it must not preserve the old worldview that this skill is its own broad marketing generator. The workflow should converge back to one canonical router as soon as the request is understood.
