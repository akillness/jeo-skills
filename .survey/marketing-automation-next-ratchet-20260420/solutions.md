# Solution Landscape: marketing-automation next ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Asana / Monday / Airtable / Notion | Launch and campaign coordination systems | Good for milestones, owners, templates, dashboards, and cross-functional visibility | Weak at deciding the real marketing lane; can turn into task soup | Best viewed as coordination layers, not routing brains |
| HubSpot / Marketo / ActiveCampaign / Brevo / Mailchimp | Broad CRM + marketing automation suites | Centralize forms, email, segmentation, nurture, and reporting | Encourage execution before upstream routing clarity; attribution/reporting still messy | Strong downstream owners once a packet exists |
| Braze / Iterable / Customer.io / Klaviyo / OneSignal | Lifecycle and journey orchestration | Strong triggered messaging and segmentation | Need event taxonomy and still do not fix the underlying product/offer bottleneck | Specialist execution, not broad front-door routing |
| Optimizely / VWO / AB Tasty / Unbounce / Instapage / Hotjar | CRO, testing, and conversion-surface tools | Strong for isolated page/flow hypotheses and evidence | Over-focus on local surfaces; needs enough traffic and discipline | Best after the work is already clearly a conversion-surface packet |
| Ahrefs / Semrush / Clearscope / Surfer / Frase / MarketMuse | SEO and content systems | Turn discovery work into repeatable content briefs and calendars | Optimize coverage/format more than differentiation | Best after the work is already clearly acquisition-content |
| GA4 / Amplitude / Mixpanel / Segment / RudderStack / Looker Studio | Measurement and product/marketing analytics | Good for funnel analysis, KPI dashboards, and instrumentation | Dashboards answer what happened, not what packet should be built next | Useful measurement handoff destination |
| Statsig / Eppo / LaunchDarkly / Amplitude Experiment | Experimentation and controlled testing | Strong when the problem is already a testable experiment | Requires mature instrumentation and explicit hypotheses | Good downstream packet owners, not broad marketing routers |
| Steamworks / Steam specialist workflows | Game-store launch systems | Own Steam-specific launch/store proof, timing, and release constraints | Not general SaaS/product marketing routing | Explicit route-out, not overlap |

## Categories
- **Coordination systems:** Asana, Monday, Airtable, Notion
- **Broad marketing suites:** HubSpot, Marketo, ActiveCampaign, Mailchimp, Brevo
- **Lifecycle / CRM specialists:** Braze, Iterable, Customer.io, Klaviyo, OneSignal
- **CRO / testing tools:** Optimizely, VWO, AB Tasty, Unbounce, Hotjar
- **SEO / content tools:** Ahrefs, Semrush, Clearscope, Surfer, Frase, MarketMuse
- **Analytics / measurement layers:** GA4, Amplitude, Mixpanel, Segment, RudderStack, Looker Studio
- **Experiment platforms:** Statsig, Eppo, LaunchDarkly, Amplitude Experiment
- **JTBD alternatives / substitutes:** spreadsheets, launch docs, campaign briefs, content calendars, KPI trackers, PM boards, and specialist game-launch workflows

## What People Actually Use
In practice, teams mix a coordination layer with one or more execution suites and then patch proof together later. The durable artifacts are still launch briefs, campaign briefs, content calendars, KPI trackers, and approval checklists. Execution systems are downstream owners, not the first classifier.

## Frequency Ranking
1. Coordination/template systems for launch or campaign planning
2. Broad CRM + marketing automation suites for execution
3. Lifecycle suites for onboarding/retention work
4. Analytics/reporting stacks for proof and readouts
5. CRO/testing stacks for page/flow bottlenecks
6. SEO/content stacks for acquisition content
7. Experiment platforms for mature teams
8. Specialist route-outs such as Steamworks for game launch

## Key Gaps
- Most products assume the operator already knows whether the ask is launch, lifecycle, CRO, SEO/content, or measurement.
- Few tools explain when the work is actually a planning problem, a product problem, or a specialist game-launch problem.
- The market is rich in execution systems and thin in honest front-door routing systems that force one mode, one owner, one packet, and one proof handoff.
- Manual coordination reality (approvals, dependency tables, readout cadence, shared tracker truth) is usually under-modeled even though teams depend on it.

## Contradictions
- **Marketed claim:** all-in-one automation platforms streamline marketing.
  **User reality:** coordination, approvals, and KPI ownership still live in docs, boards, and spreadsheets.
- **Marketed claim:** analytics/reporting shows where to invest next.
  **User reality:** attribution and cross-channel proof often remain manual and contested.
- **Marketed claim:** templates make launch or campaign work easy.
  **User reality:** template choice often masks the unresolved question of what lane should own the work.

## Alternatives / indirect substitutes
- PM/project tools and launch trackers
- Shared docs, spreadsheets, and dashboards
- Specialist execution suites by channel
- Game-launch specialist workflows for Steam-specific asks
- Product/planning workflows when marketing is not the real bottleneck

## Curated Sources
- [Asana Product Launch](https://asana.com/uses/product-launch)
- [Notion Marketing Templates](https://www.notion.com/templates/category/marketing)
- [HubSpot Marketing Hub](https://www.hubspot.com/products/marketing)
- [Braze](https://www.braze.com/product/customer-engagement-platform)
- [Iterable Journey Orchestration](https://iterable.com/platform/journey-orchestration/)
- [Customer.io](https://customer.io/)
- [Optimizely Experimentation](https://www.optimizely.com/products/experimentation/)
- [VWO](https://vwo.com/)
- [Semrush Content Marketing Platform](https://www.semrush.com/content-marketing-platform/)
- [Amplitude](https://amplitude.com/)
- [Mixpanel](https://mixpanel.com/)
- [Steamworks Sales & Marketing](https://partner.steamgames.com/doc/marketing)

## Key Insight
The crowded part of the market is execution: CRM suites, lifecycle tools, CRO tools, SEO tools, and dashboards. The thinner gap is the front door. `marketing-automation` is most useful when it does not imitate another execution suite or template library, but instead mirrors what operators really do: decide one primary motion, produce one human-readable packet, name the owner/dependencies/proof, and route adjacent work out before the answer turns into a channel buffet.
