"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Object PLACEMENT — pictures, charts and equations as Word places them on a
 * text line. Generalises `equationPlacement.ts` (which stays the owner of the
 * equation-specific rules) to every block object MRAI draws on its own line:
 *
 *   `image`     ↔ `inlineImage`   (Word picture, `w:r/w:drawing/wp:inline`)
 *   `imageRow`  → N × `inlineImage` (several pictures of one Word paragraph)
 *   `chart`     ↔ `inlineChart`   (Word chart, `wp:inline` + `c:chart`)
 *   `mathBlock` ↔ `inlineMath`    (`m:oMathPara` ↔ `m:oMath`)
 *   `documentShape` ↔ `inlineDocumentShape` (a shape or SmartArt placed In
 *                   Line with Text, `wp:inline` + `wps:wsp` / `wpg:wgp`)
 *
 * Moving any of them with the mouse is `objectMove.ts`.
 *
 * ## Microsoft behaviour this reproduces
 *
 * • Word's default wrap for an inserted picture/chart is "In Line with Text":
 *   the object is a character of its paragraph (ECMA-376 §20.4.2.8 `inline`:
 *   "in line with the text ... affects the line height and layout of its
 *   line, like a character glyph of similar size"). It sits on the baseline,
 *   carries only `wp:extent` (no position offset), moves with the text, and a
 *   caret can stand immediately before or after it on the same line. Enter
 *   splits the paragraph around it like around any character.
 * • MRAI historically stores such an object as a BLOCK node on its own line.
 *   Word's paragraph `<w:p><w:pPr><w:jc/></w:pPr><w:r><w:drawing><wp:inline>`
 *   is byte-for-byte the same whether MRAI holds it as `image` + `dataAlign`
 *   or as a paragraph (`textAlign`) holding `inlineImage`, so converting a
 *   block object into its inline form inside a paragraph that inherits its
 *   alignment is a pure representation change: nothing moves, nothing is lost.
 *   That conversion is what gives the caret a real place beside the object.
 * • With a picture/chart selected, Left/Right put the caret before/after it
 *   on the SAME line (never the previous/next line). Typing there puts text
 *   beside it. Backspace at the start of the paragraph after it, and Delete
 *   at the end of the paragraph before it, merge the two paragraphs.
 * • The representation change is deferred to the first real edit: an arrow
 *   press or a gutter click only PARKS the caret beside the object (drawn on
 *   its line by the `data-object-boundary-caret` decoration); the block
 *   becomes inline on the first typed character or the Backspace/Delete
 *   merge. Navigating past an object therefore never rewrites the document
 *   (an imported .docx keeps its native save path until text really lands
 *   beside the picture), and a display equation keeps its display layout
 *   while the caret merely sits beside it, exactly as Word only makes it
 *   inline once the paragraph holds other text. The one immediate
 *   conversion is a caret between two pictures of one row, where no
 *   boundary exists to park at.
 * • Any Wrap Text choice other than "In Line with Text" makes a picture
 *   floating (`wp:anchor`), anchored to its paragraph: the inline picture
 *   becomes the block `image` with that wrap mode (`convertInlinePictureToFloating`).
 *
 * Floating block objects (`image` with a wrap float, anchored Office drawings,
 * floating charts) are never converted: in Word, arrow keys nudge a floating
 * object instead of moving a caret past it.
 *
 * The conversions are layout-only, so they carry `TRACK_CHANGES_SKIP_META`;
 * text typed beside the object goes through the ordinary text-input pipeline
 * afterwards and is tracked like any other insertion. Merges (which delete a
 * paragraph mark) step aside while suggesting is on and leave ProseMirror's
 * default key behaviour in charge.
 *
 * A future importer can map `w:r/w:drawing/wp:inline` inside a text run
 * straight onto `inlineImage` / `inlineChart` (same attribute set as the block
 * nodes), and a text-free picture paragraph onto the block node as today.
 */

import { Extension, isMacOS } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type NodeType,
  type Schema,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import {
  generateNativeBlockId,
  MRNOTE_BLOCK_ID_ATTR,
} from "../native-document/blockIds";
import {
  documentBoundaryInteractionKey,
  isParkedBoundaryText,
  parkSelectionAtBoundary,
} from "../native-document/documentBoundaryInteraction";
import {
  BLOCK_PICTURE_NODE_NAME,
  BLOCK_SHAPE_NODE_NAME,
  INLINE_CHART_NODE_NAME,
  INLINE_PICTURE_NODE_NAME,
  INLINE_SHAPE_NODE_NAME,
  isInlineDrawingNode,
} from "../native-document/documentObjectNodes";
import {
  IME_COMPOSITION_PREPARE_META,
  isImeCompositionActive,
} from "../native-document/imeCompositionGuard";
import {
  isSuggestingActive,
  TRACK_CHANGES_SKIP_META,
} from "../native-document/trackChangesExtension";
import {
  EQUATION_NODE_BY_PLACEMENT,
  equationGutterSide,
  placeCaretOutsideEquation,
  projectEquationAttrs,
} from "./equationPlacement";
import { nextDocumentFloatingHeight } from "../../../../lib/document-shapes";
import {
  OPEN_VISUAL_MATH_EDITOR_EVENT,
  type OpenVisualMathEditorDetail,
} from "./visualMathEditor";

/**
 * The block objects that stand "In Line with Text" on a line of their own.
 * A `drawing` is a shape or SmartArt graphic placed In Line with Text.
 */
export type BlockObjectKind =
  | "picture"
  | "pictureRow"
  | "chart"
  | "equation"
  | "drawing";



type Side = "before" | "after";
type Align = "left" | "center" | "right";

const SOURCE_PAGE_BREAK_NODE = "sourcePageBreak";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A picture is in line unless it floats (wrap) or is an anchored drawing. */
function pictureIsInLine(attrs: Record<string, unknown>): boolean {
  return (
    (attrs.dataFloat === null || attrs.dataFloat === undefined) &&
    attrs.officeDrawingKind !== "anchor"
  );
}

/** A chart is in line unless it floats: a `wp:anchor` of its own
 * (`floatAnchor`) or the host layout's floating mode. */
function chartIsInLine(attrs: Record<string, unknown>): boolean {
  if (record(attrs.floatAnchor)) return false;
  const layout = record(record(attrs.documentChart)?.layout);
  return !layout || layout.mode !== "floating";
}

/**
 * The kind of an IN-LINE block object, or `null` for anything else — text,
 * other blocks, and floating objects (which Word moves with the arrow keys).
 */
export function inLineBlockObjectKind(
  node: ProseMirrorNode | null | undefined,
): BlockObjectKind | null {
  if (!node || !node.isBlock) return null;
  const attrs = node.attrs as Record<string, unknown>;
  switch (node.type.name) {
    case BLOCK_PICTURE_NODE_NAME:
      return pictureIsInLine(attrs) ? "picture" : null;
    case "imageRow":
      return "pictureRow";
    case "chart":
      return chartIsInLine(attrs) ? "chart" : null;
    case "mathBlock":
      return "equation";
    case BLOCK_SHAPE_NODE_NAME:
      // Word's default for an inserted SmartArt (and every `wp:inline`
      // shape it imports); any other wrap floats and moves by position.
      return attrs.wrapMode === "inline" ? "drawing" : null;
    default:
      return null;
  }
}

function alignValue(value: unknown): Align | null {
  return value === "left" || value === "center" || value === "right"
    ? value
    : null;
}

/**
 * Attributes that exist only while the object is a block: its own paragraph
 * geometry (alignment, the imported page break before it), wrap placement and
 * block identity. The inline form hands them to the host paragraph or drops
 * them; everything else — the picture/chart itself — is carried over verbatim.
 */
const BLOCK_ONLY_DRAWING_ATTRS: ReadonlySet<string> = new Set([
  "dataAlign",
  "dataFloat",
  "textAlign",
  "sourcePageBreakBefore",
  MRNOTE_BLOCK_ID_ATTR,
]);

/** Project a picture/chart's attrs onto the other placement's node type. */
export function projectDrawingAttrs(
  attrs: Record<string, unknown> | null | undefined,
  target: NodeType,
  placement: "inline" | "block",
): Record<string, unknown> {
  const declared = target.spec.attrs ?? {};
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (!(key in declared)) continue;
    if (placement === "inline" && BLOCK_ONLY_DRAWING_ATTRS.has(key)) continue;
    if (key === MRNOTE_BLOCK_ID_ATTR) continue;
    projected[key] = value;
  }
  return projected;
}

