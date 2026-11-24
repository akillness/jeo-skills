/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document paragraph style presets (Word/WPS "Styles" parity).
 *
 * A "style" here is NOT a new styling system: it is a deterministic, ordered
 * sequence of the editor's EXISTING commands (set a heading/paragraph node type,
 * set/clear the fontSize mark, set/clear the textAlign block attribute, toggle
 * the blockquote node). The toolbar interprets the descriptor produced by
 * {@link applyParagraphStyleSteps} against the real TipTap editor; everything in
 * this module is pure so the mapping and the active-style detector can be unit
 * tested without an editor instance.
 *
 * Each step references a primitive the document toolbar already exposes:
 *  - "blockType":  setSelectedTextBlockTypePreservingAttrs(editor, type, attrs)
 *  - "blockquote": setBlockquote() / unsetBlockquote() on the focused chain
 *  - "fontSize":   setFontSize(size) / unsetFontSize() on the focused chain
 *  - "textAlign":  setTextAlign(align) / unsetTextAlign() on the focused chain
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
  normalizeBuiltinParagraphStyleId,
  type DocumentTextAlign,
} from "../extensions/DocumentFormatting";
import {
  ensureStableNamedStyleIds,
  normalizeNamedStyleId,
  sanitizeNamedStyles,
  type NamedStyleDefinition,
} from "../extensions/DocumentPageSetup";
import { imeReplayingAppendTransaction } from "./imeCompositionGuard";
import { PARAGRAPH_MARK_MARKS_ATTR, normalizeParagraphMarkMarks } from "./paragraphMarkTyping";

export type ParagraphStylePreset =
  | "title"
  | "heading1"
  | "heading2"
  | "heading3"
  | "body"
  | "quote";

/** Ordered, deterministic list of presets as surfaced in the toolbar control. */
export const PARAGRAPH_STYLE_PRESETS = [
  "title",
  "heading1",
  "heading2",
  "heading3",
  "body",
  "quote",
] as const satisfies readonly ParagraphStylePreset[];

const PARAGRAPH_STYLE_PRESET_SET = new Set<string>(PARAGRAPH_STYLE_PRESETS);

export function isParagraphStylePreset(value: unknown): value is ParagraphStylePreset {
  return typeof value === "string" && PARAGRAPH_STYLE_PRESET_SET.has(value);
}

/** The font-size mark value applied by the Title preset (matches FONT_SIZE_VALUES). */
export const TITLE_FONT_SIZE = "32px";

/**
 * Heading levels each preset maps onto. Kept in one place so the apply
 * descriptor and the detector can never disagree about, say, "Heading 2".
 */
export const PARAGRAPH_STYLE_HEADING_LEVEL: Partial<
  Record<ParagraphStylePreset, number>
