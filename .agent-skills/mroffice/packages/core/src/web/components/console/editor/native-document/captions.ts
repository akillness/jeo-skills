/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for document CAPTIONS (Word/WPS "Figure N" / "Table N" parity).
 *
 * Kept free of any TipTap/React imports so the caption-collection, kind
 * normalization, anchor-id derivation, and live auto-numbering logic can be
 * unit-tested in isolation and reused by the `caption` NodeView, the cross-ref
 * picker, the docx export, and the import compiler.
 *
 * Design notes (mirroring tableOfContents.ts):
 *  - A caption derives its sequential NUMBER live — by counting prior captions of
 *    the SAME kind in document order — rather than persisting a denormalized
 *    number, so inserting / deleting / reordering a figure renumbers without
 *    drift. Figure and Table counters are INDEPENDENT.
 *  - A caption carries a stable, sanitized `anchor_id` (back-filled lazily, same
 *    scheme as headings) so a cross-reference link survives edits to the label.
 *  - All ids/labels funnel through the SAME sanitizers as headings
 *    (sanitizeAnchorId / sanitizeHeadingText) so a forged/imported value can
 *    never break out of the DOM attribute surface or inject markup.
 */

import type { JSONContent } from "@tiptap/core";
import {
  MAX_ANCHOR_ID_LENGTH,
  MAX_TOC_PAGE_NUMBER,
  MAX_TOC_SNAPSHOT_ENTRIES,
  sanitizeAnchorId,
  sanitizeHeadingText,
  slugifyHeadingAnchor,
  type TocUpdateMode,
} from "./tableOfContents";
import { formatPageNumber } from "./pageNumberFormat";

/** The caption node name (TipTap + JSON `type`). */
export const CAPTION_NODE_NAME = "caption";

/**
 * The List-of-Figures / List-of-Tables block node name (TipTap + JSON `type`).
 * Like the `tableOfContents` node this block persists a bounded field-result
 * snapshot so page-only and entire-table updates remain distinct. Word calls
 * this "Insert Table of Figures".
 */
export const LIST_OF_FIGURES_NODE_NAME = "listOfFigures";

/** Attribute name carrying a caption's stable per-node anchor id. */
export const CAPTION_ANCHOR_ID_ATTR = "anchor_id";

/**
 * Word's built-in caption labels (the SEQ field name in Word: `Figure` /
 * `Table` / `Equation`). Each keeps its own counter.
 */
export const CAPTION_BUILTIN_KINDS = ["figure", "table", "equation"] as const;

export type CaptionBuiltinKind = (typeof CAPTION_BUILTIN_KINDS)[number];

/**
 * The caption kinds: the built-in labels plus "custom", a label made with
 * Word's New Label... whose name the caption carries in `labelName`. Every
 * custom label numbers on its own, as its own `SEQ <label>` sequence does.
 */
export const CAPTION_KINDS = [...CAPTION_BUILTIN_KINDS, "custom"] as const;

export type CaptionKind = (typeof CAPTION_KINDS)[number];

/** Word limits a caption label (a SEQ identifier) to 40 characters. */
export const MAX_CAPTION_LABEL_NAME_LENGTH = 40;

export const CAPTION_NUMBER_FORMATS = [
  "Arabic",
  "Roman",
  "roman",
  "Alphabetic",
  "alphabetic",
] as const;
export type CaptionNumberFormat = (typeof CAPTION_NUMBER_FORMATS)[number];

