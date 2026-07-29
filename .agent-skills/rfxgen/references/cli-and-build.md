# CLI and build notes

## Asset contract

Keep the `.rfx` parameter source next to each exported sound. Treat WAV/raw/header output as build artifacts and record sample rate, sample size, channels, and intended event in the asset manifest.

## Build route

1. Prefer an existing official binary or the official WebAssembly editor for sound design.
2. For a source build, clone a pinned revision and run CMake in a separate build directory.
3. Keep dependency fetching explicit; raylib and platform audio libraries may require network access and development packages.
4. Run the generated binary's help output before relying on flags because CLI options can change between revisions.

## Verification checklist

- output exists and has non-zero size;
- `ffprobe` reports the requested sample rate, sample format, and channel count;
- peak amplitude is not clipped;
- tail length is appropriate for repeated playback;
- the sound remains recognizable when overlapped with itself;
- source, output, and license metadata are retained.
