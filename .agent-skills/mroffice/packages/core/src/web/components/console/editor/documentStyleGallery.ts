/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/react";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { DocumentParagraphBorders } from "../../../lib/document-borders";
import type { DocumentDesign } from "../../../lib/document-design";
import { loadWordStyleSets, wordQuickStyleIdForName, type WordQuickStyleId } from "../../../lib/office-word-style-sets";
import { normalizeBuiltinParagraphStyleId } from "./extensions/DocumentFormatting";
import { officePrimaryFontFamily } from "../../office-ribbon/officeTypographyCatalog";
import {
  normalizeCharacterStyle,
  normalizeFontFamily,
  normalizeFontSize,
} from "./extensions/TextStyling";

import { retypeSelectedTextBlocksInTransaction } from "./native-document/blockIds";
import {
  documentDesignOfDoc,
  documentStyleRecipeFor,
  galleryStyleOfBlock,
} from "./native-document/documentDesignRestyle";
import {
  defaultParagraphStyleId,
  paragraphStyleRunLook,
  restyleJoinedRuns,
} from "./native-document/joinedParagraphStyleRuns";
import { normalizeListChain } from "./native-document/listDefinitionMarkers";
import {
  bulletListDefinition,
  normalizeListDefinition,
} from "./native-document/listLevelDefinition";
import { normalizeListStart } from "./native-document/listNumbering";
import {
  PARAGRAPH_MARK_MARKS_ATTR,
  normalizeParagraphMarkMarks,
} from "./native-document/paragraphMarkTyping";

/**
 * The recommended styles Word exposes in Home > Styles.  The order mirrors the
 * desktop gallery: paragraph styles establish document structure, character
 * styles add reusable emphasis without changing the surrounding paragraph.
 */
export type DocumentBuiltinStyleId =
  | "normal"
  | "noSpacing"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "title"
  | "subtitle"
  | "subtleEmphasis"
  | "emphasis"
  | "intenseEmphasis"
  | "strong"
  | "quote"
  | "intenseQuote"
  | "subtleReference"
  | "intenseReference"
  | "bookTitle"
  | "listParagraph";

export type DocumentBuiltinStyleKind = "paragraph" | "character";

export interface DocumentBuiltinStyle {
  id: DocumentBuiltinStyleId;
  kind: DocumentBuiltinStyleKind;
  labelKey: string;
  sample: string;
}

export const DOCUMENT_BUILTIN_STYLE_GALLERY: readonly DocumentBuiltinStyle[] = [
  {
    id: "normal",
    kind: "paragraph",
    labelKey: "toolbar.style_normal",
    sample: "AaBbCcDdEe",
  },
  {
    id: "noSpacing",
    kind: "paragraph",
    labelKey: "toolbar.style_noSpacing",
    sample: "AaBbCcDdEe",
  },
  {
    id: "heading1",
    kind: "paragraph",
    labelKey: "toolbar.heading1",
    sample: "AaBbCc",
  },
  {
    id: "heading2",
    kind: "paragraph",
    labelKey: "toolbar.heading2",
    sample: "AaBbCc",
  },
  { id: "heading3", kind: "paragraph", labelKey: "toolbar.heading3", sample: "AaBbCc" },
  { id: "heading4", kind: "paragraph", labelKey: "toolbar.heading4", sample: "AaBbCc" },
  { id: "heading5", kind: "paragraph", labelKey: "toolbar.heading5", sample: "AaBbCc" },
  { id: "heading6", kind: "paragraph", labelKey: "toolbar.heading6", sample: "AaBbCc" },
  {
    id: "title",
    kind: "paragraph",
    labelKey: "toolbar.style_title",
    sample: "AaBb",
  },
  {
    id: "subtitle",
    kind: "paragraph",
    labelKey: "toolbar.style_subtitle",
    sample: "AaBbCcDd",
  },
  {
    id: "subtleEmphasis",
    kind: "character",
    labelKey: "toolbar.style_subtleEmphasis",
    sample: "AaBbCcDdEe",
  },
  {
    id: "emphasis",
    kind: "character",
    labelKey: "toolbar.style_emphasis",
    sample: "AaBbCcDdEe",
  },
  {
    id: "intenseEmphasis",
    kind: "character",
    labelKey: "toolbar.style_intenseEmphasis",
    sample: "AaBbCcDdEe",
  },
  {
    id: "strong",
    kind: "character",
    labelKey: "toolbar.style_strong",
    sample: "AaBbCcDdEe",
  },
  {
    id: "quote",
    kind: "paragraph",
    labelKey: "toolbar.quote",
    sample: "AaBbCcDdEe",
  },
  {
    id: "intenseQuote",
    kind: "paragraph",
    labelKey: "toolbar.style_intenseQuote",
    sample: "AaBbCcDdEe",
  },
  {
    id: "subtleReference",
    kind: "character",
    labelKey: "toolbar.style_subtleReference",
    sample: "AABBCCDDEE",
  },
  {
    id: "intenseReference",
    kind: "character",
    labelKey: "toolbar.style_intenseReference",
    sample: "AABBCCDDEE",
  },
  {
    id: "bookTitle",
    kind: "character",
    labelKey: "toolbar.style_bookTitle",
    sample: "AaBbCcDdEe",
  },
  {
    id: "listParagraph",
    kind: "paragraph",
    labelKey: "toolbar.style_listParagraph",
    sample: "1. AaBbCc",
  },
] as const;

