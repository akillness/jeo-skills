/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the document Table of Contents (Word/WPS parity).
 *
 * Kept free of any TipTap/React imports so the heading-collection, anchor-id
 * slugification, and sanitization logic can be unit-tested in isolation and
 * reused by both the `tableOfContents` NodeView and any future server-side
 * rendering / export path.
 *
 * Design notes:
 *  - An authored TOC keeps a bounded cached-result snapshot. This mirrors
 *    Word's field result: "Update page numbers only" preserves its existing
 *    entry text/order, while "Update entire table" rebuilds from headings.
 *    Legacy nodes without a snapshot retain the former live-derived fallback
 *    until the user explicitly updates or edits their TOC settings.
 *  - Headings carry a stable `anchor_id` attribute (additive; see
 *    pluginRegistry's global heading attribute) so the TOC link target survives
 *    edits to the heading text. When a heading has no stored anchor id we
 *    derive a deterministic slug from its text — sanitized so neither a
 *    malicious paste nor an AI instruction can inject markup, an `id`-breaking
 *    payload, or a fragment-navigation exploit through the anchor.
 */

import type { JSONContent } from "@tiptap/core";
import { SPLIT_CONTINUATION_ATTR, SPLIT_CONTINUES_ATTR } from "./paged/blockSplitting";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { textblockDisplayText } from "./inlineAtomText";
import { BOOKMARK_POINT_NODE_NAME } from "./bookmarks";
import { computeHeadingNumbers } from "./headingNumbering";
import {
  MANUAL_TOC_GALLERY,
  createHeadingListNumberer,
  headingListNumbers,
  isManualTocTitle,
  manualTocTitleListNumbering,
} from "./headingListNumbers";
import { fragmentCarries } from "./paged/fragmentRoles";




const HIDDEN_TEXT_MARK_NAME = "hiddenText";

/** A heading's text as shown (a field shows its result, hidden text is left
 * out, a manual line break is a space, as in Word's entry) when the walker is
 * given an editor document; a structural stand-in only has textContent. */
function headingDisplayText(node: { textContent: string }): string {
  return typeof (node as Partial<ProseMirrorNode>).descendants === "function"
    ? textblockDisplayText(node as ProseMirrorNode, { skipMark: HIDDEN_TEXT_MARK_NAME, lineBreak: " " })
    : node.textContent;
}

/** Heading levels surfaced in the Table of Contents (Word's default depth). */
export const TOC_HEADING_LEVELS = [1, 2, 3] as const;

export type TocHeadingLevel = (typeof TOC_HEADING_LEVELS)[number];

/**
 * Direct Word paragraph outline levels (`w:pPr/w:outlineLvl`). Word stores
 * levels 1..9 as zero-based values 0..8; value 9 is the explicit Body Text /
 * "Not in Table of Contents" override. This is deliberately separate from a
 * heading node's structural `level`: References → Add Text must not rewrite the
 * paragraph style merely to make ordinary body text participate in a TOC.
 */
export const TOC_OUTLINE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type TocOutlineLevel = (typeof TOC_OUTLINE_LEVELS)[number];
export type TocOutlineLevelValue = TocOutlineLevel | "none";
export const TOC_OUTLINE_LEVEL_ATTR = "tocOutlineLevel";

/**
 * Heading levels surfaced in the navigation/outline pane. Unlike the TOC (which
 * defaults to depth 3), Word's Navigation Pane lists EVERY heading level, so the
 * outline collects the full h1–h6 range. The exported {@link normalizeOutlineHeadingLevel}
 * is passed to {@link collectHeadings}/`findHeadingPos` by the outline panel; all
 * other callers omit it and keep the 1–3 TOC depth.
 */
export const OUTLINE_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Attribute name carrying the stable per-heading anchor id. */
export const HEADING_ANCHOR_ID_ATTR = "anchor_id";

/**
 * Attribute carrying the opaque Word-generated bookmark used by cached TOC
 * hyperlinks (for example ``_Toc123456``).  It is deliberately separate from
 * {@link HEADING_ANCHOR_ID_ATTR}: the latter is MRNote's editable text slug,
 * while this value is a legacy import alias whose exact spelling must survive.
 */
export const HEADING_TOC_ANCHOR_ID_ATTR = "toc_anchor_id";

/** Hard upper bound for a generated anchor id slug, matching DOM-id practice. */
export const MAX_ANCHOR_ID_LENGTH = 100;

/** Hard upper bound for the displayed TOC entry label. */
export const MAX_TOC_LABEL_LENGTH = 300;

/** Bounded cached field result carried by one authored TOC atom. */
export const MAX_TOC_SNAPSHOT_ENTRIES = 2_000;

/** Highest 1-based structural page accepted in a persisted cached result. */
export const MAX_TOC_PAGE_NUMBER = 1_000_000;

const TOC_HEADING_LEVEL_SET = new Set<number>(TOC_HEADING_LEVELS);
const TOC_OUTLINE_LEVEL_SET = new Set<number>(TOC_OUTLINE_LEVELS);

// C0 control characters (U+0000-U+001F), DEL (U+007F), and the C1 control range
// (U+0080-U+009F). Stripped from both anchor ids and labels so a payload cannot
// break out of an HTML attribute, smuggle markup, or inject a navigation
// exploit. Declared via \x escapes (never literal control bytes) so the source
// stays reviewable.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

// Line breaks and every other control character but the tab: a table of
// contents entry keeps its heading's tabs (sanitizeTocEntryText).
const TOC_ENTRY_BREAKS_RE = /[\x00-\x08\x0a-\x1f\x7f-\x9f\u2028\u2029]/g;

// Any run of characters that is NOT a safe slug character. We keep ASCII
// letters/digits and the unicode letter/number ranges (so non-Latin headings
// still produce a meaningful anchor) and collapse everything else to a single
// hyphen. `u` flag enables the unicode property escapes.
const NON_SLUG_CHARS_RE = /[^\p{L}\p{N}]+/gu;

export interface TocHeading {
  /**
   * The heading level. With the default TOC normalizer this is a
   * {@link TocHeadingLevel} (1–3); the outline pane passes
   * {@link normalizeOutlineHeadingLevel} and may see 1–6, so the type is the
   * wider `number`. Used only for display/indentation, never for narrowing.
   */
  level: number;
  text: string;
  /** Stable anchor id this entry links to (already sanitized). */
  id: string;
  /** Current 1-based editor page when the paged projection can resolve it. */
  pageNumber?: number;
  /**
   * The page number as Word last printed it in the row ("iv", "A-3"), kept
   * from an imported table until the table is updated: the row shows it as
   * written. Absent on rows this editor laid out (they print `pageNumber`
   * in the heading's section's format).
   */
  pageText?: string;
  /**
   * The heading's number ("2.1") when the document numbers its headings:
   * Word's row is the number, a tab, then the words.
   */
  number?: string;
  /**
   * The words in runs, when part of them wears character emphasis the rest
   * does not (an italic species name): Word's row keeps it. Emphasis on the
   * whole heading is the heading's own look, which a row does not take.
   * Absent when the row is plain; the runs' words always spell `text`.
   */
  runs?: TocRun[];
  /**
   * `"text"`: a line typed between an imported table's rows that is no
   * entry (Word shows and prints it until the table is updated): its words
   * alone, no link and no page, at its own left indent (points).
   */
  kind?: "text";
  indentLeftPt?: number;
  styleId?: string;
  /**
   * An imported row Word's result prints with no page (the page typed into
   * its words): no tab, no leader and no page until the table is updated.
   */
  noPage?: true;
}

/** A stretch of a row's words and the emphasis it keeps. */
export interface TocRun {
  text: string;
  italic?: true;
  bold?: true;
  underline?: true;
}

const TOC_RUN_FLAGS = ["italic", "bold", "underline"] as const;
type TocRunFlag = (typeof TOC_RUN_FLAGS)[number];
const MAX_TOC_RUNS = 100;

interface TocSegment {
  text: string;
  italic: boolean;
  bold: boolean;
  underline: boolean;
}

/**
 * A heading's runs as a row keeps them (TocHeading.runs), or undefined when
 * the row is plain: only emphasis that covers part of the visible words
 * stays, and the words are spaced as `text` is (line breaks and control
 * characters made spaces, ends trimmed). Undefined unless they spell `text`.
 */
function finishTocRuns(segments: readonly TocSegment[], text: string): TocRun[] | undefined {
  const visible = segments.filter((segment) => segment.text.trim() !== "");
  if (visible.length < 2) return undefined;
  const kept = TOC_RUN_FLAGS.filter(
    (flag) => visible.some((segment) => segment[flag]) && !visible.every((segment) => segment[flag]),
  );
  if (kept.length === 0) return undefined;
  const runs: TocRun[] = [];
  let joined = "";
  for (const segment of segments) {
    let words = segment.text.replace(TOC_ENTRY_BREAKS_RE, " ");
    if (joined === "") words = words.replace(/^\s+/, "");
    if (!words) continue;
    const run: TocRun = { text: words };
    for (const flag of kept) if (segment[flag]) run[flag] = true;
    const last = runs[runs.length - 1];
    if (last && kept.every((flag) => last[flag] === run[flag])) last.text += words;
    else runs.push(run);
    joined += words;
  }
  while (runs.length > 0) {
    const lastRun = runs[runs.length - 1];
    lastRun.text = lastRun.text.replace(/\s+$/, "");
    if (lastRun.text) break;
    runs.pop();
  }
  if (runs.length > MAX_TOC_RUNS) return undefined;
  if (runs.map((run) => run.text).join("") !== text) return undefined;
  return runs.some((run) => kept.some((flag) => run[flag])) ? runs : undefined;
}

function markNamed(marks: readonly { type?: unknown }[] | undefined, name: string): boolean {
  return Array.isArray(marks) && marks.some((mark) => mark?.type === name);
}

/** The segments of a heading in an editor document (fields show their
 * result, hidden text is left out). */
function liveHeadingSegments(node: ProseMirrorNode): TocSegment[] {
  const segments: TocSegment[] = [];
  node.descendants((child) => {
    if (child.type.name === "hardBreak") {
      segments.push({ text: " ", italic: false, bold: false, underline: false });
      return false;
    }
    if (child.isText) {
      const names = child.marks.map((mark) => mark.type.name);
      if (names.includes(HIDDEN_TEXT_MARK_NAME)) return false;
      segments.push({
        text: child.text ?? "",
        italic: names.includes("italic"),
        bold: names.includes("bold"),
        underline: names.includes("underline"),
      });
      return false;
    }
    if (child.isLeaf) {
      const shown = textblockDisplayText(child);
      if (shown) segments.push({ text: shown, italic: false, bold: false, underline: false });
      return false;
    }
    return true;
  });
  return segments;
}

/** The segments of a heading in document JSON. */
function jsonHeadingSegments(node: JSONContent): TocSegment[] {
  const segments: TocSegment[] = [];
  const visit = (item: JSONContent): void => {
    if (!item || typeof item !== "object") return;
    if (item.type === "hardBreak") {
      segments.push({ text: " ", italic: false, bold: false, underline: false });
      return;
    }
    if (typeof item.text === "string") {
      const marks = item.marks as { type?: unknown }[] | undefined;
      if (markNamed(marks, HIDDEN_TEXT_MARK_NAME)) return;
      segments.push({
        text: item.text,
        italic: markNamed(marks, "italic"),
        bold: markNamed(marks, "bold"),
        underline: markNamed(marks, "underline"),
      });
      return;
    }
    if (Array.isArray(item.content)) for (const child of item.content) visit(child);
  };
  visit(node);
  return segments;
}

function normalizeTocRuns(value: unknown, text: string): TocRun[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_TOC_RUNS) return undefined;
  const runs: TocRun[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return undefined;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.text !== "string" || candidate.text === "") return undefined;
    const run: TocRun = { text: candidate.text };
    for (const flag of TOC_RUN_FLAGS) {
      if (candidate[flag] === true) run[flag as TocRunFlag] = true;
    }
    runs.push(run);
  }
  return runs.map((run) => run.text).join("") === text ? runs : undefined;
}