export const CAPTION_POSITIONS = ["above", "below"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export const CAPTION_SEPARATORS = [": ", ". ", " – ", " — ", " - ", " ", ""] as const;
export type CaptionSeparator = (typeof CAPTION_SEPARATORS)[number];

export const CAPTION_CHAPTER_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type CaptionChapterHeadingLevel =
  (typeof CAPTION_CHAPTER_HEADING_LEVELS)[number];

export const CAPTION_CHAPTER_SEPARATORS = ["-", ".", ":", "–", "—"] as const;
export type CaptionChapterSeparator =
  (typeof CAPTION_CHAPTER_SEPARATORS)[number];

export interface CaptionAttributes {
  kind: CaptionKind;
  /**
   * The visible label text ("Figure", "图表", "Photo"). Required for a custom
   * label. On a built-in kind it pins the text the caption was written with,
   * so the caption reads the same for every viewer; `null` (documents saved
   * before labels were localized) shows the viewer's own built-in name.
   */
  labelName: string | null;
  label: string;
  position: CaptionPosition;
  numberFormat: CaptionNumberFormat;
  excludeLabel: boolean;
  separator: CaptionSeparator;
  includeChapterNumber: boolean;
  chapterHeadingLevel: CaptionChapterHeadingLevel;
  chapterSeparator: CaptionChapterSeparator;
  anchor_id?: string | null;
}

export const DEFAULT_CAPTION_ATTRIBUTES: CaptionAttributes = {
  kind: "figure",
  labelName: null,
  label: "",
  position: "below",
  numberFormat: "Arabic",
  excludeLabel: false,
  separator: ": ",
  includeChapterNumber: false,
  chapterHeadingLevel: 1,
  chapterSeparator: "-",
  anchor_id: null,
};

/**
 * The separator a NEW caption starts with. Word puts nothing of its own
 * between "Figure 1" and the text typed after it ("Add, format, or delete
 * captions in Word": "type any text, including punctuation, that you want to
 * appear after the label"), so a new caption reads "Figure 1 text". The node
 * default stays ": " — a stored caption that omits the attribute keeps the
 * colon it was written with.
 */
export const NEW_CAPTION_SEPARATOR: CaptionSeparator = " ";

const CAPTION_KIND_SET = new Set<string>(CAPTION_KINDS);
const CAPTION_BUILTIN_KIND_SET = new Set<string>(CAPTION_BUILTIN_KINDS);

const ENGLISH_CAPTION_LABEL_NAMES: Readonly<Record<CaptionBuiltinKind, string>> =
  { figure: "Figure", table: "Table", equation: "Equation" };

let builtinCaptionLabelNames: Readonly<Record<CaptionBuiltinKind, string>> =
  ENGLISH_CAPTION_LABEL_NAMES;
const builtinCaptionLabelNameListeners = new Set<() => void>();
let builtinCaptionLabelNamesInstalled = false;

/**
 * Whether the editor shell has installed the viewer's label names. Until then
 * the names are English placeholders and must not be written into a document.
 */
export function builtinCaptionLabelNamesAreInstalled(): boolean {
  return builtinCaptionLabelNamesInstalled;
}

/**
 * The built-in label names of the viewer's language (Word localizes them:
 * 图表 / 表格 / 公式, Abbildung / Tabelle / Formel, ...). Module state rather
 * than a parameter because the prefix is derived in places with no access to
 * the message catalog (node views, plugins, the export projection); the
 * editor shell sets it from the catalog. English until then. Only display
 * text depends on it — never numbering, anchors or the SEQ identifier.
 */
export function builtinCaptionLabelName(kind: CaptionBuiltinKind): string {
  return builtinCaptionLabelNames[kind];
}

/** Install the viewer's built-in label names; returns whether they changed. */
export function setBuiltinCaptionLabelNames(
  names: Partial<Record<CaptionBuiltinKind, unknown>> | null,
): boolean {
  builtinCaptionLabelNamesInstalled = names !== null;
  const next = { ...ENGLISH_CAPTION_LABEL_NAMES };
  for (const kind of CAPTION_BUILTIN_KINDS) {
    const name = sanitizeCaptionLabelName(names?.[kind]);
    if (name) next[kind] = name;
  }
  if (
    CAPTION_BUILTIN_KINDS.every(
      (kind) => next[kind] === builtinCaptionLabelNames[kind],
    )
  ) {
    return false;
  }
  builtinCaptionLabelNames = next;
  return true;
}

/** Tell mounted caption views that the built-in label names changed. */
export function notifyBuiltinCaptionLabelNames(): void {
  for (const listener of [...builtinCaptionLabelNameListeners]) listener();
}

export function subscribeBuiltinCaptionLabelNames(
  listener: () => void,
): () => void {
  builtinCaptionLabelNameListeners.add(listener);
  return () => {
    builtinCaptionLabelNameListeners.delete(listener);
  };
}

/**
 * Sanitize a caption label NAME as Word's New Label accepts it: one line, no
 * control characters, at most 40 characters. Empty means "no name".
 */
export function sanitizeCaptionLabelName(value: unknown): string {
  return sanitizeHeadingText(value)
    .slice(0, MAX_CAPTION_LABEL_NAME_LENGTH)
    .trim();
}

export function isCaptionBuiltinKind(value: unknown): value is CaptionBuiltinKind {
  return typeof value === "string" && CAPTION_BUILTIN_KIND_SET.has(value);
}

/**
 * Coerce an arbitrary value into a whitelisted caption kind, defaulting to
 * "figure" for any unknown/garbage value (never throws — the node always has a
 * usable kind). Accepts the Word SEQ field name case-insensitively so an
 * imported `SEQ Figure`/`SEQ Table` maps back cleanly.
 */
export function normalizeCaptionKind(value: unknown): CaptionKind {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (CAPTION_KIND_SET.has(lower)) return lower as CaptionKind;
  }
  return "figure";
}

/** {@link normalizeCaptionKind} restricted to Word's built-in labels. */
export function normalizeCaptionBuiltinKind(value: unknown): CaptionBuiltinKind {
  const kind = normalizeCaptionKind(value);
  return kind === "custom" ? "figure" : kind;
}

export function normalizeCaptionNumberFormat(
  value: unknown,
): CaptionNumberFormat {
  return typeof value === "string" &&
    (CAPTION_NUMBER_FORMATS as readonly string[]).includes(value)
    ? (value as CaptionNumberFormat)
    : DEFAULT_CAPTION_ATTRIBUTES.numberFormat;
}

export function normalizeCaptionPosition(value: unknown): CaptionPosition {
  return value === "above" ? "above" : "below";
}

export function normalizeCaptionSeparator(value: unknown): CaptionSeparator {
  return typeof value === "string" &&
    (CAPTION_SEPARATORS as readonly string[]).includes(value)
    ? (value as CaptionSeparator)
    : DEFAULT_CAPTION_ATTRIBUTES.separator;
}

export function normalizeCaptionChapterHeadingLevel(
  value: unknown,
): CaptionChapterHeadingLevel {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    (CAPTION_CHAPTER_HEADING_LEVELS as readonly number[]).includes(value)
    ? (value as CaptionChapterHeadingLevel)
    : DEFAULT_CAPTION_ATTRIBUTES.chapterHeadingLevel;
}

export function normalizeCaptionChapterSeparator(
  value: unknown,
): CaptionChapterSeparator {
  return typeof value === "string" &&
    (CAPTION_CHAPTER_SEPARATORS as readonly string[]).includes(value)
    ? (value as CaptionChapterSeparator)
    : DEFAULT_CAPTION_ATTRIBUTES.chapterSeparator;
}

export function normalizeCaptionAttributes(value: unknown): CaptionAttributes {
  const attrs = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const anchor = sanitizeAnchorId(attrs.anchor_id);
  const labelName = sanitizeCaptionLabelName(attrs.labelName) || null;
  const kind = normalizeCaptionKind(attrs.kind);
  return {
    // A custom label is its name; without one it is a plain figure caption.
    kind: kind === "custom" && !labelName ? "figure" : kind,
    labelName,
    label: sanitizeCaptionLabel(attrs.label),
    position: normalizeCaptionPosition(attrs.position),
    numberFormat: normalizeCaptionNumberFormat(attrs.numberFormat),
    excludeLabel: attrs.excludeLabel === true,
    separator: normalizeCaptionSeparator(attrs.separator),
    includeChapterNumber: attrs.includeChapterNumber === true,
    chapterHeadingLevel: normalizeCaptionChapterHeadingLevel(
      attrs.chapterHeadingLevel,
    ),
    chapterSeparator: normalizeCaptionChapterSeparator(attrs.chapterSeparator),
    anchor_id: anchor || null,
  };
}

