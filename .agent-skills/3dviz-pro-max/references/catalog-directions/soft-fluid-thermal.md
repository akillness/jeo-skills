# Soft Fluid Thermal

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Buoyancy and floating equilibrium](../../data/recipes/buoyancy-floating-equilibrium.json) — `recipe.buoyancy-floating-equilibrium`: Make the displaced volume an explicit object so flotation becomes a balance the viewer can watch settle.
- [Precomputed flow field playback](../../data/recipes/cfd-field-playback.json) — `recipe.cfd-field-playback`: Play back a computed flow field as data with provenance, and refuse to let the viewer treat playback as live simulation.
- [XPBD soft-body boundary fixture](../../data/recipes/general-soft-body-boundary-test.json) — `recipe.general-soft-body-boundary-test`: Exercise one compliant particle mesh with pinned boundaries, explicit timestep/substeps/iterations and residuals rather than treating visual softness as a material measurement.
- [Heat diffusion along a rod with fixed end temperatures](../../data/recipes/heat-rod-decay.json) — `recipe.heat-rod-decay`: Watch an exact temperature mode decay while the rod itself stays geometrically fixed.
- [Hydrostatic pressure at equal depth](../../data/recipes/hydrostatic-depth-pressure.json) — `recipe.hydrostatic-depth-pressure`: Compare pressure probes at the same depth in differently shaped stationary containers.
- [Mass-spring cloth and its solver contract](../../data/recipes/mass-spring-cloth-contract.json) — `recipe.mass-spring-cloth-contract`: Treat cloth as a solver with declared parameters: what is integrated, at what step, and what makes it explode.
- [Flow rate through a narrowing conduit](../../data/recipes/nozzle-continuity.json) — `recipe.nozzle-continuity`: Compare cross-sectional average speeds while a fixed volume flow passes through different pipe areas.