/** The runs a block object becomes on a text line, plus its line geometry. */
export interface InlineObjectForm {
  readonly kind: BlockObjectKind;
  readonly runs: readonly ProseMirrorNode[];
  readonly align: Align | null;
  readonly pageBreakBefore: boolean;
}

export function inlineFormOfBlockObject(
  schema: Schema,
  node: ProseMirrorNode,
): InlineObjectForm | null {
  const kind = inLineBlockObjectKind(node);
  if (!kind) return null;
  const attrs = node.attrs as Record<string, unknown>;
  const pageBreakBefore = attrs.sourcePageBreakBefore === true;
  try {
    switch (kind) {
      case "picture": {
        const type = schema.nodes[INLINE_PICTURE_NODE_NAME];
        if (!type) return null;
        return {
          kind,
          runs: [type.create(projectDrawingAttrs(attrs, type, "inline"))],
          align: alignValue(attrs.dataAlign),
          pageBreakBefore,
        };
      }
      case "pictureRow": {
        const type = schema.nodes[INLINE_PICTURE_NODE_NAME];
        if (!type || node.childCount === 0) return null;
        const runs: ProseMirrorNode[] = [];
        let childBreak = false;
        node.forEach((child, _offset, index) => {
          const childAttrs = child.attrs as Record<string, unknown>;
          if (index === 0 && childAttrs.sourcePageBreakBefore === true) {
            childBreak = true;
          }
          runs.push(type.create(projectDrawingAttrs(childAttrs, type, "inline")));
        });
        return {
          kind,
          runs,
          align: alignValue(attrs.dataAlign),
          pageBreakBefore: pageBreakBefore || childBreak,
        };
      }
      case "chart": {
        const type = schema.nodes[INLINE_CHART_NODE_NAME];
        if (!type) return null;
        return {
          kind,
          runs: [type.create(projectDrawingAttrs(attrs, type, "inline"))],
          align: alignValue(attrs.textAlign),
          pageBreakBefore,
        };
      }
      case "equation": {
        const type = schema.nodes[EQUATION_NODE_BY_PLACEMENT.inline];
        if (!type) return null;
        return {
          kind,
          runs: [
            type.create(projectEquationAttrs(attrs, "inline", type.spec.attrs)),
          ],
          // `m:oMathPara` defaults to centre (`centerGroup`); the paragraph
          // that takes the equation over keeps it where it was drawn.
          align: alignValue(attrs.textAlign) ?? "center",
          pageBreakBefore,
        };
      }
      case "drawing": {
        // The shape's own line has no alignment of its own in MRAI; the
        // paragraph that takes it over keeps the document default.
        const type = schema.nodes[INLINE_SHAPE_NODE_NAME];
        if (!type) return null;
        return {
          kind,
          runs: [type.create(projectDrawingAttrs(attrs, type, "inline"))],
          align: null,
          pageBreakBefore,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function documentDefaultAlign(state: EditorState): string {
  const value = (state.doc.attrs as Record<string, unknown>).defaultTextAlign;
  return typeof value === "string" && value ? value : "left";
}

/**
 * The paragraph that holds `form` on its line. `base` (a paragraph being
 * merged with the object) keeps its own type, identity and formatting; the
 * object's line alignment wins, as Word keeps the first paragraph's
 * formatting when two paragraphs join.
 */
function objectParagraph(
  state: EditorState,
  form: InlineObjectForm,
  before: Fragment = Fragment.empty,
  after: Fragment = Fragment.empty,
  base?: ProseMirrorNode,
): ProseMirrorNode | null {
  const type = base?.type ?? state.schema.nodes.paragraph;
  if (!type) return null;
  const declared = type.spec.attrs ?? {};
  const attrs: Record<string, unknown> = base ? { ...base.attrs } : {};
  if (!base && MRNOTE_BLOCK_ID_ATTR in declared) {
    attrs[MRNOTE_BLOCK_ID_ATTR] = generateNativeBlockId();
  }
  if ("textAlign" in declared) {
    const defaultAlign = documentDefaultAlign(state);
    if (form.align) {
      attrs.textAlign = form.align === defaultAlign ? null : form.align;
    } else if (!base) {
      attrs.textAlign = null;
    }
  }
  const content: ProseMirrorNode[] = [];
  const pageBreak = state.schema.nodes[SOURCE_PAGE_BREAK_NODE];
  if (form.pageBreakBefore && pageBreak) content.push(pageBreak.create());
  before.forEach((node) => content.push(node));
  content.push(...form.runs);
  after.forEach((node) => content.push(node));
  try {
    return type.createChecked(attrs, content, base?.marks);
  } catch {
    return null;
  }
}

/**
 * The paragraph a block object leaves behind when it is moved away: Word keeps
 * the paragraph mark of the line the object stood on, with its alignment and
 * the page break that opened it.
 */
export function vacatedObjectLine(
  state: EditorState,
  node: ProseMirrorNode,
): ProseMirrorNode | null {
  const attrs = node.attrs as Record<string, unknown>;
  return objectParagraph(state, {
    kind: inLineBlockObjectKind(node) ?? "picture",
    runs: [],
    align: alignValue(attrs.dataAlign) ?? alignValue(attrs.textAlign),
    pageBreakBefore: attrs.sourcePageBreakBefore === true,
  });
}

/** A new paragraph that holds `runs` (an inline object) on its own line. */
export function paragraphHoldingRuns(
  state: EditorState,
  runs: readonly ProseMirrorNode[],
): ProseMirrorNode | null {
  return objectParagraph(state, {
    kind: "picture",
    runs,
    align: null,
    pageBreakBefore: false,
  });
}

function leadOffset(form: InlineObjectForm, schema: Schema): number {
  return form.pageBreakBefore && schema.nodes[SOURCE_PAGE_BREAK_NODE] ? 1 : 0;
}

function runsSize(form: InlineObjectForm): number {
  return form.runs.reduce((size, run) => size + run.nodeSize, 0);
}

/** The block object at `pos`, redirected to its row for a row's picture. */
function resolveBlockObject(
  state: EditorState,
  pos: number,
): { pos: number; node: ProseMirrorNode; childIndex: number | null } | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= state.doc.content.size) {
    return null;
  }
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  const $pos = state.doc.resolve(pos);
  if (
    node.type.name === BLOCK_PICTURE_NODE_NAME &&
    $pos.parent.type.name === "imageRow" &&
    $pos.depth > 0
  ) {
    return { pos: $pos.before(), node: $pos.parent, childIndex: $pos.index() };
  }
  return inLineBlockObjectKind(node) ? { pos, node, childIndex: null } : null;
}

function canHoldParagraphAt(
  state: EditorState,
  pos: number,
  type: NodeType,
): boolean {
  const $pos = state.doc.resolve(pos);
  const index = $pos.index();
  return $pos.parent.canReplaceWith(index, index + 1, type);
}

function layoutOnly(tr: Transaction): Transaction {
  // A placement change is not a revision: the object, its size and its line
  // are unchanged, and Word writes the same paragraph for both spellings.
  return tr.setMeta(TRACK_CHANGES_SKIP_META, true);
}

/**
 * Put a real text caret beside the block object at `pos` on its own line:
 * the object becomes its inline form inside a paragraph that takes over its
 * alignment, and the caret lands on `side`. For a picture inside an
 * `imageRow`, `pos` may address the picture itself; the whole row becomes one
 * paragraph and the caret lands beside that picture.
 *
 * Display equations park instead (see the module comment).
 */
export function placeCaretBesideBlockObject(
  view: EditorView,
  pos: number,
  side: Side,
): boolean {
  if (!view.editable) return false;
  const state = view.state;
  const target = resolveBlockObject(state, pos);
  if (!target) return false;
  if (target.node.type.name === "mathBlock") {
    return placeCaretOutsideEquation(view, target.pos, side);
  }
  // A whole picture / row / chart: park beside it, as for an equation. The
  // inline form is minted only when text arrives (insertTextBesideBlockObject).
  if (target.childIndex === null) {
    const boundary =
      side === "before" ? target.pos : target.pos + target.node.nodeSize;
    parkSelectionAtBoundary(view, boundary, side === "before" ? -1 : 1);
    if (!view.hasFocus()) view.focus();
    return true;
  }
  const form = inlineFormOfBlockObject(state.schema, target.node);
  if (!form) return false;
  const paragraph = objectParagraph(state, form);
  if (!paragraph || !canHoldParagraphAt(state, target.pos, paragraph.type)) {
    return false;
  }
  const start = target.pos + 1 + leadOffset(form, state.schema);
  const index =
    target.childIndex === null
      ? side === "before"
        ? 0
        : form.runs.length
      : target.childIndex + (side === "after" ? 1 : 0);
  let caret = start;
  for (let i = 0; i < index; i += 1) caret += form.runs[i]!.nodeSize;
  const tr = layoutOnly(
    state.tr.replaceWith(
      target.pos,
      target.pos + target.node.nodeSize,
      paragraph,
    ),
  );
  tr.setSelection(TextSelection.create(tr.doc, caret))
    .setMeta(documentBoundaryInteractionKey, "keyboard")
    .scrollIntoView();
  view.dispatch(tr);
  if (!view.hasFocus()) view.focus();
  return true;
}

/**
 * Text arriving at a caret parked beside a block object: the object becomes
 * inline in its own paragraph and the text goes on `side` of it, through the
 * normal text-input pipeline (auto-correct, input rules, tracked insertion).
 */
export function insertTextBesideBlockObject(
  view: EditorView,
  pos: number,
  side: Side,
  text: string,
  preparingIme = false,
): boolean {
  if (!view.editable) return false;
  const state = view.state;
  const target = resolveBlockObject(state, pos);
  if (!target) return false;
  const form = inlineFormOfBlockObject(state.schema, target.node);
  if (!form) {
    return target.childIndex === null
      ? insertTextOnLineBesideObject(view, target, side, text, preparingIme)
      : false;
  }
  const paragraph = objectParagraph(state, form);
  if (!paragraph || !canHoldParagraphAt(state, target.pos, paragraph.type)) {
    return false;
  }
  const start = target.pos + 1 + leadOffset(form, state.schema);
  const caret = side === "before" ? start : start + runsSize(form);
  // The new line is not part of whatever Undo event preceded it (mirrors the
  // boundary policy's own first-input fence).
  const tr = layoutOnly(
    closeHistory(state.tr).replaceWith(
      target.pos,
      target.pos + target.node.nodeSize,
      paragraph,
    ),
  );
  tr.setSelection(TextSelection.create(tr.doc, caret)).setMeta(
    documentBoundaryInteractionKey,
    "input",
  );
  if (preparingIme) tr.setMeta(IME_COMPOSITION_PREPARE_META, true);
  view.dispatch(tr.scrollIntoView());
  if (!text) return true;
  const { from, to } = view.state.selection;
  const insert = () => view.state.tr.insertText(text, from, to);
  if (
    !view.someProp("handleTextInput", (handle) =>
      handle(view, from, to, text, insert),
    )
  ) {
    view.dispatch(insert().scrollIntoView());
  }
  return true;
}

/**
 * Text beside an object that has no inline form (a shape or SmartArt In Line
 * with Text): the text takes a new line of its own on that side of the
 * object, and the object stays where it is.
 */
function insertTextOnLineBesideObject(
  view: EditorView,
  target: { pos: number; node: ProseMirrorNode },
  side: Side,
  text: string,
  preparingIme: boolean,
): boolean {
  const state = view.state;
  const paragraph = objectParagraph(state, {
    kind: "drawing",
    runs: [],
    align: null,
    pageBreakBefore: false,
  });
  const at = side === "before" ? target.pos : target.pos + target.node.nodeSize;
  const $at = state.doc.resolve(at);
  if (
    !paragraph ||
    !$at.parent.canReplaceWith($at.index(), $at.index(), paragraph.type)
  ) {
    return false;
  }
  // An ordinary new paragraph: tracked like one while suggesting.
  const tr = closeHistory(state.tr).insert(at, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(
    documentBoundaryInteractionKey,
    "input",
  );
  if (preparingIme) tr.setMeta(IME_COMPOSITION_PREPARE_META, true);
  view.dispatch(tr.scrollIntoView());
  if (!text) return true;
  const { from, to } = view.state.selection;
  const insert = () => view.state.tr.insertText(text, from, to);
  if (
    !view.someProp("handleTextInput", (handle) =>
      handle(view, from, to, text, insert),
    )
  ) {
    view.dispatch(insert().scrollIntoView());
  }
  return true;
}

/**
 * Block object → the end of the text paragraph right above it (Backspace with
 * the caret parked before the object, or Delete at the end of that
 * paragraph). The paragraph keeps its own formatting, as in Word.
 */
export function mergeBlockObjectIntoPreviousParagraph(
  view: EditorView,
  pos: number,
  select: "caret" | "node" = "caret",
): boolean {
  if (!view.editable || isSuggestingActive(view.state)) return false;
  const state = view.state;
  const node = state.doc.nodeAt(pos);
  if (!node || !inLineBlockObjectKind(node)) return false;
  const $pos = state.doc.resolve(pos);
  const before = $pos.nodeBefore;
  if (!before || !before.isTextblock) return false;
  const form = inlineFormOfBlockObject(state.schema, node);
  if (!form) return false;
  const merged = objectParagraph(
    state,
    { ...form, align: null, pageBreakBefore: false },
    before.content,
    Fragment.empty,
    before,
  );
  if (!merged) return false;
  const from = pos - before.nodeSize;
  const tr = state.tr.replaceWith(from, pos + node.nodeSize, merged);
  const objectStart = from + 1 + before.content.size;
  tr.setSelection(
    select === "node" && form.runs.length === 1
      ? NodeSelection.create(tr.doc, objectStart)
      : TextSelection.create(tr.doc, objectStart + runsSize(form)),
  ).setMeta(documentBoundaryInteractionKey, "keyboard");
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Backspace at the very start of the paragraph right after a block object:
 * Word deletes the paragraph mark between them, so the paragraph's text
 * joins the object's line and the caret stays between object and text.
 */
export function mergeParagraphIntoPrecedingBlockObject(
  view: EditorView,
): boolean {
  if (!view.editable || isSuggestingActive(view.state)) return false;
  const state = view.state;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  const paragraph = $from.parent;
  if (!paragraph.isTextblock || $from.parentOffset !== 0 || $from.depth === 0) {
    return false;
  }
  const index = $from.index($from.depth - 1);
  if (index === 0) return false;
  const previous = $from.node($from.depth - 1).child(index - 1);
  if (!inLineBlockObjectKind(previous)) return false;
  if (paragraph.content.size === 0) {
    // An EMPTY paragraph brings no text to the object's line: Word deletes
    // its paragraph mark and the object keeps the line it had, the caret
    // after it. Merging it made a display equation in-line (a Backspace
    // after Enter below an equation flattened it to text size).
    const boundary = $from.before();
    view.dispatch(
      state.tr
        .delete(boundary, $from.after())
        .setMeta(documentBoundaryInteractionKey, "keyboard")
        .scrollIntoView(),
    );
    // The caret after the object, as a click beside it parks it.
    parkSelectionAtBoundary(view, boundary, 1);
    return true;
  }
  const form = inlineFormOfBlockObject(state.schema, previous);
  if (!form) return false;
  const merged = objectParagraph(
    state,
    form,
    Fragment.empty,
    paragraph.content,
    paragraph,
  );
  if (!merged) return false;
  const objectPos = $from.before() - previous.nodeSize;
  const tr = state.tr.replaceWith(objectPos, $from.after(), merged);
  const caret =
    objectPos + 1 + leadOffset(form, state.schema) + runsSize(form);
  tr.setSelection(TextSelection.create(tr.doc, caret)).setMeta(
    documentBoundaryInteractionKey,
    "keyboard",
  );
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Backspace with the caret BEFORE a block object (a GapCursor at that
 * boundary, or a caret parked at the end of the paragraph above): the
 * object's own paragraph folds into the paragraph above.
 */
export function mergeBlockObjectBeforeCursor(view: EditorView): boolean {
  const { selection } = view.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if (selection instanceof GapCursor) {
    const after = $from.nodeAfter;
    return after && inLineBlockObjectKind(after)
      ? mergeBlockObjectIntoPreviousParagraph(view, $from.pos)
      : false;
  }
  // A caret the user is typing with at the end of the paragraph above keeps
  // Backspace's ordinary character deletion.
  if (!isParkedBoundaryText(view)) return false;
  return mergeBlockObjectAfterCursor(view);
}

/**
 * Delete with the caret at the END of the paragraph right above a block
 * object — the same paragraph merge approached forwards.
 */
export function mergeBlockObjectAfterCursor(view: EditorView): boolean {
  const { selection } = view.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || $from.depth === 0) return false;
  if ($from.parentOffset !== parent.content.size) return false;
  const blockEnd = $from.after();
  const next = view.state.doc.resolve(blockEnd).nodeAfter;
  if (!next || !inLineBlockObjectKind(next)) return false;
  return mergeBlockObjectIntoPreviousParagraph(view, blockEnd);
}

/** The block object a PARKED caret stands beside, and on which side. */
export function parkedBlockObjectSide(
  state: EditorState,
): { pos: number; node: ProseMirrorNode; side: Side } | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (selection instanceof GapCursor) {
    const before = $from.nodeBefore;
    if (before && inLineBlockObjectKind(before)) {
      return { pos: $from.pos - before.nodeSize, node: before, side: "after" };
    }
    const after = $from.nodeAfter;
    if (after && inLineBlockObjectKind(after)) {
      return { pos: $from.pos, node: after, side: "before" };
    }
    return null;
  }
  if (!(selection instanceof TextSelection)) return null;
  if (documentBoundaryInteractionKey.getState(state) !== "idle") return null;
  const parent = $from.parent;
  // An empty paragraph is a line of its own: text typed there stays there.
  if (!parent.isTextblock || parent.content.size === 0 || $from.depth === 0) {
    return null;
  }
  if ($from.parentOffset === parent.content.size) {
    const next = blockNeighbour(state, $from.after(), "after");
    if (next && inLineBlockObjectKind(next.node)) {
      return { pos: next.pos, node: next.node, side: "before" };
    }
  }
  if ($from.parentOffset === 0) {
    const previous = blockNeighbour(state, $from.before(), "before");
    if (previous && inLineBlockObjectKind(previous.node)) {
      return { pos: previous.pos, node: previous.node, side: "after" };
    }
  }
  return null;
}

const PAGE_BLOCK_NODE_NAME = "pageBlock";

/**
 * The block right before / after a boundary, looking THROUGH a page break: the
 * paged projection wraps blocks in `pageBlock`s, and an object that ends a
 * page is followed by the next page's first text block. Word's text flow has
 * no such seam, so neither does the parked caret.
 */
function blockNeighbour(
  state: EditorState,
  boundary: number,
  side: Side,
): { pos: number; node: ProseMirrorNode } | null {
  const $boundary = state.doc.resolve(boundary);
  const sibling = side === "after" ? $boundary.nodeAfter : $boundary.nodeBefore;
  if (sibling) {
    return {
      pos: side === "after" ? boundary : boundary - sibling.nodeSize,
      node: sibling,
    };
  }
  if ($boundary.parent.type.name !== PAGE_BLOCK_NODE_NAME) return null;
  const $page = state.doc.resolve(
    side === "after" ? $boundary.after() : $boundary.before(),
  );
  const page = side === "after" ? $page.nodeAfter : $page.nodeBefore;
  if (!page || page.type.name !== PAGE_BLOCK_NODE_NAME) return null;
  if (side === "after") {
    const node = page.firstChild;
    return node ? { pos: $page.pos + 1, node } : null;
  }
  const node = page.lastChild;
  return node ? { pos: $page.pos - 1 - node.nodeSize, node } : null;
}

/**
 * Wrap Text on an inline picture, chart or shape: any mode other than "In
 * Line with Text" makes it a floating (`wp:anchor`) object anchored to its
 * paragraph. MRAI spells that as the block node (`image` with `dataFloat`,
 * `chart` with a floating `documentChart.layout`, `documentShape` with that
 * `wrapMode`) placed right before its anchor paragraph.
 * A paragraph the page made, left without any content, goes away with it
 * (the floating object's own paragraph is its anchor on export). A
 * paragraph read from a Word file stays, empty: it is the `w:p` that holds
 * the object, as Word keeps it when the wrap changes, and the shape the
 * page reads such a paragraph back as (the object, then its empty host).
 * Taken away, the edited page had one block fewer than the same file read
 * again (FIXQUEUE 246, corpus R426-D13 E37: a picture alone in p[75] set
 * to Square). `blockAttrs` is the placement patch for the block node.
 */
export function convertInlineDrawingToBlock(
  view: EditorView,
  pos: number,
  blockAttrs: Readonly<Record<string, unknown>>,
): boolean {
  if (!view.editable) return false;
  const state = view.state;
  const node = state.doc.nodeAt(pos);
  const blockName =
    node?.type.name === INLINE_PICTURE_NODE_NAME
      ? BLOCK_PICTURE_NODE_NAME
      : node?.type.name === INLINE_CHART_NODE_NAME
        ? "chart"
        : node?.type.name === INLINE_SHAPE_NODE_NAME
          ? BLOCK_SHAPE_NODE_NAME
          : null;
  const blockType = blockName ? state.schema.nodes[blockName] : undefined;
  if (!node || !blockType) return false;
  const $pos = state.doc.resolve(pos);
  const host = $pos.parent;
  if (!host.isTextblock || $pos.depth === 0) return false;
  const hostPos = $pos.before();
  const $host = state.doc.resolve(hostPos);
  const hostIndex = $host.index();
  if (!$host.parent.canReplaceWith(hostIndex, hostIndex, blockType)) {
    return false;
  }
  let block: ProseMirrorNode;
  try {
    block = blockType.createChecked({
      ...projectDrawingAttrs(node.attrs, blockType, "block"),
      ...(MRNOTE_BLOCK_ID_ATTR in (blockType.spec.attrs ?? {})
        ? { [MRNOTE_BLOCK_ID_ATTR]: generateNativeBlockId() }
        : {}),
      ...blockAttrs,
    });
  } catch {
    return false;
  }
  const remaining = host.content.size - node.nodeSize;
  const tr = state.tr;
  const readFromWord = typeof (host.attrs.source as { sourceAnchor?: unknown } | null | undefined)?.sourceAnchor === "string";
  if (remaining <= 0 && !readFromWord) {
    tr.replaceWith(hostPos, hostPos + host.nodeSize, block);
  } else {
    tr.delete(pos, pos + node.nodeSize).insert(hostPos, block);
  }
  tr.setSelection(NodeSelection.create(tr.doc, hostPos));
  view.dispatch(closeHistory(tr).scrollIntoView());
  return true;
}

/** Wrap Text (any floating mode) on an inline picture. */
export function convertInlinePictureToFloating(
  view: EditorView,
  pos: number,
  dataFloat: string,
): boolean {
  if (view.state.doc.nodeAt(pos)?.type.name !== INLINE_PICTURE_NODE_NAME) {
    return false;
  }
  return convertInlineDrawingToBlock(view, pos, {
    dataFloat,
    dataAlign: null,
    officeDrawingKind: "anchor",
    // Its place in the floating stack: the top, as a drawing just made.
    relativeHeight: nextDocumentFloatingHeight(view.state.doc),
  });
}

// ---------------------------------------------------------------------------
// Pointer: a click in the free space beside an in-line block object.
// ---------------------------------------------------------------------------

/** The visible box of a block object's drawing (not its full-width host). */
function objectContentRect(
  node: ProseMirrorNode,
  dom: Element,
): DOMRect | null {
  let box: Element | null = dom;
  if (node.type.name === "chart") {
    box = dom.querySelector(".chart-block-wrapper") ?? dom;
  } else if (node.type.name === "mathBlock") {
    box = dom.querySelector(".math-block-preview") ?? dom;
  } else if (node.type.name === BLOCK_SHAPE_NODE_NAME) {
    box = dom.querySelector("[data-document-shape-canvas]") ?? dom;
  } else if (node.type.name === "imageRow") {
    const children = Array.from(dom.children).filter((child) =>
      child.classList.contains("note-editor-image-resizable"),
    );
    if (children.length === 0) return null;
    const rects = children.map((child) => child.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }
  const rect = box.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function gutterTarget(
  view: EditorView,
  event: MouseEvent,
): { pos: number; side: Side } | null {
  // Resize/crop/rotate grips and other drawing chrome own their own gestures,
  // even where they overhang the drawing's edge.
  if (
    event.target instanceof Element &&
    event.target.closest(
      "[data-document-selection-chrome], .note-editor-image-handle, .note-editor-image-crop-handle, button, input, textarea, select",
    )
  ) {
    return null;
  }
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return null;
  const { doc } = view.state;
  const candidates: number[] = [];
  if (hit.inside >= 0) candidates.push(hit.inside);
  const $pos = doc.resolve(hit.pos);
  if ($pos.nodeAfter) candidates.push(hit.pos);
  if ($pos.nodeBefore) candidates.push(hit.pos - $pos.nodeBefore.nodeSize);
  // A press in the spacing between a paragraph and an object resolves into
  // the paragraph: the objects on either side of it are candidates too.
  if ($pos.parent.isTextblock && $pos.depth > 0) {
    const before = $pos.before();
    const above = doc.resolve(before).nodeBefore;
    if (above) candidates.push(before - above.nodeSize);
    const after = $pos.after();
    if (doc.resolve(after).nodeAfter) candidates.push(after);
  }
  for (const pos of candidates) {
    const node = doc.nodeAt(pos);
    const kind = inLineBlockObjectKind(node);
    if (!node || !kind) continue;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element)) continue;
    // A press ON a display equation's own frame is routed by the frame.
    if (
      kind === "equation" &&
      event.target instanceof Node &&
      dom.contains(event.target)
    ) {
      continue;
    }
    const rect = objectContentRect(node, dom);
    if (!rect) continue;
    const band = objectLineBand(view, pos, node, dom, rect);
    if (event.clientY < band.top || event.clientY > band.bottom) continue;
    // Word's gutter rule, shared with the display-equation frame.
    const side = equationGutterSide(event.clientX, rect);
    if (side) return { pos, side };
  }
  return null;
}

/**
 * The vertical band a press beside an object reaches it in. In Word the
 * object's paragraph spacing belongs to the object's line, so a press in the
 * space above or below a display equation (or a picture alone on its line),
 * beside it, puts the caret beside it. The browser collapses the gap with the
 * neighbouring paragraph's spacing, so the object takes the half of each gap
 * nearer to it.
 */
function objectLineBand(
  view: EditorView,
  pos: number,
  node: ProseMirrorNode,
  dom: Element,
  content: DOMRect,
): { top: number; bottom: number } {
  const host = dom.getBoundingClientRect();
  const style = dom.ownerDocument.defaultView?.getComputedStyle(dom);
  const marginTop = parseFloat(style?.marginTop ?? "") || 0;
  const marginBottom = parseFloat(style?.marginBottom ?? "") || 0;
  const $pos = view.state.doc.resolve(pos);
  const above = $pos.nodeBefore;
  const aboveDom = above ? view.nodeDOM(pos - above.nodeSize) : null;
  const belowPos = pos + node.nodeSize;
  const belowDom = view.state.doc.resolve(belowPos).nodeAfter
    ? view.nodeDOM(belowPos)
    : null;
  const aboveBottom =
    aboveDom instanceof Element ? aboveDom.getBoundingClientRect().bottom : null;
  const belowTop =
    belowDom instanceof Element ? belowDom.getBoundingClientRect().top : null;
  const top =
    aboveBottom !== null && aboveBottom <= host.top
      ? (aboveBottom + host.top) / 2
      : host.top - marginTop;
  const bottom =
    belowTop !== null && belowTop >= host.bottom
      ? (host.bottom + belowTop) / 2
      : host.bottom + marginBottom;
  return {
    top: Math.min(content.top, top),
    bottom: Math.max(content.bottom, bottom),
  };
}

/**
 * A plain click on the blank of an in-line equation's line, beside it: the
 * text position on that side. Word puts the insertion point outside the
 * equation for a click in the blank before or after it; the browser resolves
 * a press left of a non-editable equation at the start of its line INTO the
 * equation, and the editor then selected the whole equation instead.
 */
function inlineEquationSideTarget(view: EditorView, event: MouseEvent): number | null {
  if (
    event.button !== 0 ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.detail > 1
  ) {
    return null;
  }
  // A press on the equation itself is the equation's (it opens it).
  if (event.target instanceof Element && event.target.closest(".inline-math-wrapper")) {
    return null;
  }
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return null;
  const { doc } = view.state;
  const candidates = new Set<number>();
  if (hit.inside >= 0) candidates.add(hit.inside);
  const $pos = doc.resolve(hit.pos);
  if ($pos.nodeAfter) candidates.add(hit.pos);
  if ($pos.nodeBefore) candidates.add(hit.pos - $pos.nodeBefore.nodeSize);
  for (const pos of candidates) {
    const node = doc.nodeAt(pos);
    if (!node || node.type.name !== "inlineMath") continue;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element)) continue;
    const rect = dom.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) continue;
    if (event.clientX < rect.left) return pos;
    if (event.clientX > rect.right) return pos + node.nodeSize;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Keyboard.
// ---------------------------------------------------------------------------

function selectedInLineBlockObject(
  state: EditorState,
): { pos: number; node: ProseMirrorNode } | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (inLineBlockObjectKind(node)) return { pos: selection.from, node };
  // One picture of a multi-picture row.
  if (
    node.type.name === BLOCK_PICTURE_NODE_NAME &&
    selection.$from.parent.type.name === "imageRow"
  ) {
    return { pos: selection.from, node };
  }
  return null;
}

function arrow(view: EditorView, side: Side): boolean {
  const state = view.state;
  const selected = selectedInLineBlockObject(state);
  if (selected) return placeCaretBesideBlockObject(view, selected.pos, side);
  // A caret parked beside an object: the first arrow toward the object
  // selects it, the first arrow away from it turns the park into a caret
  // where it already stands (the neighbouring line's edge).
  const parked = parkedBlockObjectSide(state);
  if (!parked || !(state.selection instanceof TextSelection)) return false;
  const towardObject =
    (parked.side === "before" && side === "after") ||
    (parked.side === "after" && side === "before");
  const tr = state.tr.setMeta(documentBoundaryInteractionKey, "keyboard");
  if (towardObject) tr.setSelection(NodeSelection.create(state.doc, parked.pos));
  view.dispatch(tr.scrollIntoView());
  // A display equation is text to Word's caret: the arrow toward it goes in
  // at its near edge instead of only selecting the whole object.
  if (towardObject && state.doc.nodeAt(parked.pos)?.type.name === "mathBlock") {
    const dom = view.nodeDOM(parked.pos);
    if (dom instanceof HTMLElement) {
      const detail: OpenVisualMathEditorDetail = {
        caret: parked.side === "before" ? "start" : "end",
      };
      dom.dispatchEvent(new CustomEvent(OPEN_VISUAL_MATH_EDITOR_EVENT, { detail }));
    }
  }
  return true;
}

/**
 * Home / End on a line that starts / ends with an in-line picture, chart or
 * shape: Word puts the caret at the line's edge, before (after) the drawing,
 * because the drawing is a character of that line. The browser stops on the
 * text side of the non-editable box instead, so the first character typed
 * after Home landed after a SmartArt that opens its line.
 */
function lineEdgeBesideInlineDrawing(
  view: EditorView,
  edge: "start" | "end",
): boolean {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $head } = selection;
  const parent = $head.parent;
  if (!parent.isTextblock || $head.depth === 0) return false;
  const drawing = edge === "start" ? parent.firstChild : parent.lastChild;
  if (!drawing || !isInlineDrawingNode(drawing)) return false;
  const edgePos = edge === "start" ? $head.start() : $head.end();
  if ($head.pos === edgePos) return false;
  const dom = view.nodeDOM(
    edge === "start" ? edgePos : edgePos - drawing.nodeSize,
  );
  if (!(dom instanceof Element)) return false;
  // Only on the line the drawing stands on: its box spans that line from the
  // line's top to the baseline, and no other line of the paragraph.
  const box = dom.getBoundingClientRect();
  let caret: { top: number; bottom: number };
  try {
    caret = view.coordsAtPos($head.pos);
  } catch {
    return false;
  }
  if (caret.bottom <= box.top || caret.top >= box.bottom + 1) return false;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, edgePos))
      .scrollIntoView(),
  );
  return true;
}