/**
 * The Word SEQ field's sequence name for a caption kind — "Figure" / "Table".
 * This is the identifier Word uses to keep two independent counters, and the
 * token the import compiler matches on (`SEQ Figure`/`SEQ Table`).
 */
export function captionSeqName(
  kind: CaptionKind,
): "Figure" | "Table" | "Equation" {
  return kind === "table" ? "Table" : kind === "equation" ? "Equation" : "Figure";
}

/**
 * The SEQ identifier of a caption: its label, as Word writes it. In Word the
 * label IS the sequence ("Figure 1" is `SEQ Figure`, a Chinese Word's "表格 1"
 * is `SEQ 表格`), with the characters a field identifier cannot hold replaced
 * by "_" (`SEQ My_Photo` for the label "My Photo"). A caption that never
 * stored its label text writes Word's English name for its kind.
 */
export function captionSeqIdentifier(
  kind: CaptionKind,
  labelName?: string | null,
): string {
  const name = sanitizeCaptionLabelName(labelName);
  if (!name) return captionSeqName(kind === "custom" ? "figure" : kind);
  // Letters, digits and "_" only (Word's rule for a SEQ identifier).
  return name.replace(/[^\p{L}\p{N}_]+/gu, "_") || captionSeqName("figure");
}

/** The label text a caption shows before its number. */
export function captionLabelText(
  kind: CaptionKind,
  labelName?: string | null,
): string {
  const stored = sanitizeCaptionLabelName(labelName);
  if (stored) return stored;
  return builtinCaptionLabelName(kind === "custom" ? "figure" : kind);
}

const CUSTOM_SEQUENCE_PREFIX = "label:";

/** A label as a SEQ identifier compares: without case, "_" read as a space. */
function labelIdentity(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The counter a caption advances, which is its label: Word numbers each
 * `SEQ <label>` on its own, whatever kind of object the caption is under.
 * Word's English built-in names keep their kind's key (`figure`), which a
 * caption that never stored its label text also has; every other label is
 * `label:<name>` (compared without case, a space and "_" alike). So an
 * imported `SEQ 表格` and a new caption labelled 表格 continue one sequence,
 * while "Figure" and "图表" are two, exactly as Word numbers them. Also the
 * value a Table of Figures stores as its caption label.
 */
export function captionSequenceKey(
  kind: CaptionKind,
  labelName?: string | null,
): CaptionBuiltinKind | `label:${string}` {
  const name = sanitizeCaptionLabelName(labelName);
  if (!name) return kind === "custom" ? "figure" : kind;
  const identity = labelIdentity(name);
  for (const builtin of CAPTION_BUILTIN_KINDS) {
    if (identity === captionSeqName(builtin).toLowerCase()) return builtin;
  }
  return `${CUSTOM_SEQUENCE_PREFIX}${name.replace(/_/g, " ").replace(/\s+/g, " ").trim()}`;
}

/** The custom label name inside a `label:<name>` sequence key, or "". */
export function captionSequenceLabelName(key: unknown): string {
  return typeof key === "string" && key.startsWith(CUSTOM_SEQUENCE_PREFIX)
    ? sanitizeCaptionLabelName(key.slice(CUSTOM_SEQUENCE_PREFIX.length))
    : "";
}

function sequenceCounterKey(attrs: CaptionAttributes): string {
  return captionSequenceKey(attrs.kind, attrs.labelName).toLowerCase();
}

/**
 * Sanitize a caption's human-readable label text (the prose after the
 * auto-number). Same scrubber as a TOC/heading label: drops control chars,
 * collapses whitespace, trims, and clamps the length.
 */
export function sanitizeCaptionLabel(value: unknown): string {
  return sanitizeHeadingText(value);
}

export interface DocCaption {
  /** The whitelisted caption kind. */
  kind: CaptionKind;
  /** The stored label text (always set for a custom label), when any. */
  labelName?: string | null;
  /** The live sequential number for this caption WITHIN its kind (1-based). */
  number: number;
  /** The sanitized label text shown after the number. */
  label: string;
  /** Stable anchor id this caption can be cross-referenced by (sanitized). */
  id: string;
  /** Current 1-based editor page when the paged projection can resolve it. */
  pageNumber?: number;
  /** Native Word SEQ number-format switch. */
  numberFormat: CaptionNumberFormat;
  /** Whether the visible Figure/Table prefix is omitted. */
  excludeLabel: boolean;
  /** Exact bounded punctuation between the generated number and prose. */
  separator: CaptionSeparator;
  /** Requested object-relative insertion position retained for later editing. */
  position: CaptionPosition;
  /** Whether this sequence restarts at the configured heading style. */
  includeChapterNumber?: boolean;
  /** Heading style used by Word's STYLEREF / SEQ restart fields. */
  chapterHeadingLevel?: CaptionChapterHeadingLevel;
  /** Punctuation between the live chapter and sequence numbers. */
  chapterSeparator?: CaptionChapterSeparator;
  /** Live dotted number of the nearest preceding configured heading. */
  chapterNumber?: string;
}

/** Persisted field-result row for a List of Figures / List of Tables. */
export interface GeneratedCaptionListEntry {
  /** Stable caption anchor used for page-only refresh and click navigation. */
  id: string;
  /** Exact bounded display text cached by the last full update. */
  text: string;
  /** Cached 1-based structural page. */
  pageNumber: number;
}

/**
 * Normalize a persisted generated-list field result. `null` identifies a
 * legacy live-derived node; an empty array is an explicitly updated empty list.
 */
export function normalizeGeneratedCaptionListEntries(
  value: unknown,
): GeneratedCaptionListEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: GeneratedCaptionListEntry[] = [];
  const used = new Set<string>();
  for (const raw of value.slice(0, MAX_TOC_SNAPSHOT_ENTRIES)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const id = sanitizeAnchorId(candidate.id);
    const text = sanitizeHeadingText(candidate.text);
    const rawPageNumber = candidate.pageNumber;
    const pageNumber =
      typeof rawPageNumber === "number" &&
      Number.isInteger(rawPageNumber) &&
      rawPageNumber >= 1 &&
      rawPageNumber <= MAX_TOC_PAGE_NUMBER
        ? rawPageNumber
        : 1;
    if (!id || !text || used.has(id)) continue;
    used.add(id);
    entries.push({ id, text, pageNumber });
  }
  return entries;
}

