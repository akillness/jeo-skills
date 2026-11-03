// Streaming JSON-RPC envelope scanner for the deadline-owning supervisor process.
//
// Locates the byte spans of selected object-key paths (top-level `id`, `method`,
// `params.name`, ...) inside newline-delimited JSON frames while the bytes stream
// past, without parsing the document. Parser state is bounded by the configured
// targets (targets x maxCapture bytes of captured value text, plus one in-flight
// capture per nesting level of the target paths) and one bit per open container;
// frame bytes are only accumulated when `retainBytes` is on. Nothing in this module
// calls JSON.parse or JSON.stringify.
//
// Grammar: strict RFC 8259 JSON text. A frame reported `valid: true` is one that
// JSON.parse accepts after UTF-8 decoding with replacement; invalid UTF-8 inside
// strings is deliberately not rejected because readline-based framing never did.
// Framing (when `delimited`): `\n`, `\r` and `\r\n` terminate a frame exactly like
// readline with `crlfDelay: Infinity`, including a CR at the end of one chunk
// followed by an LF at the start of the next. `end()` flushes a trailing
// unterminated frame. Empty lines are reported as frames with `empty: true`.
//
// Limits (deliberate):
// - Targets are object-key paths only, at most MAX_PATH_DEPTH segments; array
//   elements are never traversed, so `[{"id":1}]` yields no `id`.
// - Duplicate keys: the last occurrence wins, matching JSON.parse.
// - Key names are matched after escape decoding (`"i\u0064"` matches `id`); keys
//   longer than the longest target segment or containing non-ASCII never match.
// - `values[name].bytes` holds at most `maxCapture` bytes of the raw value text and
//   `truncated` reports when the span is longer. Slice `bytes.subarray(start, end)`
//   of the frame when byte-exact echoing matters.
// - Invalid frames report `values: {}`; nothing is reported for a frame before it
//   terminates, so the caller never acts on a half-seen envelope.
// - Offsets are JavaScript numbers; streams beyond 2^53 bytes are not supported.

const LF = 0x0a, CR = 0x0d, TAB = 0x09, SP = 0x20;
const QUOTE = 0x22, BACKSLASH = 0x5c, SLASH = 0x2f;
const OPEN_OBJ = 0x7b, CLOSE_OBJ = 0x7d, OPEN_ARR = 0x5b, CLOSE_ARR = 0x5d;
const COMMA = 0x2c, COLON = 0x3a, MINUS = 0x2d, PLUS = 0x2b, DOT = 0x2e;
const ZERO = 0x30, NINE = 0x39, LOWER_E = 0x65, UPPER_E = 0x45, LOWER_U = 0x75;

const LITERALS = new Map([
  [0x74, { rest: [0x72, 0x75, 0x65], type: "true" }],
  [0x66, { rest: [0x61, 0x6c, 0x73, 0x65], type: "false" }],
  [0x6e, { rest: [0x75, 0x6c, 0x6c], type: "null" }],
]);
const SIMPLE_ESCAPES = new Map([
  [QUOTE, QUOTE], [BACKSLASH, BACKSLASH], [SLASH, SLASH],
  [0x62, 0x08], [0x66, 0x0c], [0x6e, 0x0a], [0x72, 0x0d], [0x74, 0x09],
]);

// Parser states.
const S_VALUE = 0, S_ARRAY_FIRST = 1, S_OBJECT_FIRST = 2, S_OBJECT_KEY = 3, S_COLON = 4;
const S_AFTER_VALUE = 5, S_STRING = 6, S_ESCAPE = 7, S_UNICODE = 8, S_NUMBER = 9;
const S_LITERAL = 10, S_DONE = 11, S_ERROR = 12;
// Number sub-states; a number may end only in a state >= N_ZERO.
const N_SIGN = 0, N_FRAC_START = 1, N_EXP_START = 2, N_EXP_SIGN = 3, N_ZERO = 4, N_INT = 5, N_FRAC = 6, N_EXP = 7;

export const MAX_PATH_DEPTH = 8;
export const DEFAULT_MAX_CAPTURE = 4096;
export const DEFAULT_CLIENT_TARGETS = Object.freeze({
  id: ["id"], method: ["method"], name: ["params", "name"],
  requestId: ["params", "requestId"], progressToken: ["params", "_meta", "progressToken"],
});
export const DEFAULT_WORKER_TARGETS = Object.freeze({
  id: ["id"], method: ["method"], progressToken: ["params", "progressToken"],
});

