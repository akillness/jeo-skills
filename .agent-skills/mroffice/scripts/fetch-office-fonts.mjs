#!/usr/bin/env node
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The open fonts that stand in for Office's (Carlito for Calibri, Arimo for
// Arial, Tinos for Times New Roman, the metric clones of Aptos and others),
// so text in the editors is as wide as it is in Office. Each face is pinned
// by digest in scripts/office-fonts.lock.json; this writes it, with its
// license, under apps/playground/public/fonts/office (ignored by git),
// where the editors' stylesheets name it. Run it before `npm run build`.
//
//   node scripts/fetch-office-fonts.mjs          the faces the stylesheets load up front (about 10 MB)
//   node scripts/fetch-office-fonts.mjs --all    every face, for any family a file names (about 300 MB)
//
// Faces come from their publishers (Google Fonts, the projects' own
// releases); a TrueType face is converted to WOFF2 here (wawoff2). The
// faces this repository carries itself (fonts/office-pack: the metric
// clones, whose glyphs are open faces redrawn to Office's measurements) are
// copied.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "scripts/office-fonts.lock.json");
const CSS = join(ROOT, "packages/core/src/web/styles/office-fonts.css");
const PACK = join(ROOT, "fonts/office-pack");
const OUT = join(ROOT, "apps/playground/public/fonts/office");
const ALL = process.argv.includes("--all");
const CONCURRENCY = 8;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const upFront = new Set([...readFileSync(CSS, "utf8").matchAll(/\/fonts\/office\/([^)"']+)/g)].map((match) => match[1]));

// --- fetching ---------------------------------------------------------------

const downloads = new Map();
function download(url, digest) {
  if (!downloads.has(url)) {
    downloads.set(url, (async () => {
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch(url, { headers: { "User-Agent": UA } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (digest && sha256(bytes) !== digest) throw new Error("not the pinned bytes");
          return bytes;
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`${url}: ${lastError.message}`);
    })());
  }
  return downloads.get(url);
}

// --- archives and conversion (the formats the publishers ship) ---------------

function readZip(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip file");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    entries.set(bytes.toString("utf8", offset + 46, offset + 46 + nameLength), { method, compressed, local });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${name} is not in the archive`);
    const start = entry.local + 30 + bytes.readUInt16LE(entry.local + 26) + bytes.readUInt16LE(entry.local + 28);
    const data = bytes.subarray(start, start + entry.compressed);
    if (entry.method === 0) return Buffer.from(data);
    if (entry.method === 8) return inflateRawSync(data);
    throw new Error(`unsupported zip method ${entry.method} for ${name}`);
  };
}

function readTarGz(bytes) {
  const tar = gunzipSync(bytes);
  const entries = new Map();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.toString("utf8", start, start + length).replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const prefix = field(257, 6) === "ustar" ? field(345, 155) : "";
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    if (field(156, 1) === "0" || field(156, 1) === "") entries.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return (name) => {
    const data = entries.get(name);
    if (!data) throw new Error(`${name} is not in the archive`);
    return Buffer.from(data);
  };
}

let woff2;
// One conversion at a time: wawoff2 answers with a view of its WASM memory,
// which a second conversion overwrites.
let woff2Queue = Promise.resolve();
async function toWoff2(bytes) {
  woff2 ??= (await import("wawoff2")).default ?? (await import("wawoff2"));
  const conversion = woff2Queue.then(async () => Buffer.from(await woff2.compress(bytes)));
  woff2Queue = conversion.then(() => undefined, () => undefined);
  return conversion;
}

// --- the faces --------------------------------------------------------------

async function faceBytes(entry, face, archive) {
  if (entry.kind === "google") return download(face.url, face.sha256);
  if (entry.kind === "pack") {
    if (!existsSync(join(PACK, face.out))) throw new Error("not carried by this repository");
    return readFileSync(join(PACK, face.out));
  }
  if (entry.kind === "archive") {
    const source = (await archive())(face.path);
    if (face.sourceSha256 && sha256(source) !== face.sourceSha256) throw new Error(`${face.path} does not match the lock`);
    return toWoff2(source);
  }
  return toWoff2(await download(face.url, face.sourceSha256));
}

async function licenseBytes(entry, archive) {
  if (entry.kind === "pack") return readFileSync(join(PACK, "licenses", entry.license.path.split("/").pop()));
  if (entry.license.url) return download(entry.license.url, entry.license.sha256);
  return (await archive())(entry.license.path);
}

let written = 0;
let present = 0;
const failures = [];
const families = Object.entries(lock.substitutes ?? {})
  .map(([name, entry]) => [name, entry, (entry.faces ?? []).filter((face) => face.out && (ALL || upFront.has(face.out)))])
  .filter(([, , faces]) => faces.length);

async function syncFamily([name, entry, faces]) {
  let read = null;
  const archive = async () => (read ??= (async () => {
    const bytes = await download(entry.archive.url, entry.archive.sha256);
    return entry.archive.url.endsWith(".zip") ? readZip(bytes) : readTarGz(bytes);
  })());
  for (const face of faces) {
    const target = join(OUT, face.out);
    if (existsSync(target) && sha256(readFileSync(target)) === face.sha256) {
      present += 1;
      continue;
    }
    try {
      const bytes = await faceBytes(entry, face, archive);
      if (sha256(bytes) !== face.sha256) throw new Error("does not match the lock");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      written += 1;
    } catch (error) {
      failures.push(`${name}: ${face.out}: ${error.message}`);
    }
  }
  try {
    const target = join(OUT, faces[0].out.split("/")[0], `LICENSE-${(entry.license?.spdx ?? "font").replace(/[^A-Za-z0-9.-]+/g, "_")}.txt`);
    if (entry.license && !existsSync(target)) {
      const bytes = await licenseBytes(entry, archive);
      if (entry.license.sha256 && sha256(bytes) !== entry.license.sha256) throw new Error("license text does not match the lock");
      writeFileSync(target, bytes);
    }
  } catch (error) {
    failures.push(`${name}: license: ${error.message}`);
  }
}

const queue = [...families];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await syncFamily(queue.shift());
}));
console.log(`office fonts: ${written} written, ${present} already here, ${failures.length} failed (${ALL ? "every face" : "the faces loaded up front"}) -> ${OUT}`);
if (failures.length) {
  console.error(failures.slice(0, 20).join("\n"));
  process.exit(1);
}