export type TocUpdateMode = "pageNumbers" | "entireTable";

/**
 * `seed`, or the first `seed-2`, `seed-3`, ... that `used` does not hold
 * (clamped to the anchor length); the id returned is added to `used`.
 */
export function uniqueAnchorId(seed: string, used: Set<string>): string {
  return uniqueSnapshotId(seed, 0, used);
}

function uniqueSnapshotId(
  seedInput: string,
  index: number,
  used: Set<string>,
): string {
  const seed = seedInput || `heading-${index + 1}`;
  if (!used.has(seed)) {
    used.add(seed);
    return seed;
  }
  let suffix = 2;
  let candidate = seed;
  do {
    const tail = `-${suffix}`;
    candidate = `${seed.slice(0, MAX_ANCHOR_ID_LENGTH - tail.length)}${tail}`;
    suffix += 1;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

/**
 * Normalize a persisted TOC field-result snapshot. `null` means a legacy node
 * has no authored cache; an empty array is a real, explicitly updated result.
 */
export function normalizeTocEntrySnapshot(value: unknown): TocHeading[] | null {
  if (!Array.isArray(value)) return null;
  const entries: TocHeading[] = [];
  const used = new Set<string>();
  for (const raw of value.slice(0, MAX_TOC_SNAPSHOT_ENTRIES)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const level =
      typeof candidate.level === "number" &&
      Number.isInteger(candidate.level) &&
      candidate.level >= 1 &&
      candidate.level <= 6
        ? candidate.level
        : null;
    if (level === null) continue;
    const text = sanitizeTocEntryText(candidate.text);
    const sanitizedId = sanitizeAnchorId(candidate.id);
    const id = uniqueSnapshotId(
      sanitizedId || slugifyHeadingAnchor(text),
      entries.length,
      used,
    );
    const rawPageNumber = candidate.pageNumber;
    const pageNumber =
      typeof rawPageNumber === "number" &&
      Number.isInteger(rawPageNumber) &&
      rawPageNumber >= 1 &&
      rawPageNumber <= MAX_TOC_PAGE_NUMBER
        ? rawPageNumber
        : 1;
    const entry: TocHeading = { level, text, id, pageNumber };
    const pageText = sanitizeTocPageText(candidate.pageText);
    if (pageText) entry.pageText = pageText;
    const number = sanitizeTocPageText(candidate.number);
    if (number) entry.number = number;
    const runs = normalizeTocRuns(candidate.runs, text);
    if (runs) entry.runs = runs;
    if (candidate.noPage === true) entry.noPage = true;
    if (candidate.kind === "text") {
      entry.kind = "text";
      const indent = candidate.indentLeftPt;
      if (typeof indent === "number" && Number.isFinite(indent) && indent >= 0 && indent <= 1584) {
        entry.indentLeftPt = indent;
      }
      if (typeof candidate.styleId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(candidate.styleId)) {
        entry.styleId = candidate.styleId;
      }
    }
    entries.push(entry);
  }
  return entries;
}

/** A cached page label: short, printable, as Word wrote it. */
function sanitizeTocPageText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS_RE, "").trim();
  return cleaned.length <= 32 ? cleaned : "";
}

