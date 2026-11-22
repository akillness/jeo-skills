"""The hover-clip stage: one short muted loop per study, recorded in the same GPU browser.

Split out of `site_media_capture.py` (which owns the browser, the stills and the shared study
helpers) to keep both files small; imported lazily from there so the two can reference each other.
Every study gets a clip. A scene that visibly animates itself is recorded as it runs
(`motion: native`); a scene that does not is orbit-dragged so the clip still moves
(`motion: orbit`) instead of failing the run. "Visibly" is measured, not assumed: see
MOTION_PSNR_DB.
"""
import math
import tempfile
from pathlib import Path

import site_media_capture as cap
import site_media_encode as enc

# Diorama studies that look still at overview distance (mill wheel ~60 px): always drag-orbit,
# no measurement. The measurement agrees with them (both land above MOTION_PSNR_DB), so this set
# is the calibration anchor, not an exception.
CLIP_ORBIT = {'village', 'night-river'}
# Drag geometry, in viewport pixels. OrbitControls maps a drag of the full frame width to a 360
# deg azimuth sweep, so 220 px is about 62 deg spread over the recording: enough parallax for a
# diorama, and single props (well, tower, tree, bloch) read as a slow turntable at the same span,
# verified from extracted clip frames 2026-09-10. No per-study override is needed.
ORBIT_SPAN_PX, ORBIT_STEPS = 220, 48
# Motion bar, in dB of PSNR between two frames MOTION_MS apart: above it the two frames are the
# same picture to the eye, so the study is orbited instead. Calibrated 2026-09-10 against the two
# studies the maintainer had already called still at overview distance -- village measured 46.7 dB
# and night-river 45.2 dB - and against the studies that read as animated (night-mill 31.7,
# stag 34.6, cavern 35.3, night-bridge 39.0). Between those sit lantern 55.6, neuron 50.6,
# blue-hour 47.6, topology 45.7 and optics 42.3: a flame flicker or one travelling dot, which is
# not a hover animation. Identical frames measure as inf and land here too.
MOTION_PSNR_DB = 42.0


def unpause(page):
    """Night studies start paused; plate CSS hides #pause (display:none) but it stays clickable."""
    page.evaluate("""() => {const b = document.querySelector('#pause');
                     if (b && b.getAttribute('aria-pressed') === 'true') b.click();}""")


def motion_db(page, probe_dir, wait_ms):
    """How much the scene moves on its own over `wait_ms`, as PSNR in dB (higher = stiller).

    Raises rather than guessing when ffmpeg cannot compare the two frames: a silent fallback here
    would ship a still clip that nothing else in the pipeline checks.
    """
    first, second = probe_dir / 'motion-a.png', probe_dir / 'motion-b.png'
    first.write_bytes(page.screenshot(type='png'))
    page.wait_for_timeout(wait_ms)
    second.write_bytes(page.screenshot(type='png'))
    measured = enc.psnr_db(first, second)
    if measured is None:
        raise cap.StageError(f'ffmpeg could not measure motion between {first} and {second}', 5)
    return measured


def orbit_drag(page, duration_ms, steps=ORBIT_STEPS, span_px=ORBIT_SPAN_PX):
    """Left-drag across the canvas for `duration_ms`, spreading the sweep over the whole take."""
    x, y = cap.FRAME['width'] * 0.5, cap.FRAME['height'] * 0.55
    page.mouse.move(x, y); page.mouse.down()
    for step in range(1, steps + 1):
        page.mouse.move(x - span_px * step / steps, y, steps=2)
        page.wait_for_timeout(duration_ms / steps)
    page.mouse.up()


def record_clip(browser, base, example_id, work_dir):
    """Record one study for RECORD_MS; returns (flushed webm path, motion record)."""
    context = browser.new_context(viewport=cap.FRAME, record_video_dir=str(work_dir),
                                  record_video_size=cap.FRAME)
    page = context.new_page()
    try:
        cap.open_study(page, base, example_id)
        unpause(page)
        page.wait_for_timeout(400)
        forced = example_id in CLIP_ORBIT
        measured = None if forced else motion_db(page, work_dir, cap.MOTION_MS)
        native = not forced and measured < MOTION_PSNR_DB
        if native:
            page.wait_for_timeout(cap.RECORD_MS)
        else:
            orbit_drag(page, cap.RECORD_MS)
        source = Path(page.video.path())
    finally:
        context.close()   # the webm is only flushed when the context closes
    # Identical frames measure as inf, which is not valid JSON: the manifest carries those as null.
    reading = measured if measured is not None and math.isfinite(measured) else None
    return source, {'motion': 'native' if native else 'orbit', 'motion_psnr_db': reading}


def clips(browser, base, out_dir):
    """A hover clip per study: recorded at 1280x720, trimmed to a 4 s tail, dual-encoded."""
    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    with tempfile.TemporaryDirectory() as work_dir:
        for clip_id in cap.CLIP_IDS:
            source, motion = record_clip(browser, base, clip_id, Path(work_dir))
            for encoded in enc.clip_pair(source, out_dir, clip_id):
                records.append({**encoded, 'source': f'examples/{clip_id}/?plate=1 recording',
                                'crf': encoded['setting'], **motion})
            source.unlink(missing_ok=True)
    return records