> = {
  title: 1,
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

export type ParagraphStyleStep =
  | { kind: "blockType"; type: "paragraph" }
  | { kind: "blockType"; type: "heading"; level: number }
  | { kind: "blockquote"; active: boolean }
  | { kind: "fontSize"; size: string | null }
  | {
      kind: "textAlign";
      align: DocumentTextAlign | null;
    };

/**
 * The deterministic command sequence for a preset. The toolbar runs the steps
 * IN ORDER: change the node type first (so subsequent mark/attribute steps land
 * on the right block), then normalize the font-size mark and block alignment.
 *
 * - Title:     heading L1, centered, larger font size.
 * - Heading 1: heading L1, left-aligned, no font-size override (uses the
 *              heading's intrinsic size).
 * - Heading 2: heading L2, left-aligned, no font-size override.
 * - Heading 3: heading L3, left-aligned, no font-size override.
 * - Body:      paragraph (clears any heading), left-aligned, no override.
 * - Quote:     blockquote (paragraph inside), left-aligned, no override.
 */
export function applyParagraphStyleSteps(
  preset: ParagraphStylePreset,
): ParagraphStyleStep[] {
  switch (preset) {
    case "title":
      return [
        { kind: "blockquote", active: false },
        { kind: "blockType", type: "heading", level: 1 },
        { kind: "fontSize", size: TITLE_FONT_SIZE },
        { kind: "textAlign", align: "center" },
      ];
    case "heading1":
      return [
        { kind: "blockquote", active: false },
        { kind: "blockType", type: "heading", level: 1 },
        { kind: "fontSize", size: null },
        { kind: "textAlign", align: null },
      ];
    case "heading2":
      return [
        { kind: "blockquote", active: false },
        { kind: "blockType", type: "heading", level: 2 },
        { kind: "fontSize", size: null },
        { kind: "textAlign", align: null },
      ];
    case "heading3":
      return [
        { kind: "blockquote", active: false },
        { kind: "blockType", type: "heading", level: 3 },
        { kind: "fontSize", size: null },
        { kind: "textAlign", align: null },
      ];
    case "quote":
      return [
        { kind: "blockType", type: "paragraph" },
        { kind: "blockquote", active: true },
        { kind: "fontSize", size: null },
        { kind: "textAlign", align: null },
      ];
    case "body":
    default:
      return [
        { kind: "blockquote", active: false },
        { kind: "blockType", type: "paragraph" },
        { kind: "fontSize", size: null },
        { kind: "textAlign", align: null },
      ];
  }
}

/**
 * Minimal, editor-agnostic snapshot of the current selection that the detector
 * needs. The toolbar builds this from the live TipTap editor; tests build it by
 * hand. All fields are optional so a partial probe still resolves to a concrete
 * preset (defaulting to Body).
 */
export interface ParagraphStyleProbe {
  /** True when the caret/selection sits inside a blockquote. */
  blockquote?: boolean;
  /** True when the active text block is a heading node. */
  heading?: boolean;
  /** Heading level (1-6) when {@link heading} is true. */
  headingLevel?: number | null;
  /** The active fontSize mark value, if any (e.g. "32px"). */
  fontSize?: string | null;
  /** The active block text alignment, if any. */
  textAlign?: DocumentTextAlign | null;
}

/**
 * Detect which preset best matches the current selection so the toolbar control
 * can reflect the active style. Returns null when nothing matches (e.g. the
 * caret is in a code block or table — styles do not apply there), so the control
 * can show a neutral/placeholder state instead of mislabelling the block.
 *
 * Order of checks mirrors specificity: Quote (a wrapping node) wins over a plain
 * heading/paragraph; Title (heading L1 + centered + the larger size) wins over a
 * bare Heading 1.
 */
export function detectActiveParagraphStyle(
  probe: ParagraphStyleProbe,
): ParagraphStylePreset | null {
  if (probe.blockquote) return "quote";

  if (probe.heading) {
    const level = Number(probe.headingLevel);
    if (level === 1) {
      const centered = probe.textAlign === "center";
      const titleSize = probe.fontSize === TITLE_FONT_SIZE;
      return centered && titleSize ? "title" : "heading1";
    }
    if (level === 2) return "heading2";
    if (level === 3) return "heading3";
    // Headings beyond L3 (e.g. imported L4-L6) have no dedicated preset.
    return null;
  }

  // A plain paragraph (not wrapped in a quote) is Body/Normal.
  return "body";
}

// ===========================================================================
// User-defined NAMED styles (the Styles pane registry).
//
// A "named style" is a user-authored entry in the document's palette (carried
// on the doc node's `namedStyles` attr — see DocumentPageSetup). Unlike the
// fixed presets above, the user creates/edits these and applies them to a
// paragraph. The assignment is persisted as stable `customStyleId` plus the
// editable `customStyleName` (added by {@link ParagraphStyleAssignment}) so it
// round-trips in JSON and survives palette reorder/rename operations.
// ===========================================================================

/**
 * Legacy OOXML id prefix used only for documents created before named styles
 * persisted their own identity. New and hydrated definitions carry `styleId`.
 */
export const NAMED_STYLE_ID_PREFIX = "MrStyle";
const LOCAL_NAMED_STYLE_ID_PATTERN = /^MrStyle[0-9a-f]{16}$/;

// Imported Word styles retain their source styleId. Locally-authored gallery
// definitions use the deterministic MrStyle hash namespace.
export function isImportedNamedStyleDefinition(
  definition: Pick<NamedStyleDefinition, "styleId">,
): definition is NamedStyleDefinition & { styleId: string } {
  const styleId = normalizeDocxStyleId(definition.styleId);
  return Boolean(styleId && !LOCAL_NAMED_STYLE_ID_PATTERN.test(styleId));
}

/** Backward-compatible, 1-based OOXML styleId for an old palette entry. */
export function namedStyleId(index: number): string {
  return `${NAMED_STYLE_ID_PREFIX}${index + 1}`;
}

/**
 * Legacy helper: resolve a name-only paragraph assignment to its position in
 * the sanitized palette. Stable-id assignments do not depend on this index.
 */
export function resolveNamedStyleIndex(
  name: unknown,
  palette: readonly NamedStyleDefinition[],
): number {
  if (typeof name !== "string" || !name) return -1;
  return palette.findIndex((style) => style.name === name);
}

/**
 * Resolve a style assignment by stable id first and legacy human name second.
 * The positional fallback exists only for pre-migration in-memory palettes.
 */
export function resolveNamedStyleId(
  name: unknown,
  palette: readonly NamedStyleDefinition[],
  preferredStyleId?: unknown,
): string | null {
  const stable = normalizeNamedStyleId(preferredStyleId);
  if (stable && palette.some((style) => style.styleId === stable))
    return stable;
  const index = resolveNamedStyleIndex(name, palette);
  if (index < 0) return null;
  return normalizeNamedStyleId(palette[index]?.styleId) ?? namedStyleId(index);
}

/**
 * Translate a user-defined named style's formatting into the SAME deterministic
 * editor-command steps the presets use, so applying a custom style runs through
 * the toolbar's existing step interpreter. A named style is always a plain
 * paragraph (Word's paragraph styles are not headings/quotes here); its rich
 * formatting (bold/italic/color/size) lives in the mark layer the steps drive.
 *
 * Only the font-size step is expressible as a single `ParagraphStyleStep`; the
 * other marks (bold/italic/underline/color) are applied by the panel directly
 * after the block normalization, because they are toggles rather than a single
 * deterministic set/clear. Kept here so the mapping is unit-testable.
 */
export function namedStyleFontSizeStep(
  def: Pick<NamedStyleDefinition, "fontSize">,
): ParagraphStyleStep {
  return { kind: "fontSize", size: def.fontSize ?? null };
}

/**
 * One mark-layer operation a named style applies to the selection. The Styles
 * pane interprets these against the live editor chain (set the font family/size/
 * color, turn on bold/italic/underline). A `setMark`/`setFontFamily`/`setFontSize`/
 * `setTextColor` op is only ever emitted when the definition carries that aspect,
 * so applying a bare named style (name only) is a no-op on the marks — it just
 * tags the paragraph (the assignment step is driven separately by the panel).
 */
export type NamedStyleApplyOp =
  | { kind: "fontFamily"; family: string }
  | { kind: "fontSize"; size: string }
  | { kind: "textColor"; color: string }
  | { kind: "mark"; mark: "bold" | "italic" | "underline" }
  | { kind: "characterStyle"; name: string };

/**
 * Translate a named-style definition into the deterministic, ORDERED list of
 * mark operations the Styles pane applies after it has normalized the block to a
 * plain paragraph. Order is fixed (family → size → color → bold → italic →
 * underline) so applying the same style twice is idempotent and a test can assert
 * the exact sequence without an editor. Empty (no marks) for a definition that
 * carries no formatting — the panel still tags the paragraph with its name so the
 * assignment round-trips and the DOCX `<w:pStyle>` resolves. PURE.
 *
 * When the definition carries a LINKED character style (Word `<w:link>`), that
 * character style's run formatting is applied LAST (after the direct
 * family/size/color/bold/italic/underline), so a linked named style paints both
 * the paragraph's own formatting AND its companion character style — the same way
 * Word's linked styles behave. The character-style op is dropped silently by the
 * panel if the gallery name is unknown (it is already validated upstream by
 * `sanitizeNamedStyles`).
 */
export function namedStyleApplyOps(
  def: NamedStyleDefinition,
): NamedStyleApplyOp[] {
  const ops: NamedStyleApplyOp[] = [];
  if (def.fontFamily) ops.push({ kind: "fontFamily", family: def.fontFamily });
  if (def.fontSize) ops.push({ kind: "fontSize", size: def.fontSize });
  if (def.textColor) ops.push({ kind: "textColor", color: def.textColor });
  if (def.bold) ops.push({ kind: "mark", mark: "bold" });
  if (def.italic) ops.push({ kind: "mark", mark: "italic" });
  if (def.underline) ops.push({ kind: "mark", mark: "underline" });
  if (def.linkedCharacterStyleId)
    ops.push({ kind: "characterStyle", name: def.linkedCharacterStyleId });
  return ops;
}

/** The formatting fields a style can carry (and inherit through Based on). */
export const NAMED_STYLE_FORMAT_FIELDS = [
  "fontFamily",
  "fontSize",
  "textColor",
  "bold",
  "italic",
  "underline",
  "linkedCharacterStyleId",
  "textAlign",
  "spaceBeforePt",
  "spaceAfterPt",
  "lineHeight",
  "indentLeftPt",
  "indentRightPt",
  "firstLineIndentPt",
] as const satisfies readonly (keyof NamedStyleDefinition)[];

/**
 * Word's "Style based on": a style's effective formatting is its based-on
 * style's effective formatting with its own fields on top (a chain ends at
 * Normal, which adds nothing here). PURE.
 */
export function resolveNamedStyle(
  palette: readonly NamedStyleDefinition[],
  definition: NamedStyleDefinition,
): NamedStyleDefinition {
  const chain: NamedStyleDefinition[] = [definition];
  const seen = new Set<string>([definition.styleId ?? definition.name]);
  let cursor = definition.basedOn;
  // Every style the palette admits can be an ancestor: a cap below the
  // palette's own size dropped the root's formatting from a legal chain of 17
  // or more (OFL-004). `seen` ends a cycle; the palette ends the walk.
  while (cursor && chain.length <= palette.length) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent = palette.find((style) => style.styleId === cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.basedOn;
  }
  const effective: NamedStyleDefinition = { ...definition };
  for (const field of NAMED_STYLE_FORMAT_FIELDS) {
    for (const style of chain) {
      if (style[field] !== undefined) {
        (effective as unknown as Record<string, unknown>)[field] = style[field];
        break;
      }
    }
  }
  return effective;
}

/**
 * The bold and italic a document's own paragraph style put on its words leave
 * with the style. Applying the style writes them as bare marks (no `value`),
 * where Bold / Italic on the ribbon state `value: true`; so when the paragraph
 * takes another style -- Normal from the gallery, a heading, another of the
 * document's styles -- the bare marks the old style supplies come off and a
 * direct format stays, as in Word (live Word audit WUA 150: a custom style's
 * bold stayed on the words after Normal). `from`..`to` is the range whose
 * paragraphs change style. Mutates `tr`.
 */
export function dropCustomStyleToggleMarks(
  tr: import("@tiptap/pm/state").Transaction,
  from: number,
  to: number,
): void {
  const palette = ensureStableNamedStyleIds(
    (tr.doc.attrs as { namedStyles?: unknown }).namedStyles,
  );
  if (!palette.length) return;
  const removals: Array<{ from: number; to: number; mark: import("@tiptap/pm/model").Mark }> = [];
  tr.doc.nodesBetween(from, Math.max(from, to), (node, pos) => {
    if (!node.isTextblock) return true;
    const styleId = normalizeNamedStyleId(node.attrs.customStyleId);
    const stored = styleId ? palette.find((style) => style.styleId === styleId) : undefined;
    if (!stored || stored.styleType === "character") return false;
    const effective = resolveNamedStyle(palette, stored);
    const toggles = [effective.bold ? "bold" : null, effective.italic ? "italic" : null].filter(
      (name): name is string => name !== null,
    );
    if (!toggles.length) return false;
    node.forEach((child, offset) => {
      if (!child.isText) return;
      for (const mark of child.marks) {
        if (toggles.includes(mark.type.name) && mark.attrs.value === undefined) {
          removals.push({ from: pos + 1 + offset, to: pos + 1 + offset + child.nodeSize, mark });
        }
      }
    });
    return false;
  });
  for (const removal of removals) tr.removeMark(removal.from, removal.to, removal.mark);
}

/** The paragraph attrs a paragraph style sets (null clears to the default). */
export function namedStyleParagraphAttrs(
  effective: NamedStyleDefinition | null,
): Record<string, unknown> {
  return {
    textAlign: effective?.textAlign ?? null,
    spaceBefore: effective?.spaceBeforePt ?? null,
    spaceAfter: effective?.spaceAfterPt ?? null,
    lineHeight: effective?.lineHeight ?? null,
    lineHeightPt: null,
    lineHeightRule: null,
    indentLeftPt: effective?.indentLeftPt ?? null,
    indentRightPt: effective?.indentRightPt ?? null,
    firstLineIndentPt: effective?.firstLineIndentPt ?? null,
  };
}

/** The run marks a style's formatting paints, as ProseMirror mark specs. */
export function namedStyleMarkSpecs(
  effective: NamedStyleDefinition,
): Array<{ type: string; attrs?: Record<string, unknown> }> {
  const specs: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  if (effective.fontFamily) {
    specs.push({ type: "fontFamily", attrs: { family: effective.fontFamily } });
  }
  if (effective.fontSize) {
    specs.push({ type: "fontSize", attrs: { size: effective.fontSize } });
  }
  if (effective.textColor) {
    specs.push({ type: "textColor", attrs: { color: effective.textColor } });
  }
  if (effective.bold) specs.push({ type: "bold" });
  if (effective.italic) specs.push({ type: "italic" });
  if (effective.underline) specs.push({ type: "underline" });
  return specs;
}

/** The run formatting a named style paints: what it takes from a blank paragraph's mark. */
const NAMED_STYLE_RUN_MARKS = new Set(["fontFamily", "fontSize", "textColor", "bold", "italic", "underline"]);

/**
 * A blank paragraph's mark formatting (`paragraphMarkMarks`) once a named
 * style painting `specs` applies to it: the style's run formatting replaces
 * the old style's, any other formatting the mark had stays. null = none.
 */
export function blankParagraphMarkSpecs(
  current: unknown,
  specs: ReadonlyArray<{ type: string; attrs?: Record<string, unknown> }>,
): Array<{ type: string; attrs?: Record<string, unknown> }> | null {
  const kept = (normalizeParagraphMarkMarks(current) ?? []).filter(
    (mark) => !NAMED_STYLE_RUN_MARKS.has(mark.type),
  );
  const next = [...kept, ...specs.map((spec) => (spec.attrs ? { type: spec.type, attrs: { ...spec.attrs } } : { type: spec.type }))];
  return next.length ? next : null;
}

/**
 * Word's Style for following paragraph: the style Enter at the end of a
 * paragraph of `definition` gives the new paragraph. null = Normal; the
 * style itself when unset.
 */
export function followingNamedStyle(
  palette: readonly NamedStyleDefinition[],
  definition: NamedStyleDefinition,
): NamedStyleDefinition | null | undefined {
  if (definition.styleType === "character") return undefined;
  const next = definition.nextStyleId;
  if (next === undefined || next === definition.styleId) return undefined;
  if (next === "Normal") return null;
  return palette.find((style) => style.styleId === next) ?? undefined;
}

/**
 * The built-in styles whose "Style for following paragraph" is Normal in
 * Word's Normal template: Heading 1-9, Title, Subtitle, Quote, Intense Quote.
 * (List Paragraph and No Spacing are followed by themselves.)
 */
const BUILTIN_FOLLOWED_BY_NORMAL = new Set([
  "heading1", "heading2", "heading3", "heading4", "heading5", "heading6",
  "title", "subtitle", "quote", "intenseQuote",
]);

/** What a built-in paragraph style writes on a paragraph (documentStyleGallery),
 * and the heading's own identity: none of it belongs to the paragraph after. */
const BUILTIN_STYLE_PARAGRAPH_RESET: Readonly<Record<string, null>> = {
  builtinStyleId: null,
  keepNext: null,
  keepLines: null,
  contextualSpacing: null,
  borderPreset: null,
  paragraphBorders: null,
  shadingColor: null,
  anchor_id: null,
};

/**
 * Enter at the end of a paragraph in a built-in style Word follows with
 * Normal: the empty paragraph the split made is Normal. It used to copy the
 * heading -- its style id, its 24pt space before, "keep with next" and "keep
 * lines together", even its anchor id, and its 32px accent-coloured run
 * format for whatever was typed next -- so a few Enters under a heading made
 * a run of heading-styled blank paragraphs that pagination, like Word, moves
 * to the next page as one.
 */
function builtinFollowingParagraph(
  oldParent: import("@tiptap/pm/model").Node,
  $pos: import("@tiptap/pm/model").ResolvedPos,
  splitAt: number,
): { pos: number; attrs: Record<string, unknown> } | null {
  const styleId = oldParent.type.name === "heading"
    ? `heading${Number(oldParent.attrs.level) || 1}`
    : oldParent.type.name === "paragraph"
      ? normalizeBuiltinParagraphStyleId(oldParent.attrs.builtinStyleId)
      : null;
  if (!styleId || !BUILTIN_FOLLOWED_BY_NORMAL.has(styleId)) return null;
  // A named (custom) style on the paragraph has its own following style.
  if (normalizeNamedStyleId(oldParent.attrs.customStyleId)) return null;
  const paragraph = $pos.parent;
  const depth = $pos.depth;
  if (paragraph.type.name !== "paragraph" || paragraph.content.size !== 0 || depth < 1) return null;
  const pos = $pos.before(depth);
  if (pos < splitAt) return null;
  const attrs: Record<string, unknown> = { ...paragraph.attrs, ...namedStyleParagraphAttrs(null) };
  for (const [name, value] of Object.entries(BUILTIN_STYLE_PARAGRAPH_RESET)) {
    if (name in paragraph.attrs) attrs[name] = value;
  }
  return { pos, attrs };
}

/**
 * Enter at the START of a heading that has text: Word leaves an empty
 * paragraph of the SAME style above it (measured in Word 16.86: "Heading 1",
 * keep with next on; the text's paragraph keeps its style too). The editor's
 * split turns the empty first half into the default block instead, so it is
 * given the heading's type and paragraph formatting back. Only the heading's
 * own identity stays with the text ({@link HEADING_IDENTITY_ATTRS}).
 */
function headingKeptAboveSplit(
  oldParent: import("@tiptap/pm/model").Node,
  $from: import("@tiptap/pm/model").ResolvedPos,
  doc: import("@tiptap/pm/model").Node,
): { pos: number; type: import("@tiptap/pm/model").NodeType; attrs: Record<string, unknown> } | null {
  if (oldParent.type.name !== "heading" || $from.parentOffset !== 0 || oldParent.content.size === 0) return null;
  if ($from.depth < 1) return null;
  const pos = $from.before($from.depth);
  const empty = doc.nodeAt(pos);
  if (!empty || empty.type.name !== "paragraph" || empty.content.size !== 0) return null;
  const text = doc.nodeAt(pos + empty.nodeSize);
  if (!text || text.type !== oldParent.type || text.content.size !== oldParent.content.size) return null;
  const attrs: Record<string, unknown> = { ...oldParent.attrs };
  // What says WHICH paragraph this is stays with the text: the empty one
  // keeps what the split gave it (its own block id; no anchor, no imported
  // source paragraph, no comment, no tracked paragraph mark of the other).
  for (const name of HEADING_IDENTITY_ATTRS) {
    if (!(name in attrs)) continue;
    attrs[name] =
      name in empty.attrs
        ? empty.attrs[name]
        : (oldParent.type.spec.attrs?.[name]?.default ?? null);
  }
  return { pos, type: oldParent.type, attrs };
}

const HEADING_IDENTITY_ATTRS = [
  "block_id",
  "id",
  "source",
  "anchor_id",
  "toc_anchor_id",
  "commentThreadIds",
  "trackParagraphMark",
  "trackParagraphFormatting",
] as const;

const RESTYLE_PARAGRAPH_FIELDS = [
  ["textAlign", "textAlign"],
  ["spaceBefore", "spaceBeforePt"],
  ["spaceAfter", "spaceAfterPt"],
  ["lineHeight", "lineHeight"],
  ["indentLeftPt", "indentLeftPt"],
  ["indentRightPt", "indentRightPt"],
  ["firstLineIndentPt", "firstLineIndentPt"],
] as const;

const RESTYLE_VALUE_MARKS = [
  ["fontFamily", "family", "fontFamily"],
  ["fontSize", "size", "fontSize"],
  ["textColor", "color", "textColor"],
] as const;

const RESTYLE_TOGGLE_MARKS = ["bold", "italic", "underline"] as const;

/**
 * Swap one run's values of an OLD style for a NEW style's, where the run
 * still carries the old value: a value the author put on top of the style
 * (a different size, a colour) stays, as direct formatting does in Word.
 * `before`/`after` are effective definitions ({} for Normal). Mutates `tr`.
 */
export function restyleRunMarks(
  tr: import("@tiptap/pm/state").Transaction,
  start: number,
  end: number,
  child: import("@tiptap/pm/model").Node,
  before: NamedStyleDefinition,
  after: NamedStyleDefinition,
): void {
  const schema = tr.doc.type.schema;
  for (const [markName, key, field] of RESTYLE_VALUE_MARKS) {
    const type = schema.marks[markName];
    const old = before[field];
    const next = after[field];
    if (!type || old === next) continue;
    const mark = child.marks.find((entry) => entry.type === type);
    const current = mark ? mark.attrs[key] : undefined;
    if (current !== old) continue;
    if (mark) tr.removeMark(start, end, mark);
    if (next !== undefined) tr.addMark(start, end, type.create({ [key]: next }));
  }
  for (const markName of RESTYLE_TOGGLE_MARKS) {
    const type = schema.marks[markName];
    const old = before[markName] === true;
    const next = after[markName] === true;
    if (!type || old === next) continue;
    const has = child.marks.some((entry) => entry.type === type);
    if (has !== old) continue;
    if (next) tr.addMark(start, end, type.create());
    else tr.removeMark(start, end, type);
  }
}

/**
 * Word applies a PARAGRAPH style to whole paragraphs: every run of each
 * paragraph [from, to] touches moves from the paragraph's previous style's
 * formatting (or Normal's) to `next`'s, whatever part of it is selected --
 * a caret included. Runs formatted apart from the old style keep that.
 * Mutates `tr`; the paragraph's own identity is set by the caller.
 */
export function applyNamedStyleToParagraphRuns(
  tr: import("@tiptap/pm/state").Transaction,
  from: number,
  to: number,
  palette: readonly NamedStyleDefinition[],
  next: NamedStyleDefinition,
): void {
  const blocks: Array<{ pos: number; before: NamedStyleDefinition }> = [];
  tr.doc.nodesBetween(from, Math.max(from, to), (node, pos) => {
    if (!node.isTextblock) return true;
    const styleId = normalizeNamedStyleId(node.attrs.customStyleId);
    const previous = styleId
      ? palette.find((style) => style.styleId === styleId)
      : undefined;
    blocks.push({
      pos,
      before: previous ? resolveNamedStyle(palette, previous) : { name: "" },
    });
    return false;
  });
  for (const { pos, before } of blocks) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    const start = pos + 1;
    const end = pos + node.nodeSize - 1;
    tr.doc.nodesBetween(start, end, (child, childPos) => {
      if (!child.isText) return true;
      restyleRunMarks(
        tr,
        Math.max(start, childPos),
        Math.min(end, childPos + child.nodeSize),
        child,
        before,
        next,
      );
      return false;
    });
  }
}

