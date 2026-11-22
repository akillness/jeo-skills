# Inspection Pattern

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Controlled before-and-after experiment](../../data/knowledge/inspection-pattern/controlled-experiment.json) — `knowledge.controlled-experiment`: Make one change produce a visible, attributable response while preserving the baseline.
- [Cutaway and exploded assembly inspection](../../data/knowledge/inspection-pattern/cutaway-explode.json) — `knowledge.cutaway-explode`: Reveal internal construction while distinguishing an explanatory display transform from the real assembly.
- [Detail inset with a persistent context anchor](../../data/knowledge/inspection-pattern/detail-inset-context-anchor.json) — `knowledge.detail-inset-context-anchor`: Enlarge a feature in a secondary view while retaining its identity, position and orientation in the overview.
- [Geometric measurement in declared model coordinates and units](../../data/knowledge/inspection-pattern/geometric-measurement-model-units.json) — `knowledge.geometric-measurement-model-units`: Measure chosen geometry in a declared metric frame while camera and explanatory display transforms stay separate.
- [Object isolation with preserved context](../../data/knowledge/inspection-pattern/object-isolation.json) — `knowledge.object-isolation`: Give a selected object enough screen space to explain its parts without losing its identity in the scene.
- [PBR channel isolation inspection](../../data/knowledge/inspection-pattern/pbr-channel-isolation-inspection.json) — `knowledge.pbr-channel-isolation-inspection`: Inspect raw texture roles, packed channels, color-space meaning and full material response separately under a controlled lighting and display setup.
- [Runtime cost and source-node inspection](../../data/knowledge/inspection-pattern/runtime-cost-and-source-node-inspection.json) — `knowledge.runtime-cost-and-source-node-inspection`: Pair backend-scoped aggregate renderer counters with stable asset, node, primitive and resource identities without misreporting counters as GPU memory bytes, time or exact per-object cost.
- [Skin weight and deformation inspection](../../data/knowledge/inspection-pattern/skin-weight-and-deformation-inspection.json) — `knowledge.skin-weight-and-deformation-inspection`: Pair source weight visualization with exported joint/weight inspection and deliberate pose fixtures so numerical influence and visible deformation failures remain traceable.
- [Synchronized orthogonal slices with one probe point](../../data/knowledge/inspection-pattern/synchronized-orthogonal-slices.json) — `knowledge.synchronized-orthogonal-slices`: Coordinate three slice planes and a 3D locator through one authoritative source-space point.
- [Topology and normal diagnostic view](../../data/knowledge/inspection-pattern/topology-and-normal-diagnostic-view.json) — `knowledge.topology-and-normal-diagnostic-view`: Locate winding, normal, intersection and triangulation problems in both Blender source geometry and the delivered runtime primitive without treating wireframe as proof of validity.
- [UV seam and density inspection](../../data/knowledge/inspection-pattern/uv-seam-and-density-inspection.json) — `knowledge.uv-seam-and-density-inspection`: Inspect authored seams, island distortion, relative texel density and the actual runtime UV set or transform with a diagnostic texture that leaves production maps untouched.
