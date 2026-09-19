#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { captionPlanSha256, renderCaptionAss, validateCaptionPlan } from './caption-contract.mjs';

function usage(code = 0) {
  console.log('Usage: node scripts/assemble-short.mjs --timeline timeline.json --output final.mp4 [--execute]\nDefault prints the exact ffmpeg argv without running it.');
  process.exit(code);
}

const args = process.argv.slice(2);
let timelinePath;
let outputPath;
let execute = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--timeline') timelinePath = args[++i];
  else if (args[i] === '--output') outputPath = args[++i];
  else if (args[i] === '--execute') execute = true;
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!timelinePath || !outputPath) usage(2);

timelinePath = path.resolve(timelinePath);
const timelineDir = path.dirname(timelinePath);
const runRoot = path.dirname(timelineDir);

async function containsSymlinkSegment(rootPath, targetPath) {
  const rootAbsolute = path.resolve(rootPath);
  const targetAbsolute = path.resolve(targetPath);
  const relative = path.relative(rootAbsolute, targetAbsolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return true;
  let current = rootAbsolute;
  const rootStat = await fs.lstat(current).catch(() => null);
  if (!rootStat || rootStat.isSymbolicLink()) return true;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return true;
  }
  return false;
}

if (await containsSymlinkSegment(runRoot, timelinePath)) throw new Error('timeline contains a missing or symlinked path segment');
const rootReal = await fs.realpath(runRoot);
const timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
const errors = [];

if (timeline.width !== 1080 || timeline.height !== 1920) errors.push('timeline must be 1080x1920');
if (!(Number.isFinite(timeline.fps) && timeline.fps >= 24 && timeline.fps <= 60)) errors.push('timeline fps must be 24..60');
if (!Array.isArray(timeline.clips) || timeline.clips.length < 1 || timeline.clips.length > 8) errors.push('timeline must contain 1..8 clips');
if (!(Number.isFinite(timeline.output_duration_seconds) && timeline.output_duration_seconds >= 15 && timeline.output_duration_seconds <= 60)) errors.push('output duration must be 15..60 seconds');

async function resolveExisting(rel, label) {
  if (!rel) return null;
  const absolute = path.resolve(timelineDir, rel);
  const stat = await fs.lstat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || await containsSymlinkSegment(runRoot, absolute)) {
    errors.push(`${label} is missing or symlinked: ${rel}`);
    return null;
  }
  const real = await fs.realpath(absolute);
  if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) {
    errors.push(`${label} escapes run root: ${rel}`);
    return null;
  }
  return real;
}

const clipPaths = [];
let clipDuration = 0;
for (const [index, clip] of (timeline.clips || []).entries()) {
  if (!(Number.isFinite(clip.duration_seconds) && clip.duration_seconds > 0)) errors.push(`clips[${index}] has invalid duration`);
  clipDuration += Number(clip.duration_seconds || 0);
  clipPaths.push(await resolveExisting(clip.path, `clips[${index}]`));
}
if (Math.abs(clipDuration - Number(timeline.output_duration_seconds || 0)) > 0.5) errors.push(`clip durations (${clipDuration}) must equal output duration (${timeline.output_duration_seconds})`);

const voiceover = await resolveExisting(timeline.voiceover, 'voiceover');
const music = await resolveExisting(timeline.music, 'music');
const captionPlan = await resolveExisting(timeline.caption_plan, 'caption_plan');
const captions = await resolveExisting(timeline.captions, 'captions');
if (Boolean(captionPlan) !== Boolean(captions)) errors.push('caption_plan and captions must either both be present or both be null');
if (captionPlan && captions) {
  let captionPlanJson = null;
  let captionPlanBytes = null;
  try {
    captionPlanBytes = await fs.readFile(captionPlan);
    captionPlanJson = JSON.parse(captionPlanBytes.toString('utf8'));
  } catch {}
  const captionValidation = captionPlanJson ? validateCaptionPlan(captionPlanJson, { durationSeconds: timeline.output_duration_seconds }) : { errors: ['caption plan is invalid'] };
  for (const error of captionValidation.errors) errors.push(`caption_plan: ${error}`);
  if (path.extname(captions).toLowerCase() !== '.ass') errors.push('typewriter captions must be rendered as an .ass file');
  if (captionPlanBytes && captionPlanJson && !captionValidation.errors.length) {
    const captionPlanSha = captionPlanSha256(captionPlanBytes);
    const captionOutputText = await fs.readFile(captions, 'utf8').catch(() => '');
    const expectedCaptionOutput = renderCaptionAss(captionPlanJson, captionPlanSha);
    if (captionOutputText !== expectedCaptionOutput) errors.push('rendered captions are stale or do not match caption_plan');
  }
}
outputPath = path.resolve(outputPath);
const outputParentPath = path.dirname(outputPath);
const outputParent = await fs.realpath(outputParentPath).catch(() => null);
const outputLeaf = await fs.lstat(outputPath).catch(() => null);
if (outputLeaf?.isSymbolicLink()) errors.push('output must not be a symlink');
if (!outputParent || await containsSymlinkSegment(runRoot, outputParentPath) || (outputParent !== rootReal && !outputParent.startsWith(`${rootReal}${path.sep}`))) errors.push('output must be inside the current run root, have no symlinked segments, and its parent must exist');

