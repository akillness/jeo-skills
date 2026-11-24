"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { closeHistory } from "@tiptap/pm/history";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { generateNativeBlockId, MRNOTE_BLOCK_ID_ATTR } from "./blockIds";
import { IME_COMPOSITION_PREPARE_META, isImeCompositionActive } from "./imeCompositionGuard";
import { PAGE_BLOCK_NODE } from "./paged/pageBlockExtension";

type BoundaryIntent = "idle" | "keyboard";

export const documentBoundaryInteractionKey = new PluginKey<BoundaryIntent>(
  "documentBoundaryInteraction",
);

function selectBoundary(view: EditorView, selection: Selection): void {
  // Selection is view state, not a paragraph, document attribute or Undo step.
  view.dispatch(
    view.state.tr
      .setSelection(selection)
      .setMeta(documentBoundaryInteractionKey, "idle"),
  );
}

function gapAtBoundary(view: EditorView, pos: number): GapCursor | null {
  const $pos = view.state.doc.resolve(pos);
  // Use the installed selection policy, not GapCursor's private valid() API.
  const selection = view.someProp("createSelectionBetween", create => create(view, $pos, $pos));
  return selection instanceof GapCursor ? selection : null;
}

/**
 * The one boundary-selection policy for "put the caret just outside this
 * object": a real GapCursor where the installed selection policy allows one,
 * otherwise the nearest text position. Exported so the equation placement
 * commands (`equationPlacement.ts`) land the caret exactly where clicking the
 * page margin beside the same object lands it, instead of inventing a second
 * boundary rule.
 */
export function selectionAtBoundary(view: EditorView, pos: number, bias = -1): Selection {
  return gapAtBoundary(view, pos) ?? Selection.near(view.state.doc.resolve(pos), bias);
}

/**
 * Park the caret at an object boundary with the same `idle` intent a margin
 * click gives it: a GapCursor where one is valid, otherwise a text caret at
 * the nearest position that stays "beside the object" (no typing intent yet).
 */
export function parkSelectionAtBoundary(view: EditorView, pos: number, bias = -1): void {
  selectBoundary(view, selectionAtBoundary(view, pos, bias));
}

/**
 * True while the caret is a text selection parked beside an object (intent
 * `idle`) rather than a caret the user is typing with. Owners of block objects
 * use it to give Backspace/Delete an object meaning at that boundary.
 */
export function isParkedBoundaryText(view: EditorView): boolean {
  return isParkedText(view);
}

/** Materialize only when the user begins input, in the boundary's own parent. */
function beginBoundaryText(view: EditorView, text = "", preparingIme = false): boolean {
  if (!view.editable || isImeCompositionActive(view)) return false;
  const { state } = view;
  if (!(state.selection instanceof GapCursor)) return false;
  const { $from } = state.selection;
  const type = $from.parent.contentMatchAt($from.index()).defaultType;
  if (
    !type?.isTextblock ||
    !$from.parent.canReplaceWith($from.index(), $from.index(), type)
  ) return false;
  const content = text ? state.schema.text(text, state.storedMarks) : undefined;
  // Give the new paragraph its identity in the user transaction. A later
  // non-history ID backfill would hide this entire first edit from Yjs Undo.
  const attrs = MRNOTE_BLOCK_ID_ATTR in (type.spec.attrs ?? {})
    ? { [MRNOTE_BLOCK_ID_ATTR]: generateNativeBlockId() }
    : null;
  const paragraph = type.createAndFill(attrs, content);
  if (!paragraph) return false;

  // Do not merge this new text block into a just-inserted object's Undo event.
  // Subsequent typing/composition keeps the normal editor history grouping.
  const tr = closeHistory(state.tr)
    .setMeta(documentBoundaryInteractionKey, "input")
    .insert($from.pos, paragraph);
  if (preparingIme) tr.setMeta(IME_COMPOSITION_PREPARE_META, true);
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1 + text.length));
  view.dispatch(tr.scrollIntoView());
  return view.state.doc !== state.doc;
}