/**
 * Word's Modify Style updates every paragraph in the style. Styles here are
 * applied as formatting on the paragraph and its runs, so a modification
 * swaps the OLD effective value for the NEW one wherever a paragraph tagged
 * with the style (or a style based on it) still carries the old value;
 * formatting the author put on top — a different size, a colour — stays, as
 * direct formatting does in Word. Mutates `tr`.
 */
/** Marks the transaction the auto-update plugin appends, so it does not re-enter itself. */
export const NAMED_STYLE_AUTO_UPDATE_META = "namedStyleAutoUpdate";

type RestyleField = (typeof RESTYLE_PARAGRAPH_FIELDS)[number][1];

const RESTYLE_ATTR_TO_FIELD = new Map<string, RestyleField>(
  RESTYLE_PARAGRAPH_FIELDS.map(([attr, field]) => [attr, field]),
);

function sameParagraphValue(attr: string, left: unknown, right: unknown): boolean {
  return attr === "textAlign" ? (left ?? "left") === (right ?? "left") : left === right;
}









export function namedStyleAutoUpdatePlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("namedStyleAutoUpdate"),
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      if (
        transactions.some(
          (tr) =>
            tr.getMeta(NAMED_STYLE_AUTO_UPDATE_META) ||
            tr.getMeta(ySyncPluginKey) !== undefined ||
            tr.getMeta("addToHistory") === false,
        )
      ) {
        return null;
      }
      const palette = newState.doc.attrs.namedStyles;
      if (!Array.isArray(palette)) return null;
      const definitions = palette as NamedStyleDefinition[];
      const autoUpdated = definitions.filter(
        (style) =>
          style.autoUpdate === true &&
          typeof style.styleId === "string" &&
          style.styleType !== "character",
      );
      if (autoUpdated.length === 0) return null;
      const mapping = new Mapping();
      for (const tr of transactions) mapping.appendMapping(tr.mapping);
      const inverted = mapping.invert();
      const patches = new Map<string, Partial<Pick<NamedStyleDefinition, RestyleField>>>();
      newState.doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        const styleId = normalizeNamedStyleId(node.attrs.customStyleId);
        const style = styleId ? autoUpdated.find((entry) => entry.styleId === styleId) : null;
        if (!style || !styleId) return false;
        const oldPos = inverted.map(pos);
        const oldNode = oldState.doc.nodeAt(oldPos);
        // A paragraph that just took the style is the apply path, not a
        // format change on a styled paragraph.
        if (
          !oldNode ||
          oldNode.type !== node.type ||
          normalizeNamedStyleId(oldNode.attrs.customStyleId) !== styleId
        ) {
          return false;
        }
        const effective = resolveNamedStyle(definitions, style);
        for (const [attr, field] of RESTYLE_ATTR_TO_FIELD) {
          if (!(attr in node.attrs)) continue;
          const now = node.attrs[attr] ?? null;
          const was = oldNode.attrs[attr] ?? null;
          if (sameParagraphValue(attr, now, was)) continue;
          if (sameParagraphValue(attr, now, effective[field] ?? null)) continue;
          const patch = patches.get(styleId) ?? {};
          (patch as Record<string, unknown>)[field] =
            attr === "textAlign" ? (now ?? "left") : now === null ? undefined : now;
          patches.set(styleId, patch);
        }
        return false;
      });
      if (patches.size === 0) return null;
      const nextPalette = definitions.map((style) => {
        const patch = style.styleId ? patches.get(style.styleId) : undefined;
        if (!patch) return style;
        // An undefined patch value means "the paragraph went back to the
        // default": the field leaves the style instead of being stored.
        const next: NamedStyleDefinition = { ...style, ...patch };
        for (const field of RESTYLE_ATTR_TO_FIELD.values()) {
          if (field in patch && patch[field] === undefined) delete next[field];
        }
        return next;
      });
      const tr = newState.tr.setDocAttribute("namedStyles", nextPalette);
      tr.setMeta(NAMED_STYLE_AUTO_UPDATE_META, true);
      restyleNamedStyleParagraphs(tr, definitions, nextPalette);
      return tr;
    }),
  });
}