if (errors.length) {
  console.error(JSON.stringify({ verdict: 'FAIL', errors }, null, 2));
  process.exit(1);
}

async function findBinary(envName, name) {
  if (process.env[envName]) return process.env[envName];
  for (const candidate of [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`, path.join(process.env.HOME || '', '.local', 'bin', name)]) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  return name;
}
const ffmpegBin = await findBinary('FFMPEG_BIN', 'ffmpeg');
const ffmpegArgs = ['-hide_banner', '-y'];
for (const clip of clipPaths) ffmpegArgs.push('-i', clip);
let nextInput = clipPaths.length;
let voiceInput = null;
let musicInput = null;
if (voiceover) {
  voiceInput = nextInput++;
  ffmpegArgs.push('-i', voiceover);
}
if (music) {
  musicInput = nextInput++;
  ffmpegArgs.push('-stream_loop', '-1', '-i', music);
}

const filters = [];
for (let i = 0; i < clipPaths.length; i += 1) {
  filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${timeline.fps},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
}
filters.push(`${clipPaths.map((_, index) => `[v${index}]`).join('')}concat=n=${clipPaths.length}:v=1:a=0[vcat]`);

function escapeFilterPath(value) {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}
if (captions) filters.push(`[vcat]subtitles='${escapeFilterPath(captions)}'[vout]`);
else filters.push('[vcat]null[vout]');

let audioLabel = null;
if (voiceInput !== null && musicInput !== null) {
  const gain = Number.isFinite(timeline.music_gain_db) ? timeline.music_gain_db : -18;
  filters.push(`[${voiceInput}:a]aresample=48000,asetpts=PTS-STARTPTS[vo]`);
  filters.push(`[${musicInput}:a]aresample=48000,volume=${gain}dB,asetpts=PTS-STARTPTS[bg]`);
  filters.push('[vo][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]');
  audioLabel = '[aout]';
} else if (voiceInput !== null) {
  filters.push(`[${voiceInput}:a]aresample=48000,asetpts=PTS-STARTPTS[aout]`);
  audioLabel = '[aout]';
} else if (musicInput !== null) {
  const gain = Number.isFinite(timeline.music_gain_db) ? timeline.music_gain_db : -18;
  filters.push(`[${musicInput}:a]aresample=48000,volume=${gain}dB,asetpts=PTS-STARTPTS[aout]`);
  audioLabel = '[aout]';
}

ffmpegArgs.push('-filter_complex', filters.join(';'), '-map', '[vout]');
if (audioLabel) ffmpegArgs.push('-map', audioLabel, '-c:a', 'aac', '-b:a', '192k');
else ffmpegArgs.push('-an');
ffmpegArgs.push('-t', String(timeline.output_duration_seconds), '-r', String(timeline.fps), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-video_track_timescale', '90000', '-movflags', '+faststart', outputPath);

console.log(JSON.stringify({ verdict: 'PASS', execute, command: ffmpegBin, argv: ffmpegArgs, output: outputPath }, null, 2));
if (!execute) process.exit(0);
const result = spawnSync(ffmpegBin, ffmpegArgs, { stdio: 'inherit', timeout: 20 * 60 * 1000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const finalStat = await fs.stat(outputPath);
console.log(JSON.stringify({ verdict: 'PASS', output: outputPath, bytes: finalStat.size }, null, 2));
