/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What a Design change does to the document's text: Word restyles every
 * paragraph that wears a Quick Style (its style's definition changed), never
 * touching direct formatting.
 *
 * The editor writes a gallery style's formatting onto its paragraph (marks
 * and paragraph attributes, see documentStyleGallery.ts). So a Design change
 * swaps, paragraph by paragraph, the formatting the style gave under the old
 * design for the formatting it gives under the new one: a value that is the
 * old style's own (or that the paragraph does not state) takes the new
 * style's; any other value is the author's direct formatting and stays.
 * Paragraphs that wear an imported document's own style, or a custom style,
 * are not gallery styles and are left as they are.
 */

import type { Node as ProseMirrorNode, Mark, MarkType } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import {
  DEFAULT_DOCUMENT_DESIGN,
  documentDesignBase,
  documentDesignColors,
  wordThemeColorHex,
  documentDesignStyleRecipe,
  normalizeDocumentDesign,
  type DocumentDesign,
  type DocumentDesignBase,
  type DocumentStyleRecipe,
  type DocumentStyleRunRecipe,
} from "../../../../lib/document-design";
import { normalizeDocumentParagraphBorders } from "../../../../lib/document-borders";
import { DOCUMENT_WORD_HEADING_FONT_FAMILY, documentFontSet } from "../../../../lib/document-font-sets";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import {
  withRecipeWordStyleSets,
  wordQuickStyleIdForName,
  wordStyleSetsServed,
  type WordQuickStyleId,
} from "../../../../lib/office-word-style-sets";

import { normalizeBuiltinParagraphStyleId } from "../extensions/DocumentFormatting";
import { setParagraphFormatAsDocumentDefault } from "./paragraphSetAsDefault";
import {
  normalizeFontFamily,
  normalizeFontSize,
  normalizeTextThemeColor,
} from "../extensions/TextStyling";

/** The theme schemes a Design command sets (Colors, Fonts, Effects; Themes all three). */
export type DocumentThemeAxis = "colors" | "fonts" | "effects";

/**
 * Whether the document's styles are its own (an imported Word document's
 * style graph or theme), not a style set the Design tab installed: the
 * export keeps them as they are (the API's `document_design_package`).
 */
