# Editing an approved soundtrack

Use this workflow when the director requests an audio change. Keep the original recording, current
approved master, and candidates separate. Record the source asset or file hash, sample rate,
channels, requested words, destination window, candidate source window, model parameters, selected
take, and crossfade lengths in the project's edit notes.

## Choose the smallest useful edit

- **Pronunciation or one lyric:** audition a corrected performance, then replace only that phrase.
  Build the sheet sent to the model from the hand-corrected `analysis/lyrics.txt`, changing only the
  target word: a sheet that differs elsewhere makes the take sing other lines differently, which
  leaves only the target span usable. Repaint supplies a new take within a window; it does not
  guarantee the same singer, melody or backing. The `scenario-ace-step` skill explains when a
  high-strength Cover candidate is worth trying for voice continuity, and the Repaint recipe for
  changing sung words. Do not regenerate the whole soundtrack into the final cut merely to repair
  one line.
- **Different energy, genre or singer:** offer distinct short auditions before recutting the
  picture. A new recording needs a new timing analysis even if its requested BPM and lyrics match.
- **Trim, remove, repeat or rearrange existing material:** use deterministic editing. Prefer musical
  phrase boundaries and verify both joins; a crossfade alone does not fix a cut across a sung
  syllable or conflicting beats.

For generation, discover the named family with `search`, inspect the selected member with
`model_schema_get`, and upload the source or reuse its asset id. Use the current schema and sibling
skill for model-specific fields, not guessed parameters. Price each distinct payload with
`model_run(dry_run=true)` inside the authorized budget, launch with `wait=false`, and use
`jobs_wait` again on pending jobs. A timeout is not a reason to regenerate. Display candidates with
`asset_display`; download with `asset_download` without an audio conversion `format`.

## Audition before replacing

Locate the phrase with the supplied lyrics, waveform and transcription together. Give the model
enough context around consonants and breaths; record the replacement interval separately from that
context. A returned file may be a full song or a section: inspect its duration and align the
intended span in both recordings instead of assuming its origin is zero or that its timestamps match
the master.

Present short original/candidate previews with identical surrounding context and clear take labels.
For acronyms, a phonetic spelling can help the model sing separate letters; retain normal spelling
in displayed lyrics. Compare pronunciation, singer identity, pitch, rhythm, accompaniment, loudness
and transitions. Neither a transcript nor waveform similarity proves that it sounds right. If
listening is unavailable, state that limitation and let the director select from previews. An
existing selection authorizes applying that take without another confirmation once its span is
located in both recordings; a selected take that lacks the corrected performance goes back to the
director with the measurements, and the master stays. If no candidate works, keep the master and
revise the attempt only within the authorized retry scope and budget. Unattended, with no prior take
selection or explicit delegation to choose, stop after saving the labeled previews and list the
pending choice; do not apply a take or spend on another batch to avoid waiting.

## Apply the selected span

Cut the span locally from the downloaded take's lossless decode by default: it is free, places both
boundaries on any sample, and the cut lands where the splice happens. The fixed first-party audio
trimmer `model_scenario-audio-cut` (the platform's one deterministic audio trimmer) suits a span
that must stay on Scenario as an asset. Inspect its schema first: at authoring time its times moved
in 0.1 s steps, and its download is the file as produced, a WAV with `outputFormat` wav. Round its
window outward so the whole phrase survives, or upload the local cut with `upload_asset` when the
clip must keep exact boundaries. As documented in `scenario-ace-step`, downloaded spans can be
spliced locally because MCP has no audio-join tool; do not invent a join API or substitute another
generative run.

Decode the original once to a lossless working master. Match the candidate's sample rate and channel
layout, align it to the destination, and preserve the original sample count for an in-place
correction. Do not stretch the whole song to fit a patch. Start with short crossfades, for example
10-30 ms, adjust by audition, and keep every blended sample inside the declared edit window. Match
gain locally rather than normalizing the whole master. Compare decoded samples outside the window
for exact equality before lossy export. A deliberately length-changing edit instead needs an
explicit timeline mapping and new downstream timings.

## Reconnect and verify

Save a uniquely named master and point `engine/data/audio.json.master` at it. Use a new basename for
analysis: `audio_analysis.py` reuses stems already present under that name. Transcription, plots and
vocal slices must use the stem for the master named in `engine/data/audio.json`, resolved by
`audio_paths.py`; a missing stem is an error, never a reason to use an older take. Refresh the vocal
stems and envelopes, rerun transcription before alignment, and regenerate affected vocal slices and
lip-sync shots. For an in-place correction, keep the approved beat events and word timings outside
the edit windows and take the new values only inside them: the analysis tools rewrite every event,
and in one test moved a downbeat 0.5 s and words up to 2 s on unchanged audio. If timing or
structure changed, rerun analysis and update cuts, beat accents and lip-sync footage.

Check sample count, clipping, boundary clicks, gaps and local loudness, and audition each join in
context. Render a preview with the actual captions and cuts, then run `av_sync_check.py` against the
approved master. Exact sample preservation is a lossless-master claim, not a claim about an AAC/MP3
export. For picture-only revisions, stream-copy the approved encoded audio when container
compatibility and duration allow; otherwise encode from the approved master once and check timing.
Report what was measured, what was auditioned, and any remaining uncertainty separately.
