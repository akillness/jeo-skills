---
name: video-motion-previs
description: >
  Install and drive Motion Previs Studio v4 from the `video-motion-previs` CLI to turn reference video into pose, depth, camera-motion, control-layer, and AI-video/Blender production packs. Use when an agent must check or install the desktop app, import and trim a shot, run motion analysis, export a bundle, inspect its files, capture the app, or send a layer to Blockout. Triggers on: Motion Previs Studio, video motion previs, camera solve, pose extraction, OpenPose BODY_25, depth control video, production pack, motion-previs MCP.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Node.js 18+; packaged app supports macOS Apple Silicon and Windows 11 x64, while source development also supports Linux with explicit media runtime overrides. The app must be running for motion commands.
license: Apache-2.0
metadata:
  category: creative-media
  subcategory: motion
  interface: cli
  tags: video-motion, previsualization, ai-video, pose-extraction, depth, camera-motion, openpose, control-layers, cli, mcp
  version: "2.0.0"
  source: https://github.com/wassermanproductions/motion-previs-studio
---

# Video Motion Previs

Use the lightweight `video-motion-previs` wrapper to operate the real Motion Previs Studio v4 control API. The wrapper reads the app's localhost-only, token-protected discovery descriptor and calls the same allowlisted actions as the upstream MCP bridge.

## When to use this skill

Use this skill for reference-video analysis and Motion Previs Studio production packs. Route pure Blender scene scripting to a Blender skill, ComfyUI graph authoring to an AI-video/ComfyUI skill, web animation performance to `optimize-web-animations`, and general video editing to `video-production`.

This is not a fully headless renderer. A running Electron app owns MediaPipe, ffmpeg, UI state, analysis, and export. The CLI is the control surface, not a replacement analysis engine.

## Instructions

## 1. Check before installing

From this skill directory:

```bash
node scripts/video-motion-previs.mjs check
```

The JSON result distinguishes:

- a packaged install in `/Applications` or `~/Applications` on macOS;
- a source checkout from `MOTION_PREVIS_SOURCE` or common local paths;
- a live app with a healthy protocol-v1 control server;
- Node/platform incompatibility and stale discovery files.

Do not reinstall a healthy existing app by default. Motion Previs Studio's generated MediaPipe/model/runtime assets are relatively large, so keep installation idempotent.

## 2. Install only when needed

```bash
node scripts/video-motion-previs.mjs install
```

Installation policy:

- **macOS Apple Silicon:** use the inspected official upstream installer and latest arm64 release. Pass `--packaged` only when replacing a usable source checkout with the packaged app.
- **Windows 11 x64:** the CLI reports the official latest-release installer URL; installation remains user-visible because the upstream NSIS installer is unsigned and interactive.
- **Linux or Intel macOS:** use `install --source [DIR]` to clone the source, run `npm ci`, and prepare pinned SHA-256-verified runtime assets. Linux still needs explicit ffmpeg/ffprobe runtime overrides or PATH as documented upstream.

The upstream installer removes and replaces an existing `Motion Previs Studio v4.app`, so never force it without user intent.

Install the wrapper itself on PATH when terminal-wide access is desired:

```bash
node scripts/video-motion-previs.mjs link
video-motion-previs check
```

## 3. Launch and prove connectivity

```bash
video-motion-previs launch
video-motion-previs state
video-motion-previs screenshot /tmp/motion-previs.png
```

`launch` reuses a healthy running app, opens the packaged app when available, or starts a prepared source checkout. `state` is always the first motion command. It confirms loaded media, range, mode, analysis state, settings, last bundle, and Blockout availability.

If the descriptor exists but health fails, quit/relaunch the app. The descriptor is normally:

- macOS/Linux: `~/.config/motion-previs/control.json`
- Windows: `%APPDATA%\Motion Previs Studio\v4\control.json`
- override: `MOTION_PREVIS_CONFIG_DIR` or `MPS_CONFIG_DIR`

Never print or persist the bearer token in reports or committed files.

