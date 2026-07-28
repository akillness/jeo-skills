# Authority And Proof

## Takeover Analysis Matrix

Record one row per component:

| Surface | Component | Treatment | Change scope | Layout | Identity | Motion | Interaction | Copy | Data |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | Character stage | redesign | layout | open-design | runtime | runtime | runtime | runtime | runtime |
| Talent | Wedjat node | preserve | none | runtime | runtime | runtime | runtime | runtime | runtime |

Do not collapse the six axes into a single "follow design" decision. For each non-runtime cell, record the
approved change brief, standalone source selector/function/timeline, runtime destination, expected improvement,
proof state/viewport/locale/beat, and fallback when the result does not upgrade the baseline.

The takeover matrix must copy `changeScope` exactly. Anything outside it is an implementation freeze: preserve
the existing painter, animation, timing, interaction, data binding, and reduced-motion behavior even when the
standalone represents that component with a static placeholder.

For every changed component, add a `runtimeContinuity` record. Its `frozenAxes` must exactly match all runtime
authority cells, `frozenAxesAction` must be `unchanged` or `moved-intact`, and its motion policy plus owner
anchors must exactly match the handoff. A visually similar rewrite is not implementation continuity.

## Integrated Evidence Shape

`takeover-evidence.json` must include an immutable artifact binding: Open Design project, revision, artifact
SHA-256, successful full-preview-manifest SHA-256, preservation-contract SHA-256, and validated
`gpt-5.6-sol / ultra` generation-evidence SHA-256. Each standalone still names its bound preview scenario and
must match that scenario's screenshot SHA-256.

When the successful immutable preview manifest lacks a required Cartesian state row, an optional
`archiveReplayManifest` may supplement its scenarios. The replay must be captured from artifact bytes whose
SHA-256 exactly matches the immutable revision, declare `local-exact-bytes`, bind the original preview-manifest
SHA-256, and retain the same project, revision, contract, and generation evidence. The validator uses the union
of both scenario sets and includes both manifest hashes in `reviewEvidenceSha256` and owner approval. A replay
cannot repair a failed original preview, change the artifact, or stand in for generation evidence.

For a staged takeover from a multi-surface artifact, add:

```json
{
  "takeoverScope": {
    "surfaces": ["home"],
    "outOfScope": [
      { "surface": "mapselect", "policy": "frozen-runtime-no-change" },
      { "surface": "talent", "policy": "frozen-runtime-no-change" },
      { "surface": "masks", "policy": "frozen-runtime-no-change" },
      { "surface": "fusion", "policy": "frozen-runtime-no-change" },
      { "surface": "victory", "policy": "frozen-runtime-no-change" }
    ]
  }
}
```

`outOfScope` must exactly equal the preservation contract complement. The validator rejects evidence rows for
those surfaces and still validates the full artifact, preview, generation evidence, and preservation contract.
Without `takeoverScope`, every contract surface remains required. The normalized scope is included in
`reviewEvidenceSha256` and must be repeated in the owner approval receipt.

The still matrix is the full Cartesian product declared by the preservation contract: every component
x viewport x locale x state. Motion evidence covers every component on every motion-critical surface x viewport
x locale x `motionState`, with exactly the declared beats. Each motion row includes current, standalone, and
integrated video plus current, standalone, and integrated keyframes. Current, standalone, and integrated evidence cannot reuse a path
or content hash within one proof row or across different viewport/locale/state/beat contexts. Rows for several
components may point at the same full-surface triplet only when the proof context is identical. Static comparison
`state` values are exact preview scenario states; a single standalone scenario cannot be reused to pretend that
several different states were reviewed.

Approval requires a JSON receipt naming the owner/source/time, repeating the exact artifact binding, and storing
the `reviewEvidenceSha256` emitted by the review-phase validator. That digest covers generation evidence;
current, standalone, and integrated still hashes; all seven dimension verdicts; three-way motion video and
keyframe hashes;
authority/continuity rows; and empty regression/omission lists. Every verdict is `preserved` or `upgraded`.

## Review Order

1. Can the player understand the screen and primary action in three seconds?
2. Does the composition still belong to Darkbone Archer?
3. Did any signature object become generic, smaller, flatter, or static?
4. Are component relationships clearer at each viewport?
5. Does motion preserve anticipation, impact, consequence, and rest?
6. Are material, typography, icon scale, and micro-interactions at least as refined?
7. Only then inspect geometry, overflow, touch size, focus, and localization.
