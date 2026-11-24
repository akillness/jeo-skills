/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

import type { OfficeRibbonCommandGate } from "@mrnote/core/web/components/office-ribbon/officeRibbonCommandGate.tsx";
import { selectionGateFromEntries } from "@mrnote/core/web/components/office-ribbon/officeRibbonSelectionGate.ts";
import { documentShapeSmartArtIdentity } from "@mrnote/core/web/lib/document-shapes.ts";
import { FLOAT_SELECTION_INSERT_GATED } from "@mrnote/core/web/components/console/editor/native-document/floatInsertionPoint.ts";

/** The kinds of object a selection can be, as the gate tells them apart. */
export type SelectedStructure =
  | "equation"
  | "inlineEquation"
  | "picture"
  | "inlinePicture"
  | "media"
  | "chart"
  | "shape"
  | "shapeGroup"
  | "ink"
  | "smartArt"
  | "break"
  | "object"
  | "tableCells";

const STRUCTURE_OF_NODE: Record<string, SelectedStructure> = {
  mathBlock: "equation",
  inlineMath: "inlineEquation",
  image: "picture",
  inlineImage: "inlinePicture",
  documentMedia: "media",
  chart: "chart",
  inlineChart: "chart",
  documentShape: "shape",
  inlineDocumentShape: "shape",
  smartArt: "smartArt",
  pageBreak: "break",
  columnBreak: "break",
  sectionBreak: "break",
  sourcePageBreak: "break",
  horizontalRule: "break",
};

/** The object the selection is, or null when it is text (or nothing). */
export function selectedStructureOf(
  state: EditorState,
): SelectedStructure | null {
  const { selection } = state;
  if (selection instanceof CellSelection) return "tableCells";
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (node.isTextblock || node.isText) return null;
  const known = STRUCTURE_OF_NODE[node.type.name];
  if (known) {
    // A SmartArt diagram inserted from the ribbon is a documentShape group.
    if (known === "shape" && documentShapeSmartArtIdentity(node.attrs)) {
      return "smartArt";
    }
    // Home formats a shape's own text; an ink stroke has none and a group
    // keeps its text in its members.
    if (known === "shape" && node.attrs.inkTool) return "ink";
    if (
      known === "shape" &&
      Array.isArray(node.attrs.groupMembers) &&
      node.attrs.groupMembers.length > 0
    ) {
      return "shapeGroup";
    }
    return known;
  }
  return node.isAtom || node.isLeaf ? "object" : null;
}

const STRUCTURE_REASON_KEY: Record<SelectedStructure, string> = {
  equation: "toolbar.selectionGate.equation",
  inlineEquation: "toolbar.selectionGate.equation",
  picture: "toolbar.selectionGate.picture",
  inlinePicture: "toolbar.selectionGate.picture",
  media: "toolbar.selectionGate.object",
  chart: "toolbar.selectionGate.chart",
  shape: "toolbar.selectionGate.shape",
  shapeGroup: "toolbar.selectionGate.group",
  ink: "toolbar.selectionGate.ink",
  smartArt: "toolbar.selectionGate.smartArt",
  break: "toolbar.selectionGate.break",
  object: "toolbar.selectionGate.object",
  tableCells: "toolbar.selectionGate.cells",
};

/**
 * Test ids of the Home commands that have no meaning for each object, as
 * measured. A prefix entry ending in "-" covers a menu's every item.
 */
const HOME = "document-toolbar-";
/** Character formatting: marks an atom cannot carry. */
const CHARACTER_FORMATTING = [
  `${HOME}bold`,
  `${HOME}italic`,
  `${HOME}underline`,
  `${HOME}underline-menu`,
  `${HOME}underline-style-`,
  `${HOME}underline-color-`,
  `${HOME}strike`,
  `${HOME}subscript`,
  `${HOME}superscript`,
  `${HOME}char-border`,
  `${HOME}char-shading`,
  `${HOME}highlight`,
  `${HOME}highlight-menu`,
  `${HOME}text-color`,
  `${HOME}text-color-menu`,
  `${HOME}change-case`,
  `${HOME}change-case-`,
  `${HOME}text-effects`,
  `${HOME}text-effect-`,
  `${HOME}opentype-`,
  `${HOME}enclosed-char`,
  `${HOME}enclosed-char-`,
  `${HOME}ruby-guide`,
  `${HOME}east-asian-layout`,
  `${HOME}eal-`,
  `${HOME}font-family`,
  `${HOME}font-family-`,
];
/** Font size: the ribbon box, its presets and Grow / Shrink Font. */
const FONT_SIZE = [
  `${HOME}font-size`,
  `${HOME}font-size-options`,
  `${HOME}font-size-option-`,
  `${HOME}grow-font`,
  `${HOME}shrink-font`,
];
/** Paragraph structure: lists, indents, direction, direct spacing, shading. */
const PARAGRAPH_STRUCTURE = [
  `${HOME}bullet-list`,
  `${HOME}bullet-list-style-menu`,
  `${HOME}bullet-list-style-`,
  `${HOME}ordered-list`,
  `${HOME}ordered-list-style-menu`,
  `${HOME}ordered-list-style-`,
  `${HOME}task-list`,
  `${HOME}multilevel-list`,
  `${HOME}multilevel-list-`,
  `${HOME}indent`,
  `${HOME}outdent`,
  `${HOME}text-direction-ltr`,
  `${HOME}text-direction-rtl`,
  `${HOME}line-spacing-direct-`,
  `${HOME}space-before-direct`,
  `${HOME}space-after-direct`,
  `${HOME}paragraph-shading-home`,
  `${HOME}paragraph-shading-home-primary`,
  `${HOME}borders-shading-primary`,
];

