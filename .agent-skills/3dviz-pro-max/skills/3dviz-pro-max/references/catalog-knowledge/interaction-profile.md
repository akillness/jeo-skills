# Interaction Profile

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Alternative controls for spatial actions](../../data/knowledge/interaction-profile/accessible-spatial-controls.json) — `knowledge.accessible-spatial-controls`: Keep essential spatial actions available without requiring a precise drag or continuous motion.
- [Constraint-aware object manipulation](../../data/knowledge/interaction-profile/constraint-aware-object-manipulation.json) — `knowledge.constraint-aware-object-manipulation`: Turn pointer or discrete input into a previewed model operation with an explicit axis, coordinate frame, legality rule and cancel path.
- [Guided exploration with reversible steps and explicit reset](../../data/knowledge/interaction-profile/guided-exploration-reversible-steps.json) — `knowledge.guided-exploration-reversible-steps`: Structure a short exploration around observable state changes while keeping Back, Retry and Exit predictable.
- [Inspectable selection and part identity](../../data/knowledge/interaction-profile/inspectable-selection.json) — `knowledge.inspectable-selection`: Let viewers identify and inspect a part without confusing it with a disposable mesh or decoration.
- [Linked plot and 3D selection through stable entity IDs](../../data/knowledge/interaction-profile/linked-plot-spatial-selection.json) — `knowledge.linked-plot-spatial-selection`: Make a plot mark and a spatial object select the same semantic entity despite sorting, filtering or mesh replacement.
- [Modality-independent spatial action map](../../data/knowledge/interaction-profile/modality-independent-action-map.json) — `knowledge.modality-independent-action-map`: Map supported pointer, keyboard, touch and optional XR signals into semantic actions with shared validation, arbitration, cancel and feedback.
- [Multi-selection across a scene hierarchy](../../data/knowledge/interaction-profile/multi-selection-hierarchy.json) — `knowledge.multi-selection-hierarchy`: Maintain a semantic selection set, active item and focus independently while hierarchy rules prevent double-transforming parents and descendants.
- [Parameter experiment with visible cause and reset](../../data/knowledge/interaction-profile/parameter-experiment.json) — `knowledge.parameter-experiment`: Connect a small set of controls to meaningful model changes and repeatable observations.
- [Snap preview and commit](../../data/knowledge/interaction-profile/snap-preview-and-commit.json) — `knowledge.snap-preview-and-commit`: Resolve grid, socket or angle candidates into a reversible preview before one explicit legal placement is committed.
- [Spatial annotation authoring](../../data/knowledge/interaction-profile/spatial-annotation-authoring.json) — `knowledge.spatial-annotation-authoring`: Create, move and remove annotations as application records with stable target identity, declared anchor space and a readable nonspatial view.
- [Transactional undo and redo](../../data/knowledge/interaction-profile/transactional-undo-redo.json) — `knowledge.transactional-undo-redo`: Record one semantic command per committed user intention and restore every coupled state field together on undo or redo.
