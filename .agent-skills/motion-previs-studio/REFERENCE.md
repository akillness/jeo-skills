# Motion Previs Studio v4 Reference Guide

Detailed technical reference for developers extending or maintaining Motion Previs Studio.

## Project structure

```
motion-previs-studio/
├── src/
│   ├── main.ts                    # Electron main process
│   ├── preload.ts                 # Preload script (secure IPC bridge)
│   ├── index.html                 # App shell
│   ├── styles/                    # CSS (Tailwind or custom)
│   ├── components/                # React/Vue/Svelte components
│   │   ├── Timeline.tsx           # Trim & scrub UI
│   │   ├── Canvas.tsx             # Video preview canvas
│   │   ├── ControlPanel.tsx       # Mode, layers, settings
│   │   └── ProgressRail.tsx       # Prepare → Pose → Camera → Encode → Bundle
│   ├── analyzers/                 # Core analysis modules
│   │   ├── PoseAnalyzer.ts        # OpenPose/keypoint extraction
│   │   ├── DepthAnalyzer.ts       # Depth map generation
│   │   ├── CameraSolver.ts        # Optical flow + RANSAC camera solve
│   │   └── ControlLayerGenerator.ts # Edge, lineart, normals, etc.
│   ├── exporters/                 # Production pack generators
│   │   ├── BlenderExporter.ts     # Python armature & camera scripts
│   │   ├── ComfyUIExporter.ts     # Node graph template
│   │   └── SeedanceExporter.ts    # Prompt markdown
│   ├── handlers/
│   │   ├── MediaHandler.ts        # Video load, trim, frame buffering
│   │   └── Bundler.ts             # ZIP + manifest assembly
│   ├── ipc/
│   │   ├── messages.ts            # IPC message type definitions
│   │   ├── allowlist.ts           # Secure message filtering
│   │   └── handlers.ts            # Main → renderer IPC handlers
│   ├── storage/
│   │   └── ProjectStore.ts        # Session save/restore (JSON or SQLite)
│   └── utils/
│       ├── ffmpeg.ts              # ffmpeg child process wrapper
│       ├── paths.ts               # Path validation & sandboxing
│       └── logger.ts              # Structured logging
├── public/                        # Static assets
├── docs/                          # User & developer documentation
│   ├── INSTALL.md
│   ├── WORKFLOW.md
│   ├── EXPORT_SPECS.md
│   └── API.md
├── tests/                         # Jest/Mocha tests
├── scripts/                       # Build & utility scripts
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript config
└── vite.config.ts / webpack.config.js # Bundler config
```

## Key data structures

### Frame & media

```typescript
interface VideoFrame {
  timestamp: number;           // milliseconds
  index: number;              // 0-based frame index
  width: number;
  height: number;
  data: Uint8Array;           // RGBA or YUV
}

interface MediaInfo {
  path: string;
  duration: number;           // milliseconds
  fps: number;
  width: number;
  height: number;
  frameCount: number;
}

interface TrimWindow {
  startFrame: number;
  endFrame: number;
  duration: number;           // milliseconds
}
```

### Pose & keypoints

```typescript
interface Keypoint {
  x: number;
  y: number;
  confidence: number;         // 0–1
  name: string;              // "nose", "l_eye", "r_elbow", etc.
}

interface PoseFrame {
  frameIndex: number;
  timestamp: number;
  people: {
    id?: number;             // person ID (for tracking)
    keypoints: Keypoint[];   // BODY_25 = 25 keypoints, 75 floats per person
    confidence: number;      // average confidence
  }[];
}

// OpenPose BODY_25 keypoint order:
// 0–4: head (nose, neck, eyes, ears)
// 5–8: right arm
// 9–12: left arm
// 13–16: torso
// 17–24: legs (hips, knees, ankles)
```

### Depth

```typescript
interface DepthFrame {
  frameIndex: number;
  timestamp: number;
  width: number;
  height: number;
  depthData: Uint8Array;    // 0–255 (normalized) or Float32Array (meters)
  minDepth?: number;
  maxDepth?: number;
}
```

