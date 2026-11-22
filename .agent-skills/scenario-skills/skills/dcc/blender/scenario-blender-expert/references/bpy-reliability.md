# bpy reliability for agents (Blender 5.2)

Distilled from Sybren Stuvel (Blender core developer: BCON25 "import bpy", Scripting for Artists 6
and 8), CG Python (Victor: geometry nodes, materials, BMesh, command line), Mike Shah (BCON23),
Vincent Dorenkamp (BCON24) and the official API gotchas pages, with every item re-tested headless in
Blender 5.2.1 (test scripts: `archive/tests/python_bpy/` in the build project). Load this before
writing any non-trivial bpy script, and run the checklist before and after.

## bpy reliability checklist (compact)

Run through this before and after every generated script. Items are verified in 5.2.1 unless marked.

**Launch**

- [ ] `blender -b [file.blend] --factory-startup --python-exit-code 1 -P script.py -- <args>`; parse
      `sys.argv` after `--`.
- [ ] Render flags ordered: file, `-P`, `-E`, `-o`, `-F`, then `-f N` / `-a` last.
- [ ] Wrap the body in a `main()`; let exceptions propagate (exit code 1), print a final
      machine-readable `RESULT ...` line.

**Context and operators**

- [ ] Prefer data API; before an unavoidable operator, `bpy.ops.cat.op.poll()`; if False,
      `with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):`;
      debug with `.logging_set(True)`.
- [ ] Never assign `bpy.context.*`; set `view_layer.objects.active = ob`, `ob.select_set(True)`.
- [ ] No `view3d.*`, timers, modal operators or undo in `-b` runs.
- [ ] Functions that receive `context` use it, not `bpy.context`.

**References and names**

- [ ] Keep objects returned by `new()`; never re-fetch by requested name; check `.name` if you need
      it.
- [ ] Re-fetch references after `mode_set`, after bulk adds to a collection or mesh, after undo,
      after `remove()`.
- [ ] Iterate over `[:]` copies whenever the loop renames, links, unlinks, removes or toggles
      `hide_*`.
- [ ] Tag owned data (`ob["agent_task"] = 1` or one owned collection) so reruns find it.

**Mesh and BMesh**

- [ ] Build meshes with `from_pydata(verts, [], faces)` then `validate()`; or bmesh then
      `to_mesh()` + `free()`.
- [ ] BMesh: `ensure_lookup_table()` before indexing, `index_update()` after adding,
      `normal_update()` after manual moves; Edit Mode uses `from_edit_mesh` / `update_edit_mesh`.
- [ ] Reading mesh data while the object is in Edit Mode: `obj.update_from_editmode()` first.
- [ ] Guard every topology walk with a step cap.

**Evaluation and transforms**

- [ ] After changing transforms, parents, constraints or drivers: `view_layer.update()` before
      reading `matrix_world`.
- [ ] Measure final geometry via `evaluated_get(evaluated_depsgraph_get())`; always
      `to_mesh_clear()`.
- [ ] Copy mathutils values you want to keep (`.copy()`).
- [ ] World-space bounds: `[ob.matrix_world @ Vector(c) for c in ob_eval.bound_box]`.

**Materials and nodes**

- [ ] `materials.get(name) or materials.new(name)`; do not set `use_nodes`.
- [ ] 4.0+ Principled names (`Specular IOR Level`, `Emission Color` + `Emission Strength` > 0,
      `Coat Weight`, `Transmission Weight`, `Subsurface Weight`).
- [ ] Data images `Non-Color` (set before writing pixels); never `Linear` or `Raw`.
- [ ] Node trees from `node_groups.new(...)` with `interface.new_socket`; check
      `all(l.is_valid for l in tree.links)`.
- [ ] GN inputs: `mod.properties.inputs.<identifier>.value`, identifier found by name.

**Collections and persistence**

- [ ] New collection linked with `parent.children.link(c)` (guard against double link); objects
      linked into a collection that is in the view layer.
- [ ] Every datablock that must persist has users or `use_fake_user = True`.
- [ ] Save with an absolute path; reopen and assert counts when the output matters.
- [ ] After a rerun: `bpy.data.orphans_purge(do_recursive=True)` removes nothing new, and no owned
      name has a `.001` twin.

**Performance**