interface DocumentStyleChain {
  command: (
    apply: (props: { tr: Transaction }) => boolean,
  ) => DocumentStyleChain;
  focus: () => DocumentStyleChain;
  liftListItem: (typeOrName: string) => DocumentStyleChain;
  clearCustomParagraphStyle: () => DocumentStyleChain;
  clearTextStyles: () => DocumentStyleChain;
  setBlockquote: () => DocumentStyleChain;
  unsetBlockquote: () => DocumentStyleChain;
  setFontSize: (size: string) => DocumentStyleChain;
  unsetFontSize: () => DocumentStyleChain;
  setTextColor: (color: string) => DocumentStyleChain;
  unsetTextColor: () => DocumentStyleChain;
  setCharacterStyle: (name: string) => DocumentStyleChain;
  unsetCharacterStyle: () => DocumentStyleChain;
  setMark: (name: string) => DocumentStyleChain;
  unsetMark: (name: string) => DocumentStyleChain;
  setTextAlign: (
    align: "left" | "center" | "right" | "justify" | "distribute",
  ) => DocumentStyleChain;
  unsetTextAlign: () => DocumentStyleChain;
  setLineHeight: (value: string | number | null) => DocumentStyleChain;
  unsetLineHeight: () => DocumentStyleChain;
  setSpaceBefore: (value: string | number | null) => DocumentStyleChain;
  setSpaceAfter: (value: string | number | null) => DocumentStyleChain;
  setParagraphIndents: (value: {
    indentLeftPt?: string | number | null;
    indentRightPt?: string | number | null;
    firstLineIndentPt?: string | number | null;
  }) => DocumentStyleChain;
  setParagraphBorder: (
    value: "box" | "bottom" | "left" | null,
  ) => DocumentStyleChain;
  /** Exact per-edge borders (Intense Quote's top/bottom rules); null clears. */
  setParagraphBorders: (
    value: DocumentParagraphBorders | null,
  ) => DocumentStyleChain;
  setParagraphShading: (value: string | null) => DocumentStyleChain;
  unsetCharSpacing: () => DocumentStyleChain;
  setKeepNext: (value: boolean | null) => DocumentStyleChain;
  setKeepLines: (value: boolean | null) => DocumentStyleChain;
  setContextualSpacing: (value: boolean | null) => DocumentStyleChain;
  run: () => boolean;
}

export interface DocumentStyleRuntime {
  editor: Editor;
  chain: () => DocumentStyleChain;
}

/** Remove only formatting introduced by this gallery, not unrelated direct marks. */
function resetGalleryInline(chain: DocumentStyleChain): DocumentStyleChain {
  return chain
    .unsetCharacterStyle()
    .unsetFontSize()
    .unsetTextColor()
    .unsetCharSpacing()
    .unsetMark("allCaps")
    .unsetMark("smallCaps");
}

function resetParagraphDecorations(
  chain: DocumentStyleChain,
): DocumentStyleChain {
  return chain
    .unsetTextAlign()
    .unsetLineHeight()
    .setSpaceBefore(null)
    .setSpaceAfter(null)
    .setParagraphIndents({
      indentLeftPt: null,
      indentRightPt: null,
      firstLineIndentPt: null,
    })
    .setParagraphBorder(null)
    .setParagraphBorders(null)
    .setParagraphShading(null)
    .setKeepNext(null)
    .setKeepLines(null)
    .setContextualSpacing(null);
}

/** Word's theme colours the built-in styles paint with (Office theme). */
export const DOCUMENT_WORD_STYLE_ACCENT = "#0f4761";
export const DOCUMENT_WORD_STYLE_SUBTLE_TEXT = "#595959";
export const DOCUMENT_WORD_STYLE_QUOTE_TEXT = "#404040";

