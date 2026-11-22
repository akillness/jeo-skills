# Standalone examples

This workspace contains 37 directly addressable Three.js studies. Each folder is one runnable subject with its own prompt and documentation; shared runtime and model code lives under `shared/`. There is no gallery application: open an example by its stable path.

## Run

Install once and run the shared development server from this directory:

```sh
cd examples
pnpm install
pnpm dev
```

Open `/<id>/`, for example `http://localhost:4180/heart/` using the URL printed by Vite. Build every example with `pnpm build`.

## Anatomy geometry

The four anatomy studies (`heart`, `brain`, `muscle-atlas`, `knee`) and `breathing`, `arm` and `sarcomere` load STL meshes that are **not stored in this repository**: 108 files, 168.6 MiB, hosted in the R2 bucket behind `https://assets.3dviz.dev/`. `assets-manifest.json` lists every key with its size and sha256 and holds that base URL.

```sh
pnpm fetch-assets   # downloads the manifest into public/assets/ (git-ignored), verifying sha256
```

Without a local copy those studies fail to load their meshes; every other study is procedural and needs nothing. To load the hosted geometry instead of a local copy — which is what the site deploy does — set `VITE_ASSET_BASE` (see `.env.example`); the loaders build every URL from it, so it must end with a slash. `scripts/fetch-assets.sh` re-runs cheaply: files already present with the right checksum are skipped. The credit is unchanged wherever the bytes are served from: BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 Japan, via the Kevin Moerman STL mirror. Each example provides Overview and Detail views, orbit/zoom, reset, reduced-motion-aware pause behavior where motion exists, and subject-specific controls where useful.

## Anatomy and physiology

- [The Living Heart](heart/) — registered heart anatomy, cutaway inspection, authored cycle
- [Upper-body Muscle Atlas](muscle-atlas/) — selected muscles and skeletal context
- [Inside the Brain](brain/) — selected registered cortical and deep structures
- [Inside a Sarcomere](sarcomere/) — sliding-filament overlap comparison
- [Arm in Motion](arm/) — selected elbow bones and opposing muscle shapes
- [The Neural Signal](neuron/) — authored neuron and directional signal cue
- [Breath by Breath](breathing/) — registered lobes with schematic breathing mechanics
- [The Moving Knee](knee/) — resting, exploded, and illustrative hinge views

## Mathematics

- [Space, Rewritten](svd/) — geometric singular value decomposition
- [Fourier Sculpture](fourier/) — odd-harmonic phasor synthesis
- [The Topology Atelier](topology/) — Möbius, torus, and trefoil traversal
- [Complex Observatory](complex/) — Riemann sphere and reciprocal inversion
- [Probability in Glass](probability/) — seeded Gaussian samples and covariance shell
- [The Qubit Compass](bloch/) — interactive pure-state Bloch sphere

## Physics and mechanisms

- [The Chaos Desk](chaos/) — paired double-pendulum sensitivity experiment
- [Light Through Matter](optics/) — Snell/TIR ray tracing
- [Membrane Modes](resonance/) — circular-membrane normal modes
- [Magnetic Atelier](magnetic/) — current-loop field and axial probe
- [The Differential](differential/) — equal-side-gear kinematics
- [Orbital Clockwork](orrery/) — Kepler ellipses and swept areas
- [Coupled Gears](gears/) — 24/16-tooth constrained gear pair

## Crafted worlds, characters, architecture, and props

- [Crystal Conservatory](cavern/) — fictional subterranean garden
- [The Moonwood Stag](stag/) — planted forest-spirit character study
- [The Copperleaf Cottage](cottage/) — detailed cottage miniature
- [The Carpenters’ Long Hall](hall/) — long timber hall miniature
- [The Stonewright Guild](guildhall/) — stone guildhall miniature
- [The Moonwatch Tower](tower/) — tapered watchtower miniature
- [The Harvest Counter](market/) — close-readable market prop
- [The Lamplighter’s Lantern](lantern/) — octagonal lantern study
- [The Wishing Well](well/) — supported well and bucket assembly
- [The Windwritten Tree](tree/) — open-canopy branching study
- [Copperleaf Hollow](village/) — integrated village diorama

## Lighting studies

- [The Last Light](blue-hour/) — low warm key with cool blue-hour fill
- [Lanterns by the River](night-river/) — practical-led night composition
- [Across the Lantern Bridge](night-bridge/) — bridge receiver and shadow study
- [A Light at the Door](night-doorway/) — doorway silhouette and practical light
- [The Mill After Dark](night-mill/) — mill source/receiver balance

## Evidence and reuse

The per-example README is the authority for its controls, sources, third-party asset rights, modeled claims, and limits. Anatomy meshes retain BodyParts3D registration and attribution. Fictional crafted studies use procedural geometry and no third-party model assets. The repository's own code, data and authored media are [MIT licensed](../LICENSE); third-party material keeps its own terms, as stated in the [project README](../README.md#license-and-credits). Shared implementations live in `shared/art-science/` and `shared/breadth/`; each folder's `scene.js` is a small entry wrapper and does not import another example.

Skill-rule sections distinguish records known to have been retrieved from retrospective matches between current guidance and older code. Similarity alone is never presented as dataset-retrieval evidence. Start with the canonical [3dviz-pro-max skill](../skills/3dviz-pro-max/SKILL.md) for the workflow and reporting contract.