### Camera motion

```typescript
interface CameraFrame {
  frameIndex: number;
  timestamp: number;
  pan: number;              // degrees, relative to frame 0
  tilt: number;             // degrees
  zoom: number;             // 1.0 = reference, >1 = zoomed in
  roll: number;             // degrees
  confidence: number;       // optical flow success rate (0–1)
}

interface CameraMotion {
  frames: CameraFrame[];
  algorithm: string;        // "lucas_kanade_ransac"
  inlierRatio: number;      // % of pixels used (after outlier rejection)
  solver: string;           // "similarity" or "affine"
}
```

### Production bundle

```typescript
interface ProductionBundle {
  id: string;                       // UUID
  exportTime: number;               // Unix timestamp
  sourceMedia: MediaInfo;
  trimWindow: TrimWindow;
  mode: "camera_only" | "actor_motion" | "object_motion" | "full_scene";
  layers: {
    reference: {mp4Path: string; metadata: any};
    depth?: {mp4Path: string; normalizedRange: [number, number]};
    aiDepth?: {mp4Path: string};
    edges?: {mp4Path: string};
    lineart?: {mp4Path: string};
    pose?: {mp4Path: string; format: "openpose" | "mediapipe"};
    openposePose?: {mp4Path: string; keypoints: string}; // .json
    normals?: {mp4Path: string};
    combined?: {mp4Path: string};
  };
  analysis: {
    poseData: PoseFrame[];
    cameraMotion: CameraMotion;
    depthRange?: [number, number];
    diagnostics: {
      framesProcessed: number;
      framesSuccessful: number;
      poseConfidenceAvg: number;
      cameraConfidence: number;
    };
  };
  exports: {
    blenderPosePath?: string;        // Python script path
    blenderCameraPath?: string;
    blenderScenePath?: string;
    comfyuiManifest?: string;       // JSON manifest for control-net
    seedancePrompt?: string;         // Markdown prompt
  };
  settings: {
    poseModel: string;               // e.g., "openpose_body25"
    depthModel: string;              // e.g., "midas"
    cameraSolverMethod: string;
    controlLayers: string[];
    quality: "draft" | "standard" | "high";
  };
}
```

### Export layer

```typescript
interface ControlLayerExportConfig {
  layerName: string;
  format: "mp4" | "png_sequence" | "exr_sequence" | "json";
  codec?: string;              // e.g., "libx264" for mp4
  fps?: number;
  quality?: "draft" | "standard" | "high";
}
```

## Analysis pipeline

### Stage 1: Prepare

- Load media file or URL
- Detect format, duration, FPS, resolution
- Allocate buffers
- Validate trim window

**IPC message**: `prepare-media` → `prepare-complete` or `prepare-error`

### Stage 2: Pose extraction

- For each frame in trim window:
  1. Decode frame (ffmpeg → RGBA)
  2. Run pose estimator (OpenPose, MediaPipe, custom)
  3. Collect keypoints
  4. Store in `PoseFrame` array
- Generate `pose_high_contrast.mp4` (skeleton overlay on black)
- Generate `openpose_pose.mp4` (stick-figure animation)
- Output `openpose_keypoints.json` (BODY_25 format)

**Optimizations:**
- Batch frames for GPU inference
- Skip low-confidence detections
- Interpolate missing frames
- Cache model on first load

**IPC message**: `analyze-pose` → `pose-frame` (per-frame progress) → `pose-complete`

### Stage 3: Camera motion solve

- Compute optical flow (Lucas-Kanade) frame-to-frame
- Extract subject bounding box (from pose or manual mask)
- Mask subject; compute flow only on background
- Fit RANSAC similarity model (scale, rotation, tx, ty)
- Solve camera parameters: pan, tilt, zoom, roll
- Output `camera_motion.json`

**Optimizations:**
- Multi-threaded optical flow
- GPU-accelerated RANSAC
- Early termination if confidence < threshold

**IPC message**: `analyze-camera` → `camera-frame` → `camera-complete`

