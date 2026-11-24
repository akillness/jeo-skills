"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Equation PLACEMENT — one equation, two presentations, and the caret rules that
 * move between them. Shared by the `mathBlock` / `inlineMath` node views, their
 * keymaps, and the Formula contextual ribbon so there is exactly one
 * implementation of each rule.
 *
 * ## Microsoft behaviour this reproduces
 *
 * OOXML (ECMA-376 Part 1, §22.1.2) gives one equation two spellings:
 *
 *   • `<m:oMath>` sitting among a paragraph's runs — an INLINE equation.
 *   • `<m:oMathPara>` wrapping one or more `<m:oMath>` zones as the whole
 *     paragraph — a DISPLAY equation. Its only property container is
 *     `<m:oMathParaPr>`, whose single child `<m:jc>` carries the justification
 *     (`left` / `center` / `right` / `centerGroup`, default `centerGroup`).
 *
 * Word models these as the SAME object in two states, not two objects: the
 * object model exposes `OMath.Type` as a read/WRITE `WdOMathType`
 * (`wdOMathInline` / `wdOMathDisplay`), and the equation frame's own dropdown
 * offers "Change to Inline" / "Change to Display". Consequently:
 *
 *   1. Converting never rebuilds the mathematics. Only the wrapper changes, so
 *      no `m:oMath` child, no run property and no LaTeX is lost either way.
 *   2. `m:oMathParaPr/m:jc` is meaningful ONLY while the equation is display.
 *      Going inline drops it (there is nowhere to store it); coming back to
 *      display starts again from Word's default justification.
 *   3. Word decides the placement of a NEW equation from its paragraph: an
 *      otherwise-empty paragraph gives a display equation, a paragraph holding
 *      any other character (even a single space or tab) gives an inline one,
 *      at the caret, without splitting the paragraph.
 *      `equationPlacementForInsertion` / `planEquationInsertion` is that rule.
 *   4. A display equation owns its paragraph mark. Backspacing at the start of
 *      that paragraph merges it into the paragraph above — and because the
 *      equation is then no longer alone in a paragraph, it is an inline equation
 *      from that point on. That is Word's fast route from display to inline, and
 *      `convertDisplayEquationBeforeCursor` is it. `Delete` at the end of the
 *      paragraph above is the same merge approached from the other side.
 *   5. Arrow keys do not stop at the edge of the equation's content: pressing
 *      Left with the caret at the very start of the equation moves it OUT of
 *      the equation, to the position before the whole structure (Right at the
 *      end, symmetrically). Clicking the empty area inside the equation's frame
 *      but beside its content puts the caret on that side of the structure.
 *      `placeCaretOutsideEquation` is that single landing rule; it delegates to
 *      the document's own boundary-selection policy, so the caret lands exactly
 *      where clicking the page margin beside the same object lands it.
 *   6. An inline equation is a math zone in the run of text: the caret stands
 *      right before or after it, and the arrows go INTO it from there (Right
 *      at its start, Left at its end), through it, and out on the far side.
 *      Backspace after it or Delete before it selects the whole equation;
 *      the next press deletes it (`inlineEquationBesideCaret`,
 *      `selectInlineEquationBesideCaret`).
 *   7. Insert > Equation with words selected makes those words the equation
 *      (`planEquationInsertion`), in their place in the line.
 *
 * Nothing here reads or writes Office markup directly: the DOCX export chain
 * already writes `mathBlock` as `<m:oMathPara>` (with `m:oMathParaPr/m:jc` when
 * the block carries an explicit alignment) and `inlineMath` as a bare
 * `<m:oMath>`, and the importer maps them back the same way. Keeping the
 * conversion a pure node-type + attribute projection is what makes the round
 * trip survive it.
 */

