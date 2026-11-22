# Maya Expert Skills

Agent skills that let Claude (Claude Code) or Codex drive Autodesk Maya the way the experts in the
best tutorials, studio talks and official documentation do. Built on 2026-09-24 with the same method
as [Blender Expert Skills](../blender/README.md): transcripts of top-rated videos, cited expert
notes, then skills with tools and review rubrics, graded blind against the same model without them.
Start with the lead skill, `scenario-maya-expert`.

## Skills

| Skill                              | Use it when                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario-maya-animation`          | animating a character or prop in Maya through Python: a walk or run cycle, a jump or landing, a heavy lift, throw or punch, an acting or dialogue...     |
| `scenario-maya-deformation`        | skinning a character in Maya ("bind skin", "fix the weights", weight painting, Skin Tools or ngSkinTools layers), when deformation looks wrong...        |
| `scenario-maya-expert`             | doing any Autodesk Maya task through Python or a bridge, headless or live: maya.cmds or OpenMaya 2.0 scripts, mayapy or maya.standalone batch jobs, a... |
| `scenario-maya-fx`                 | a Maya task involves simulation or procedural effects: nCloth or Nucleus (a cape, skirt, flag or garment on an animated character, cloth through the...  |
| `scenario-maya-groom`              | grooming hair or fur in Maya with XGen (Interactive Groom splines or legacy descriptions): scalp hair, eyebrows, eyelashes, fur, guides, clumps...       |
| `scenario-maya-lighting-rendering` | lighting or rendering in Maya with Arnold: a product hero shot, a character close-up or a sequence (master and shot lighting), key, fill and rim...      |
| `scenario-maya-lookdev`            | shading an asset in Maya with Arnold: OpenPBR or aiStandardSurface materials, hooking up Substance Painter or UDIM texture sets, color spaces (sRGB...   |
| `scenario-maya-modeling`           | modeling in Autodesk Maya, such as hard-surface props, weapons, vehicles, a sci-fi crate, a game-ready or SubD film model, or a character or creature... |
| `scenario-maya-pipeline-scripting` | writing or fixing Maya pipeline code in Python: mayapy batch jobs over many scenes, validating and auto-fixing scenes, FBX export for Unreal or Unity... |
| `scenario-maya-retopology-uv`      | turning a dense sculpt, scan, ZBrush export or AI-generated mesh into animation-ready or game-ready topology in Maya without a mouse ("clean up this...  |
| `scenario-maya-rigging`            | rigging a character, creature or prop in Maya: "rig this character", placing or orienting joints, Orient Joint doing nothing, IK/FK switch and...        |

## Status

- 11 skills written from 123 expert videos (65 h) and 49 documentation pages, each with references
  and a tested-offline `mx_<domain>.py` module.
- Blind-graded written scenarios (round 1): 61 % without the skills, 91 % with them; all 8 scenarios
  improved.

## Requirements

Maya 2027 (maya.cmds / OpenMaya, `mayapy` for batch). The lead skill `scenario-maya-expert` explains
the execution channel (batch `mayapy` or a live Maya over the bridge).

## Install

```bash
npx skills add scenario-labs/skills --skill scenario-maya-expert scenario-maya-animation scenario-maya-deformation scenario-maya-fx scenario-maya-groom scenario-maya-lighting-rendering scenario-maya-lookdev scenario-maya-modeling scenario-maya-pipeline-scripting scenario-maya-retopology-uv scenario-maya-rigging
```

The installer puts the skills side by side, which the specialists need: they import the lead skill's
`scripts/`. In the installer picker (`npx skills add scenario-labs/skills`), the family is the
"Expert tools: Maya" group. Update with `npx skills update`.

## Provenance

Ported from
[edemaistre/maya-expert-skills](https://github.com/edemaistre/maya-expert-skills/tree/v0.1), built
on 2026-09-24, with these changes: the `scenario-` prefix on every skill name, this repository's
frontmatter (`name`, `description`, `license`), no version line in the skill bodies, the
sibling-install line in each `SKILL.md`, and paths into the build project made relative.

Paths such as `tests/code/...` or `archive/tests/...` inside the references point to the build
project (tests, notes) on the author's machine; they are provenance only.
