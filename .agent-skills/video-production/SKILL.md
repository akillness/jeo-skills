---
name: video-production
description: >
  Plan and route programmable or automated video production across code-first,
  template-first, and hybrid content pipelines. Use when the user needs repeatable
  video generation, branded short-form content, personalized videos, social clip
  batches, captioned/localized variants, video APIs, or video creation from data
  and templates — even if they only say video production. Triggers on: Remotion,
  programmatic video, automated video creation, video API, personalized video,
  batch-create shorts, render videos from code, repurpose content into clips.
allowed-tools: Write Read WebSearch WebFetch Task
compatibility: >
  Canonical programmable-video / automated-video skill for the repo. Use this as
  the main entry point; `remotion-video-production` is the compatibility alias for
  legacy or explicitly Remotion-named requests.
metadata:
  tags: video, automation, remotion, short-form, content-ops, templates, react
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Video Production

Use this skill as the **canonical programmable-video and automated-video production anchor** for the repository.

The job is not to dump a generic storyboard or act like a manual editor tutorial. The job is to:
1. normalize the production request,
2. choose the best production mode,
3. return one implementation-ready packet,
4. leave explicit asset, QA, and handoff guidance.

Read [references/production-modes.md](references/production-modes.md), [references/asset-and-qa-checklist.md](references/asset-and-qa-checklist.md), and [references/handoff-boundaries.md](references/handoff-boundaries.md) before routing broad requests.

## When to use this skill
- The user wants automated, repeatable, or template-driven video production
- The request involves short-form content ops, campaign variants, personalized videos, localized versions, or batched social assets
- The user mentions Remotion, rendering from code, video APIs, templates, or connecting app/product data into video output
- The workflow needs a production plan that can span generation, asset prep, QA, and a publishing handoff

## When not to use this skill
- The job is purely a one-off manual edit in Premiere / After Effects / CapCut with no automation or repeatability goal
- The task is only final creative polish, color, taste-based pacing, or bespoke motion-design critique
- The user needs only transcript cleanup, clip selection, or direct publishing with no template/render layer
- The request is really an ad-strategy, content-strategy, or product-launch brief rather than a video-production workflow

## Supported production modes
Use these as routing targets inside the skill:

### 1) Code-first programmable video
- Best when the user explicitly wants Remotion, React-based composition, dynamic data injection, or custom product-integrated rendering
- Default stack: `Remotion`

### 2) Template/API automation
- Best when the user needs speed, bulk generation, localization, or personalized variants without owning a full rendering codebase
- Typical comparators: Shotstack, Creatomate, Bannerbear

### 3) Hybrid clip / repurposing pipeline
- Best when the source material is long-form audio/video and the main problem is extracting, captioning, resizing, and packaging clips at volume
- Common workflow shape: transcript or clip-selection tool + template/render layer + manual QA

### 4) Manual-finish hybrid
- Best when automated generation exists but editorial polish, captions, timing, or final approvals still need a human pass
- Use this when the right answer is not “fully automate everything” but “automate the repeatable 80%, then define the last-mile edit pass"

## Instructions

### Step 1: Normalize the production brief
Capture the request in this form before choosing a mode:

```yaml
video_brief:
  objective: launch | onboarding | social-clips | personalization | recap | education | ads | unknown
  primary_output: mp4 | shorts | reels | stories | multiple
  audience:
    segment: "who will watch this"
    stage: unaware | evaluating | customer | community | mixed | unknown
  source_material:
    type: script | existing-video | screenshots | product-data | slides | mixed | unknown
    assets_available:
      - logo
      - footage
      - screenshots
      - captions
      - brand-guidelines
  scale:
    volume: one-off | recurring | batch | personalized
    variants:
      - language
      - aspect-ratio
      - audience-segment
  constraints:
    stack_preference: remotion | api-platform | mixed | unknown
    timeline: immediate | this-week | this-month | longer
    quality_bar: draft-fast | production-ready | polished-final
  main_question: "what does the user need next?"
```