/** A reusable configured-level normalizer for TOC collectors. */
export function tocHeadingLevelNormalizer(
  maximumLevel: number,
): (value: unknown) => number | null {
  return (value: unknown): number | null => {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : NaN;
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= maximumLevel
      ? numeric
      : null;
  };
}

/**
 * Apply Word's two update modes to a cached TOC result. Page-only refresh never
 * adds/removes/relabels entries; a full refresh adopts the current heading set.
 */
export function updateTocEntrySnapshot(
  currentValue: unknown,
  liveValue: unknown,
  mode: TocUpdateMode,
): TocHeading[] {
  const live = normalizeTocEntrySnapshot(liveValue) ?? [];
  const current = normalizeTocEntrySnapshot(currentValue);
  if (mode === "entireTable" || current === null) return live;
  const pagesById = new Map(
    live.map((entry) => [entry.id, entry.pageNumber ?? 1] as const),
  );
  return current.map((entry) => {
    // The refreshed page prints in its section's format again, not as the
    // label Word last wrote.
    const refreshed: TocHeading = { ...entry, pageNumber: pagesById.get(entry.id) ?? entry.pageNumber ?? 1 };
    delete refreshed.pageText;
    return refreshed;
  });
}










export function unlaidTocPageNumbers(
  cachedValue: unknown,
  liveValue: unknown,
): TocHeading[] | null {
  const cached = normalizeTocEntrySnapshot(cachedValue);
  if (!cached || cached.length < 2) return null;
  if (cached.some((entry) => (entry.pageNumber ?? 1) !== 1)) return null;
  const live = normalizeTocEntrySnapshot(liveValue) ?? [];
  if (!live.some((entry) => (entry.pageNumber ?? 1) > 1)) return null;
  const refreshed = updateTocEntrySnapshot(cached, live, "pageNumbers");
  return refreshed.some((entry) => (entry.pageNumber ?? 1) > 1) ? refreshed : null;
}

