# Motion Previs Studio v4 — Examples

Practical examples for common workflows and troubleshooting scenarios.

## Example 1: Extract camera motion from a dynamic shot

### Scenario
A cinematographer has a 30-second reference shot with a push-in camera move and an actor walking across frame. They need the camera motion curve for Blender.

### Steps

1. **Open Motion Previs Studio** and click "Import Media"
2. **Select the reference video** (MP4, MOV, or paste URL)
3. **Trim to the shot** (e.g., frames 0–900 at 30 FPS = 30 seconds)
4. **Choose mode**: `Camera only` (to extract only camera, replace the subject)
5. **Select layers**:
   - ✓ Reference
   - ✓ Depth
   - ✓ Edges (optional, for lighting preview)
   - ✗ Pose (not needed for camera-only mode)
6. **Click "Run"**
   - Prepare stage: loads and validates video
   - Pose stage: extracts skeleton (needed to mask subject for camera solve)
   - Camera stage: solves pan/tilt/zoom/roll via optical flow
   - Encode stage: renders reference + depth + edges MP4s
   - Bundle stage: packages outputs
7. **Wait for completion** (~2–5 min for 30 sec clip, depending on resolution)
8. **Review camera_motion.json**:
   ```json
   {
     "frames": [
       {"frameIndex": 0, "timestamp": 0, "pan": 0, "tilt": 0, "zoom": 1.0, "roll": 0, "confidence": 0.95},
       {"frameIndex": 1, "timestamp": 33.33, "pan": 0.1, "tilt": 0, "zoom": 1.02, "roll": 0, "confidence": 0.93},
       ...
     ],
     "algorithm": "lucas_kanade_ransac",
     "inlierRatio": 0.87,
     "solver": "similarity"
   }
   ```
9. **Export** the production pack to your project folder
10. **Open Blender** and run the included `blender_import_camera.py` script
    ```bash
    cd /path/to/exported/bundle
    blender -b my_scene.blend -P blender_import_camera.py
    ```
    This creates a camera rig with keyframes matching the solved motion.

### Expected result
- Camera `pan` curve animates from 0 to ~2–3 degrees (subtle push-in)
- Camera `zoom` increases from 1.0 to ~1.05 (gentle magnification)
- Blender camera follows the motion exactly

---

## Example 2: Extract pose + camera for actor motion preservation

### Scenario
A VFX team is building a digital stunt-double for an action scene. They want to extract the actor's pose and camera motion to apply to a CG model in Blender.

### Steps

1. **Import** the action reference video (close-up on actor performing a jump/roll)
2. **Trim** to the stunt window (e.g., frames 120–240 = 4 seconds)
3. **Mode**: `Actor motion` (keep pose + camera)
4. **Layers**:
   - ✓ Reference
   - ✓ Pose (high contrast skeleton)
   - ✓ OpenPose (video + JSON)
   - ✓ Depth
5. **Run**
6. **Inspect pose landmarks**:
   ```json
   {
     "frameIndex": 120,
     "people": [
       {
         "keypoints": [
           {"x": 640, "y": 150, "confidence": 0.98, "name": "nose"},
           {"x": 630, "y": 140, "confidence": 0.97, "name": "l_eye"},
           {"x": 650, "y": 140, "confidence": 0.96, "name": "r_eye"},
           ...
         ]
       }
     ]
   }
   ```
7. **Export** → bundle folder
8. **In Blender**, run `blender_import_pose.py`:
   ```python
   python blender_import_pose.py \
     --pose-data /path/to/pose_landmarks.json \
     --armature CG_stunt_double
   ```
   This rigs your CG model to match the actor's pose keyframes.
9. **In Blender**, also run `blender_import_camera.py` to sync camera motion
10. **Composite** the CG stunt-double over the reference or blend with live action

### Expected result
- CG model matches actor's joint positions frame-by-frame
- Camera moves in sync with reference
- VFX artist can refine CG lighting, materials, environment independently

---

## Example 3: Prepare depth reference for ComfyUI ControlNet

### Scenario
An AI-video artist wants to use ComfyUI ControlNet with depth control. They have a reference shot and want the depth-map MP4 + camera motion for conditioning.

### Steps