import { pxToPtRounded } from "../../../../lib/office-units";
import { normalizeTextColor } from "./TextStyling";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  generateNativeBlockId,
  MRNOTE_BLOCK_ID_ATTR,
} from "../native-document/blockIds";
import {
  isParkedBoundaryText,
  parkSelectionAtBoundary,
} from "../native-document/documentBoundaryInteraction";
import { DELETION_MARK_NAME } from "../native-document/trackChanges";
import {
  SPLIT_CONTINUATION_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "../native-document/paged/paginationProjectionKeys";
import { fragmentCarries } from "../native-document/paged/fragmentRoles";

/** Word's two equation placements (`WdOMathType`). */
export type EquationPlacement = "display" | "inline";

/** Which editor node spells each placement. */
export const EQUATION_NODE_BY_PLACEMENT: Readonly<
  Record<EquationPlacement, string>
> = Object.freeze({ display: "mathBlock", inline: "inlineMath" });

const PLACEMENT_BY_NODE_NAME: Readonly<Record<string, EquationPlacement>> =
  Object.freeze({ mathBlock: "display", inlineMath: "inline" });

/** Placement of an equation node, or `null` for anything that is not one. */
export function equationPlacementOfNodeName(
  name: string | undefined,
): EquationPlacement | null {
  return name ? (PLACEMENT_BY_NODE_NAME[name] ?? null) : null;
}

/** True when the node is one of the two equation atoms. */
export function isEquationNode(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && equationPlacementOfNodeName(node.type.name));
}

/**
 * Attributes that exist only while the equation is a display equation, because
 * they have no OOXML home on a bare inline `<m:oMath>`:
 *   • `textAlign` is `m:oMathParaPr/m:jc` (and the host paragraph's `w:jc`).
 *   • `sourcePageBreakBefore` is the imported `w:pageBreakBefore` of the
 *     display equation's own paragraph.
 * Everything else — the LaTeX itself plus the editing/rendering identity
 * (`inputMode`, `layoutMode`, `fontSize`, `mathStyle`) — belongs to the
 * equation and survives every conversion.
 */
const DISPLAY_ONLY_ATTRS = Object.freeze(["textAlign", "sourcePageBreakBefore"]);

/**
 * Project one equation's attributes onto the other placement. Only attributes
 * the target node's schema actually declares are kept, so a schema change can
 * never smuggle an unknown attribute into `setNodeMarkup`.
 */
export function projectEquationAttrs(
  attrs: Record<string, unknown> | null | undefined,
  placement: EquationPlacement,
  targetSpecAttrs?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const source = attrs ?? {};
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (placement === "inline" && DISPLAY_ONLY_ATTRS.includes(key)) continue;
    if (key === MRNOTE_BLOCK_ID_ATTR) continue;
    if (targetSpecAttrs && !(key in targetSpecAttrs)) continue;
    projected[key] = value;
  }
  return projected;
}

/**
 * Word's rule for a NEW equation: display when the caret sits in an otherwise
 * empty paragraph, inline as soon as the paragraph holds any other character.
 */
export function equationPlacementForInsertion(
  view: EditorView,
): EquationPlacement {
  const { $from, empty } = view.state.selection;
  if (!empty) return "inline";
  const parent = $from.parent;
  if (!parent.isTextblock) return "display";
  return parent.content.size === 0 ? "display" : "inline";
}

/**
 * An equation payload re-addressed to the placement the caret's paragraph
 * gives it: a gallery or catalog equation becomes inline among words and
 * display on an empty line, as every equation Word inserts does.
 */
export function equationPayloadForInsertion<
  T extends { readonly type: string },
>(view: EditorView, payload: T): T {
  if (!equationPlacementOfNodeName(payload.type)) return payload;
  const type = EQUATION_NODE_BY_PLACEMENT[equationPlacementForInsertion(view)];
  return type === payload.type ? payload : { ...payload, type };
}

/**
 * What Word's Insert > Equation (Insert New Equation, Alt+=) makes of the
 * current selection.
 *
 *   • A caret: a display equation in an otherwise-empty paragraph, an inline
 *     one AT the caret among the paragraph's words (rule 3 above). Nothing
 *     else moves: the words before and after the caret stay one paragraph.
 *   • Words selected inside one paragraph: those words become the equation,
 *     in their place (`replace`), read as its LaTeX. When they are
 *     the whole paragraph the equation is then alone in it, so it is display.
 *   • Anything else selected (several paragraphs, a picture): a new inline
 *     equation at the selection's end, the selection left as it was.
 */
export interface EquationInsertionPlan {
  readonly placement: EquationPlacement;
  /** The selected words the equation replaces; `null` inserts at the caret. */
  readonly replace: { readonly from: number; readonly to: number } | null;
  /** The new equation's LaTeX: the selected words, else empty. */
  readonly latex: string;
}