const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });
const EMPTY = new Uint8Array(0);

// Always a plain Uint8Array so that `.slice` copies (Buffer#slice aliases).
function toBytes(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return input.constructor === Uint8Array ? input : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("expected bytes");
}

function concat(parts, total) {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

function hexValue(b) {
  if (b >= ZERO && b <= NINE) return b - ZERO;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  return -1;
}

function isWhitespace(b) { return b === SP || b === TAB || b === LF || b === CR; }

function buildTrie(targets) {
  const root = { children: new Map(), name: undefined };
  let maxKeyLength = 0;
  const names = new Set();
  for (const [name, path] of Object.entries(targets ?? {})) {
    if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH_DEPTH) throw new TypeError(`target ${name}: path must have 1..${MAX_PATH_DEPTH} segments`);
    if (names.has(name)) throw new TypeError(`duplicate target ${name}`);
    names.add(name);
    let node = root;
    for (const segment of path) {
      if (typeof segment !== "string" || segment.length === 0) throw new TypeError(`target ${name}: path segments must be non-empty strings`);
      maxKeyLength = Math.max(maxKeyLength, segment.length);
      let next = node.children.get(segment);
      if (!next) { next = { children: new Map(), name: undefined }; node.children.set(segment, next); }
      node = next;
    }
    if (node.name !== undefined) throw new TypeError(`target ${name} repeats the path of ${node.name}`);
    node.name = name;
  }
  return { root, maxKeyLength };
}

// Splits chunks into frame segments with readline parity. `emit(buf, from, to, terminated)`
// receives every byte range belonging to the current frame; `terminated` marks a range
// that ends at a terminator byte (`to` is the terminator's index, excluded).
function createSplitter() {
  let swallowLf = false;
  return (buf, emit) => {
    let from = 0;
    const n = buf.length;
    if (swallowLf) {
      swallowLf = false;
      if (n > 0 && buf[0] === LF) from = 1;
    }
    for (let i = from; i < n; i++) {
      const b = buf[i];
      if (b !== LF && b !== CR) continue;
      emit(buf, from, i, true);
      if (b === CR) {
        if (i + 1 < n) { if (buf[i + 1] === LF) i++; } else swallowLf = true;
      }
      from = i + 1;
    }
    if (from < n) emit(buf, from, n, false);
  };
}