- [ ] No `bpy.ops` inside loops over many items; `foreach_get/set` with float32 numpy on
      `mesh.attributes[...]`.
- [ ] Share meshes (`objects.new(name, mesh)`) when instances are acceptable; `mesh.copy()` only
      when geometry differs.

**5.x traps**

- [ ] No context dicts to operators; no `action.fcurves` (channelbags via `bpy_extras.anim_utils`);
      engine id `BLENDER_EEVEE`; `scene.compositing_node_group`; `image_settings.media_type` before
      `file_format`; brush assets; `bpy.props` not readable via `ob[...]`.

## Why each rule exists (ranked, with sources)

1. **Operators take no data arguments, return only a status and fail on poll; the data API does
   not.** Put work in functions, use operators only where no data API exists. Sybren
   `GP53gDHGiIQ [00:41:49]`; docs `info_gotchas_operators`. Measured: 600 `primitive_monkey_add` =
   4.16 s vs 600 `objects.new` + link = 0.015 s; each add op costs about 7 ms in a 600-object scene
   [verified, t2/t3].
2. **Python references to Blender data die when their container changes, on mode switches and on
   undo.** Re-fetch after `mode_set`, after adding many items to a collection property or mesh
   array, after any undo; store names or indices across steps, not objects. docs
   `info_gotchas_crashes` (Edit-Mode memory access, array re-allocation, undo invalidates all IDs);
   Sybren `GP53gDHGiIQ [00:26:34]`.
3. **Renaming inside `for o in bpy.data.objects` re-sorts the collection:** some items visited
   twice, some skipped. In 5.2.1 a "z" prefix loop never finished on its own (capped at 31 visits
   for 5 objects); iterate `bpy.data.objects[:]`. Sybren `GP53gDHGiIQ [00:27:47]` [verified, t3].
4. **The name you request is not the name you get** (`demo` exists: you get `demo.001`; names cap at
   255 bytes; library data can duplicate names). Keep the returned object; use
   `bpy.data.objects[name, None]` to force local data. Sybren `opZy2OJp8co [00:05:51]`,
   `GP53gDHGiIQ [00:29:28]`; docs internal data [verified, t2].
5. **Name lookups of auto-created data break on rerun:** `bpy.data.node_groups["Geometry Nodes"]`
   returns the first group while `new_geometry_nodes_modifier()` just made `Geometry Nodes.001`.
   Take `obj.modifiers[-1].node_group` or create trees with `bpy.data.node_groups.new`. Victor
   `Is8Qu7onvzM [00:02:50]` [verified, t3].
6. **`matrix_world` and every dependent value are stale until `view_layer.update()`** (child of a
   moved parent read x = 0.0, then 5.0 after update; a new object reads identity). docs internal
   data "Stale Data" [verified, t1].
7. **Edit Mode keeps its own copy of the mesh:** `obj.data` is out of sync until leaving Edit Mode
   or `obj.update_from_editmode()` (8 vs 26 vertices in the test). docs `info_gotchas_meshes`;
   Mike's brittle selection `wWTAQP7-ZUQ [00:47:30]` [verified, t1].
8. **`obj.data` ignores modifiers;** measure what renders through
   `obj.evaluated_get(context.evaluated_depsgraph_get())` and `to_mesh()` / `to_mesh_clear()`, or
   `new_from_object` for a persistent copy (0 users, link or it is lost).
   `evaluated_depsgraph_get()` re-evaluated after a modifier change without extra calls. Mike's
   vertex-based bounding box `wWTAQP7-ZUQ [00:30:27]` [verified, t1].
9. **Bulk data goes through `foreach_get/foreach_set` with float32 numpy arrays, preferably on the
   attribute API.** 491,401 vertices: Python loop 105 ms, `vertices.foreach_get("co")` 7.2 ms,
   `attributes["position"].data.foreach_get("vector")` 0.1 ms; float64 arrays cost about 20 ms
   (conversion); wrong array size raises `RuntimeError`. Sybren's lookup-cost remark
   `GP53gDHGiIQ [00:14:02]`; docs best practice [verified, t3].
