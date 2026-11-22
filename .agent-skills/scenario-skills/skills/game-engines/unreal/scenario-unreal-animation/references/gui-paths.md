# scenario-unreal-animation: GUI paths (for a computer-use agent)

Menu names from the 5.8 docs and expert videos; Mac shortcuts often use Cmd where the docs say Ctrl
[verify]. Unreal 5.8 editors: Skeletal Mesh editor (not "Persona"), Physics Asset editor (not
"PhAT").

## Import

- Content Browser > Import (or drag and drop) > **Interchange Pipeline Configuration** window:
  Choose Pipeline Stack, Basic Layout or Filter on Contents, Preview, Show Conflict, Import.
  Reimport remembers the stack.
- Pipeline stacks: Project Settings > Engine > **Interchange** (Import Content, Import Into Level,
  Editor Interface, Generic). Default pipeline assets: Engine > Plugins > Interchange Framework
  Content > Pipelines (enable Show Engine Content).
- Project-wide import defaults for gameplay clips: put the project's pipeline copy (Do not import
  curves with 0 values, Use 30Hz to Bake Bone Animation or Custom Bone Animation Sample Rate) in the
  Import Content stack; per-property defaults, visibility and read-only can be set in the pipeline
  asset. Legacy importer: config file (procedures P1).
- Extra LODs: Skeletal Mesh editor > LOD Settings > LOD Import.
- Root motion on a clip: Anim Sequence editor > Asset Details > Root Motion (Enable Root Motion,
  Root Motion Root Lock, Force Root Lock). Preview: Character > Animation > Root Motion (Ignore,
  Loop, Loop and Reset); Character > Bones > Bone Drawing > All Hierarchy (root in red).
- Compression: Anim Sequence Asset Details > Compression; settings asset toolbar > **Compress**
  after editing a codec.

## Skeleton and skin

- Skeletal Mesh editor: select a vertex to read its influences; Skin and Mesh tools (Skeletal
  Editor, production ready) with 5.8 weight locks (lock icon per bone), mirror strings, **Bone Count
  Reduction** (removes bones with no skin weights, keeps parents up to root), morph target editing.
- Project Settings > Engine > Rendering: Use Unlimited Bone Influences (threshold), Support 16-Bit
  Bone Index; mesh: Use High Precision Skin Weights.
- Skeleton asset > Retarget Manager area: Compatible Skeletons, translation retargeting modes (5.6:
  inherit from compatible skeleton checkbox).

## IK Rig

- Content Browser > Add > Animation > IK Rig > **IK Rig**. Toolbar **Auto Create Retarget Chains**
  and auto FBIK; Hierarchy: right-click a bone > **Set Pelvis**; select bones > right-click > New
  Retarget Chain; IK Retargeting panel > Add New Chain (+). Drag goals in the viewport to preview
  the solver.

## IK Retargeter

- Content Browser > Add > Animation > IK Rig > **IK Retargeter** (choose the source IK Rig). Or
  right-click any animation > **Retarget Animations** (auto retarget dialog with preview; exported
  retargeters have IK off).
- Layout: **Op Stack** top left, **Asset Browser** bottom left, Details right; toolbar **Run
  Retarget**, Add Default Ops, **Override Sets** and **Variables** buttons.
- Retarget pose: toolbar Edit Retarget Pose > Create (+) > Create (new pose), Edit Mode, Auto Align
  (Align All Bones, Selected, Selected and Children), **Snap Character to Ground**, Import from
  Animation Sequence or Pose Asset, Retarget Pose Blend slider.
- Chain map inside each chain op: Map All (Exact) / Map All (Fuzzy) / Map Only Empty.
- Run IK Rig sub-ops: Blend to Source, Offset Goals, Scale Goals, Floor Constraint (Foot Settings:
  Use Foot, Use Toes), Speed Plant, Stride Warp. Asset Settings: Profile Ops, per-op LOD thresholds,
  Ignore Root Lock in Preview, ExportRootLockMode.