export function documentKeepsOwnStyles(doc: ProseMirrorNode): boolean {
  return doc.attrs.styleDefinitions != null || doc.attrs.documentThemeColors != null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whether the document's defaults are its design's (size, spacing, line
 * height): an imported document whose styles are one of Word's style sets
 * (the importer recognised it), or one the Design tab restyled. An imported
 * document of its own styles, given a design by a Colors / Fonts choice
 * alone, keeps its own defaults and does not.
 */
function documentWearsDesignBase(doc: ProseMirrorNode, design: DocumentDesign | null): boolean {
  const base = design ? documentDesignBase(design) : null;
  if (!base) return false;
  const near = (key: keyof DocumentDesignBase, tolerance: number) => {
    const want = numeric(base[key]);
    const have = numeric(doc.attrs[key]);
    // A default the document does not state is the design's.
    return doc.attrs[key] == null || (want !== null && have !== null && Math.abs(want - have) <= tolerance);
  };
  // The body face too: a document of its own styles whose spacing and size
  // a Paragraph Spacing choice made the design's still sets its own font.
  const face = (value: unknown) => officePrimaryFontFamily(String(value ?? "")).trim().toLowerCase();
  return (
    (doc.attrs.defaultFontFamily == null || face(doc.attrs.defaultFontFamily) === face(base.defaultFontFamily)) &&
    near("defaultFontSize", 0.1) &&
    near("defaultLineHeight", 0.01) &&
    near("defaultParagraphSpaceBefore", 0.05) &&
    near("defaultParagraphSpaceAfter", 0.05)
  );
}

/** The design a document is drawn in: its own, or none (`null`) yet. */
export function documentDesignOfDoc(doc: ProseMirrorNode): DocumentDesign | null {
  return normalizeDocumentDesign(doc.attrs.documentDesign);
}

/** The gallery's fixed Office-theme sizes before the Design tab existed. */
const LEGACY_FONT_SIZE: Readonly<Record<string, string>> = {
  heading1: "32px",
  heading2: "26.67px",
  heading3: "21.33px",
  heading4: "18.67px",
  heading5: "16px",
  heading6: "14.67px",
  title: "37.33px",
  subtitle: "18.67px",
};
const LEGACY_DISPLAY_STYLES = new Set(["heading1", "heading2", "heading3", "title", "subtitle"]);

const NO_PARAGRAPH: DocumentStyleRecipe["paragraph"] = Object.freeze({
  spaceBeforePt: null,
  spaceAfterPt: null,
  lineHeight: null,
  textAlign: null,
  indentLeftPt: null,
  indentRightPt: null,
  firstLineIndentPt: null,
  keepNext: null,
  keepLines: null,
  contextualSpacing: null,
  borders: null,
  shading: null,
});

const NO_RUN: DocumentStyleRunRecipe = Object.freeze({
  fontFamily: null,
  fontCjkFamily: null,
  fontSize: null,
  textColor: null,
  bold: null,
  italic: null,
  allCaps: null,
  smallCaps: null,
  charSpacingPt: null,
  underline: null,
});

/** The Office theme's accent heading colour and the quote/subtitle greys the old gallery wrote. */
const LEGACY_ACCENT = "#0f4761";
const LEGACY_SUBTLE_TEXT = "#595959";
const LEGACY_QUOTE_TEXT = "#404040";

/**
 * The few values the Styles gallery stated before the Design tab, kept with
 * the app: what a page draws with while Word's style sets (served Office
 * data, lib/office-word-style-sets.ts) are not here, e.g. for a guest.
 */
function bundledLegacyRecipe(id: WordQuickStyleId): DocumentStyleRecipe {
  const paragraph = (values: Partial<DocumentStyleRecipe["paragraph"]>) => ({ ...NO_PARAGRAPH, ...values });
  const run = (values: Partial<DocumentStyleRunRecipe>) => ({ ...NO_RUN, ...values });
  const heading = (before: number, after: number, bold = false) => ({
    paragraph: paragraph({ spaceBeforePt: before, spaceAfterPt: after, keepNext: true, keepLines: true }),
    run: run({ textColor: LEGACY_ACCENT, ...(bold ? { bold: true } : {}) }),
  });
  switch (id) {
    case "heading1":
      return heading(24, 4);
    case "heading2":
    case "heading3":
      return heading(8, 4);
    case "heading4":
    case "heading5":
      return heading(4, 2);
    case "heading6":
      return heading(2, 0, true);
    case "title":
      return {
        paragraph: paragraph({ spaceAfterPt: 4, textAlign: "center", lineHeight: "1", contextualSpacing: true }),
        run: run({ charSpacingPt: -0.5 }),
      };
    case "subtitle":
      return {
        paragraph: paragraph({ textAlign: "center" }),
        run: run({ textColor: LEGACY_SUBTLE_TEXT, charSpacingPt: 0.75 }),
      };
    case "quote":
      return {
        paragraph: paragraph({ spaceBeforePt: 8, textAlign: "center" }),
        run: run({ italic: true, textColor: LEGACY_QUOTE_TEXT }),
      };
    case "intenseQuote": {
      const edge = { style: "single", sizePt: 0.5, color: LEGACY_ACCENT, spacePt: 10 };
      return {
        paragraph: paragraph({
          spaceBeforePt: 18,
          spaceAfterPt: 18,
          textAlign: "center",
          indentLeftPt: 43.2,
          indentRightPt: 43.2,
          borders: { top: { ...edge }, bottom: { ...edge } },
        }),
        run: run({ italic: true, textColor: LEGACY_ACCENT }),
      };
    }
    case "noSpacing":
      return { paragraph: paragraph({ spaceBeforePt: 0, spaceAfterPt: 0, lineHeight: "1" }), run: NO_RUN };
    case "listParagraph":
      return { paragraph: paragraph({ indentLeftPt: 36, contextualSpacing: true }), run: NO_RUN };
    default:
      return { paragraph: NO_PARAGRAPH, run: NO_RUN };
  }
}

/**
 * The formatting the Styles gallery wrote before the document had a design:
 * Word's Normal template under the Office theme (the same values the
 * default style set holds), in one face for Latin and East Asian text, the
 * display styles in the Word heading stack and the others in the document's
 * own font, every style at its size (the body styles at the document's).
 * While Word's style sets are not here, the values the old gallery stated.
 */
export function legacyGalleryRecipe(
  doc: ProseMirrorNode,
  id: WordQuickStyleId,
): DocumentStyleRecipe {
  const recipe = documentDesignStyleRecipe(DEFAULT_DOCUMENT_DESIGN, id) ?? bundledLegacyRecipe(id);
  const family = officePrimaryFontFamily(
    LEGACY_DISPLAY_STYLES.has(id)
      ? DOCUMENT_WORD_HEADING_FONT_FAMILY
      : (normalizeFontFamily(doc.attrs.defaultFontFamily) ?? documentFontSet("office")!.family),
  );
  return {
    // No Spacing stated a zero before as well as after.
    paragraph:
      id === "noSpacing" ? { ...recipe.paragraph, spaceBeforePt: 0 } : recipe.paragraph,
    run: {
      ...recipe.run,
      fontFamily: family,
      fontCjkFamily: family,
      fontSize:
        LEGACY_FONT_SIZE[id] ?? normalizeFontSize(doc.attrs.defaultFontSize) ?? "16px",
    },
  };
}

/**
 * A design's recipe for one style; `null` design = the legacy gallery's.
 * Null for a design while Word's style sets are not here: the caller
 * refuses rather than write a guess.
 */
export function documentStyleRecipeFor(
  doc: ProseMirrorNode,
  design: DocumentDesign | null,
  id: WordQuickStyleId,
): DocumentStyleRecipe | null {
  return design ? documentDesignStyleRecipe(design, id) : legacyGalleryRecipe(doc, id);
}

const HEADING_IDS: readonly WordQuickStyleId[] = [
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
];
const PARAGRAPH_STYLE_IDS = new Set<string>([
  "noSpacing",
  "title",
  "subtitle",
  "quote",
  "intenseQuote",
  "listParagraph",
]);

/**
 * The gallery style a block wears, or null: a heading is its level's style
 * unless it wears an imported or custom style; a paragraph is the style its
 * `builtinStyleId` names, Normal when it names none (Normal's own formatting
 * is the document defaults; the legacy gallery also wrote the body font and
 * size on it, which a design change takes off).
 */
export function galleryStyleOfBlock(
  node: ProseMirrorNode,
  importedStyles?: ReadonlyMap<string, WordQuickStyleId>,
): WordQuickStyleId | null {
  if (node.attrs.docxStyleId) {
    // An imported paragraph whose style is one of Word's Quick Styles
    // (Heading 1, Title...) in a document whose style set was recognised.
    return importedStyles?.get(String(node.attrs.docxStyleId)) ?? null;
  }
  if (node.attrs.customStyleId || node.attrs.customStyleName) return null;
  if (node.type.name === "heading") {
    const level = Number(node.attrs.level);
    return HEADING_IDS[level - 1] ?? null;
  }
  if (node.type.name !== "paragraph") return null;
  const builtin = normalizeBuiltinParagraphStyleId(node.attrs.builtinStyleId);
  if (!builtin) return "normal";
  return PARAGRAPH_STYLE_IDS.has(builtin) ? (builtin as WordQuickStyleId) : null;
}

/**
 * An imported document's own ids of Word's Quick Styles (its styles.xml,
 * `styleDefinitions`): a Word document whose style set the importer
 * recognised (it then carries `documentDesign`) wears them by those ids,
 * `1` for Heading 1 in a Chinese Word's file.
 */
export function importedQuickStyles(doc: ProseMirrorNode): Map<string, WordQuickStyleId> {
  const out = new Map<string, WordQuickStyleId>();
  const definitions = doc.attrs.styleDefinitions as { styles?: unknown } | null | undefined;
  const styles = Array.isArray(definitions?.styles) ? definitions.styles : [];
  for (const style of styles) {
    if (!style || typeof style !== "object") continue;
    const record = style as { styleId?: unknown; name?: unknown; type?: unknown };
    if (record.type !== "paragraph" || typeof record.styleId !== "string") continue;
    const id = wordQuickStyleIdForName(record.name);
    if (id) out.set(record.styleId, id);
  }
  return out;
}

/* ------------------------------------------------------- paragraph attrs */

type ParagraphField =
  | "spaceBefore"
  | "spaceAfter"
  | "lineHeight"
  | "textAlign"
  | "indentLeftPt"
  | "indentRightPt"
  | "firstLineIndentPt"
  | "keepNext"
  | "keepLines"
  | "contextualSpacing"
  | "paragraphBorders"
  | "shadingColor";

/** The paragraph attributes a style recipe states, by attribute name. */
export function recipeParagraphAttrs(recipe: DocumentStyleRecipe): Record<ParagraphField, unknown> {
  const p = recipe.paragraph;
  return {
    spaceBefore: p.spaceBeforePt,
    spaceAfter: p.spaceAfterPt,
    lineHeight: p.lineHeight,
    textAlign: p.textAlign,
    indentLeftPt: p.indentLeftPt,
    indentRightPt: p.indentRightPt,
    firstLineIndentPt: p.firstLineIndentPt,
    keepNext: p.keepNext,
    keepLines: p.keepLines,
    contextualSpacing: p.contextualSpacing,
    paragraphBorders: p.borders ? normalizeDocumentParagraphBorders(p.borders) : null,
    shadingColor: p.shading,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.01;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/* -------------------------------------------------------------- run marks */

type RunMarkName =
  | "fontFamily"
  | "fontCjkFamily"
  | "fontSize"
  | "textColor"
  | "bold"
  | "italic"
  | "allCaps"
  | "smallCaps"
  | "charSpacing"
  | "underline";

const RUN_MARKS: readonly RunMarkName[] = [
  "fontFamily",
  "fontCjkFamily",
  "fontSize",
  "textColor",
  "bold",
  "italic",
  "allCaps",
  "smallCaps",
  "charSpacing",
  "underline",
];

/** A recipe's value for one run mark: attrs, `true` for a bare mark, null for none. */
function recipeMarkValue(run: DocumentStyleRunRecipe, name: RunMarkName): Record<string, unknown> | true | null {
  switch (name) {
    case "fontFamily":
      return run.fontFamily ? { family: run.fontFamily } : null;
    case "fontCjkFamily":
      return run.fontCjkFamily ? { family: run.fontCjkFamily } : null;
    case "fontSize":
      return run.fontSize ? { size: run.fontSize } : null;
    case "textColor":
      return run.textColor ? { color: run.textColor } : null;
    case "bold":
      return run.bold ? true : null;
    case "italic":
      return run.italic ? true : null;
    case "allCaps":
      return run.allCaps ? true : null;
    case "smallCaps":
      return run.smallCaps ? true : null;
    case "charSpacing":
      return run.charSpacingPt ? { spacing: run.charSpacingPt } : null;
    case "underline":
      return run.underline ? true : null;
  }
}

function fontSizePx(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whether a mark on the text is the value a recipe wrote. */
function markMatches(mark: Mark, name: RunMarkName, value: Record<string, unknown> | true | null): boolean {
  if (value === null) return false;
  if (value === true) return true;
  switch (name) {
    case "fontFamily":
    case "fontCjkFamily":
      return (
        String(mark.attrs.family ?? "").trim().toLowerCase() ===
        String(value.family ?? "").trim().toLowerCase()
      );
    case "fontSize": {
      const a = fontSizePx(mark.attrs.size);
      const b = fontSizePx(value.size);
      return a !== null && b !== null && Math.abs(a - b) < 0.02;
    }
    case "textColor":
      return String(mark.attrs.color ?? "").toLowerCase() === String(value.color ?? "").toLowerCase();
    case "charSpacing":
      return sameValue(mark.attrs.spacing, value.spacing);
    default:
      return true;
  }
}

function createMark(type: MarkType, value: Record<string, unknown> | true): Mark {
  return value === true ? type.create() : type.create(value);
}

/**
 * Swap one block's style formatting from `from` to `to`, keeping the
 * author's own. `extraFrom` are further recipes whose values also count as
 * the style's own (the legacy gallery's, for a document that had none).
 */
export function restyleBlock(
  tr: Transaction,
  pos: number,
  from: readonly DocumentStyleRecipe[],
  to: DocumentStyleRecipe,
): void {
  const node = tr.doc.nodeAt(pos);
  if (!node) return;
  const schema = tr.doc.type.schema;

  // Paragraph attributes.
  const next = recipeParagraphAttrs(to);
  const previous = from.map(recipeParagraphAttrs);
  const attrs: Record<string, unknown> = { ...node.attrs };
  let changed = false;
  for (const field of Object.keys(next) as ParagraphField[]) {
    if (!(field in node.attrs)) continue;
    const current = node.attrs[field];
    const own =
      current === null ||
      current === undefined ||
      previous.some((recipe) => sameValue(current, recipe[field]));
    if (!own || sameValue(current, next[field])) continue;
    attrs[field] = next[field] ?? null;
    if (field === "paragraphBorders") attrs.borderPreset = null;
    if (field === "lineHeight") {
      attrs.lineHeightPt = null;
      attrs.lineHeightRule = null;
    }
    changed = true;
  }
  if (changed) tr.setNodeMarkup(pos, undefined, attrs);

  // Run marks, text node by text node.
  const start = pos + 1;
  const content = tr.doc.nodeAt(pos)!;
  const ranges: { from: number; to: number; marks: readonly Mark[] }[] = [];
  content.descendants((child, offset) => {
    if (child.isText) {
      ranges.push({ from: start + offset, to: start + offset + child.nodeSize, marks: child.marks });
    }
    return !child.isTextblock || child === content;
  });
  for (const name of RUN_MARKS) {
    const type = schema.marks[name];
    if (!type) continue;
    const value = recipeMarkValue(to.run, name);
    const olds = from.map((recipe) => recipeMarkValue(recipe.run, name));
    for (const range of ranges) {
      const mark = range.marks.find((candidate) => candidate.type === type);
      const own = mark ? olds.some((old) => markMatches(mark, name, old)) : true;
      if (!own) continue;
      if (mark && value !== null && markMatches(mark, name, value)) continue;
      if (!mark && value === null) continue;
      if (mark) tr.removeMark(range.from, range.to, type);
      if (value !== null) tr.addMark(range.from, range.to, createMark(type, value));
    }
  }
}

/**
 * Restyle the whole document from one design to the next, in `tr`: the
 * document defaults (Normal) become the new design's, and every gallery-
 * styled paragraph swaps its style formatting. Headings that never wore a
 * gallery style take theirs and say so (`builtinStyleId`), so the editor's
 * own bold heading face gives way to Word's.
 */
export function restyleDocumentDesign(
  tr: Transaction,
  previous: DocumentDesign | null,
  next: DocumentDesign,
  themeAxes?: readonly DocumentThemeAxis[],
  paragraphSpacingOnly = false,
): Transaction | null {
  const doc = tr.doc;
  const base = documentDesignBase(next);
  // Word's style sets not here yet: nothing is written (the command refuses).
  if (!base) return null;
  tr.setDocAttribute("documentDesign", { ...next });
  if (paragraphSpacingOnly && documentKeepsOwnStyles(doc)) {
    // Design > Paragraph Spacing in a Word document: Word writes the spacing
    // into the document's default paragraph formatting and nothing else --
    // the theme, the fonts and every style stay. Each paragraph that takes
    // its spacing from there (its style chain reaches Normal without a style
    // stating it, and it states none of its own) reflows; a style's own
    // spacing and a paragraph's direct spacing stay (Microsoft Support,
    // "Change spacing between paragraphs"; ECMA-376 17.7.2). An imported
    // paragraph carries its resolved spacing, so the cascade over the
    // document's style graph tells inherited from direct, as Set As Default
    // does (R478-D68 WALK1: the page kept 1.15 / 10 pt where the file and
    // Word draw Double).
    setParagraphFormatAsDocumentDefault(tr, {
      spaceBeforePt: base.defaultParagraphSpaceBefore,
      spaceAfterPt: base.defaultParagraphSpaceAfter,
      lineSpacing: { rule: "multiple", multiple: Number(base.defaultLineHeight) },
    });
    return tr;
  }
  if (themeAxes && documentKeepsOwnStyles(doc) && !documentWearsDesignBase(doc, previous)) {
    // An imported document keeps its own styles (styles.xml): Word's Colors,
    // Fonts, Effects and Themes change only the theme part, never the
    // document defaults' spacing or a style's definition (that is the style
    // set's and Paragraph Spacing's work). Body text that follows the theme's
    // body font takes the new one; text coloured from the theme takes the
    // new colours. The rest stays as the document has it.
    if (themeAxes.includes("fonts")) tr.setDocAttribute("defaultFontFamily", base.defaultFontFamily);
    if (themeAxes.includes("colors")) {
      if (doc.attrs.designColorSet != null) tr.setDocAttribute("designColorSet", null);
      if (doc.attrs.documentThemeColors != null) tr.setDocAttribute("documentThemeColors", null);
      recolorThemeTextColors(tr, next);
    }
    return tr;
  }
  for (const [key, value] of Object.entries(base)) tr.setDocAttribute(key, value);
  // The design's theme is the document's theme from now on: the Design tab's
  // older colour sets and an imported theme give way, as Word's theme part does.
  if (doc.attrs.designColorSet != null) tr.setDocAttribute("designColorSet", null);
  if (doc.attrs.documentThemeColors != null) tr.setDocAttribute("documentThemeColors", null);

  const importedStyles = previous ? importedQuickStyles(doc) : undefined;
  const targets: { pos: number; id: WordQuickStyleId }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const id = galleryStyleOfBlock(node, importedStyles);
    if (id) targets.push({ pos, id });
    return false;
  });
  for (const { pos, id } of targets) {
    const mapped = tr.mapping.map(pos);
    const target = documentStyleRecipeFor(doc, next, id);
    const recipes = [documentStyleRecipeFor(doc, previous, id)].filter(
      (recipe): recipe is DocumentStyleRecipe => recipe !== null,
    );
    if (previous) recipes.push(legacyGalleryRecipe(doc, id));
    if (!target) return null;
    restyleBlock(tr, mapped, recipes, target);
    const node = tr.doc.nodeAt(mapped);
    if (node?.type.name === "heading" && !node.attrs.docxStyleId && node.attrs.builtinStyleId !== id) {
      tr.setNodeMarkup(mapped, undefined, { ...node.attrs, builtinStyleId: id });
    }
  }
  recolorThemeTextColors(tr, next);
  return tr;
}

/** Whether a block still wears `recipe` wherever it differs from `served`
 * (each paragraph attribute and run mark the two disagree on), so nothing
 * the author set by hand is mistaken for it; false when they never differ. */
function blockWearsRecipe(node: ProseMirrorNode, recipe: DocumentStyleRecipe, served: DocumentStyleRecipe): boolean {
  let differs = false;
  const mine = recipeParagraphAttrs(recipe);
  const theirs = recipeParagraphAttrs(served);
  for (const field of Object.keys(mine) as ParagraphField[]) {
    if (!(field in node.attrs) || sameValue(mine[field], theirs[field]) || (mine[field] == null && theirs[field] == null)) continue;
    differs = true;
    const current = node.attrs[field];
    if (mine[field] == null ? current != null : !sameValue(current, mine[field])) return false;
  }
  const schema = node.type.schema;
  let wears = true;
  node.descendants((child) => {
    if (!wears || !child.isText) return wears;
    for (const name of RUN_MARKS) {
      const type = schema.marks[name];
      if (!type) continue;
      const value = recipeMarkValue(recipe.run, name);
      const other = recipeMarkValue(served.run, name);
      if (JSON.stringify(value) === JSON.stringify(other)) continue;
      differs = true;
      const mark = child.marks.find((candidate) => candidate.type === type);
      if (value === null ? Boolean(mark) : !mark || !markMatches(mark, name, value)) {
        wears = false;
        return false;
      }
    }
    return false;
  });
  return wears && differs;
}











export function restyleFromRecipeStyleSets(tr: Transaction): Transaction | null {
  if (!wordStyleSetsServed()) return null;
  const doc = tr.doc;
  const design = documentDesignOfDoc(doc);
  if (!design) return null;
  let changed = false;

  const served = documentDesignBase(design);
  const recipe = withRecipeWordStyleSets(() => documentDesignBase(design));
  if (served && recipe) {
    const differing = (Object.keys(served) as (keyof typeof served)[]).filter(
      (key) => !sameValue(served[key], recipe[key]) && !(served[key] == null && recipe[key] == null),
    );
    const wearsRecipe =
      differing.length > 0 &&
      differing.every((key) => (recipe[key] == null ? doc.attrs[key] == null : sameValue(doc.attrs[key], recipe[key])));
    if (wearsRecipe) {
      for (const key of differing) tr.setDocAttribute(key, served[key] ?? null);
      changed = true;
    }
  }

  const importedStyles = importedQuickStyles(doc);
  const targets: { pos: number; id: WordQuickStyleId }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const id = galleryStyleOfBlock(node, importedStyles);
    if (id) targets.push({ pos, id });
    return false;
  });
  for (const { pos, id } of targets) {
    const target = documentDesignStyleRecipe(design, id);
    const from = withRecipeWordStyleSets(() => documentDesignStyleRecipe(design, id));
    const node = doc.nodeAt(pos);
    if (!target || !from || !node || !blockWearsRecipe(node, from, target)) continue;
    restyleBlock(tr, tr.mapping.map(pos), [from], target);
    changed = true;
  }
  return changed ? tr : null;
}

/**
 * Text coloured from a theme swatch follows the theme, as Word's
 * `w:themeColor` runs do: its colour becomes the reference's value under
 * the new theme. A literal colour stays.
 */
export function recolorThemeTextColors(tr: Transaction, design: DocumentDesign): void {
  const type = tr.doc.type.schema.marks.textColor;
  if (!type) return;
  const colors = documentDesignColors(design);
  const changes: { from: number; to: number; mark: Mark }[] = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((candidate) => candidate.type === type);
    const ref = normalizeTextThemeColor(mark?.attrs.themeColor);
    if (!mark || !ref) return false;
    const [name, kind, byte] = ref.split(":");
    const color = wordThemeColorHex(
      colors,
      name,
      kind === "tint" ? byte : undefined,
      kind === "shade" ? byte : undefined,
    );
    if (color && color !== String(mark.attrs.color).toLowerCase()) {
      changes.push({ from: pos, to: pos + node.nodeSize, mark: type.create({ ...mark.attrs, color }) });
    }
    return false;
  });
  for (const { from, to, mark } of changes) {
    tr.removeMark(from, to, type);
    tr.addMark(from, to, mark);
  }
}