export type HeadingTraversalPolicy = (nodeTypeName: string) => boolean;

/**
 * Word's document outline is scoped to body headings: a heading nested inside
 * a table is table content, not a navigation-pane entry. Keep this policy
 * separate from the in-body TOC/cross-reference defaults, whose existing
 * document-wide behavior remains unchanged.
 */
export function shouldDescendDocumentOutlineNode(
  nodeTypeName: string,
): boolean {
  return nodeTypeName !== "table";
}

/**
 * Sanitize and slugify arbitrary heading text into a DOM-safe anchor id.
 *
 * The result is lowercase, contains only unicode letters/digits and hyphens,
 * never starts/ends with a hyphen, has no doubled hyphens, and is clamped in
 * length. Control characters and markup-significant punctuation are removed (not
 * merely escaped) so the value is safe to use as an `id` attribute and as a URL
 * fragment. Returns `""` when nothing slug-worthy remains; callers fall back to
 * a positional id in that case.
 */
export function slugifyHeadingAnchor(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(CONTROL_CHARS_RE, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_SLUG_CHARS_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANCHOR_ID_LENGTH)
    // Trim a trailing hyphen that the slice may have exposed.
    .replace(/-+$/g, "");
  return cleaned;
}

/**
 * Sanitize the human-readable heading text used as the TOC entry label.
 *
 * Drops control characters, collapses whitespace, trims, and clamps. Literal
 * angle brackets / quotes are preserved (React/TipTap escape them when
 * rendering); only control bytes that could break the DOM are removed.
 */
export function sanitizeHeadingText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOC_LABEL_LENGTH);
}









export function sanitizeTocEntryText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(TOC_ENTRY_BREAKS_RE, " ")
    .trim()
    .slice(0, MAX_TOC_LABEL_LENGTH);
}

/** A field result (a cross-reference's text) is as long as its source. */
export const MAX_FIELD_RESULT_LENGTH = 32767;






export function sanitizeFieldResultText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FIELD_RESULT_LENGTH);
}

/**
 * Coerce an arbitrary value into a whitelisted TOC heading level (1-3) or
 * `null` when it is not one of them.
 */
export function normalizeTocHeadingLevel(
  value: unknown,
): TocHeadingLevel | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return TOC_HEADING_LEVEL_SET.has(numeric)
    ? (numeric as TocHeadingLevel)
    : null;
}

/** Normalize the direct paragraph outline-level authority. */
export function normalizeTocOutlineLevel(
  value: unknown,
): TocOutlineLevelValue | null {
  if (value === "none") return "none";
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number.parseInt(value, 10)
        : NaN;
  return TOC_OUTLINE_LEVEL_SET.has(numeric)
    ? (numeric as TocOutlineLevel)
    : null;
}

/**
 * Resolve whether a paragraph/heading contributes to a generated TOC/outline.
 * A direct outline level wins, including the explicit `none` exclusion; only
 * when it is absent does a structural heading fall back to its node level.
 */
/**
 * A level normalizer: the raw level of a source and whether it is a direct
 * paragraph outline level or a heading STYLE's level (Heading N), so a TOC
 * that maps heading styles to other levels (`\t "Heading 2,1"`) can tell
 * the two apart. Normalizers that do not care ignore the second argument.
 */
export type TocLevelNormalizer = (
  value: unknown,
  // "style": the paragraph's own style NAME, for a TOC's `\t` list.
  source?: "heading" | "outline" | "style",
) => number | null;

export function resolveTocSourceLevel(
  nodeTypeName: string,
  attrs: Record<string, unknown> | null | undefined,
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
  // The outline level a paragraph's Word style carries (tocStyleLevelsOf).
  styleLevelOf: TocStyleLevelOf = NO_STYLE_LEVELS,
): number | null {
  const direct = normalizeTocOutlineLevel(attrs?.[TOC_OUTLINE_LEVEL_ATTR]);
  if (direct === "none") return null;
  if (direct !== null) {
    // A TOC without `\u` skips a direct outline level; the paragraph's
    // style may still list it (Word for Mac 16).
    const outlined = normalizeLevel(direct, "outline");
    if (outlined !== null) return outlined;
  }
  if (nodeTypeName === "heading") return normalizeLevel(attrs?.level, "heading");
  if (nodeTypeName !== "paragraph") return null;
  // A paragraph in a Heading N style (a heading in a table cell, which the
  // page holds as a paragraph) or in a style of its own that states an
  // outline level: Word's \o lists it at that level.
  const styleLevel = styleLevelOf(attrs?.docxStyleId);
  if (styleLevel !== null) return normalizeLevel(styleLevel, "heading");
  // A style a TOC's `\t` names ("MyTitle,1"), matched by name as Word does.
  const source = attrs?.source as { styleName?: unknown } | null | undefined;
  const styleName = typeof source?.styleName === "string" ? source.styleName : attrs?.docxStyleId;
  return typeof styleName === "string" && styleName.trim() ? normalizeLevel(styleName, "style") : null;
}