/**
 * Apply one recommended style through real editor commands.  Heading styles
 * stay structural heading nodes (so navigation and TOC consumers keep working);
 * character styles use the named character-style mark; the remaining paragraph
 * styles are deterministic bundles until the server style-definition model is
 * available.
 */
function applyBuiltinCharacterStyle(
  runtime: DocumentStyleRuntime,
  id: DocumentBuiltinStyleId,
): void {
  // Each one is a real character style (Word's Subtle Emphasis … Book Title),
  // painted by characterStyleCss and exported as its own <w:rStyle>.
  switch (id) {
    case "subtleEmphasis":
    case "emphasis":
    case "intenseEmphasis":
    case "strong":
    case "subtleReference":
    case "intenseReference":
    case "bookTitle":
      resetGalleryInline(runtime.chain()).setCharacterStyle(id).run();
  }
}
/** Paragraph styles own the whole paragraph, even when only a caret or a
 * few characters are selected. Inline commands alone only update stored marks
 * in an empty selection, leaving the existing paragraph's old typography. */
/**
 * Take a gallery style off the selection: a paragraph style returns the
 * paragraphs to Normal, a character style clears the gallery run formatting
 * it set (its character style, size, colour and all caps).
 */
export function removeDocumentBuiltinStyle(
  runtime: DocumentStyleRuntime,
  id: DocumentBuiltinStyleId,
): void {
  if (!runtime.editor.isEditable) return;
  if (
    DOCUMENT_BUILTIN_STYLE_GALLERY.find((style) => style.id === id)?.kind ===
    "paragraph"
  ) {
    applyDocumentBuiltinStyle(runtime, "normal");
    return;
  }
  resetGalleryInline(runtime.chain()).run();
}







export const DOCUMENT_BUILTIN_STYLE_FONT_SIZE: Readonly<Record<string, string>> = {
  // Word's Normal template (Office theme): Heading 1–5 = 24/20/16/14/12pt,
  // Heading 6 = the body size (11pt) in bold, Title 28pt, Subtitle 14pt.
  heading1: "32px",
  heading2: "26.67px",
  heading3: "21.33px",
  heading4: "18.67px",
  heading5: "16px",
  heading6: "14.67px",
  title: "37.33px",
  subtitle: "18.67px",
};

