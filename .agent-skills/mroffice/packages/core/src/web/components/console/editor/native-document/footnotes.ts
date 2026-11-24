/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EMU_PER_PT, WORD_LINE_MULTIPLE_MAX, WORD_LINE_MULTIPLE_MIN } from "../../../../lib/office-units";

/**
 * Document FOOTNOTES / ENDNOTES (Word/WPS parity) — pure logic.
 *
 * A user inserts a FOOTNOTE: an inline `footnoteRef` mark (carrying a `noteId`)
 * is dropped at the caret, and a note record holds that note's body text. The
 * note records are persisted as an ADDITIVE optional field on the top-level
 * document node's `attrs.footnotes` (see footnoteExtension.ts), so existing
 * documents — which carry no footnote array — still validate and round-trip
 * unchanged. A document-level `footnoteMode` ("footnote" | "endnote") attribute
 * picks how the auto-rendered note list is labelled/placed.
 *
 * Auto-numbering is NOT stored: the visible number of each note is derived from
 * the ORDER its anchoring `footnoteRef` mark first appears in the document body
 * (see numberFootnotesByOrder in footnoteExtension.ts). Renumbering on
 * insert/delete/reorder is therefore automatic and never goes stale.
 *
 * Everything in THIS module is intentionally framework-free: it operates on
 * plain JSON-shaped values so the normalize/cap/sanitize/store behaviour can be
 * unit-tested headlessly. The TipTap mark/node/extension that wires this into the
 * live editor lives in footnoteExtension.ts.
 *
 * SECURITY: the note body is user-supplied and round-trips through persisted
 * JSON. It is always rendered as TEXT (never HTML) and is scrubbed of control
 * bytes + clamped here, so a forged document can never smuggle markup,
 * attribute-breaking payloads, or an unbounded blob past this edge. The note id
 * is restricted to an attribute-safe token alphabet so it can never break out of
 * the `data-note-id` attribute. Mirrors the comment-threads model (comments.ts).
 */

/** The inline mark name. Kept in a constant so the extension + tests agree. */
export const FOOTNOTE_MARK_NAME = "footnoteRef";

/** The two placement modes Word/WPS offer for the note list. */
export const FOOTNOTE_MODES = ["footnote", "endnote"] as const;
export type FootnoteMode = (typeof FOOTNOTE_MODES)[number];
export const DEFAULT_FOOTNOTE_MODE: FootnoteMode = "footnote";

/**
 * Per-note text cap. The layout-fidelity corpus deliberately carries 10-12k
 * character notes; 8k silently cut ordinary long Word notes mid-paragraph.
 * 32k keeps the persisted/editor surface bounded while admitting those real
 * documents. Importers must report an explicit loss beyond this boundary.
 */
export const MAX_FOOTNOTE_BODY_LENGTH = 32_000;
export const MAX_FOOTNOTES = 1_000;
/** A note id is an opaque token; bound its length so the DOM attr is sane. */
export const MAX_FOOTNOTE_ID_LENGTH = 64;

// Body text may be multi-line, so it PRESERVES tab (\u0009) and newline
// (\u000a) and strips every other C0 control, DEL (\u007f), and the C1
// control block (\u0080-\u009f). The two preserved bytes are carved out of
// the C0 range below. Written with \u escapes (NOT literal control bytes,
// which are fragile to round-trip in source) so the intent is explicit.
const BODY_CONTROL_BYTE_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]+/g;
const NOTE_ID_DISALLOWED_RE = /[^A-Za-z0-9_-]+/g;

/** One whitelisted inline run of a rich note body. */
export interface FootnoteRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  hidden?: boolean;
  /**
   * The hyperlink the run sits in (an imported Word note's `w:hyperlink`;
   * OFL-058): an absolute web/mail address or a place in the document
   * (`#anchor`). Kept through the store and written back as a link.
   */
  href?: string;
  /** Text Highlight Color, a lower-case `#rrggbb` (Word's `w:highlight`, or
   * a `w:shd` fill for a colour outside the highlighter's sixteen). */
  highlight?: string;
  /**
   * A formula of the note (Word's `m:oMath` in a note paragraph), as LaTeX.
   * A formula run's `text` is exactly one NOTE_MATH_CHAR: the formula is ONE
   * character of the note for every offset (page slices, the caret, find,
   * the server's in-place writer), so it is kept, moved or deleted whole and
   * never split. It carries no other formatting.
   */
  math?: string;
  /** The formula is a display equation (`m:oMathPara`, on its own line). */
  mathDisplay?: true;
}

/** The character a note formula stands as (U+FFFC OBJECT REPLACEMENT). */
export const NOTE_MATH_CHAR = "\ufffc";
/** Longest LaTeX a note formula may carry (the server's limit). */
export const MAX_NOTE_MATH_LATEX_LENGTH = 20_000;

/** The store's formula run for a candidate, or undefined when it is none. */
export function sanitizeNoteMathRun(value: unknown): FootnoteRun | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.math !== "string") return undefined;
  const latex = record.math.replace(BODY_CONTROL_BYTE_RE, "").trim();
  if (!latex || latex.length > MAX_NOTE_MATH_LATEX_LENGTH) return undefined;
  return {
    text: NOTE_MATH_CHAR,
    math: latex,
    ...(record.mathDisplay === true ? { mathDisplay: true as const } : {}),
  };
}

/** Whether a run is a formula run. */
export function isNoteMathRun(run: Pick<FootnoteRun, "math"> | null | undefined): boolean {
  return typeof run?.math === "string" && run.math.length > 0;
}

/** A note run's highlight, or undefined when it is not a `#rrggbb` colour. */
export function sanitizeNoteHighlight(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** The note run links the store admits: `https?://`, `mailto:` or `#place`. */
const NOTE_HREF_RE =
  /^(?:https?:\/\/[^\s<>"'\u0000-\u001f]{1,2040}|mailto:[^\s<>"'\u0000-\u001f]{1,2040}|#[^\s<>"'\u0000-\u001f]{1,512})$/u;

/** A note run's link, or undefined when it is not one the store admits. */
export function sanitizeNoteHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return NOTE_HREF_RE.test(trimmed) ? trimmed : undefined;
}

/** Paragraphs of runs. The plain `body` stays the derived source of truth
 * for search/AI/legacy consumers; `rich` upgrades rendering + editing. */
export type FootnoteRichBody = FootnoteRun[][];

export interface FootnoteEntry {
  id: string;
  body: string;
  rich?: FootnoteRichBody;
  /**
   * What typing into a note that shows NO text starts with: the flags of its
   * first paragraph mark, which is the formatting Word gives that text
   * (ECMA-376 17.3.1.29) -- the note model's `paragraphMarkMarks`. Present
   * only while the note is blank; the first text typed there takes these
   * flags and ends the blank state, exactly as a blank body paragraph does.
   */
  markFlags?: FootnoteMarkFlag[];
  /**
   * What an imported note draws that the note store cannot hold (a picture,
   * a shape): a read-only receipt, the comment thread's `sourceMedia*`
   * shape. Such a note shows its words and cannot be edited; both DOCX
   * writers keep its drawing from the source file.
   */
  sourceMediaDisposition?: "preserve-only";
  sourceMediaFingerprint?: string;
  sourceMediaKinds?: ["image"];
  sourceMediaCount?: number;
  /**
   * The pictures such a note draws in its line, each at its place in the
   * note's text (`at`, an offset into `body`), when the import read every one
   * of them: drawn with the note's words, the note still read-only.
   */
  sourceMediaPictures?: FootnoteMediaPicture[];
  /**
   * How a note whose paragraph is NOT in its stream's note style is set (an
   * unstyled note paragraph is the document's Normal one, as Word sets it):
   * size, spacing and line multiple. Read-only layout evidence.
   */
  paragraphFormat?: FootnoteParagraphFormat;
  /** Each paragraph's own Exactly / At least line (null: the note's line). */
  paragraphLines?: (FootnoteParagraphLine | null)[];
}

