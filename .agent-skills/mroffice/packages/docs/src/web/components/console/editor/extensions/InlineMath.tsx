/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { subscribeEditorSurfaceEditable } from "@mrnote/core/web/components/console/editor/useEditorSurfaceEditable.ts";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";
import {
  EQUATION_DRAG_OUT_EVENT,
  pressOpensEquationEditor,
  type EquationDragOutDetail,
} from "./equationPress";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import "katex/dist/katex.min.css";
import "@mrnote/core/web/components/office-equation/office-equation-format.css";
import {
  EQUATION_DECORATION_ATTRIBUTE,
  equationDecorationValue,
  equationLatexForFormat,
  type EquationCharacterFormat,
} from "@mrnote/core/web/lib/office-equation-format.ts";
import {
  clearLazyMathPlaceholderGeometry,
  INLINE_DISPLAY_MATH_ATTR,
  mathLatexForRender,
  normalizeInlineMathStyle,
  hasKatexMarkupCached,
  applyLazyMathPlaceholderGeometry,
  carryFormulaState,
  formulaBoxOf,
  formulaWasNearView,
  markFormulaNearView,
  observeLazyRender,
  INLINE_FORMULA_TYPESET_EVENT,
  renderKatexCached,
  WORD_MATH_ALIGNED_ATTR,
  WORD_MATH_LINE_MOVED_EVENT,
} from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import { holdEquationInPlace } from "./equationInPlace";
import { displayEquationHasItsLine, inlineMathStandsAlone, inlineMathStandsAlonePlugin } from "./inlineMathStandsAlone";
import { wordDisplayLatex, wordMathStatedLine } from "@mrnote/core/web/components/console/editor/extensions/wordDisplayMath.ts";
import { applyWordDisplayMathBox, applyWordInlineMathBox } from "@mrnote/core/web/components/console/editor/extensions/wordMathMetrics.ts";
import {
  createVisualMathEditor,
  DEFAULT_VISUAL_MATH_EDITOR_LABELS,
  EMPTY_EQUATION_PLACEHOLDER_LATEX,
  INSERT_VISUAL_MATH_STRUCTURE_EVENT,
  OPEN_VISUAL_MATH_EDITOR_EVENT,
  reopenSelectedVisualMathEditor,
  resolveVisualMathStructureInsertRequest,
  type OpenVisualMathEditorDetail,
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
import {
  equationGutterSide,
  inlineEquationBesideCaret,
  placeCaretOutsideEquation,
  selectInlineEquationBesideCaret,
  setEquationPlacement,
} from "@mrnote/core/web/components/console/editor/extensions/equationPlacement.ts";
import { latexToEquationText } from "@mrnote/core/web/components/console/editor/extensions/equationLinearFormat.ts";
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

/** Stated on a display equation Word sets at a side of its line. */
export const INLINE_MATH_JUSTIFICATION_ATTR = "data-math-justification";

/** The side a display equation's `mathJustification` puts it at, when it is
 * not the centre every display equation stands at otherwise. */
export function displayMathSide(value: unknown): "left" | "right" | null {
  return value === "left" || value === "right" ? value : null;
}

// ---------------------------------------------------------------------------
// Vanilla ProseMirror node view
// ---------------------------------------------------------------------------
//
// This was a ReactNodeViewRenderer component. A formula-dense import (a
// math textbook projects to ~7.7k inlineMath nodes) meant ~7.7k React
// portals hanging off the editor's React root — every keystroke's
// reconciliation walked all of them and typing latency hit whole seconds.
// A vanilla node view is plain DOM the React tree never sees; ProseMirror
// leaves untouched nodes alone on each transaction, so the per-keystroke
// cost no longer scales with formula count.

export interface InlineMathOptions {
  /** Placeholder for the LaTeX input while editing. */
  placeholder: string;
  /** Tooltip on the rendered formula ("double-click to edit"). */
  editHint: string;
  /** Localized copy for the visual + LaTeX dual-mode equation editor. */
  editorLabels: VisualMathEditorLabels;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInlineMathNodeView(options: InlineMathOptions): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ({ node, editor, getPos }: any) => {
      const wrapper = document.createElement("span");
      wrapper.className = "inline-math-wrapper";
      const preview = document.createElement("span");
      preview.className = "inline-math-preview";
      if (options.editHint) preview.title = options.editHint;
      // Avoid turning formula-heavy imports (~10k nodes) into 10k sequential
      // Tab stops. ProseMirror's selected math node becomes the single roving
      // keyboard target; double-click remains available for pointer users.
      preview.tabIndex = -1;
      preview.setAttribute("role", "button");
      preview.setAttribute(
        "aria-label",
        options.editHint || options.editorLabels.label,
      );
      wrapper.appendChild(preview);

      // Font size travels as a node attribute, not a mark: an atom node
      // does not carry the surrounding text's fontSize mark, so the font
      // control writes the size here and the wrapper scales the KaTeX
      // (which is em-relative) to match neighbouring text.
      // A size the font control set wins; otherwise the size the
      // equation's math runs state in the file (runStyle.fontSize, CSS px):
      // an equation in a 9 pt caption is 9 pt, as in Word, not the page's
      // default size that opened the caption's line from 11.85 pt to 13+.
      const applyFontSize = (size: unknown, runStyle?: unknown) => {
        const fromRun = (runStyle as { fontSize?: unknown } | null | undefined)?.fontSize;
        wrapper.style.fontSize = typeof size === "string" && size
          ? size
          : typeof fromRun === "number" && Number.isFinite(fromRun) && fromRun > 0 ? `${fromRun}px` : "";
      };
      applyFontSize(node.attrs.fontSize, node.attrs.runStyle);

      let currentMathStyle = normalizeInlineMathStyle(node.attrs.mathStyle);
      const applyMathStyle = (style: unknown) => {
        currentMathStyle = normalizeInlineMathStyle(style);
        if (currentMathStyle) {
          preview.setAttribute("data-math-style", currentMathStyle);
        } else {
          preview.removeAttribute("data-math-style");
        }
      };
      applyMathStyle(node.attrs.mathStyle);

      // Bold / Underline / Strikethrough on the equation are its marks, as on
      // the words around it; Word formats the math runs of the zone with them
      // (`lib/office-equation-format`).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatOf = (current: any): EquationCharacterFormat => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names = new Set<string>((current.marks ?? []).map((mark: any) => mark.type.name));
        return {
          ...(names.has("bold") ? { bold: true } : {}),
          ...(names.has("underline") ? { underline: true } : {}),
          ...(names.has("strike") ? { strike: true } : {}),
        };
      };
      let currentFormat = formatOf(node);
      const formatKey = (format: EquationCharacterFormat) =>
        `${format.bold ? "b" : ""}${format.underline ? "u" : ""}${format.strike ? "s" : ""}`;
      // The node instance this view draws (a block moved to another page
      // keeps it): whether its formula was near the viewport, and its typeset
      // box, are kept by it (lazyKatex).
      let currentNode: object = node;
      let currentMathDisplay = node.attrs.mathDisplay === true;
      let currentMathJustification = displayMathSide(node.attrs.mathJustification);
      let currentLatex: string = node.attrs.latex || "";
      let currentInputMode = normalizeEquationInputMode(node.attrs.inputMode);
      let currentLayoutMode = normalizeEquationLayoutMode(
        node.attrs.layoutMode,
      );
      let editing = false;
      let draftLatex: string | null = null;
      let releaseInPlace: (() => void) | null = null;
      let destroyed = false;
      let editingBaseState: VisualMathEditorState | null = null;
      let visualEditor: VisualMathEditorController | null = null;
      let cancelLazy: (() => void) | null = null;
      // What an open editor's draft is kept by when this view is rebuilt
      // (equationDraftCarry): the node it draws (an inline formula has no id).
      const draftIdentity = (): EquationDraftIdentity => ({ node: currentNode, id: null });
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
        if (current?.type.name !== "inlineMath") return null;
        return {
          pos,
          nodeType: "inlineMath",
          latex: String(current.attrs.latex ?? ""),
          inputMode: normalizeEquationInputMode(current.attrs.inputMode),
          layoutMode: normalizeEquationLayoutMode(current.attrs.layoutMode),
        };
      };

      /** Word's display equation with words in its paragraph and a line of
       * its own among them (displayEquationHasItsLine: a word on its line
       * sets it inline), and Word's equation that is all its paragraph holds,
       * stated display or not (inlineMathStandsAlone). In a list item, whose
       * number it follows on the one line, it stays where it is. */
      const standsAsDisplay = (): boolean => {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return false;
        if (inlineMathStandsAlone(editor.state.doc, pos)) return true;
        if (!currentMathDisplay) return false;
        try {
          const $pos = editor.state.doc.resolve(pos);
          return $pos.parent.textContent.trim().length > 0 && displayEquationHasItsLine($pos.parent, $pos.index());
        } catch {
          return false;
        }
      };

      /** The zone of display equations this one is a line of (Word's several
       * `m:oMath` of one `m:oMathPara`, each a formula here), when it has others:
       * a display equation's neighbours with nothing but white space between. */
      const displayGroupStatement = (display: boolean): string | null => {
        if (!display || currentMathStyle !== "office") return null;
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return null;
        try {
          const $pos = editor.state.doc.resolve(pos);
          const parent = $pos.parent;
          const at = $pos.index();
          const standing = (child: ProseMirrorNode | null | undefined): "line" | "gap" | null => {
            if (!child) return null;
            if (child.type === node.type && child.attrs.mathDisplay === true) return "line";
            return child.isText && !(child.text ?? "").trim() ? "gap" : null;
          };
          let first = at;
          for (let i = at - 1; i >= 0 && standing(parent.child(i)); i -= 1) if (standing(parent.child(i)) === "line") first = i;
          let last = at;
          for (let i = at + 1; i < parent.childCount && standing(parent.child(i)); i += 1) if (standing(parent.child(i)) === "line") last = i;
          if (first === last) return null;
          const lines: string[] = [];
          let index = 0;
          for (let i = first; i <= last; i += 1) {
            const child = parent.child(i);
            if (standing(child) !== "line") continue;
            if (i === at) index = lines.length;
            const aligned = child.attrs.mathAlignedLines;
            const latex = String(child.attrs.latex ?? "");
            lines.push((Array.isArray(aligned) ? wordMathStatedLine(latex, aligned[0]) : null) ?? latex);
          }
          return JSON.stringify({ lines, index });
        } catch {
          return null;
        }
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
          // (Word's empty-equation placeholder), so opening and closing it
          // leaves the line exactly as it was.
          preview.removeAttribute("data-math-pending");
          applyWordInlineMathBox(preview, null);
          renderKatexCached(preview, EMPTY_EQUATION_PLACEHOLDER_LATEX, false);
          preview.setAttribute("data-empty", "true");
          return;
        }
        preview.removeAttribute("data-empty");
        if (currentLayoutMode === "linear") {
          preview.removeAttribute("data-math-pending");
          applyWordInlineMathBox(preview, null);
          preview.textContent = value;
          return;
        }
        const decoration = equationDecorationValue(currentFormat);
        if (decoration) preview.setAttribute(EQUATION_DECORATION_ATTRIBUTE, decoration);
        else preview.removeAttribute(EQUATION_DECORATION_ATTRIBUTE);
        let renderLatex = equationLatexForFormat(mathLatexForRender(value, currentMathStyle), currentFormat);
        // Word's display equation among a paragraph's words (mathDisplay): a
        // line of its own, in display style. Set among the words at the size of
        // a word, a page of such equations ran together.
        const display = standsAsDisplay();
        if (display !== wrapper.hasAttribute(INLINE_DISPLAY_MATH_ATTR)) {
          for (const element of [wrapper, preview]) {
            if (display) element.setAttribute(INLINE_DISPLAY_MATH_ATTR, "true");
            else element.removeAttribute(INLINE_DISPLAY_MATH_ATTR);
          }
        }
        // The side Word sets the display equation at (its own m:jc, else the
        // document's m:defJc), where the file states one: never its
        // paragraph's alignment. Stating none it is the centred group.
        const side = display ? currentMathJustification : null;
        if (side !== wrapper.getAttribute(INLINE_MATH_JUSTIFICATION_ATTR)) {
          for (const element of [wrapper, preview]) {
            if (side) element.setAttribute(INLINE_MATH_JUSTIFICATION_ATTR, side);
            else element.removeAttribute(INLINE_MATH_JUSTIFICATION_ATTR);
          }
        }
        // Word's box for the equation in its line, from the formula alone:
        // the same box typeset, still a placeholder, and in a measurement
        // clone (wordMathMetrics).
        if (display) renderLatex = wordDisplayLatex(renderLatex);
        const groupStatement = displayGroupStatement(display);
        if (groupStatement !== preview.getAttribute(WORD_MATH_ALIGNED_ATTR)) {
          if (groupStatement) preview.setAttribute(WORD_MATH_ALIGNED_ATTR, groupStatement);
          else preview.removeAttribute(WORD_MATH_ALIGNED_ATTR);
          // The other lines of the zone stand by this one: they read it again.
          queueMicrotask(() => {
            for (const sibling of Array.from(wrapper.parentElement?.children ?? [])) {
              if (sibling !== wrapper) sibling.dispatchEvent(new CustomEvent(WORD_MATH_LINE_MOVED_EVENT));
            }
          });
        }
        if (display) applyWordDisplayMathBox(preview, renderLatex);
        else applyWordInlineMathBox(preview, renderLatex);
        // A formula the reader had near the viewport, rebuilt (an inline ↔
        // display conversion, a page re-split, an undo), is typeset at once,
        // never shown as its placeholder for a frame. A rebuilt formula
        // elsewhere (the page ledger moving blocks far from the reader)
        // stays a placeholder of its exact typeset box until it comes near:
        // typesetting each at once put a KaTeX tree back for nearly every
        // formula of a long book (lazyKatex, formulaWasNearView).
        preview.removeAttribute("data-math-render-latex");
        if ((hasKatexMarkupCached(renderLatex) || hasKatexMarkupCached(value)) && formulaWasNearView(currentNode)) {
          preview.removeAttribute("data-math-pending");
          renderKatexCached(preview, renderLatex, display);
          return;
        }
        // Lazy typesetting (see lazyKatex.ts): paint the raw LaTeX as a
        // cheap placeholder; KaTeX runs when the node nears the viewport.
        preview.textContent = value;
        preview.setAttribute("data-math-pending", "true");
        // What a copy of the page typesets (print): the formula as drawn,
        // with its run's formatting.
        preview.setAttribute("data-math-render-latex", renderLatex);
        const box = formulaBoxOf(currentNode);
        if (box && !box.wraps) applyLazyMathPlaceholderGeometry(preview, box);
        cancelLazy = observeLazyRender(preview, (inView) => {
          clearLazyMathPlaceholderGeometry(preview);
          preview.removeAttribute("data-math-pending");
          preview.removeAttribute("data-math-render-latex");
          renderKatexCached(preview, renderLatex, display);
          if (inView) markFormulaNearView(currentNode);
          preview.dispatchEvent(new Event(INLINE_FORMULA_TYPESET_EVENT, { bubbles: true }));
        }, () => hasKatexMarkupCached(renderLatex));
      };

      const isCommitTargetCurrent = (
        expected: VisualMathEditorState,
      ): boolean => {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return false;
        const current = editor.state.doc.nodeAt(pos);
        return Boolean(
          current?.type.name === "inlineMath" &&
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
        if (committed && placeCaretOutsideEquation(editor.view, identity.pos, "after")) return;
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

      // The ribbon's mode switches write the node while its draft is open:
      // the draft follows and the commit target moves with the node, so
      
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

      // A drag selecting inside the equation that leaves it hands the drag
      // to the document, which selects the whole equation and the text the
      // pointer reaches (Word: a selection leaving a math zone takes it all).
      const leaveEquationByDrag = (event: PointerEvent): boolean => {
        const box = (visualEditor?.dom ?? wrapper).getBoundingClientRect();
        if (
          event.clientX >= box.left - 4 &&
          event.clientX <= box.right + 4 &&
          event.clientY >= box.top - 2 &&
          event.clientY <= box.bottom + 2
        ) {
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
      // `carried`: the draft of the view this one replaced, opened again as
      // it was (the edit still commits against the value it opened on).
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
        // An equation that is all its paragraph holds is Word's display
        // equation whatever it is stated as (inlineMathStandsAlone): there is
        // no inline placement for it to change to, nor a display one.
        const startPos = typeof getPos === "function" ? getPos() : null;
        const alone = typeof startPos === "number" && inlineMathStandsAlone(editor.state.doc, startPos);
        visualEditor = createVisualMathEditor({
          initialLatex: carried?.state.latex ?? currentLatex,
          initialInputMode: carried?.state.inputMode ?? currentInputMode,
          initialLayoutMode: carried?.state.layoutMode ?? currentLayoutMode,
          // A display equation among a paragraph's words is edited at its
          // display size: limits above and below, as it stands on the page.
          variant: standsAsDisplay() ? "block" : "inline",
          // Word edits an inline equation where it sits in its line, in the
          // same container as a display equation (placeholder box, options
          // tab on the right edge) -- not in a panel under the line.
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
          // Left at the equation's first position / Right at its last hands the
          // caret to the surrounding paragraph, before or after the whole
          // structure — Word's own arrow-key behaviour, not a stop at the inside
          // edge. `setNodeMarkup` on commit keeps the node's position.
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
          // The container's options tab: "Change to Display" commits the
          // draft, then gives the equation its own paragraph. `setNodeMarkup`
          // on commit keeps the node's position.
          onPointerSelectionExit: leaveEquationByDrag,
          ...(alone
            ? {}
            : {
                onPlacementChange: (placement: "inline" | "display") => {
                  const identity = readNodeIdentity();
                  if (!identity) return;
                  stopEditing(true);
                  // Word keeps the converted equation active in its container.
                  if (setEquationPlacement(editor.view, identity.pos, placement)) {
                    reopenSelectedVisualMathEditor(editor);
                  }
                },
              }),
        });
        releaseInPlace = holdEquationInPlace(wrapper, preview, visualEditor.dom);
        if (carried?.caret) visualEditor.restoreCaret?.(carried.caret);
        // A carried draft takes the keyboard back only if it had it.
        if (carried && !carried.focused) return;
        // The insertion transaction refocuses the ProseMirror view AFTER
        // this runs, so a single synchronous focus() lost the race —
        // typing right after inserting an empty formula landed as plain
        // text beside the node. Re-assert focus across the next frames.
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
      // The pointer counterpart of the arrow-key escape: a click that lands on
      // the equation's frame but beside its mathematics puts the caret on that
      // side of the whole structure. An inline frame hugs its content, so this
      // only fires for the thin band the wrapper actually owns — the same rule
      // the display equation's wide gutters use.
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
      // from the text beside the equation).
      const handleOpenRequest = (event: Event) => {
        startEditing();
        const caret = (event as CustomEvent<OpenVisualMathEditorDetail | null>).detail?.caret;
        if (caret) visualEditor?.placeCaretAtEdge(caret);
      };
      wrapper.addEventListener(OPEN_VISUAL_MATH_EDITOR_EVENT, handleOpenRequest);
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
      const handleLineMoved = () => {
        if (!editing && !destroyed && wrapper.hasAttribute(INLINE_DISPLAY_MATH_ATTR)) renderPreview();
      };
      wrapper.addEventListener(WORD_MATH_LINE_MOVED_EVENT, handleLineMoved);

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
      // A view built for a formula whose editor was open in the view it
      // replaces (its paragraph moved to another sheet) opens it again on
      // its draft.
      takeUpEquationDraft(editor, draftIdentity(), (draft) => {
        if (destroyed || editing || !editor.isEditable) return;
        startEditing(draft);
      });
      return {
        dom: wrapper,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updated: any) {
          if (updated.type.name !== "inlineMath") return false;
        carryFormulaState(currentNode, updated);
        currentNode = updated;
        currentMathDisplay = updated.attrs.mathDisplay === true;
        const previousMathJustification = currentMathJustification;
        currentMathJustification = displayMathSide(updated.attrs.mathJustification);
          if (editing) noteDraftOpen(true);
          applyFontSize(updated.attrs.fontSize, updated.attrs.runStyle);
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
          const nextFormat = formatOf(updated);
          const formatChanged = formatKey(nextFormat) !== formatKey(currentFormat);
          currentFormat = nextFormat;
          if (
            formatChanged ||
            next !== currentLatex ||
            nextInputMode !== currentInputMode ||
            nextLayoutMode !== currentLayoutMode ||
            currentMathStyle !== previousMathStyle ||
            currentMathJustification !== previousMathJustification
          ) {
            currentLatex = next;
            currentInputMode = nextInputMode;
            currentLayoutMode = nextLayoutMode;
            // While editing, the draft keeps priority (matches the old
            // React view where `draft ?? latex` fed the input).
            if (!editing) renderPreview();
          } else if (!editing && standsAsDisplay() !== wrapper.hasAttribute(INLINE_DISPLAY_MATH_ATTR)) {
            // The words beside it went, or came (Accept on a tracked Convert
            // to Equation): a display equation, or an inline one, again.
            renderPreview();
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
          // While the LaTeX input is open its keystrokes belong to the
          // input, not the document.
          return editing;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ignoreMutation(mutation: any) {
          // Selection mutations MUST reach ProseMirror when the preview
          // is showing, or its DOM-selection sync loops forever re-writing
          // a selection it is never allowed to read back. While the LaTeX
          // input is open the selection lives in the input and PM must
          // leave it alone. All other mutations (KaTeX innerHTML swaps)
          // are ours.
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
          wrapper.removeEventListener(WORD_MATH_LINE_MOVED_EVENT, handleLineMoved);
          wrapper.removeEventListener("pointerdown", handleGutterPointerDown);
          wrapper.removeEventListener(
            OPEN_VISUAL_MATH_EDITOR_EVENT,
            handleOpenRequest,
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

const InlineMath = Node.create<InlineMathOptions>({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

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
      mathStyle: {
        default: null,
        parseHTML: (element) =>
          normalizeInlineMathStyle(element.getAttribute("data-math-style")),
        renderHTML: (attrs) => {
          const style = normalizeInlineMathStyle(attrs.mathStyle);
          return style ? { "data-math-style": style } : {};
        },
      },
      // Word's DISPLAY equation (`m:oMathPara`) in a paragraph that also has
      // words in it, so the import cannot fold it into a `mathBlock`. Provenance
      // only: nothing about this formula renders differently, the fact simply
      // has to survive the first transaction. An attribute the node does not
      // declare is dropped there, and the save planner would be back to reading
      // an untouched equation as an inline one it must rewrite.
      mathDisplay: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      // Word's alignment point of this display line (`m:aln`), as the file
      // states it: how it is set, not the LaTeX a save compares.
      mathAlignedLines: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      // The side Word sets this display equation at: its own justification
      // (`m:oMathParaPr/m:jc`, else the document's `m:defJc`), which the file
      // states apart from its paragraph's alignment and Word alone follows.
      // Only a reading that knows it states it ("left" / "right" / "center");
      // a page read before states none and keeps its centred equation.
      mathJustification: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "inline-math" })];
  },

  addNodeView() {
    return createInlineMathNodeView(this.options);
  },

  addProseMirrorPlugins() {
    return [inlineMathStandsAlonePlugin()];
  },

  /**
   * The caret on either side of an inline equation, as Word moves it around a
   * math zone in a line of text:
   *   • Right with the caret just before the equation goes INTO it, at its
   *     start; Left just after it goes in at its end. Inside, the arrows move
   *     through the mathematics, and past its last (first) position they hand
   *     the caret back to the text after (before) it (the editor's
   *     `onMoveOut`), so the text beyond is reached in the same direction.
   *   • Backspace just after the equation, or Delete just before it, selects
   *     the whole equation first; the next press deletes it.
   */
  addKeyboardShortcuts() {
    return {
      ArrowRight: () => enterInlineEquationByArrow(this.editor, "right"),
      ArrowLeft: () => enterInlineEquationByArrow(this.editor, "left"),
      Backspace: () =>
        selectInlineEquationBesideCaret(this.editor.view, "before"),
      Delete: () => selectInlineEquationBesideCaret(this.editor.view, "after"),
    };
  },
});

/** Whether the text around `pos` runs right to left. */
function isRightToLeftAt(view: EditorView, pos: number): boolean {
  try {
    const { node } = view.domAtPos(pos);
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return false;
    return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
  } catch {
    return false;
  }
}

function enterInlineEquationByArrow(
  editor: Editor,
  key: "left" | "right",
): boolean {
  const { view } = editor;
  if (!editor.isEditable) return false;
  const { selection } = view.state;
  // An arrow moves toward the text that follows in reading order: Right is
  // forward in a left-to-right line and backward in a right-to-left one.
  const forward = (key === "right") !== isRightToLeftAt(view, selection.from);
  const beside = inlineEquationBesideCaret(view.state, forward ? "after" : "before");
  if (!beside) return false;
  const dom = view.nodeDOM(beside.pos);
  if (!(dom instanceof HTMLElement)) return false;
  // The equation is the selection while it is being edited (the Equation tab
  // acts on it), as when it is inserted or pressed.
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, beside.pos))
      .scrollIntoView(),
  );
  const detail: OpenVisualMathEditorDetail = { caret: forward ? "start" : "end" };
  dom.dispatchEvent(new CustomEvent(OPEN_VISUAL_MATH_EDITOR_EVENT, { detail }));
  return true;
}

export default InlineMath;
