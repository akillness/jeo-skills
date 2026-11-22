# Sibling skill dependencies

`scenario-video-ads` is a director layer: it plans the ad and delegates every mechanical stage to a
sibling skill in this repository. Installing only this skill leaves those siblings missing, and each
gap removes the procedures its stage depends on.

| Skill                     | What it carries for this pipeline                                 |
| ------------------------- | ----------------------------------------------------------------- |
| `scenario`                | Connection setup and the core generation loop every stage runs on |
| `scenario-image`          | Stage 4 stills, composed natively per delivery ratio              |
| `scenario-consistency`    | Stage 4 compositing of the real product photo into styled plates  |
| `scenario-video`          | Stage 5 image-to-video animation of approved stills               |
| `scenario-seedance`       | Stage 5 animation on Seedance models                              |
| `scenario-asset-analysis` | Stage 1 fidelity checklist and the stage 6 frame-extract gate     |
| `scenario-audio`          | Stage 7 music, voiceover, and sonic logo                          |
| `scenario-text-overlay`   | Stage 8 text cards rendered locally as image layers               |
| `scenario-video-assembly` | Stage 8 timeline cut and captions on Scenario tool models         |

Load a missing sibling with the Scenario MCP `skill_get` tool (`name` set to the sibling), or ask
the user to install it ([install options](https://github.com/scenario-labs/skills#install)). Never
run an installer yourself. A sibling that ships scripts still needs the user's install to run them.

When the user declines an install, or no one is there to answer, state which stage degrades and how
(the procedures you would be guessing at) before improvising.