/** The outline level (1..9) a document's Word paragraph style carries, by
 * style id; null for a style without one (Body Text level). */
export type TocStyleLevelOf = (styleId: unknown) => number | null;

const NO_STYLE_LEVELS: TocStyleLevelOf = () => null;

const styleLevelsByDefinitions = new WeakMap<object, TocStyleLevelOf>();

interface StyleOutlineEntry {
  readonly basedOn: string | null;
  readonly outline: number | null;
}

/**
 * The style outline levels of an imported document
 * (`doc.attrs.styleDefinitions.styles`, the package's styles.xml): each
 * paragraph style's `w:outlineLvl`, inherited along `w:basedOn`. A style
 * named "heading N" answers to Word's built-in id ("HeadingN") as well as
 * its own (a Chinese Word writes "1", "21"), the way Word resolves a
 * `basedOn` that names the built-in style. Level 9 (Body Text) lists
 * nothing. A document of this editor's own has no definitions: none.
 */
export function tocStyleLevelsOf(
  docAttrs: Record<string, unknown> | null | undefined,
): TocStyleLevelOf {
  const definitions = docAttrs?.styleDefinitions as { styles?: unknown } | null | undefined;
  const styles = definitions && typeof definitions === "object" ? definitions.styles : null;
  if (!Array.isArray(styles) || styles.length === 0) return NO_STYLE_LEVELS;
  const known = styleLevelsByDefinitions.get(styles);
  if (known) return known;
  const byId = new Map<string, StyleOutlineEntry>();
  // A paragraph naming no style is in the default paragraph style (the page
  // gives it no docxStyleId), and Word's \o lists it at that style's outline
  // level too (DQ-I 383 reads a Normal that states w:outlineLvl as the
  // paragraphs' tocOutlineLevel, which only a \u TOC took).
  let defaultId: string | null = null;
  for (const raw of styles.slice(0, 5_000)) {
    if (!raw || typeof raw !== "object") continue;
    const style = raw as Record<string, unknown>;
    if (style.type !== "paragraph" || typeof style.styleId !== "string") continue;
    if (style.default === true && defaultId === null) defaultId = style.styleId;
    const pPr = style.pPr && typeof style.pPr === "object" ? (style.pPr as Record<string, unknown>) : null;
    const rawOutline = pPr?.outlineLvl;
    const outline =
      typeof rawOutline === "number" && Number.isInteger(rawOutline) && rawOutline >= 0 && rawOutline <= 9
        ? rawOutline
        : null;
    const entry: StyleOutlineEntry = {
      basedOn: typeof style.basedOn === "string" ? style.basedOn : null,
      outline,
    };
    byId.set(style.styleId, entry);
    const builtIn = typeof style.name === "string" ? /^heading\s*([1-9])$/i.exec(style.name.trim()) : null;
    if (builtIn && !byId.has(`Heading${builtIn[1]}`)) byId.set(`Heading${builtIn[1]}`, entry);
  }
  const levels = new Map<string, number | null>();
  const resolve = (id: string, depth: number): number | null => {
    const entry = byId.get(id);
    if (!entry || depth > 32) return null;
    if (entry.outline !== null) return entry.outline;
    return entry.basedOn ? resolve(entry.basedOn, depth + 1) : null;
  };
  const levelOf: TocStyleLevelOf = (named) => {
    const styleId = typeof named === "string" && named ? named : defaultId;
    if (!styleId) return null;
    let level = levels.get(styleId);
    if (level === undefined) {
      const outline = resolve(styleId, 0);
      level = outline === null || outline >= 9 ? null : outline + 1;
      levels.set(styleId, level);
    }
    return level;
  };
  styleLevelsByDefinitions.set(styles, levelOf);
  return levelOf;
}

const OUTLINE_HEADING_LEVEL_SET = new Set<number>(OUTLINE_HEADING_LEVELS);

/**
 * Like {@link normalizeTocHeadingLevel} but accepts the full h1–h6 range for the
 * navigation/outline pane. Same coercion (number or numeric string), returns the
 * level or `null` when out of range. Pass this to {@link collectHeadings} and
 * `findHeadingPos` to surface every heading level, not just the TOC's 1–3.
 */
export function normalizeOutlineHeadingLevel(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return OUTLINE_HEADING_LEVEL_SET.has(numeric) ? numeric : null;
}

/**
 * Sanitize a stored heading anchor id so a forged/imported value cannot smuggle
 * markup or an unsafe id. Re-runs the slugifier, which is idempotent for an
 * already-clean slug. Returns `""` if nothing safe remains.
 */
export function sanitizeAnchorId(value: unknown): string {
  return slugifyHeadingAnchor(value);
}

/** Closed, injection-safe shape of a generated, hidden heading bookmark:
 * Word's ``_Toc…`` (a table of contents entry) and ``_Ref…`` (a
 * cross-reference or a hyperlink to the heading), LibreOffice's
 * ``__RefHeading___Toc…`` (corpus R103-D21: its rows lost their links). */
const WORD_TOC_ANCHOR_RE = /^_{1,3}[0-9A-Za-z][0-9A-Za-z_]{0,96}$/i;

/**
 * Validate an imported Word TOC bookmark without slugifying away its leading
 * underscore. Returns the exact trimmed spelling because the cached hyperlink
 * fragment is an opaque, case-sensitive package value.
 */
export function sanitizeTocAnchorId(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS_RE, "").trim();
  if (cleaned.length > 100) return "";
  return WORD_TOC_ANCHOR_RE.test(cleaned) ? cleaned : "";
}