export interface CaptionNumberingState {
  counters: Map<string, number>;
  headingCounters: number[];
  headingEpochs: number[];
  lastHeadingNumbers: string[];
  lastRestartEpochs: Map<string, number>;
}

export function createCaptionNumberingState(): CaptionNumberingState {
  return {
    counters: new Map<string, number>(),
    headingCounters: new Array<number>(7).fill(0),
    headingEpochs: new Array<number>(7).fill(0),
    lastHeadingNumbers: new Array<string>(7).fill(""),
    lastRestartEpochs: new Map<string, number>(),
  };
}

export function observeCaptionHeading(
  state: CaptionNumberingState,
  rawLevel: unknown,
): void {
  if (
    typeof rawLevel !== "number" ||
    !Number.isInteger(rawLevel) ||
    rawLevel < 1 ||
    rawLevel > 6
  ) {
    return;
  }
  const level = rawLevel as CaptionChapterHeadingLevel;
  state.headingCounters[level] += 1;
  state.headingEpochs[level] += 1;
  for (let deeper = level + 1; deeper <= 6; deeper += 1) {
    state.headingCounters[deeper] = 0;
  }
  state.lastHeadingNumbers[level] = state.headingCounters
    .slice(1, level + 1)
    .map((counter) => counter || 1)
    .join(".");
}

export function nextCaptionNumber(
  state: CaptionNumberingState,
  attrs: CaptionAttributes,
  headingNumberingEnabled: boolean,
): { number: number; chapterNumber: string } {
  const sequence = sequenceCounterKey(attrs);
  const chapterNumber =
    attrs.includeChapterNumber && headingNumberingEnabled
      ? state.lastHeadingNumbers[attrs.chapterHeadingLevel]
      : "";
  if (chapterNumber) {
    const restartKey = `${sequence}:${attrs.chapterHeadingLevel}`;
    const epoch = state.headingEpochs[attrs.chapterHeadingLevel];
    if (state.lastRestartEpochs.get(restartKey) !== epoch) {
      state.counters.set(sequence, 0);
      state.lastRestartEpochs.set(restartKey, epoch);
    }
  }
  const number = (state.counters.get(sequence) ?? 0) + 1;
  state.counters.set(sequence, number);
  return { number, chapterNumber };
}

/**
 * A caption in a Word file is a paragraph with a SEQ field ("Figure" + SEQ
 * Figure + text); an imported document keeps it that way. The sequence a SEQ
 * identifier counts in is the one captions of that label count in, so a
 * caption added after imported ones continues their numbers.
 */
export function seqIdentifierCaptionLabel(identifier: unknown): {
  kind: CaptionKind;
  labelName: string | null;
} | null {
  if (typeof identifier !== "string") return null;
  const name = sanitizeCaptionLabelName(identifier.replace(/_/g, " "));
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === "figure" || lower === "table" || lower === "equation") {
    return { kind: lower, labelName: null };
  }
  return { kind: "custom", labelName: name };
}

/** The SEQ identifier of a `documentField` JSON/PM node's attrs, or "". */
export function seqFieldIdentifier(
  attrs: Record<string, unknown> | null | undefined,
): string {
  if (!attrs || attrs.fieldType !== "SEQ") return "";
  const options = attrs.options;
  const identifier =
    options && typeof options === "object"
      ? (options as { identifier?: unknown }).identifier
      : undefined;
  return typeof identifier === "string" ? identifier : "";
}

/**
 * Count one SEQ field in its sequence, as Word evaluates it; returns its
 * number, or null when it is not a caption sequence. `\s N` restarts the
 * sequence after each heading of level N or above (a chapter-numbered
 * caption), `\r N` resets it to N, `\c` repeats the last number.
 */
export function observeSeqField(
  state: CaptionNumberingState,
  attrs: Record<string, unknown> | null | undefined,
): number | null {
  const label = seqIdentifierCaptionLabel(seqFieldIdentifier(attrs));
  if (!label) return null;
  const sequence = captionSequenceKey(label.kind, label.labelName).toLowerCase();
  const options =
    attrs?.options && typeof attrs.options === "object"
      ? (attrs.options as Record<string, unknown>)
      : {};
  const restart = options.restartLevel;
  if (typeof restart === "number" && Number.isInteger(restart) && restart >= 1 && restart <= 6) {
    let epoch = 0;
    for (let level = 1; level <= restart; level += 1) epoch += state.headingEpochs[level] ?? 0;
    const restartKey = `${sequence}:s${restart}`;
    if (state.lastRestartEpochs.get(restartKey) !== epoch) {
      state.lastRestartEpochs.set(restartKey, epoch);
      state.counters.set(sequence, 0);
    }
  }
  const reset = options.resetTo;
  if (typeof reset === "number" && Number.isInteger(reset) && reset >= 0) {
    state.counters.set(sequence, reset);
    return reset;
  }
  if (options.repeat === true) return state.counters.get(sequence) ?? 0;
  const number = (state.counters.get(sequence) ?? 0) + 1;
  state.counters.set(sequence, number);
  return number;
}

