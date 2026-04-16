---
name: remotion-video-production
description: >
  Compatibility alias for `video-production` when a prompt, setup surface, or
  legacy workflow explicitly asks for Remotion video production. Use when the
  request names Remotion, React-based video rendering, compositions, scene
  components, or a legacy `remotion-video-production` catalog entry, but the real
  workflow is still the canonical programmable-video lane. Prefer
  `video-production` for general use. Triggers on: remotion-video-production,
  Remotion render pipeline, React video composition, migrate old Remotion skill.
allowed-tools: Write Read WebSearch WebFetch Task
metadata:
  tags: video, remotion, alias, compatibility, automation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

> **Note:** This skill is a compatibility wrapper for `video-production`. Use it when the environment still references the Remotion-specific name, but execute the same canonical programmable-video workflow with the **code-first programmable video** mode selected.

# Remotion Video Production

Read [references/alias-routing.md](references/alias-routing.md) and [references/remotion-route-outs.md](references/remotion-route-outs.md) before handling broad or ambiguous Remotion requests.

## When to use this skill
- A legacy prompt, installed catalog, or setup surface still calls `remotion-video-production`
- The user explicitly names Remotion, React-based video composition, scenes, compositions, or rendering from code
- The safest behavior is to preserve backward compatibility while steering future usage toward `video-production`

## When not to use this skill
- The user can already adopt `video-production` directly with no compatibility concern
- The request is really template/API automation with no Remotion-specific stack need
- The task is only manual finishing or editorial polish with no code-first render layer

## Instructions

### Step 1: Resolve to the canonical skill
Immediately map this alias to `video-production`.

### Step 2: Lock the mode to code-first programmable video
Run the canonical workflow, but choose **Code-first programmable video** unless the request clearly says the stack assumption is wrong.

### Step 3: Preserve the legacy / explicit reference in the response
If helpful, note that `remotion-video-production` is the legacy-compatible or explicit-stack alias for `video-production`.

### Step 4: Reuse the canonical packet shape
Use the same process as `video-production`:
1. normalize the video brief,
2. choose the packet type,
3. return one implementation-ready brief,
4. include assets, QA risks, and handoffs.

### Step 5: Keep alternative modes visible
If the ask sounds like bulk personalization, spreadsheet-driven generation, or vendor/API automation rather than a React video codebase, say so explicitly and route back through the relevant `video-production` mode instead of over-committing to Remotion.

### Step 6: Avoid becoming a competing skill
Do not invent separate heuristics, outputs, or support rules here. This alias exists to reduce migration friction and catch explicit Remotion naming, not to compete with the canonical skill.

## Output format
Return the same **Video Production Brief** used by `video-production`, with a Remotion-flavored stack recommendation when applicable.

## Examples

### Example 1: legacy setup surface
**Input**
> Use remotion-video-production to help us plan a reusable product video template.

**Expected behavior**
- Briefly note that the request maps to `video-production`
- Use the code-first programmable-video mode
- Return a canonical Video Production Brief

### Example 2: explicit stack request
**Input**
> We need a Remotion composition plan for weekly feature-announcement videos.

**Expected behavior**
- Treat the stack choice as explicit
- Use scene/template/rendering language
- Keep the packet shape aligned with the canonical skill

## Best practices
1. Keep the alias lightweight and explicit.
2. Preserve backward compatibility without duplicating the full canonical instructions.
3. Nudge future discovery toward `video-production` whenever naming or setup surfaces are being updated.
4. Reuse the canonical `video-production` support packet instead of improvising a second media workflow here.
5. Make route-outs explicit when a request is better served by template/API automation than by a Remotion codebase.

## References
- `../video-production/SKILL.md`
- `references/alias-routing.md`
- `references/remotion-route-outs.md`