export function applyDocumentBuiltinStyle(
  runtime: DocumentStyleRuntime,
  id: DocumentBuiltinStyleId,
): void {
  if (!runtime.editor.isEditable) return;
  if (
    DOCUMENT_BUILTIN_STYLE_GALLERY.find((style) => style.id === id)?.kind !==
    "paragraph"
  ) {
    applyBuiltinCharacterStyle(runtime, id);
    return;
  }
  const { state } = runtime.editor;
  // The document's design decides what the style looks like: its fonts,
  // sizes, colours and spacing (lib/document-design.ts).
  const design = documentDesignOfDoc(state.doc);
  const recipe = documentStyleRecipeFor(state.doc, design, id as WordQuickStyleId);
  // A designed document's styles come from Word's style sets (served Office
  // data): until they are here the style is not applied rather than guessed.
  if (!recipe) {
    void loadWordStyleSets();
    return;
  }
  const isHeading = /^heading[1-6]$/.test(id);
  // A list item holds paragraphs only, so turning a listed paragraph into a
  // heading must lift it out of its list(s) first; setNodeMarkup inside the
  // item would throw "Invalid content for node listItem" and apply nothing.
  // Word keeps the numbering on the heading, counted where it sits: the
  // heading carries the list's kind, style, definition and level, and joins
  // the list's numbering instance (listChain) together with the part of the
  // list after it. Innermost item first, one lift each.
  // Every listed paragraph of the selection is lifted, not only the one the
  // selection starts in: from a plain paragraph into a list, the items after
  // it were set to headings inside their items and the whole command threw
  
  const listed = isHeading ? listedParagraphsToCarry(state) : [];
  let chain = runtime.chain();
  const roots = new Map<number, string>();
  for (const entry of listed) {
    if (entry.carry.rootPos != null && entry.carry.chain) roots.set(entry.carry.rootPos, entry.carry.chain);
  }
  if (roots.size) {
    chain = chain.command(({ tr }) => {
      for (const [rootPos, chainId] of roots) {
        const root = tr.doc.nodeAt(rootPos);
        if (root?.type.name === "orderedList")
          tr.setNodeMarkup(rootPos, undefined, { ...root.attrs, listChain: chainId });
      }
      return true;
    });
  }
  if (listed.length) {
    const selection = state.selection;
    const whole = selection instanceof AllSelection;
    // Last first: a lift moves only what follows the paragraph it lifts.
    for (const entry of [...listed].reverse()) {
      for (const name of entry.items) {
        chain = chain
          .command(({ tr }) => {
            tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(entry.pos + 1)));
            return true;
          })
          .liftListItem(name);
      }
    }
    chain = chain.command(({ tr }) => {
      tr.setSelection(
        whole
          ? new AllSelection(tr.doc)
          : TextSelection.create(tr.doc, tr.mapping.map(selection.from), tr.mapping.map(selection.to)),
      );
      return true;
    });
  }
  chain = chain.command(({ tr }) => {
    closeHistory(tr);
    const type = tr.doc.type.schema.nodes[isHeading ? "heading" : "paragraph"];
    if (!type) return false;
    const targets: { pos: number; attrs: Record<string, unknown>; carry: ListNumberingCarry | null }[] = [];
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading") return;
      // A list item opens with a paragraph; one the lift could not take out
      // keeps its type rather than failing the whole command.
      const $pos = tr.doc.resolve(pos);
      if (type.name === "heading" && ["listItem", "taskItem"].includes($pos.parent.type.name) && $pos.index() === 0) return;
      const carry = listed.find((entry) => tr.mapping.map(entry.pos) === pos)?.carry ?? null;
      targets.push({ pos, attrs: { ...node.attrs }, carry });
    });
    for (const { pos, attrs, carry } of targets) {
      // The run formatting each paragraph's own previous style wrote (a
      // Quote's italic) goes with it, paragraph by paragraph: one style read
      
      const node = tr.doc.nodeAt(pos);
      if (node) {
        for (const name of previousStyleRunMarks(tr.doc, design, node)) {
          const markType = tr.doc.type.schema.marks[name];
          if (markType) tr.removeMark(pos + 1, pos + 1 + node.content.size, markType);
        }
        // The toggles the previous gallery style's own document style gave
        // (cascadeDocumentOwnStyleToggles) go with it, as Word's Heading 2
        // underline does when the paragraph becomes Heading 1.
        const previousId = node.attrs.docxStyleId ? null : galleryStyleOfBlock(node);
        const previousRecipe = previousId ? documentStyleRecipeFor(tr.doc, design, previousId) : null;
        const previousLooks = previousId && previousRecipe
          ? documentOwnStyleToggleLooks(tr.doc.attrs as Record<string, unknown>, previousId, previousRecipe.run)
          : null;
        if (previousLooks) {
          restyleJoinedRuns(tr, tr.doc.type.schema, pos + 1, pos + 1 + node.content.size, previousLooks.styled, previousLooks.normal);
        }
        // An imported heading's runs say "bold as the style has it" (a bold
        // mark of value null, the page's reading of a heading run with no
        // w:b of its own). Made a paragraph of another style, the heading's
        // bold is no longer the style's, and the mark said nothing the file
        // keeps: it read back as none (corpus R485-D42 WALK1, a Heading 3
        // given No Spacing).
        // An imported paragraph's runs carry the look its own Word style
        // gave them (a heading's colour and size) as marks: in Word that look
        // goes with the style, and the gallery style draws over Normal's. The
        // marks that say the old style's value trade it for Normal's; a run's
        // own formatting stays (as a join does, joinedParagraphStyleRuns.ts;
        // corpus R485-D42 WALK1: a Heading 3's grey stayed on No Spacing and
        // the save wrote none).
        const docAttrs = tr.doc.attrs as Record<string, unknown>;
        const ownStyle = typeof node.attrs.docxStyleId === "string" ? node.attrs.docxStyleId : null;
        const normalStyle = defaultParagraphStyleId(docAttrs);
        if (ownStyle && normalStyle && ownStyle !== normalStyle) {
          const before = paragraphStyleRunLook(docAttrs, ownStyle);
          const after = paragraphStyleRunLook(docAttrs, normalStyle);
          if (before && after) restyleJoinedRuns(tr, tr.doc.type.schema, pos + 1, pos + 1 + node.content.size, before, after);
        }
        const bold = tr.doc.type.schema.marks.bold;
        if (bold && node.type.name === "heading" && type.name !== "heading") {
          node.descendants((child, offset) => {
            const inherit = child.marks.find((mark) => mark.type === bold && mark.attrs.value === null);
            if (inherit) tr.removeMark(pos + 1 + offset, pos + 1 + offset + child.nodeSize, inherit);
            return true;
          });
        }
      }
      if (type.name === "heading") {
        attrs.level = Number(id.slice(-1));
        if (carry) Object.assign(attrs, carry.headingAttrs);
      } else delete attrs.level;
      // The paragraph remembers which gallery style it wears (Normal and the
      // headings are the absence), so same-style spacing rules can tell a
      
      attrs.builtinStyleId = normalizeBuiltinParagraphStyleId(id);
      tr.setNodeMarkup(pos, type, attrs);
    }
    // The rest of the list keeps counting after the heading.
    for (const target of targets) {
      if (!target.carry?.chain) continue;
      const heading = tr.doc.nodeAt(target.pos);
      const next = heading
        ? tr.doc.resolve(target.pos + heading.nodeSize).nodeAfter
        : null;
      if (next?.type.name === "orderedList")
        tr.setNodeMarkup(target.pos + heading!.nodeSize, undefined, {
          ...next.attrs,
          listContinue: true,
          listChain: target.carry.chain,
          start: 1,
        });
    }
    return targets.length > 0;
  });
  resetGalleryInline(resetParagraphDecorations(chain))
    .unsetBlockquote()
    .clearCustomParagraphStyle();
  // The style's own formatting under the document's design (Word's style
  // set and theme; Word's Normal template under the Office theme for a
  // document the Design tab never touched), written on the paragraph.
  const { paragraph, run } = recipe;
  if (paragraph.spaceBeforePt !== null) chain.setSpaceBefore(paragraph.spaceBeforePt);
  if (paragraph.spaceAfterPt !== null) chain.setSpaceAfter(paragraph.spaceAfterPt);
  if (paragraph.lineHeight !== null) chain.setLineHeight(paragraph.lineHeight);
  if (paragraph.textAlign !== null) chain.setTextAlign(paragraph.textAlign);
  if (
    paragraph.indentLeftPt !== null ||
    paragraph.indentRightPt !== null ||
    paragraph.firstLineIndentPt !== null
  ) {
    chain.setParagraphIndents({
      indentLeftPt: paragraph.indentLeftPt,
      indentRightPt: paragraph.indentRightPt,
      firstLineIndentPt: paragraph.firstLineIndentPt,
    });
  }
  if (paragraph.borders) chain.setParagraphBorders(paragraph.borders);
  if (paragraph.shading) chain.setParagraphShading(paragraph.shading);
  if (paragraph.keepNext !== null) chain.setKeepNext(paragraph.keepNext);
  if (paragraph.keepLines !== null) chain.setKeepLines(paragraph.keepLines);
  if (paragraph.contextualSpacing !== null) chain.setContextualSpacing(paragraph.contextualSpacing);
  chain
    .command(({ tr }) =>
      applyDocumentParagraphTypography(tr, {
        fontFamily: run.fontFamily,
        fontCjkFamily: run.fontCjkFamily,
        fontSize: run.fontSize,
        textColor: run.textColor,
        italic: run.italic ?? undefined,
        bold: run.bold ?? undefined,
        charSpacingPt: run.charSpacingPt,
        smallCaps: run.smallCaps ?? undefined,
        allCaps: run.allCaps ?? undefined,
        underline: run.underline ?? undefined,
      }),
    )
    .command(({ tr }) => {
      cascadeDocumentOwnStyleToggles(tr, id as WordQuickStyleId, run);
      return true;
    })
    .run();
}