If the brief is incomplete, continue with explicit assumptions rather than stalling.

### Step 2: Pick exactly one primary production mode
Choose the single mode that reduces ambiguity fastest.

- **Code-first programmable video** when the user explicitly wants Remotion, full code control, or deep app/data integration
- **Template/API automation** when speed, scale, or no-code / low-code batch generation matters most
- **Hybrid clip / repurposing pipeline** when the source is existing long-form media and the main job is repeatable short-form extraction
- **Manual-finish hybrid** when automation is useful but the real risk sits in last-mile captions, timing, approval, or platform-native polish

If more than one mode fits, choose the mode that best defines the next artifact and name the secondary handoff.

### Step 3: Return one implementation-ready packet
Return one of these packet types:
- `video-production brief`
- `render-stack recommendation`
- `asset + template packet`
- `repurposing workflow packet`
- `QA + handoff checklist`

Do not emit multiple half-built plans. Choose the single most useful packet for the ask.

### Step 4: Add explicit asset, QA, and handoff logic
Every output must include:
- the chosen production mode,
- the recommended stack or workflow shape,
- the minimum required assets,
- the main QA risks,
- the next handoff after generation (manual polish, approval, publishing, analytics, etc.).

### Step 5: Handle Remotion explicitly when relevant
If the user names Remotion or clearly needs code-first composition:
- say that the request fits the **code-first programmable video** mode,
- structure the output around Remotion scenes/templates/components/rendering,
- optionally note that `remotion-video-production` is the compatibility alias for the same lane.

### Step 6: Use this output structure

```markdown
# Video Production Brief

## Scope
- Objective: ...
- Primary output: ...
- Audience: ...
- Source material: ...
- Confidence: high | medium | low

## Chosen mode
- Code-first programmable video | Template/API automation | Hybrid clip / repurposing pipeline | Manual-finish hybrid

## Recommended workflow
- Stack / workflow shape: ...
- Why this mode fits: ...
- What to avoid: ...

## Minimum asset packet
| Asset | Required | Notes |
|-------|----------|-------|
| ... | yes/no | ... |

## Build plan
1. ...
2. ...
3. ...

## QA risks
- ...
- ...

## Handoffs
- Next owner / tool / workflow: ...
- Why: ...

## Success check
- Render / approval / publishing signal: ...
```

## Output format
Always return a **short operator-style video production brief**.

Required qualities:
- one primary production mode,
- clear asset minimums,
- explicit QA / last-mile risks,
- concrete next artifact and handoff,
- assumptions called out when context is missing.

## Examples

### Example 1: personalized campaign videos
**Input**
> We need to generate personalized customer recap videos from product data and render hundreds every week.

**Output sketch**
- Primary mode: `Template/API automation`
- Packet: `render-stack recommendation`
- Notes dynamic data, template ownership, localization/QA, and publishing handoff

### Example 2: explicit Remotion ask
**Input**
> Build a Remotion workflow for a branded onboarding video with screenshots, captions, and 16:9 + 9:16 variants.

**Output sketch**
- Primary mode: `Code-first programmable video`
- Packet: `asset + template packet`
- Uses scenes/components/rendering language and mentions variant strategy

### Example 3: repurposing long-form content
**Input**
> Turn our webinar recordings into short captioned clips for Shorts and Reels every week.

**Output sketch**
- Primary mode: `Hybrid clip / repurposing pipeline`
- Packet: `repurposing workflow packet`
- Names transcript/clip selection, caption QA, safe-area checks, and final publish handoff

## Best practices
1. Separate the scalable generation layer from the last-mile editorial polish layer.
2. Treat captions, safe areas, and aspect-ratio variants as first-class planning items, not afterthoughts.
3. Choose the simplest stack that meets the repeatability requirement.
4. Preserve a reusable asset/template packet so future variants are cheaper.
5. Make the QA checklist explicit whenever short-form/social distribution is involved.

## References
- [references/production-modes.md](references/production-modes.md)
- [references/asset-and-qa-checklist.md](references/asset-and-qa-checklist.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)