- Op Stack > add op: **Pin Bones** (one row per bone: the IK helper bone to pin and the bone it
  follows, source or target skeleton, Copy Local Position with relative scale for props; field names
  [verify]); **Additive Pose** (pick or author the corrective pose, weight 0 to 1, drag it where it
  acts in the stack).
- Retarget Output Log: Window > Retarget Output Log; swap preview meshes and read it before any
  export.
- Export: Asset Browser > select > **Export Selected Animations** (folder, prefix, suffix, search
  and replace; Override Set to Apply). Output: Window > Retarget Output Log.

## Motion matching and GASP

- Plugins: Edit > Plugins > Animation > Pose Search (and Chooser, Animation Warping, Motion
  Warping), restart.
- Content Browser > Add > Animation > Motion Matching > **Pose Search Schema** / **Pose Search
  Database**. Database editor: Asset List (+), **Asset Browser** panel (drag clips), Selection
  Details, preview; right-click a clip to disable instead of deleting.
- AnimGraph: Motion Matching node (Searchable pin), Pose History (Generate Trajectory), Collected
  Bones; double-click the Motion Matching node for its **blend stack graph** (orientation warping,
  steering).
- Schema editor (after duplicating GASP's): schema skeleton (and its mirror data table) set to the
  target skeleton; each channel's Bone field (Pose channel `foot_l`/`foot_r`, Position and Heading
  channels, group sub-channels) remapped to the target's bones. Pose History node Details: the bones
  it samples (GASP: feet, thighs, spine, pelvis) remapped too.
- Offset Root Bone node Details: translation mode (Interpolate, Release), rotation mode (Accumulate,
  Release), radius, half-life; GASP binds them to functions per movement state
  (Get_OffsetRootTranslationHalfLife and siblings). Steering node: desired facing input, enabled
  only when moving or in air. Order: steering feeds the offset root bone.
- GASP widget > Anim Nodes toggles (Root Offset, Orientation Warping, Leg IK) with their debug
  renders, to judge each layer.
- Motion Matching node Details: Should Filter Notifies, Notify Recency Time Out, Blend Time, Max
  Active Blends, Store Blended Pose, Search Throttle Time, Pose Jump Threshold Time, Pose Reselect
  History.
- Chooser editor: open `CHT_PoseSearchDatabases` (GASP:
  Content/Characters/UEFN_Mannequin/Animations/MotionMatchingData/), add nested choosers and rows.
- Debug: Tools > Debug > **Rewind Debugger** and **Rewind Debugger Details**; options auto-record on
  PIE and auto-eject; pick the character (eyedropper), expand the AnimBP track > Pose Search track;
  Active Pose, Continuing Pose, Pose Candidates, **Channel Breakdown**; Ctrl+A selects all
  candidates. 5.6+: Trajectories dropdown > export for animators (record the tuned capsule first;
  earlier versions: Take Recorder).
- Movement model: character Blueprint > Character Movement component Details: walk speed per gait,
  acceleration, braking deceleration, friction (names [verify]); GASP sets gait speeds in the
  character Blueprint.
- GASP runtime retarget: `ABP_GenericRetarget` > IKRetargeter_Map add `RTG_UEFN_to_{asset}`; child
  Blueprint of `CBP_Sandbox_Character`, hide CharacterMesh, add a child Skeletal Mesh component with
  the retarget AnimBP and Component Tag `RTG_UEFN_to_{asset}`; Game Animation Widget buttons
  (timescale, still camera, database LOD, character override, debug draws).

## Animation Blueprint

- Class Settings: Use Multi Threaded Animation Update, **Warn About Blueprint Usage**
  (Optimization); Compiler Results lists fast path breaks with links.
- Class Defaults: **Root Motion Mode** (No Root Motion Extraction, Ignore Root Motion, Root Motion
  from Everything, Root Motion from Montages Only). Both "from" modes update the AnimGraph on the
  game thread (root motion doc).
- My Blueprint > Functions > Override > **Blueprint Thread Safe Update Animation**; function
  Details > Thread Safe; right-click > Property Access; node Details > Functions > Create Binding
  (On Initial Update, On Become Relevant, On Update); node Performance > LOD Threshold.