export function createEnvelopeScanner({ targets = DEFAULT_CLIENT_TARGETS, maxCapture = DEFAULT_MAX_CAPTURE, delimited = true, retainBytes = true } = {}) {
  if (!(maxCapture >= 0)) throw new TypeError("maxCapture must be a non-negative number");
  const { root, maxKeyLength } = buildTrie(targets);
  const split = createSplitter();
  // pathNodes[d] = trie node whose children are matched by keys of the object open at depth d.
  const pathNodes = new Array(MAX_PATH_DEPTH + 1).fill(null);
  let kinds = new Uint8Array(64); // one bit per open container: 1 = object, 0 = array

  let streamOffset = 0; // absolute offset of the next byte to be pushed
  let frameStart = 0; // absolute offset of the current frame's first byte
  let frameLength = 0;
  let frameParts = [];
  let state = S_VALUE;
  let depth = 0;
  let rootType;
  let error;
  // String scanning.
  let isKey = false;
  let keyMiss = true;
  const keyCodes = [];
  let hexLeft = 0, hexCode = 0;
  // Numbers and literals.
  let numberState = 0;
  let literal = null, literalIndex = 0;
  // Targets.
  let currentNode = null; // trie node selected by the key just read, consumed by the next value
  const captures = []; // in-flight captures, innermost last
  const completed = new Map();

  const isObjectAt = (d) => (kinds[(d - 1) >> 3] >> ((d - 1) & 7)) & 1;
  const openContainer = (isObject) => {
    depth++;
    const index = (depth - 1) >> 3;
    if (index >= kinds.length) { const grown = new Uint8Array(kinds.length * 2); grown.set(kinds); kinds = grown; }
    const mask = 1 << ((depth - 1) & 7);
    if (isObject) kinds[index] |= mask; else kinds[index] &= ~mask;
  };
  const fail = (reason, at) => { state = S_ERROR; error = `${reason} at byte ${at - frameStart}`; };
  // Copies capture text from `buf` (whose first byte sits at absolute `base`) up to `uptoAbs`.
  const fill = (capture, buf, base, uptoAbs) => {
    if (capture.stored < maxCapture) {
      const from = capture.copied - base;
      const take = Math.min(uptoAbs - capture.copied, maxCapture - capture.stored);
      if (take > 0) { capture.parts.push(buf.slice(from, from + take)); capture.stored += take; }
    }
    capture.copied = uptoAbs;
  };
  const endValue = (endAbs, buf, base) => {
    if (captures.length !== 0) {
      const top = captures[captures.length - 1];
      if (top.depth === depth) {
        captures.pop();
        fill(top, buf, base, endAbs);
        top.end = endAbs;
        completed.set(top.name, top);
      }
    }
    state = depth === 0 ? S_DONE : S_AFTER_VALUE;
  };
  const closeContainer = (b, at, buf, base) => {
    if (depth === 0 || isObjectAt(depth) !== (b === CLOSE_OBJ ? 1 : 0)) return fail(`unexpected ${String.fromCharCode(b)}`, at);
    depth--;
    endValue(at + 1, buf, base);
  };
  const startValue = (b, at) => {
    const node = currentNode;
    const ownerDepth = depth;
    currentNode = null;
    let type;
    if (b === QUOTE) { type = "string"; state = S_STRING; isKey = false; keyMiss = true; }
    else if (b === OPEN_OBJ || b === OPEN_ARR) {
      type = b === OPEN_OBJ ? "object" : "array";
      if (depth < MAX_PATH_DEPTH) pathNodes[depth + 1] = b === OPEN_OBJ ? (depth === 0 ? root : node) : null;
      openContainer(b === OPEN_OBJ);
      state = b === OPEN_OBJ ? S_OBJECT_FIRST : S_ARRAY_FIRST;
    } else if (b === MINUS || (b >= ZERO && b <= NINE)) {
      type = "number"; state = S_NUMBER;
      numberState = b === MINUS ? N_SIGN : b === ZERO ? N_ZERO : N_INT;
    } else {
      const found = LITERALS.get(b);
      if (!found) return fail(`unexpected byte 0x${b.toString(16).padStart(2, "0")}`, at);
      type = found.type; literal = found.rest; literalIndex = 0; state = S_LITERAL;
    }
    if (ownerDepth === 0) rootType = type;
    if (node?.name !== undefined) captures.push({ name: node.name, type, start: at, end: at, depth: ownerDepth, copied: at, stored: 0, parts: [] });
  };
  const startKey = () => {
    state = S_STRING; isKey = true;
    keyMiss = depth > MAX_PATH_DEPTH || pathNodes[depth] === null;
    keyCodes.length = 0;
  };
  const keyByte = (code) => {
    if (code >= 0x80 || keyCodes.length >= maxKeyLength) keyMiss = true;
    else keyCodes.push(code);
  };
  const endKey = () => {
    currentNode = keyMiss ? null : (pathNodes[depth].children.get(String.fromCharCode(...keyCodes)) ?? null);
    state = S_COLON;
  };

  const scan = (buf, from, to, base) => {
    let i = from;
    while (i < to) {
      const b = buf[i];
      const at = base + i;
      switch (state) {
        case S_STRING: {
          let j = i;
          while (j < to) { const c = buf[j]; if (c === QUOTE || c === BACKSLASH || c < SP) break; j++; }
          if (isKey && !keyMiss) for (let k = i; k < j && !keyMiss; k++) keyByte(buf[k]);
          i = j;
          if (i >= to) break;
          const c = buf[i];
          if (c === QUOTE) { if (isKey) endKey(); else endValue(base + i + 1, buf, base); i++; }
          else if (c === BACKSLASH) { state = S_ESCAPE; i++; }
          else fail("control character in string", base + i);
          continue;
        }
        case S_ESCAPE: {
          const mapped = SIMPLE_ESCAPES.get(b);
          if (mapped !== undefined) { if (isKey && !keyMiss) keyByte(mapped); state = S_STRING; }
          else if (b === LOWER_U) { state = S_UNICODE; hexLeft = 4; hexCode = 0; }
          else fail("invalid escape", at);
          break;
        }
        case S_UNICODE: {
          const h = hexValue(b);
          if (h < 0) { fail("invalid unicode escape", at); break; }
          hexCode = (hexCode << 4) | h;
          if (--hexLeft === 0) { if (isKey && !keyMiss) keyByte(hexCode); state = S_STRING; }
          break;
        }
        case S_NUMBER: {
          const digit = b >= ZERO && b <= NINE;
          let consumed = true;
          switch (numberState) {
            case N_SIGN: if (digit) numberState = b === ZERO ? N_ZERO : N_INT; else consumed = false; break;
            case N_ZERO: if (b === DOT) numberState = N_FRAC_START; else if (b === LOWER_E || b === UPPER_E) numberState = N_EXP_START; else consumed = false; break;
            case N_INT: if (digit) { /* stay */ } else if (b === DOT) numberState = N_FRAC_START; else if (b === LOWER_E || b === UPPER_E) numberState = N_EXP_START; else consumed = false; break;
            case N_FRAC_START: if (digit) numberState = N_FRAC; else consumed = false; break;
            case N_FRAC: if (digit) { /* stay */ } else if (b === LOWER_E || b === UPPER_E) numberState = N_EXP_START; else consumed = false; break;
            case N_EXP_START: if (digit) numberState = N_EXP; else if (b === PLUS || b === MINUS) numberState = N_EXP_SIGN; else consumed = false; break;
            case N_EXP_SIGN: if (digit) numberState = N_EXP; else consumed = false; break;
            case N_EXP: if (!digit) consumed = false; break;
          }
          if (consumed) break;
          if (numberState < N_ZERO) { fail("invalid number", at); break; }
          endValue(at, buf, base);
          continue; // re-dispatch the delimiter in the new state
        }
        case S_LITERAL: {
          if (b !== literal[literalIndex]) { fail("invalid literal", at); break; }
          if (++literalIndex === literal.length) endValue(at + 1, buf, base);
          break;
        }
        case S_VALUE: {
          if (!isWhitespace(b)) startValue(b, at);
          break;
        }
        case S_ARRAY_FIRST: {
          if (isWhitespace(b)) break;
          if (b === CLOSE_ARR) closeContainer(b, at, buf, base); else startValue(b, at);
          break;
        }
        case S_OBJECT_FIRST: {
          if (isWhitespace(b)) break;
          if (b === CLOSE_OBJ) closeContainer(b, at, buf, base);
          else if (b === QUOTE) startKey();
          else fail("expected object key", at);
          break;
        }
        case S_OBJECT_KEY: {
          if (isWhitespace(b)) break;
          if (b === QUOTE) startKey(); else fail("expected object key", at);
          break;
        }
        case S_COLON: {
          if (isWhitespace(b)) break;
          if (b === COLON) state = S_VALUE; else fail("expected colon", at);
          break;
        }
        case S_AFTER_VALUE: {
          if (isWhitespace(b)) break;
          if (b === COMMA) state = isObjectAt(depth) ? S_OBJECT_KEY : S_VALUE;
          else if (b === CLOSE_OBJ || b === CLOSE_ARR) closeContainer(b, at, buf, base);
          else fail(`unexpected byte 0x${b.toString(16).padStart(2, "0")}`, at);
          break;
        }
        case S_DONE: {
          if (!isWhitespace(b)) fail("trailing data", at);
          break;
        }
        case S_ERROR:
          return; // the rest of the frame is skipped
      }
      i++;
    }
  };

  const reset = () => {
    state = S_VALUE; depth = 0; rootType = undefined; error = undefined; currentNode = null;
    captures.length = 0; completed.clear(); frameParts = []; frameLength = 0;
  };

  const finishFrame = (lastBuf, lastBase) => {
    let valid = false;
    const end = frameStart + frameLength;
    if (frameLength === 0) error = "empty frame";
    else if (state === S_NUMBER && depth === 0 && numberState >= N_ZERO) { endValue(end, lastBuf, lastBase); valid = true; }
    else if (state === S_DONE) valid = true;
    else if (state === S_ERROR) { /* recorded by fail() */ }
    else if (state === S_STRING || state === S_ESCAPE || state === S_UNICODE) error = `unterminated string at byte ${frameLength}`;
    else error = `unexpected end of input at byte ${frameLength}`;
    const values = {};
    if (valid) {
      for (const [name, capture] of completed) {
        values[name] = {
          start: capture.start - frameStart, end: capture.end - frameStart, type: capture.type,
          bytes: capture.parts.length === 0 ? EMPTY : concat(capture.parts, capture.stored),
          truncated: capture.end - capture.start > capture.stored,
        };
      }
    }
    const result = { start: frameStart, end, valid, empty: frameLength === 0, type: valid ? rootType : undefined, object: valid && rootType === "object", values };
    if (!valid) result.error = error;
    if (retainBytes) result.bytes = frameParts.length === 0 ? EMPTY : concat(frameParts, frameLength);
    reset();
    return result;
  };

  return {
    // Feeds a chunk; returns the frames that terminated inside it, in order.
    push(chunk) {
      const buf = toBytes(chunk);
      const base = streamOffset;
      const results = [];
      const emit = (b, from, to, terminated) => {
        if (frameLength === 0) frameStart = base + from;
        if (to > from) {
          if (state !== S_ERROR) scan(b, from, to, base);
          if (retainBytes) frameParts.push(b.slice(from, to));
          frameLength += to - from;
        }
        if (terminated) results.push(finishFrame(b, base));
      };
      if (delimited) split(buf, emit); else emit(buf, 0, buf.length, false);
      for (const capture of captures) fill(capture, buf, base, base + buf.length);
      streamOffset += buf.length;
      return results;
    },
    // Flushes a trailing unterminated frame at end of stream; null when nothing is pending.
    end() {
      if (frameLength === 0) return null;
      return finishFrame(EMPTY, streamOffset);
    },
  };
}

