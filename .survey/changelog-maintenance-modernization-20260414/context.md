# Context: changelog-maintenance modernization

## Workflow Context
`changelog-maintenance` sits at the intersection of several release-communication workflows:

1. **Developer workflow / docs-as-code** — teams need a trustworthy `CHANGELOG.md`, release notes, and migration callouts tied to versioning and repo history instead of raw commit dumps. Keep a Changelog explicitly warns against dumping git logs into changelogs and treats a changelog as a user-facing communication artifact rather than a commit archive. Source: https://keepachangelog.com/en/1.1.0/
2. **Product / PM / UX operations** — product-facing release notes are a customer communication surface, not just an engineering record. ProductPlan frames release notes as a missed opportunity when they are technical, vague, or too long, and recommends plain language, concise entries, logical grouping, relevant links, and personality. Source: https://www.productplan.com/learn/release-notes-best-practices/
3. **Marketing / GTM / launch communication** — release notes often double as adoption nudges, launch follow-through, and links to help/tutorial surfaces. Yahoo-indexed SaaS guide results repeatedly emphasize “drive feature adoption,” “inform users,” and “include relevant links,” which implies the skill should route to user-guide-writing / marketing surfaces instead of pretending the changelog alone is enough. Sources: browser-rendered indexed snippets from Yahoo Japan for ProductPlan, AnnounceKit, Userpilot, Appcues.
4. **Game development / live updates** — Steam treats update communication as part of the release process, with lightweight patch-note posts tied to game updates and separate major-update visibility/announcement mechanics. That means a game-facing changelog skill should support patch-note mode and route deeper store/marketing mechanics elsewhere. Sources: https://partner.steamgames.com/doc/marketing/event_tools/type_patchnotes?l=english and https://partner.steamgames.com/doc/store/updates?l=english

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Software maintainer | Maintain `CHANGELOG.md`, version notes, migration callouts, and release summaries | Mixed |
| Product manager | Turn shipped changes into understandable user-facing release communication | Mixed |
| Developer relations / docs owner | Keep release notes linked to docs, guides, and upgrade instructions | Intermediate |
| Marketing / GTM operator | Repackage notable changes into customer-facing launch communication | Mixed |
| Game developer / live-ops owner | Publish lightweight patch notes and update announcements tied to shipped builds | Mixed |

## Current Workarounds
1. Raw git history, PR titles, or commit lists copied into a changelog.
   - Limitation: violates Keep a Changelog guidance and produces low-signal release communication.
2. One generic release-notes template reused for every audience.
   - Limitation: hides the difference between internal changelog, developer release notes, customer-facing notes, and game patch notes.
3. Separate docs, marketing notes, and migration guides maintained ad hoc with no explicit boundary.
   - Limitation: neighboring skills (`technical-writing`, `user-guide-writing`, `api-documentation`) now route here, but the current skill does not route back cleanly.
4. Tool-first automation (`release-drafter`, `changesets`, `release-please`) adopted without a clear editorial policy.
   - Limitation: automation drafts text, but humans/agents still need grouping, audience selection, deprecation messaging, and link hygiene.

## Adjacent Problems
- Versioning policy drift: semantic version labels are applied inconsistently when breaking changes or migration steps are not explicit.
- Docs drift: release notes mention a feature but do not link to help/docs/migration surfaces.
- Audience confusion: internal operator changes, developer integration changes, customer-facing UX updates, and player-facing patch notes get mixed together.
- Overlap risk with neighboring documentation skills unless route-outs are explicit.

## User Voices
> “Don’t let your friends dump git logs into changelogs.” — Keep a Changelog, guiding principle. Source: https://keepachangelog.com/en/1.1.0/

> “Release notes represent an opportunity to communicate with your customer base.” — ProductPlan. Source: https://www.productplan.com/learn/release-notes-best-practices/

> “Leave the techno-jargon out.” — ProductPlan best-practice guidance for release notes. Source: https://www.productplan.com/learn/release-notes-best-practices/

> “Patch notes are designed to be lightweight and easy to post… you really only need to fill out two fields: title and description.” — Steamworks patch-note docs. Source: https://partner.steamgames.com/doc/marketing/event_tools/type_patchnotes?l=english

## Evidence notes
- Web search/extract API was unavailable (`401 Invalid API key`), so this survey used direct page retrieval plus browser-rendered Yahoo Japan indexed snippets for discovery.
- Confidence: high for Keep a Changelog / ProductPlan / Steam docs (primary pages opened), medium for SaaS comparison guidance recovered from Yahoo Japan snippets.