export function restyleNamedStyleParagraphs(
  tr: import("@tiptap/pm/state").Transaction,
  oldPalette: readonly NamedStyleDefinition[],
  newPalette: readonly NamedStyleDefinition[],
): void {
  const changes = new Map<
    string,
    { before: NamedStyleDefinition; after: NamedStyleDefinition }
  >();
  for (const style of newPalette) {
    if (!style.styleId) continue;
    const previous = oldPalette.find((entry) => entry.styleId === style.styleId);
    if (!previous) continue;
    const before = resolveNamedStyle(oldPalette, previous);
    const after = resolveNamedStyle(newPalette, style);
    const same = NAMED_STYLE_FORMAT_FIELDS.every(
      (field) => before[field] === after[field],
    );
    if (!same) changes.set(style.styleId, { before, after });
  }
  if (changes.size === 0) return;
  // Word's Modify Style on a CHARACTER style updates the text wearing it:
  // the runs that carry its identity (`characterStyle.styleId`), and only
  // those -- never text that merely has the same size or colour.
  const runs: Array<{ from: number; to: number; styleId: string }> = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const identity = node.marks.find(
      (mark) => mark.type.name === "characterStyle",
    )?.attrs.styleId;
    const styleId = normalizeNamedStyleId(identity);
    if (styleId && changes.has(styleId)) {
      runs.push({ from: pos, to: pos + node.nodeSize, styleId });
    }
    return false;
  });
  for (const { from, to, styleId } of runs) {
    const change = changes.get(styleId)!;
    tr.doc.nodesBetween(from, to, (child, childPos) => {
      if (!child.isText) return true;
      restyleRunMarks(
        tr,
        Math.max(from, childPos),
        Math.min(to, childPos + child.nodeSize),
        child,
        change.before,
        change.after,
      );
      return false;
    });
  }
  const targets: Array<{ pos: number; styleId: string }> = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const styleId = normalizeNamedStyleId(node.attrs.customStyleId);
    if (styleId && changes.has(styleId)) targets.push({ pos, styleId });
    return false;
  });
  for (const { pos, styleId } of targets) {
    const node = tr.doc.nodeAt(pos);
    const change = changes.get(styleId);
    if (!node || !change) continue;
    const { before, after } = change;
    const attrs: Record<string, unknown> = { ...node.attrs };
    let attrsChanged = false;
    for (const [attr, field] of RESTYLE_PARAGRAPH_FIELDS) {
      if (!(attr in node.attrs)) continue;
      // Applying a style stores the document's default alignment as null
      // (DocumentFormatting.setTextAlign), so a paragraph in a left-aligned
      // style carries null, not "left": compare alignments by their
      // effective value, or a left → centre change never reached the
      
      const same = (left: unknown, right: unknown) =>
        attr === "textAlign" ? (left ?? "left") === (right ?? "left") : left === right;
      const current = node.attrs[attr] ?? null;
      if (same(current, before[field] ?? null) && !same(current, after[field] ?? null)) {
        attrs[attr] = after[field] ?? null;
        attrsChanged = true;
      }
    }
    if (attrsChanged) tr.setNodeMarkup(pos, undefined, attrs, node.marks);
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    tr.doc.nodesBetween(from, to, (child, childPos) => {
      if (!child.isText) return true;
      restyleRunMarks(
        tr,
        Math.max(from, childPos),
        Math.min(to, childPos + child.nodeSize),
        child,
        before,
        after,
      );
      return false;
    });
  }
}