/**
 * A GapCursor has no editable text position. The keyboard path never lets the
 * browser act on it (ProseMirror's keypress handler routes a non-text selection
 * through handleTextInput and cancels the key), but text that arrives WITHOUT a
 * keypress - dictation, text replacement, the emoji picker, an IME commit
 * outside a composition, mobile keyboards - only fires beforeinput. Chrome
 * then writes the text at its canonical caret, which beside a table is inside
 * the table NodeView's wrapper: no document position maps to it, the DOM
 * change parses to zero steps, and the wrapper keeps the painted text that the
 * document (and therefore every save) does not contain. Route that input
 * through the same handleTextInput pipeline the keypress path uses, and never
 * let the browser paint it.
 */
function insertTextAtGap(view: EditorView, event: InputEvent): boolean {
  if (!(view.state.selection instanceof GapCursor)) return false;
  // Clipboard and drop are whole ProseMirror pipelines that already cancel the
  // native edit; a composition is prepared on compositionstart.
  if (!/^insert(Text|ReplacementText|Paragraph|LineBreak)$/.test(event.inputType)) return false;
  event.preventDefault();
  if (!view.editable) return true;
  if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
    beginBoundaryText(view);
    return true;
  }
  const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
  if (!text) return true;
  const { from, to } = view.state.selection;
  const insert = () => view.state.tr.insertText(text, from, to);
  if (!view.someProp("handleTextInput", handle => handle(view, from, to, text, insert))) {
    view.dispatch(insert().scrollIntoView());
  }
  return true;
}

function plainPointer(event: MouseEvent): boolean {
  return event.button === 0 && !event.shiftKey && !event.metaKey &&
    !event.ctrlKey && !event.altKey;
}

function isParkedText(view: EditorView): boolean {
  return view.state.selection instanceof TextSelection &&
    documentBoundaryInteractionKey.getState(view.state) === "idle";
}

function isBlockObjectSelection(selection: Selection): selection is NodeSelection {
  return selection instanceof NodeSelection && selection.node.isBlock &&
    (selection.node.isAtom || selection.node.type.spec.isolating === true);
}

/** An existing paragraph needs input intent, not another paragraph. */
function activateParkedText(view: EditorView, preparingIme = false): boolean {
  if (!view.editable || isImeCompositionActive(view) || !isParkedText(view)) return false;
  const tr = closeHistory(view.state.tr)
    .setMeta(documentBoundaryInteractionKey, "input")
    .setMeta("addToHistory", false);
  if (preparingIme) tr.setMeta(IME_COMPOSITION_PREPARE_META, true);
  view.dispatch(tr);
  return true;
}