/** A note paragraph's own Exactly / At least line. */
export interface FootnoteParagraphLine {
  readonly rule: "exact" | "atLeast";
  readonly pt: number;
}

/** A note's per-paragraph lines as the import states them: each paragraph's
 * Exactly / At least line, null on the note's own line. Undefined when the
 * value is not that shape or states no line. */
function sanitizeFootnoteParagraphLines(value: unknown): (FootnoteParagraphLine | null)[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4000) return undefined;
  const out: (FootnoteParagraphLine | null)[] = [];
  let found = false;
  for (const item of value) {
    if (item === null) {
      out.push(null);
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const raw = item as Record<string, unknown>;
    const rule = raw.rule;
    const pt = raw.pt;
    if ((rule !== "exact" && rule !== "atLeast") || typeof pt !== "number" || !Number.isFinite(pt) || !(pt > 0) || pt > 1584) {
      return undefined;
    }
    out.push({ rule, pt });
    found = true;
  }
  return found ? out : undefined;
}

/** A note paragraph's own size, spacing and line multiple. */
export interface FootnoteParagraphFormat {
  fontSizePt: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineHeight?: number;
  /** The note wears its stream's note style; only its words' size is its own. */
  noteStyle?: true;
}

function sanitizeFootnoteParagraphFormat(value: unknown): FootnoteParagraphFormat | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const number = (key: string, low: number, high: number): number | undefined => {
    const item = raw[key];
    return typeof item === "number" && Number.isFinite(item) && item >= low && item <= high ? item : undefined;
  };
  const fontSizePt = number("fontSizePt", 1, 1584);
  if (fontSizePt === undefined) return undefined;
  const spaceBeforePt = number("spaceBeforePt", 0, 1584);
  const spaceAfterPt = number("spaceAfterPt", 0, 1584);
  const lineHeight = number("lineHeight", WORD_LINE_MULTIPLE_MIN, WORD_LINE_MULTIPLE_MAX);
  return {
    fontSizePt,
    ...(spaceBeforePt !== undefined ? { spaceBeforePt } : {}),
    ...(spaceAfterPt !== undefined ? { spaceAfterPt } : {}),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(raw.noteStyle === true ? { noteStyle: true as const } : {}),
  };
}

/** A picture a read-only note draws in its line. */
export interface FootnoteMediaPicture {
  at: number;
  src: string;
  widthEmu: number;
  heightEmu: number;
}

const NOTE_PICTURE_SRC = /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** The pictures a note draws, as the server read them, or undefined. */
function sanitizeFootnoteMediaPictures(
  value: unknown,
  body: string,
  count: number,
): FootnoteMediaPicture[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return undefined;
  const out: FootnoteMediaPicture[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    const { at, src, widthEmu, heightEmu } = record;
    if (
      typeof at !== "number" || !Number.isInteger(at) || at < 0 || at > body.length ||
      typeof widthEmu !== "number" || !Number.isInteger(widthEmu) || widthEmu <= 0 || widthEmu > 20_000_000 ||
      typeof heightEmu !== "number" || !Number.isInteger(heightEmu) || heightEmu <= 0 || heightEmu > 20_000_000 ||
      typeof src !== "string" || src.length > 3_000_000 || !NOTE_PICTURE_SRC.test(src)
    ) {
      return undefined;
    }
    out.push({ at, src, widthEmu, heightEmu });
  }
  return out;
}

/**
 * Put a read-only note's pictures into its rendered body: each `<img>` goes
 * where its offset falls among the characters `host` shows, which are the
 * note's text from `sliceStart` (a `<br>` is the paragraph separator, one
 * character). A picture at the very end of the shown text is drawn there.
 */
export function insertFootnoteMediaPictures(
  host: HTMLElement,
  pictures: readonly FootnoteMediaPicture[] | undefined,
  sliceStart = 0,
  sliceEnd = Number.POSITIVE_INFINITY,
): void {
  if (!pictures?.length) return;
  const doc = host.ownerDocument;
  const wanted = pictures
    .filter((picture) => picture.at >= sliceStart && picture.at <= sliceEnd)
    .sort((a, b) => a.at - b.at);
  // The text after the last picture is appended in order: ties keep order.
  if (!wanted.length) return;
  const image = (picture: FootnoteMediaPicture): HTMLImageElement => {
    const img = doc.createElement("img");
    img.src = picture.src;
    img.alt = "";
    img.className = "footnote-media-picture";
    img.setAttribute("data-footnote-media-picture", "");
    img.style.width = `${picture.widthEmu / EMU_PER_PT}pt`;
    img.style.height = `${picture.heightEmu / EMU_PER_PT}pt`;
    img.style.verticalAlign = "baseline";
    img.style.display = "inline";
    return img;
  };
  // Where each shown character sits: text nodes by their first offset, a
  // `<br>` as one character of its own.
  const places: Array<{ node: Node; start: number; length: number }> = [];
  let offset = sliceStart;
  const walker = doc.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      // A formula's drawing is not the note's text: the formula is one
      // character (its atom, below).
      if (node.parentElement?.closest("[data-note-math]")) continue;
      const length = (node as Text).data.length;
      places.push({ node, start: offset, length });
      offset += length;
    } else if ((node as Element).tagName === "BR" || (node as Element).hasAttribute("data-note-math")) {
      places.push({ node, start: offset, length: 1 });
      offset += 1;
    }
  }
  // Last first, so an earlier split leaves the later offsets where they are.
  for (const picture of [...wanted].reverse()) {
    const place = places.find((entry) => picture.at >= entry.start && picture.at < entry.start + entry.length);
    if (!place) {
      host.appendChild(image(picture));
      continue;
    }
    const split = picture.at - place.start;
    if (place.node.nodeType === Node.TEXT_NODE && split > 0) {
      const tail = (place.node as Text).splitText(split);
      tail.parentNode?.insertBefore(image(picture), tail);
    } else {
      place.node.parentNode?.insertBefore(image(picture), place.node);
    }
  }
}
export function isFootnoteMediaPreserveOnly(
  note: Pick<FootnoteEntry, "sourceMediaDisposition"> | null | undefined,
): boolean {
  return note?.sourceMediaDisposition === "preserve-only";
}

/** The note's read-only media receipt when it is well formed, else undefined. */
function sanitizeFootnoteSourceMedia(
  record: Record<string, unknown>,
): Pick<
  FootnoteEntry,
  | "sourceMediaDisposition"
  | "sourceMediaFingerprint"
  | "sourceMediaKinds"
  | "sourceMediaCount"