/** The Home commands that format a selected object's words (Word's Font group on a shape). */
const OBJECT_TEXT_COMMANDS = [
  `${HOME}bold`,
  `${HOME}italic`,
  `${HOME}underline`,
  `${HOME}underline-menu`,
  `${HOME}underline-style-`,
  `${HOME}text-color`,
  `${HOME}text-color-menu`,
  `${HOME}font-family`,
  `${HOME}font-family-`,
  ...FONT_SIZE,
];
/**
 * What stays greyed for a shape, a group and a SmartArt graphic: the run
 * marks and paragraph structure their words do not carry. Single and double
 * underline act; the dotted and wavy styles and the underline colour are
 * text-run marks.
 */
const OBJECT_TEXT_GATED = [
  ...CHARACTER_FORMATTING.filter(
    (id) => !OBJECT_TEXT_COMMANDS.includes(id) && id !== `${HOME}strike`,
  ),
  `${HOME}underline-style-dotted`,
  `${HOME}underline-style-wavy`,
  `${HOME}font-family-set-`,
  ...PARAGRAPH_STRUCTURE,
  `${HOME}align-distribute`,
];

const GATED: Record<SelectedStructure, readonly string[]> = {
  
  // and the style gallery act on a display equation; so does Font Color
  
  // every m:r and m:ctrlPr, its fraction bars and radicals too), which the
  // equation keeps as its own attribute. Nothing else on Home does (a block
  // atom carries no text marks and is not a list paragraph).
  equation: [
    ...CHARACTER_FORMATTING.filter(
      (id) => id !== `${HOME}text-color` && id !== `${HOME}text-color-menu`,
    ),
    ...PARAGRAPH_STRUCTURE,
  ],
  // An in-line equation sits in a text paragraph: paragraph commands act on
  // that paragraph, and bold, sub/superscript, character border, shading,
  // highlight, font colour and text effects render on it (pixel-compared).
  // Italic, underline, strikethrough and a font face write a mark the KaTeX
  // preview never draws, and the case, enclosed-character and East Asian
  // layout commands change nothing, so those are greyed.
  inlineEquation: [
    `${HOME}italic`,
    `${HOME}underline`,
    `${HOME}underline-menu`,
    `${HOME}underline-style-`,
    `${HOME}underline-color-`,
    `${HOME}strike`,
    `${HOME}change-case`,
    `${HOME}change-case-`,
    `${HOME}enclosed-char`,
    `${HOME}enclosed-char-`,
    `${HOME}ruby-guide`,
    `${HOME}east-asian-layout`,
    `${HOME}eal-`,
    `${HOME}font-family`,
    `${HOME}font-family-`,
  ],
  // A picture alone on its line is a block of its own: alignment, lists,
  // the quote styles and the dialogs act on it; character formatting, font
  // size, right-to-left, paragraph shading and direct line spacing do not.
  picture: [
    ...CHARACTER_FORMATTING,
    ...FONT_SIZE,
    `${HOME}text-direction-rtl`,
    `${HOME}paragraph-shading-home`,
    `${HOME}paragraph-shading-home-primary`,
    `${HOME}line-spacing-direct-`,
    `${HOME}space-before-direct`,
    `${HOME}space-after-direct`,
  ],
  // An online video sits in its own paragraph the way Word holds it in line
  // with text: Home's alignment places it (justify reads as left, the line
  
  media: [
    ...CHARACTER_FORMATTING,
    ...FONT_SIZE,
    `${HOME}text-direction-rtl`,
    `${HOME}paragraph-shading-home`,
    `${HOME}paragraph-shading-home-primary`,
    `${HOME}line-spacing-direct-`,
    `${HOME}space-before-direct`,
    `${HOME}space-after-direct`,
  ],
  // A picture in a line of text takes the paragraph's commands and the
  // marks that show on it (bold, sub/superscript, border, highlight, size);
  // italic, underline, strikethrough, shading, font colour and font face
  // leave its pixels unchanged (pixel-compared), case and the East Asian
  // character layouts have nothing to act on.
  inlinePicture: [
    `${HOME}italic`,
    `${HOME}underline`,
    `${HOME}underline-menu`,
    `${HOME}underline-style-`,
    `${HOME}underline-color-`,
    `${HOME}strike`,
    `${HOME}char-shading`,
    `${HOME}text-color`,
    `${HOME}text-color-menu`,
    `${HOME}change-case`,
    `${HOME}change-case-`,
    `${HOME}enclosed-char`,
    `${HOME}enclosed-char-`,
    `${HOME}ruby-guide`,
    `${HOME}east-asian-layout`,
    `${HOME}eal-`,
    `${HOME}font-family`,
    `${HOME}font-family-`,
  ],
  // A selected chart: Home's Bold, Italic, Underline, Font Color, font size
  // and font face format the chart's own text (`c:chartSpace/c:txPr`, what
  // Word writes for Bold on a selected chart; every element inherits it),
  // alignment moves it with its paragraph and the Quote / Title styles and
  // the dialogs act on it; strikethrough, the other run marks, lists,
  // indents, direction and spacing change nothing.
  chart: [
    ...CHARACTER_FORMATTING.filter((id) => !OBJECT_TEXT_COMMANDS.includes(id)),
    `${HOME}underline-style-dotted`,
    `${HOME}underline-style-wavy`,
    `${HOME}font-family-set-`,
    ...PARAGRAPH_STRUCTURE,
  ],
  // A selected shape: Home's Font group formats the shape's text (bold,
  // italic, single / double underline, strikethrough, colour, size, face)
  // and Left / Center / Right / Justify align the text inside it, as Word
  
  // words, the shape does not move); the Quote styles wrap it. Highlight,
  // the other underline styles, sub/superscript, the case and East Asian
  // layout commands and the theme font sets apply to text runs only.
  shape: OBJECT_TEXT_GATED,
  // An ink stroke has no text: no Home font command acts on it.
  ink: [
    ...CHARACTER_FORMATTING,
    ...FONT_SIZE,
    ...PARAGRAPH_STRUCTURE,
    `${HOME}align-justify`,
    `${HOME}align-distribute`,
  ],
  // A group formats the text of every member, as Word does.
  shapeGroup: OBJECT_TEXT_GATED,
  // A SmartArt graphic: Home's Font group formats every node's text and
  
  // 96 `i="1"` for one Italic, 72 `algn="r"` for one Align Right, the
  // paragraph's `w:jc` unchanged), so those act; the rest is as for a shape.
  smartArt: OBJECT_TEXT_GATED,
  break: [],
  object: [],
  tableCells: [],
};