/**
 * `window.__docsGalleryOwnStyleCascadeOff = true` keeps the gallery's runs to
 * the recipe alone (the A/B arm before the cascade below).
 */
function galleryOwnStyleCascadeOff(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Window & { __docsGalleryOwnStyleCascadeOff?: boolean }).__docsGalleryOwnStyleCascadeOff === true
  );
}

/** The document's own paragraph style that Word's Quick Style `id` is (by
 *  its name, "heading 2" for Heading 2), as both DOCX writers pick it. */
function documentOwnQuickStyleId(docAttrs: Record<string, unknown>, id: WordQuickStyleId): string | null {
  const definitions = docAttrs.styleDefinitions as { styles?: unknown } | null | undefined;
  const styles = Array.isArray(definitions?.styles) ? definitions.styles : [];
  for (const style of styles) {
    if (!style || typeof style !== "object") continue;
    const row = style as { styleId?: unknown; name?: unknown; type?: unknown };
    if (row.type === "paragraph" && typeof row.styleId === "string" && wordQuickStyleIdForName(row.name) === id) {
      return row.styleId;
    }
  }
  return null;
}

/**
 * The toggles the paragraph's style gives in Word that the gallery does not
 * write. A document of its own styles is saved with its own style of the
 * gallery style's name (Word applies that one: an imported "heading 2" that
 * underlines, corpus R496-D05 LIVE L4), and the gallery writes the recipe's
 * face, size and colour on the runs, which win over the style, but a recipe
 * toggle that is off writes nothing: the style's underline, bold, italic or
 * raise showed in Word and not on the page. The runs take them as the
 * import states a style's toggles (a run's own differing value stays,
 * restyleJoinedRuns), traded from the document's Normal, which the
 * paragraph's runs wear at this point.
 */
