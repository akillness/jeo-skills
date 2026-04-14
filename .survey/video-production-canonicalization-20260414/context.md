# Context: video-production canonicalization

## Workflow Context
Programmable video shows up when teams need repeatable, template-driven, data-backed output rather than one bespoke edit. Remotion positions itself as "Make videos programmatically" with React-based composition, dynamic data, and local/server/serverless rendering, which makes the workflow feel closer to automation and product tooling than to classic editor-only video work. Shotstack and Creatomate position the same lane around scalable API-driven or template-driven video creation, personalization, and workflow automation.

Sources:
- Remotion homepage — https://www.remotion.dev/
- Shotstack homepage — https://shotstack.io/
- Creatomate homepage — https://creatomate.com/
- Remotion customers / examples — https://www.remotion.dev/customers

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Growth / lifecycle marketer | Turn campaign, launch, and onboarding inputs into repeatable branded video variants | low-to-medium technical, high ops pressure |
| Content ops / social team | Repurpose long-form content into shorts, reels, localized cuts, and captioned variants | medium |
| Developer-marketer / product engineer | Connect templates, data, rendering, and publishing workflows | medium-to-high |
| Creative ops / agency team | Maintain reusable templates across clients while preserving brand consistency | medium |

## Current Workarounds
1. Manual editing in Premiere / After Effects / CapCut for each variant, which works for bespoke polish but breaks down for batch generation.
2. Template + API SaaS tools such as Shotstack, Creatomate, and Bannerbear when teams want faster automation with less code ownership.
3. FFmpeg / custom scripts for lightweight stitching or caption overlays when teams need automation but not a full motion-design stack.
4. Hybrid workflows where automation generates first drafts and editors still perform final caption cleanup, timing, reframing, and approval.

## Adjacent Problems
- Asset management and brand-safe template reuse
- Localization / aspect-ratio explosion across channels
- Caption timing and readability QA
- Review / approval and publishing handoff outside the render stack
- Infrastructure cost, queueing, and render reliability for high-volume output

## User Voices
- Remotion explicitly emphasizes programmatic composition, dynamic data, server rendering, and app embedding, which signals a developer/automation workflow more than a general "make a video" prompt. Source: https://www.remotion.dev/
- Shotstack emphasizes scalable video infrastructure, API generation, workflow templates, and white-label editors, showing that users in this lane often need automation and distribution plumbing rather than a traditional editing tutorial. Source: https://shotstack.io/
- Creatomate positions itself as a media automation platform for developers and no-code users, with tutorials for social clips, personalization, bulk generation, and Zapier/Make automation. Source: https://creatomate.com/
- Repo-local evidence: both `video-production` and `remotion-video-production` currently share the same description in `.agent-skills/skills.json`, so discovery surfaces cannot tell users which name is canonical or when the Remotion-specific alias matters.