/** Concatenate the plain text of a TipTap node's inline content (hidden
 * text left out, as a table of contents leaves it out). */
function nodeText(node: JSONContent): string {
  // Word's entry spells a manual line break as a space.
  if (node.type === "hardBreak") return " ";
  if (typeof node.text === "string") {
    return node.marks?.some((mark) => mark?.type === HIDDEN_TEXT_MARK_NAME) ? "" : node.text;
  }
  if (!Array.isArray(node.content)) return "";
  return node.content.map(nodeText).join("");
}

/**
 * Walk a document JSON tree and collect every level-1..3 heading in document
 * order. Each entry carries a sanitized label and a stable, unique anchor id.
 *
 * Anchor id resolution, in order of preference:
 *   1. the heading's stored `anchor_id` attribute (sanitized);
 *   2. a slug derived from the heading text (sanitized);
 *   3. a positional fallback (`heading-N`) when neither yields anything.
 * Collisions are de-duplicated with a numeric suffix (`-2`, `-3`, …) so every
 * TOC link points at exactly one heading.
 */
export function collectHeadings(
  doc: unknown,
  // Which heading levels to surface + how to coerce the raw attr. Defaults to
  // the TOC's 1–3 depth; the outline pane passes `normalizeOutlineHeadingLevel`
  // for the full h1–h6 range. `findHeadingPos` MUST be called with the SAME
  // normalizer so its by-index position lookup stays aligned with these ids.
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
): TocHeading[] {
  return walkJsonHeadings(doc, normalizeLevel, null);
}

/**
 * The rows a table of contents lists: {@link collectHeadings} without the
 * headings that hold nothing. Word leaves a heading paragraph out of its
 * table when it is empty or holds only white space (spaces, a tab, a line
 * break, a no-break space), and lists one that holds only a picture
 * (measured in Word 16.86). The ids are those of the whole enumeration, so a
 * row still links to the heading every other reader knows under that id.
 */
export function collectTocEntries(
  doc: unknown,
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
): TocHeading[] {
  const emptyAt = new Set<number>();
  return walkJsonHeadings(doc, normalizeLevel, emptyAt).filter(
    (_, index) => !emptyAt.has(index),
  );
}

/** Inline nodes that put nothing on the line. */
const UNSEEN_INLINE_NODE_NAMES: ReadonlySet<string> = new Set([
  "hardBreak",
  "sourcePageBreak",
  BOOKMARK_POINT_NODE_NAME,
  "rangePermission",
]);

/** Whether a heading's JSON holds an inline object (a picture, an equation). */
function jsonHoldsInlineObject(node: JSONContent): boolean {
  if (!Array.isArray(node.content)) return false;
  return node.content.some(
    (child) =>
      !!child &&
      typeof child === "object" &&
      child.type !== "text" &&
      ((typeof child.type === "string" && !UNSEEN_INLINE_NODE_NAMES.has(child.type)) ||
        jsonHoldsInlineObject(child)),
  );
}