1. **Import** reference video (landscape, wide shot)
2. **Trim** to desired length (e.g., 0–5 sec)
3. **Mode**: `Full scene` (preserve everything)
4. **Layers**:
   - ✓ Reference
   - ✓ Depth
   - ✓ OpenPose (optional, for pose control)
5. **Run** → wait for bundle
6. **Export** → check the bundle folder
7. **Open ComfyUI**
8. **Use `comfyui_manifest.json`** as a template:
   ```json
   {
     "nodes": [
       {
         "id": "depth_load",
         "class": "LoadVideo",
         "inputs": {"video": "depth.mp4"}
       },
       {
         "id": "depth_control",
         "class": "ControlNetLoader",
         "inputs": {"control_type": "depth"}
       },
       {
         "id": "denoise",
         "class": "KSamplerAdvanced",
         "inputs": {"conditioning": ["depth_control", 0], "guidance_scale": 7.5}
       }
     ]
   }
   ```
9. **Load the depth.mp4** into your ControlNet node
10. **Generate** AI video with depth conditioning
11. **Result**: AI video respects the reference depth structure and camera motion

---

## Example 4: Troubleshoot blank pose extraction

### Scenario
Pose extraction completes, but `pose_high_contrast.mp4` is blank (no skeleton visible).

### Diagnosis

1. **Check the reference video**:
   - Is the subject clearly visible and well-lit?
   - Is the resolution at least 360p?
   - Are there multiple people in frame? (OpenPose may fail if crowded)

2. **Inspect the pose analyzer output**:
   ```bash
   ls -la ~/.motion-previs-studio/logs/
   tail -f ~/.motion-previs-studio/logs/pose-analyzer.log
   ```
   Look for errors like:
   ```
   ERROR: Failed to load pose model: model not found
   WARN: No keypoints detected in frame 0 (confidence < 0.5)
   ```

3. **Check the model is installed**:
   ```bash
   ls -la ~/.motion-previs-studio/models/
   # Should include: openpose_body25.onnx or similar
   ```

4. **Re-import with debugging**:
   - Use a shorter clip (first 5 frames only)
   - Increase canvas brightness if the reference is dark
   - Try a different reference video to isolate the issue

5. **Solution options**:
   - **Reinstall models**: Open Settings → Models → Reinstall OpenPose
   - **Update app**: `npm run build` and test with latest version
   - **Try different frame**: If one frame fails, skip it manually in settings
   - **Use alternative pose mode**: Switch from OpenPose to MediaPipe (if available)

### Prevention
- Test pose extraction on a 5-10 frame sample first
- Ensure reference is well-lit and subject is fully visible
- Check app logs regularly during analysis

---

## Example 5: Resolve "Camera motion = 0" (static camera fallback)

### Scenario
After camera solving, `camera_motion.json` shows zero motion:
```json
{
  "frames": [
    {"frameIndex": 0, "pan": 0, "tilt": 0, "zoom": 1.0, "roll": 0, "confidence": 0.0}
  ],
  "inlierRatio": 0.05,
  "solver": "similarity"
}
```

### Diagnosis

1. **Verify the camera actually moves**:
   - Manually scrub the reference video frame-by-frame
   - Look for pan, tilt, zoom, or roll
   - If static, camera solving is working correctly (0 motion is the right answer)

2. **If camera SHOULD move but doesn't show up**:
   - Check **subject mask quality**: the camera solver masks out the actor to isolate background motion
     ```bash
     # Inspect pose confidence for frame 0
     grep -A 5 "frameIndex.*0" ~/.motion-previs-studio/exports/latest/pose_landmarks.json
     # If all keypoint confidences < 0.5, mask is invalid
     ```
   - If pose confidence is low, camera solve cannot reliably detect camera motion
   - **Solution**: Use `Camera only` mode, which doesn't require pose masking

3. **Check optical flow settings**:
   - Optical flow may be too noisy for subtle motion
   - Try increasing RANSAC iterations in app settings
   - Or manually specify a camera motion (pan, tilt, zoom) in a `manual_camera.json` override

4. **Test with a different reference**:
   - Use a clip with obvious motion (pan across a static scene)
   - If that succeeds, your original clip may truly be static

### Prevention
- Always test camera mode on a known dynamic reference first
- Preview pose confidence before running camera solve
- Use `Camera only` mode for complex scenes where pose masking fails

---

## Example 6: Export to Seedance CLI

