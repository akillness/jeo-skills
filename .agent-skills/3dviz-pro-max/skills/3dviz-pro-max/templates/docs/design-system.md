<!-- Copy only when the project wants a design note. Keep useful decisions concise; remove
inapplicable sections without paperwork. Source and asset attribution may still be necessary. -->

# <Scene name>: design system

## Intent and visual direction

- Viewer and purpose: <what to see, understand, feel or do>
- Distinctive visual idea: <specific shape/material/composition decisions>
- References: <relevant supplied or researched references, if any>
- Palette and light: <roles, response, contrast and selected values>
- Setting: <environment, studio, diagrammatic or invented; time of day only if useful>
- Camera and delivery size: <projection, framing, controls and viewport>

## Object decisions

| Important object | Identity / structure / behavior | Construction route | Reused parts or operations | Custom work |
| --- | --- | --- | --- | --- |
| <object> | <what must read correctly> | <kit / adapted kit / custom / sourced / hybrid> | <what already fits> | <what needs distinctive treatment> |

Choose routes by fit, not by hero/background role or tool brand. A suitable kit can be a hero; a
custom object can reuse shared geometry operations, materials and tooling.

## Representation and factual grounding

- Representation: <illustration / discrete state / simulation / playback, with boundaries if mixed>
- Authoritative state: <model, solver, source data or authored timeline>
- Animation responsibility: <what the rendering displays or interpolates>

| Claim the viewer may infer | Source actually read | Model / visual correspondence | Limits |
| --- | --- | --- | --- |
| <claim> | <source, passage and date> | <equations, coordinates, geometry, labels> | <simplification or unresolved issue> |

Asset attribution: <source, license and adaptations where relevant>.

## Quality targets and available pipelines

- Delivery: <web-desktop / mobile / still / other>
- Overview target: <silhouette, proportion, hierarchy and readability>
- Inspection target: <parts, thickness, attachment, materials or mathematical precision>
- Close-up target, if offered: <details that survive actual viewing distance>
- Factual fidelity: <what is grounded and what remains illustrative, independently of visual polish>
- Available tools: <what was actually discovered; discovery is not execution>
- Kit pipeline recommendation, if used: <T0–T4 from the record/probe, with its declared proof status>

The legacy host `quality_ceiling` describes available shipped-kit pipelines. It is not an artistic
ceiling, a universal detail tier or a restriction on custom/sourced assets. Keep original kit-tier
labels for provenance; do not relabel an unproved asset or infer a T3 result from Blender installation.

| Object | Intended viewing distance / scale | Visible quality target | Chosen method | Actual observations |
| --- | --- | --- | --- | --- |
| <object> | <distance or framing> | <what must be convincing> | <tool/pipeline> | <observed / not inspected> |

## Materials, composition and scale

| Material family | Optical response and useful parameters | Intended visible cues |
| --- | --- | --- |
| <family> | <roughness, metalness, transparency, other relevant values> | <how the material reads> |

- Composition: <hierarchy, comparison, rhythm, negative space or depth as appropriate>
- Scale: <model units, display scale and any exaggeration>
- Authored views: <what each view helps inspect>
- Meaningful preset adaptations: <only decisions a later editor needs to understand>

No minimum roughness count, mandatory fog, fixed hue count or universal three-metre detail test applies.

## Behavior and interaction

| Control / action | State owner and change | Visible or numeric feedback | Reset semantics |
| --- | --- | --- | --- |
| <action> | <actual state> | <observable result> | <restored / intentionally preserved> |

- Contacts and attachments: <support, joints, clearance or other relevant relationships>
- Idle and motion: <what moves, what stops and why>
- Reduced motion: <readable initial state and interaction behavior>
- Approximation boundaries: <where authored animation differs from solved mechanics>

## Runtime and inspection

- Stack and asset handoff: <actual dependencies and format decisions>
- Geometry/material reuse: <instance batches, buffers, cached textures where applicable>
- Runtime budgets: <chosen values and their reasons; measured only if measured>
- Inspection method: <visible browser, permitted capture or unavailable>
- Observed overview / close-up / interactions: <concise evidence>
- Remaining weaknesses: <specific uncertainty or visible limitation>

A build, numerical check, source read and visual inspection establish different things. Report each
at its actual scope. Keep a separate validation report only when useful or required by the project.