function walkJsonHeadings(
  doc: unknown,
  normalizeLevel: TocLevelNormalizer,
  // Filled with the index of every heading that holds nothing to list.
  emptyAt: Set<number> | null,
): TocHeading[] {
  const headings: TocHeading[] = [];
  // Each heading's stored and derived id, resolved once every heading is
  // known (see `resolveHeadingAnchorIds`).
  const seeds: HeadingAnchorSeed[] = [];
  let hasPageBlocks = false;
  const detectPageBlocks = (node: JSONContent): void => {
    if (node.type === "pageBlock") hasPageBlocks = true;
    if (!hasPageBlocks && Array.isArray(node.content)) {
      for (const child of node.content) detectPageBlocks(child);
    }
  };
  if (doc && typeof doc === "object") detectPageBlocks(doc as JSONContent);
  let pageNumber = hasPageBlocks ? 0 : 1;
  const docAttrs =
    doc && typeof doc === "object" ? ((doc as JSONContent).attrs as Record<string, unknown> | undefined) : null;
  const styleLevelOf = tocStyleLevelsOf(docAttrs);
  // The document's heading numbers (Multilevel List > heading numbering), in
  // heading order, the numbering decoration's own count.
  let headingNumbers: string[] | null = null;
  if (docAttrs?.headingNumbering === true && doc && typeof doc === "object") {
    const levels: { level: number }[] = [];
    const count = (node: JSONContent): void => {
      if (!node || typeof node !== "object") return;
      if (node.type === "heading" && fragmentCarries("headingEntry", (node.attrs as Record<string, unknown> | undefined))) {
        levels.push({ level: Number((node.attrs as Record<string, unknown> | undefined)?.level) });
      }
      if (Array.isArray(node.content)) for (const child of node.content) count(child);
    };
    count(doc as JSONContent);
    headingNumbers = computeHeadingNumbers(levels);
  }
  // Otherwise the numbers a Word numbering gives imported headings.
  const listNumberer = headingNumbers === null ? createHeadingListNumberer() : null;
  let headingOrdinal = -1;
  // A manual table's numbered title counts in its numbering, as Word counts
  // it (manualTocTitleListNumbering): the headings after it read one more.
  let titleNumbering: Record<string, unknown> | null | undefined;
  const titleSource = (): Record<string, unknown> | null => {
    if (titleNumbering === undefined) {
      const numberings: unknown[] = [];
      const collect = (node: JSONContent): void => {
        if (!node || typeof node !== "object") return;
        if (node.type === "heading") {
          const source = (node.attrs as Record<string, unknown> | undefined)?.source;
          if (source && typeof source === "object") numberings.push((source as { listNumbering?: unknown }).listNumbering);
          return;
        }
        if (Array.isArray(node.content)) for (const child of node.content) collect(child);
      };
      collect(doc as JSONContent);
      titleNumbering = manualTocTitleListNumbering(docAttrs, numberings);
    }
    return titleNumbering ? { source: { listNumbering: titleNumbering } } : null;
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
      (node.type === "heading" || node.type === "paragraph") &&
      (node.attrs as Record<string, unknown> | undefined)?.[
        SPLIT_CONTINUATION_ATTR
      ] !== true
    ) {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!hasPageBlocks && attrs?.sourcePageBreakBefore === true) {
        pageNumber += 1;
      }
      let listNumber: string | undefined;
      if (node.type === "heading") {
        headingOrdinal += 1;
        listNumber = listNumberer?.(attrs, !node.content?.length)?.label;
      }
      const level = resolveTocSourceLevel(node.type, attrs, normalizeLevel, styleLevelOf);
      if (level !== null) {
        const text = sanitizeTocEntryText(nodeText(node));
        const stored = sanitizeAnchorId(
          (node.attrs as { [HEADING_ANCHOR_ID_ATTR]?: unknown } | undefined)?.[
            HEADING_ANCHOR_ID_ATTR
          ],
        );
        seeds.push({ stored, derived: slugifyHeadingAnchor(text) });
        if (emptyAt && text === "" && !jsonHoldsInlineObject(node)) {
          emptyAt.add(headings.length);
        }
        const entry: TocHeading = { level, text, id: "", pageNumber: Math.max(1, pageNumber) };
        const number = node.type === "heading" ? (headingNumbers?.[headingOrdinal] ?? listNumber) : undefined;
        if (number) entry.number = number;
        const runs = finishTocRuns(jsonHeadingSegments(node), text);
        if (runs) entry.runs = runs;
        headings.push(entry);
      }
    }
    if (
      listNumberer &&
      node.type === "blockContentControl" &&
      (node.attrs as Record<string, unknown> | undefined)?.docPartGallery === MANUAL_TOC_GALLERY
    ) {
      const title = node.content?.[0];
      const attrs = title && isManualTocTitle(title.type, title.attrs as Record<string, unknown> | undefined)
        ? titleSource()
        : null;
      if (attrs) listNumberer(attrs);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  };

  if (doc && typeof doc === "object") {
    visit(doc as JSONContent);
  }
  resolveHeadingAnchorIds(seeds).forEach((id, index) => {
    headings[index].id = id;
  });
  return headings;
}

/** A heading's stored anchor id (sanitized; "" for none) and the slug its
 * text gives. */
interface HeadingAnchorSeed {
  stored: string;
  derived: string;
}

/**
 * Every heading's unique anchor id, in document order.
 *
 * A stored id belongs to the first heading that stores it: references and
 * links were made to it, so neither a heading that only derives the same slug
 * from its text nor a later heading storing it again (a copy) takes it, even
 * when that heading comes first -- the copy pasted above its original took the
 * original's id and the references with it (WUA 055). Every other heading
 * takes its stored or derived id, or `heading-N`, with a `-2`, `-3`, ...
 * suffix when that is taken.
 */
function resolveHeadingAnchorIds(seeds: readonly HeadingAnchorSeed[]): string[] {
  const used = new Set<string>();
  const ids: (string | null)[] = seeds.map((seed) => {
    if (!seed.stored || used.has(seed.stored)) return null;
    used.add(seed.stored);
    return seed.stored;
  });
  // Per-base next suffix so a colliding id is resolved in amortized O(1):
  // instead of re-scanning from `-2` on every collision (O(N) per id, O(N^2)
  // overall when many headings share a base), we remember the next suffix to
  // try for each base and only step forward. The suffix scheme (`-2`, `-3`, …)
  // and determinism are preserved.
  const nextSuffix = new Map<string, number>();
  const ensureUnique = (base: string, index: number): string => {
    const seed = base || `heading-${index + 1}`;
    if (!used.has(seed)) {
      used.add(seed);
      return seed;
    }
    let suffix = nextSuffix.get(seed) ?? 2;
    let candidate: string;
    do {
      const tail = `-${suffix}`;
      candidate = `${seed.slice(0, MAX_ANCHOR_ID_LENGTH - tail.length)}${tail}`;
      suffix += 1;
    } while (used.has(candidate));
    // Remember where to resume so the next collision on this base does not
    // re-scan the suffixes we have already handed out.
    nextSuffix.set(seed, suffix);
    used.add(candidate);
    return candidate;
  };
  return seeds.map(
    (seed, index) => ids[index] ?? ensureUnique(seed.stored || seed.derived, index),
  );
}

/**
 * collectHeadings over a LIVE ProseMirror document — same entries, same id
 * scheme, but walks the node tree directly instead of serializing the whole
 * document first. `editor.getJSON()` is O(doc) allocation per call; on the
 * per-keystroke refresh paths (TOC node view, outline panel) that made
 * typing in a book-sized document pay a full-document serialization per
 * transaction. MUST stay result-identical to {@link collectHeadings} — the
 * by-index position lookups pair either variant with the same normalizer.
 * Callers may provide a traversal policy for a narrower view such as the
 * body-only outline; omitting it preserves the document-wide TOC behavior.
 */
export function collectHeadingsFromDoc(
  doc: HeadingSourceDoc,
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
  shouldDescend: HeadingTraversalPolicy = () => true,
): TocHeading[] {
  return walkDocHeadings(doc, normalizeLevel, shouldDescend, null);
}

