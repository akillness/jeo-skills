# The editor_info grammar

This is the authoring grammar for Scenario workflows: the `editor_info` document that
`workflow_create` and `workflow_update` accept and `workflow_get` returns, plus the
`inputs_definition` array that rides with it. `workflow_publish` compiles `editor_info` into the
executable `flow`; you never write `flow` by hand.

`editor_info` top-level keys: `nodes` (array), `edges` (array), `inputKeys` (ordered array of node
ids for workflow inputs), and optionally `nodeGroups` (a map of group id to
`{title, color, locked?}`, cosmetic only). Records fetched from live workflows may carry extra UI
fields on nodes (`measured`, `selected`, `dragging`, `width`, `height`); omit them when authoring.

## Edge direction is inverted: read this first

Persisted edges do not point the way graph intuition says. In `editor_info.edges`:

- `source` is the DOWNSTREAM consumer node, and `sourceHandle` is its INPUT handle.
- `target` is the UPSTREAM producer node, and `targetHandle` is its OUTPUT handle.

Handle ids follow one scheme:

| Handle side | Id format                  | Example                |
| ----------- | -------------------------- | ---------------------- |
| Input       | `${nodeId}-source-${name}` | `model1-source-prompt` |
| Output      | `${nodeId}-target-${name}` | `text1-target-output`  |

So "text node `text1` feeds the prompt of model node `model1`" is written:

```json
{
  "id": "edge1",
  "source": "model1",
  "sourceHandle": "model1-source-prompt",
  "target": "text1",
  "targetHandle": "text1-target-output"
}
```

The name segment comes from the handle's `name` field. Output handle names are commonly `output`,
but live workflows also show others (a text node feeding a prompt can carry a `prompt`-named output
handle), so when cloning, copy handle ids from the source record instead of assuming `output`.
`ifElse` output handles are named `if1` to `ifN` plus `else`.

## Node type vocabulary

`nodes[].type` uses a camelCase persisted vocabulary. The workflow editor's palette names
(image-generator, prompt-builder, if-else, 3d-model, video-studio) are NOT valid persisted types;
creation validation refuses unknown types before any network call.

| Persisted type  | Editor palette equivalent                                   |
| --------------- | ----------------------------------------------------------- |
| `text`          | Text                                                        |
| `asset`         | Image, Video, Audio, 3D model (kind in `data.type`)         |
| `model`         | Every generator, tool, and studio node (kind via `modelId`) |
| `llm`           | LLM generator                                               |
| `transformText` | Prompt builder (CEL)                                        |
| `splitText`     | Split text                                                  |
| `groupItems`    | Group items                                                 |
| `sliceAssets`   | Slice assets                                                |
| `ifElse`        | If/else                                                     |
| `forEach`       | For-each loop start                                         |
| `forEachEnd`    | For-each loop end                                           |
| `approval`      | Approval gate                                               |
| `aspectRatio`   | Aspect ratio preset                                         |
| `stickyNote`    | Sticky note (annotation only, never connected)              |

The webapp also persists a `modelInput` type (a generator setting exposed as its own node), but the
creation validator rejects it: an export using exposed model inputs fails a `workflow_create`
round-trip.

## Per-type data contracts

Common `data` fields on every node: `title` (display name), `isInput` / `isOutput` (workflow pin
flags), `inputHandles` / `outputHandles` (arrays of `{id, name, label, type}`).

| Type            | Data fields                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`          | `value` (the string)                                                                                                                                                         |
| `asset`         | `type` (`image` \| `video` \| `audio` \| `3d`, note `3d` not `3d-model`), `value` (asset id, or array when `isMultiple: true`), `isRequired?`                                |
| `model` / `llm` | `modelId`, `form` (scalar-only settings keyed by the model's input names, e.g. `{"guidance": 7.5}`; wired inputs like `prompt` never go here)                                |
| `transformText` | `value` (a CEL expression, see below); one input handle `<id>-source-input` (type `text`) that takes any number of edges, and one output `<id>-target-output`                |
| `splitText`     | `splitDelimiter` (default `,`)                                                                                                                                               |
| `groupItems`    | `value` (a CEL list expression)                                                                                                                                              |
| `sliceAssets`   | `from`, `count`: STRINGS, not numbers (`"0"`, `"-3"`; negative `from` counts from the end)                                                                                   |
| `aspectRatio`   | `output` (exactly one of `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`, `9:21`), `quality`                                                         |
| `ifElse`        | `conditionBlocks` (see below)                                                                                                                                                |
| `forEach`       | `isConcurrentRuns?` (parallel iterations; ignored on nested loops)                                                                                                           |
| `forEachEnd`    | `parentNodeId` (the paired `forEach` node id)                                                                                                                                |
| `approval`      | `message` (prompt shown when paused; default "Continue ?")                                                                                                                   |
| `stickyNote`    | `content` (Markdown), `backgroundColor` (`#RRGGBB`; the field is not `color`), `fontSize` (`small` \| `medium` \| `large`), `backgroundColorOpacity?` (0.1 to 1); no handles |

