# Solution Landscape: technical-writing modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Diátaxis | Documentation taxonomy (tutorial / how-to / reference / explanation) | Strong document-type separation; widely reusable for structure decisions | Not a full workflow for ADRs, runbooks, or release docs by itself | Best lens for boundary cleanup between technical vs user/API/changelog skills |
| Write the Docs | Docs-as-code guidance and writing practice hub | Strong operational guidance; bridges engineering and documentation ownership | Broad guidance, not a turn-key agent workflow | Useful for docs-as-code + audience + review practices |
| ADR project | Architectural Decision Records templates and practices | Sharp decision-capture lane for architecture docs | Narrow scope; does not cover runbooks, onboarding, or release comms | Good sub-mode inside a technical-writing anchor |
| Keep a Changelog | Change communication standard | Clear release-note structure and audience focus | Only covers release/change communication | Confirms `changelog-maintenance` should stay separate |
| Docusaurus | Docs platform / site generator | Versioning, docs sites, strong dev-doc publishing story | Tool choice, not document-governance model | Belongs after writing, not as the writing workflow itself |
| GitBook | Knowledge-system docs platform | Docs-as-code support + AI insights messaging | Platform-specific; mixes product/help-center use cases | Better as a publishing surface than a document-boundary skill |
| Mintlify | AI-native docs platform | Strong developer-doc + API-reference positioning | Vendor-specific and portal-centric | Reinforces API + portal boundary rather than internal-doc workflow |
| ReadMe | Interactive API-doc platform | Guides, recipes, changelog, developer dashboard | Portal/API-focused; can absorb too much if not bounded | Confirms `api-documentation` should stay external/published |
| Fern | OpenAPI + SDK + docs workflow | Strong API reference + SDK generation handoff | API-focused; not a general internal-docs skill | Reinforces separation from `technical-writing` |

## Categories
- **Documentation taxonomy / workflow models**: Diátaxis, Write the Docs
- **Decision-record methods**: ADR project
- **Release communication standards**: Keep a Changelog
- **Publishing / portal products**: Docusaurus, GitBook, Mintlify, ReadMe, Fern

## What People Actually Use
Teams still mix multiple surfaces:
- a docs-as-code repo or markdown workflow for internal specs / ADRs / runbooks,
- a separate API-doc portal or OpenAPI-driven site for external developer docs,
- a separate changelog or release-note process for shipped changes,
- and user-guide/onboarding material that follows a different tone and structure from internal technical docs.

## Frequency Ranking
1. Diátaxis + Write the Docs patterns show up as the clearest reusable structure layer for document-type separation.
2. API doc vendors (ReadMe, Fern, Mintlify) cluster around published developer portals, not generic internal technical writing.
3. Keep a Changelog remains the strongest focused standard for release notes rather than broad technical docs.
4. ADR practice is the clearest narrow pattern for architecture decision capture.

## Key Gaps
- Existing platforms describe where docs get published, but not how an agent should route between internal technical docs, end-user guides, API portals, and changelog hygiene.
- Legacy skills often collapse specs, ADRs, runbooks, release notes, and onboarding guides into one prompt, which weakens trigger precision.
- Few turnkey resources combine docs-as-code discipline with route-outs to neighboring documentation skills.

## Contradictions
- Vendor platforms market a unified docs surface, but real workflows still separate internal design docs, API references, user help content, and release notes.
- Generic technical-writing advice often claims to cover everything, while Diátaxis and ADR practice show that doc type matters materially for structure and review criteria.

## Key Insight
The best bounded improvement is not to add another documentation wrapper, but to modernize `technical-writing` into the internal technical-docs anchor: specs, ADRs, architecture docs, runbooks, migration notes, and decision-heavy developer documentation. That keeps `api-documentation`, `user-guide-writing`, and `changelog-maintenance` as explicit neighboring skills instead of overlapping variants.