10. **BMesh loops are face corners:** per-corner data (UVs, corner colors) is read and written
    through `loop[layer]`; walk topology with `link_loop_next` (same face) and
    `link_loop_radial_next` (across the edge); per-vertex values on corner storage need a cache by
    `loop.vert.index`. Victor `aSkgwf0SX_k [00:00:32]`, `[00:08:12]`, `[00:25:51]` [verified loop
    facts, t2].
11. **BMesh housekeeping:** `ensure_lookup_table()` before any `seq[i]` (even right after
    `bmesh.ops.create_cube`), `index_update()` after adding (new elements have index -1),
    `normal_update()` after moving vertices by hand, `update_edit_mesh` in Edit Mode vs `to_mesh` +
    `free` in Object Mode, guard topology walks with a step cap. Victor shows `ensure_lookup_table`
    and the unguarded walk (`aSkgwf0SX_k [00:01:37]`, `[00:09:21]`); `index_update`, `normal_update`
    and the step cap are additions found in testing [verified, t2/t5b].
12. **Background mode has a window but no area and no event loop:** `view3d.*` operators fail poll,
    `bpy.app.timers` never fire, modal operators cannot run, `ed.undo` fails poll. Sybren's
    timer/modal advice (slides "Warning") applies to live sessions only [verified, t1].
13. **Discover which context an operator needs with `temp_override(...).logging_set(True)`** (5.0):
    `object.modifier_apply` logged reads of `object`, `scene`, `window`, `screen`, `area`, `region`,
    `edit_object`, so overriding `object` was enough. Old positional context dicts raise
    `ValueError: 1-2 args execution context is supported`. deltas section 2 [verified, t1]. Check
    first with `bpy.ops.x.y.poll()` (docs quickstart).
14. **Command-line arguments execute left to right:** `-o`/`-F`/`-E` must precede `-f`/`-a` (a later
    `-o` is ignored for that render); a `--python-expr` after `-f` runs after the render; script
    args go after `--`. Victor `JJ54OfiWlf8 [00:04:26]`, `[00:05:32]` [verified, cli].
15. **A failing script still exits 0** unless `--python-exit-code N`; `argparse` errors exit Blender
    with code 2 (the docs warn `sys.exit` looks like a crash). Always pass `--factory-startup` (user
    add-ons loaded on this machine and made network calls). Victor `JJ54OfiWlf8 [00:23:24]`
    [verified, cli].
16. **Datablocks with 0 users are not saved** (a new mesh or collection never linked vanished after
    save and reload; a fake-user material survived). New collections have 0 users until
    `children.link`. Victor's orphan discussion `TdBYf8orLA4 [00:07:13]`; Sybren
    `opZy2OJp8co [00:06:25]` [verified, t3/t4].
17. **Objects must be in a collection of the active view layer** to be selected, made active or
    rendered: `select_set` on an unlinked object raises `RuntimeError ... not in View Layer`;
    `layer_collection.exclude = True` removes objects from `view_layer.objects`. Sybren
    `opZy2OJp8co [00:07:33]` [verified, t3].
18. **Three visibility levels:** `collection.hide_viewport/hide_render/hide_select` (global),
    `view_layer.layer_collection...exclude` and `.hide_viewport` (per view layer), `obj.hide_set()`
    (per view layer, what `hide_get()` reads) vs `obj.hide_viewport` (global). `visible_get()` is
    the combined answer. Sybren `opZy2OJp8co [00:14:50]`, `GP53gDHGiIQ [00:17:30]` [verified,
    t2/t3].
19. **The Info log records how the UI did it, not what you want:** deltas instead of values, every
    default argument, UI-context operators. Use it to find API names, then rewrite as assignments.
    Sybren `GP53gDHGiIQ [00:09:33]`. In a headless run `bpy.app.debug_wm = True` prints each
    operator call (docs tips) [verified].
20. **Socket keys match the UI name or the identifier; on multi-type nodes use identifiers.** Noise
    "Factor" has identifier "Fac" (both work); `ShaderNodeMix` has four sockets named "A"
    (`A_Float`, `A_Vector`, `A_Color`, `A_Rotation`). GN modifier inputs in 5.2:
    `mod.properties.inputs.<identifier>.value`, identifiers looked up by name, never hard-coded;
    `mod["Socket_2"] = x` raises `TypeError`. Victor `Is8Qu7onvzM [00:19:35]` [verified, t3/t5].