> | undefined {
  if (
    record.sourceMediaDisposition !== "preserve-only" ||
    typeof record.sourceMediaFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.sourceMediaFingerprint) ||
    !Array.isArray(record.sourceMediaKinds) ||
    record.sourceMediaKinds.length !== 1 ||
    record.sourceMediaKinds[0] !== "image" ||
    typeof record.sourceMediaCount !== "number" ||
    !Number.isInteger(record.sourceMediaCount) ||
    record.sourceMediaCount < 1 ||
    record.sourceMediaCount > 16
  ) {
    return undefined;
  }
  return {
    sourceMediaDisposition: "preserve-only",
    sourceMediaFingerprint: record.sourceMediaFingerprint,
    sourceMediaKinds: ["image"],
    sourceMediaCount: record.sourceMediaCount,
  };
}

export type FootnoteMarkFlag = (typeof FOOTNOTE_RUN_FLAGS)[number];

export const FOOTNOTE_RUN_FLAGS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "hidden",
] as const;

/**
 * Sanitize a rich-body candidate: whitelist run fields, strip control bytes,
 * cap total characters at MAX_FOOTNOTE_BODY_LENGTH, drop empty runs and
 * trailing empty paragraphs. Returns undefined when nothing usable remains
 * OR the rich body is plain (no formatting anywhere) — a plain rich body is
 * pure duplication of `body`.
 */
export function sanitizeFootnoteRichBody(
  value: unknown,
): FootnoteRichBody | undefined {
  if (!Array.isArray(value)) return undefined;
  let budget = MAX_FOOTNOTE_BODY_LENGTH;
  let sawFormatting = false;
  const paragraphs: FootnoteRun[][] = [];
  // Every paragraph is kept: the character budget below is the only cap.
  // Cutting at 200 paragraphs dropped the tail of a long note the moment it
  
  for (const paragraphCandidate of value) {
    if (!Array.isArray(paragraphCandidate)) continue;
    const runs: FootnoteRun[] = [];
    for (const runCandidate of paragraphCandidate.slice(0, 500)) {
      if (budget <= 0) break;
      const record =
        runCandidate && typeof runCandidate === "object"
          ? (runCandidate as Record<string, unknown>)
          : null;
      if (record && "math" in record) {
        // A formula: one character of the budget, never formatted.
        const formula = sanitizeNoteMathRun(record);
        if (formula) {
          budget -= 1;
          runs.push(formula);
          sawFormatting = true;
        }
        continue;
      }
      if (!record || typeof record.text !== "string") continue;
      const text = record.text
        .replace(BODY_CONTROL_BYTE_RE, "")
        .slice(0, budget);
      if (!text) continue;
      budget -= text.length;
      const run: FootnoteRun = { text };
      for (const flag of FOOTNOTE_RUN_FLAGS) {
        if (record[flag] === true) {
          run[flag] = true;
          sawFormatting = true;
        }
      }
      const href = sanitizeNoteHref(record.href);
      if (href) {
        run.href = href;
        sawFormatting = true;
      }
      const highlight = sanitizeNoteHighlight(record.highlight);
      if (highlight) {
        run.highlight = highlight;
        sawFormatting = true;
      }
      runs.push(run);
    }
    paragraphs.push(runs);
  }
  while (paragraphs.length && paragraphs[paragraphs.length - 1].length === 0) {
    paragraphs.pop();
  }
  if (!paragraphs.length || !sawFormatting) return undefined;
  return paragraphs;
}

/** The plain text a rich body derives to (paragraphs joined by newlines). */
export function footnoteRichBodyText(rich: FootnoteRichBody): string {
  return rich
    .map((runs) => runs.map((run) => run.text).join(""))
    .join("\n");
}

type StyledNoteChar = {
  char: string;
  flags: Omit<FootnoteRun, "text">;
};

function runFlags(run: FootnoteRun): Omit<FootnoteRun, "text"> {
  if (isNoteMathRun(run)) {
    return { math: run.math, ...(run.mathDisplay ? { mathDisplay: true as const } : {}) };
  }
  const flags: Omit<FootnoteRun, "text"> = {};
  for (const key of FOOTNOTE_RUN_FLAGS) {
    if (run[key] === true) flags[key] = true;
  }
  if (typeof run.href === "string") flags.href = run.href;
  if (typeof run.highlight === "string") flags.highlight = run.highlight;
  return flags;
}

function noteBodyToStyledChars(
  body: string,
  rich?: FootnoteRichBody,
): StyledNoteChar[] {
  if (!rich) {
    // DOM Range/Text offsets and String.slice are UTF-16 code-unit based.
    // split("") deliberately follows that contract (spread would count
    // Unicode code points and drift after an astral symbol/emoji).
    return body.split("").map((char) => ({ char, flags: {} }));
  }
  const chars: StyledNoteChar[] = [];
  rich.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) chars.push({ char: "\n", flags: {} });
    for (const run of paragraph) {
      const flags = runFlags(run);
      if (isNoteMathRun(run)) {
        chars.push({ char: NOTE_MATH_CHAR, flags });
        continue;
      }
      for (const char of run.text.split("")) chars.push({ char, flags });
    }
  });
  return chars;
}

function sameRunFlags(
  left: Omit<FootnoteRun, "text">,
  right: Omit<FootnoteRun, "text">,
): boolean {
  return (
    FOOTNOTE_RUN_FLAGS.every((key) => left[key] === right[key]) &&
    left.href === right.href &&
    left.highlight === right.highlight &&
    left.math === right.math &&
    left.mathDisplay === right.mathDisplay
  );
}

function styledCharsToRich(chars: readonly StyledNoteChar[]): FootnoteRichBody {
  const paragraphs: FootnoteRichBody = [[]];
  for (const item of chars) {
    if (item.char === "\n") {
      paragraphs.push([]);
      continue;
    }
    const paragraph = paragraphs[paragraphs.length - 1];
    const last = paragraph[paragraph.length - 1];
    // A formula is a run of its own: two formulas never join.
    if (last && !isNoteMathRun(last) && !item.flags.math && sameRunFlags(runFlags(last), item.flags)) {
      last.text += item.char;
    } else {
      paragraph.push({ text: item.char, ...item.flags });
    }
  }
  return paragraphs;
}

/** Preserve whitelisted run formatting while taking a semantic character
 * slice of a note body. Character offsets use the same plain-text contract as
 * `footnoteRichBodyText` (paragraph separators count as one `\n`). */
export function sliceFootnoteRichBody(
  body: string,
  rich: FootnoteRichBody | undefined,
  start: number,
  end: number,
): FootnoteRichBody | undefined {
  if (!rich) return undefined;
  const chars = noteBodyToStyledChars(body, rich);
  const from = Math.max(0, Math.min(Math.trunc(start), chars.length));
  const to = Math.max(from, Math.min(Math.trunc(end), chars.length));
  return styledCharsToRich(chars.slice(from, to));
}

/**
 * The run flags at `offset` of a note body (those of the character there, or
 * of the one before it at the end), for text that replaces or joins that
 * character: what typing there would wear.
 */
export function footnoteRunFlagsAt(
  body: string,
  rich: FootnoteRichBody | undefined,
  offset: number,
): Omit<FootnoteRun, "text"> {
  if (!rich) return {};
  const chars = noteBodyToStyledChars(body, rich);
  const index = Math.max(0, Math.min(Math.trunc(offset), chars.length - 1));
  // Text typed beside a formula is text: it takes no formula of its own.
  const flags = chars[index]?.flags ?? {};
  return flags.math ? {} : { ...flags };
}

