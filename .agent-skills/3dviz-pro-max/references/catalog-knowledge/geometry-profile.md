# Geometry Profile

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Hard-surface bevel geometry and normal contract](../../data/knowledge/geometry-profile/hard-surface-bevel-normal-contract.json) — `knowledge.hard-surface-bevel-normal-contract`: Design bevels for visible highlight width, constrain overlap, and decide whether exported geometry normals or destination recomputation owns hard-surface shading.
- [LOD screen-error and transition continuity](../../data/knowledge/geometry-profile/lod-screen-error-continuity.json) — `knowledge.lod-screen-error-continuity`: Choose geometry levels by declared projected discrepancies and camera conditions; distinguish application error policy from a distance-based LOD switch.
- [Morph-target topology and attribute correspondence](../../data/knowledge/geometry-profile/morph-target-topology-compatibility.json) — `knowledge.morph-target-topology-compatibility`: Preserve vertex correspondence from Blender shape keys through exported primitive splits and runtime morph attributes.
- [CAD tessellation with preserved part identity](../../data/knowledge/geometry-profile/shared-cad-tessellation-identity.json) — `knowledge.shared-cad-tessellation-identity`: Convert exact CAD surfaces to triangles under a declared tolerance while keeping part names, assembly structure and units attached to the result.
- [Curves and tubes with a continuous swept frame](../../data/knowledge/geometry-profile/shared-curve-tube-frames.json) — `knowledge.shared-curve-tube-frames`: Sweep a cross-section along a curve with a frame that stays continuous, and sample by arc length rather than by raw parameter.
- [Indexed mesh with declared manifold intent](../../data/knowledge/geometry-profile/shared-indexed-manifold-mesh.json) — `knowledge.shared-indexed-manifold-mesh`: Decide whether a mesh is a closed solid boundary or an open surface, then let vertex sharing, winding and normals follow that decision.
- [Isosurface extraction with an owned threshold](../../data/knowledge/geometry-profile/shared-isosurface-threshold.json) — `knowledge.shared-isosurface-threshold`: Treat the isovalue as a declared, adjustable input and treat the extracted surface as one slice of a field rather than as the object itself.
- [Parametric surface with a declared domain and degeneracies](../../data/knowledge/geometry-profile/shared-parametric-surface-domain.json) — `knowledge.shared-parametric-surface-domain`: Build a surface from an explicit parameter domain and decide in advance what happens at poles, seams and collapsed edges.
- [Point cloud with declared sampling and point size](../../data/knowledge/geometry-profile/shared-point-cloud-sampling.json) — `knowledge.shared-point-cloud-sampling`: Say where the points came from and whether their drawn size means anything, so density is not mistaken for magnitude.
- [Skinned rig with an owned bind pose and weight budget](../../data/knowledge/geometry-profile/shared-skinned-articulated-rig.json) — `knowledge.shared-skinned-articulated-rig`: Separate the joint hierarchy that owns pose from the skin that follows it, and state the bind pose, weight budget and where deformation is allowed to be approximate.
- [Voxel grid with explicit index-to-world ownership](../../data/knowledge/geometry-profile/shared-voxel-field-grid.json) — `knowledge.shared-voxel-field-grid`: Treat a voxel grid as integer indices plus a declared transform, and keep occupancy, sampled values and their sampling positions distinct.
- [UV atlas and source-to-target bake correspondence](../../data/knowledge/geometry-profile/uv-atlas-bake-correspondence.json) — `knowledge.uv-atlas-bake-correspondence`: Make seams, UV-set roles, island scale, projection cage and padding explicit so a high-detail source bakes repeatably onto the exact low-detail mesh exported to glTF.