/** Read a stored caption anchor id off a JSON node's attrs (sanitized). */
function storedCaptionAnchorId(node: JSONContent): string {
  return sanitizeAnchorId(
    (node.attrs as { [CAPTION_ANCHOR_ID_ATTR]?: unknown } | undefined)?.[
      CAPTION_ANCHOR_ID_ATTR
    ],
  );
}

/**
 * Walk a document JSON tree and collect every `caption` node in document order,
 * assigning each a LIVE sequential number within its kind (figures and tables
 * counted independently) and a stable, unique anchor id.
 *
 * Anchor id resolution, in order of preference:
 *   1. the caption's stored `anchor_id` attribute (sanitized);
 *   2. a slug derived from "<kind>-<label>" (sanitized);
 *   3. a positional fallback (`<kind>-N`) when neither yields anything.
 * Collisions are de-duplicated with a numeric suffix so every cross-reference
 * link points at exactly one caption. PURE — mirrors `collectHeadings`.
 */
export function collectCaptions(doc: unknown): DocCaption[] {
  const captions: DocCaption[] = [];
  const numbering = createCaptionNumberingState();
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  const rootAttrs =
    doc && typeof doc === "object" && "attrs" in doc
      ? (doc as { attrs?: Record<string, unknown> }).attrs
      : undefined;
  const headingNumberingEnabled = rootAttrs?.headingNumbering === true;
  let hasPageBlocks = false;
  const detectPageBlocks = (node: JSONContent): void => {
    if (node.type === "pageBlock") hasPageBlocks = true;
    if (!hasPageBlocks && Array.isArray(node.content)) {
      for (const child of node.content) detectPageBlocks(child);
    }
  };
  if (doc && typeof doc === "object") detectPageBlocks(doc as JSONContent);
  let pageNumber = hasPageBlocks ? 0 : 1;

  const reserved = new Set<string>();
  const reserve = (node: JSONContent): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === CAPTION_NODE_NAME) {
      const stored = storedCaptionAnchorId(node);
      if (stored) reserved.add(stored);
    }
    if (Array.isArray(node.content)) for (const child of node.content) reserve(child);
  };
  if (doc && typeof doc === "object") reserve(doc as JSONContent);

  // A stored id belongs to the caption that stores it. A caption with none
  // (just inserted, not yet back-filled) must not be handed an id a LATER
  // caption already stores: that pushed the later captions onto each other's
  // ids, and each then showed the number of the caption before it.
  const ensureUnique = (
    base: string,
    kind: CaptionKind,
    ordinal: number,
    stored: boolean,
  ): string => {
    const taken = (candidate: string) =>
      used.has(candidate) || (!stored && reserved.has(candidate));
    const seed = base || `${kind}-${ordinal}`;
    if (!taken(seed)) {
      used.add(seed);
      return seed;
    }
    let suffix = nextSuffix.get(seed) ?? 2;
    let candidate: string;
    do {
      const tail = `-${suffix}`;
      candidate = `${seed.slice(0, MAX_ANCHOR_ID_LENGTH - tail.length)}${tail}`;
      suffix += 1;
    } while (taken(candidate) || reserved.has(candidate));
    nextSuffix.set(seed, suffix);
    used.add(candidate);
    return candidate;
  };

  const visit = (node: JSONContent): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "pageBlock") pageNumber += 1;
    if (
      !hasPageBlocks &&
      (node.type === "pageBreak" || node.type === "sourcePageBreak")
    ) {
      pageNumber += 1;
    }
    if (
      !hasPageBlocks &&
      node.type !== "sourcePageBreak" &&
      node.attrs?.sourcePageBreakBefore === true
    ) {
      pageNumber += 1;
    }
    if (node.type === "heading") {
      observeCaptionHeading(numbering, node.attrs?.level);
    }
    if (node.type === "documentField") observeSeqField(numbering, node.attrs);
    if (node.type === CAPTION_NODE_NAME) {
      const attrs = normalizeCaptionAttributes(node.attrs);
      const kind = attrs.kind;
      const { number, chapterNumber } = nextCaptionNumber(
        numbering,
        attrs,
        headingNumberingEnabled,
      );
      const label = attrs.label;
      const stored = storedCaptionAnchorId(node);
      const base = stored || slugifyHeadingAnchor(`${kind}-${label}`);
      const id = ensureUnique(base, kind, number, Boolean(stored));
      captions.push({
        kind,
        ...(attrs.labelName ? { labelName: attrs.labelName } : {}),
        number,
        label,
        id,
        pageNumber: Math.max(1, pageNumber),
        numberFormat: attrs.numberFormat,
        excludeLabel: attrs.excludeLabel,
        separator: attrs.separator,
        position: attrs.position,
        includeChapterNumber: attrs.includeChapterNumber,
        chapterHeadingLevel: attrs.chapterHeadingLevel,
        chapterSeparator: attrs.chapterSeparator,
        chapterNumber,
      });
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  };

  if (doc && typeof doc === "object") {
    visit(doc as JSONContent);
  }
  return captions;
}

/**
 * collectCaptions over a LIVE ProseMirror document — same entries, same
 * id/numbering scheme, but walks the node tree directly instead of serializing
 * the whole document first. `doc.toJSON()` is O(doc) allocation per call; on
 * per-transaction paths (caption NodeView refresh, anchor-id back-fill
 * appendTransaction, cross-reference live labels) that made typing in a
 * book-sized document pay a full serialization per keystroke. MUST stay
 * result-identical to {@link collectCaptions} — position lookups pair either
 * variant by index. Mirrors `collectHeadingsFromDoc`.
 */
