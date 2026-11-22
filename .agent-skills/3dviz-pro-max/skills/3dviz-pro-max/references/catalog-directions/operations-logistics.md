# Operations Logistics

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Guided vehicle traffic with zone reservation](../../data/recipes/agv-zone-reservation.json) — `recipe.agv-zone-reservation`: Give vehicles a reservation rule that they must obtain before entering shared space, so traffic behaviour has an inspectable cause.
- [Bounded maintenance procedure state playback](../../data/recipes/bounded-maintenance-procedure-state.json) — `recipe.bounded-maintenance-procedure-state`: Play a supplied acyclic maintenance procedure through tasks and exclusive decisions with evidence-gated completion, while keeping planned, reported and verified states distinct.
- [CityGML stable-ID scenario differencer](../../data/recipes/citygml-stable-id-scenario-diff.json) — `recipe.citygml-stable-id-scenario-diff`: Compare a finite set of supplied CityGML-derived urban alternatives by stable feature identity, CRS, epoch and declared attribute/geometry changes, without inferring semantics from meshes or running an urban simulation.
- [Car-following waves on a closed single lane](../../data/recipes/closed-lane-car-following.json) — `recipe.closed-lane-car-following`: Simulate continuous car-following on a periodic lane and connect every vehicle's motion to its bumper gap, approaching rate and declared Intelligent Driver Model parameters.
- [Construction task dependency and building playback](../../data/recipes/construction-sequence-playback.json) — `recipe.construction-sequence-playback`: Link supplied construction tasks, times and finish-start dependencies to stable building-element identities, then scrub the resulting planned sequence without inventing progress or optimization.
- [Finite egress-network capacity playback](../../data/recipes/finite-egress-network-capacity-playback.json) — `recipe.finite-egress-network-capacity-playback`: Move a finite supplied occupant count through a directed route network with integer travel steps, per-step arc capacities and a declared blocked-edge event, as an educational capacity scenario rather than an evacuation-safety result.
- [Job shop schedule and solver boundary](../../data/recipes/job-shop-schedule-playback.json) — `recipe.job-shop-schedule-playback`: Play back a schedule that a solver produced, and keep the boundary between solving and animating visible.
- [Loading dock resource scheduling](../../data/recipes/loading-dock-resource-board.json) — `recipe.loading-dock-resource-board`: Show contention for invented dock resources with inspectable event timing.
- [Open-boundary signal queue playback](../../data/recipes/open-signal-queue-network.json) — `recipe.open-signal-queue-network`: Compare finite supplied signal plans on an open movement network with explicit arrivals, routes, storage and saturation-service inputs, without reusing closed-lane car-following physics.
- [Pallet build with stability rules](../../data/recipes/pallet-load-build.json) — `recipe.pallet-load-build`: Build a load where each placement is checked against authored stacking rules, so a pallet is a validated structure rather than a pile.
- [Parcel sorter event playback](../../data/recipes/parcel-sorter-events.json) — `recipe.parcel-sorter-events`: Follow parcels through an invented sorter whose routing decisions and queues are inspectable.
- [SensorThings telemetry freshness and ordering view](../../data/recipes/sensorthings-telemetry-freshness-sync.json) — `recipe.sensorthings-telemetry-freshness-sync`: Reconcile a finite supplied SensorThings observation stream into stable scene objects while preserving phenomenon, result and arrival times and showing stale, late, duplicate or conflicting data without treating telemetry as truth.
- [Warehouse pick tour and inventory](../../data/recipes/warehouse-pick-tour.json) — `recipe.warehouse-pick-tour`: Connect a synthetic order list to rack locations and explicit pick confirmations.