/** Replace one rendered note fragment without flattening formatting outside
 * the fragment. This is used by the structural multi-page note view: each page
 * edits its own semantic slice, then the runtime slices are reflowed. */
export function spliceFootnoteRichBody(
  body: string,
  rich: FootnoteRichBody | undefined,
  start: number,
  end: number,
  replacementBody: string,
  replacementRich?: FootnoteRichBody,
): FootnoteRichBody {
  const source = noteBodyToStyledChars(body, rich);
  const replacement = noteBodyToStyledChars(
    replacementBody,
    replacementRich,
  );
  const from = Math.max(0, Math.min(Math.trunc(start), source.length));
  const to = Math.max(from, Math.min(Math.trunc(end), source.length));
  return styledCharsToRich([
    ...source.slice(0, from),
    ...replacement,
    ...source.slice(to),
  ]);
}

/**
 * Coerce a footnote-mode candidate to one of the whitelisted modes, else null.
 * A forged/blank/unknown value yields null so callers fall back to the default.
 */
export function sanitizeFootnoteMode(value: unknown): FootnoteMode | null {
  return typeof value === "string" &&
    (FOOTNOTE_MODES as readonly string[]).includes(value)
    ? (value as FootnoteMode)
    : null;
}

/** Resolve a footnote-mode candidate to a concrete mode (default when invalid). */
export function resolveFootnoteMode(value: unknown): FootnoteMode {
  return sanitizeFootnoteMode(value) ?? DEFAULT_FOOTNOTE_MODE;
}

/**
 * Strip control bytes and clamp a footnote body. Preserves newlines/tabs (a note
 * body can be multi-line) but removes every other control byte so the value is
 * safe to render as a text node. Returns "" for anything that is not a string or
 * is blank after scrubbing — note bodies MAY be empty (an inserted-but-unwritten
 * footnote), so "" is a valid stored value, not a rejection signal here.
 */
export function normalizeFootnoteBody(value: unknown): string {
  if (typeof value !== "string") return "";
  // Replace runs of disallowed control bytes with a space, collapse runs of
  // spaces/tabs (but NOT newlines — multi-line bodies are valid), then trim.
  return value
    .replace(BODY_CONTROL_BYTE_RE, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function sanitizeFootnoteBody(value: unknown): string {
  const cleaned = normalizeFootnoteBody(value);
  if (!cleaned) return "";
  return cleaned.length > MAX_FOOTNOTE_BODY_LENGTH
    ? cleaned.slice(0, MAX_FOOTNOTE_BODY_LENGTH)
    : cleaned;
}

/**
 * Normalize an arbitrary note-id candidate to a bounded, attribute-safe token.
 * Strips every character outside [A-Za-z0-9_-] and clamps the length. Returns
 * null when nothing usable remains, so a forged/blank id never reaches the DOM.
 */
export function sanitizeFootnoteId(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = value
      .replace(NOTE_ID_DISALLOWED_RE, "")
      .slice(0, MAX_FOOTNOTE_ID_LENGTH);
    if (cleaned) return cleaned;
  }
  return null;
}

let footnoteIdCounter = 0;

/**
 * Generate a fresh, attribute-safe note id. When a usable `seed` is supplied it
 * is reused; otherwise a new id is minted via crypto.randomUUID when available,
 * else a timestamp+counter fallback so the value is still unique within a
 * session. The result is funneled through sanitizeFootnoteId so it is always
 * within the safe alphabet + length bound. Mirrors comments.threadIdFor.
 */
export function footnoteIdFor(seed?: unknown): string {
  const fromSeed = sanitizeFootnoteId(seed);
  if (fromSeed) return fromSeed;
  let raw: string;
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as { randomUUID?: () => string } | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    raw = cryptoObj.randomUUID();
  } else {
    footnoteIdCounter += 1;
    raw = `fn-${Date.now().toString(36)}-${footnoteIdCounter.toString(36)}`;
  }
  const safe = sanitizeFootnoteId(raw);
  if (safe) return safe;
  footnoteIdCounter += 1;
  return `fn${footnoteIdCounter}`;
}

/**
 * Normalize a single note candidate to a clean FootnoteEntry, or null when it has
 * no usable id. The body is sanitized (may be empty). Used by normalize so the
 * same scrub applies on every edge.
 */
export function normalizeFootnote(value: unknown): FootnoteEntry | null {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = sanitizeFootnoteId(record.id);
  if (!id) return null;
  const rich = sanitizeFootnoteRichBody(record.rich);
  const body = rich
    ? sanitizeFootnoteBody(footnoteRichBodyText(rich))
    : sanitizeFootnoteBody(record.body);
  const markFlags = body ? undefined : sanitizeFootnoteMarkFlags(record.markFlags);
  const entry: FootnoteEntry = rich ? { id, body, rich } : { id, body };
  const media = sanitizeFootnoteSourceMedia(record);
  const pictures = media
    ? sanitizeFootnoteMediaPictures(record.sourceMediaPictures, body, media.sourceMediaCount ?? 0)
    : undefined;
  const paragraphFormat = sanitizeFootnoteParagraphFormat(record.paragraphFormat);
  const paragraphLines = sanitizeFootnoteParagraphLines(record.paragraphLines);
  return {
    ...entry,
    ...(markFlags ? { markFlags } : {}),
    ...(media ?? {}),
    ...(pictures ? { sourceMediaPictures: pictures } : {}),
    ...(paragraphFormat ? { paragraphFormat } : {}),
    ...(paragraphLines ? { paragraphLines } : {}),
  };
}

/** The blank-note typing flags, or undefined when there are none to keep. */
export function sanitizeFootnoteMarkFlags(value: unknown): FootnoteMarkFlag[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const flags = FOOTNOTE_RUN_FLAGS.filter((flag) => value.includes(flag));
  return flags.length ? [...flags] : undefined;
}

/**
 * Normalize + dedupe an array of note candidates. The first occurrence of any
 * given (sanitized) id wins; later duplicates are discarded so the store never
 * holds two notes claiming the same anchor. Caps the total note count. Always
 * returns an array (never throws), so a forged/garbage value yields [].
 */
export function normalizeFootnotes(value: unknown): FootnoteEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FootnoteEntry[] = [];
  for (const candidate of value) {
    if (out.length >= MAX_FOOTNOTES) break;
    const note = normalizeFootnote(candidate);
    if (!note) continue;
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    out.push(note);
  }
  return out;
}

/**
 * Add a brand-new note (its initial body, usually empty) to the store, returning
 * a NEW notes array. The id is sanitized; a duplicate id is a no-op. Caps the
 * total note count. Returns the original reference unchanged on a no-op so callers
 * can cheaply detect "nothing happened".
 */
export function addFootnoteEntry(
  notes: FootnoteEntry[],
  noteId: unknown,
  body: unknown = "",
): FootnoteEntry[] {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return notes;
  if (notes.length >= MAX_FOOTNOTES) return notes;
  if (notes.some((note) => note.id === id)) return notes;
  return [...notes, { id, body: sanitizeFootnoteBody(body) }];
}

