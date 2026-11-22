# Orbital Clockwork

A coplanar Kepler-orbit study for Mercury through Mars with an equal-time swept-area inspection.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/orrery/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to build a brass-and-ink orrery for Mercury, Venus, Earth, and Mars using Kepler ellipses. Keep one linear distance scale, solve nonuniform orbital position, let me inspect an orbit and a 20-day swept sector or place a planet at perihelion, and distinguish representative elements from an ephemeris.

## Explore and implementation

Use Overview and Detail. Set model days per second, select a planet, toggle its 20-day swept area, or place it at perihelion. See [scene.js](scene.js) and the [shared scene](../shared/art-science/scenes/orrery.js).

## Source and limits

Approximate elements and Kepler-equation method follow [NASA/JPL](https://ssd.jpl.nasa.gov/planets/approx_pos.html). Orbit distances share one scale; planet sizes are enlarged and initial phases authored. Brass supports are visual design, not solved clockwork, and positions are not a dated ephemeris.

## Skill rules actually applied

The scene corresponds to `recipe.kepler-equal-area-orbit` in [astronomy and space](../../skills/3dviz-pro-max/references/catalog-directions/astronomy-space.md), with one orbital state feeding positions, distance, and swept sectors. Mapping is retrospective.