## Examples

## 4. Drive one shot from the CLI

Use explicit commands when human review is needed between stages:

```bash
video-motion-previs import-file "/absolute/path/to/shot.mp4"
video-motion-previs set-range 0 3
video-motion-previs set-mode camera_only
video-motion-previs set-settings '{"sampleFps":6,"resolution":"720p"}'
video-motion-previs analyze
video-motion-previs wait --timeout 900
video-motion-previs export
video-motion-previs list-bundle
```

Use the bounded workflow when all inputs are already approved:

```bash
video-motion-previs workflow "/absolute/path/to/shot.mp4" \
  --start 0 --end 3 --mode camera_only --sample-fps 6 --timeout 900
```

A URL can be used instead of a local path. Motion Previs Studio delegates compatible web-video downloads to `yt-dlp`:

```bash
video-motion-previs workflow "https://example.com/reference-video" \
  --start 2 --end 7 --mode actor_motion
```

Valid modes are `camera_only`, `actor_motion`, `object_motion`, and `full_scene`. Settings accepted upstream are `sampleFps`, `maxPeople`, `smoothing`, `detectionConfidence`, `trackingConfidence`, and `resolution` (`auto` or `720p`). Times are seconds.

## 5. Use raw actions only for advanced automation

```bash
video-motion-previs call get_state '{}'
video-motion-previs call send_to_blockout '{"which":"openpose"}'
```

The upstream v4.1 control surface has 11 allowlisted actions:

`get_state`, `import_file`, `import_url`, `set_range`, `set_mode`, `set_settings`, `run_analysis`, `export_pack`, `list_bundle`, `send_to_blockout`, and `screenshot`.

For an MCP client rather than direct CLI control, point it at the upstream zero-dependency bridge:

```bash
claude mcp add motion-previs -- node "/ABSOLUTE/PATH/motion-previs-studio/mcp/motion-previs-mcp.mjs"
```

The app must still be running. The bridge discovers port and token automatically.

## Best practices

## 6. Verify output instead of assuming success

After `export`, require both the returned bundle path and a successful `list-bundle`. Depending on selected controls and local model availability, a pack can include `reference.mp4`, depth/edge/line-art/motion/pose videos, `openpose_keypoints.json`, `camera_motion.json`, Blender import scripts, `comfyui_manifest.json`, prompt/shot-bible files, quality reports, and `bundle_manifest.json`.

Verification gate:

1. `state` reports `analysis.status: "done"` before export.
2. `export` returns `bundlePath` and `zipPath`.
3. `list-bundle` matches the controls requested; optional layers are not promised unconditionally.
4. Inspect `bundle_manifest.json` and `quality_report.json` before downstream generation.
5. Test a short 3–5 second range before processing a long clip.

## Troubleshooting

- **App is not running:** run `launch`, wait for `state`, then retry.
- **Stale descriptor:** fully quit both packaged and source instances, remove only the stale `control.json`, and relaunch.
- **No media loaded:** run `import-file` or `import-url` before analysis.
- **Export says no completed analysis:** poll with `wait` until status is `done`; do not export while `running` or after `error`.
- **Pose is weak:** shorten the range, improve subject visibility, lower sampling cost for a diagnostic pass, and inspect quality/pose diagnostics.
- **Camera solve follows the subject:** compare `camera_only` and `full_scene`; the solver uses subject-masked background optical flow.
- **Depth unavailable:** allow the supported CPU/WASM fallback, or export without that optional layer.
- **Blockout unavailable:** launch Blockout and open its destination project before `send-to-blockout`.

## References

This workflow was checked against upstream v4.1.0 at commit `95e7d0ff1d4cc546f7eb09a74ccbd084988a19bc`. The verified surfaces are `README.md`, `package.json`, `install.sh`, `mcp/README.md`, `mcp/motion-previs-mcp.mjs`, `electron/control.cjs`, and `src/control/handler.ts`. Preserve upstream `LICENSE`, `NOTICE`, and third-party attribution when redistributing the app.