// Scans one complete frame (no newline framing); `bytes` on the result is the input view.
export function scanFrame(input, { targets, maxCapture } = {}) {
  const bytes = toBytes(input);
  const scanner = createEnvelopeScanner({ targets, maxCapture, delimited: false, retainBytes: false });
  scanner.push(bytes);
  const result = scanner.end() ?? { start: 0, end: 0, valid: false, empty: true, error: "empty frame", type: undefined, object: false, values: {} };
  result.bytes = bytes;
  return result;
}

// Splits a byte stream into frames with readline parity; frames are copied out of the chunks.
export function createLineFramer() {
  const split = createSplitter();
  let parts = [], total = 0;
  const take = () => { const frame = parts.length === 0 ? EMPTY : concat(parts, total); parts = []; total = 0; return frame; };
  return {
    push(chunk) {
      const frames = [];
      split(toBytes(chunk), (b, from, to, terminated) => {
        if (to > from) { parts.push(b.slice(from, to)); total += to - from; }
        if (terminated) frames.push(take());
      });
      return frames;
    },
    end() { return total === 0 ? null : take(); },
  };
}

const NUMBER_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

function asciiText(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i++) { if (bytes[i] >= 0x80) return undefined; text += String.fromCharCode(bytes[i]); }
  return text;
}

