# Sprite grid templates

Use the JSON manifest to select a preset matching the requested frame count and canvas: 4x4 has
sixteen 256 px cells on a 1024 px square; 6x6 has thirty-six on a 1536 px square. The user's frame
count and dimensions take precedence. Other layouts need their own grid specification, not extra
invented frames to fill a preset. Confirm the selected model accepts the canvas before generation.

## Resolve a template asset

Follow the shared asset lifecycle linked from SKILL.md to find an accessible asset or stage a new
version. If none matches, run
`uv run --with pillow python scripts/build_grid_templates.py <output-directory> --template <template-name>`
from this skill directory. This local builder only draws geometry; upload the required PNGs through
MCP.

## Use and inspect

- `grid`: plain cell boundaries. Supply it as an optional layout reference alongside the approved
  character when the schema has enough image slots. State each image's role: character identity
  versus cell arrangement; request no visible guide lines in the generated sheet. With one slot,
  prioritize the character and put the grid specification in the prompt.
- `alignment-guide`: inset, horizontal center, and baseline markers for inspection. It is not a
  generated frame, character reference, or inpainting mask. Its baseline is a preset for grounded
  poses; preserve intentional airborne motion.

The manifest records cell boxes, row-major order, and anchors. Check delivered dimensions, cell
count, body centers, grounded feet, clipping, and accidental guide marks before slicing. Measure
against the selected layout; do not assume the output followed it. Correct alignment as taught in
the skill and upload any locally re-laid sheet before platform slicing. Neither guide guarantees
pose alignment or loop closure.