/**
 * The selected words as the equation's LaTeX (the spelling the equation
 * stores, and what "Convert to Equation" reads text as): math delimiters
 * around them are dropped, and the characters LaTeX would read as commands
 * of its own (#, %, &) stand for themselves.
 */
export function equationLatexFromWords(words: string): string {
  let text = words.trim();
  for (const [open, close] of [["$$", "$$"], ["\\[", "\\]"], ["\\(", "\\)"], ["$", "$"]] as const) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, text.length - close.length).trim();
      break;
    }
  }
  return text.replace(/(^|[^\\])([#%&])/g, "$1\\$2");
}

export function planEquationInsertion(state: EditorState): EquationInsertionPlan {
  const { selection } = state;
  const { $from, $to, empty } = selection;
  if (empty) {
    const parent = $from.parent;
    const display = !parent.isTextblock || parent.content.size === 0;
    return { placement: display ? "display" : "inline", replace: null, latex: "" };
  }
  const parent = $from.parent;
  let onlyWords =
    selection instanceof TextSelection &&
    parent.isTextblock &&
    !parent.type.spec.code &&
    $from.sameParent($to);
  if (onlyWords) {
    // Only words: a picture, a field or another equation in the range is
    // not something a math zone can be typed from.
    parent.nodesBetween($from.parentOffset, $to.parentOffset, (node) => {
      if (!node.isText) onlyWords = false;
      return false;
    });
  }
  const latex = onlyWords
    ? equationLatexFromWords(state.doc.textBetween(selection.from, selection.to))
    : "";
  if (!latex) return { placement: "inline", replace: null, latex: "" };
  const displayType = state.schema.nodes[EQUATION_NODE_BY_PLACEMENT.display];
  const whole =
    selection.from === $from.start() &&
    selection.to === $from.end() &&
    $from.depth > 0 &&
    !!displayType &&
    // A list item's or cell's first paragraph cannot become a block equation.
    $from
      .node($from.depth - 1)
      .canReplaceWith($from.index($from.depth - 1), $from.index($from.depth - 1) + 1, displayType);
  return whole
    ? {
        placement: "display",
        replace: { from: $from.before(), to: $from.after() },
        latex,
      }
    : {
        placement: "inline",
        replace: { from: selection.from, to: selection.to },
        latex,
      };
}

/**
 * The inline equation right beside an empty text caret, on `side` of it, or
 * `null`. This is the position Word's caret stands at before (after) a math
 * zone in a line of text.
 */
export function inlineEquationBesideCaret(
  state: EditorState,
  side: "before" | "after",
): { pos: number; node: ProseMirrorNode } | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  const node = side === "after" ? $from.nodeAfter : $from.nodeBefore;
  if (!node || equationPlacementOfNodeName(node.type.name) !== "inline") return null;
  // A tracked deletion is struck through, not there to be edited or deleted
  // again: the keys step over it as over deleted words.
  if (node.marks.some((mark) => mark.type.name === DELETION_MARK_NAME)) return null;
  return { pos: side === "after" ? $from.pos : $from.pos - node.nodeSize, node };
}

/**
 * Backspace (the equation before the caret) or Delete (the one after it)
 * beside an inline equation: Word selects the whole math zone first, and the
 * next press deletes it. Only the selection changes here; the second press
 * finds the equation selected and ProseMirror's own deletion removes it.
 */
export function selectInlineEquationBesideCaret(
  view: EditorView,
  side: "before" | "after",
): boolean {
  if (!view.editable) return false;
  const beside = inlineEquationBesideCaret(view.state, side);
  if (!beside) return false;
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, beside.pos))
      .scrollIntoView(),
  );
  return true;
}

/** The live equation node at `pos`, or `null` when it has moved or changed. */
function equationAt(
  view: EditorView,
  pos: number,
  expected?: EquationPlacement,
): ProseMirrorNode | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= view.state.doc.content.size) {
    return null;
  }
  const node = view.state.doc.nodeAt(pos);
  const placement = equationPlacementOfNodeName(node?.type.name);
  if (!node || !placement) return null;
  if (expected && placement !== expected) return null;
  return node;
}

/**
 * Put the caret just OUTSIDE the equation at `pos`, on `side`.
 *
 * This is both the Left/Right escape from the equation's first/last content
 * position and the click on the frame's empty area beside the content. Selection
 * is view state, so the transaction carries no document change at all.
 */
