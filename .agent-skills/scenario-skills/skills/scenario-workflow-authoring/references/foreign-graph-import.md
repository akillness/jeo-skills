# Importing a graph from another node tool

The import path in the main reference round-trips Scenario's own export and nothing else. A graph
built in Weavy, ComfyUI, or another node editor is translated, not imported: read the source graph,
map each node onto the Scenario vocabulary, author `editor_info`, publish, dry-run, and report what
did not map. The result reproduces the pipeline's shape; per-node output differs because the models
differ, so never promise parity with the source tool's renders.

## Read the source as a table

Every node editor exports the same three things under different names: a node list (a type or class
per node, its parameter values, a position), a connection list (from one node's output to another
node's input), and the nodes exposed as the pipeline's inputs and outputs. Field names differ per
tool and per version, so open the file and locate all three rather than assuming a layout. Weavy
exports a JSON with nodes and edges. A ComfyUI workflow export carries `nodes[]` (each with `type`,
`widgets_values`, `inputs[]`, `outputs[]`) and `links[]` as arrays of
`[id, from_node, from_slot, to_node, to_slot, type]`; its API-format export keys nodes by id with
`class_type` and `inputs`, where a two-element array value such as `["4", 0]` is a link to node
`4`'s first output.

Reduce the file to one row per node (source id, kind, model or operation named, parameters, incoming
connections) locally, with a script or by hand. Exports run to thousands of lines; pasting one into
the conversation spends the context the mapping needs.

## Map each row

| Source node                                                                                 | Scenario                                    | How                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text constant, prompt box                                                                   | `text`                                      | `data.value`; pin it (`isInput: true`, in `inputKeys`) when the source exposed it                                                                                                                                                                                                    |
| Image, video, audio, or 3D input; file upload                                               | `asset`                                     | `data.type` from the media kind; pin it. `upload_asset` the source's bundled file only when it must be the default value                                                                                                                                                             |
| Prompt template, string concatenation, text merge                                           | `transformText`                             | One CEL expression over the connected inputs, single-quoted literals                                                                                                                                                                                                                 |
| LLM prompt writer or captioner                                                              | `llm`                                       | Preserve LLM steps explicitly present in the source, including prompt enhancement; do not add new enhancement steps during translation                                                                                                                                               |
| Generator or editor (text-to-image, image-to-image, video, upscale, background removal, 3D) | `model`                                     | Resolve the member below, then `model_schema_get`: input names become handles, scalar settings (`seed`, guidance, output count) go in `data.form` only where the schema has a field of the same meaning; drop the rest and list them                                                 |
| Checkpoint, LoRA, VAE, CLIP, sampler, scheduler, latent nodes (ComfyUI plumbing)            | folded into the `model` node they feed      | The checkpoint or LoRA names the member; the sampler's `seed`, `cfg`, and `steps` and the latent node's width, height, and batch map to `form` fields of the same meaning where the schema has them (size fields or an aspect preset, the output-count field); nothing else survives |
| Branch, switch, condition                                                                   | `ifElse`                                    | String operators only (`contains`, `equals`, `isEmpty` and their negations); a numeric comparison has no mapping                                                                                                                                                                     |
| Loop, batch, for-each, iterate                                                              | `forEach` plus `forEachEnd`                 | Both nodes, `parentNodeId` on the end node; the body's terminal feeds the end node and consumers read from it. Clone a working loop of the same shape and validate its downstream wiring with a dry run                                                                              |
| Split, list pick, first N, group                                                            | `splitText`, `sliceAssets`, `groupItems`    | `sliceAssets` takes `from` and `count` as strings                                                                                                                                                                                                                                    |
| Preview, save, output, export                                                               | `data.isOutput: true` on the producing node | No node of its own                                                                                                                                                                                                                                                                   |
| Human review, approve, pause                                                                | `approval`                                  | Attached to the producer's approval handle, never on the data path                                                                                                                                                                                                                   |
| Code, script, HTTP request, webhook, custom plugin, third-party integration                 | unmapped                                    | Listed for the user; insert pinned `text` or `asset` nodes for missing downstream values and wire them into consumer handles; list gaps whose value types cannot be represented                                                                                                      |

Resolve a generator's member by what the source names. A provider model named in the node (a FLUX,
Kling, Seedream, or Gemini member) is a name: `search` with `target="models"`, `public=true`, and
the name as `query`, then read the hits rather than taking the first: the source names a generation
that may be gone, so take the newest member the task fits whose record carries no `deprecated` tag
(a `deprecated:<replacement_id>` tag names the successor). A checkpoint file whose name carries a
provider family (`flux1-dev.safetensors` names FLUX) is a name, not a capability: the file never
travels, the family does. When no hit fits, or every fit is deprecated with no successor tag, the
node falls through to the capability path below and the report says the family was substituted. A
model the source tool hosted itself and whose file name identifies no public model (a merge, a
downloaded LoRA, a tool-specific default) is a capability: `recommend` with `capability` from its
enum (`txt2img`, `img2img`, `img2video`) and the node's job as `prompt` in the user's own words,
then the `next_step` discipline from the `scenario` skill. A hit `recommend` marks
`requires_plan_upgrade` is not mappable for this team; record it as unmapped rather than
substituting silently. Never carry the source's model identifiers into `data.modelId`, and prefer
plain model ids over a LoRA's own id inside a graph.

## Emit, validate, report

1. Author `editor_info` per the main reference: persisted edges point consumer to producer, handle
   ids follow `${nodeId}-source-${name}` and `${nodeId}-target-${name}`, `inputKeys` keeps the
   source's exposed-input order, layout runs left to right in the source's topological order.
2. `workflow_create` with the source's name (or one the user confirms when the export carries none)
   and a `description` that lists every unmapped node and dropped parameter, so the gap travels with
   the workflow into the editor. A failed create may still have created a draft: `workflow_update`
   on the id in the error, never a second create.
3. `workflow_publish`, then `workflow_run` with `dry_run=true` and representative `inputs`. It
   prices the whole graph and runs the real validator, so a wiring error surfaces here at zero cost;
   fix `editor_info` and publish again. Quote the price before any real run.
4. Report, per node: the Scenario member it received, the parameters that did not transfer, the
   nodes that did not map, and what the user finishes in the editor. The user's test inputs, not the
   source tool's sample renders, decide whether the translation holds.

## Common mistakes

- Keeping one Scenario node per source node: ComfyUI plumbing collapses into the generator, and
  preview nodes vanish into an output pin.
- Reading the source's edge direction into `editor_info`: Scenario persists edges the other way.
- Mapping a source LoRA to a Scenario LoRA by name and running it by its own id: a LoRA's schema
  carries `runs_as`, and LoRA ids inside graphs were not validated at authoring time.
- Copying a setting because its number fits the target range: `cfg` and `guidance` can mean
  different things. Transfer a value only when the schema establishes the same meaning and range;
  otherwise omit it, keep the target default, and list the source setting as dropped. A caveat about
  changed behavior does not make copying it valid.
- Delivering the graph without the dry run: it is the only validator that reads the whole `flow`,
  and a customer's pipeline fails on a handle nobody wired.
