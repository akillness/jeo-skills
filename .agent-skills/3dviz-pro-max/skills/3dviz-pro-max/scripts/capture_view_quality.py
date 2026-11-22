"""Measure whether a captured frame is usable at all: near-black, wall-filled or flat.

Loaded by capture.py. The measurement runs in the page's own JavaScript on a 2D canvas the
frame is decoded into, so no image library is needed on the Python side and the app's WebGL
context does not have to be created with `preserveDrawingBuffer`. It records numbers; the
single classify() call below is the only place that turns numbers into a verdict.
"""
import base64

# One dict, tuned on the phase-9 eval frames (the calibration table is in
# plans/reports/worker-260909-phase-10b-capture-usable-view-item9.md). The luma is gamma-space
# Rec.709 on 0-1, not linear light: these thresholds are read off screenshots, not off render
# targets.
#   near_black_*     a frame the camera put inside geometry — nothing left to inspect. The mean
#                    floor is 0.04 and not 0.08 because a lantern-lit village at night measures
#                    0.047 and is perfectly legible (eval run 2's overview); run 4's `lane`, shot
#                    from inside a building, measures 0.025 with 92 % of its pixels under 0.06.
#   flat_*           a block occluder: the largest connected block of cells sitting more than
#                    flat_luma_gap off the frame's median cell. Cell means, not intra-cell
#                    variance — a textured T2/T3 wall is uniform in tone but not in pixels.
#   wall_*           a wall across the near plane: a run of adjacent columns whose top-to-bottom
#                    profile is flat (no sky, no ground line, no horizon) at a value far from the
#                    rest of the frame. Run 4's `square` reads 0.22 of the width at a 0.33 gap;
#                    no undamaged frame in the five eval runs passes 0.09 at that gap.
#   low_contrast_*   a washed or fogged-out frame with no readable structure.
#   grid_*           the coarse grid both tests run on (32x18 = 576 cells).
THRESHOLDS = {'dark_luma': 0.06, 'near_black_luma_mean': 0.04, 'near_black_dark_fraction': 0.85,
              'flat_min_fraction': 0.30, 'flat_luma_gap': 0.25,
              'wall_min_fraction': 0.20, 'wall_column_std': 0.03,
              'low_contrast_luma_std': 0.04, 'grid_cols': 32, 'grid_rows': 18}

# Decode the PNG through the browser's own decoder, then one pass over the pixels of the
# measured region for the global stats and the cell means the flat test runs on.
MEASURE_JS = """async ({dataUrl, t, region}) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const iw = image.naturalWidth, ih = image.naturalHeight;
  if (!iw || !ih) throw new Error('empty frame');
  const x0 = region ? Math.max(0, Math.round(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.round(region.y)) : 0;
  const w = Math.max(1, Math.min(iw - x0, region ? Math.round(region.width) : iw));
  const h = Math.max(1, Math.min(ih - y0, region ? Math.round(region.height) : ih));
  const canvas = document.createElement('canvas');
  canvas.width = iw; canvas.height = ih;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(x0, y0, w, h).data;
  const CX = t.grid_cols, CY = t.grid_rows, N = CX * CY;
  const sums = new Float64Array(N), counts = new Float64Array(N);
  let sum = 0, sumsq = 0, dark = 0;
  for (let y = 0; y < h; y++) {
    const row = Math.min(CY - 1, (y * CY / h) | 0) * CX;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const luma = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum += luma; sumsq += luma * luma;
      if (luma < t.dark_luma) dark++;
      const k = row + Math.min(CX - 1, (x * CX / w) | 0);
      sums[k] += luma; counts[k]++;
    }
  }
  const n = w * h, mean = sum / n;
  const cell = new Float64Array(N);
  for (let k = 0; k < N; k++) cell[k] = counts[k] ? sums[k] / counts[k] : 0;
  const median = Array.from(cell).sort((a, b) => a - b)[N >> 1];
  // Largest 4-connected block of cells more than flat_luma_gap off the median, on either side:
  // a lit wall at the near plane, or an unlit one across a bright frame.
  let best = [];
  for (const sign of [1, -1]) {
    const off = (k) => sign > 0 ? cell[k] >= median + t.flat_luma_gap
                                : cell[k] <= median - t.flat_luma_gap;
    const seen = new Uint8Array(N);
    for (let start = 0; start < N; start++) {
      if (seen[start] || !off(start)) continue;
      const stack = [start], cluster = [];
      seen[start] = 1;
      while (stack.length) {
        const k = stack.pop(); cluster.push(k);
        const cx = k % CX, cy = (k / CX) | 0;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= CX || ny >= CY) continue;
          const j = ny * CX + nx;
          if (!seen[j] && off(j)) { seen[j] = 1; stack.push(j); }
        }
      }
      if (cluster.length > best.length) best = cluster;
    }
  }
  const inCluster = new Uint8Array(N);
  for (const k of best) inCluster[k] = 1;
  let clusterSum = 0, restSum = 0, restCount = 0;
  for (let k = 0; k < N; k++) {
    if (inCluster[k]) clusterSum += cell[k]; else { restSum += cell[k]; restCount++; }
  }
  // Longest run of adjacent columns with no vertical structure, and how far that band sits
  // from the columns around it: the signature of a wall standing across the near plane.
  const colMean = [], colFlat = [];
  for (let cx = 0; cx < CX; cx++) {
    let s = 0, q = 0;
    for (let cy = 0; cy < CY; cy++) { const v = cell[cy * CX + cx]; s += v; q += v * v; }
    const m = s / CY;
    colMean.push(m);
    colFlat.push(Math.sqrt(Math.max(0, q / CY - m * m)) < t.wall_column_std);
  }
  let band = {length: 0, start: 0}, run = 0;
  for (let cx = 0; cx < CX; cx++) {
    run = colFlat[cx] ? run + 1 : 0;
    if (run > band.length) band = {length: run, start: cx - run + 1};
  }
  let bandSum = 0, outSum = 0, outCount = 0;
  for (let cx = 0; cx < CX; cx++) {
    if (cx >= band.start && cx < band.start + band.length) bandSum += colMean[cx];
    else { outSum += colMean[cx]; outCount++; }
  }
  const r = (v) => Math.round(v * 10000) / 10000;
  return {
    region: {x: x0, y: y0, width: w, height: h},
    wall_fraction: r(band.length / CX),
    wall_columns: band.length,
    wall_luma: band.length ? r(bandSum / band.length) : null,
    wall_rest_luma: outCount ? r(outSum / outCount) : null,
    luma_mean: r(mean),
    luma_std: r(Math.sqrt(Math.max(0, sumsq / n - mean * mean))),
    luma_median_cell: r(median),
    dark_fraction: r(dark / n),
    flat_fraction: r(best.length / N),
    flat_cells: best.length,
    flat_luma: best.length ? r(clusterSum / best.length) : null,
    rest_luma: restCount ? r(restSum / restCount) : null
  };
}"""

