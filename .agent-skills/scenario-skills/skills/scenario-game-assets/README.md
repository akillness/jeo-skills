# Maintaining the template references

The isometric and sprite-grid builders produce geometry independently of generative model
availability. Tests cover neighbor edges, regions, headroom, cell coverage, guide placement, and
reproducible output. The PNGs are build artifacts; the JSON manifests describe their placement.
Sprite grids live with `scenario-sprite-animation`; a guide's upload does not establish that a
generative model honors its alignment.

## Publication, Scenarians only

The runtime procedure is centralized in
[the shared asset lifecycle](../scenario/references/shared-assets.md), linked directly from both
template skills. It covers scope, reuse, staging, publication gaps, and public-access verification.
Private upload receipts stay local. The public manifests acquire asset IDs only after access is
verified.

Keep template geometry and lookup tags in the owning skill's JSON manifest. Run the builder and its
regression suite together when changing it; a geometry or placement-contract change gets a new
version. A staged guide is not evidence that a generative model obeys it: validate the intended map
or sprite-sheet workflow separately.
