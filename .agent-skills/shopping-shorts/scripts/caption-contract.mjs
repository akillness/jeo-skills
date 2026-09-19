import crypto from 'node:crypto';

export const CAPTION_GENERATOR = 'shopping-shorts-typewriter-ass/v1';
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const colorPattern = /^#[0-9A-Fa-f]{6}$/;

export function graphemes(value) {
  return [...segmenter.segment(String(value))].map((part) => part.segment);
}

export function wrapCaptionText(value, maxChars) {
  const words = String(value).trim().split(/\s+/u).filter(Boolean);
  const lines = [''];
  for (const word of words) {
    const current = lines.at(-1);
    const proposed = current ? `${current} ${word}` : word;
    if (graphemes(proposed).length <= maxChars) {
      lines[lines.length - 1] = proposed;
      continue;
    }
    if (current) lines.push('');
    const wordParts = graphemes(word);
    while (wordParts.length) {
      const chunk = wordParts.splice(0, maxChars).join('');
      if (lines.at(-1)) lines.push(chunk);
      else lines[lines.length - 1] = chunk;
      if (wordParts.length) lines.push('');
    }
  }
  return lines.filter(Boolean);
}

function exactKeys(value, allowed, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) errors.push(`${label} has unexpected keys: ${unexpected.join(', ')}`);
}

export function validateCaptionPlan(plan, { durationSeconds = null } = {}) {
  const errors = [];
  exactKeys(plan, ['schema_version', 'style', 'cues'], 'caption plan', errors);
  if (plan?.schema_version !== 1) errors.push('caption plan schema_version must be 1');
  const style = plan?.style || {};
  exactKeys(style, ['animation', 'font_family', 'font_size', 'primary_color', 'outline_color', 'outline_width', 'max_lines', 'max_chars_per_line', 'typing_ms_per_character', 'minimum_hold_ms', 'margin_v'], 'style', errors);
  if (style.animation !== 'typewriter') errors.push('caption animation must be typewriter');
  if (typeof style.font_family !== 'string' || !style.font_family.trim() || /[,\r\n]/u.test(style.font_family)) errors.push('font_family must be a non-empty ASS-safe name');
  if (!Number.isInteger(style.font_size) || style.font_size < 32 || style.font_size > 120) errors.push('font_size must be 32..120');
  if (!colorPattern.test(style.primary_color || '')) errors.push('primary_color must be #RRGGBB');
  if (!colorPattern.test(style.outline_color || '')) errors.push('outline_color must be #RRGGBB');
  if (!Number.isFinite(style.outline_width) || style.outline_width < 0 || style.outline_width > 8) errors.push('outline_width must be 0..8');
  if (style.max_lines !== 2) errors.push('max_lines must be exactly 2');
  if (!Number.isInteger(style.max_chars_per_line) || style.max_chars_per_line < 8 || style.max_chars_per_line > 26) errors.push('max_chars_per_line must be 8..26');
  if (!Number.isInteger(style.typing_ms_per_character) || style.typing_ms_per_character < 25 || style.typing_ms_per_character > 150) errors.push('typing_ms_per_character must be 25..150');
  if (!Number.isInteger(style.minimum_hold_ms) || style.minimum_hold_ms < 300 || style.minimum_hold_ms > 5000) errors.push('minimum_hold_ms must be 300..5000');
  if (!Number.isInteger(style.margin_v) || style.margin_v < 120 || style.margin_v > 520) errors.push('margin_v must be 120..520');
  if (!Array.isArray(plan?.cues) || plan.cues.length < 1 || plan.cues.length > 60) errors.push('cues must contain 1..60 entries');

  const cueIds = new Set();
  const normalizedCues = [];
  let previousEnd = 0;
  for (const [index, cue] of (plan?.cues || []).entries()) {
    const label = `cues[${index}]`;
    exactKeys(cue, ['cue_id', 'start_seconds', 'end_seconds', 'text'], label, errors);
    if (!/^t\d{2,}$/u.test(cue?.cue_id || '') || cueIds.has(cue?.cue_id)) errors.push(`${label}.cue_id is invalid or duplicated`);
    cueIds.add(cue?.cue_id);
    if (!Number.isFinite(cue?.start_seconds) || cue.start_seconds < 0) errors.push(`${label}.start_seconds is invalid`);
    if (!Number.isFinite(cue?.end_seconds) || cue.end_seconds <= Number(cue?.start_seconds || 0) || cue.end_seconds > 180) errors.push(`${label}.end_seconds is invalid`);
    if (index > 0 && Number(cue?.start_seconds) < previousEnd) errors.push(`${label} overlaps the previous cue`);
    previousEnd = Number(cue?.end_seconds || previousEnd);
    if (durationSeconds !== null && Number.isFinite(cue?.end_seconds) && cue.end_seconds > durationSeconds + 0.05) errors.push(`${label}.end_seconds exceeds output duration`);
    if (typeof cue?.text !== 'string' || !cue.text.trim() || /[\r\n]/u.test(cue.text)) errors.push(`${label}.text must be one non-empty source line`);
    const lines = wrapCaptionText(String(cue?.text || ''), style.max_chars_per_line || 1);
    if (lines.length > 2) errors.push(`${label}.text exceeds two lines; split it into shorter cues`);
    const glyphCount = graphemes(lines.join('')).length;
    const typingSeconds = glyphCount * Number(style.typing_ms_per_character || 0) / 1000;
    const cueDuration = Number(cue?.end_seconds || 0) - Number(cue?.start_seconds || 0);
    if (typingSeconds + Number(style.minimum_hold_ms || 0) / 1000 > cueDuration) errors.push(`${label}.text cannot finish typing and hold within the cue duration`);
    normalizedCues.push({ cue, lines, glyphCount, typingSeconds });
  }
  const eventCount = normalizedCues.reduce((sum, item) => sum + item.glyphCount + 1, 0);
  if (eventCount > 3000) errors.push('caption plan would create more than 3000 ASS events');
  return { errors, normalizedCues, eventCount };
}

