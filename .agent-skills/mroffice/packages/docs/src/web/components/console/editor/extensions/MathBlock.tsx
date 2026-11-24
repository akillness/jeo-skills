/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { normalizeTextColor } from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import {
  Node,
  mergeAttributes,
  nodeInputRule,
  type RawCommands,
} from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
  EQUATION_DRAG_OUT_EVENT,
  EQUATION_POINTER_SELECT_EVENT,
  pressOpensEquationEditor,
  type EquationDragOutDetail,
  type EquationPointerSelectDetail,
} from "./equationPress";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import "katex/dist/katex.min.css";
import {
  clearLazyMathPlaceholderGeometry,
  normalizeInlineMathStyle,
  hasKatexMarkupCached,
  applyLazyMathPlaceholderGeometry,
  carryFormulaState,
  formulaBoxOf,
  formulaWasNearView,
  markFormulaNearView,
  observeLazyRender,
  renderKatexCached,
  WORD_MATH_ALIGNED_ATTR,
} from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import {
  createVisualMathEditor,
  DEFAULT_VISUAL_MATH_EDITOR_LABELS,
  EMPTY_EQUATION_PLACEHOLDER_LATEX,
  INSERT_VISUAL_MATH_STRUCTURE_EVENT,
  OPEN_VISUAL_MATH_EDITOR_EVENT,
  type OpenVisualMathEditorDetail,
  reopenSelectedVisualMathEditor,
  resolveVisualMathStructureInsertRequest,
  type VisualMathEditorController,
  type VisualMathEditorLabels,
  type VisualMathEditorState,
  type VisualMathNodeIdentity,
} from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import {
  type EquationInputMode,
  type EquationLayoutMode,
  normalizeEquationInputMode,
  normalizeEquationLayoutMode,
} from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import { holdEquationInPlace } from "./equationInPlace";
import { EquationSelection } from "./equationSelection";
import { ObjectLineCaret } from "./objectLineCaret";
import { ObjectMove } from "./objectMove";
import { ObjectPlacement } from "@mrnote/core/web/components/console/editor/extensions/objectPlacement.ts";
import {
  equationGutterSide,
  placeCaretOutsideEquation,
  setEquationPlacement,
  type EquationPlacement,
} from "@mrnote/core/web/components/console/editor/extensions/equationPlacement.ts";
import { latexToEquationText } from "@mrnote/core/web/components/console/editor/extensions/equationLinearFormat.ts";
import { wordDisplayLatex } from "@mrnote/core/web/components/console/editor/extensions/wordDisplayMath.ts";
import { applyWordDisplayMathBox } from "@mrnote/core/web/components/console/editor/extensions/wordMathMetrics.ts";
import { latexToReversibleWordLinear } from "@mrnote/core/web/lib/unicode-math/index.ts";
import { registerEquationDraftCommit } from "./equationDraftCommit";
import { noteEquationEditorOpen } from "./openEquationEditors";
import {
  handOnEquationDraft,
  noteEquationDraftOpen,
  takeUpEquationDraft,
  type CarriedEquationDraft,
  type EquationDraftIdentity,
} from "./equationDraftCarry";

// ---------------------------------------------------------------------------
// Vanilla ProseMirror node view
// ---------------------------------------------------------------------------
//
// This was a ReactNodeViewRenderer component. A formula-dense import (a
// math textbook projects to ~2.5k mathBlock + ~7.7k inlineMath nodes)
// meant ~10k React portals hanging off the editor's React root — every
// keystroke's reconciliation walked all of them and typing latency hit
// whole seconds. A vanilla node view is plain DOM the React tree never
// sees; ProseMirror leaves untouched nodes alone on each transaction, so
// the per-keystroke cost no longer scales with formula count.

export interface MathBlockOptions {
  /** Placeholder for the LaTeX textarea while editing. */
  placeholder: string;
  /** Tooltip on the rendered formula ("double-click to edit"). */
  editHint: string;
  /** Localized copy for the visual + LaTeX dual-mode equation editor. */
  editorLabels: VisualMathEditorLabels;
}