### Scenario
A filmmaker wants to generate AI video on Seedance using the reference camera motion and depth.

### Steps

1. **Extract from Motion Previs Studio** with layers: Reference, Depth, OpenPose
2. **Open the bundle** folder
3. **Read `seedance_prompt.md`**:
   ```markdown
   # Seedance Export
   
   Exported from Motion Previs Studio v4 on 2025-01-15.
   
   ## Clip metadata
   - Duration: 5 seconds (150 frames @ 30 FPS)
   - Resolution: 1920×1080
   - Camera motion: pan 2.3°, tilt 0.5°, zoom 1.02
   
   ## Depth reference
   Depth range: 0.2m (foreground) to 50m (background)
   Use `depth.mp4` for depth-aware generation.
   
   ## Generation command
   
   ```bash
   seedance generate \
     --prompt "a cyborg walking through a neon city, dramatic lighting" \
     --reference reference.mp4 \
     --depth depth.mp4 \
     --camera-data camera_motion.json \
     --output output.mp4 \
     --guidance-scale 7.5
   ```
   ```

4. **Prepare Seedance environment**:
   ```bash
   pip install seedance-cli
   seedance auth login
   ```

5. **Run the export command**:
   ```bash
   cd /path/to/bundle
   seedance generate \
     --prompt "a cyborg walking through a neon city, dramatic lighting" \
     --reference reference.mp4 \
     --depth depth.mp4 \
     --camera-data camera_motion.json \
     --output generated.mp4 \
     --guidance-scale 7.5 \
     --num-frames 150 \
     --resolution 1920x1080
   ```

6. **Wait for generation** (30 min to 2 hours depending on queue)

7. **Review output**: `generated.mp4` contains AI-generated video matching your prompt, reference camera motion, and depth constraints

---

## Example 7: Batch processing multiple clips

### Scenario
A director has 10 reference clips and wants to extract pose + camera from all of them in a single workflow.

### Approach (manual loop)

```bash
#!/bin/bash
# batch-process-motion-previs.sh

INPUT_DIR="$HOME/motion_references"
OUTPUT_DIR="$HOME/motion_previs_bundles"

mkdir -p "$OUTPUT_DIR"

for clip in "$INPUT_DIR"/*.mp4; do
  clip_name=$(basename "$clip" .mp4)
  output_path="$OUTPUT_DIR/$clip_name"
  
  echo "Processing $clip_name..."
  
  # Call Motion Previs Studio via CLI (if available)
  motion-previs-studio extract \
    --input "$clip" \
    --mode actor_motion \
    --layers reference,pose,camera,depth \
    --output "$output_path" \
    --quality high
done

echo "All clips processed. Bundles in: $OUTPUT_DIR"
```

**To enable CLI mode** (if not already available):

```typescript
// src/cli.ts (add to Motion Previs Studio)
import { parseArgs } from 'node:util';
import { PoseAnalyzer } from './analyzers/PoseAnalyzer';
import { CameraSolver } from './analyzers/CameraSolver';
import { Bundler } from './handlers/Bundler';

export async function runCLI() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      mode: { type: 'string', short: 'm', default: 'camera_only' },
      layers: { type: 'string', short: 'l', default: 'reference,depth' },
      output: { type: 'string', short: 'o' },
      quality: { type: 'string', short: 'q', default: 'standard' },
    },
  });

  const media = await loadMedia(values.input);
  const pose = await new PoseAnalyzer().analyze(media);
  const camera = await new CameraSolver().solve(media, pose);
  const bundle = await new Bundler().generate(media, pose, camera, {
    mode: values.mode,
    layers: values.layers.split(','),
    quality: values.quality,
    outputPath: values.output,
  });
  
  console.log(`✓ Bundle complete: ${values.output}`);
}

if (require.main === module) {
  runCLI().catch(console.error);
}
```

Then run:
```bash
npm run dev -- --cli --input ref.mp4 --mode actor_motion --output ./bundle
```

---

## Example 8: Extend export with a custom Runway API payload

### Scenario
An artist wants to use the extracted pose + camera with Runway Gen-3 API for AI video generation.

### Custom exporter

