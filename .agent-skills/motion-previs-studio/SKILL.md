---
name: motion-previs-studio
description: >
  Assist with Motion Previs Studio v4: a cross-platform desktop app for AI-film 
  previsualization. Use when setting up, configuring, troubleshooting, or extending 
  motion-previs-studio for pose extraction, depth mapping, camera motion solving, 
  control layer export, and bundle production for AI-video workflows (Seedance, 
  ComfyUI, Blender, Runway, Kling). Includes build setup, feature integration, 
  UI/logic debugging, and export pipeline optimization.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works with the motion-previs-studio repository (v4+). Useful for filmmakers, 
  VFX artists, and AI-video engineers integrating motion analysis into production 
  pipelines. Pairs well with VFX workflow automation, AI video generation, and 
  Blender scripting skills.
metadata:
  tags: motion-previs, ai-video, previsualization, filmmaking, pose-extraction, depth-mapping, camera-motion, control-layers, previs, ai-film
  platforms: Claude, ChatGPT, Gemini, Codex, jeopi
  version: "1.0"
  source: wassermanproductions/motion-previs-studio
---

# Motion Previs Studio

Assist with Motion Previs Studio v4 — the open-source desktop app for extracting pose, depth, camera motion, and control layers from reference video for AI-film production.

## When to use this skill

- **Setup & build**: Installing dependencies, building from source, cross-platform configuration (Windows, macOS, Linux)
- **Feature integration**: Adding new pose estimators, depth models, camera solvers, or export formats
- **UI/logic debugging**: Canvas issues, progress tracking, export pipeline failures, frame encoding problems
- **Export & workflow**: Troubleshooting bundle output, Seedance/ComfyUI/Blender export compatibility, OpenPose keypoint export
- **Performance optimization**: Faster frame processing, memory management, encoding bottlenecks
- **Project architecture**: Understanding MediaHandler, PoseAnalyzer, CameraSolver, ControlLayerGenerator, and bundler components

## When not to use this skill

- **Pure Blender scripting**: Use `blender` or `ui-component-patterns` skills instead
- **ComfyUI node development**: Use `ai-video-generation` or similar AI-video skills
- **General desktop app UX**: Use `ui-design-guidelines` or `responsive-design`
- **CI/CD for unrelated projects**: Use `deployment-automation` or `git-workflow`

## Core architecture (v4)

**Main components:**

1. **MediaHandler** — loads and trims video clips (local files, URLs)
2. **PoseAnalyzer** — runs OpenPose/BODY_25 keypoint extraction per frame
3. **DepthAnalyzer** — computes depth maps (MiDaS, or depth-from-motion models)
4. **CameraSolver** — solves camera pan/tilt/zoom/roll via optical flow + RANSAC, masking the tracked subject
5. **ControlLayerGenerator** — produces reference, depth, edges, lineart, pose, normals, etc.
6. **Bundler** — exports production packs (MP4, JSON, Python scripts, manifests for downstream tools)
7. **BlockoutBridge** — sends reference/depth to running Blockout sessions (optional one-click relay)

**Security model (v4):**
- Custom `mps://` protocol with `webSecurity: on`
- IPC allowlist (main ↔ renderer message types)
- Path allowlist for all file access (imports, exports, temp files)

## Setup & build

### Prerequisites

- **Node.js** 18+
- **ffmpeg** (for frame-by-frame video encoding)
- **Python** 3.8+ (for downstream Blender/ComfyUI export scripts)
- **Platform SDKs**: Xcode (macOS), Visual Studio Build Tools (Windows), or gcc/clang (Linux)

### Quick start

```bash
git clone https://github.com/wassermanproductions/motion-previs-studio.git
cd motion-previs-studio
npm install
npm run dev         # dev server (hot reload)
npm run build       # production bundle
npm run electron    # desktop app (requires build first)
```

### Cross-platform build

```bash
# macOS (Intel/Apple Silicon)
npm run build:mac

# Windows (64-bit)
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build:all
```

## Common workflows

### Extracting pose + camera from a reference shot

1. **Import** local clip or URL in the UI
2. **Trim** to the shot window you want to analyze
3. **Select mode**:
   - `Camera only` — extract camera move, replace subject/world
   - `Actor motion` — keep pose + camera
   - `Object motion` — track vehicle/object path + camera
   - `Full scene` — preserve camera, blocking, depth, subject motion
4. **Pick control layers** (reference, depth, edges, pose, OpenPose, etc.)
5. **Run** → watch Prepare → Pose → Camera → Encode → Bundle stages with live progress
6. **Export** → receive bundle folder + ZIP with `openpose_pose.mp4`, `openpose_keypoints.json`, Blender/ComfyUI/Seedance exports
7. **(Optional) Send to Blockout** as a ghost reference underlay

### Troubleshooting common issues

**"Pose extraction stalled / blank pose.mp4"**
- Check that the reference subject is visible and well-lit
- Verify ffmpeg is installed: `ffmpeg -version`
- Check temp disk space for frame-by-frame encoding
- Inspect the `PoseAnalyzer` logs; confirm OpenPose model loaded