21. **Operator design for live tools:** function + thin operator,
    `bl_options = {'REGISTER', 'UNDO'}` (redo = undo + re-execute), hard `min` vs `soft_max`,
    distinct defaults per axis, `poll()` with `poll_message_set()`; the redo panel only exists in
    editors that have one (3D Viewport, not Properties). Sybren `xscQ9tcN4GI [00:08:18]`,
    `[00:12:16]`, `[00:15:08]`; `GP53gDHGiIQ [00:43:32]`, `[01:00:41]`. From Python, `soft_max` is
    not enforced and `min` clamps silently [verified, t5].
22. **Custom vs RNA properties, 5.0 split:** `bpy.props` properties are attribute-only;
    `ob.get("my_weight")` returns `None` in 5.2.1. Custom props accept only int, float, string,
    arrays and string-keyed dicts (docs quickstart, 1024 nesting limit). Sybren
    `GP53gDHGiIQ [00:56:48]` [verified, t2].
23. **mathutils values are live references:** `start = obj.location` changes when the object moves;
    use `.copy()`. Assigning `matrix_world` updates `location` immediately. docs quickstart
    "Mathutils Types" [verified, t5].
24. **Bake Python results into vanilla data** (attributes, float EXR images) that nodes read
    natively, so the file works without the script. When saving a float data image, set
    `colorspace_settings.name = "Non-Color"` before writing pixels: otherwise `img.save()` wrote
    sRGB-encoded values (a stored -1.0 read back as -12.92 under Non-Color). Vincent
    `BOwnejd1LSY [00:16:34]`, `[00:19:23]` [verified, t6/t6c].