function assColor(hex) {
  const value = hex.slice(1);
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`;
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAss(value) {
  return value.replaceAll('\\', '／').replaceAll('{', '｛').replaceAll('}', '｝');
}

export function captionPlanSha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function renderCaptionAss(plan, sourceSha256) {
  const { errors, normalizedCues } = validateCaptionPlan(plan);
  if (errors.length) throw new Error(errors.join('; '));
  const style = plan.style;
  const events = [];
  for (const item of normalizedCues) {
    const { cue, lines, glyphCount, typingSeconds } = item;
    const firstLineLength = graphemes(lines[0]).length;
    const allGlyphs = graphemes(lines.join(''));
    const step = style.typing_ms_per_character / 1000;
    const renderPrefix = (count) => {
      const first = allGlyphs.slice(0, Math.min(count, firstLineLength)).join('');
      const second = count > firstLineLength ? allGlyphs.slice(firstLineLength, count).join('') : '';
      return second ? `${escapeAss(first)}\\N${escapeAss(second)}` : escapeAss(first);
    };
    for (let index = 1; index <= glyphCount; index += 1) {
      const start = cue.start_seconds + (index - 1) * step;
      const end = cue.start_seconds + index * step;
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${renderPrefix(index)}`);
    }
    events.push(`Dialogue: 0,${assTime(cue.start_seconds + typingSeconds)},${assTime(cue.end_seconds)},Default,,0,0,0,,${renderPrefix(glyphCount)}`);
  }
  return `[Script Info]\n; Generated by shopping-shorts. Do not hand-edit.\n; Generator: ${CAPTION_GENERATOR}\n; SourceSHA256: ${sourceSha256}\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.font_family},${style.font_size},${assColor(style.primary_color)},${assColor(style.primary_color)},${assColor(style.outline_color)},&H80000000,-1,0,0,0,100,100,0,0,1,${style.outline_width},1,2,90,90,${style.margin_v},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}