/**
 * Replace the body of the note with the given id, returning a NEW notes array.
 * The body is sanitized. A no-op (same reference) when the note is missing or the
 * sanitized body is identical to the current one.
 */
export function setFootnoteBody(
  notes: FootnoteEntry[],
  noteId: unknown,
  body: unknown,
  rich?: unknown,
): FootnoteEntry[] {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return notes;
  const previous = notes.find((note) => note.id === id);
  // A note holding a drawing kept from the source file is read-only: its
  // words are the source's, which the writers carry over with the drawing.
  if (isFootnoteMediaPreserveOnly(previous)) return notes;
  const nextRich =
    sanitizeFootnoteRichBody(rich) ??
    (rich === undefined ? footnoteFormulasKeptInBody(previous?.rich, body) : undefined);
  const nextBody = nextRich
    ? sanitizeFootnoteBody(footnoteRichBodyText(nextRich))
    : sanitizeFootnoteBody(body);
  // Text arriving in a note that showed none takes the paragraph mark's
  // formatting, as Word types it: the save then writes that run with the
  // mark's own run properties instead of clearing them.
  const typedRich =
    previous?.markFlags?.length && !previous.body && nextBody
      ? withFootnoteMarkFlags(
          nextRich ?? [nextBody.split("\n").map((text) => ({ text }))],
          previous.markFlags,
        )
      : nextRich;

  let didChange = false;
  const next = notes.map((note) => {
    if (note.id !== id) return note;
    if (
      note.body === nextBody &&
      JSON.stringify(note.rich) === JSON.stringify(typedRich)
    ) {
      return note;
    }
    didChange = true;
    const { markFlags, ...rest } = note;
    // Still blank: it keeps the formatting typing there will take.
    const blank = nextBody ? {} : markFlags ? { markFlags } : {};
    if (typedRich) return { ...rest, ...blank, body: nextBody, rich: typedRich };
    const { rich: _dropped, ...plain } = rest;
    void _dropped;
    return { ...plain, ...blank, body: nextBody };
  });
  return didChange ? next : notes;
}

/**
 * A note's new plain text that still holds each of its formulas' characters:
 * the note with those formulas where they stand (and its other words plain).
 * A caller that only knows the text (an AI edit, a body-only command) keeps
 * the note's formulas instead of writing their object characters as text.
 * Undefined when the note held no formula or the characters no longer match
 * them one for one.
 */
function footnoteFormulasKeptInBody(
  previous: FootnoteRichBody | undefined,
  body: unknown,
): FootnoteRichBody | undefined {
  if (!previous || typeof body !== "string") return undefined;
  const formulas = previous.flat().filter(isNoteMathRun);
  if (!formulas.length) return undefined;
  const text = sanitizeFootnoteBody(body);
  const count = text.split(NOTE_MATH_CHAR).length - 1;
  if (count !== formulas.length) return undefined;
  let next = 0;
  const rich: FootnoteRichBody = text.split("\n").map((line) => {
    const runs: FootnoteRun[] = [];
    line.split(NOTE_MATH_CHAR).forEach((piece, index) => {
      if (index > 0) runs.push({ ...formulas[next++] });
      if (piece) runs.push({ text: piece });
    });
    return runs;
  });
  return sanitizeFootnoteRichBody(rich);
}

/** Give every run that carries no formatting of its own these flags. */
function withFootnoteMarkFlags(
  rich: FootnoteRichBody,
  flags: readonly FootnoteMarkFlag[],
): FootnoteRichBody | undefined {
  const applied = rich.map((runs) =>
    runs.map((run) =>
      isNoteMathRun(run) || FOOTNOTE_RUN_FLAGS.some((flag) => run[flag])
        ? run
        : { ...run, ...Object.fromEntries(flags.map((flag) => [flag, true])) },
    ),
  );
  return sanitizeFootnoteRichBody(applied);
}

/**
 * Remove the note with the given id, returning a NEW notes array. A no-op (same
 * reference) when the note is missing. The caller is responsible for also
 * stripping the matching footnoteRef mark from the document.
 */
export function removeFootnoteEntry(
  notes: FootnoteEntry[],
  noteId: unknown,
): FootnoteEntry[] {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return notes;
  const next = notes.filter((note) => note.id !== id);
  return next.length === notes.length ? notes : next;
}

/** Look up a note by (sanitized) id, or null when absent. */
export function findFootnote(
  notes: FootnoteEntry[],
  noteId: unknown,
): FootnoteEntry | null {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return null;
  return notes.find((note) => note.id === id) ?? null;
}

/** A note projected for rendering: its id, body, and 1-based visible number. */
export interface NumberedFootnote {
  id: string;
  body: string;
  rich?: FootnoteRichBody;
  number: number;
  /** The note holds a drawing kept only in the source file: shown, not edited. */
  readOnly?: true;
  /** The pictures that note draws in its line (offsets into `body`). */
  pictures?: FootnoteMediaPicture[];
  /** The note's own paragraph format, when it is not in the note style. */
  paragraphFormat?: FootnoteParagraphFormat;
  /** Each paragraph's own Exactly / At least line (null: the note's line). */
  paragraphLines?: (FootnoteParagraphLine | null)[];
}

/**
 * Project the note store into an ORDERED, auto-numbered list for rendering. The
 * order is given by `orderedIds` — the ids of the footnoteRef marks in the order
 * they first appear in the document body (computed by the extension from the live
 * doc). Each id is assigned the next 1-based number in that order.
 *
 *  - A ref whose note record is missing still gets a number (body = "") so the
 *    in-text marker and the list stay consistent (a dangling ref degrades to an
 *    empty note rather than a gap in the numbering).
 *  - A note record with NO surviving ref in the body is dropped from the rendered
 *    list (an orphaned note carries no anchor, so it is not numbered/shown).
 *  - Duplicate ids in `orderedIds` are collapsed to their first occurrence (a
 *    single note anchored once).
 *
 * PURE: given the same store + order it always yields the same projection, so the
 * in-text number (derived from the same order) and the list number agree.
 */
export function numberFootnotes(
  notes: FootnoteEntry[],
  orderedIds: string[],
): NumberedFootnote[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const seen = new Set<string>();
  const out: NumberedFootnote[] = [];
  for (const rawId of orderedIds) {
    const id = sanitizeFootnoteId(rawId);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      body: byId.get(id)?.body ?? "",
      rich: byId.get(id)?.rich,
      number: out.length + 1,
      ...(isFootnoteMediaPreserveOnly(byId.get(id)) ? { readOnly: true as const } : {}),
      ...(byId.get(id)?.sourceMediaPictures?.length
        ? { pictures: byId.get(id)!.sourceMediaPictures }
        : {}),
    });
  }
  return out;
}

/**
 * The 1-based visible number for a single note id, given the document order, or
 * null when the id has no anchoring ref. A thin convenience over numberFootnotes
 * for the in-text marker.
 */
