# GUI paths (Maya 2027): menus, editors, brushes, hotkeys

For a computer-use agent, or to tell Emmanuel what to click. Recipes no longer need a click: the
bridge reads each menu item's and button's command string (procedures.md P0). Sources: Maya 2027
help, XGen Interactive Grooming (tools, modifiers, caching, hotkeys); the expert notes for workflow
tips. On macOS the help's "Ctrl" means Control, not Command (maya-version-deltas § 2.13).

## Workspace and editors

| Action                                     | Path                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groom workspace                            | Windows > XGen- Interactive Groom                                                                                                                                     |
| Interactive Groom Editor                   | Generate > XGen Groom Editors > Interactive Groom Editor (Giovannini's wording; the workspace docks it)                                                               |
| Recipes by query (no click)                | through the bridge: `G.menu_items()`, `G.menu_recipe(name)` (`cmds.menuItem(item, q=True, command=True)`), `G.button_recipe(name, node)` for Attribute Editor buttons |
| Script Editor echo (fallback only)         | Script Editor > History > Echo All Commands, then one click                                                                                                           |
| Viewport anti-aliasing before judging hair | Viewport 2.0 settings: Multisample Anti-aliasing on (FlippedNormals [00:13:07]; Fernandez 02 [00:04:03])                                                              |
| Arnold render of hair                      | Arnold > Arnold RenderView (Maya IPR does not work with MtoA 5+)                                                                                                      |
| Heads Up Display distance for DOF          | Display > Heads Up Display > Object Details (Schneider [00:40:33])                                                                                                    |

## Creating and binding

| Action                                    | Path                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a description                      | select the scalp mesh or faces; Generate > Create Interactive Groom Splines > option box (Density, Length, Width, CV Count) > Create; or the XGen shelf icon                                                                                                                                                                 |
| Replace bound faces                       | select faces; MEL `xgmSplineSelect -replaceBySelectedFaces`                                                                                                                                                                                                                                                                  |
| Convert legacy to IG                      | select one legacy description in the Outliner; Generate > Convert to Interactive Groom; G repeats the last command (Giovannini [00:13:46])                                                                                                                                                                                   |
| Rebuild CVs                               | description_base > CV Settings > CV Count, then Rebuild                                                                                                                                                                                                                                                                      |
| Guides from curves into an IG description | Interactive Groom Editor: select the description > Add Modifier > Guide (goes low in the stack, above Scale); select the Guide's inGuide > Add Modifier > Curve to Spline with the guide curves selected [verify the selection route]. Not Curve to Spline on the description: one hair per curve, everything below disabled |
| Guides from curves (legacy utility)       | XGen Editor > Utilities > Guides to Curves > Create Curves                                                                                                                                                                                                                                                                   |

## Modifiers (Interactive Groom Editor)

| Action                       | Path                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a modifier (goes on top) | select the description > Add Modifier > Noise, Clump, Cut, Scale, Guide, Linear Wire, Curve to Spline, Collision, Displacement, Sculpt, Spline Cache                                       |
| Reorder                      | select the modifier, up or down arrow icons, or drag                                                                                                                                       |
| Duplicate (secondary clump)  | right-click the modifier > Duplicate, or Edit > Duplicate                                                                                                                                  |
| Disable / enable             | the eye icon left of the modifier                                                                                                                                                          |
| Node Editor route            | Tab, type `xgmModifierNoise`; connect In Spline Data and Out Spline Data to the neighbors; bottom: from `description_base` Out Spline Data; top: into `descriptionShape` Input Spline Data |
| Mask from a texture          | the map icon beside the attribute > browse to the file, or paint (Create Map)                                                                                                              |
| Expression on an attribute   | the map icon beside the attribute > Create Render Node > Maya > Utilities > Xgm Se Expr; type e.g. `rand(1,-1)` or Open SeExpr Editor                                                      |
| Secondary clump control      | Clump > Clump Map: Use Control Map on, Control Using = primary Clump modifier (or a region map)                                                                                            |
| Part with a region map       | Guide modifier: region map (map icon, paint or a file); then each Clump: Use Control Map, Control Using = that region map (2027 help § Clump Map)                                          |
| Part with Freeze             | Freeze brush (Ctrl+0) along the part line, "also a good way to create a hair part" (2027 help); scripted `xgmSplineSelect -convertToFreeze` on a selection                                 |
| Clump shape tests            | Clump > Clump Effect: Clump (tightness) and the modifier mask, swept separately with a Noise modifier below the Clump (procedures.md P5b)                                                  |
| Jagged or misplaced clumps   | Clump Map > Map Subdivision Level up (every level together); Clump Points > Seed                                                                                                           |
| Regenerate clump points      | Clump Points > Seed                                                                                                                                                                        |
| Collision object             | select the Collision modifier AND the mesh; tear off a copy of the Interactive Groom Editor to keep the modifier selected (Schneider [00:17:10]); Add Selected Objects                     |
| Sculpt layers                | Sculpt modifier > Add Sculpt Layer; pencil icon to edit; weight slider; key icon                                                                                                           |

## Brushes (Generate > Interactive Grooming Tools; XGen shelf)

A groom tool must be active for these hotkeys (2027 help § hotkeys).

| Brush                             | Hotkey                                      | Notes                                                                                                  |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Density                           | Ctrl+1                                      | writes to description_base, not a sculpt layer; respects the Density Mask; Ctrl inverts                |
| Comb                              | Ctrl+2                                      | Collide with Mesh on (Schneider: tolerance about 0.1 [00:08:06]); Symmetry                             |
| Grab                              | Ctrl+3                                      |                                                                                                        |
| Twist                             | Ctrl+5                                      | games: Face Camera off first, Align to Surface on                                                      |
| Smooth                            | Ctrl+6, or hold Shift                       |                                                                                                        |
| Noise                             | Ctrl+7                                      | local noise                                                                                            |
| Clump                             | Ctrl+8                                      | local clumps                                                                                           |
| Part                              | Ctrl+9                                      | skin folds, limb joints                                                                                |
| Freeze                            | Ctrl+0                                      | also a way to make a part; Ctrl+Shift+I Invert Frozen                                                  |
| Length, Cut, Width, Place, Select | tool menu                                   | Width writes per-CV values to the descriptionShape (not layered); placed hairs ignore the Density Mask |
| Size / strength                   | B + drag / M + drag; Ctrl + MMB drag from 0 | N toggles the tool mode                                                                                |
| Tool marking menu                 | Shift + RMB                                 |                                                                                                        |

Remove one rogue stray (Giovannini [00:16:31] to [00:18:14]): Add Modifier > Sculpt > edit, Freeze
that hair, Cut with Invert Frozen from the right-click marking menu.

## Caches

| Action                               | Path                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export a cache (no read node)        | select the description, a mid-stack modifier, or `InGuide_base`; Generate > Cache > Export Cache > option box: Current Frame (or range), Multiple Transforms, Write Final Width   |
| Cache and load it                    | Generate > Cache > Create New Cache (adds a cache read node, disables modifiers below); or Description > Cache in the editor                                                      |
| Play a cache in a description        | Add Modifier > Spline Cache > browse                                                                                                                                              |
| Alembic of selection (Unreal, wires) | Cache > Alembic Cache > Export Selection to Alembic > options: Current Frame or range, Attributes: type `groom_group_id`, Add, and so on; Strip Namespaces, UV Write for geometry |
| Prefix names                         | Modify > Prefix Hierarchy Names (Flood [00:04:26])                                                                                                                                |

## Motion

| Action                       | Path                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Wires                        | Linear Wire modifier > Create; lower the wire Density Multiplier; Place brush with Interpolation On to add wires (Flood [00:01:25]) |
| Dynamics in the groom        | Linear Wire > Input Wire > Make Wires Dynamic > Make Guides Dynamic Options > Apply and Close                                       |
| Reference state              | at the rest frame: Linear Wire > Reference State > Update                                                                           |
| Curve to Spline from a cache | select the inGuide > Add Modifier > Curve to Spline; Align to Normals off; source Cache; browse to the .abc                         |
| Wrap wires to a proxy        | select curves, then the proxy; Deform > Wrap                                                                                        |
| nHair from curves            | nHair > Make Selected Curves Dynamic (curves and the scalp selected)                                                                |
| Sim readability              | hairSystemShape display: self-collision thickness up (Flood [00:18:41])                                                             |

## Legacy XGen (inherited assets)

| Action                    | Path                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Before anything           | File > Set Project; UVs on the mesh; save the scene (FlippedNormals [00:02:34] to [00:03:37])        |
| Clump maps                | Modifiers tab > Clumping > Setup Maps > Generate > Save; Guide option to put clumps on guides        |
| Masks                     | triangle beside Mask > Create Map; 3D Paint; save the texture, then the Ptex icon                    |
| Region map for a part     | Region > Create Map; paint plain colors with a hard falloff; save twice                              |
| Batch render              | Preview/Output > Renderer Arnold; File > Export Patches for Batch Render; Render > Update Full Scene |
| Clump colors while tuning | Clumping modifier > Options > Color Preview                                                          |
