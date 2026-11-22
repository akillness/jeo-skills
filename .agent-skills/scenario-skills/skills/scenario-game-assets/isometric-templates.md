# Isometric templates

These neutral bases separate grid geometry from art direction. Each PNG is 1024 by 1024 pixels. The
placement anchor is the ground center at (512, 704), not the image center or bottom edge.

| Template            | Projection                          | Use                             |
| ------------------- | ----------------------------------- | ------------------------------- |
| `diamond-ground-v1` | 2:1 diamond                         | Continuous terrain and paths    |
| `diamond-slab-v1`   | 2:1 diamond, 32 px side             | Raised plots and building bases |
| `hex-ground-v1`     | Regular hex projected at 30 degrees | Hex terrain maps                |
| `hex-slab-v1`       | Same hex, 32 px side                | Raised hex plots                |

The manifest records the ground polygon, two lattice step vectors, anchor, thickness, and file
hashes. Do not mix projections in one map. Slab variants are raised objects: continuous flat maps
should use ground variants to avoid exposed sides between neighbors.

Resolve the selected template and file roles through the shared asset lifecycle linked from
SKILL.md. If none is accessible, build locally with
`uv run --with pillow python scripts/build_isometric_templates.py <output-directory>` from this
skill directory, then upload the required PNGs through MCP.

- `reference`: neutral RGBA base. For an opaque masked fill, composite onto a chosen plain opaque
  canvas, preserving size and position. This is a workflow choice unless the schema requires it; do
  not infer editability from base-image transparency alone.
- `ground-region`: white ground footprint, black outside.
- `side-region`: white visible sides, black elsewhere. Flat templates share one all-black
  `empty-side-region-v1.png`: no side faces means no editable pixels.
- `object-region`: ground and sides plus 448 px of vertical editing space. This is not an object
  silhouette or an alpha matte.

Region files describe geometry, not model mask polarity. Inspect the source and mask pixels before
the generation probe, reusing verified local files and previous checks for known uploads; download
only when those are unavailable. Convert to the mask convention in the selected model's schema and
use the uploaded, converted mask ID in the run. Retain an unmodified source canvas for measuring
edits outside the allowed region. Never feed the labeled contact sheet as a generation reference.

Flat templates keep the shared empty side mask for a uniform bundle, but need no side-edit run. Do
not substitute that empty mask for the ground region.

Continuous ground needs matching appearance at shared edges as well as matching geometry. Request
level lighting across the ground tile, without a per-tile gradient, vignette, border, or cast
shadow; reserve directional shading for raised objects. Inspect a repeated map before expanding the
set: clipping fixes the footprint, not tonal seams.

For a small test, generate terrain, a connecting path, and a tree using the same base and a separate
style reference. Budget extra model runs, including background removal, separately from the
generation probes. Assemble neighbors with the manifest's step vectors, sorted by ground-anchor Y
for simple upright sprites. Check edges and path endpoints at native resolution, the tree's anchor
and unobstructed crown, and the whole map at game scale. The whole crown must fit inside the object
region with margin; pixels above its top edge are outside the editing area. Bridges and multi-cell
objects need their own engine sorting rules. Record camera or silhouette drift before any corrective
crop; reject outputs that only look correct after hiding the defect.