### Stage 4: Control layer generation

- For each selected layer:
  1. Depth normalization / visualization
  2. Edge detection (Sobel, Canny)
  3. Line art (sketch filter)
  4. Normals extraction (from depth gradient)
  5. Motion mask (optical flow magnitude)
- Encode each as deterministic MP4 (ffmpeg, frame-by-frame)

**IPC message**: `generate-layers` → `layer-frame` → `layer-complete`

### Stage 5: Bundling & export

- Assemble videos into ZIP
- Generate Blender Python scripts (armature rig, camera, scene setup)
- Generate ComfyUI manifest (control-net node graph template)
- Generate Seedance prompt markdown
- Write bundle metadata JSON
- Output production pack folder + ZIP

**IPC message**: `bundle` → `bundle-complete` or `bundle-error`

## IPC message types (v4 allowlist)

**Main → Renderer (user actions)**

```typescript
// UI events
send("ui:project-new", {})
send("ui:project-open", {projectPath: string})
send("ui:project-save", {})
send("ui:media-import", {path: string | url: string})
send("ui:trim-change", {startFrame: number, endFrame: number})
send("ui:mode-change", {mode: "camera_only" | "actor_motion" | ...})
send("ui:layers-toggle", {layers: string[]})
send("ui:analyze-start", {})
send("ui:analyze-cancel", {})
send("ui:export", {outputPath: string})
send("ui:blockout-send", {clipType: "reference" | "depth"})
```

**Renderer → Main (worker threads, file access)**

```typescript
// Analysis progress
send("analyze:pose-start", {frameCount: number})
send("analyze:pose-frame", {frameIndex: number, progress: 0–100})
send("analyze:pose-complete", {frames: PoseFrame[]})

send("analyze:camera-start", {})
send("analyze:camera-frame", {frameIndex: number, ...CameraFrame})
send("analyze:camera-complete", {motion: CameraMotion})

// File access (sandboxed paths only)
send("fs:read-file", {path: string})
send("fs:write-file", {path: string, data: Buffer})
send("fs:list-dir", {path: string})

// Bundler
send("bundle:start", {frames: PoseFrame[], motion: CameraMotion, ...})
send("bundle:progress", {stage: string, progress: 0–100})
send("bundle:complete", {bundlePath: string, zipPath: string})
```

**Path allowlist example (src/ipc/allowlist.ts):**

```typescript
export const ALLOWED_PATHS = {
  import: [
    process.env.HOME + "/Downloads",
    process.env.HOME + "/Documents/Motion Previs",
  ],
  export: [
    process.env.HOME + "/Documents/Motion Previs/Exports",
  ],
  temp: [
    os.tmpdir(),  // system temp only
  ],
};

export function isPathAllowed(filePath: string, category: keyof typeof ALLOWED_PATHS): boolean {
  const resolved = path.resolve(filePath);
  return ALLOWED_PATHS[category].some(allowed => resolved.startsWith(path.resolve(allowed)));
}
```

## Extending the app

### Adding a new pose estimator

1. **Create analyzer module** (e.g., `src/analyzers/MediaPipeAnalyzer.ts`)

```typescript
export class MediaPipeAnalyzer {
  private model: any;

  async loadModel(modelPath: string): Promise<void> {
    this.model = await loadMediaPipeModel(modelPath);
  }

  async estimateFrame(frame: Uint8Array, w: number, h: number): Promise<Keypoint[]> {
    const results = this.model.estimate(frame, {width: w, height: h});
    return results.landmarks.map((lm: any) => ({
      x: lm.x * w,
      y: lm.y * h,
      confidence: lm.score,
      name: MEDIAPIPE_KEYPOINT_NAMES[lm.index],
    }));
  }

  getName(): string { return "MediaPipe POSE"; }
}
```

2. **Update PoseAnalyzer** to support the new model:

```typescript
const analyzer = mode === "mediapipe" ? new MediaPipeAnalyzer() : new OpenPoseAnalyzer();
await analyzer.loadModel(modelPath);
```

