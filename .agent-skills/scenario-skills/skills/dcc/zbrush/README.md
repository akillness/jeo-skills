# ZBrush Expert Skills

Agent skills that let Claude (Claude Code) or Codex drive Maxon ZBrush the way the experts in the
best tutorials, studio talks and official documentation do. Built on 2026-09-24 with the same method
as [Blender Expert Skills](../blender/README.md): transcripts of top-rated videos, cited expert
notes, then skills with tools and review rubrics, graded blind against the same model without them.
Start with the lead skill, `scenario-zbrush-expert`.

## Skills

| Skill                                | Use it when                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario-zbrush-automation`         | automating ZBrush 2026: batch processing a folder of OBJ or ZTL files, a ZBrush Python script or ZScript, recording a macro to learn a palette path...  |
| `scenario-zbrush-character-creature` | sculpting a realistic head, face, portrait, body or creature in ZBrush (anatomy, landmarks, proportions, "the face looks off", eyes, lips, jaw)...      |
| `scenario-zbrush-expert`             | an agent drives Maxon ZBrush 2026 for any task (sculpt in ZBrush, DynaMesh, ZRemesher, UVs, export, polypaint, posing, 3D print, clean up an AI mesh... |
| `scenario-zbrush-hard-surface`       | modeling hard surface in ZBrush 2026 (sci-fi helmet, weapon, prop, armor plates, mechanical parts, kitbash, vents, panel lines, bolts, concept to...    |
| `scenario-zbrush-paint-render`       | polypainting in ZBrush (skin color zones, fills, cavity or AO passes, Spotlight), baking polypaint to a texture or vertex color, rendering a ZBrush...  |
| `scenario-zbrush-pose-print`         | posing a sculpt or preparing it for 3D printing in ZBrush: "pose this character", Transpose Master, TPoseMesh, Gizmo posing with masks, ZSphere rig...  |
| `scenario-zbrush-retopology-export`  | a ZBrush sculpt, scan or AI-generated mesh must become production topology and files (ZRemesher and guides, the 2026 Retopo brush, reprojecting...      |
| `scenario-zbrush-sculpting`          | an agent sculpts organic forms in ZBrush 2026 (sculpt a head, bust or creature in ZBrush from a sphere, ZSpheres or primitives); when blocking...       |
| `scenario-zbrush-stylized`           | sculpting a stylized or cartoon character, bust, collectible or toy in ZBrush (Overwatch, Fortnite, Disney look), judging shape language (S and C...    |

## Status

- 9 skills written from 150 expert videos (61 h) and 54 documentation pages, each with references
  and a `zb_<domain>.py` module.
- Blind-graded written scenarios (round 1): 43 % without the skills, 91 % with them; all 7 scenarios
  improved.
- The agent bridge into ZBrush was proven live (scripted strokes that sculpt, dialog-free exports).
  Full live tests of every skill were blocked by a ZBrush startup stall; see `tests/OPEN_ISSUES.md`
  in the build project.

## Requirements

ZBrush 2026 (2026.2) with the agent bridge described in the lead skill `scenario-zbrush-expert`
(launch, strokes, review renders, dialog-free export).

## Install

```bash
npx skills add scenario-labs/skills --skill scenario-zbrush-expert scenario-zbrush-automation scenario-zbrush-character-creature scenario-zbrush-hard-surface scenario-zbrush-paint-render scenario-zbrush-pose-print scenario-zbrush-retopology-export scenario-zbrush-sculpting scenario-zbrush-stylized
```

The installer puts the skills side by side, which the specialists need: they import the lead skill's
`scripts/`. In the installer picker (`npx skills add scenario-labs/skills`), the family is the
"Expert tools: ZBrush" group. Update with `npx skills update`.

## Provenance

Ported from
[edemaistre/zbrush-expert-skills](https://github.com/edemaistre/zbrush-expert-skills/tree/v0.1),
built on 2026-09-24, with these changes: the `scenario-` prefix on every skill name, this
repository's frontmatter (`name`, `description`, `license`), no version line in the skill bodies,
the sibling-install line in each `SKILL.md`, and paths into the build project made relative.

Paths such as `tests/code/...` or `archive/tests/...` inside the references point to the build
project (tests, notes) on the author's machine; they are provenance only.