type CaptionReadableDoc = {
  attrs?: Record<string, unknown> | null;
  descendants: (
    fn: (node: {
      type: { name: string };
      attrs?: Record<string, unknown> | null;
    }) => boolean | void,
  ) => void;
};

/** Each caption and reference view asks on every update of the document: one
 * walk per document version, not one per view (a document of 200 captions and 300
 * references walked itself 500 times a keystroke). A document is immutable. */
const captionsByDoc = new WeakMap<object, readonly DocCaption[]>();

export function collectCaptionsFromDoc(doc: CaptionReadableDoc): DocCaption[] {
  const known = captionsByDoc.get(doc);
  if (known) return [...known];
  const captions = readCaptionsFromDoc(doc);
  captionsByDoc.set(doc, captions);
  return [...captions];
}

function readCaptionsFromDoc(doc: CaptionReadableDoc): DocCaption[] {
  const captions: DocCaption[] = [];
  const numbering = createCaptionNumberingState();
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  const headingNumberingEnabled = doc.attrs?.headingNumbering === true;
  let hasPageBlocks = false;
  doc.descendants((node) => {
    if (node.type.name === "pageBlock") hasPageBlocks = true;
    return !hasPageBlocks;
  });
  let pageNumber = hasPageBlocks ? 0 : 1;

  const reserved = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === CAPTION_NODE_NAME) {
      const stored = sanitizeAnchorId(node.attrs?.[CAPTION_ANCHOR_ID_ATTR]);
      if (stored) reserved.add(stored);
    }
    return true;
  });

  // A stored id belongs to the caption that stores it. A caption with none
  // (just inserted, not yet back-filled) must not be handed an id a LATER
  // caption already stores: that pushed the later captions onto each other's
  // ids, and each then showed the number of the caption before it.
  const ensureUnique = (
    base: string,
    kind: CaptionKind,
    ordinal: number,
    stored: boolean,
  ): string => {
    const taken = (candidate: string) =>
      used.has(candidate) || (!stored && reserved.has(candidate));
    const seed = base || `${kind}-${ordinal}`;
    if (!taken(seed)) {
      used.add(seed);
      return seed;
    }
    let suffix = nextSuffix.get(seed) ?? 2;
    let candidate: string;
    do {
      const tail = `-${suffix}`;
      candidate = `${seed.slice(0, MAX_ANCHOR_ID_LENGTH - tail.length)}${tail}`;
      suffix += 1;
    } while (taken(candidate) || reserved.has(candidate));
    nextSuffix.set(seed, suffix);
    used.add(candidate);
    return candidate;
  };

  doc.descendants((node) => {
    if (node.type.name === "pageBlock") pageNumber += 1;
    if (
      !hasPageBlocks &&
      (node.type.name === "pageBreak" || node.type.name === "sourcePageBreak")
    ) {
      pageNumber += 1;
    }
    if (
      !hasPageBlocks &&
      node.type.name !== "sourcePageBreak" &&
      node.attrs?.sourcePageBreakBefore === true
    ) {
      pageNumber += 1;
    }
    if (node.type.name === "heading") {
      observeCaptionHeading(numbering, node.attrs?.level);
      return true;
    }
    if (node.type.name === "documentField") {
      observeSeqField(numbering, node.attrs);
      return false;
    }
    if (node.type.name !== CAPTION_NODE_NAME) return true;
    const attrs = normalizeCaptionAttributes(node.attrs);
    const kind = attrs.kind;
    const { number, chapterNumber } = nextCaptionNumber(
      numbering,
      attrs,
      headingNumberingEnabled,
    );
    const label = attrs.label;
    const stored = sanitizeAnchorId(node.attrs?.[CAPTION_ANCHOR_ID_ATTR]);
    const base = stored || slugifyHeadingAnchor(`${kind}-${label}`);
    const id = ensureUnique(base, kind, number, Boolean(stored));
    captions.push({
      kind,
      ...(attrs.labelName ? { labelName: attrs.labelName } : {}),
      number,
      label,
      id,
      pageNumber: Math.max(1, pageNumber),
      numberFormat: attrs.numberFormat,
      excludeLabel: attrs.excludeLabel,
      separator: attrs.separator,
      position: attrs.position,
      includeChapterNumber: attrs.includeChapterNumber,
      chapterHeadingLevel: attrs.chapterHeadingLevel,
      chapterSeparator: attrs.chapterSeparator,
      chapterNumber,
    });
    return true;
  });
  return captions;
}

/**
 * The displayed prefix for a caption — "Figure N" / "Table N". The label prose
 * is appended by the caller (NodeView / export) so this stays presentation-free
 * for both the live editor and the docx field's cached result.
 */
export function formatCaptionNumber(
  format: CaptionNumberFormat,
  number: number,
): string {
  const mapped =
    format === "Roman"
      ? "upperRoman"
      : format === "roman"
        ? "lowerRoman"
        : format === "Alphabetic"
          ? "upperLetter"
          : format === "alphabetic"
            ? "lowerLetter"
            : "decimal";
  return formatPageNumber(mapped, number);
}

/**
 * The text a caption block shows, as its view draws it: the live "Figure 1"
 * prefix, then the separator and the person's own description ("Figure 1:
 * Sales by region"). In Word a caption is a paragraph, so all of it counts in
 * Word Count; the atom has no text of its own and was skipped (live Word audit
 * WUA 125). `found` is the caption's entry in `collectCaptionsFromDoc`.
 */