const objectPlacementKey = new PluginKey("documentObjectPlacement");

/**
 * The placement keymap + pointer/text/IME routing. Priority 1001 beats the
 * document boundary policy (1000), which turns a PARKED caret into a typing
 * caret on the first key it sees — "parked beside the object" is exactly the
 * state these handlers must still be able to read.
 */
export const ObjectPlacement = Extension.create({
  name: "objectPlacement",
  priority: 1_001,

  addKeyboardShortcuts() {
    return {
      ArrowLeft: () => arrow(this.editor.view, "before"),
      ArrowRight: () => arrow(this.editor.view, "after"),
      Backspace: () =>
        mergeBlockObjectBeforeCursor(this.editor.view) ||
        mergeParagraphIntoPrecedingBlockObject(this.editor.view),
      Delete: () => mergeBlockObjectAfterCursor(this.editor.view),
      Home: () => lineEdgeBesideInlineDrawing(this.editor.view, "start"),
      End: () => lineEdgeBesideInlineDrawing(this.editor.view, "end"),
      // macOS spells line start / end Cmd-Left / Cmd-Right (elsewhere
      // Ctrl-Left / Ctrl-Right move by word and are left alone).
      ...(isMacOS()
        ? {
            "Mod-ArrowLeft": () =>
              lineEdgeBesideInlineDrawing(this.editor.view, "start"),
            "Mod-ArrowRight": () =>
              lineEdgeBesideInlineDrawing(this.editor.view, "end"),
          }
        : {}),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: objectPlacementKey,
        props: {
          // Draw the parked caret on the object's own line (the text caret
          // itself is transparent while parked).
          decorations(state) {
            if (documentBoundaryInteractionKey.getState(state) !== "idle") {
              return null;
            }
            const parked = parkedBlockObjectSide(state);
            if (!parked) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(parked.pos, parked.pos + parked.node.nodeSize, {
                "data-object-boundary-caret": parked.side,
              }),
            ]);
          },
          // The boundary policy (priority 1000) turns a parked caret into a
          // typing caret on the keydown of the first printable key, BEFORE
          // handleTextInput sees the text. Mint the inline form on that
          // keydown instead, then let the character arrive normally in the
          // new paragraph.
          handleKeyDown(view, event) {
            if (
              !view.editable ||
              event.key.length !== 1 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              isImeCompositionActive(view, event)
            ) {
              return false;
            }
            const parked = parkedBlockObjectSide(view.state);
            if (!parked) return false;
            insertTextBesideBlockObject(view, parked.pos, parked.side, "");
            return false;
          },
          // Before the click's own leaf selection (which took the whole
          // equation for a click in the blank before it).
          handleClick(view, _pos, event) {
            if (!view.editable || isImeCompositionActive(view, event)) return false;
            const caret = inlineEquationSideTarget(view, event);
            if (caret === null) return false;
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.create(view.state.doc, caret))
                .setMeta(documentBoundaryInteractionKey, "keyboard"),
            );
            if (!view.hasFocus()) view.focus();
            return true;
          },
          handleTextInput(view, from, to, text) {
            if (!text || isImeCompositionActive(view)) return false;
            const { selection } = view.state;
            if (from !== selection.from || to !== selection.to) return false;
            const parked = parkedBlockObjectSide(view.state);
            if (!parked) return false;
            return insertTextBesideBlockObject(
              view,
              parked.pos,
              parked.side,
              text,
            );
          },
          handleDOMEvents: {
            // Text that arrives WITHOUT a keydown (an IME commit, dictation,
            // insertText): convert before the browser edits the DOM, so the
            // text lands in the new paragraph beside the object rather than
            // in the neighbouring block the caret was parked in.
            beforeinput(view, event) {
              const input = event as InputEvent;
              if (
                !view.editable ||
                input.inputType !== "insertText" ||
                !input.data ||
                isImeCompositionActive(view)
              ) {
                return false;
              }
              const parked = parkedBlockObjectSide(view.state);
              if (!parked) return false;
              // Insert the text ourselves and cancel the browser's edit: the
              // browser would otherwise insert at the DOM caret it captured
              // before the conversion, which put a second character before
              // the first one.
              if (
                !insertTextBesideBlockObject(
                  view,
                  parked.pos,
                  parked.side,
                  input.data,
                )
              ) {
                return false;
              }
              event.preventDefault();
              return true;
            },
            compositionstart(view) {
              if (!view.editable) return false;
              const parked = parkedBlockObjectSide(view.state);
              if (parked) {
                insertTextBesideBlockObject(
                  view,
                  parked.pos,
                  parked.side,
                  "",
                  true,
                );
              }
              return false;
            },
            mousedown(view, event) {
              if (
                !view.editable ||
                event.button !== 0 ||
                event.shiftKey ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                event.detail > 1 ||
                isImeCompositionActive(view, event)
              ) {
                return false;
              }
              const target = gutterTarget(view, event);
              if (!target) return false;
              if (!placeCaretBesideBlockObject(view, target.pos, target.side)) {
                return false;
              }
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

export default ObjectPlacement;