type GalleryRunToggles = { bold: boolean | null; italic: boolean | null; underline: boolean | null };

/** The runs' look under the document's Normal, and with the toggles its own
 *  style of the gallery style's name adds over the recipe; null when the
 *  document has no such style (or the cascade is off). */
function documentOwnStyleToggleLooks(
  docAttrs: Record<string, unknown>,
  id: WordQuickStyleId,
  recipe: GalleryRunToggles,
) {
  if (galleryOwnStyleCascadeOff() || docAttrs.styleDefinitions == null) return null;
  const ownStyle = documentOwnQuickStyleId(docAttrs, id);
  const normalStyle = defaultParagraphStyleId(docAttrs);
  if (!ownStyle || !normalStyle || ownStyle === normalStyle) return null;
  const normal = paragraphStyleRunLook(docAttrs, normalStyle);
  const styleLook = paragraphStyleRunLook(docAttrs, ownStyle);
  if (!normal || !styleLook) return null;
  // Face, size and colour are the recipe's marks: not traded.
  const styled = {
    ...normal,
    bold: recipe.bold ? normal.bold : styleLook.bold,
    italic: recipe.italic ? normal.italic : styleLook.italic,
    underline: recipe.underline ? normal.underline : styleLook.underline,
    vertAlign: styleLook.vertAlign,
  };
  return { normal, styled };
}

function cascadeDocumentOwnStyleToggles(
  tr: Transaction,
  id: WordQuickStyleId,
  recipe: GalleryRunToggles,
): void {
  const looks = documentOwnStyleToggleLooks(tr.doc.attrs as Record<string, unknown>, id, recipe);
  if (!looks) return;
  const { normal: before, styled: after } = looks;
  const builtin = normalizeBuiltinParagraphStyleId(id);
  tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (!["paragraph", "heading"].includes(node.type.name) || node.attrs.builtinStyleId !== builtin) return false;
    restyleJoinedRuns(tr, tr.doc.type.schema, pos + 1, pos + 1 + node.content.size, before, after);
    return false;
  });
}

/**
 * The run formatting a block's current gallery style wrote (Word keeps it in
 * the style, the editor writes it as marks): taken off when the paragraph
 * takes another style, the way Word's Quote loses its italic when it becomes
 * Normal, while the author's own bold or italic on a Normal paragraph stays.
 */
function previousStyleRunMarks(
  doc: ProseMirrorNode,
  design: DocumentDesign | null,
  node: ProseMirrorNode,
): string[] {
  const id = galleryStyleOfBlock(node);
  if (!id) return [];
  const recipe = documentStyleRecipeFor(doc, design, id);
  if (!recipe) return [];
  const { run } = recipe;
  const names: string[] = [];
  if (run.fontFamily) names.push("fontFamily");
  if (run.fontCjkFamily) names.push("fontCjkFamily");
  if (run.fontSize) names.push("fontSize");
  if (run.textColor) names.push("textColor");
  if (run.italic) names.push("italic");
  if (run.bold) names.push("bold");
  if (run.charSpacingPt) names.push("charSpacing");
  if (run.smallCaps) names.push("smallCaps");
  if (run.allCaps) names.push("allCaps");
  if (run.underline) names.push("underline");
  return names;
}

