# Video Use — Hard Production Correctness Rules

These twelve rules are non-negotiable correctness constraints in `video-use`. Violating them leads to audible pops, subtitle masking, misaligned audio, or double encoding.

## 1. Subtitles Applied Last
Subtitles must be burned **last** in the FFmpeg filter chain after all graphic and animation overlays. If an overlay is placed after subtitles in the chain, it will cover and obscure the captions.

## 2. Segment Extract + Lossless Concat
Extract graded segments individually and concatenate them using lossless stream copying (`-c copy`). Never use a single monolithic complex filtergraph for the entire multi-cut video, which re-encodes the whole timeline whenever an overlay is adjusted.

## 3. 30ms Audio Fades at Boundaries
Every segment must have a 30ms audio fade-in and fade-out:
```text
afade=t=in:st=0:d=0.03,afade=t=out:st={duration-0.03}:d=0.03
```
Without this micro-fade, non-zero audio waveform crossings create loud audible pops and clicks at cut points.

## 4. Overlay Timestamp Shift
Any overlay animation inserted into the timeline must shift its presentation timestamp (PTS) to match its target window:
```text
setpts=PTS-STARTPTS+T/TB
```
Without this shift, the overlay starts rendering from time zero of the overlay video, causing the viewer to see the middle or end of the animation during its intended window.

## 5. Master SRT Timeline Offsets
Subtitle timecodes in `master.srt` must be calculated against the concatenated output timeline:
```text
output_time = word.start - segment_start + segment_offset
```
Never use original camera timestamps in the master subtitle file.

## 6. Snap Cuts to Word Boundaries
Always align cut points with word boundary timestamps provided by ElevenLabs Scribe. Never cut in the middle of a spoken word or phoneme.

## 7. Cut Padding
Add 30ms to 200ms of silence/breath padding around speech boundaries. Scribe timestamps can have 50–100ms variance; padding ensures the start consonant and trailing syllables are never clipped.

## 8. Verbatim Word-level ASR
Use verbatim word-level automatic speech recognition only. Do not enable automatic filler-word normalization or sentence-level simplification at the transcription stage, as editorial decisions require exact silence and hesitation signals.

## 9. Cache Transcripts
Store raw transcription results in `edit/transcripts/<name>.json`. Never re-transcribe footage unless the source media file's modification time or byte size changes.

## 10. Parallel Sub-agents for Overlays
When multiple animated overlays (HyperFrames, Remotion, Manim) are needed, spawn sub-agents in parallel rather than sequentially, minimizing wall-clock rendering latency.

## 11. Strategy Confirmation Before Execution
Always present a 4–8 sentence plain-English editing plan to the user and obtain explicit confirmation before modifying cut lists or rendering.

## 12. Write Only to `<videos_dir>/edit/`
All generated artifacts (`edl.json`, `takes_packed.md`, `project.md`, `preview.mp4`, `final.mp4`) must be written exclusively inside `<videos_dir>/edit/`. Source footage and the skill installation directory must remain unmodified.