export function footnoteNumberFor(
  orderedIds: string[],
  noteId: unknown,
): number | null {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return null;
  const seen = new Set<string>();
  let n = 0;
  for (const rawId of orderedIds) {
    const candidate = sanitizeFootnoteId(rawId);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    n += 1;
    if (candidate === id) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Word-parity note STREAMS (脚注 vs 尾注) + custom marks.
//
// Word keeps two independent note streams: footnotes render at the bottom of
// their page, endnotes in a block at the document end, each with its own
// numbering. Imported endnote ids are namespaced "en-N" (and app-inserted
// endnotes mint "en-" prefixed ids), so the stream derives from the id; a
// legacy single-stream document with plain ids and placement mode "endnote"
// keeps rendering under 尾注. Word 自定义标记 (customMarkFollows): a ref whose
// glyph is a literal mark ("a", "*", …) consumes NO auto number — numbering
// skips it, exactly like Word.
// ---------------------------------------------------------------------------

export type NoteStream = (typeof FOOTNOTE_MODES)[number];

/** One in-text marker in document order: its note id + optional custom mark. */
export interface OrderedNoteRef {
  id: string;
  customMark: string | null;
  /** Zero-based structural section/page used by native restart policies. */
  sectionIndex?: number;
  pageIndex?: number;
}

// ---------------------------------------------------------------------------
// Word note SETTINGS (w:footnotePr / w:endnotePr — pos + numbering).
//
// Word numbers each note stream in a per-stream style: decimal (1 2 3),
// lowerRoman (i ii iii — Word's FAMOUS default for ENDNOTES), upperRoman,
// lowerLetter / upperLetter (a…z then doubled: 27 → aa, 28 → bb — Word's
// note-letter convention, NOT bijective base-26), and chicago (* † ‡ §
// cycling, doubling each cycle: the 5th marker is **). Each stream also has
// a "start at N" value, a restart policy, and a per-stream placement. They
// live as doc attrs registered by footnoteExtension.tsx and round-trip through
// both DOCX import/export paths. null means the native Word default.
// ---------------------------------------------------------------------------

/** The note numbering styles — a CLOSED set mapping 1:1 onto OOXML w:numFmt. */
export const NOTE_NUM_FMTS = [
  "decimal",
  "lowerRoman",
  "upperRoman",
  "lowerLetter",
  "upperLetter",
  "chicago",
] as const;
export type NoteNumFmt = (typeof NOTE_NUM_FMTS)[number];

/** Closed OOXML w:pos values supported by the two note streams. */
export const FOOTNOTE_POSITIONS = ["pageBottom", "beneathText"] as const;
export const ENDNOTE_POSITIONS = ["docEnd", "sectEnd"] as const;
export type FootnotePosition = (typeof FOOTNOTE_POSITIONS)[number];
export type EndnotePosition = (typeof ENDNOTE_POSITIONS)[number];
export type NotePosition = FootnotePosition | EndnotePosition;

/** Closed OOXML w:numRestart values. Endnotes cannot restart on each page. */
export const NOTE_RESTARTS = ["continuous", "eachSect", "eachPage"] as const;
export type NoteRestart = (typeof NOTE_RESTARTS)[number];

export const DEFAULT_FOOTNOTE_POSITION: FootnotePosition = "pageBottom";
export const DEFAULT_ENDNOTE_POSITION: EndnotePosition = "docEnd";
export const DEFAULT_NOTE_RESTART: NoteRestart = "continuous";

/** The app default for BOTH streams (Word's own footnote default). */
export const DEFAULT_NOTE_NUM_FMT: NoteNumFmt = "decimal";

/** Sane cap for a stream's "start at N" (mirrors the page-number clamp). */
export const MAX_NOTE_NUM_START = 9999;

const NOTE_NUM_FMT_SET: ReadonlySet<string> = new Set(NOTE_NUM_FMTS);
const FOOTNOTE_POSITION_SET: ReadonlySet<string> = new Set(FOOTNOTE_POSITIONS);
const ENDNOTE_POSITION_SET: ReadonlySet<string> = new Set(ENDNOTE_POSITIONS);
const NOTE_RESTART_SET: ReadonlySet<string> = new Set(NOTE_RESTARTS);

/** Word's chicago footnote symbols, in cycle order. */
const CHICAGO_SYMBOLS = ["*", "†", "‡", "§"] as const;

/**
 * Coerce a numbering-format candidate to a whitelisted {@link NoteNumFmt},
 * else null (callers treat null as the decimal default). Closed whitelist on
 * every edge so a forged/imported value can never smuggle an arbitrary token.
 */
export function sanitizeNoteNumFmt(value: unknown): NoteNumFmt | null {
  return typeof value === "string" && NOTE_NUM_FMT_SET.has(value)
    ? (value as NoteNumFmt)
    : null;
}

/**
 * Coerce a "start at N" candidate to a clamped 1-based integer, or null when
 * unusable (callers treat null as the default start of 1). Accepts a numeric
 * string (an imported XML attribute) too.
 */
export function sanitizeNoteNumStart(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.floor(n), 1), MAX_NOTE_NUM_START);
}

/** Validate one stream's OOXML placement token without cross-stream leakage. */
export function sanitizeNotePosition(
  stream: NoteStream,
  value: unknown,
): NotePosition | null {
  if (typeof value !== "string") return null;
  const allowed =
    stream === "endnote" ? ENDNOTE_POSITION_SET : FOOTNOTE_POSITION_SET;
  return allowed.has(value) ? (value as NotePosition) : null;
}

/** Validate restart policy; Word does not permit endnotes to restart per page. */
export function sanitizeNoteRestart(
  stream: NoteStream,
  value: unknown,
): NoteRestart | null {
  if (typeof value !== "string" || !NOTE_RESTART_SET.has(value)) return null;
  if (stream === "endnote" && value === "eachPage") return null;
  return value as NoteRestart;
}

export function defaultNotePosition(stream: NoteStream): NotePosition {
  return stream === "endnote"
    ? DEFAULT_ENDNOTE_POSITION
    : DEFAULT_FOOTNOTE_POSITION;
}