# The scene's own canvas, when the page has exactly one: measuring the whole screenshot would
# charge the app's side panel as part of the frame.
CANVAS_REGION_JS = """() => {
  const canvases = document.querySelectorAll('canvas');
  if (canvases.length !== 1) return null;
  const r = canvases[0].getBoundingClientRect();
  return r.width >= 64 && r.height >= 64
    ? {x: r.x, y: r.y, width: r.width, height: r.height} : null;
}"""


def _gap(stats, key, rest_key):
    """How far a measured region sits from the rest of the frame; 0 when there is no region."""
    region, rest = stats.get(key), stats.get(rest_key)
    return abs(region - rest) if region is not None and rest is not None else 0.0


def classify(stats, thresholds=THRESHOLDS):
    """(usable, reason) for one frame's numbers. The order is the order of severity."""
    if (stats['luma_mean'] < thresholds['near_black_luma_mean']
            or stats['dark_fraction'] > thresholds['near_black_dark_fraction']):
        return False, 'near-black'
    block = (stats['flat_fraction'] > thresholds['flat_min_fraction']
             and _gap(stats, 'flat_luma', 'rest_luma') > thresholds['flat_luma_gap'])
    wall = (stats.get('wall_fraction', 0) > thresholds['wall_min_fraction']
            and _gap(stats, 'wall_luma', 'wall_rest_luma') > thresholds['flat_luma_gap'])
    if block or wall:
        return False, 'flat-occluder'
    if stats['luma_std'] < thresholds['low_contrast_luma_std']:
        return False, 'low-contrast'
    return True, 'usable'


def canvas_region(page):
    """The single scene canvas' rect in CSS pixels, or None when the page has no one canvas."""
    try:
        return page.evaluate(CANVAS_REGION_JS)
    except Exception:
        return None


def measure_png(page, png_bytes, thresholds=THRESHOLDS, region=None):
    """Measure one PNG frame in the page. Never raises: a failure is logged, not fatal."""
    url = 'data:image/png;base64,' + base64.b64encode(png_bytes).decode('ascii')
    try:
        stats = page.evaluate(MEASURE_JS, {'dataUrl': url, 't': thresholds, 'region': region})
    except Exception as error:
        return {'measured': False, 'usable': None, 'reason': 'not-measured',
                'error': str(error)[:200]}
    usable, reason = classify(stats, thresholds)
    stats.update(measured=True, usable=usable, reason=reason)
    return stats


def frame_png(page, path, image_format='png', full_page=False):
    """The frame's bytes as PNG. A JPEG capture is re-shot as PNG for the measurement only."""
    if image_format == 'png':
        return path.read_bytes()
    return page.screenshot(full_page=full_page, type='png')


def for_entry(page, out, image_format, full_page, entry, region=None):
    """view_quality for a capture entry already written to `out`."""
    try:
        png = frame_png(page, out / entry['file'], image_format, full_page)
    except Exception as error:
        return {'measured': False, 'usable': None, 'reason': 'not-measured',
                'error': str(error)[:200]}
    return measure_png(page, png, THRESHOLDS, region)


def unusable(views):
    """Names of the captured views the measurement flagged, in capture order."""
    return [view['name'] for view in views
            if (view.get('view_quality') or {}).get('usable') is False]