Only `image` and `video` asset nodes support `isMultiple` with an array `value`; `audio` and `3d`
asset nodes hold a single asset id, always.

## Workflow inputs are pinned nodes

A workflow-level input is a node flagged `data.isInput: true`, ordered by `editor_info.inputKeys`.
The published input's `name` IS the node id (`text1`, `image5`), which is why run-input keys look
positional and non-contiguous. Outputs are `data.isOutput: true` pins on `model`, `llm`, or
`forEachEnd` nodes; publish refuses a graph where no model or llm node is reachable from an output
pin with `Cannot publish: editor_info compiled to an empty flow`. That error means `isOutput` sits
on another node type (a text or asset node) or on a model wired to nothing: move the flag to the
model that produces the deliverable.

Input pins are optional. A workflow whose prompt and settings live inside the graph publishes
through `workflow_publish` with an empty `inputKeys` and an empty `inputs_definition`, and runs with
no inputs. Only the webapp's Convert to App step requires an input pin (and an output example
image), so never add a dummy input to satisfy it: publish through MCP instead.

`inputs_definition` entries mirror the pinned nodes:

- Pinned `text` node:
  `{"type": "string", "name": "<nodeId>", "label", "description", "placeholder", "required": {"always": true|false}, "prompt": true|false, "default"}`.
  `prompt: true` only changes how the app displays the input (a text area with the prompt spark
  feature), never the wiring; `promptSpark` toggles the spark on its own.
- Pinned `asset` node: `{"type": "file"}` or `"file_array"` when `isMultiple`, plus `"kind"` set to
  the asset `data.type`.

The full input `type` set observed on live workflows: `string`, `integer` (typed as `number` in some
layers), `boolean`, `file`, `file_array`, `string_array`, `model_array`, `number_array`,
`inputs_array`. Array-typed inputs silently drop bare scalars at run time, so declare arrays only
when the input truly takes a list.

## Model nodes: handles come from the model schema

A model node's input handles derive from its model's input schema: handle name = input name, so the
model input `prompt` becomes handle id `${nodeId}-source-prompt`. Use `model_schema_get` on the
chosen model id to learn the input names, types, and required flags: `parameters[].required` is a
boolean, unlike the `required` object in workflow `inputs_definition`. Wire required inputs or the
workflow cannot run. Scalar-only settings (guidance, seed, output count) go in `data.form`, not
handles. Never hardcode model ids: discover them with `search` or `recommend` per team, then
schema-check. LoRA and composition model ids (`runs_as` in the schema) were not validated inside
graphs at authoring time: prefer plain model ids in `data.modelId`, and dry-run to validate when
using one.

## CEL expressions (transformText)

`transformText` composes text at run time from connected inputs via a CEL expression in
`data.value`. No LLM call is involved.

- Variables are named `${nodeId}_${outputHandleName}`: text node `text1` with output handle `output`
  is `text1_output`. A variable only resolves when the corresponding edge exists; connect first,
  reference second.
- String literals must be SINGLE-quoted. Double-quoted literals evaluate in CEL but corrupt the
  canvas editor's rendering of the expression, observed at authoring time.
- Concatenate with `+`:
  `'A portrait of ' + trim(text1_output) + ' in the style of ' + text2_output`.
- Custom functions: `trim(string)`, `slice(list, start, end)`. Standard CEL is available (`size`,
  `matches`, `startsWith`, `endsWith`, `contains`, `replace`, `split`, `substring`, `lowerAscii`,
  `upperAscii`, and the `has` / `all` / `exists` / `map` / `filter` macros). The ternary
  `condition ? a : b` works, which is how a prompt varies with an input (see the `ifElse` section).
- Never feed a `splitText` output (a list) into `transformText` (single text); route lists through
  `forEach` or `sliceAssets`.

`groupItems.data.value` is also CEL, producing a list.

## ifElse condition blocks

```json
{
  "conditionBlocks": [
    {
      "logic": "and",
      "conditions": [{ "field": "text1_output", "operator": "contains", "value": "night" }]
    }
  ]
}
```

- `field` uses the same `${nodeId}_${handleName}` convention as CEL variables.
- Operators: `isEmpty`, `isNotEmpty`, `contains`, `notContains`, `equals`, `notEquals`. Numeric
  comparators are not part of the authoring surface.