export function captionDisplayText(
  nodeAttrs: unknown,
  found: { kind: CaptionKind; number: number; chapterNumber?: string } | undefined,
): string {
  const attrs = normalizeCaptionAttributes(nodeAttrs);
  const prefix = captionPrefix(found?.kind ?? attrs.kind, found?.number ?? 1, {
    labelName: attrs.labelName,
    numberFormat: attrs.numberFormat,
    excludeLabel: attrs.excludeLabel,
    includeChapterNumber: attrs.includeChapterNumber,
    chapterSeparator: attrs.chapterSeparator,
    ...(found ? { chapterNumber: found.chapterNumber ?? "" } : {}),
  });
  return `${prefix}${attrs.label ? attrs.separator : ""}${attrs.label}`;
}

export function captionPrefix(
  kind: CaptionKind,
  number: number,
  options?: Partial<
    Pick<
      CaptionAttributes,
      | "numberFormat"
      | "excludeLabel"
      | "includeChapterNumber"
      | "chapterSeparator"
    >
  > & { chapterNumber?: string; labelName?: string | null },
): string {
  const formatted = formatCaptionNumber(
    normalizeCaptionNumberFormat(options?.numberFormat),
    number,
  );
  const chapterPrefix =
    options?.includeChapterNumber && options.chapterNumber
      ? `${options.chapterNumber}${normalizeCaptionChapterSeparator(
          options.chapterSeparator,
        )}`
      : "";
  const numbered = `${chapterPrefix}${formatted}`;
  return options?.excludeLabel
    ? numbered
    : `${captionLabelText(kind, options?.labelName)} ${numbered}`;
}

/**
 * The full display text for a caption — "Figure N: label" (or just "Figure N"
 * when the label is empty). The ONE formula shared by the cross-reference
 * picker, the live cross-reference marker, and any other surface that shows a
 * caption as a whole line, so the text a user picks always equals the text the
 * reference renders.
 */
export function captionDisplayLabel(caption: DocCaption): string {
  const prefix = captionPrefix(caption.kind, caption.number, caption);
  return caption.label ? `${prefix}${caption.separator}${caption.label}` : prefix;
}

/** Whether a caption belongs to a sequence ({@link captionSequenceKey}). */
export function captionInSequence(
  caption: Pick<DocCaption, "kind" | "labelName">,
  sequence: string,
): boolean {
  return (
    captionSequenceKey(caption.kind, caption.labelName).toLowerCase() ===
    sequence.toLowerCase()
  );
}

/**
 * The custom labels a document's captions use, in first-use order, one per
 * sequence. These are what Word adds to the cross-reference "Reference type"
 * list and the Table of Figures "Caption label" list.
 */
export function captionCustomLabelNames(
  captions: readonly Pick<DocCaption, "kind" | "labelName">[],
): string[] {
  return captionDocumentLabelSequences(captions).map((entry) => entry.name);
}

/** The sequence of one of Word's built-in labels, in the viewer's language. */
export function builtinCaptionLabelSequence(kind: CaptionBuiltinKind): string {
  return captionSequenceKey(kind, builtinCaptionLabelName(kind)).toLowerCase();
}

/**
 * The labels a document's captions use beyond the viewer's three built-in
 * ones, one per sequence, in first-use order: a custom label ("Photo"), and
 * also an English "Figure" in a Chinese session, which is a label of its own
 * there (`SEQ Figure` beside `SEQ 图表`). These are what Word adds to the
 * cross-reference "Reference type" list and the Table of Figures "Caption
 * label" list.
 */