function normalizeMathBlockTextAlign(
  value: unknown,
): "left" | "center" | "right" | null {
  return value === "left" || value === "center" || value === "right"
    ? value
    : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMathBlockNodeView(options: MathBlockOptions): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ({ node, editor, getPos }: any) => {
    const wrapper = document.createElement("div");
    wrapper.className = "math-block-wrapper";
    const preview = document.createElement("div");
    preview.className = "math-block-preview";
    if (options.editHint) preview.title = options.editHint;
    // Roving focus: only a ProseMirror-selected formula enters the sequential
    // tab order, so large textbooks do not expose thousands of Tab stops.
    preview.tabIndex = -1;
    preview.setAttribute("role", "button");
    preview.setAttribute(
      "aria-label",
      options.editHint || options.editorLabels.label,
    );
    wrapper.appendChild(preview);

    // Font size travels as a node attribute (a block atom carries no text
    // mark). The preview scales the em-relative KaTeX to match.
    const applyFontSize = (size: unknown) => {
      wrapper.style.fontSize = typeof size === "string" && size ? size : "";
    };
    applyFontSize(node.attrs.fontSize);

    const applyTextColor = (value: unknown) => {
      const color = normalizeTextColor(value);
      wrapper.style.color = color ?? "";
    };
    applyTextColor(node.attrs.textColor);

    const applyTextAlign = (value: unknown) => {
      const align = normalizeMathBlockTextAlign(value);
      if (align) wrapper.setAttribute("data-text-align", align);
      else wrapper.removeAttribute("data-text-align");
    };
    applyTextAlign(node.attrs.textAlign);

    let currentMathStyle = normalizeInlineMathStyle(node.attrs.mathStyle);
    let currentAlignedLines: unknown = node.attrs.mathAlignedLines;
    const applyMathStyle = (style: unknown) => {
      currentMathStyle = normalizeInlineMathStyle(style);
      if (currentMathStyle) {
        wrapper.setAttribute("data-math-style", currentMathStyle);
        preview.setAttribute("data-math-style", currentMathStyle);
      } else {
        wrapper.removeAttribute("data-math-style");
        preview.removeAttribute("data-math-style");
      }
    };
    applyMathStyle(node.attrs.mathStyle);

    const applySourcePageBreak = (value: unknown) => {
      if (value === true) {
        wrapper.setAttribute("data-source-page-break-before", "true");
      } else {
        wrapper.removeAttribute("data-source-page-break-before");
      }
    };
    applySourcePageBreak(node.attrs.sourcePageBreakBefore);

    // The node instance this view draws (a block moved to another page
    // keeps it): whether its formula was near the viewport, and its typeset
    // box, are kept by it (lazyKatex).
    let currentNode: object = node;
    let currentLatex: string = node.attrs.latex || "";
    let currentInputMode = normalizeEquationInputMode(node.attrs.inputMode);
    let currentLayoutMode = normalizeEquationLayoutMode(node.attrs.layoutMode);
    let editing = false;
    let draftLatex: string | null = null;
    let releaseInPlace: (() => void) | null = null;
    let destroyed = false;
    let editingBaseState: VisualMathEditorState | null = null;
    let visualEditor: VisualMathEditorController | null = null;
    let cancelLazy: (() => void) | null = null;
    // What an open editor's draft is kept by when this view is rebuilt
    // (equationDraftCarry): the node it draws and its block id.
    const draftIdentity = (): EquationDraftIdentity => {
      const id = (currentNode as { attrs?: { block_id?: unknown } }).attrs?.block_id;
      return { node: currentNode, id: typeof id === "string" && id ? id : null };
    };
    let openDraftIdentity: EquationDraftIdentity | null = null;
    const noteDraftOpen = (open: boolean) => {
      if (openDraftIdentity) noteEquationDraftOpen(editor, openDraftIdentity, false);
      openDraftIdentity = open ? draftIdentity() : null;
      if (openDraftIdentity) noteEquationDraftOpen(editor, openDraftIdentity, true);
    };

    const readNodeIdentity = (): VisualMathNodeIdentity | null => {
      if (destroyed) return null;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (typeof pos !== "number") return null;
      const current = editor.state.doc.nodeAt(pos);
      if (current?.type.name !== "mathBlock") return null;
      return {
        pos,
        nodeType: "mathBlock",
        latex: String(current.attrs.latex ?? ""),
        inputMode: normalizeEquationInputMode(current.attrs.inputMode),
        layoutMode: normalizeEquationLayoutMode(current.attrs.layoutMode),
      };
    };

    const renderPreview = () => {
      cancelLazy?.();
      cancelLazy = null;
      preview.setAttribute(
        "aria-disabled",
        !destroyed && editor.isEditable ? "false" : "true",
      );
      wrapper.setAttribute("data-equation-input-mode", currentInputMode);
      wrapper.setAttribute("data-equation-layout-mode", currentLayoutMode);
      // The unseen equation under an open editor follows the draft (equationInPlace).
      const shownLatex = draftLatex ?? currentLatex;
      const value =
        currentLayoutMode === "linear"
          ? currentInputMode === "unicode"
            ? (latexToReversibleWordLinear(shownLatex)?.linear ??
              shownLatex)
            : currentInputMode === "text"
              ? (latexToEquationText(shownLatex) ?? shownLatex)
              : shownLatex
          : shownLatex;
      clearLazyMathPlaceholderGeometry(preview);
      if (value.trim() === "") {
        // An empty equation shows the placeholder box its editor opens on
        // (Word's empty-equation placeholder): the same math-line-tall box in
        // both states, so opening a new equation moves nothing.
        preview.removeAttribute("data-math-pending");
        applyWordDisplayMathBox(preview, null);
        renderKatexCached(preview, EMPTY_EQUATION_PLACEHOLDER_LATEX, true);
        preview.setAttribute("data-empty", "true");
        return;
      }
      preview.removeAttribute("data-empty");
      if (currentLayoutMode === "linear") {
        preview.removeAttribute("data-math-pending");
        applyWordDisplayMathBox(preview, null);
        preview.textContent = value;
        return;
      }
      // A Word equation as Word sets it on a display line.
      const typeset = currentMathStyle === "office" ? wordDisplayLatex(value) : value;
      if (currentMathStyle === "office" && Array.isArray(currentAlignedLines)) {
        preview.setAttribute(WORD_MATH_ALIGNED_ATTR, JSON.stringify({ lines: currentAlignedLines }));
      } else preview.removeAttribute(WORD_MATH_ALIGNED_ATTR);
      // Word's line box for the equation, from the formula alone: the same
      // box typeset, still a placeholder, and in a measurement clone.
      applyWordDisplayMathBox(preview, typeset);
      // A formula the reader had near the viewport, rebuilt (an inline ↔
      // display conversion, a page re-split, an undo), is typeset at once,
      // never shown as its placeholder for a frame. A rebuilt formula
      // elsewhere stays a placeholder of its exact typeset box until it
      // comes near (lazyKatex, formulaWasNearView).
      preview.removeAttribute("data-math-render-latex");
      if (hasKatexMarkupCached(typeset) && formulaWasNearView(currentNode)) {
        preview.removeAttribute("data-math-pending");
        renderKatexCached(preview, typeset, true);
        return;
      }
      // Lazy typesetting (see lazyKatex.ts): thousands of display
      // formulas in an imported textbook typeset as they approach the
      // viewport instead of all at once on mount.
      preview.textContent = value;
      preview.setAttribute("data-math-pending", "true");
      preview.setAttribute("data-math-render-latex", typeset);
      const box = formulaBoxOf(currentNode);
      if (box) applyLazyMathPlaceholderGeometry(preview, box);
      cancelLazy = observeLazyRender(preview, (inView) => {
        clearLazyMathPlaceholderGeometry(preview);
        preview.removeAttribute("data-math-pending");
        preview.removeAttribute("data-math-render-latex");
        renderKatexCached(preview, typeset, true);
        if (inView) markFormulaNearView(currentNode);
      }, () => hasKatexMarkupCached(typeset));
    };

    const isCommitTargetCurrent = (
      expected: VisualMathEditorState,
    ): boolean => {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (typeof pos !== "number") return false;
      const current = editor.state.doc.nodeAt(pos);
      return Boolean(
        current?.type.name === "mathBlock" &&
        String(current.attrs.latex ?? "") === expected.latex &&
        normalizeEquationInputMode(current.attrs.inputMode) ===
          expected.inputMode &&
        normalizeEquationLayoutMode(current.attrs.layoutMode) ===
          expected.layoutMode,
      );
    };

    const commitAttrs = (
      state: VisualMathEditorState,
      expected: VisualMathEditorState,
    ): boolean => {
      if (destroyed || !editor.isEditable) return false;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (typeof pos !== "number" || !isCommitTargetCurrent(expected)) {
        return false;
      }
      const current = editor.state.doc.nodeAt(pos);
      if (
        (current?.attrs.latex || "") === state.latex &&
        normalizeEquationInputMode(current?.attrs.inputMode) ===
          state.inputMode &&
        normalizeEquationLayoutMode(current?.attrs.layoutMode) ===
          state.layoutMode
      ) {
        return true;
      }
      editor.view.dispatch(
        closeHistory(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...(current?.attrs ?? {}),
            latex: state.latex,
            inputMode: state.inputMode,
            layoutMode: state.layoutMode,
          }),
        ),
      );
      return true;
    };

    // Word: finishing an equation with Enter continues typing right after
    // it; Escape leaves the equation selected. Nothing is done when the caret
    // already went somewhere (an arrow key out of the formula, Change to
    // Inline/Display opening the converted equation).
    const returnCaretAfterEditing = (
      committed: boolean,
      selectEquation = false,
    ) => {
      if (destroyed) return;
      const active = document.activeElement;
      // Esc has no destination of its own: the equation it left is selected
      // even when the engine already handed focus back to the document.
      if (
        !selectEquation &&
        (editor.view.hasFocus() || active?.closest?.(".visual-math-editor"))
      ) {
        return;
      }
      const identity = readNodeIdentity();
      if (!identity || !editor.isEditable) {
        preview.focus();
        return;
      }
      if (committed) {
      // A display equation is a line of its own: Enter continues on the next
      // line (typing on the equation's own line would make it in-line).
      const { state } = editor.view;
      const node = state.doc.nodeAt(identity.pos);
      const next = node
        ? Selection.findFrom(state.doc.resolve(identity.pos + node.nodeSize), 1, true)
        : null;
      if (next) {
        editor.view.dispatch(state.tr.setSelection(next).scrollIntoView());
        editor.view.focus();
        return;
      }
      if (placeCaretOutsideEquation(editor.view, identity.pos, "after")) return;
    }
      const { state } = editor.view;
      editor.view.dispatch(
        state.tr.setSelection(NodeSelection.create(state.doc, identity.pos)),
      );
      editor.view.focus();
    };

    const stopEditing = (
      commit: boolean,
      value?: VisualMathEditorState,
      selectEquation = false,
    ) => {
      if (!editing) return;
      const shouldRestoreFocus = Boolean(
        visualEditor?.dom.contains(document.activeElement),
      );
      const baseState = editingBaseState;
      const draft = value ??
        visualEditor?.getState() ?? {
          latex: currentLatex,
          inputMode: currentInputMode,
          layoutMode: currentLayoutMode,
        };
      const canCommit = Boolean(
        commit &&
          !destroyed &&
          editor.isEditable &&
          baseState &&
          isCommitTargetCurrent(baseState),
      );
      editing = false;
      wrapper.removeAttribute("data-editing");
      noteEquationEditorOpen(wrapper, false);
      noteDraftOpen(false);
      editingBaseState = null;
      visualEditor?.destroy();
      visualEditor = null;
      releaseInPlace?.();
      releaseInPlace = null;
      draftLatex = null;
      if (canCommit && baseState && commitAttrs(draft, baseState)) {
        currentLatex = draft.latex;
        currentInputMode = draft.inputMode;
        currentLayoutMode = draft.layoutMode;
      }
      // Esc commits too (Word never abandons an equation edit) but leaves
      // the equation selected; only the host's own write refusal cancels.
      renderPreview();
      if (shouldRestoreFocus) {
        requestAnimationFrame(() =>
          returnCaretAfterEditing(canCommit && !selectEquation, selectEquation),
        );
      }
    };

    // The ribbon's Professional/Linear and Unicode/LaTeX/Text switches
    // write the node while its draft is open. The draft follows the switch
    // and the commit target moves with the node, so leaving the editor
    
    const followRibbonModeSwitch = (
      latex: string,
      nextInputMode: EquationInputMode,
      nextLayoutMode: EquationLayoutMode,
    ) => {
      if (!editing || !visualEditor || !editingBaseState) return;
      if (latex !== editingBaseState.latex) return;
      if (
        nextInputMode === editingBaseState.inputMode &&
        nextLayoutMode === editingBaseState.layoutMode
      ) {
        return;
      }
      if (nextLayoutMode !== editingBaseState.layoutMode) {
        visualEditor.setLayoutMode(nextLayoutMode);
      }
      if (nextInputMode !== editingBaseState.inputMode) {
        visualEditor.setInputMode(nextInputMode);
      }
      editingBaseState = {
        ...editingBaseState,
        inputMode: nextInputMode,
        layoutMode: nextLayoutMode,
      };
    };

    let lastEditorEditable = editor.isEditable;
    const refreshEditorWriteAuthority = () => {
      if (editor.isEditable === lastEditorEditable) return;
      lastEditorEditable = editor.isEditable;
      if (!lastEditorEditable && editing) stopEditing(false);
      // Only the preview's disabled state says whether the document can be
      // written: typesetting every equation again when a long book became
      // editable was a multi-second task with nothing to change.
      else if (!editing) preview.setAttribute("aria-disabled", !destroyed && editor.isEditable ? "false" : "true");
    };
    const unsubscribeWriteAuthority = subscribeEditorSurfaceEditable(
      editor,
      refreshEditorWriteAuthority,
    );

    // A drag selecting inside the equation that leaves its line hands the
    // drag to the document, which selects the whole equation and the text
    // the pointer reaches (Word: a selection leaving a math zone takes it all).
    const leaveEquationByDrag = (event: PointerEvent): boolean => {
      const box = wrapper.getBoundingClientRect();
      if (event.clientY >= box.top - 2 && event.clientY <= box.bottom + 2) {
        return false;
      }
      const identity = readNodeIdentity();
      if (!identity) return false;
      stopEditing(true);
      const detail: EquationDragOutDetail = {
        pos: identity.pos,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
      editor.view.dom.dispatchEvent(
        new CustomEvent(EQUATION_DRAG_OUT_EVENT, { detail }),
      );
      return true;
    };
    // `carried`: the draft of the view this one replaced, opened again as it
    // was (the edit still commits against the value it opened on).
    const startEditing = (carried?: CarriedEquationDraft) => {
      if (editing) return;
      const identity = readNodeIdentity();
      if (!identity || !editor.isEditable) return;
      editing = true;
      editingBaseState = carried?.base ?? {
        latex: identity.latex,
        inputMode: identity.inputMode,
        layoutMode: identity.layoutMode,
      };
      wrapper.setAttribute("data-editing", "true");
      noteEquationEditorOpen(wrapper, true);
      noteDraftOpen(true);
      visualEditor = createVisualMathEditor({
        initialLatex: carried?.state.latex ?? currentLatex,
        initialInputMode: carried?.state.inputMode ?? currentInputMode,
        initialLayoutMode: carried?.state.layoutMode ?? currentLayoutMode,
        variant: "block",
        chrome: "field-only",
        labels: options.editorLabels,
        onDraftChange: (latex) => {
          if (latex === (draftLatex ?? currentLatex)) return;
          draftLatex = latex;
          renderPreview();
        },
        onCommit: (state, detail) =>
          stopEditing(true, state, detail?.via === "escape"),
        onCancel: () => stopEditing(false),
        // Word never parks the caret against the inside edge of an equation:
        // Left at the first position / Right at the last hands it to the
        // document on that side of the whole structure. Committing first keeps
        // the draft; `setNodeMarkup` does not move the node, so the position
        // captured above still addresses it.
        onMoveOut: (direction) => {
          const escaping = readNodeIdentity();
          if (!escaping) return false;
          stopEditing(true);
          return placeCaretOutsideEquation(
            editor.view,
            escaping.pos,
            direction === "backward" ? "before" : "after",
          );
        },
        // The container's options tab: commit the draft, then convert in
        // place. `setNodeMarkup` on commit keeps the node's position.
        onPointerSelectionExit: leaveEquationByDrag,
        onPlacementChange: (placement) => {
          const identity = readNodeIdentity();
          if (!identity) return;
          stopEditing(true);
          // Word keeps the converted equation active in its container.
          if (setEquationPlacement(editor.view, identity.pos, placement)) {
            reopenSelectedVisualMathEditor(editor);
          }
        },
      });
      releaseInPlace = holdEquationInPlace(wrapper, preview, visualEditor.dom);
      if (carried?.caret) visualEditor.restoreCaret?.(carried.caret);
      // A carried draft takes the keyboard back only if it had it.
      if (carried && !carried.focused) return;
      // The insertion transaction refocuses the ProseMirror view AFTER
      // this runs, so a single synchronous focus() lost the race — typing
      // right after inserting an empty formula landed as plain text
      // beside the node. Re-assert focus across the next frames.
      const focusEnd = () => {
        visualEditor?.focus();
      };
      focusEnd();
      requestAnimationFrame(() => {
        focusEnd();
        requestAnimationFrame(() => {
          if (
            visualEditor &&
            !visualEditor.dom.contains(document.activeElement)
          ) {
            focusEnd();
          }
        });
      });
    };

    // Word opens an equation where it is pressed: the press puts the caret
    // at that point in the mathematics and a drag from there selects part
    // of it, without first opening the editor another way. The press is
    // cancelled so the document does not also select the whole node or
    // start a drag of it; an equation that is ALREADY selected keeps the
    // document's own gesture (a drag moves it, as Word moves a selected
    // equation).
    preview.addEventListener("pointerdown", (event) => {
      if (editing || !editor.isEditable || !pressOpensEquationEditor(event.target, event)) return;
      event.preventDefault();
      startEditing();
      visualEditor?.beginPointerSelection(event.clientX, event.clientY);
    });
    preview.addEventListener("dblclick", (e) => {
      e.preventDefault();
      startEditing();
    });
    preview.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      startEditing();
    });
    // A display equation is centered inside a full-width frame, so the frame has
    // real empty gutters. Word treats a click there as a click OUTSIDE the
    // equation, on that side — the pointer counterpart of the arrow-key escape.
    // `event.target === wrapper` is what distinguishes the gutter from the
    // mathematics (the preview) and from the open editor.
    const handleGutterPointerDown = (event: PointerEvent) => {
      if (editing || event.button !== 0 || event.target !== wrapper) return;
      const side = equationGutterSide(
        event.clientX,
        preview.getBoundingClientRect(),
      );
      if (!side) return;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (typeof pos !== "number") return;
      if (!placeCaretOutsideEquation(editor.view, pos, side)) return;
      event.preventDefault();
    };
    wrapper.addEventListener("pointerdown", handleGutterPointerDown);
    // An open request may name the edge the caret enters at (an arrow key
    // from the paragraph beside the equation).
    const handleOpenRequest = (event: Event) => {
      startEditing();
      const caret = (event as CustomEvent<OpenVisualMathEditorDetail | null>).detail?.caret;
      if (caret) visualEditor?.placeCaretAtEdge(caret);
    };
    wrapper.addEventListener(OPEN_VISUAL_MATH_EDITOR_EVENT, handleOpenRequest);
    // A drag from beside the mathematics reached it: select inside from that edge.
    const handlePointerSelect = (event: Event) => {
      const detail = (event as CustomEvent<EquationPointerSelectDetail>).detail;
      if (!detail || editing || !editor.isEditable) return;
      startEditing();
      visualEditor?.beginPointerSelection(detail.x, detail.y, { edge: detail.edge });
    };
    wrapper.addEventListener(EQUATION_POINTER_SELECT_EVENT, handlePointerSelect);
    const handleStructureInsert = (event: Event) => {
      const wasEditing = editing;
      const currentIdentity = readNodeIdentity();
      const liveControllerIsCurrent =
        !wasEditing ||
        (editingBaseState !== null &&
          currentIdentity !== null &&
          editingBaseState.latex === currentIdentity.latex &&
          editingBaseState.inputMode === currentIdentity.inputMode &&
          editingBaseState.layoutMode === currentIdentity.layoutMode);
      resolveVisualMathStructureInsertRequest(
        event,
        liveControllerIsCurrent ? currentIdentity : null,
        wasEditing,
        () => {
          if (destroyed || !editor.isEditable) return null;
          startEditing();
          return visualEditor;
        },
      );
    };
    wrapper.addEventListener(
      INSERT_VISUAL_MATH_STRUCTURE_EVENT,
      handleStructureInsert,
    );

    renderPreview();

    // A ribbon command run while the equation is open ends its edit first,
    // keeping what was typed (WUA 048).
    const unregisterDraftCommit = registerEquationDraftCommit(wrapper, () => {
      // The equation the selection was on stays selected: writing the draft
      // replaces the node, which maps a node selection to a caret beside it,
      // and the command that follows would then not reach the equation.
      const before = editor.state.selection;
      const selected =
        before instanceof NodeSelection &&
        typeof getPos === "function" &&
        before.from === getPos();
      stopEditing(true);
      if (!selected || destroyed) return;
      const identity = readNodeIdentity();
      if (!identity) return;
      const { state } = editor.view;
      editor.view.dispatch(
        state.tr
          .setSelection(NodeSelection.create(state.doc, identity.pos))
          .setMeta("addToHistory", false),
      );
    });

    // A view built for an equation whose editor was open in the view it
    // replaces (its block moved to another sheet) opens it again on its draft.
    takeUpEquationDraft(editor, draftIdentity(), (draft) => {
      if (destroyed || editing || !editor.isEditable) return;
      startEditing(draft);
    });

    return {
      dom: wrapper,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update(updated: any) {
        if (updated.type.name !== "mathBlock") return false;
        carryFormulaState(currentNode, updated);
        currentNode = updated;
        currentAlignedLines = updated.attrs.mathAlignedLines;
        if (editing) noteDraftOpen(true);
        applyFontSize(updated.attrs.fontSize);
        applyTextColor(updated.attrs.textColor);
        applyTextAlign(updated.attrs.textAlign);
        applySourcePageBreak(updated.attrs.sourcePageBreakBefore);
        const previousMathStyle = currentMathStyle;
        applyMathStyle(updated.attrs.mathStyle);
        const next: string = updated.attrs.latex || "";
        const nextInputMode = normalizeEquationInputMode(
          updated.attrs.inputMode,
        );
        const nextLayoutMode = normalizeEquationLayoutMode(
          updated.attrs.layoutMode,
        );
        followRibbonModeSwitch(next, nextInputMode, nextLayoutMode);
        if (
          next !== currentLatex ||
          nextInputMode !== currentInputMode ||
          nextLayoutMode !== currentLayoutMode ||
          currentMathStyle !== previousMathStyle
        ) {
          currentLatex = next;
          currentInputMode = nextInputMode;
          currentLayoutMode = nextLayoutMode;
          // While editing, the draft keeps priority (matches the old
          // React view where `draft ?? latex` fed the textarea).
          if (!editing) renderPreview();
        }
        return true;
      },
      selectNode() {
        wrapper.setAttribute("data-selected", "true");
        preview.tabIndex = 0;
      },
      deselectNode() {
        wrapper.removeAttribute("data-selected");
        preview.tabIndex = -1;
      },
      stopEvent() {
        // While the LaTeX textarea is open its keystrokes belong to the
        // textarea, not the document.
        return editing;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ignoreMutation(mutation: any) {
        // Selection mutations MUST reach ProseMirror when the preview is
        // showing, or its DOM-selection sync loops forever re-writing a
        // selection it is never allowed to read back. While the LaTeX
        // textarea is open the selection lives in the textarea and PM
        // must leave it alone. All other mutations (KaTeX innerHTML
        // swaps) are ours.
        if (mutation.type === "selection") return editing;
        return true;
      },
      destroy() {
        // An open editor's draft goes to the view built for the same node
        // (a page move); nothing is written into the document.
        if (editing && visualEditor && editingBaseState) {
          handOnEquationDraft(editor, draftIdentity(), {
            state: visualEditor.getState(),
            base: editingBaseState,
            caret: visualEditor.getCaret?.() ?? null,
            focused: visualEditor.dom.contains(document.activeElement),
          });
        }
        noteDraftOpen(false);
        destroyed = true;
        noteEquationEditorOpen(wrapper, false);
        unregisterDraftCommit();
        unsubscribeWriteAuthority();
        wrapper.removeEventListener("pointerdown", handleGutterPointerDown);
        wrapper.removeEventListener(
          OPEN_VISUAL_MATH_EDITOR_EVENT,
          handleOpenRequest,
        );
        wrapper.removeEventListener(
          EQUATION_POINTER_SELECT_EVENT,
          handlePointerSelect,
        );
        wrapper.removeEventListener(
          INSERT_VISUAL_MATH_STRUCTURE_EVENT,
          handleStructureInsert,
        );
        cancelLazy?.();
        cancelLazy = null;
        visualEditor?.destroy();
        visualEditor = null;
        editingBaseState = null;
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const MathBlock = Node.create<MathBlockOptions>({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      placeholder: "LaTeX",
      editHint: "",
      editorLabels: DEFAULT_VISUAL_MATH_EDITOR_LABELS,
    };
  },

  addAttributes() {
    return {
      latex: { default: "" },
      // The direct colour the equation wore as an inline formula (its
      // textColor mark): a block atom carries no text mark, so the colour
      
      textColor: {
        default: null,
        parseHTML: (element) =>
          normalizeTextColor(element.getAttribute("data-text-color")) ??
          normalizeTextColor(element.style.color),
        renderHTML: (attrs) => {
          const color = normalizeTextColor(attrs.textColor);
          return color ? { "data-text-color": color, style: `color: ${color}` } : {};
        },
      },
      textAlign: {
        default: null,
        parseHTML: (element) =>
          normalizeMathBlockTextAlign(
            element.getAttribute("data-text-align") || element.style.textAlign,
          ),
        renderHTML: (attrs) => {
          const align = normalizeMathBlockTextAlign(attrs.textAlign);
          return align
            ? { "data-text-align": align, style: `text-align: ${align}` }
            : {};
        },
      },
      inputMode: {
        default: "latex",
        parseHTML: (element) =>
          normalizeEquationInputMode(
            element.getAttribute("data-equation-input-mode"),
          ),
        renderHTML: (attrs) => ({
          "data-equation-input-mode": normalizeEquationInputMode(
            attrs.inputMode,
          ),
        }),
      },
      layoutMode: {
        default: "professional",
        parseHTML: (element) =>
          normalizeEquationLayoutMode(
            element.getAttribute("data-equation-layout-mode"),
          ),
        renderHTML: (attrs) => ({
          "data-equation-layout-mode": normalizeEquationLayoutMode(
            attrs.layoutMode,
          ),
        }),
      },
      fontSize: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-font-size") ||
          element.style.fontSize ||
          null,
        renderHTML: (attrs) =>
          attrs.fontSize
            ? {
                "data-font-size": attrs.fontSize,
                style: `font-size: ${attrs.fontSize}`,
              }
            : {},
      },
      // Word's alignment points of the equation's lines (`m:aln`), as the file
      // states them: how the lines are set, not the LaTeX a save compares.
      mathAlignedLines: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      mathStyle: {
        default: null,
        parseHTML: (element) =>
          normalizeInlineMathStyle(element.getAttribute("data-math-style")),
        renderHTML: (attrs) => {
          const style = normalizeInlineMathStyle(attrs.mathStyle);
          return style ? { "data-math-style": style } : {};
        },
      },
      sourcePageBreakBefore: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-source-page-break-before") === "true",
        renderHTML: (attrs) =>
          attrs.sourcePageBreakBefore
            ? { "data-source-page-break-before": "true" }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block" }),
    ];
  },

  addNodeView() {
    return createMathBlockNodeView(this.options);
  },

  /**
   * Placement commands. One equation, two presentations (Word's read/write
   * `OMath.Type`), so both directions live on one extension and both node views
   * and the Formula ribbon call the same implementation.
   */
  addCommands() {
    return {
      /** Change the equation at `pos` to a display or inline equation. */
      setEquationPlacement:
        (pos: number, placement: EquationPlacement) =>
        ({ editor }: { editor: { view: EditorView } }) =>
          setEquationPlacement(editor.view, pos, placement),
      /** Hand the caret to the document on one side of the equation at `pos`. */
      placeCaretOutsideEquation:
        (pos: number, side: "before" | "after") =>
        ({ editor }: { editor: { view: EditorView } }) =>
          placeCaretOutsideEquation(editor.view, pos, side),
    } as Partial<RawCommands>;
  },

  /**
   * Word's fast route between the two placements is the paragraph merge, not a
   * menu: Backspace with the caret before a display equation (and Delete at the
   * end of the paragraph above it) folds the equation's own paragraph into that
   * paragraph, which by definition makes the equation inline.
   *
   * That rule is one of the object placement rules every in-line block object
   * shares (pictures, picture rows, charts, equations), so the keymap is the
   * shared `ObjectPlacement` extension (priority 1001, above the document
   * boundary policy). It is schema-driven: in an editor without inline
   * picture/chart nodes only the equation rules can ever apply, and returning
   * false leaves ProseMirror's own keys untouched. Dragging those objects to
   * another place in the text is the companion `ObjectMove` gesture, and the
   * caret on a line an in-line object makes tall is `ObjectLineCaret`.
   */
  addExtensions() {
    return [ObjectPlacement, ObjectMove, ObjectLineCaret, EquationSelection];
  },

  /**
   * Word moves the caret through a display equation as through any other
   * text: Right at the end of the paragraph above goes INTO the equation at
   * its start, Left at the start of the paragraph below goes in at its end.
   * Inside, the arrows walk the mathematics and hand the caret back to the
   * paragraph beyond its first / last position (the editor's `onMoveOut`).
   * Before, the arrow only selected the whole equation.
   */
  addKeyboardShortcuts() {
    return {
      ArrowRight: () => enterDisplayEquationByArrow(this.editor.view, "forward"),
      ArrowLeft: () => enterDisplayEquationByArrow(this.editor.view, "backward"),
    };
  },

  // Typora-style $$ typing, BLOCK-LEVEL ONLY by design: inline $…$ rules
  // would swallow dollar amounts ("$100 到 $200 之间"), so prose stays safe
  // and a typed `$$…$$` line converts the moment the closing $$ lands.
  // Undo (Cmd+Z) removes the conversion together with the quick-typed text
  // (one history group, ProseMirror batching); double-click re-opens the
  // LaTeX editor for adjustments.
  addInputRules() {
    return [
      // A complete $$latex$$ line converts with the latex filled in.
      nodeInputRule({
        find: /^\$\$([^$\n]+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1].trim() }),
      }),
      // Bare $$ + space inserts an empty block formula. Existing empty nodes
      // never auto-open on document load; toolbar/slash insertions send the
      // transient open event, while this typing shortcut can be activated
      // with Enter/Space on its focused preview.
      nodeInputRule({
        find: /^\$\$\s$/,
        type: this.type,
        getAttributes: () => ({ latex: "" }),
      }),
    ];
  },
});

/** The display equation the caret's paragraph edge touches, entered by an arrow. */
function enterDisplayEquationByArrow(
  view: EditorView,
  direction: "forward" | "backward",
): boolean {
  if (!view.editable) return false;
  const { selection } = view.state;
  if (!selection.empty) return false;
  const $caret = selection.$from;
  if (!$caret.parent.isTextblock) return false;
  const atEdge =
    direction === "forward"
      ? $caret.parentOffset === $caret.parent.content.size
      : $caret.parentOffset === 0;
  if (!atEdge) return false;
  const depth = $caret.depth;
  const index = $caret.index(depth - 1);
  const container = $caret.node(depth - 1);
  const neighbour = container.maybeChild(direction === "forward" ? index + 1 : index - 1);
  if (!neighbour || neighbour.type.name !== "mathBlock") return false;
  const pos =
    direction === "forward" ? $caret.after(depth) : $caret.before(depth) - neighbour.nodeSize;
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return false;
  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView(),
  );
  const detail: OpenVisualMathEditorDetail = {
    caret: direction === "forward" ? "start" : "end",
  };
  dom.dispatchEvent(new CustomEvent(OPEN_VISUAL_MATH_EDITOR_EVENT, { detail }));
  return true;
}

export default MathBlock;