function containsPoint(bounds: DOMRect, event: MouseEvent): boolean {
  return event.clientX >= bounds.left && event.clientX <= bounds.right &&
    event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function dismissAtBoundary(view: EditorView, pos: number, event: MouseEvent): boolean {
  if (!view.editable || !plainPointer(event) || isImeCompositionActive(view)) return false;
  const { selection } = view.state;
  const selectedObject = isBlockObjectSelection(selection) ? selection : null;
  const gap = gapAtBoundary(view, pos);
  if (!gap && !selectedObject && !isParkedText(view)) return false;
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  const inside = hit && hit.inside >= 0 ? view.state.doc.nodeAt(hit.inside) : null;
  // Object hits and their editable islands retain their own actions.
  if (inside && !inside.isTextblock && NodeSelection.isSelectable(inside)) return false;
  const objectDom = selectedObject ? view.nodeDOM(selectedObject.from) : null;
  if (event.target instanceof globalThis.Node && objectDom?.contains(event.target)) return false;

  const $hit = view.state.doc.resolve(hit?.pos ?? pos);
  // An empty cell belongs to the table being clicked, not to the previously
  // selected shape's surrounding blank paper. Respect the actual nested
  // object DOM even when posAtCoords reports its innermost empty paragraph.
  if (event.target instanceof globalThis.Node) {
    for (let depth = $hit.depth; depth > 0; depth -= 1) {
      const container = $hit.node(depth);
      if (container.type.name === PAGE_BLOCK_NODE ||
        (!container.isAtom && !container.type.spec.isolating)) continue;
      if (view.nodeDOM($hit.before(depth))?.contains(event.target)) return false;
    }
  }
  if ($hit.parent.isTextblock && $hit.depth > 0) {
    const textDom = view.nodeDOM($hit.before());
    if (textDom?.nodeType === 1 && containsPoint((textDom as Element).getBoundingClientRect(), event) &&
      (!selectedObject || $hit.parent.content.size > 0)) {
      // Actual text is a direct editing target. An empty line's first click
      // dismisses an object; a second click on that line can activate it.
      activateParkedText(view);
      return false;
    }
  }

  if (selectedObject && objectDom?.nodeType === 1) {
    const bounds = (objectDom as Element).getBoundingClientRect();
    if (bounds.height > 0) {
      // Page padding may hit-test to an existing paragraph far from the
      // pointer. Park at the object's visible side without entering text mode.
      const after = event.clientY >= bounds.top + bounds.height / 2;
      selectBoundary(view, selectionAtBoundary(view, after ? selectedObject.to : selectedObject.from, after ? 1 : -1));
      return true;
    }
  }
  if (!gap) {
    if (isParkedText(view)) {
      selectBoundary(view, selectionAtBoundary(view, hit?.pos ?? pos));
      return true;
    }
    return false;
  }
  const $pos = view.state.doc.resolve(pos);
  const candidates = [
    { node: $pos.nodeAfter, start: pos, side: "after" },
    { node: $pos.nodeBefore, start: pos - ($pos.nodeBefore?.nodeSize ?? 0), side: "before" },
  ] as const;
  for (const { node, start, side } of candidates) {
    if (!node?.isBlock || node.inlineContent) continue;
    const dom = view.nodeDOM(start);
    if (dom?.nodeType !== 1) continue;
    const bounds = (dom as Element).getBoundingClientRect();
    if (!bounds.height || !bounds.width) continue;
    // Browsers may choose a leaf's leading edge from its x coordinate even
    // when the pointer is below it. Honor the visible vertical boundary.
    if (side === "after" && event.clientY >= bounds.bottom) {
      selectBoundary(view, selectionAtBoundary(view, start + node.nodeSize, 1));
      return true;
    }
    if (side === "before" && event.clientY <= bounds.top) {
      selectBoundary(view, selectionAtBoundary(view, start, -1));
      return true;
    }
  }
  selectBoundary(view, gap);
  return true;
}

function selectBelowLastSheet(view: EditorView, event: MouseEvent): boolean {
  if (event.target !== view.dom) return false;
  const sheets = view.dom.querySelectorAll<HTMLElement>(":scope > article[data-page-sheet]");
  const last = sheets.item(sheets.length - 1);
  if (!last || event.clientY <= last.getBoundingClientRect().bottom) return false;
  const { doc } = view.state;
  const page = doc.lastChild;
  if (!page || page.type.name !== PAGE_BLOCK_NODE) return false;
  const end = doc.content.size - page.nodeSize + 1 + page.content.size;
  const target = selectionAtBoundary(view, end);
  if (isBlockObjectSelection(view.state.selection) || view.state.selection instanceof GapCursor || isParkedText(view)) {
    selectBoundary(view, target);
  } else {
    // Ordinary body editing below the paper is not object dismissal.
    view.dispatch(view.state.tr.setSelection(target).setMeta(documentBoundaryInteractionKey, "keyboard"));
  }
  event.preventDefault();
  view.focus();
  return true;
}

/** Reuse the same intent policy for paper margins outside the editable DOM. */
export function dismissDocumentObjectFromSurface(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || !plainPointer(event) || isImeCompositionActive(view, event)) return false;
  if (!isBlockObjectSelection(view.state.selection) &&
    !(view.state.selection instanceof GapCursor) && !isParkedText(view)) return false;
  const rect = view.dom.getBoundingClientRect();
  const hit = view.posAtCoords({
    left: Math.min(Math.max(event.clientX, rect.left + 1), rect.right - 1),
    top: Math.min(Math.max(event.clientY, rect.top + 1), rect.bottom - 1),
  });
  const handled = dismissAtBoundary(view, hit?.pos ?? view.state.selection.to, event);
  if (handled) view.focus();
  return handled;
}

