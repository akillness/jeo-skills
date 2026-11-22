// SPDX-License-Identifier: Apache-2.0
// `sprite-gen face-bake`'s door to a pack's player: node face_plan.mjs <player.mjs> <face-pack.json> <samples.f32>
// <args.json> <out.json>. It runs the pack's own copy of the player (the one a live page loads): the voice's mouth
// levels (`mouthTrack`), then what every frame shows (`planScene`).
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [player, packPath, samplesPath, argsPath, outPath] = process.argv.slice(2);
const { mouthTrack, planScene } = await import(pathToFileURL(player).href);
const pack = JSON.parse(readFileSync(packPath, "utf8"));
const args = JSON.parse(readFileSync(argsPath, "utf8"));
const bytes = readFileSync(samplesPath);
const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
const track = mouthTrack(samples, args.rate, pack.rules, { fps: pack.fps, tags: args.tags });
const plan = planScene(pack, { play: args.play, start: args.start, levels: track.levels });
writeFileSync(outPath, JSON.stringify({ track, plan }));
