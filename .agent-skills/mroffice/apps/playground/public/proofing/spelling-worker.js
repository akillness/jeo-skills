/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/*
 * MRNote spelling worker: the Hunspell dictionaries every editor checks
 * spelling with (lib/proofing/spelling-dictionaries.ts), read and queried
 * here, off the page thread, so loading a dictionary or judging a long
 * document never holds up typing.
 *
 * Requests (one reply each, with the request's id):
 *   { id, op: "load", tag, aff, dic }   load a dictionary (absolute URLs)
 *   { id, op: "check", tag, words, lenientUppercaseAccents? }
 *        -> boolean[]: whether each word is spelled correctly
 *   { id, op: "suggest", tag, word }    -> string[]: Hunspell's suggestions
 * Replies: { id, ok: true, value } or { id, ok: false, error }.
 *
 * Dictionary files may be stored gzip-compressed: a body that starts with
 * the gzip magic bytes is inflated here (a server that already sent it with
 * Content-Encoding: gzip hands over the plain text, which is read as is).
 */
import createHunspell from "./hunspell/hunspell.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Hunspell does not judge longer words (MAXWORDLEN); neither does MRNote. */
const MAX_WORD_BYTES = 360;
/** French "Enforce accented uppercase" off: at most this many respellings. */
const MAX_ACCENT_VARIANTS = 256;
const UPPERCASE_ACCENTS = {
  A: ["À", "Â", "Æ"],
  C: ["Ç"],
  E: ["É", "È", "Ê", "Ë"],
  I: ["Î", "Ï"],
  O: ["Ô", "Œ"],
  U: ["Ù", "Û", "Ü"],
  Y: ["Ÿ"],
};

let runtime = null;
const spellers = new Map();

function hunspellRuntime() {
  if (!runtime) {
    // The engine's files sit beside this script, wherever it is served from.
    runtime = createHunspell({
      locateFile: (file) => new URL(`./hunspell/${file}`, self.location.href).href,
    });
    runtime.catch(() => {
      runtime = null;
    });
  }
  return runtime;
}

async function inflate(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchBytes(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`spelling dictionary ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? inflate(bytes) : bytes;
}

/** A missing file served as an HTML page would load as an empty dictionary
 *  that flags every word: refuse anything that is not a Hunspell pair. */
function isHunspellPair(aff, dic) {
  const affHead = decoder.decode(aff.subarray(0, 65536));
  const dicHead = decoder.decode(dic.subarray(0, 64));
  // The first line opens with the word count; Hunspell reads no further
  // (Danish's goes on "173515 # Produced By Stavekontrolden.dk").
  return /^\s*SET\s/m.test(affHead) && /^\uFEFF?\s*\d+(?:\s|$)/.test(dicHead);
}

function allocString(m, value) {
  const bytes = encoder.encode(value);
  const pointer = m._malloc(bytes.length + 1);
  m.HEAPU8.set(bytes, pointer);
  m.HEAPU8[pointer + bytes.length] = 0;
  return pointer;
}

function readString(m, pointer) {
  const heap = m.HEAPU8;
  let end = pointer;
  while (heap[end] !== 0) end += 1;
  return decoder.decode(heap.subarray(pointer, end));
}

function load(tag, affUrl, dicUrl) {
  let pending = spellers.get(tag);
  if (pending) return pending;
  pending = (async () => {
    const [m, aff, dic] = await Promise.all([
      hunspellRuntime(),
      fetchBytes(affUrl),
      fetchBytes(dicUrl),
    ]);
    if (!isHunspellPair(aff, dic)) {
      throw new Error(`spelling dictionary ${tag} is not a Hunspell dictionary`);
    }
    const name = `/dictionary-${tag.replace(/[^A-Za-z0-9-]/g, "_")}`;
    m.FS.writeFile(`${name}.aff`, aff);
    m.FS.writeFile(`${name}.dic`, dic);
    const affPath = allocString(m, `${name}.aff`);
    const dicPath = allocString(m, `${name}.dic`);
    let handle = 0;
    try {
      handle = m._Hunspell_create(affPath, dicPath);
    } finally {
      m._free(affPath);
      m._free(dicPath);
      m.FS.unlink(`${name}.aff`);
      m.FS.unlink(`${name}.dic`);
    }
    if (!handle) throw new Error(`spelling dictionary ${tag} could not be read`);
    return { m, handle };
  })();
  spellers.set(tag, pending);
  pending.catch(() => {
    if (spellers.get(tag) === pending) spellers.delete(tag);
  });
  return pending;
}

function spell({ m, handle }, word) {
  if (encoder.encode(word).length > MAX_WORD_BYTES) return true;
  const pointer = allocString(m, word);
  try {
    return m._Hunspell_spell(handle, pointer) !== 0;
  } finally {
    m._free(pointer);
  }
}

/**
 * Word's "Enforce accented uppercase in French" off: an unaccented capital
 * where the word takes an accented one ("ECOLE", "Etat") is not a mistake.
 */
function spellWithUnaccentedCapitals(speller, word) {
  if (spell(speller, word)) return true;
  const letters = Array.from(word);
  const slots = [];
  letters.forEach((letter, index) => {
    if (UPPERCASE_ACCENTS[letter]) slots.push(index);
  });
  if (slots.length === 0) return false;
  let variants = [letters];
  for (const index of slots) {
    const next = [];
    for (const variant of variants) {
      for (const accented of UPPERCASE_ACCENTS[variant[index]]) {
        if (next.length + variants.length >= MAX_ACCENT_VARIANTS) break;
        const copy = variant.slice();
        copy[index] = accented;
        next.push(copy);
      }
    }
    variants = variants.concat(next);
  }
  return variants.slice(1).some((variant) => spell(speller, variant.join("")));
}

function suggest({ m, handle }, word) {
  if (encoder.encode(word).length > MAX_WORD_BYTES) return [];
  const pointer = allocString(m, word);
  const list = m._malloc(4);
  try {
    const count = m._Hunspell_suggest(handle, list, pointer);
    if (count <= 0) return [];
    const array = m.HEAPU32[list >>> 2];
    if (!array) return [];
    const out = [];
    for (let index = 0; index < count; index += 1) {
      out.push(readString(m, m.HEAPU32[(array >>> 2) + index]));
    }
    m._Hunspell_free_list(handle, list, count);
    return out;
  } finally {
    m._free(pointer);
    m._free(list);
  }
}

async function handle(request) {
  switch (request?.op) {
    case "load":
      await load(request.tag, request.aff, request.dic);
      return true;
    case "check": {
      const speller = await spellers.get(request.tag);
      if (!speller) throw new Error(`spelling dictionary ${request.tag} is not loaded`);
      const judge = request.lenientUppercaseAccents ? spellWithUnaccentedCapitals : spell;
      return request.words.map((word) => judge(speller, String(word)));
    }
    case "suggest": {
      const speller = await spellers.get(request.tag);
      if (!speller) throw new Error(`spelling dictionary ${request.tag} is not loaded`);
      return suggest(speller, String(request.word));
    }
    default:
      throw new Error(`unknown spelling request ${request?.op}`);
  }
}

self.onmessage = (event) => {
  const request = event.data;
  handle(request).then(
    (value) => self.postMessage({ id: request.id, ok: true, value }),
    (error) =>
      self.postMessage({
        id: request?.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
};