3. **Test** with a reference video; validate keypoint alignment.

### Adding a new export format

1. **Create exporter** (e.g., `src/exporters/RunwayExporter.ts`)

```typescript
export class RunwayExporter {
  async generate(bundle: ProductionBundle): Promise<string> {
    const manifest = {
      version: "1.0",
      clips: bundle.layers,
      poses: bundle.analysis.poseData.map(f => ({
        frame: f.frameIndex,
        keypoints: f.people[0]?.keypoints || [],
      })),
      camera: bundle.analysis.cameraMotion.frames,
      settings: bundle.settings,
    };
    return JSON.stringify(manifest, null, 2);
  }
}
```

2. **Register in Bundler**:

```typescript
const exporters = {
  blender: new BlenderExporter(),
  comfyui: new ComfyUIExporter(),
  runway: new RunwayExporter(),
};
```

3. **Test** export; validate downstream tool compatibility.

### Performance profiling

Use Chrome DevTools (Renderer) + Node Profiler (Main):

```bash
# Renderer profiling
npm run dev  # Open DevTools (Cmd+Opt+I on macOS)
# Go to Performance tab → record analysis run

# Main process profiling
node --prof main.ts
# Generates .log file; analyze with node --prof-process
```

Check for:
- Frame decoding bottleneck (ffmpeg)
- Pose inference time (GPU utilization)
- Optical flow computation (CPU parallelization)
- Frame encoding rate (disk I/O)

## Common debugging tips

**"Blank canvas / frames not loading"**
- Check `MediaHandler.decodeFrame()` for format/codec issues
- Verify ffmpeg is installed and in PATH: `which ffmpeg`
- Check temp disk space: `df -h /tmp`

**"Pose confidence = 0 for all frames"**
- Inspect model load error (log files in `~/.motion-previs-studio/logs/`)
- Check frame brightness; pose models struggle with dark scenes
- Verify input frame dimensions match model expectations

**"Camera motion = {0, 0, 0, 0}"**
- Confirm camera has actual motion (not a static shot)
- Check if subject mask is correctly isolating the actor
- Verify optical flow succeeded: check `inlierRatio` in `camera_motion.json`
- Try disabling subject masking and re-solving

**"Export hangs on Encode stage"**
- Check `ffmpeg` process: `ps aux | grep ffmpeg`
- Monitor disk usage: `du -sh .motion-previs-studio/exports/`
- Try shorter clip or lower resolution first
- Check ffmpeg error log in app logs folder

**"IPC timeout / app freezes during analysis"**
- Confirm worker threads are not blocking renderer
- Use Chrome DevTools to check for janky frames
- Monitor memory usage; if OOM, reduce clip length
- Check if analysis thread crashed (look for exceptions in logs)

## Testing

Run tests with:

```bash
npm test                    # All tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
```

Test categories:
- **Unit**: Analyzer algorithms, path validation, export formatting
- **Integration**: Full pipeline with sample clip
- **Snapshot**: Exported bundle structure and JSON format

Example:

```typescript
describe("PoseAnalyzer", () => {
  it("extracts BODY_25 keypoints", async () => {
    const analyzer = new OpenPoseAnalyzer();
    await analyzer.loadModel(TEST_MODEL_PATH);
    const frame = loadTestFrame(TEST_VIDEO_PATH, 0);
    const keypoints = await analyzer.estimateFrame(frame.data, frame.width, frame.height);
    expect(keypoints).toHaveLength(25);
    expect(keypoints[0].name).toBe("nose");
  });
});
```

## References

- **ffmpeg documentation**: https://ffmpeg.org/documentation.html
- **OpenPose BODY_25 format**: https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/02_output.md
- **Lucas-Kanade optical flow**: https://en.wikipedia.org/wiki/Lucas%E2%80%93Kanade_method
- **RANSAC**: https://en.wikipedia.org/wiki/Random_sample_consensus
- **Electron security**: https://www.electronjs.org/docs/tutorial/security
- **IPC allowlisting**: https://www.electronjs.org/docs/api/ipc-main