```typescript
// src/exporters/RunwayExporter.ts

import { ProductionBundle } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class RunwayExporter {
  async export(bundle: ProductionBundle, outputDir: string): Promise<void> {
    const payload = {
      version: '1.0',
      sourceClip: {
        path: bundle.sourceMedia.path,
        duration: bundle.sourceMedia.duration,
        fps: bundle.sourceMedia.fps,
        resolution: [bundle.sourceMedia.width, bundle.sourceMedia.height],
      },
      controlInputs: {
        reference: {
          type: 'video',
          path: path.join(outputDir, 'reference.mp4'),
          role: 'style_reference',
        },
        depth: {
          type: 'video',
          path: path.join(outputDir, 'depth.mp4'),
          role: 'depth_control',
          normalized: true,
          range: [0, 255],
        },
        camera: {
          type: 'data',
          format: 'camera_motion_json',
          data: bundle.analysis.cameraMotion,
        },
        pose: {
          type: 'keypoints',
          format: 'openpose_body25',
          frames: bundle.analysis.poseData,
        },
      },
      settings: {
        qualityMode: bundle.settings.quality,
        seedValue: Math.floor(Math.random() * 1e6),
        numFrames: bundle.sourceMedia.frameCount,
      },
      apiEndpoint: 'https://api.runwayml.com/v1/generate',
    };

    const outputPath = path.join(outputDir, 'runway_payload.json');
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`✓ Runway payload: ${outputPath}`);
  }
}
```

Register in **Bundler.ts**:

```typescript
import { RunwayExporter } from './exporters/RunwayExporter';

const exporters = {
  blender: new BlenderExporter(),
  comfyui: new ComfyUIExporter(),
  seedance: new SeedanceExporter(),
  runway: new RunwayExporter(),
};
```

Then use in the export step:

```typescript
await exporters.runway.export(bundle, outputPath);
```

Generate API request:

```bash
# Read the Runway payload
cat runway_payload.json | jq '.controlInputs'

# Call Runway API
curl -X POST https://api.runwayml.com/v1/generate \
  -H "Authorization: Bearer $RUNWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d @runway_payload.json
```

---

## Example 9: Debug performance bottleneck

### Scenario
Pose extraction is taking 30 minutes for a 1-minute 4K clip. Need to identify the bottleneck.

### Profiling approach

1. **Enable performance logging** in `src/analyzers/PoseAnalyzer.ts`:

```typescript
async analyzeFrame(frameIndex: number, frameData: Uint8Array): Promise<Keypoint[]> {
  const startTime = performance.now();
  
  const decodedFrame = await this.decodeFrame(frameData);
  const decodeTime = performance.now() - startTime;
  
  const inferenceStart = performance.now();
  const keypoints = await this.model.estimate(decodedFrame);
  const inferenceTime = performance.now() - inferenceStart;
  
  const totalTime = performance.now() - startTime;
  
  if (frameIndex % 30 === 0) {  // Log every 30 frames
    console.log(`[Pose Frame ${frameIndex}] decode=${decodeTime.toFixed(1)}ms, inference=${inferenceTime.toFixed(1)}ms, total=${totalTime.toFixed(1)}ms`);
  }
  
  return keypoints;
}
```

2. **Monitor during analysis**:
   - Watch the logs for which stage is slowest
   - Example output:
     ```
     [Pose Frame 0] decode=45.2ms, inference=2340.5ms, total=2385.7ms
     [Pose Frame 30] decode=43.1ms, inference=2250.3ms, total=2293.4ms
     [Pose Frame 60] decode=44.8ms, inference=2290.1ms, total=2334.9ms
     ```
   - Inference time dominates (2250ms/frame) → GPU bottleneck

3. **Optimization options**:

   **If decode is slow** (>100ms):
   ```bash
   # Use hardware-accelerated video decoding
   # Requires: ffmpeg with NVENC / VideoToolbox / MediaFoundation
   ```

   **If inference is slow** (>1000ms):
   ```bash
   # Option 1: Use GPU (CUDA/Metal)
   # Install onnxruntime-gpu instead of onnxruntime-node
   npm install onnxruntime-gpu
   
   # Option 2: Reduce model precision (FP16 instead of FP32)
   # In PoseAnalyzer: await model.create({precision: 'fp16'})
   
   # Option 3: Batch frames (inference on 4–8 frames at once)
   const batch = frames.slice(frameIndex, frameIndex + 8);
   const keypoints = await this.model.batchEstimate(batch);
   ```

