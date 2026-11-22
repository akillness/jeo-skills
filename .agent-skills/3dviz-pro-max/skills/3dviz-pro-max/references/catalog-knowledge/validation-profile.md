# Validation Profile

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Color, normal and material-role parity validation](../../data/knowledge/validation-profile/color-normal-material-parity.json) — `knowledge.color-normal-material-parity`: Validate UV/tangent orientation, texture channel roles, transfer functions and baked-versus-runtime lighting ownership with isolated fixtures before judging a composed look.
- [glTF export-to-load asset invariant validation](../../data/knowledge/validation-profile/gltf-roundtrip-asset-validation.json) — `knowledge.gltf-roundtrip-asset-validation`: Compare a declared Blender baseline with the exported glTF and loaded Three.js scene, including geometry, hierarchy, skin, animation and application-owned resource lifecycle.
- [Interactive scene identity and accessibility validation](../../data/knowledge/validation-profile/interactive-scene-accessibility-validation.json) — `knowledge.interactive-scene-accessibility-validation`: Validate that semantic identity, selection, commands, labels, focus and alternatives remain coherent across canvas picking and companion controls.
- [Material and lighting response inspection](../../data/knowledge/validation-profile/material-response-check.json) — `knowledge.material-response-check`: Verify that selected finishes are visibly distinguishable under repeatable viewing conditions.
- [Physical action, pause and reset validation](../../data/knowledge/validation-profile/physical-action-reset.json) — `knowledge.physical-action-reset`: Validate a visible causal action against the declared model and restore its full initial state.
- [Structural coherence inspection profile](../../data/knowledge/validation-profile/structural-coherence.json) — `knowledge.structural-coherence`: Check whether an object visibly communicates assembly, support and intended degrees of freedom.
- [Default numeric tolerance rule for checks](../../data/knowledge/validation-profile/validation-default-tolerance-rule.json) — `knowledge.validation-default-tolerance-rule`: Give every numeric check a default tolerance and regime so a comparison can fail on its own instead of asking the author to invent one.