/**
 * Insert/replace a named style in a palette by name, returning a NEW array. An
 * existing entry with the same trimmed name is replaced in place and retains
 * its persisted styleId; a new name appends with a deterministic id. The list is
 * through {@link sanitizeNamedStyles} so the result is always whitelist-clean,
 * capped, and free of a name that trims to empty (such a definition is dropped).
 * PURE — the caller persists the result via `setNamedStyles`.
 */
export function upsertNamedStyle(
  palette: readonly NamedStyleDefinition[],
  definition: NamedStyleDefinition,
): NamedStyleDefinition[] {
  const name =
    typeof definition.name === "string"
      ? definition.name.trim().slice(0, 64)
      : "";
  const current = ensureStableNamedStyleIds(palette);
  if (!name) return current;
  const requestedId = normalizeNamedStyleId(definition.styleId);
  const existing =
    (requestedId
      ? current.find((style) => style.styleId === requestedId)
      : undefined) ?? current.find((style) => style.name === name);
  const normalized: NamedStyleDefinition = {
    ...definition,
    styleId:
      requestedId ?? normalizeNamedStyleId(existing?.styleId) ?? undefined,
    name,
  };
  let replaced = false;
  const next = current.map((style) => {
    if (
      (requestedId && style.styleId === requestedId) ||
      (!requestedId && style.name === name)
    ) {
      replaced = true;
      return normalized;
    }
    return style;
  });
  if (!replaced) next.push(normalized);
  return ensureStableNamedStyleIds(next);
}