4. **Test after optimization**:
   ```
   [Pose Frame 0] decode=45.2ms, inference=580.3ms, total=625.5ms
   ```
   → 75% faster overall

---

## Example 10: Create a Blender addon for one-click import

### Scenario
Artists want to open a Blender file and click "Import Motion Previs" to load pose, camera, and reference layer automatically.

### Blender addon

```python
# blender_addons/motion_previs_import.py

import bpy
import json
import mathutils
from pathlib import Path

bl_info = {
    "name": "Motion Previs Studio Import",
    "blender": (3, 6, 0),
    "category": "Import-Export",
}

class MotionPrevisImporter(bpy.types.Operator):
    bl_idname = "wm.motion_previs_import"
    bl_label = "Import Motion Previs Bundle"
    
    filepath: bpy.props.StringProperty(
        name="Bundle Path",
        description="Path to Motion Previs Studio export bundle",
        subtype="DIR_PATH",
    )
    
    def execute(self, context):
        bundle_path = Path(self.filepath)
        
        # Load pose data
        pose_file = bundle_path / "pose_landmarks.json"
        if pose_file.exists():
            with open(pose_file) as f:
                poses = json.load(f)
            self.import_poses(context, poses)
        
        # Load camera motion
        camera_file = bundle_path / "camera_motion.json"
        if camera_file.exists():
            with open(camera_file) as f:
                camera_motion = json.load(f)
            self.import_camera(context, camera_motion)
        
        # Load reference as image plane
        ref_file = bundle_path / "reference.mp4"
        if ref_file.exists():
            self.import_reference(context, str(ref_file))
        
        self.report({'INFO'}, "Motion Previs import complete")
        return {'FINISHED'}
    
    def import_poses(self, context, poses):
        # Create armature
        bpy.ops.object.armature_add(name="motion_previs_rig")
        armature = context.active_object
        # ... rig bones based on BODY_25 keypoint structure
        # ... add keyframes for each pose frame
    
    def import_camera(self, context, camera_motion):
        camera = context.scene.camera or bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
        context.collection.objects.link(camera)
        
        for frame_data in camera_motion['frames']:
            frame_idx = frame_data['frameIndex']
            bpy.context.scene.frame_set(frame_idx)
            
            # Apply camera rotation/zoom based on pan, tilt, zoom, roll
            camera.rotation_euler = (
                math.radians(frame_data['tilt']),
                0,
                math.radians(frame_data['pan']),
            )
            camera.data.lens *= frame_data['zoom']
            camera.keyframe_insert(data_path="rotation_euler")
            camera.keyframe_insert(data_path="data.lens")
    
    def import_reference(self, context, ref_video_path):
        # Create image plane with video reference
        bpy.ops.object.empty_add(type='IMAGE')
        image_plane = context.active_object
        image_plane.name = "reference_plane"
        # Load video texture
        # ... configure as background or overlay

class MotionPrevisPanel(bpy.types.Panel):
    bl_label = "Motion Previs Import"
    bl_idname = "VIEW_PT_motion_previs"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Motion Previs"
    
    def draw(self, context):
        layout = self.layout
        layout.operator("wm.motion_previs_import", text="Import Bundle")

def register():
    bpy.utils.register_class(MotionPrevisImporter)
    bpy.utils.register_class(MotionPrevisPanel)

def unregister():
    bpy.utils.unregister_class(MotionPrevisImporter)
    bpy.utils.unregister_class(MotionPrevisPanel)

if __name__ == "__main__":
    register()
```

Install in Blender:
1. Save to `~/.config/blender/4.0/scripts/addons/motion_previs_import.py`
2. Open Blender → Edit → Preferences → Add-ons → Search "Motion Previs"
3. Click ✓ to enable
4. Go to 3D view → Right sidebar → "Motion Previs Import" tab
5. Click "Import Bundle" and select the exported folder

Result: One click loads pose rig, animated camera, and reference overlay.

---

## References

- **Full Motion Previs Studio Docs**: [GitHub Repository](https://github.com/wassermanproductions/motion-previs-studio/tree/main/docs)
- **Seedance API Docs**: https://docs.runwayml.com/seedance
- **ComfyUI ControlNet**: https://github.com/lllyasviel/ControlNet
- **Blender Python API**: https://docs.blender.org/api/current/
- **OpenPose BODY_25 keypoints**: https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/02_output.md