/** Shared by recommended and user-created paragraph styles. */
export function applyDocumentParagraphTypography(
  tr: Transaction,
  typography: {
    fontFamily?: unknown;
    fontSize?: unknown;
    /** The run formatting a Word paragraph style carries (Quote's italic,
     * a heading's colour, Title's tracking): written on every run of the
     * paragraph, as Word's style would paint them. */
    textColor?: string | null;
    italic?: boolean;
    bold?: boolean;
    charSpacingPt?: number | null;
    /** The East Asian face, when the style names one apart from its Latin face. */
    fontCjkFamily?: unknown;
    smallCaps?: boolean;
    allCaps?: boolean;
    underline?: boolean;
    /** Marks the previous style wrote on the paragraph, taken off first. */
    clearMarks?: readonly string[];
  },
): boolean {
  const schema = tr.doc.type.schema;
  const normalizedFamily = normalizeFontFamily(typography.fontFamily);
  // Run formatting crosses both DOCX writers: carry a font name, not a CSS
  // fallback list that native Word would treat as one nonexistent typeface.
  const family = normalizedFamily ? officePrimaryFontFamily(normalizedFamily) : null;
  const normalizedCjkFamily = normalizeFontFamily(typography.fontCjkFamily);
  const cjkFamily = normalizedCjkFamily ? officePrimaryFontFamily(normalizedCjkFamily) : family;
  const size = normalizeFontSize(typography.fontSize);
  const marks = [
    family ? schema.marks.fontFamily?.create({ family }) : null,
    cjkFamily ? schema.marks.fontCjkFamily?.create({ family: cjkFamily }) : null,
    size ? schema.marks.fontSize?.create({ size }) : null,
    typography.textColor ? schema.marks.textColor?.create({ color: typography.textColor }) : null,
    typography.italic ? schema.marks.italic?.create() : null,
    typography.bold ? schema.marks.bold?.create() : null,
    typography.charSpacingPt
      ? schema.marks.charSpacing?.create({ spacing: typography.charSpacingPt })
      : null,
    typography.smallCaps ? schema.marks.smallCaps?.create() : null,
    typography.allCaps ? schema.marks.allCaps?.create() : null,
    typography.underline ? schema.marks.underline?.create() : null,
  ].filter((mark): mark is NonNullable<typeof mark> => Boolean(mark));
  const clear = (typography.clearMarks ?? [])
    .map((name) => schema.marks[name])
    .filter((type): type is NonNullable<typeof type> => Boolean(type));
  if (!marks.length && !clear.length) return true;
  tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (!["paragraph", "heading"].includes(node.type.name)) return false;
    const from = pos + 1,
      to = from + node.content.size;
    for (const type of clear) tr.removeMark(from, to, type);
    for (const mark of marks) {
      tr.removeMark(from, to, mark.type);
      tr.addMark(from, to, mark);
    }
    // A blank paragraph's own line: the size the style now gives it, and the
    // format text typed into it starts with, are this style's.
    const markMarks = normalizeParagraphMarkMarks(
      node.attrs[PARAGRAPH_MARK_MARKS_ATTR],
    );
    if ((size && node.attrs.paragraphFontSize != null) || markMarks) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...(size && node.attrs.paragraphFontSize != null
          ? { paragraphFontSize: null }
          : {}),
        ...(markMarks
          ? {
              [PARAGRAPH_MARK_MARKS_ATTR]: [
                ...markMarks.filter(
                  (mark) => !marks.some((applied) => applied.type.name === mark.type),
                ),
                ...marks.map((mark) => ({ type: mark.type.name, attrs: { ...mark.attrs } })),
              ],
            }
          : {}),
      });
    }
    return false;
  });
  if (tr.selection.empty) {
    let stored = tr.storedMarks ?? tr.selection.$from.marks();
    for (const mark of marks)
      stored = mark.addToSet(mark.type.removeFromSet(stored));
    tr.setStoredMarks(stored);
  }
  return true;
}

/** Word's gallery footer: clear character styling and return the block to Normal. */
export function clearDocumentStyleFormatting(
  runtime: DocumentStyleRuntime,
): void {
  // Word's Clear All Formatting, measured: the paragraph returns to Normal
  // (a heading too), its alignment, indents, spacing and line spacing go,
  // the highlighter stays, and it is one undo step. So it is one chain: the
  // heading is retyped in the chain's own transaction, and clearTextStyles
  // runs last, when the transaction has already changed the document, so
  // its "nothing to clear" never stops the dispatch.
  resetParagraphDecorations(
    runtime
      .chain()
      .command(({ tr }) => retypeSelectedTextBlocksInTransaction(tr, "paragraph")),
  )
    .unsetBlockquote()
    .clearCustomParagraphStyle()
    .clearTextStyles()
    .run();
}

export interface DocumentStyleProbe {
  blockStyle: "paragraph" | "heading1" | "heading2" | "quote" | string;
  paragraphStyle?: string | null;
  characterStyle?: string | null;
  fontSize?: string | null;
  textColor?: string | null;
  textAlign?: string | null;
  indentLeftPt?: number | null;
  firstLineIndentPt?: number | null;
  lineHeight?: string | null;
  spaceBefore?: number;
  spaceAfter?: number;
  allCaps?: boolean;
  /** The gallery paragraph style the paragraph says it wears (`builtinStyleId`). */
  builtinStyleId?: string | null;
}