/** The root's `data-document-boundary-intent`: idle at a boundary, keyboard, text or none. */
function boundaryIntentAttribute(state: EditorState): "idle" | "keyboard" | "text" | "none" {
  return documentBoundaryInteractionKey.getState(state) === "idle" &&
    (state.selection instanceof GapCursor || state.selection instanceof TextSelection)
    ? "idle" : state.selection instanceof GapCursor ? "keyboard"
    : state.selection instanceof TextSelection ? "text" : "none";
}

/** On the paragraph holding a parked caret: the stylesheet hides its caret. */
export const PARKED_CARET_ATTR = "data-document-parked-caret";

/**
 * The parked caret is hidden on its own paragraph, not on the editor root.
 * caret-color is inherited, so a value that changed on the root restyled
 * every element of the document: each click into the text (which parks the
 * caret) and the first key after it (which takes it up) cost 240-410 ms in
 * WebKit on a 16-sheet document, one paragraph costs nothing measurable.
 */
function parkedCaretDecorations(state: EditorState): DecorationSet {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || documentBoundaryInteractionKey.getState(state) !== "idle") {
    return DecorationSet.empty;
  }
  const { $head } = selection;
  if (!$head.parent.isTextblock || $head.depth < 1) return DecorationSet.empty;
  const from = $head.before();
  return DecorationSet.create(state.doc, [
    Decoration.node(from, from + $head.parent.nodeSize, { [PARKED_CARET_ATTR]: "true" }),
  ]);
}