/** {@link collectTocEntries} over a LIVE ProseMirror document. */
export function collectTocEntriesFromDoc(
  doc: HeadingSourceDoc,
  normalizeLevel: TocLevelNormalizer = normalizeTocHeadingLevel,
  shouldDescend: HeadingTraversalPolicy = () => true,
): TocHeading[] {
  const emptyAt = new Set<number>();
  return walkDocHeadings(doc, normalizeLevel, shouldDescend, emptyAt).filter(
    (_, index) => !emptyAt.has(index),
  );
}

interface HeadingSourceNode {
  type: { name: string };
  attrs?: Record<string, unknown> | null;
  textContent: string;
}

interface HeadingSourceDoc {
  descendants: (fn: (node: HeadingSourceNode, pos: number) => boolean | void) => void;
  /** The document's attrs: an imported document's style definitions say
   * which paragraph styles carry an outline level. */
  attrs?: Record<string, unknown> | null;
}

/** Whether a heading of an editor document holds an inline object; a
 * structural stand-in (no node tree) holds only its text. */
function docNodeHoldsInlineObject(node: HeadingSourceNode): boolean {
  const live = node as Partial<ProseMirrorNode>;
  if (typeof live.descendants !== "function") return false;
  let found = false;
  live.descendants((child) => {
    if (found) return false;
    if (!child.isText && !UNSEEN_INLINE_NODE_NAMES.has(child.type.name)) found = true;
    return !found;
  });
  return found;
}

function walkDocHeadings(
  doc: HeadingSourceDoc,
  normalizeLevel: TocLevelNormalizer,
  shouldDescend: HeadingTraversalPolicy,
  emptyAt: Set<number> | null,
): TocHeading[] {
  const headings: TocHeading[] = [];
  const seeds: HeadingAnchorSeed[] = [];

  let hasPageBlocks = false;
  doc.descendants((node) => {
    if (node.type.name === "pageBlock") hasPageBlocks = true;
    return !hasPageBlocks;
  });
  let pageNumber = hasPageBlocks ? 0 : 1;
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  // The document's heading numbers by heading position (the numbering
  // decoration counts every heading, wherever this walk descends).
  const numberAt = new Map<number, string>();
  if (doc.attrs?.headingNumbering === true) {
    const levels: { level: number }[] = [];
    const positions: number[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name === "heading" && fragmentCarries("headingEntry", node.attrs)) {
        levels.push({ level: Number(node.attrs?.level) });
        positions.push(pos);
      }
      return true;
    });
    computeHeadingNumbers(levels).forEach((label, index) => {
      if (label) numberAt.set(positions[index], label);
    });
  } else if (typeof (doc as Partial<ProseMirrorNode>).nodeAt === "function") {
    // The numbers a Word numbering gives imported headings.
    for (const [pos, number] of headingListNumbers(doc as unknown as ProseMirrorNode)) {
      numberAt.set(pos, number.label);
    }
  }
  // The last entry's heading continues on the next page (a cut heading).
  let openHeading = false;
  let openText = "";

  doc.descendants((node, pos) => {
    if (!shouldDescend(node.type.name)) return false;
    if (node.type.name === "pageBlock") pageNumber += 1;
    if (
      !hasPageBlocks &&
      (node.type.name === "pageBreak" || node.type.name === "sourcePageBreak")
    ) {
      pageNumber += 1;
    }
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return true;
    }
    if (!fragmentCarries("headingEntry", node.attrs)) {
      // The rest of a heading the page boundary cut: still its text.
      const open = headings[headings.length - 1];
      if (openHeading && open) {
        open.text = sanitizeTocEntryText(`${openText}${headingDisplayText(node)}`);
        if (emptyAt && (open.text !== "" || docNodeHoldsInlineObject(node))) {
          emptyAt.delete(headings.length - 1);
        }
      }
      openText += headingDisplayText(node);
      openHeading = openHeading && node.attrs?.[SPLIT_CONTINUES_ATTR] === true;
      return true;
    }
    openHeading = false;
    if (!hasPageBlocks && node.attrs?.sourcePageBreakBefore === true) {
      pageNumber += 1;
    }
    const level = resolveTocSourceLevel(
      node.type.name,
      node.attrs,
      normalizeLevel,
      styleLevelOf,
    );
    if (level === null) return true;
    // A field in the heading (an automatic date) shows its result; the
    
    openText = headingDisplayText(node);
    openHeading = node.attrs?.[SPLIT_CONTINUES_ATTR] === true;
    const text = sanitizeTocEntryText(openText);
    const stored = sanitizeAnchorId(node.attrs?.[HEADING_ANCHOR_ID_ATTR]);
    seeds.push({ stored, derived: slugifyHeadingAnchor(text) });
    if (emptyAt && text === "" && !docNodeHoldsInlineObject(node)) {
      emptyAt.add(headings.length);
    }
    const entry: TocHeading = { level, text, id: "", pageNumber: Math.max(1, pageNumber) };
    const number = numberAt.get(pos);
    if (number) entry.number = number;
    if (typeof (node as Partial<ProseMirrorNode>).descendants === "function" && !node.attrs?.[SPLIT_CONTINUES_ATTR]) {
      const runs = finishTocRuns(liveHeadingSegments(node as ProseMirrorNode), text);
      if (runs) entry.runs = runs;
    }
    headings.push(entry);
    return true;
  });
  resolveHeadingAnchorIds(seeds).forEach((id, index) => {
    headings[index].id = id;
  });
  return headings;
}