export function captionDocumentLabelSequences(
  captions: readonly Pick<DocCaption, "kind" | "labelName">[],
): Array<{ key: string; name: string }> {
  const builtin = new Set(CAPTION_BUILTIN_KINDS.map(builtinCaptionLabelSequence));
  const out: Array<{ key: string; name: string }> = [];
  const seen = new Set<string>();
  for (const caption of captions) {
    const key = captionSequenceKey(caption.kind, caption.labelName);
    const lower = key.toLowerCase();
    if (builtin.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    out.push({ key, name: captionLabelText(caption.kind, caption.labelName) });
  }
  return out;
}

/** One entry of the caption dialog's Label list. */
export interface CaptionLabelOption {
  /** Stable option value. */
  key: string;
  kind: CaptionKind;
  /** The label text a caption made from this option stores. */
  labelName: string;
  /** Whether Delete Label applies (never to a built-in label). */
  custom: boolean;
}

export function captionLabelOptionKey(
  kind: CaptionKind,
  labelName?: string | null,
): string {
  const name = sanitizeCaptionLabelName(labelName);
  if (kind === "custom") return `custom:${name.toLowerCase()}`;
  return !name || name === builtinCaptionLabelName(kind)
    ? kind
    : `${kind}:${name}`;
}

/**
 * The caption dialog's Label list: Word's built-in labels in the viewer's
 * language, then any other text the document's built-in captions were written
 * with (an English "Figure" in a Chinese session), then the custom labels —
 * the viewer's own New Label names and the ones the document uses, minus the
 * ones the viewer deleted.
 */
export function captionLabelOptions(
  captions: readonly Pick<DocCaption, "kind" | "labelName">[],
  savedCustomLabels: readonly string[] = [],
  deletedCustomLabels: readonly string[] = [],
): CaptionLabelOption[] {
  const options: CaptionLabelOption[] = [];
  // One entry per label: an imported `SEQ 表格` and the built-in 表格 are
  // the same label, so the list holds it once.
  const seen = new Set<string>();
  const push = (kind: CaptionKind, labelName: string, custom: boolean) => {
    const sequence = captionSequenceKey(kind, labelName).toLowerCase();
    if (seen.has(sequence)) return;
    seen.add(sequence);
    options.push({ key: captionLabelOptionKey(kind, labelName), kind, labelName, custom });
  };
  for (const kind of CAPTION_BUILTIN_KINDS) {
    push(kind, builtinCaptionLabelName(kind), false);
  }
  for (const caption of captions) {
    const name = sanitizeCaptionLabelName(caption.labelName);
    if (caption.kind !== "custom" && name) push(caption.kind, name, false);
  }
  const deleted = new Set(
    deletedCustomLabels.map((name) =>
      sanitizeCaptionLabelName(name).toLowerCase(),
    ),
  );
  for (const raw of [...savedCustomLabels, ...captionCustomLabelNames(captions)]) {
    const name = sanitizeCaptionLabelName(raw);
    if (name && !deleted.has(name.toLowerCase())) push("custom", name, true);
  }
  return options;
}

export type CaptionLabelNameProblem = "empty" | "tooLong" | "exists";

/**
 * Word's New Label check: a name is required, holds at most 40 characters,
 * and must not repeat a label already in the list (compared without case).
 */
export function captionLabelNameProblem(
  value: string,
  existing: readonly CaptionLabelOption[],
): CaptionLabelNameProblem | null {
  const collapsed = sanitizeHeadingText(value);
  if (!collapsed) return "empty";
  if (collapsed.length > MAX_CAPTION_LABEL_NAME_LENGTH) return "tooLong";
  const lower = collapsed.toLowerCase();
  return existing.some((option) => option.labelName.toLowerCase() === lower)
    ? "exists"
    : null;
}

/**
 * Word's Table of Figures "Caption label": one caption label (the `\c`
 * sequence) or "(none)", which builds the list from every caption.
 */
export type CaptionListLabel = CaptionBuiltinKind | `label:${string}` | "none";

export function normalizeCaptionListLabel(value: unknown): CaptionListLabel {
  if (value === "none") return "none";
  const custom = captionSequenceLabelName(value);
  return custom ? `label:${custom}` : normalizeCaptionBuiltinKind(value);
}

/** The label text a Table of Figures' caption label shows ("" for none). */
export function captionListLabelText(label: CaptionListLabel): string {
  if (label === "none") return "";
  const custom = captionSequenceLabelName(label);
  if (custom) return custom;
  const kind = normalizeCaptionBuiltinKind(label);
  // A built-in key is Word's English label (`SEQ Figure`); in a session whose
  // own name for it is that same label, show the viewer's name.
  return builtinCaptionLabelSequence(kind) === kind
    ? builtinCaptionLabelName(kind)
    : captionSeqName(kind);
}

/**
 * A built-in label's Table of Figures caption label for the viewer: the
 * sequence of its name in the viewer's language (`label:图表` in a Chinese
 * session, `figure` in an English one).
 */
export function builtinCaptionListLabel(kind: CaptionBuiltinKind): CaptionListLabel {
  return captionSequenceKey(kind, builtinCaptionLabelName(kind));
}

/**
 * The built-in label a Table of Figures' caption label is, in Word's English
 * name (`table`) or the viewer's (`label:表格` in a Chinese session), or null
 * for "(none)" and a custom label.
 */
export function captionListBuiltinKind(
  label: CaptionListLabel,
): CaptionBuiltinKind | null {
  if (label === "none") return null;
  if (isCaptionBuiltinKind(label)) return label;
  const sequence = label.toLowerCase();
  return (
    CAPTION_BUILTIN_KINDS.find(
      (kind) => builtinCaptionLabelSequence(kind) === sequence,
    ) ?? null
  );
}

/** The SEQ identifier a Table of Figures' `\c` / `\a` switch names. */
export function captionListSeqIdentifier(
  label: Exclude<CaptionListLabel, "none">,
): string {
  const custom = captionSequenceLabelName(label);
  return custom
    ? captionSeqIdentifier("custom", custom)
    : captionSeqName(normalizeCaptionBuiltinKind(label));
}

/** The captions a Table of Figures with this caption label lists. */
export function captionsForListLabel(
  captions: readonly DocCaption[],
  label: CaptionListLabel,
): DocCaption[] {
  return label === "none"
    ? [...captions]
    : captions.filter((caption) => captionInSequence(caption, label));
}

/**
 * Convert live caption authority into the bounded generated field result.
 * Word's "Include label and number" off (`\a`) lists only the caption text.
 */
export function generatedCaptionListEntries(
  captions: readonly DocCaption[],
  options: { includeLabel?: boolean } = {},
): GeneratedCaptionListEntry[] {
  const includeLabel = options.includeLabel !== false;
  return (
    normalizeGeneratedCaptionListEntries(
      captions.slice(0, MAX_TOC_SNAPSHOT_ENTRIES).map((caption) => ({
        id: caption.id,
        text: includeLabel
          ? captionDisplayLabel(caption)
          : caption.label,
        pageNumber: caption.pageNumber ?? 1,
      })),
    ) ?? []
  );
}

/**
 * Apply Word's two update modes. A page-only refresh preserves cached text and
 * membership, while a full refresh adopts the current kind-filtered captions.
 */
export function updateGeneratedCaptionListEntries(
  currentValue: unknown,
  liveValue: unknown,
  mode: TocUpdateMode,
): GeneratedCaptionListEntry[] {
  const live = normalizeGeneratedCaptionListEntries(liveValue) ?? [];
  const current = normalizeGeneratedCaptionListEntries(currentValue);
  if (mode === "entireTable" || current === null) return live;
  const pagesById = new Map(
    live.map((entry) => [entry.id, entry.pageNumber] as const),
  );
  return current.map((entry) => ({
    ...entry,
    pageNumber: pagesById.get(entry.id) ?? entry.pageNumber,
  }));
}

/**
 * The captions of ONE kind, in document order, for a List of Figures / List of
 * Tables. A thin filter over {@link collectCaptions} — so figure and table lists
 * stay on their own independent per-kind counter (the `number` field), the entry
 * ids match the bookmarks the export emits, and a kind with no captions yields an
 * empty list (a valid empty field, never a crash). PURE.
 */
export function collectCaptionsOfKind(
  doc: unknown,
  kind: CaptionKind,
): DocCaption[] {
  return collectCaptions(doc).filter((c) => c.kind === kind);
}