/** Best-effort active-card detection from the editor's durable formatting state. */
export function detectDocumentBuiltinStyle(
  probe: DocumentStyleProbe,
): DocumentBuiltinStyleId {
  // A character style on the selection names itself (Word shows the
  // character style over the paragraph style in the gallery).
  const characterStyle = normalizeCharacterStyle(probe.characterStyle);
  if (characterStyle && characterStyle !== "code") return characterStyle;
  // A paragraph that says which gallery style it wears is that style; the
  // headings are their node type.
  const builtin = normalizeBuiltinParagraphStyleId(probe.builtinStyleId);
  if (builtin && !/^heading[1-6]$/.test(builtin)) return builtin as DocumentBuiltinStyleId;
  if (probe.blockStyle === "quote") return "quote";
  if (probe.paragraphStyle === "title") return "title";
  if (probe.blockStyle === "heading1") return "heading1";
  if (/^heading[2-6]$/.test(probe.blockStyle)) return probe.blockStyle as DocumentBuiltinStyleId;
  if (
    probe.spaceBefore === 0 &&
    probe.spaceAfter === 0 &&
    probe.lineHeight === "1"
  ) {
    return "noSpacing";
  }
  return "normal";
}

/**
 * The numbering a listed paragraph keeps when it becomes a heading (Word keeps
 * the paragraph in its list): kind, style / definition and level for the
 * heading, plus the numbering instance it joins so the heading and the rest
 * of the list keep counting where it sits. Null outside a list.
 */
interface ListNumberingCarry {
  headingAttrs: Record<string, unknown>;
  chain: string | null;
  rootPos: number | null;
}

export function listNumberingToCarry(state: EditorState): ListNumberingCarry | null {
  return listNumberingToCarryAt(state.selection.$from);
}

/** The listed paragraphs of the selection (outside table cells), each with
 * its list items innermost first and the numbering it carries; the items of
 * one numbering share one chain. */
function listedParagraphsToCarry(state: EditorState): Array<{
  pos: number;
  items: string[];
  carry: ListNumberingCarry;
}> {
  const out: Array<{ pos: number; items: string[]; carry: ListNumberingCarry }> = [];
  const chains = new Map<number, string>();
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "paragraph" && node.type.name !== "heading") return true;
    const $pos = state.doc.resolve(pos + 1);
    const items: string[] = [];
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const name = $pos.node(depth).type.name;
      if (name === "tableCell" || name === "tableHeader") break;
      if (name === "listItem" || name === "taskItem") items.push(name);
    }
    if (!items.length) return false;
    const carry = listNumberingToCarryAt($pos, chains) ?? { headingAttrs: {}, chain: null, rootPos: null };
    out.push({ pos, items, carry });
    return false;
  });
  return out;
}

function listNumberingToCarryAt(
  $from: ResolvedPos,
  chains: Map<number, string> = new Map(),
): ListNumberingCarry | null {
  const lists: { depth: number; name: string }[] = [];
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") break;
    if (name === "orderedList" || name === "bulletList" || name === "taskList")
      lists.push({ depth, name });
  }
  if (!lists.length) return null;
  const innermost = lists[0];
  const level = Math.min(lists.length - 1, 8);
  if (innermost.name === "taskList") return null;
  if (innermost.name === "bulletList") {
    const list = $from.node(innermost.depth);
    const glyph = list.attrs.bulletGlyph;
    return {
      headingAttrs: {
        listKind: "bullet",
        listLevel: level,
        listStyle: list.attrs.bulletStyle ?? null,
        listDefinition:
          typeof glyph === "string" && glyph
            ? bulletListDefinition(
                glyph,
                typeof list.attrs.bulletFont === "string" ? list.attrs.bulletFont : null,
              )
            : null,
        listStart: null,
        listContinue: false,
        listChain: null,
      },
      chain: null,
      rootPos: null,
    };
  }
  // Ordered: the numbering root is the outermost ordered list.
  const rootEntry =
    [...lists].reverse().find((entry) => entry.name === "orderedList") ?? innermost;
  const root = $from.node(rootEntry.depth);
  const rootPos = $from.before(rootEntry.depth);
  const chain =
    normalizeListChain(root.attrs.listChain) ??
    chains.get(rootPos) ??
    `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  chains.set(rootPos, chain);
  // Is anything counted before this item in its numbering instance?
  let first = true;
  for (let depth = rootEntry.depth; depth <= $from.depth; depth += 1) {
    const name = $from.node(depth).type.name;
    if ((name === "orderedList" || name === "listItem") && $from.index(depth) > 0) {
      first = false;
      break;
    }
  }
  const joinsPrevious = !first || root.attrs.listContinue === true;
  return {
    headingAttrs: {
      listKind: "ordered",
      listLevel: level,
      listStyle: root.attrs.listStyleType ?? null,
      listDefinition: normalizeListDefinition(root.attrs.listDefinition),
      listStart: joinsPrevious ? null : normalizeListStart(root.attrs.start),
      listContinue: joinsPrevious,
      listChain: chain,
    },
    chain,
    rootPos,
  };
}
