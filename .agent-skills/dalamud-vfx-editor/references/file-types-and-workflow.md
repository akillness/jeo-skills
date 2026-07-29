# File types and workflow

Use the file extension to choose the owning editor surface, but confirm references and the timeline in the current game data before changing anything.

| Type | Typical ownership | First verification |
| --- | --- | --- |
| `.avfx` | particle emitters, color, glow, effect resources | attachment, lifetime, blend, draw cost |
| `.pap` | character animation | skeleton, timing, loop, hit alignment |
| `.tmb` | timeline triggers and cross-resource sequencing | event order, cancellation, sound/effect links |
| `.scd` | music and sound effect containers | event mapping, volume, loop, replacement scope |
| `.atex` / `.tex` | textures and UI/effect images | dimensions, format, alpha, mip behavior |
| `.shpk` / `.shcd` | shader packages and shader data | parameter compatibility and render path |
| `.mtrl` / `.mdl` | materials and meshes | references, culling, attachment, fallback |

## Safe edit loop

1. Copy the original to a private backup and hash both files.
2. Identify the exact resource and one intended parameter group.
3. Edit only the working copy in VFXEditor.
4. Export or save to a separate output path.
5. Test loading, attachment, visibility, timing, sound, overlap, and frame time.
6. Keep the source, output, manifest, and rollback path together.

A timeline change belongs in `.tmb` when the requirement is ordering or triggering. Do not force sequencing into a particle asset merely because the visual result is visible there.
