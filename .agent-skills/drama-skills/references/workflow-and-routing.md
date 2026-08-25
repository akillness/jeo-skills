# Drama Skills workflow and routing

## The ten installable skills

The suite is a set of independent stage owners. `short-drama` is a router and
project-operations skill, not a required parent process.

| Skill | Owns | Does not own |
|---|---|---|
| `short-drama` | initialization, status, Dashboard, cross-stage routing, packaging | stage content or media generation |
| `short-drama-novel-analyze` | read-only source indexing, adaptation-value analysis, episode candidates | adaptation decisions or screenplays |
| `short-drama-develop` | adaptation direction, creative brief, director intent, story engine, episode map | episode screenplay prose |
| `short-drama-write` | one shootable episode screenplay | assets, shots, prompts, final review |
| `short-drama-assets` | characters, looks, locations, views, props, states, continuity | image prompts or media |
| `short-drama-image-prompts` | copy-ready image prompt Markdown for assets and look development | image generation |
| `short-drama-storyboard` | shot design, blocking, dramatic purpose, continuity, frozen keyframes | video generation |
| `short-drama-video-prompts` | performance, action, camera, duration, start/end state, audio and optional music intent | media execution or lyrics |
| `short-drama-produce` | confirmed external image/video/TTS/music jobs | writing or revising prompts |
| `short-drama-review` | independent findings, verdicts, and revision requests | silently editing owner files |

The maintainer-only `maintainers/skills/short-drama-knowhow` is not part of the
installable creator suite. Do not link or copy it into user skill roots.

## Default flow

```text
optional source triage
  short-drama-novel-analyze
        |
optional development
  short-drama-develop
        |
  short-drama-write                 -> 剧本.md
        |
  short-drama-assets                -> 视觉设定.md
        |                                  |
        v                                  v
  short-drama-image-prompts    (剧本.md + 视觉设定.md)
        |                                  |
        -> 图片提示词.md             short-drama-storyboard
                                           -> 分镜.md
                                                  |
                                           short-drama-video-prompts
                                                  -> 视频提示词.md
        \-----------------------+-----------------/
                                |
                      short-drama-produce
                    prepare -> confirm -> run
                                |
                   short-drama-review (only when asked)
```

This is a routing map, not a mandatory waterfall. Valid direct entries include:

- an existing screenplay -> assets, storyboard, image prompts, or review;
- existing visual facts -> image prompts or storyboard;
- an existing storyboard -> video prompts;
- existing prompts -> review or confirm-gated production;
- a long source -> read-only triage before any adaptation decision.

## Creator-first five-document contract

Each episode may own these Markdown documents:

| File | Owner | Purpose |
|---|---|---|
| `剧本.md` | `short-drama-write` | scenes, action, dialogue, sound intent, handoff facts |
| `视觉设定.md` | `short-drama-assets` | identities, variants, locations, props, state changes, continuity |
| `分镜.md` | `short-drama-storyboard` | dramatic shot purpose, blocking, camera, frozen keyframes |
| `图片提示词.md` | `short-drama-image-prompts` | asset/look/location/prop prompts and stable references |
| `视频提示词.md` | `short-drama-video-prompts` | motion, performance, timing, camera, audio/music intent |

Rules:

1. Do not pre-create empty episode documents during initialization.
2. Do not create a parallel JSON/JSONL creative canon for normal work.
3. Indexes, coverage files, fingerprints, and delivery metadata are derived
   validation/operations artifacts only.
4. Only the owner writes its source document. Review produces findings and
   revision requests.
5. Stable IDs survive revisions. At research snapshot HEAD `b7846a0`, storyboard
   semantics distinguish prompt-entry IDs (`IMG-*`) from real input-reference
   slots (`REF-*`); re-check the selected version.
6. Project-relative paths are the portable source of truth for references.

## Routing decision rules

### Route to `short-drama`

Use it when the user asks to initialize, continue, inspect status, open the
Dashboard, package named artifacts, or coordinate several stages. Do not route
every request through it.

### Route directly to one owner

Use a stage skill immediately when the request names one deliverable or the
required input already exists. Read only that skill and its directly relevant
references.

### Route sequentially only when scope is explicit

If the user asks for storyboard and video prompts, finish and verify the
storyboard first, then pass its output forward. Do not silently add assets,
review, or production.

### Do not invent prerequisites

A missing development brief is not automatically a blocker for an existing
episode screenplay. A missing asset registry is not automatically a blocker
when the supplied visual facts are adequate. Name any actual ambiguity instead
of fabricating upstream files.

## Rule strength

The upstream suite distinguishes hard structure/safety from craft guidance:

- structural and reviewed invariants are mandatory contracts;
- craft defaults are starting points that can change for the story;
- taste options are alternatives, not hidden requirements.

Do not promote a genre card, shot recipe, dialogue preference, or example into a
universal rule.

## Nearby skill route-outs

| Request | Route instead |
|---|---|
| General automated video pipeline, templates, batches, data-driven rendering | `video-production` |
| Full vertical-scroll webtoon with 50+ panels and baked speech bubbles | `webtoon-harness` |
| OpenStory application setup, workflows, D1, R2, model registry, deployment | `openstory` |
| Standalone ElevenLabs voice generation | `elevenlabs-tts` |
| Local timeline editing | `opencut` or `palmier-pro` |
| Generic screenplay criticism without this suite/project | answer directly or use the relevant writing/review skill |