export function placeCaretOutsideEquation(
  view: EditorView,
  pos: number,
  side: "before" | "after",
): boolean {
  const node = equationAt(view, pos);
  if (!node) return false;
  const boundary = side === "before" ? pos : pos + node.nodeSize;
  if (node.isInline) {
    // Inside a paragraph there is always a real text position on either side.
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, boundary)),
    );
  } else {
    // A display equation's "before"/"after" is the document's own parked
    // boundary: a GapCursor where one is valid, otherwise a caret parked at
    // the neighbouring paragraph's edge with `idle` intent — the state a
    // margin click beside the same object produces, and the state Backspace
    // reads as "before the structure" rather than "end of that paragraph".
    parkSelectionAtBoundary(view, boundary, side === "before" ? -1 : 1);
  }
  // The caret is in the document again, not in the equation's own field.
  if (!view.hasFocus()) view.focus();
  return true;
}

/**
 * Which side of the equation's content a pointer landed on, for a click that hit
 * the equation frame's own empty area rather than the mathematics.
 *
 * A display equation is centered inside a full-width frame, so the frame carries
 * real empty gutters; Word puts the caret before the equation for a click in the
 * left gutter and after it for the right one. Returns `null` for a click that is
 * horizontally over the content (the frame's padding above/below it), which must
 * keep the node view's own behaviour.
 *
 * PURE — takes only geometry, so the rule is unit-testable without a DOM.
 */
export function equationGutterSide(
  clientX: number,
  content: { readonly left: number; readonly right: number },
): "before" | "after" | null {
  if (!(content.right > content.left)) return null;
  if (clientX < content.left) return "before";
  if (clientX > content.right) return "after";
  return null;
}

/**
 * Display → inline: drop the `<m:oMathPara>` wrapper and hand the equation to
 * the preceding paragraph as a bare `<m:oMath>` run.
 *
 * Returns false — leaving the caller's key to its default handling — when there
 * is no preceding text paragraph to merge into, which is exactly when Word's
 * Backspace at the start of the first paragraph also does nothing.
 */
export function convertDisplayEquationToInline(
  view: EditorView,
  pos: number,
  /**
   * `caret` (the Backspace/Delete merge) leaves a text caret right after the
   * now-inline equation, as Word's paragraph merge does; `node` (the explicit
   * "Change to Inline" command) keeps the equation itself selected so the
   * Formula ribbon stays on it.
   */
  select: "caret" | "node" = "caret",
  






  standalone: "merge" | "paragraph" = "merge",
): boolean {
  const node = equationAt(view, pos, "display");
  if (!node || !view.editable) return false;
  const inlineType = view.state.schema.nodes[EQUATION_NODE_BY_PLACEMENT.inline];
  if (!inlineType) return false;

  const $pos = view.state.doc.resolve(pos);
  const before = $pos.nodeBefore;
  const receives =
    !!before &&
    before.isTextblock &&
    // The receiving paragraph must actually accept an inline equation at its end.
    before.contentMatchAt(before.childCount).matchType(inlineType) !== null;
  // The colour the display form carried as an attribute is the inline
  
  const colorType = view.state.schema.marks.textColor;
  const inlineColor = normalizeTextColor(node.attrs.textColor);
  const inline = inlineType.create(
    projectEquationAttrs(node.attrs, "inline", inlineType.spec.attrs),
    undefined,
    colorType && inlineColor ? [colorType.create({ color: inlineColor })] : undefined,
  );
  if (!receives) {
    if (standalone !== "paragraph") return false;
    const paragraphType = view.state.schema.nodes.paragraph;
    if (!paragraphType?.contentMatch.matchType(inlineType)) return false;
    const paragraph = paragraphType.create(null, inline);
    const transaction = view.state.tr.replaceWith(pos, pos + node.nodeSize, paragraph);
    transaction.setSelection(
      select === "node"
        ? NodeSelection.create(transaction.doc, pos + 1)
        : TextSelection.create(transaction.doc, pos + 1 + inline.nodeSize),
    );
    view.dispatch(transaction);
    return true;
  }
  // `pos - 1` is the last position INSIDE the preceding text block. Deleting the
  // block equation first cannot move it, since it lies before the deleted range.
  const transaction = view.state.tr
    .delete(pos, pos + node.nodeSize)
    .insert(pos - 1, inline);
  transaction.setSelection(
    select === "node"
      ? NodeSelection.create(transaction.doc, pos - 1)
      : TextSelection.create(transaction.doc, pos - 1 + inline.nodeSize),
  );
  view.dispatch(transaction);
  return true;
}