export function removeNamedStyleWithDependents(
  palette: readonly NamedStyleDefinition[],
  name: string,
): NamedStyleDefinition[] {
  const target = typeof name === "string" ? name.trim().slice(0, 64) : "";
  const removed = palette.find((style) => style.name === target);
  const removedId = removed?.styleId;
  if (!removed || !removedId) return removeNamedStyle(palette, name);
  const rebased = palette.map((style) => {
    if (style.basedOn !== removedId) return style;
    const folded: NamedStyleDefinition = { ...style, basedOn: removed.basedOn };
    for (const field of NAMED_STYLE_FORMAT_FIELDS) {
      if (folded[field] === undefined && removed[field] !== undefined) {
        (folded as unknown as Record<string, unknown>)[field] = removed[field];
      }
    }
    return folded;
  });
  return removeNamedStyle(rebased, name);
}

/**
 * Remove a named style from a palette by name, returning a NEW sanitized array.
 * UI callers clear paragraph references in the same transaction. PURE.
 */
export function removeNamedStyle(
  palette: readonly NamedStyleDefinition[],
  name: string,
): NamedStyleDefinition[] {
  const target = typeof name === "string" ? name.trim().slice(0, 64) : "";
  return ensureStableNamedStyleIds(
    palette.filter((style) => style.name !== target),
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphStyleAssignment: {
      /**
       * Tag the selected paragraph(s)/heading(s) with a user-defined named
       * style. Stable id and display name are stored together; visual formatting
       * is applied separately by the caller. Empty name clears the assignment.
       */
      setCustomParagraphStyle: (name: string, styleId?: string) => ReturnType;
      // Assign an imported/native Word paragraph style by exact styleId.
      setDocxParagraphStyle: (styleId: string) => ReturnType;
      /** Clear the named-style assignment on the selected block(s). */
      clearCustomParagraphStyle: () => ReturnType;
      /** Update every paragraph reference after a definition is renamed. */
      renameCustomParagraphStyleReferences: (
        styleId: string,
        previousName: string,
        nextName: string,
      ) => ReturnType;
      /** Remove every paragraph reference before a definition is deleted. */
      clearCustomParagraphStyleReferences: (
        styleId: string,
        name: string,
      ) => ReturnType;
    };
  }
}

