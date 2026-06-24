# Remotion alias routing

`remotion-video-production` is a compatibility alias, not a second programmable-video peer.

## Use this alias when
- a user explicitly says `remotion-video-production`
- a setup surface, prompt pack, or migration still depends on the old folder/name
- the stack choice is explicitly Remotion and preserving that exact-name intent is useful

## Route to the canonical skill when
- the user just wants automated or repeatable video production without caring about the old alias name
- the request needs the full production-mode decision (code-first, template/API, repurposing, or manual-finish hybrid)
- the work depends on the canonical support packet for asset minimums, QA, and publishing handoffs

Canonical target: `../video-production/SKILL.md`

## Required response pattern
1. Acknowledge that `remotion-video-production` is still supported for compatibility.
2. State that the canonical workflow now lives in `video-production`.
3. Continue with the canonical workflow, locking the primary mode to **Code-first programmable video** when Remotion is truly the right fit.
4. Preserve the alias name only where exact-name compatibility matters.

## Why this exists
The repo keeps one canonical programmable-video entry plus one thin Remotion alias so legacy prompts keep working without turning the creative-media lane back into two overlapping peers.