/**
 * The Insert commands Word greys while a FLOATING object is selected (a
 * picture, shape, chart, SmartArt or ink stroke on the page, not one in line
 * with text): with the object's own reason. Null otherwise.
 */
export function floatSelectionInsertGate(
  structure: SelectedStructure | null,
  floating: boolean,
  translate: (key: string) => string,
): OfficeRibbonCommandGate | null {
  if (!structure || !floating) return null;
  return selectionGateFromEntries(
    FLOAT_SELECTION_INSERT_GATED,
    translate(STRUCTURE_REASON_KEY[structure]),
  );
}

/** The gate for `structure`; null for text, where every command applies. */
export function ribbonSelectionGate(
  structure: SelectedStructure | null,
  translate: (key: string) => string,
): OfficeRibbonCommandGate | null {
  if (!structure) return null;
  return selectionGateFromEntries(
    GATED[structure],
    translate(STRUCTURE_REASON_KEY[structure]),
  );
}

/**
 * The Home commands a header or footer story has no place for while one is
 * open (Word's header pane takes Bullets, Numbering and Multilevel List as the
 * body does, and lists are a header line's own `BandRichList`): a checklist is
 * a content control, and the quote and code-block styles have no header
 * counterpart, so those stay greyed with the reason.
 */
export const HEADER_FOOTER_STORY_GATED: readonly string[] = [`${HOME}task-list`];

/**
 * The commands that format a header line's words with what the line cannot
 * keep: a proofing language (`w:lang` on a header run) is set nowhere a header
 * writes, and Language took it in the island only for Close to refuse the
 * whole edit (WUA 107). Greyed with the reason before, not refused after.
 */
export const HEADER_FOOTER_STORY_FORMAT_GATED: readonly string[] = [
  `${HOME}ribbon-proofing-language`,
];

/** The gate of an open header/footer story; null while the body is edited. */
export function headerFooterStoryGate(
  storyOpen: boolean,
  translate: (key: string) => string,
): OfficeRibbonCommandGate | null {
  if (!storyOpen) return null;
  return combineRibbonGates(
    selectionGateFromEntries(
      HEADER_FOOTER_STORY_GATED,
      translate("toolbar.headerFooterStructureLocked"),
    ),
    selectionGateFromEntries(
      HEADER_FOOTER_STORY_FORMAT_GATED,
      translate("toolbar.headerFooterLanguageLocked"),
    ),
  );
}

/** Both gates: a command greyed by either is greyed, with the first reason. */
export function combineRibbonGates(
  ...gates: (OfficeRibbonCommandGate | null)[]
): OfficeRibbonCommandGate | null {
  const active = gates.filter((gate): gate is OfficeRibbonCommandGate => gate !== null);
  if (active.length <= 1) return active[0] ?? null;
  return (testId) => {
    for (const gate of active) {
      const reason = gate(testId);
      if (reason !== undefined) return reason;
    }
    return undefined;
  };
}
