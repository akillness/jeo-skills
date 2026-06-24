# Video Production Skill Specification

## Overview
Canonical programmable-video and automated-video production anchor for the repository. Handles code-first, template-first, and hybrid content pipelines.

## Compatibility
This skill absorbs the legacy `remotion-video-production` alias. Any requests explicitly naming Remotion, React-based video rendering, or legacy Remotion workflows must be routed through this canonical skill using the code-first programmable video mode.

## Core Responsibilities
1. Normalize production requests.
2. Choose the best production mode (code-first, template-first, hybrid).
3. Return one implementation-ready packet.
4. Leave explicit asset, QA, and handoff guidance.

## References
- `production-modes.md`: Defines the available production modes.
- `asset-and-qa-checklist.md`: QA and asset management guidelines.
- `handoff-boundaries.md`: Handoff procedures.
- `alias-routing.md`: Legacy alias routing rules.
- `remotion-route-outs.md`: Specific route-outs for Remotion.