/** Sanitize a paragraph's stored `customStyleName` (trim + length clamp). */
function normalizeCustomStyleName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return trimmed ? trimmed : null;
}

/** Stable direct OOXML pStyle identity carried by an imported block. */
export function normalizeDocxStyleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 128 && !/[\u0000-\u001f]/.test(trimmed)
    ? trimmed
    : null;
}

/**
 * TipTap extension that adds `customStyleId` + `customStyleName` attributes to
 * `paragraph` and `heading` nodes — the per-block assignment of a user-defined
 * named style. Both fields are sanitized on parse/render. A block with no
 * assignment carries no attribute,
 * so a document that never applies a custom style is byte-for-byte unchanged in
 * both its JSON and its exported document.xml.
 *
 * SECURITY: the name is funneled through {@link normalizeCustomStyleName} on
 * BOTH parse and render (and re-validated against the palette at export time),
 * so a forged page / stray import cannot store markup or an unbounded value.
 */
export const ParagraphStyleAssignment = Extension.create({
  name: "paragraphStyleAssignment",

  addOptions() {
    return { types: ["paragraph", "heading"] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types as string[],
        attributes: {
          customStyleName: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeCustomStyleName(
                element.getAttribute("data-custom-style"),
              ),
            renderHTML: (attributes: Record<string, unknown>) => {
              const name = normalizeCustomStyleName(attributes.customStyleName);
              return name ? { "data-custom-style": name } : {};
            },
          },
          customStyleId: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeNamedStyleId(
                element.getAttribute("data-custom-style-id"),
              ),
            renderHTML: (attributes: Record<string, unknown>) => {
              const styleId = normalizeNamedStyleId(attributes.customStyleId);
              return styleId ? { "data-custom-style-id": styleId } : {};
            },
          },
          docxStyleId: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeDocxStyleId(element.getAttribute("data-docx-style-id")),
            renderHTML: (attributes: Record<string, unknown>) => {
              const styleId = normalizeDocxStyleId(attributes.docxStyleId);
              return styleId ? { "data-docx-style-id": styleId } : {};
            },
          },
          // Word comment threads anchored on the paragraph itself: a
          // range-less comment whose reference run shows no text (a comment
          // on an empty paragraph). The thread ids of `doc.attrs.commentThreads`
          // entries, carried as imported and written back by the DOCX writers
          // as Word's markers at the paragraph's start; never parsed from
          // pasted HTML.
          commentThreadIds: {
            default: null,
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      namedStyleAutoUpdatePlugin(),
      // Word's "Style for following paragraph": when Enter at the end of a
      // paragraph in a style that names a different following style splits
      // it, the new paragraph takes that style (or Normal). Read from the
      // split itself (an empty paragraph copying its style, right after the
      // one the caret ended), so every Enter path is covered.
      new Plugin({
        key: new PluginKey("namedStyleFollowingParagraph"),
        appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // A plain split adds one paragraph (2); Enter in a list splits the
          // list item as well (4) and the new paragraph sits in a new item,
          
          const grown = newState.doc.content.size - oldState.doc.content.size;
          if (grown !== 2 && grown !== 4) return null;
          const before = oldState.selection;
          const after = newState.selection;
          if (!before.empty || !after.empty) return null;
          const oldParent = before.$from.parent;
          const above = headingKeptAboveSplit(oldParent, before.$from, newState.doc);
          if (above) return newState.tr.setNodeMarkup(above.pos, above.type, above.attrs);
          if (before.$from.parentOffset !== oldParent.content.size) return null;
          const builtin = builtinFollowingParagraph(oldParent, after.$from, before.from);
          if (builtin) {
            return newState.tr
              .setNodeMarkup(builtin.pos, undefined, builtin.attrs)
              .setStoredMarks([]);
          }
          if (oldParent.type.name !== "paragraph") return null;
          const styleId = normalizeNamedStyleId(oldParent.attrs.customStyleId);
          if (!styleId) return null;
          const $pos = after.$from;
          const paragraph = $pos.parent;
          const depth = $pos.depth;
          if (
            paragraph.type.name !== "paragraph" ||
            paragraph.content.size !== 0 ||
            normalizeNamedStyleId(paragraph.attrs.customStyleId) !== styleId ||
            depth < 1
          ) {
            return null;
          }
          // The new paragraph is the one the split made right after the
          // caret's paragraph, whose style `styleId` already is.
          if ($pos.before(depth) < before.from) return null;
          const palette = ensureStableNamedStyleIds(
            (newState.doc.attrs as { namedStyles?: unknown }).namedStyles,
          );
          const definition = palette.find((style) => style.styleId === styleId);
          if (!definition) return null;
          const following = followingNamedStyle(palette, definition);
          if (following === undefined) return null;
          const effective = following ? resolveNamedStyle(palette, following) : null;
          const specs = effective
            ? namedStyleMarkSpecs(effective).filter((spec) => newState.schema.marks[spec.type])
            : [];
          const tr = newState.tr.setNodeMarkup($pos.before(depth), undefined, {
            ...paragraph.attrs,
            ...namedStyleParagraphAttrs(effective),
            customStyleId: following?.styleId ?? null,
            customStyleName: following?.name ?? null,
            docxStyleId: null,
            // The new paragraph's mark wears the style's formatting, as in
            // Word: text typed into it takes that formatting even after the
            // caret has left the paragraph and come back, which clears the
            // stored marks below (WUA 186). Ends with the first typed text.
            ...(PARAGRAPH_MARK_MARKS_ATTR in paragraph.attrs
              ? { [PARAGRAPH_MARK_MARKS_ATTR]: blankParagraphMarkSpecs(paragraph.attrs[PARAGRAPH_MARK_MARKS_ATTR], specs) }
              : {}),
          });
          tr.setStoredMarks(
            specs.map((spec) => newState.schema.marks[spec.type].create(spec.attrs)),
          );
          return tr;
        }),
      }),
    ];
  },

  addCommands() {
    return {
      setCustomParagraphStyle:
        (name: string, styleId?: string) =>
        ({ commands }) => {
          const normalized = normalizeCustomStyleName(name);
          const normalizedId = normalizeNamedStyleId(styleId);
          // updateAttributes targets whichever text block(s) the selection spans;
          // an empty name clears the assignment (falls back to Normal/preset).
          let applied = false;
          for (const type of this.options.types as string[]) {
            if (
              commands.updateAttributes(type, {
                customStyleName: normalized,
                customStyleId: normalized ? normalizedId : null,
                // Choosing a legacy palette entry is an explicit reassignment;
                // never leave the imported pStyle identity pointing elsewhere.
                docxStyleId: null,
              })
            ) {
              applied = true;
            }
          }
          return applied;
        },
      setDocxParagraphStyle:
        (styleId: string) =>
        ({ commands }) => {
          const normalized = normalizeDocxStyleId(styleId);
          if (!normalized) return false;
          let applied = false;
          for (const type of this.options.types as string[]) {
            if (
              commands.updateAttributes(type, {
                customStyleName: null,
                customStyleId: null,
                docxStyleId: normalized,
              })
            ) {
              applied = true;
            }
          }
          return applied;
        },
      clearCustomParagraphStyle:
        () =>
        ({ commands, tr, dispatch }) => {
          // The style's own bold and italic go with it (WUA 150).
          if (dispatch) dropCustomStyleToggleMarks(tr, tr.selection.from, tr.selection.to);
          let applied = false;
          for (const type of this.options.types as string[]) {
            if (
              commands.updateAttributes(type, {
                customStyleName: null,
                customStyleId: null,
                docxStyleId: null,
              })
            ) {
              applied = true;
            }
          }
          return applied;
        },
      renameCustomParagraphStyleReferences:
        (styleId: string, previousName: string, nextName: string) =>
        ({ state, tr, dispatch }) => {
          const normalizedId = normalizeNamedStyleId(styleId);
          const previous = normalizeCustomStyleName(previousName);
          const next = normalizeCustomStyleName(nextName);
          if (!normalizedId || !next) return false;
          if (dispatch) {
            state.doc.descendants((node, pos) => {
              if (!(this.options.types as string[]).includes(node.type.name)) {
                return;
              }
              const nodeId = normalizeNamedStyleId(node.attrs.customStyleId);
              const nodeName = normalizeCustomStyleName(
                node.attrs.customStyleName,
              );
              if (
                nodeId !== normalizedId &&
                !(nodeId === null && previous !== null && nodeName === previous)
              ) {
                return;
              }
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                customStyleId: normalizedId,
                customStyleName: next,
                docxStyleId: null,
              });
            });
          }
          return true;
        },
      clearCustomParagraphStyleReferences:
        (styleId: string, name: string) =>
        ({ state, tr, dispatch }) => {
          const normalizedId = normalizeNamedStyleId(styleId);
          const normalizedName = normalizeCustomStyleName(name);
          if (!normalizedId && !normalizedName) return false;
          if (dispatch) {
            state.doc.descendants((node, pos) => {
              if (!(this.options.types as string[]).includes(node.type.name)) {
                return;
              }
              const nodeId = normalizeNamedStyleId(node.attrs.customStyleId);
              const nodeName = normalizeCustomStyleName(
                node.attrs.customStyleName,
              );
              if (
                (normalizedId && nodeId === normalizedId) ||
                (nodeId === null &&
                  normalizedName &&
                  nodeName === normalizedName)
              ) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  customStyleId: null,
                  customStyleName: null,
                  docxStyleId: null,
                });
              }
            });
          }
          return true;
        },
    };
  },
});

export { ensureStableNamedStyleIds, sanitizeNamedStyles };
export type { NamedStyleDefinition };