25. **No `bpy` from Python threads;** threads must finish before the script returns. For parallel or
    heavy work run separate processes (Blender's bundled Python or more `blender -b`). Sybren
    `GP53gDHGiIQ [01:20:59]`; docs `info_gotchas_threading`.
26. **Relative `//` paths need a saved blend and a library argument:** in an unsaved file
    `bpy.path.abspath("//tex.png")` returned `tex.png`; for linked data use
    `bpy.path.abspath(path, library=id.library)`; blend strings must be UTF-8. docs
    `info_gotchas_file_paths_and_encoding` [verified abspath, unsaved case].
27. **Module reload in a live session:** `import` does not re-read a changed file; use
    `importlib.reload(mod)` (and reload submodules explicitly, reassigning the name). Sybren
    `GP53gDHGiIQ [01:08:40]`, `[01:12:02]`; docs tips "Executing Modules".
28. **Check your algorithm against Blender's own answer** (bounds, normals, convex hull) before
    trusting it. Mike `wWTAQP7-ZUQ [00:04:48]`, `[00:25:34]`.

## Procedures (all ran in 5.2.1 unless marked)

All code below ran in 5.2.1 unless marked [verify].

**P1. Headless job skeleton (idempotent)** [verified, `t7_idempotent_skeleton.py`, three runs on the
same file]

1. Parse args after `--`; `scene = bpy.context.scene`.
2. `coll = bpy.data.collections.get(NAME) or bpy.data.collections.new(NAME)`;
   `if coll.name not in scene.collection.children: scene.collection.children.link(coll)`.
3. Remove previously owned objects: `objs = [o for o in coll.all_objects if o.get(TAG)]`;
   `bpy.data.batch_remove(objs)`; then remove their now 0-user meshes with `batch_remove`.
4. Get-or-create shared resources (`materials.get(name) or materials.new(name)`).
5. Create geometry with bmesh or `from_pydata`; create objects with
   `bpy.data.objects.new(name, mesh)`, tag `o[TAG] = 1`, link to `coll`.
6. `bpy.context.view_layer.update()`; run code checks (asserts);
   `bpy.ops.wm.save_as_mainfile(filepath=abs_path)`.

**P2. Call an operator that has no data equivalent**

1. `op = bpy.ops.object.modifier_apply`; if `op.poll()` is False, open
   `with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]) as o:`;
   optionally `o.logging_set(True)` to see members read; call `op(modifier=name)` [verified].
2. Mode-dependent operators: `view_layer.objects.active = ob`,
   `bpy.ops.object.mode_set(mode='EDIT')`, run, `mode_set(mode='OBJECT')`, then re-fetch `ob.data`
   sub-references [verified].
3. Anything needing `area.type == 'VIEW_3D'` cannot run headless: find the data API or bmesh
   equivalent, or run in a GUI session [verified poll failure].

**P3. Mesh from numpy, fast edit**

1. `me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate()` [verified].
2. Edit positions:
   `co = np.empty(n*3, np.float32); me.attributes["position"].data.foreach_get("vector", co)`;
   modify; `foreach_set("vector", co)`; `me.update()` (the depsgraph picked up the change even
   without `update()` in 5.2.1, but keep it after structural edits) [verified].
3. Custom per-point data:
   `me.attributes.new("name", 'FLOAT_VECTOR', 'POINT').data.foreach_set("vector", arr)` [verified].

**P4. BMesh edit**

1. Object Mode: `bm = bmesh.new(); bm.from_mesh(me)`; edit; `bm.normal_update()`;
   `bm.to_mesh(me); bm.free()`.
2. Edit Mode: `bm = bmesh.from_edit_mesh(me)`; edit; `bmesh.update_edit_mesh(me)`; do not free.
3. Before `bm.verts[i]`: `bm.verts.ensure_lookup_table()`; after adding: `index_update()`
   [verified].
4. Corner data: `uv = bm.loops.layers.uv.active` (or `.verify()`),
   `col = bm.loops.layers.color.new(name)` (BYTE_COLOR, CORNER) [verified]; per-vertex color:
   `bm.verts.layers.float_color.new(name)` (FLOAT_COLOR, POINT) [verified].

**P5. Material builder**

1. `mat = bpy.data.materials.get(n) or bpy.data.materials.new(n)`; `nt = mat.node_tree`;
   `bsdf = next(x for x in nt.nodes if x.bl_idname == "ShaderNodeBsdfPrincipled")` [verified].
2. Set inputs by name; add nodes with `nt.nodes.new("ShaderNodeTexNoise")` etc.;
   `nt.links.new(a.outputs["Fac"], b.inputs["Fac"])` [verified].
3. Image textures: `img.colorspace_settings.name = "Non-Color"` for data [verified].
4. Assign: `ob.data.materials.append(mat)` (shared by linked duplicates) or per-object slot link
   [verified append].

**P6. Geometry-nodes builder** [verified, t3]

1. `ng = bpy.data.node_groups.new(name, "GeometryNodeTree")`;
   `ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")` and
   the output; extra inputs with `default_value`.
2. `NodeGroupInput`, `NodeGroupOutput`, then `GeometryNode*` nodes; link by socket name; set
   `location` 250 to 300 units apart.
3. `mod = ob.modifiers.new("GN", "NODES"); mod.node_group = ng`; set inputs through
   `mod.properties.inputs.<identifier>.value`.
4. Verify: links valid, evaluated face count as expected.

**P7. Evaluate and measure**

1. `dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); m = ev.to_mesh()`; read
   with `foreach_get`; `ev.to_mesh_clear()` [verified].
2. Animated: loop `scene.frame_set(f)` then step 1 [verified in t6].
3. Persistent copy: `bpy.data.meshes.new_from_object(ev)` then link it to an object [verified 0
   users until used].

**P8. Batch CLI render**
`blender -b scene.blend --factory-startup --python-exit-code 1 -P setup.py -E CYCLES -o /abs/out/frame_#### -F PNG -f 10`
(or `-s 1 -e 100 -a`) [ordering verified with Workbench].

**P9. Bake to vanilla data (EXR)** [verified round trip, t6/t6c]

1. `img = bpy.data.images.new(name, width=w, height=h, alpha=True, float_buffer=True)`;
   `img.colorspace_settings.name = "Non-Color"` first.
2. `img.pixels.foreach_set(rgba_float32.ravel())`;
   `img.filepath_raw = abs_path; img.file_format = 'OPEN_EXR'; img.save()`.
3. Reload with `bpy.data.images.load(abs_path, check_existing=False)`, set `Non-Color`, compare with
   numpy.

## GUI habits and their agent substitutes

| GUI technique (video)                                     | Substitute for an agent                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover tooltips, Copy Data Path (`GP53gDHGiIQ [00:03:25]`) | `bpy.types.X.bl_rna.properties[...]` (name, description, enum items); API reference pages [verified]                                                                                                                            |
| Ctrl+C on a menu item, Tab for parameters (`[00:07:51]`)  | `repr(bpy.ops.mesh.primitive_ico_sphere_add)` prints the call with defaults; `op.get_rna_type().properties` lists parameters [verified]                                                                                         |
| Info editor log (`[00:09:33]`, `Is8Qu7onvzM [00:01:57]`)  | `bpy.app.debug_wm = True` prints each operator call to stdout, also in background [verified]                                                                                                                                    |
| Edit Source on a UI element (`[00:57:57]`)                | Read `/Applications/Blender.app/Contents/Resources/5.2/scripts/startup/bl_ui/*.py` and `bl_operators/*.py` directly                                                                                                             |
| Redo panel tweaks (`xscQ9tcN4GI [00:08:18]`)              | Rerun the idempotent script with new arguments (no undo in background)                                                                                                                                                          |
| F3 search for operators                                   | `hasattr(bpy.ops.object, "monkey_grid")`, `dir(bpy.ops.mesh)`                                                                                                                                                                   |
| VS Code breakpoints (`GP53gDHGiIQ [00:50:10]`)            | Prints, asserts, `faulthandler.enable()` for crash lines (docs crashes); `code.interact` only in an interactive terminal                                                                                                        |
| Alt+click edge loop (`aSkgwf0SX_k [00:03:17]`)            | `bpy.ops.mesh.select_edge_loop_multi()` (ring: `select_edge_ring_multi`) in Edit Mode on selected edges, works headless; the old name `loop_multi_select` does not exist in 5.2.1 [verified]; or the bmesh walk with a step cap |
| Visual check in Outliner / viewport                       | Assert on `coll.objects`, `users_collection`, `visible_get()`, evaluated counts; render a still for appearance                                                                                                                  |
| Vertex Paint view of colors (`aSkgwf0SX_k [00:24:46]`)    | Read `mesh.color_attributes[name].data.foreach_get("color", arr)`; render with the attribute as emission                                                                                                                        |
| Window > Toggle System Console                            | Run from a terminal; capture stdout/stderr of the `blender -b` process                                                                                                                                                          |

## Quality gates for generated scripts

### Measurable in code

- [ ] Script exit code 0 and a final result line; no `Traceback` in the log.
- [ ] Owned objects: expected count, names without unexpected `.00N` suffixes, all in
      `view_layer.objects`, all with the ownership tag.
- [ ] Owned datablocks: `users > 0` or fake user; `bpy.data.orphans_purge()` after a rerun returns 0
      (or the same number as a clean run).
- [ ] Generated meshes: `mesh.validate(verbose=False)` returns False (nothing to fix); no zero-area
      faces if relevant; expected vertex/face counts.
- [ ] Evaluated geometry: counts and bounds (from `evaluated_get`) within expected ranges; modifiers
      present in the intended order.
- [ ] Transforms: `view_layer.update()` then `matrix_world` positions match intent within 1e-5.
- [ ] Node trees: all links valid, required nodes present by `bl_idname`, output connected, GN
      modifier inputs hold the intended values.
- [ ] Materials: required sockets exist by name, values as intended (e.g., `Emission Strength > 0`
      when emission is wanted), slot link (`DATA`/`OBJECT`) as intended.
- [ ] Images: data maps `colorspace_settings.is_data == True`; baked textures reload with max error
      below tolerance.
- [ ] Idempotence: run the script twice on the same file; object, mesh, material and node-group
      counts identical after both runs (the skeleton `t7_idempotent_skeleton.py` passes this).
- [ ] Performance: wall time per stage printed; flag any loop calling `bpy.ops` more than ~50 times.
- [ ] Saved file reopens (`wm.open_mainfile`) and the checks above still pass.

### Needs a render and visual judgment

- [ ] Materials read as intended under known light (metals need an environment; a black metal render
      is usually missing lighting, not a bad material).
- [ ] Geometry-node results look plausible (shape, density, no z-fighting between split faces);
      compare with a reference image.
- [ ] Baked vertex-animation or attribute-driven motion plays correctly (render 3 frames at start,
      middle, end).
- [ ] UV and corner-color writes: render with a checker or the color attribute as emission to see
      seams or faceting.
- [ ] Generated node trees intended for humans are legible (needs a GUI session; background mode
      cannot screenshot editors).