function decodeString(bytes) {
  const n = bytes.length;
  if (n < 2 || bytes[n - 1] !== QUOTE) return undefined;
  const pieces = [];
  let run = 1;
  for (let i = 1; i < n - 1; i++) {
    const b = bytes[i];
    if (b === QUOTE || b < SP) return undefined; // an unescaped quote or control byte: not one string
    if (b !== BACKSLASH) continue;
    if (run < i) pieces.push(utf8.decode(bytes.subarray(run, i)));
    if (++i >= n - 1) return undefined;
    const e = bytes[i];
    const mapped = SIMPLE_ESCAPES.get(e);
    if (mapped !== undefined) pieces.push(String.fromCharCode(mapped));
    else if (e === LOWER_U) {
      if (i + 4 >= n - 1) return undefined;
      let code = 0;
      for (let k = 1; k <= 4; k++) { const h = hexValue(bytes[i + k]); if (h < 0) return undefined; code = (code << 4) | h; }
      pieces.push(String.fromCharCode(code));
      i += 4;
    } else return undefined;
    run = i + 1;
  }
  if (run < n - 1) pieces.push(utf8.decode(bytes.subarray(run, n - 1)));
  return pieces.join("");
}

// Decodes the raw JSON text of a scalar span (string, number, true, false, null) to its
// JavaScript value without JSON.parse. Returns undefined for anything else, including
// containers, malformed text, and truncated spans. Pass the full span: a truncated
// number or literal is not distinguishable from a shorter valid one.
export function decodeScalar(input) {
  const bytes = toBytes(input);
  if (bytes.length === 0) return undefined;
  if (bytes[0] === QUOTE) return decodeString(bytes);
  const text = asciiText(bytes);
  if (text === undefined) return undefined;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return NUMBER_RE.test(text) ? Number(text) : undefined;
}
