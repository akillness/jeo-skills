#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

function usage(code = 0) {
  console.log('Usage: node scripts/verify-media.mjs --file final.mp4 [--width 1080] [--height 1920] [--min-seconds 15] [--max-seconds 60] [--require-audio]');
  process.exit(code);
}

const args = process.argv.slice(2);
let file;
let width = 1080;
let height = 1920;
let minSeconds = 15;
let maxSeconds = 60;
let requireAudio = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--file') file = args[++i];
  else if (args[i] === '--width') width = Number(args[++i]);
  else if (args[i] === '--height') height = Number(args[++i]);
  else if (args[i] === '--min-seconds') minSeconds = Number(args[++i]);
  else if (args[i] === '--max-seconds') maxSeconds = Number(args[++i]);
  else if (args[i] === '--require-audio') requireAudio = true;
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!file) usage(2);
file = path.resolve(file);
const stat = await fs.lstat(file).catch(() => null);
if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`File is missing or symlinked: ${file}`);

async function findBinary(envName, name) {
  if (process.env[envName]) return process.env[envName];
  for (const candidate of [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`, path.join(process.env.HOME || '', '.local', 'bin', name)]) {
    const candidateStat = await fs.stat(candidate).catch(() => null);
    if (candidateStat?.isFile()) return candidate;
  }
  return name;
}
const ffprobeBin = await findBinary('FFPROBE_BIN', 'ffprobe');
const probe = spawnSync(ffprobeBin, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
if (probe.error) throw probe.error;
if (probe.status !== 0) {
  console.error(probe.stderr);
  process.exit(probe.status ?? 1);
}
const data = JSON.parse(probe.stdout);
const video = (data.streams || []).find((stream) => stream.codec_type === 'video');
const audio = (data.streams || []).find((stream) => stream.codec_type === 'audio');
const errors = [];
const warnings = [];

function ratio(value) {
  const [a, b] = String(value || '').split('/').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : NaN;
}
const duration = Number(data.format?.duration ?? video?.duration);
const fps = ratio(video?.avg_frame_rate || video?.r_frame_rate);

if (!video) errors.push('missing video stream');
else {
  if (video.width !== width || video.height !== height) errors.push(`expected ${width}x${height}, got ${video.width}x${video.height}`);
  if (video.codec_name !== 'h264') errors.push(`expected h264, got ${video.codec_name}`);
  if (video.pix_fmt !== 'yuv420p') errors.push(`expected yuv420p, got ${video.pix_fmt}`);
  if (!(fps >= 24 && fps <= 60)) errors.push(`fps must be 24..60, got ${fps}`);
}
const durationTolerance = Number.isFinite(fps) && fps > 0 ? Math.max(0.05, 2 / fps) : 0.1;
if (!(duration >= minSeconds - durationTolerance && duration <= maxSeconds + durationTolerance)) errors.push(`duration must be ${minSeconds}..${maxSeconds}s within ${durationTolerance.toFixed(3)}s frame tolerance, got ${duration}`);
if (requireAudio && !audio) errors.push('audio stream is required');
let audioPeakDbfs = null;
if (!audio) warnings.push('no audio stream');
else {
  if (audio.codec_name !== 'aac') warnings.push(`audio codec is ${audio.codec_name}, not aac`);
  const ffmpegBin = await findBinary('FFMPEG_BIN', 'ffmpeg');
  const volume = spawnSync(ffmpegBin, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });
  if (volume.error || volume.status !== 0) warnings.push('audio peak measurement failed');
  else {
    const match = String(volume.stderr || '').match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i);
    if (!match) warnings.push('audio peak was not reported');
    else if (match[1].toLowerCase() !== '-inf') audioPeakDbfs = Number(match[1]);
  }
}

const result = {
  verdict: errors.length ? 'FAIL' : 'PASS',
  file,
  bytes: stat.size,
  measured: {
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: Number.isFinite(fps) ? fps : null,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    video_codec: video?.codec_name ?? null,
    pixel_format: video?.pix_fmt ?? null,
    audio_codec: audio?.codec_name ?? null,
    audio_peak_dbfs: Number.isFinite(audioPeakDbfs) ? audioPeakDbfs : null
  },
  errors,
  warnings
};
console.log(JSON.stringify(result, null, 2));
process.exit(errors.length ? 1 : 0);