- `value` is required for `contains` / `notContains` / `equals` / `notEquals` and must be omitted
  for `isEmpty` / `isNotEmpty`; `field` is required always.
- Block at index i drives output handle `if(i+1)`; the `else` handle is implicit and always last.
  Never author an `else` block. At run time the first matching block wins.
- Gate a node by wiring a branch handle into that node's own `conditional` input: `source` the gated
  node, `sourceHandle: "<id>-source-conditional"` (label "Is Active", type `conditional`), `target`
  the `ifElse`, `targetHandle` `<ifElseId>-target-if1` (or `-else`). The `ifElse` reads its
  condition field through one edge into `<ifElseId>-source-input`. On the branch not taken, only
  that directly gated node is `skipped`. A node reading it through an ordinary edge is not gated: it
  stays `pending` and the workflow job never completes, though the other branch's image is
  delivered. So gate the node that does the work (the builder or the model), never a text node in
  front of it.
- Merge branches by wiring each branch's output into the same input of one downstream node: publish
  compiles that into an input taking whichever branch ran (`ref: {"conditional": [...]}` in the
  flow). Validated live at authoring time: two gated `transformText` builders merged into one
  model's `prompt` gave the right prompt on each branch, and the job completed.
- For prompt text that varies with an input, a CEL ternary in one `transformText` needs no `ifElse`:
  `trim(text2_output) == 'Stormreach' ? text1_output + ', muted palette' : text1_output`, with both
  text nodes wired into the builder's one input handle (two edges with
  `sourceHandle: "transform1-source-input"`, each naming its text node's output as `targetHandle`).
  Also validated live. What never works is one shared builder that names an optional text node
  behind a branch: the template reads every node it names whichever branch fired, so the text lands
  every time.

## forEach loops

`forEach` iterates its list input over the loop body. In the editor the end node is auto-created;
when authoring `editor_info` directly you must include BOTH nodes: the `forEach` and a `forEachEnd`
whose `data.parentNodeId` is the `forEach` node's id. The loop body's terminal output feeds the end
node, and downstream consumers read from the end node's outputs. `isConcurrentRuns: true`
parallelizes iterations and is ignored on nested loops. Loop wiring has more moving parts than any
other construct: clone a working example (see template cloning below) rather than hand-authoring
your first one. Keyword `search` rarely surfaces a public graph that contains a loop, so the handles
a validated run used are listed here: the list feeds the `forEach` through `<forEachId>-input-0` and
the body reads the current item from `<forEachId>-output-0`; the body's last node feeds
`<forEachEndId>-source-results`; and one structural edge links the pair, `source` the `forEach`,
`sourceHandle: "forEachEnd-source"`, `target` the `forEachEnd`, `targetHandle: "forEachEnd-target"`,
with `data.isForEachEndEdge: true`. Edge direction for the data edges follows the rule above.

## Approval gates

An `approval` node has ONE input handle (type `approval`) and NO outputs. It attaches to the
dedicated approval OUTPUT handle that producer nodes expose (`model`, `llm`, `transformText`,
`splitText`, `groupItems`, `sliceAssets`, `ifElse`, `forEachEnd`). Downstream nodes still wire to
the producer's regular output handles; the gate only pauses them. Routing data through an approval
node is structurally wrong and will not compile. At run time the run reply and the job record carry
`metadata.flow` with a per-node `status`; the gate shows as a pending `user-approval` entry there,
and `workflow_approve` / `workflow_reject` (with `workflow_id`, `workflow_job_id`, `node_id`)
resolve it; reject cancels the workflow or the containing loop iteration.

## Create, update, publish

- `workflow_create` params: `name` (required), `description`, `editor_info`, `inputs_definition`,
  `flow`. Author `editor_info` + `inputs_definition` only. `editor_info` is validated before any
  network call; unknown node types and missing `nodes` / `edges` are refused with nothing created.
- Creation is two calls under the hood (a create for `name` + `description`, then an update with the
  content) and is not atomic: if the second step fails you have an orphan draft, and the error
  carries its id. Recover with `workflow_update` on that id, or `workflow_delete`; re-running
  `workflow_create` duplicates.
- Create and update persist a DRAFT. Only `workflow_publish` compiles `editor_info` into `flow` and
  flips status to `ready`; a draft run returns "Workflow is not ready". Publish is user-consent
  territory: ask before publishing.
- Updating `editor_info` on an already `ready` workflow leaves it running the STALE previously
  compiled flow until you publish again; the response's publish hint is the only signal.
- Unpublish (reverting a ready app to draft) is a webapp action: the underlying API accepts a
  `status` field, but the MCP `workflow_update` tool does not expose one. Through MCP, fix a bad app
  by editing `editor_info` and publishing over the top.