export const DocumentBoundaryInteraction = Extension.create({
  name: "documentBoundaryInteraction",
  // Ahead of GapCursor's default click/key handlers, below IME/read-only guards.
  priority: 1_000,

  addProseMirrorPlugins() {
    return [new Plugin<BoundaryIntent>({
      key: documentBoundaryInteractionKey,
      state: {
        init: () => "keyboard",
        apply(tr, previous, oldState, state) {
          if (tr.getMeta(documentBoundaryInteractionKey) === "input") {
            // Collaboration replaces ordinary history. Fence the owner's
            // manager when this transaction is applied, including input
            // forwarded from a split view without its own Yjs binding.
            yUndoPluginKey.getState(oldState)?.undoManager.stopCapturing();
          }
          const intent = tr.getMeta(documentBoundaryInteractionKey);
          if (intent === "input") return "keyboard";
          if (intent === "idle" || intent === "keyboard") return intent;
          if (tr.getMeta("pointer")) return state.selection instanceof GapCursor ? "idle" : "keyboard";
          if (previous === "idle" && state.selection instanceof TextSelection &&
            state.selection.eq(oldState.selection.map(tr.doc, tr.mapping))) return "idle";
          if (!(state.selection instanceof GapCursor)) return "keyboard";
          // Background mapping/pagination is not new keyboard intent.
          return previous;
        },
      },
      view(editorView) {
        // The stylesheet keys the band strips' hover on the page's editor
        // being editable and idle at a boundary. It reads that off the
        // columns box around the editor, mirrored here (a story editor
        // inside the layer speaks for nothing): a :has() reaching into the
        // editor for the root's attribute was re-evaluated on every keystroke
        // and recalculated the whole document's styles each time.
        const sync = (view: EditorView) => {
          const root = view.dom;
          if (root.classList.contains("sheet-band-story")) return;
          const columns = root.closest<HTMLElement>(".note-editor-content-columns");
          if (!columns) return;
          const idle = view.editable && boundaryIntentAttribute(view.state) === "idle";
          if (idle) columns.setAttribute("data-editor-boundary-idle", "true");
          else columns.removeAttribute("data-editor-boundary-idle");
        };
        sync(editorView);
        return { update: sync };
      },
      props: {
        attributes(state) {
          return { "data-document-boundary-intent": boundaryIntentAttribute(state) };
        },
        decorations: parkedCaretDecorations,
        handleClick: dismissAtBoundary,
        handleDoubleClick: dismissAtBoundary,
        handleTripleClick: dismissAtBoundary,
        handleTextInput(view, from, to, text) {
          const { selection } = view.state;
          if (!text || from !== selection.from || to !== selection.to) return false;
          if (selection instanceof GapCursor) return beginBoundaryText(view, text);
          activateParkedText(view);
          return false;
        },
        handleKeyDown(view, event) {
          if (!view.editable || isImeCompositionActive(view, event)) return false;
          const { selection } = view.state;
          const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
          if (plain && event.key === "Escape") {
            if (selection instanceof GapCursor || isParkedText(view)) {
              selectBoundary(view, selection);
              return true;
            }
            if (isBlockObjectSelection(selection)) {
              selectBoundary(view, selectionAtBoundary(view, selection.to, 1));
              return true;
            }
          }
          if (isParkedText(view) &&
            (/^(Enter|Backspace|Delete|Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key) ||
              (event.key.length === 1 && !event.ctrlKey && !event.metaKey))) {
            const emptyLine = selection.$from.parent.isTextblock && selection.$from.parent.content.size === 0;
            activateParkedText(view);
            if (plain && event.key === "Enter" && emptyLine) return true;
          }
          if (!(selection instanceof GapCursor)) return false;
          if (plain && event.key === "Enter") return beginBoundaryText(view);
          if (/^(Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key) &&
            documentBoundaryInteractionKey.getState(view.state) === "idle") {
            view.dispatch(view.state.tr.setMeta(documentBoundaryInteractionKey, "keyboard"));
          }
          // Keep upstream GapCursor navigation and normal modified shortcuts.
          return false;
        },
        handleDOMEvents: {
          paste(view) {
            activateParkedText(view);
            if (view.editable && !isImeCompositionActive(view) &&
              view.state.selection instanceof GapCursor) {
              // Fence history only. Existing clipboard parsers/handlers still
              // decide whether the paste contains text, tables or objects.
              view.dispatch(closeHistory(view.state.tr)
                .setMeta(documentBoundaryInteractionKey, "input")
                .setMeta("addToHistory", false));
            }
            return false;
          },
          compositionstart(view) {
            // Run BEFORE ProseMirror/IME guard establish the composing DOM.
            // Do not redraw a live composition or bypass its transaction guard.
            if (!activateParkedText(view, true)) beginBoundaryText(view, "", true);
            return false;
          },
          beforeinput(view, event) {
            if (isImeCompositionActive(view, event)) return false;
            if (!/^(insert|delete)/.test(event.inputType)) return false;
            activateParkedText(view);
            return insertTextAtGap(view, event);
          },
          mousedown(view, event) {
            if (!view.editable || !plainPointer(event) ||
              isImeCompositionActive(view, event)) return false;
            // The paper tail has its own end-of-document target, independent
            // of which object happened to be selected above it.
            if (selectBelowLastSheet(view, event)) return true;
            if (isBlockObjectSelection(view.state.selection) || isParkedText(view)) {
              // WebKit may synchronize a paragraph TextSelection before
              // mouseup. Resolve a plain dismissal before that native change;
              // real text, object controls and modified gestures pass through.
              const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (hit && dismissAtBoundary(view, hit.pos, event)) {
                event.preventDefault();
                view.focus();
                return true;
              }
            }
            return false;
          },
        },
      },
    })];
  },
});

export default DocumentBoundaryInteraction;
