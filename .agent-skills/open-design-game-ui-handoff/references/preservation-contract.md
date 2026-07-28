# Preservation Contract Reference

## Contract Shape

Use this semantic shape. File lists shown here are examples; all real references must resolve inside the handoff.

```json
{
  "schemaVersion": 1,
  "approvalPolicy": "upgrade-only",
  "dimensions": ["identity", "composition", "information", "interaction", "motion", "material", "readability"],
  "authorityAxes": ["layout", "identity", "motion", "interaction", "copy", "data"],
  "defaultAuthority": "runtime",
  "omissionPolicy": "unspecified-preserve-runtime",
  "ownerApprovalRequired": true,
  "surfaces": [
    {
      "id": "home",
      "treatment": "redesign",
      "motionCritical": true,
      "ownerFiles": [
        { "path": "source/InheritanceOverlay.js", "anchors": ["drawRevealRig", "@keyframes egy-char-in"] }
      ],
      "baselineStills": [
        { "path": "screenshots/zh/phone-landscape/home-overview.webp", "viewport": "852x393", "locale": "zh", "state": "home-overview" },
        { "path": "screenshots/zh/desktop-1440/home-overview.webp", "viewport": "1440x900", "locale": "zh", "state": "home-overview" }
      ],
      "motionEvidence": {
        "videos": [
          { "path": "motion/home/desktop-1440/home-character-switch.webm", "viewport": "1440x900", "state": "character-switch" }
        ],
        "keyframes": [
          { "path": "motion/home/desktop-1440/0000-setup.webp", "timestampMs": 0, "beat": "setup" },
          { "path": "motion/home/desktop-1440/0450-entrance.webp", "timestampMs": 450, "beat": "entrance" },
          { "path": "motion/home/desktop-1440/1400-rest.webp", "timestampMs": 1400, "beat": "rest" }
        ]
      },
      "signatures": [
        {
          "id": "character-ritual-stage",
          "dimensions": ["identity", "motion", "material"],
          "mustRetain": ["animated character rig idle and character-switch entrance", "rotating ritual floor", "floating mask sigils", "animated level and talent emblems", "circular animated battleSigilSVG deploy medallion"],
          "forbiddenRegressions": ["static portrait replacing the live rig", "rectangular command plate replacing the deploy medallion", "standalone placeholder motion treated as a deletion instruction"],
          "evidence": ["motion/home/desktop-1440/home-character-switch.webm"],
          "sourceAnchors": ["source/InheritanceOverlay.js#drawRevealRig"]
        }
      ],
      "components": [
        {
          "id": "character-stage",
          "treatment": "redesign",
          "changeScope": ["layout"],
          "changeBrief": "Recompose for desktop width without changing the live ritual choreography.",
          "authority": { "layout": "open-design", "identity": "runtime", "motion": "runtime", "interaction": "runtime", "copy": "runtime", "data": "runtime" },
          "standaloneMotionPolicy": "placeholder-only-preserve-runtime",
          "runtimeMotionImplementation": "reuse-existing-runtime",
          "runtimeOwnerAnchors": ["source/InheritanceOverlay.js#drawRevealRig", "source/InheritanceOverlay.js#@keyframes egy-char-in"],
          "proofRequired": ["same-beat current vs integrated video", "paired setup/entrance/rest keyframes"]
        }
      ],
      "untouchedDetails": ["character rig painters", "animation timing and lifecycle cleanup"],
      "comparisonPlan": {
        "viewports": ["852x393", "1440x900"],
        "locales": ["zh", "en"],
        "states": ["home-overview", "home-loadout"],
        "motionStates": ["character-switch"],
        "stillComparisons": ["current-vs-standalone", "current-vs-integrated"],
        "motionComparisons": ["setup", "entrance", "rest"]
      }
    }
  ]
}
```

## Authority Semantics

| Authority | Meaning |
| --- | --- |
| `runtime` | Preserve the current behavior/visual implementation; move it intact if layout changes. |
| `open-design` | Open Design may replace this exact axis, subject to upgrade proof. |
| `shared` | Open Design supplies direction, while runtime behavior/source constraints still apply. |

`data` is always `runtime`. A missing axis is invalid rather than silently becoming Open Design authority.
`changeScope` is also mandatory for every `upgrade` or `redesign` component and must exactly match the axes whose
authority is `open-design` or `shared`. Every other axis is frozen, including behavior represented only by a
static standalone proxy. `standaloneMotionPolicy` and `runtimeMotionImplementation` make that proxy semantics
machine-readable: runtime-owned motion is always `placeholder-only-preserve-runtime` and
`reuse-existing-runtime`. `runtimeOwnerAnchors` identifies the implementation that takeover must retain.

`comparisonPlan` is an executable coverage contract. Takeover evidence must cover the full Cartesian product of
every listed component, viewport, locale, and state. Motion-critical surfaces must also cover every
`viewport x locale x motionState` row and every named motion beat. Do not list aspirational coverage that the
takeover validator is allowed to skip. `states` use exact standalone review-API state ids; `motionStates` name
runtime comparison sequences and may differ when standalone motion is only a placement proxy.

## Treatment Semantics

| Treatment | Meaning |
| --- | --- |
| `preserve` | No intentional visual or behavioral change. All authority remains runtime. |
| `upgrade` | Improve explicitly named axes; preserve all others. |
| `redesign` | Recompose explicitly named axes; still preserve all unassigned axes. |
| `untouched` | Out of scope. All authority remains runtime and no implementation diff is allowed. |

## Motion Evidence

One still cannot prove motion. Capture at least setup/anticipation, peak/impact/transformation, and settled/result.
For multi-act reveals, include every meaningful act. Fusion commonly needs sacrifice, vortex, detonation, birth,
proclaim, affix, and settle. Victory commonly needs verdict arrival, reward modules, count-up/growth, unlock, and
dashboard handoff.

## New Steam Title Surface

`contractProfile: "steam-title"` permits one narrowly scoped new surface, `title`, with
`baselinePolicy: "new-surface-no-runtime"`. Because there is no runtime `#title` yet, its `baselineStills` must
be empty rather than populated with mislabeled Home images. Supply at least two real Home `contextStills` with
`sourceSurface: "home"` and an explicit continuity purpose. All six current meta surfaces remain separate
`untouched` preservation surfaces with runtime authority. This exception does not apply to an existing surface
and does not waive immutable preview, owner review, or later integrated-runtime proof.