/** The font size an equation is drawn at, as a CSS length, or null. */
function drawnEquationFontSize(view: EditorView, pos: number): string | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const px = parseFloat(dom.ownerDocument.defaultView?.getComputedStyle(dom).fontSize ?? "");
  if (!Number.isFinite(px) || px <= 0) return null;
  return `${pxToPtRounded(px)}pt`;
}

/**
 * Inline → display: give the equation its own paragraph-level
 * `<m:oMathPara>`, splitting the host paragraph around it.
 *
 * The text before and after the equation stays in paragraphs of the same type
 * and attributes; the trailing half is minted a fresh block identity, because a
 * duplicated `block_id` would make two real paragraphs look like two fragments
 * of one.
 */
export function convertInlineEquationToDisplay(
  view: EditorView,
  pos: number,
): boolean {
  const node = equationAt(view, pos, "inline");
  if (!node || !view.editable) return false;
  const blockType = view.state.schema.nodes[EQUATION_NODE_BY_PLACEMENT.display];
  if (!blockType) return false;

  const $pos = view.state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return false;
  const parentStart = $pos.start();
  const from = $pos.before();
  const to = $pos.after();
  // The grandparent must accept a block equation where the paragraph sits.
  const $from = view.state.doc.resolve(from);
  if (!$from.parent.canReplaceWith($from.index(), $from.index() + 1, blockType)) {
    return false;
  }

  const headCut = parent.cut(0, pos - parentStart);
  const tailCut = parent.cut(pos + node.nodeSize - parentStart);
  // The page edge may have cut the host paragraph in two (the fragments
  // carry `pageSplitContinues` / `pageSplitContinuation`): the words before
  // the equation still continue the fragment on the page before, the words
  // after it are what goes on onto the next page. A fragment copied with
  // both flags claimed to be a continuation of the equation (DB: the sum at
  // a page junction left a second Σ at the foot of the page).
  const splitAware = (fragment: ProseMirrorNode, role: "head" | "tail") => {
    const specAttrs = fragment.type.spec.attrs ?? {};
    if (!(SPLIT_CONTINUES_ATTR in specAttrs) && !(SPLIT_CONTINUATION_ATTR in specAttrs)) return fragment;
    const attrs: Record<string, unknown> = { ...fragment.attrs };
    if (role === "head") {
      if (SPLIT_CONTINUES_ATTR in specAttrs) attrs[SPLIT_CONTINUES_ATTR] = false;
    } else if (SPLIT_CONTINUATION_ATTR in specAttrs) {
      attrs[SPLIT_CONTINUATION_ATTR] = false;
    }
    return fragment.type.create(attrs, fragment.content, fragment.marks);
  };
  const head = splitAware(headCut, "head");
  const tail = splitAware(tailCut, "tail");
  const attrs = projectEquationAttrs(node.attrs, "display", blockType.spec.attrs);
  // The inline formula's direct colour (its textColor mark) travels as the
  
  if ("textColor" in (blockType.spec.attrs ?? {})) {
    const colorMark = node.marks.find((mark) => mark.type.name === "textColor");
    const color = normalizeTextColor(colorMark?.attrs.color);
    if (color) attrs.textColor = color;
  }
  // An inline equation without a size of its own is the size of the words
  // around it (a heading's, say); a display equation stands alone and would
  // fall back to the body size. The same equation keeps its base size
  
  if (attrs.fontSize == null && "fontSize" in (blockType.spec.attrs ?? {})) {
    const inherited = drawnEquationFontSize(view, pos);
    if (inherited) attrs.fontSize = inherited;
  }
  const equation = blockType.create(attrs);

  const replacement: ProseMirrorNode[] = [];
  if (head.content.size > 0) replacement.push(head);
  replacement.push(equation);
  if (tail.content.size > 0) {
    replacement.push(
      MRNOTE_BLOCK_ID_ATTR in (tail.type.spec.attrs ?? {})
        ? tail.type.create(
            { ...tail.attrs, [MRNOTE_BLOCK_ID_ATTR]: generateNativeBlockId() },
            tail.content,
            tail.marks,
          )
        : tail,
    );
  }

  const transaction = view.state.tr.replaceWith(
    from,
    to,
    Fragment.fromArray(replacement),
  );
  // With no words left on one side of the equation, the fragment on the
  // neighbouring page no longer continues anything (or is continued by
  // nothing): it is a paragraph of its own again, with an identity of its own.
  const standalone = (at: number, flag: string) => {
    const fragment = transaction.doc.nodeAt(at);
    if (!fragment || !fragment.isTextblock || fragment.attrs?.[flag] !== true) return;
    const attrs: Record<string, unknown> = { ...fragment.attrs, [flag]: false };
    if (flag === SPLIT_CONTINUATION_ATTR && MRNOTE_BLOCK_ID_ATTR in (fragment.type.spec.attrs ?? {})) {
      attrs[MRNOTE_BLOCK_ID_ATTR] = generateNativeBlockId();
    }
    transaction.setNodeMarkup(at, undefined, attrs);
  };
  if (tail.content.size === 0 && parent.attrs?.[SPLIT_CONTINUES_ATTR] === true) {
    // The continuation opens the next page: the block after this page's end.
    const $after = transaction.doc.resolve(from + replacement.reduce((sum, block) => sum + block.nodeSize, 0));
    const nextPageStart = $after.after() + 1;
    if (nextPageStart < transaction.doc.content.size) standalone(nextPageStart, SPLIT_CONTINUATION_ATTR);
  }
  if (head.content.size === 0 && !fragmentCarries("paragraphStart", parent.attrs)) {
    // The fragment this one continued closes the page before.
    const $before = transaction.doc.resolve(from);
    const previousPageEnd = $before.before() - 1;
    if (previousPageEnd > 0) {
      const $end = transaction.doc.resolve(previousPageEnd);
      const last = $end.nodeBefore;
      if (last) standalone(previousPageEnd - last.nodeSize, SPLIT_CONTINUES_ATTR);
    }
  }
  const equationPos = from + (head.content.size > 0 ? head.nodeSize : 0);
  const moved = transaction.doc.nodeAt(equationPos);
  if (moved?.type === blockType) {
    transaction.setSelection(
      NodeSelection.create(transaction.doc, equationPos),
    );
  }
  view.dispatch(transaction);
  return true;
}