- `workflow_update` includes `name` only when non-empty (renaming to `""` silently no-ops);
  `description: ""` does clear.
- Statuses are exactly `draft`, `ready`, `deleted`. "Has an app" really means `flow` is non-empty.
- `workflow_copy` (param `source_workflow_id`) copies `flow`, `inputs`, and `editorInfo` verbatim,
  skipping validation: a corrupted source copies corrupted, inherited model ids stay as-is, and a
  copied draft still needs publish.

## Import and export

A webapp export file is
`{"version": "1.0", "name", "description", "editorInfo": {...}, "inputs": [...], "tagSet": [...]}`.
Importing one through MCP is two calls: `workflow_create` mapping `editorInfo` to `editor_info` and
`inputs` to `inputs_definition`, then `workflow_publish` on the returned id. Exports drop node
groups and asset values (assets must be re-added), and an export that used exposed model-input nodes
fails validation on import.

## Choosing nodes

- Deliverables are model nodes: a brief asking for N distinct outputs gets N model nodes.
- `llm` nodes are the top authoring failure mode. Default to none. Legitimate only when the user
  asked for LLM writing (captioning, rewriting, prompt variations), when fanning one brief into N
  different prompts via `forEach`, or when text must be computed at run time from an upstream asset;
  "refine the prompt" is not a reason. N samples of ONE prompt is one model node with its
  output-count parameter (name varies per model: `samples`, `nbImages`, `count`; check the schema),
  never an `llm` or `forEach` fan-out.
- Composing a prompt from several outputs is `transformText`, not `llm`.
- Tool-style models (upscale, remove background) define BOTH input and output handles, so pick the
  model before wiring. Studio-style composition models are fixed to their built-in model.

## Layout

`position: {x, y}` is metadata but keeps the canvas usable: nodes are about 340px wide, so chain
left to right in x steps of about 400 and stack independent nodes in y steps of about 260, starting
at `(0, 0)`.

## Minimal working example

This exact payload was validated live at authoring time with a real `modelId` substituted: create
returned a draft with `_publishHint`, publish compiled the edge into
`{"name": "prompt", "ref": {"node": "workflow", "name": "text1"}}` on the model's flow node and
flipped status to `ready`, and a dry run returned `{"creativeUnitsCost": ..., "job": {}}`. One
pinned text input feeding one pinned image model:

```json
{
  "name": "prompt-to-image",
  "description": "Minimal text to image app",
  "editor_info": {
    "nodes": [
      {
        "id": "text1",
        "type": "text",
        "position": { "x": 0, "y": 0 },
        "data": {
          "title": "Prompt",
          "value": "A red fox in the snow",
          "isInput": true,
          "outputHandles": [
            {
              "id": "text1-target-output",
              "name": "output",
              "label": "Output",
              "type": "text"
            }
          ]
        }
      },
      {
        "id": "model1",
        "type": "model",
        "position": { "x": 400, "y": 0 },
        "data": {
          "title": "Image generator",
          "modelId": "<discover via search, never hardcode>",
          "isOutput": true,
          "form": {},
          "inputHandles": [
            {
              "id": "model1-source-prompt",
              "name": "prompt",
              "label": "Prompt",
              "type": "prompt"
            }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "edge1",
        "source": "model1",
        "sourceHandle": "model1-source-prompt",
        "target": "text1",
        "targetHandle": "text1-target-output"
      }
    ],
    "inputKeys": ["text1"]
  },
  "inputs_definition": [
    {
      "type": "string",
      "name": "text1",
      "label": "Prompt",
      "required": { "always": true },
      "prompt": true,
      "default": "A red fox in the snow"
    }
  ]
}
```

After `workflow_create` returns the id: `workflow_publish`, then `workflow_run` with `dry_run: true`
and `inputs: {"text1": "..."}` to price and validate, then run for real: the reply carries a job for
`jobs_wait` (re-call with `pending_job_ids`), as after `model_run`. To check what a run actually
sent, read the workflow job's `metadata.flow` (in the run reply, or `job_get` with `verbose: true`):
each node's `status` (`success`, `skipped`, `pending`), a transform node's `output` text, and a
model node's child `jobId`, whose verbose record holds the prompt in `metadata.input.prompt`. The
asset's `metadata.prompt` is not the text.

## Template cloning

Before authoring a first graph of any new shape, `workflow_get` a working workflow of a similar
shape and copy its structure: node types, edge topology, handle id patterns, pin placement. Never
reuse its node ids, asset ids, or model ids as constants. Prefer recently updated workflows as
templates: the editor silently migrates older persisted shapes on load (renamed types, injected
handles), but the API returns them raw, so an old workflow can teach you a grammar the validator no
longer accepts.
