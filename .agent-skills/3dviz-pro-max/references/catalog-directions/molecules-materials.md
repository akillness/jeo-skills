# Molecules Materials

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Chirality and non-superimposable mirror images](../../data/recipes/chirality-stereocenter.json) — `recipe.chirality-stereocenter`: Let a viewer attempt to superimpose two mirror-image molecules and fail for a structural reason they can inspect.
- [Cubic unit-cell atom accounting](../../data/recipes/cubic-unit-cell-accounting.json) — `recipe.cubic-unit-cell-accounting`: Expose shared atom fractions across repeated cubic cells.
- [Deposited protein binding-site inspection](../../data/recipes/deposited-protein-binding-site-inspection.json) — `recipe.deposited-protein-binding-site-inspection`: Inspect a ligand and nearby residues from a supplied authoritative deposited structure while preserving atom, assembly and model metadata.
- [Molecular shape and electron-pair geometry](../../data/recipes/molecular-shape-comparison.json) — `recipe.molecular-shape-comparison`: Contrast methane and water while distinguishing atoms from electron-pair guides.
- [Orbital isosurfaces: phase versus probability](../../data/recipes/orbital-isosurface-phase-probability.json) — `recipe.orbital-isosurface-phase-probability`: Compare signed orbital-amplitude contours with the non-negative squared amplitude of one supplied, identified one-particle orbital grid.
- [Periodic trajectory: temporal unwrapping](../../data/recipes/periodic-trajectory-temporal-unwrapping.json) — `recipe.periodic-trajectory-temporal-unwrapping`: Separate wrapped cell images from one conditionally reconstructed continuous path in a fixed orthorhombic cell.
- [Polycrystalline grains and slip planes](../../data/recipes/polycrystal-slip-planes.json) — `recipe.polycrystal-slip-planes`: Show a polycrystal as differently oriented lattice domains and make slip planes a property of orientation rather than a texture.
- [Protein secondary structure ribbon](../../data/recipes/protein-secondary-structure.json) — `recipe.protein-secondary-structure`: Build a cartoon protein view whose helices and strands come from annotated structure rather than from decorative shapes.
- [Reaction coordinate: sourced energy profile](../../data/recipes/reaction-coordinate-energy-profile.json) — `recipe.reaction-coordinate-energy-profile`: Plot supplied energy samples against one declared coordinate without turning interpolation or a sampled peak into a mechanism.
- [Reactive trajectory: explicit topology changes](../../data/recipes/reactive-trajectory-topology-change.json) — `recipe.reactive-trajectory-topology-change`: Preserve atom identity and sourced bond events across frames without guessing reaction chemistry from distance.
- [Spectral transitions: mixed orbital contributions](../../data/recipes/spectral-transition-orbital-inspector.json) — `recipe.spectral-transition-orbital-inspector`: Keep calculated transition energies and strengths tied to method output while showing that an excited state may mix several orbital pairs.
- [Water hydrogen-bond illustration](../../data/recipes/water-hydrogen-bond-network.json) — `recipe.water-hydrogen-bond-network`: Distinguish intramolecular O-H bonds from selected illustrative intermolecular connections.