/** Convert the equation at `pos` to `placement`; a no-op when already there. */
export function setEquationPlacement(
  view: EditorView,
  pos: number,
  placement: EquationPlacement,
): boolean {
  const node = equationAt(view, pos);
  if (!node) return false;
  if (equationPlacementOfNodeName(node.type.name) === placement) return false;
  return placement === "inline"
    ? convertDisplayEquationToInline(view, pos, "node", "paragraph")
    : convertInlineEquationToDisplay(view, pos);
}

/**
 * Backspace with the caret sitting BEFORE a display equation: Word merges the
 * equation's paragraph upwards, which turns the equation inline. The caret may
 * be a GapCursor at that boundary (an equation that starts a page/section) or a
 * text caret in the paragraph just above it.
 */
export function convertDisplayEquationBeforeCursor(view: EditorView): boolean {
  const { selection } = view.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  // GapCursor / boundary caret: the equation is the node right after the caret.
  const after = $from.nodeAfter;
  if (after && equationPlacementOfNodeName(after.type.name) === "display") {
    return convertDisplayEquationToInline(view, $from.pos);
  }
  // A caret PARKED at the end of the paragraph above (the landing of a Left
  // escape or a gutter click when no GapCursor is valid there). A caret the
  // user is typing with at that same position keeps Backspace's ordinary
  // character deletion.
  if (!isParkedBoundaryText(view)) return false;
  return convertDisplayEquationAfterCursor(view);
}

/**
 * Delete with the caret at the END of the paragraph above a display equation —
 * the same paragraph merge as Backspace-before, approached forwards.
 */
export function convertDisplayEquationAfterCursor(view: EditorView): boolean {
  const { selection } = view.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return false;
  if ($from.parentOffset !== parent.content.size) return false;
  if ($from.depth === 0) return false;
  const blockEnd = $from.after();
  const $blockEnd = view.state.doc.resolve(blockEnd);
  const next = $blockEnd.nodeAfter;
  if (!next || equationPlacementOfNodeName(next.type.name) !== "display") {
    return false;
  }
  return convertDisplayEquationToInline(view, blockEnd);
}