- Project Settings > Engine > General Settings > Anim Blueprints: Allow Multi Threaded Animation
  Update, Optimize Anim Blueprint Member Variable Access.
- Linked layers: Add > Animation > Animation Interface; Class Settings > Interfaces.
- Window > Pose Watch Manager.

## Budget and LODs

- Plugins > Animation > Animation Budget Allocator; mesh component Details > Component Class
  **SkeletalMeshComponentBudgeted**, Budgeting: Auto Calculate Significance, Auto Register with
  Budget Allocator; Event Begin Play > Enable Animation Budget.
- Viewport > Stat > Advanced > AnimationBudgetAllocator [verify]; console
  `a.Budget.Debug.Enabled 1`, `a.VisualizeLODs`, `stat anim`, `stat unit`, `stat unitgraph`,
  `showdebug animation`.
- Skeletal Mesh editor > LOD Settings: Number of LODs > Apply Changes; **Generate Asset** (shared
  LOD Settings); per LOD Screen Size, Hysteresis, Bone List (Bone Filter Action), Reduction Settings
  (Max Bone Influences, Remap Morph Targets).
- Unreal Insights: status bar Trace widget > channels Animation, Asset Load Time, stat named
  events > open Insights after trace.

## Control Rig

- Add > Animation > Control Rig > Control Rig (Modular Rig for modules); Rig Graph right-click >
  Hierarchy, Full Body IK (FullBodyIK plugin); Events menu: Construction Event, Forwards Solve,
  Backwards Solve; toolbar solve direction dropdown (yellow Backwards, red Construction, blue
  Backwards and Forwards).
- Class Settings: Enable Profiling, show node run count, Procedural Element Limit (128), **Copy
  Python Script**, Run Python Context; Window > Message Log > **Control Rig Python Log**; Execution
  Stack tab; Dependency Viewer.
- Preview scene for rigging: Show Environment off, Show Floor off, Exposure Metering Manual,
  Exposure Compensation 11.

## Sequencer (animator work)

- Mode dropdown > **Animation** mode: Constraints tab (5.7 merged Constraints, Space Switching,
  Snapper), Animation Layers, selection sets, Anim Details.
- Track (+) > Control Rig > Layered, pick the rig; Time Warp track; Curve Editor right-click >
  Filter > Bake (interval), key right-click > Interpolation > Constant (5.8.0: hotkeys do not work
  on the time warp curve).
- Character track right-click > **Bake To Control Rig** (rigs with a Backwards Solve only);
  right-click > **Configure AutoBake**, flame icon to toggle baked and live (5.8); Simple View
  Ctrl+Backspace [verify Mac].
- Constraint rules: create at the start frame; Active key to disable (X deletes); retime by deleting
  and re-keying; shift constrained keys from the timeline, not the section panel.
- Ground alignment: add a second Control Rig track `CR_GroundAlignment` on the mannequin.

## MetaHuman, ML Deformer, cloth

- MetaHuman Blueprint > Components: LODSync (Forced LOD, Min LOD, Custom LOD Mapping), MetaHuman
  component (Enable Body Correctives, Facial Animation LOD Threshold, neck correctives and neck
  procedural Control Rig thresholds). Groom Asset Editor > LOD panel (Min LOD). Project Settings >
  Plugins > RigLogic, IMG Media.
- ML Deformer asset: choose the model right after creation; Training mode (Skeletal Mesh, Training
  Input Anims, Network Inputs > Add All Animated Bones, per-bone masks), toolbar **Train Model**;
  Testing mode (heat maps, Compare Actors); Debug Actor in PIE (F8 refresh). Skeletal Mesh
  Component > Mesh Deformer must carry the same Deformer Graph.
- Panel cloth: Content Browser > Add > cloth asset [verify menu] opens the Dataflow graph and 2D
  panel view; right-click a node > copy interactor name for Blueprint runtime tweaks. Legacy:
  Skeletal Mesh editor > Section Selection > Create Cloth Asset from Selection > Apply; Window >
  Clothing > Activate Cloth Paint.
