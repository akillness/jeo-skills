# Claim → Evidence Packet

Use this note when the paper is drifting into unsupported contribution language.

## Core rule
Every headline claim in the abstract, intro, or contribution bullets should map to at least one of:
- benchmark result
- ablation / mechanism check
- qualitative analysis
- failure-case or limitation discussion
- efficiency / compute / cost evidence

## Minimal packet
For each claim, record:
- claim wording
- required proof
- current evidence status
- figure/table anchor
- reviewer risk if under-supported

## Common failure patterns
- abstract claims a broader win than the experiments actually show
- intro promises a mechanism that the ablations never isolate
- method section introduces implementation detail that experiments never justify
- figures exist but captions do not state the takeaway cleanly
- rebuttal promises future changes without a concrete manuscript-change plan

## Repair moves
1. narrow the claim to what the evidence truly covers
2. add an ablation or scope note
3. move non-essential bragging out of the contribution bullets
4. give each important result a figure/table home
5. separate “shown now” from “planned for camera-ready”