// Roman table (descending) — covers up to MAX_NOTE_NUM_START (9999).
const NOTE_ROMAN_TABLE: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function noteUpperRoman(ordinal: number): string {
  let n = ordinal;
  let out = "";
  for (const [value, glyph] of NOTE_ROMAN_TABLE) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

/**
 * Render ONE note ordinal (1-based) in the given numbering format. PURE, and
 * always a closed composition of ASCII letters/digits + the four fixed
 * chicago glyphs, so the label can never smuggle markup.
 *
 *   formatNoteLabel("decimal", 5)      === "5"
 *   formatNoteLabel("lowerRoman", 4)   === "iv"
 *   formatNoteLabel("upperRoman", 9)   === "IX"
 *   formatNoteLabel("lowerLetter", 27) === "aa"   (Word doubles: 28 → "bb")
 *   formatNoteLabel("upperLetter", 2)  === "B"
 *   formatNoteLabel("chicago", 5)      === "**"   (* † ‡ § then doubled)
 *
 * An off-whitelist/absent format falls back to decimal.
 */
export function formatNoteLabel(
  numFmt: NoteNumFmt | null | undefined,
  n: number,
): string {
  const ordinal = Math.max(1, Math.floor(Number(n) || 1));
  switch (sanitizeNoteNumFmt(numFmt)) {
    case "lowerRoman":
      return noteUpperRoman(ordinal).toLowerCase();
    case "upperRoman":
      return noteUpperRoman(ordinal);
    case "lowerLetter": {
      // Word note lettering DOUBLES after z: 26 → z, 27 → aa, 28 → bb.
      const letter = String.fromCharCode(97 + ((ordinal - 1) % 26));
      return letter.repeat(Math.floor((ordinal - 1) / 26) + 1);
    }
    case "upperLetter": {
      const letter = String.fromCharCode(65 + ((ordinal - 1) % 26));
      return letter.repeat(Math.floor((ordinal - 1) / 26) + 1);
    }
    case "chicago": {
      // * † ‡ § cycling, one more repeat each full cycle: 5th marker = "**".
      const symbol = CHICAGO_SYMBOLS[(ordinal - 1) % 4];
      return symbol.repeat(Math.floor((ordinal - 1) / 4) + 1);
    }
    default:
      return String(ordinal);
  }
}

/** One stream's numbering settings (null field = the decimal / start-1 default). */
export interface NoteStreamNumbering {
  numFmt: NoteNumFmt | null;
  start: number | null;
}

/** Per-stream numbering settings for both Word note streams. */
export interface NoteStreamsNumbering {
  footnote: NoteStreamNumbering;
  endnote: NoteStreamNumbering;
}

/** The all-default numbering (both streams decimal from 1). */
export function defaultNoteNumbering(): NoteStreamsNumbering {
  return {
    footnote: { numFmt: null, start: null },
    endnote: { numFmt: null, start: null },
  };
}

/**
 * Read + sanitize the four note-numbering doc attrs (footnoteNumFmt /
 * endnoteNumFmt / footnoteNumStart / endnoteNumStart) off a doc-attrs record.
 * Never throws; every field funnels through the whitelist/clamp so forged
 * attrs degrade to the defaults. Shared by the extension views and the paged
 * seam/measure pipeline so every rendering surface agrees.
 */
export function noteNumberingFromDocAttrs(
  attrs: Record<string, unknown>,
): NoteStreamsNumbering {
  return {
    footnote: {
      numFmt: sanitizeNoteNumFmt(attrs.footnoteNumFmt),
      start: sanitizeNoteNumStart(attrs.footnoteNumStart),
    },
    endnote: {
      numFmt: sanitizeNoteNumFmt(attrs.endnoteNumFmt),
      start: sanitizeNoteNumStart(attrs.endnoteNumStart),
    },
  };
}

export interface NoteStreamSettings extends NoteStreamNumbering {
  position: NotePosition | null;
  restart: NoteRestart | null;
}

export interface NoteStreamsSettings {
  footnote: NoteStreamSettings;
  endnote: NoteStreamSettings;
  /**
   * The settings each Word section actually numbers with, in section order:
   * the section's own `w:footnotePr` / `w:endnotePr` over the document
   * values (see noteSectionSettings.ts). Absent = every section uses the
   * document values above.
   */
  sections?: ReadonlyArray<{
    footnote: NoteStreamSettings;
    endnote: NoteStreamSettings;
  }>;
}

// ---------------------------------------------------------------------------
// Section-level note properties (`w:sectPr/w:footnotePr`, `w:endnotePr`).
//
// Word keeps the Footnote and Endnote dialog's values per SECTION (ECMA-376
// 17.11.11 / 17.11.5: "an override of the document-wide properties"), and the
// dialog's "Apply changes to" picks Whole document or This section. Word 16's

// (pos, numFmt, numStart, numRestart) and the numFmt / numStart / numRestart
// of its endnotePr number that section's notes; the endnote PLACEMENT is the
// one document-wide value (settings.xml — a section's endnotePr/pos is never
// read, and Word writes Location there whatever the scope).
//
// A section entry stores only what differs from the document values the
// note doc attrs hold; an absent field follows the document.
// ---------------------------------------------------------------------------

export interface SectionNoteProperties {
  numFmt?: NoteNumFmt;
  start?: number;
  restart?: NoteRestart;
  /** Footnotes only: Word's per-section Location (bottom of page / below text). */
  position?: FootnotePosition;
}

const SECTION_FOOTNOTE_PROPERTY_KEYS = [
  "numFmt",
  "start",
  "restart",
  "position",
] as const;
const SECTION_ENDNOTE_PROPERTY_KEYS = ["numFmt", "start", "restart"] as const;

export function sectionNotePropertyKeys(
  stream: NoteStream,
): readonly (keyof SectionNoteProperties)[] {
  return stream === "endnote"
    ? SECTION_ENDNOTE_PROPERTY_KEYS
    : SECTION_FOOTNOTE_PROPERTY_KEYS;
}

/**
 * Strict reader of one section's note-property group: a closed set of keys,
 * every value on its whitelist, at least one field. Anything else is refused
 * (null), so a forged entry can never reach numbering or the DOCX writers.
 */
export function sanitizeSectionNoteProperties(
  stream: NoteStream,
  value: unknown,
): SectionNoteProperties | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = sectionNotePropertyKeys(stream) as readonly string[];
  if (Object.keys(record).some((key) => !keys.includes(key))) return null;
  const out: SectionNoteProperties = {};
  if (record.numFmt !== undefined) {
    const numFmt = sanitizeNoteNumFmt(record.numFmt);
    if (!numFmt) return null;
    out.numFmt = numFmt;
  }
  if (record.start !== undefined) {
    if (
      typeof record.start !== "number" ||
      !Number.isInteger(record.start) ||
      record.start < 1 ||
      record.start > MAX_NOTE_NUM_START
    ) {
      return null;
    }
    out.start = record.start;
  }
  if (record.restart !== undefined) {
    const restart = sanitizeNoteRestart(stream, record.restart);
    if (!restart) return null;
    out.restart = restart;
  }
  if (record.position !== undefined) {
    const position = sanitizeNotePosition("footnote", record.position);
    if (!position) return null;
    out.position = position as FootnotePosition;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** One stream's settings for a section: its own fields over the document's. */
export function resolveSectionNoteSettings(
  stream: NoteStream,
  documentSettings: NoteStreamSettings,
  section: SectionNoteProperties | null | undefined,
): NoteStreamSettings {
  if (!section) return documentSettings;
  return {
    numFmt: section.numFmt ?? documentSettings.numFmt,
    start: section.start ?? documentSettings.start,
    restart: section.restart ?? documentSettings.restart,
    position:
      stream === "footnote"
        ? (section.position ?? documentSettings.position)
        : documentSettings.position,
  };
}

/**
 * The section group that makes a section number with `value`: only the
 * fields that differ from the document values, or null when none does (the
 * section then simply follows the document). Defaults compare as Word's
 * defaults, so "decimal" and an unset format are the same value.
 */
export function sectionNotePropertiesFor(
  stream: NoteStream,
  value: {
    numFmt: NoteNumFmt;
    start: number;
    restart: NoteRestart;
    position?: NotePosition;
  },
  documentSettings: NoteStreamSettings,
): SectionNoteProperties | null {
  const out: SectionNoteProperties = {};
  const docFmt = documentSettings.numFmt ?? DEFAULT_NOTE_NUM_FMT;
  const docStart = documentSettings.start ?? 1;
  const docRestart = documentSettings.restart ?? DEFAULT_NOTE_RESTART;
  const numFmt = sanitizeNoteNumFmt(value.numFmt) ?? DEFAULT_NOTE_NUM_FMT;
  const start = sanitizeNoteNumStart(value.start) ?? 1;
  const restart = sanitizeNoteRestart(stream, value.restart) ?? DEFAULT_NOTE_RESTART;
  if (numFmt !== docFmt) out.numFmt = numFmt;
  // Word numbers a restarting stream from 1 whatever its Start at says (and
  // its object model refuses a start once the rule is not Continuous), so a
  // start is only kept where it can take effect.
  if (restart === "continuous" && start !== docStart) out.start = start;
  if (restart !== docRestart) out.restart = restart;
  if (stream === "footnote") {
    const position =
      sanitizeNotePosition("footnote", value.position) ??
      DEFAULT_FOOTNOTE_POSITION;
    const docPosition = documentSettings.position ?? DEFAULT_FOOTNOTE_POSITION;
    if (position !== docPosition) out.position = position as FootnotePosition;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Full native settings while keeping the legacy numbering reader stable. */
export function noteSettingsFromDocAttrs(
  attrs: Record<string, unknown>,
): NoteStreamsSettings {
  const numbering = noteNumberingFromDocAttrs(attrs);
  return {
    footnote: {
      ...numbering.footnote,
      position: sanitizeNotePosition("footnote", attrs.footnotePosition),
      restart: sanitizeNoteRestart("footnote", attrs.footnoteNumRestart),
    },
    endnote: {
      ...numbering.endnote,
      position: sanitizeNotePosition("endnote", attrs.endnotePosition),
      restart: sanitizeNoteRestart("endnote", attrs.endnoteNumRestart),
    },
  };
}

/** Word custom marker glyph: plain text, control-stripped, at most 8 chars. */
export function sanitizeCustomMark(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(BODY_CONTROL_BYTE_RE, "").trim().slice(0, 8);
  return cleaned || null;
}

/** The stream a note id belongs to (legacy plain-id docs follow the mode). */
export function noteStreamOf(id: string, mode: FootnoteMode): NoteStream {
  if (id.startsWith("en-")) return "endnote";
  return mode === "endnote" ? "endnote" : "footnote";
}

/** A numbered note plus its stream + visible marker label. */
export interface NumberedStreamNote extends NumberedFootnote {
  stream: NoteStream;
  customMark: string | null;
  /** What the marker/list shows: the custom mark, or the stream number. */
  label: string;
}

/**
 * Project the store into the TWO Word note streams, numbering each stream
 * independently in first-reference document order. Custom-marked refs keep
 * their position but consume no number (their label is the mark glyph).
 * `numbering` carries each stream's Word numbering settings (numFmt +
 * "start at N"); omitted/null fields mean the decimal-from-1 default, so
 * every existing call site keeps its exact previous labels. The `number`
 * field stays the RAW 1-based stream ordinal (offset/format applied only to
 * the label), so consumers keyed on ordinals (export ids, zone assignment)
 * are unaffected. Same PURE contract as numberFootnotes.
 */
export function numberNoteStreams(
  notes: FootnoteEntry[],
  orderedRefs: OrderedNoteRef[],
  mode: FootnoteMode,
  numbering?: NoteStreamsNumbering | NoteStreamsSettings | null,
): { footnotes: NumberedStreamNote[]; endnotes: NumberedStreamNote[] } {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const seen = new Set<string>();
  const out: { footnote: NumberedStreamNote[]; endnote: NumberedStreamNote[] } = {
    footnote: [],
    endnote: [],
  };
  const counters: Record<NoteStream, number> = { footnote: 0, endnote: 0 };
  // The run a restarting section/page numbers within: its key and count.
  const localKey: Record<NoteStream, string | null> = {
    footnote: null,
    endnote: null,
  };
  const localCounters: Record<NoteStream, number> = {
    footnote: 0,
    endnote: 0,
  };
  const sections = (numbering as NoteStreamsSettings | null | undefined)
    ?.sections;
  const settingsFor = (
    stream: NoteStream,
    sectionIndex: number | undefined,
  ): { numFmt: NoteNumFmt | null; start: number; restart: NoteRestart } => {
    const base = (
      sectionIndex !== undefined && sections?.[sectionIndex]
        ? sections[sectionIndex][stream]
        : numbering?.[stream]
    ) as Partial<NoteStreamSettings> | undefined;
    return {
      numFmt: sanitizeNoteNumFmt(base?.numFmt),
      start: sanitizeNoteNumStart(base?.start) ?? 1,
      restart: sanitizeNoteRestart(stream, base?.restart) ?? DEFAULT_NOTE_RESTART,
    };
  };
  for (const ref of orderedRefs) {
    const id = sanitizeFootnoteId(ref.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const stream = noteStreamOf(id, mode);
    const customMark = sanitizeCustomMark(ref.customMark);
    const number = customMark ? 0 : (counters[stream] += 1);
    let label: string;
    if (customMark) {
      label = customMark;
    } else {
      
      // `start + n - 1`, n counting every note of the stream from the
      // document start (a restarting section before it does not reset n);
      // Restart each section / each page counts from 1 within that section
      // or page and reads no start. Each note takes the format and rule of
      // the section its reference sits in.
      const settings = settingsFor(stream, ref.sectionIndex);
      let ordinal: number;
      if (settings.restart === "continuous") {
        ordinal = settings.start + number - 1;
      } else {
        const key =
          settings.restart === "eachSect"
            ? `s${ref.sectionIndex ?? 0}`
            : `p${ref.pageIndex ?? 0}`;
        if (localKey[stream] !== key) {
          localKey[stream] = key;
          localCounters[stream] = 0;
        }
        ordinal = (localCounters[stream] += 1);
      }
      label = formatNoteLabel(settings.numFmt, ordinal);
    }
    out[stream].push({
      id,
      body: byId.get(id)?.body ?? "",
      rich: byId.get(id)?.rich,
      number,
      stream,
      customMark,
      label,
      ...(isFootnoteMediaPreserveOnly(byId.get(id)) ? { readOnly: true as const } : {}),
      ...(byId.get(id)?.sourceMediaPictures?.length
        ? { pictures: byId.get(id)!.sourceMediaPictures }
        : {}),
      ...(byId.get(id)?.paragraphFormat ? { paragraphFormat: byId.get(id)!.paragraphFormat } : {}),
      ...(byId.get(id)?.paragraphLines ? { paragraphLines: byId.get(id)!.paragraphLines } : {}),
    });
  }
  return { footnotes: out.footnote, endnotes: out.endnote };
}

/**
 * The visible marker label for one note id under stream numbering: its custom
 * mark, its formatted stream number (per the optional per-stream numbering
 * settings), or null without an anchoring ref.
 */
export function noteMarkerLabelFor(
  orderedRefs: OrderedNoteRef[],
  noteId: unknown,
  mode: FootnoteMode,
  numbering?: NoteStreamsNumbering | NoteStreamsSettings | null,
): string | null {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return null;
  return noteMarkerLabels(orderedRefs, mode, numbering).get(id) ?? null;
}

/** Every note's marker label, by id: one numbering of the streams for them all. */
export function noteMarkerLabels(
  orderedRefs: OrderedNoteRef[],
  mode: FootnoteMode,
  numbering?: NoteStreamsNumbering | NoteStreamsSettings | null,
): Map<string, string> {
  const { footnotes, endnotes } = numberNoteStreams([], orderedRefs, mode, numbering);
  const labels = new Map<string, string>();
  for (const note of [...footnotes, ...endnotes]) {
    if (!labels.has(note.id)) labels.set(note.id, note.label);
  }
  return labels;
}