**"Camera motion not detected / zero camera_motion.json"**
- Ensure the camera has distinct motion (pan, tilt, zoom, roll)
- Verify the subject mask is valid; if not, the solver cannot isolate background motion
- Check CameraSolver log for optical flow success rate
- Try different RANSAC thresholds in settings

**"Export hangs during Encode stage"**
- Confirm disk space is sufficient
- Check if ffmpeg child process is stuck: `ps aux | grep ffmpeg`
- Try exporting a shorter clip first (10-20 frames)
- Inspect `Bundler` logs for frame-write errors

**"Blockout "Send" button fails / 400 error"**
- Verify Blockout is running and listening on the expected port (default: 6789)
- Check the `BlockoutBridge` IPC payload size (large videos may exceed limits)
- Use the manual export method: copy the exported reference/depth MP4 to Blockout's ghost folder

## Integration points

### Adding a new pose estimator

1. Create a new analyzer in `src/analyzers/PoseAnalyzer.ts` or a parallel module
2. Implement the interface:
   ```typescript
   interface PoseEstimator {
     loadModel(modelPath: string): Promise<void>;
     estimateFrame(frame: Uint8Array, width: number, height: number): Promise<Keypoint[]>;
     getName(): string;
   }
   ```
3. Update `PoseAnalyzer` to instantiate and use your estimator
4. Add export logic for the keypoint format (OpenPose, MediaPipe, custom JSON)
5. Test with a sample clip; verify `openpose_keypoints.json` structure

### Adding a new export format

1. Create a generator in `src/exporters/`
2. Implement:
   ```typescript
   interface ControlLayerExporter {
     generate(bundle: ProductionBundle): Promise<ExportedLayer>;
     getFileExtension(): string;
     getLayerName(): string;
   }
   ```
3. Register in `Bundler.ts`
4. Test the export; validate structure with downstream tool

### Extending DepthAnalyzer

- Replace `MiDaS` with `ZoeDepth`, `DPT`, or custom depth model
- Ensure output format: per-frame normalized depth (0–255 uint8 or 0–1 float)
- Integrate into the Encode stage; test with reference clips of known depth scenes

## Export bundle format

Each production pack includes:

**Videos:**
- `reference.mp4` — original or mode-adjusted reference
- `depth.mp4` — normalized depth visualization
- `ai_depth.mp4` — optional local AI depth pass
- `edges.mp4`, `lineart.mp4`, `pose_high_contrast.mp4`, `openpose_pose.mp4`
- `combined_reference_depth_pose.mp4` — tiled composite

**Keypoints & analysis:**
- `openpose_keypoints.json` — per-frame BODY_25 keypoints (75 values/person, OpenPose standard)
- `pose_landmarks.json` — pose analysis metadata
- `camera_motion.json` — camera pan/tilt/zoom/roll curve data
- `model_presets.json` — analyzer settings used

**Downstream scripts & manifests:**
- `blender_import_pose.py` — Blender armature import script
- `blender_import_camera.py` — camera rig import
- `blender_import_scene.py` — full scene setup
- `comfyui_manifest.json` — control-net graph template
- `seedance_prompt.md` — Seedance CLI usage guide
- `bundle_manifest.json` — inventory and checksums

**Metadata:**
- `contact_sheet.jpg` — frame gallery
- `bundle_manifest.json` — full metadata and export settings

## Performance notes

- **Frame encoding**: Deterministic frame-by-frame ffmpeg (no `captureStream`) ensures reproducibility
- **Memory**: Monitor GPU/CPU during Pose and Depth stages; reduce clip length if OOM
- **Camera solve**: RANSAC + optical flow are CPU-bound; 4–8 cores recommended for real-time feedback
- **Batch processing**: For workflows requiring many clips, consider queueing or server-side deployment

## Security & IPC

**Custom protocol & allowlist:**
- All file access routes through an IPC allowlist
- Path allowlist restricts imports to specified folders and exports to designated output paths
- `webSecurity: on` prevents external script injection in the renderer

**Before adding new IPC messages:**
1. Define the message type in `src/ipc/messages.ts`
2. Add handler to the allowlist in `src/ipc/allowlist.ts`
3. Validate and sanitize all user input in the handler

## References

- **Repository**: [wassermanproductions/motion-previs-studio](https://github.com/wassermanproductions/motion-previs-studio)
- **License**: Apache License 2.0 — cite Sam Wasserman when using or building on this work
- **Docs**: See `docs/` folder in the repository (installation, workflow, export specs)
- **Downstream tools**: [Blockout](https://github.com/wassermanproductions/blockout), Seedance, ComfyUI, Blender

## Best practices

1. **Keep clips under 5 min** for initial testing; longer clips require more processing time and disk space
2. **Verify camera move** is distinct before running Camera Solver; static-camera shots may produce zero motion data
3. **Test exports early** with your downstream tool (Blender, ComfyUI, Seedance) to catch compatibility issues
4. **Use project save/restore** to resume long analysis sessions if they timeout or cancel
5. **Profile Pose + Camera stages** to identify performance bottlenecks; GPU acceleration flags may be needed
6. **Document custom analyzers** and exporters in `MODIFICATIONS.md` if you fork or extend the app
