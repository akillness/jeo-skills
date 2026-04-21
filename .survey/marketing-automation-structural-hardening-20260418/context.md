# Context: marketing-automation structural hardening

## Workflow Context
Broad product/growth marketing requests usually arrive as mixed packets: launch sequencing, landing-page changes, onboarding/lifecycle questions, content/SEO work, and measurement uncertainty bundled together. Official work-management and template surfaces reinforce that split. Asana's product-launch page emphasizes visibility, milestones, partner coordination, dashboards, and templates rather than one generic “marketing plan” object ([Asana Product Launch](https://asana.com/uses/product-launch)). Notion's marketing templates page exposes separate categories for Product Launch Plan, Marketing Strategy Doc, Campaign Brief, Content Calendar, Social Media, and Email Marketing Planner, which signals that teams still break work into distinct artifacts even inside one tool ([Notion marketing templates](https://www.notion.com/templates/category/marketing)). HubSpot's Marketing Hub positions its product around attracting, converting, and engaging visitors with cross-channel campaigns plus strategic reporting, again separating orchestration, execution, and measurement concerns ([HubSpot Marketing Hub](https://www.hubspot.com/products/marketing)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Product marketer / PMM | Launch sequencing, positioning, packaging, pricing, go-to-market briefs | Intermediate to advanced |
| Growth marketer | Conversion, lifecycle, experiments, KPI movement | Intermediate to advanced |
| Founder / solo operator | Mixed launch + copy + measurement asks without a dedicated team | Mixed |
| Lifecycle / CRM owner | Onboarding, activation, retention, re-engagement programs | Intermediate |
| Cross-functional operator | Translating messy business asks into a packet another specialist can execute | Mixed |

## Current Workarounds
1. Teams use project/work-management tools for launch coordination and status visibility, then hand off to specialist channel tools later ([Asana Product Launch](https://asana.com/uses/product-launch)).
2. Teams lean on template marketplaces to pick a document shape after the fact: Product Launch Plan, Marketing Strategy Doc, Campaign Brief, Content Calendar, or Email Marketing Planner ([Notion marketing templates](https://www.notion.com/templates/category/marketing)).
3. Teams adopt marketing suites for cross-channel execution and reporting, but those suites still assume the team already knows which motion matters most now ([HubSpot Marketing Hub](https://www.hubspot.com/products/marketing)).
4. Indexed community snippets still show spreadsheet-heavy and tracker-heavy practice: Yahoo Japan search results for `site:reddit.com marketing plan spreadsheet launch analytics` surfaced Reddit threads about Excel still ruling analytics, free PPC spreadsheets, a self-built marketing tracker, and Google Sheets formulas/forecasting for marketers (`browser-rendered indexed snippet`, high confidence because URL + snippet were visible in the same run).

## Adjacent Problems
- If the real bottleneck is planning/slicing rather than marketing lane choice, the request belongs closer to `task-planning`.
- If the work is game-store-specific launch ops, Steam's documentation exposes a specialist surface with Wishlists, Visibility, UTM Analytics, Events and Announcements, Traffic Reporting, and Branding rather than a generic SaaS/product-marketing workflow ([Steamworks Sales and Marketing](https://partner.steamgames.com/doc/marketing)).
- When launch, lifecycle, and analytics all stay in the same front door, outputs tend to become channel soup instead of one handoff packet.

## User Voices
- Yahoo Japan indexed snippet: “Marketing Analytics: Fancy dashboards, but Excel rules?” with snippet text pointing to dashboard trend lines vs business metrics work still being handled in Excel (`https://www.reddit.com/r/DigitalMarketing/comments/1im4gt2/marketing_analytics_fancy_dashboards_but_excel/`).
- Yahoo Japan indexed snippet: “Been running ads for 10 years. Here are 4 FREE ...” with snippet text explicitly describing spreadsheets used day-to-day by a media buyer (`https://www.reddit.com/r/PPC/comments/1aiwvlh/been_running_ads_for_10_years_here_are_4_free/`).
- Yahoo Japan indexed snippet: “Any good templates for managing a marketing department ...” with snippet text describing a self-made Marketing Tracker containing an actions dashboard, year-long multichannel planner, and performance tracker (`https://www.reddit.com/r/marketing/comments/1id72cs/any_good_templates_for_managing_a_marketing/`).
- Yahoo Japan indexed snippet: lifecycle-tool discussions surfaced the complaint that tools like Customer.io assume the operator is already good at email/lifecycle marketing, which supports keeping lifecycle mode selection explicit rather than hiding it behind generic “automation” wording (`https://www.reddit.com/r/Emailmarketing/comments/1p0adnq/what_sucks_about_customerio/`).
