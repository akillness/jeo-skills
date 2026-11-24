/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { MathfieldElement } from "mathlive";

import {
  committedEquationLatex,
  latexForLiveField,
  latexFromLiveField,
  latexWithSlotsDrawn,
} from "./equationLiveLatex";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import {
  EQUATION_SYMBOL_GROUPS,
  EQUATION_STRUCTURES,
  equationStructureLatex,
  equationStructureMembersForFamily,
  equationStructurePreviewLatex,
  normalizeEquationInputMode,
  normalizeEquationLayoutMode,
  resolveEquationPaletteSymbol,
  resolveEquationStructureMember,
  type EquationInputMode,
  type EquationLayoutMode,
  type EquationPaletteSymbol,
  type EquationStructureId,
} from "./equationCatalog";
import { equationTextToLatex, latexToEquationText } from "./equationLinearFormat";
import { latexToReversibleWordLinear, wordLinearToLatex } from "../../../../lib/unicode-math";
import { equationLatexWithLetterFormat, equationLettersFormatState } from "../../../../lib/office-equation-letter-format";
import {
  completeLinearKeyword,
  translateLinearInput,
  uprightFunctionNameBefore,
} from "../../../../lib/unicode-math/input";
import { renderValidatedKatexMarkup } from "./lazyKatex";
import { OFFICE_CHROME_SELECTOR } from "../../../../lib/office-inactive-selection";
import styles from "./VisualMathEditorCupertino.module.css";

/** amsmath's dots commands MathLive does not define, as the dots they draw;
 * kept as themselves in what the field serializes (`expand: false`). */
const AMS_DOTS_MACROS = {
  dots: { def: "\\ldots", args: 0, captureSelection: true, expand: false },
  dotsc: { def: "\\ldots", args: 0, captureSelection: true, expand: false },
  dotso: { def: "\\ldots", args: 0, captureSelection: true, expand: false },
  dotsb: { def: "\\cdots", args: 0, captureSelection: true, expand: false },
  dotsm: { def: "\\cdots", args: 0, captureSelection: true, expand: false },
  dotsi: { def: "\\cdots", args: 0, captureSelection: true, expand: false },
} as const;

/** DOM signal used after toolbar insertion to open a non-empty math node. */
export const OPEN_VISUAL_MATH_EDITOR_EVENT = "mrnote:open-visual-math-editor";

/** What an open request may ask of the equation's editor. */
export interface OpenVisualMathEditorDetail {
  /** Start with the caret at this edge of the mathematics. */
  readonly caret?: "start" | "end";
}
export const INSERT_VISUAL_MATH_STRUCTURE_EVENT =
  "mrnote:insert-visual-math-structure";
/** Portal controls carrying this marker remain part of the active draft. */
export const VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE =
  "data-visual-math-editor-focus-owner";





export const VISUAL_MATH_HISTORY_CONTROL_SELECTOR = [
  "document-toolbar-action-undo",
  "document-toolbar-action-redo",
  "document-toolbar-undo",
  "document-toolbar-redo",
]
  .map((testId) => `[data-testid="${testId}"]`)
  .join(", ");
/**
 * What a press may land on without ending the draft: the editor's own
 * portaled controls, the document's Undo / Redo, and the editor chrome every
 * MRAI editor keeps a selection through (`OFFICE_CHROME_SELECTOR`: the
 * ribbon and its tabs, menus, panes, dialogs). Office keeps an equation
 * active while its ribbon is used -- switching to Home to change the size,
 * opening a gallery, hovering for Live Preview -- and only a press back in
 * the document leaves it; ending the draft on any ribbon press dropped the
 * selection the person had dragged and committed a half-finished equation.
 */
const VISUAL_MATH_EDITOR_FOCUS_OWNER_SELECTOR = `[${VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE}="true"], ${VISUAL_MATH_HISTORY_CONTROL_SELECTOR}, ${OFFICE_CHROME_SELECTOR}`;
/**
 * MathLive paints a selection only while the field has focus
 * (`:host(:focus) .ML__selection`), so a range dragged in the equation
 * vanished the moment the ribbon took the focus. Added to the field's own
 * (open) shadow root, this keeps it painted in the inactive-selection colour
 * the other editors' held selections use until the draft ends.
 */
const HELD_MATH_SELECTION_STYLE_ATTRIBUTE = "data-mrai-held-selection-style";
const HELD_MATH_SELECTION_CSS = `:host(:not(:focus)) .ML__selection { background: var(--mrai-held-selection-background, color-mix(in srgb, Highlight 45%, transparent)) !important; }`;










const MATH_DELIMITER_SIZE_CSS = `.ML__small-delim { font-size: 100% !important; }`;









const MATH_CARET_BLINK_CSS = `@keyframes mrai-math-caret-blink { 0%, 49.9% { visibility: visible; } 50%, 100% { visibility: hidden; } }
.ML__caret::after, .ML__text-caret::after, .ML__latex-caret::after { animation: none !important; }
.ML__focused .ML__caret::after, .ML__focused .ML__text-caret::after, .ML__focused .ML__latex-caret::after { animation: mrai-math-caret-blink 1.05s step-end infinite !important; }`;
function keepMathSelectionPainted(field: HTMLElement): void {
  const shadow = field.shadowRoot;
  if (!shadow || shadow.querySelector(`style[${HELD_MATH_SELECTION_STYLE_ATTRIBUTE}]`)) return;
  const style = field.ownerDocument.createElement("style");
  style.setAttribute(HELD_MATH_SELECTION_STYLE_ATTRIBUTE, "");
  style.textContent = HELD_MATH_SELECTION_CSS + MATH_DELIMITER_SIZE_CSS + MATH_CARET_BLINK_CSS;
  shadow.appendChild(style);
}
const INSERTED_EDITOR_OPEN_DEADLINE_MS = 1_000;
const pendingInsertedEditorOpen = new WeakMap<Editor, () => void>();

export interface VisualMathNodeIdentity {
  pos: number;
  nodeType: "mathBlock" | "inlineMath";
  latex: string;
  inputMode: EquationInputMode;
  layoutMode: EquationLayoutMode;
}

export type VisualMathStructureInsertResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "stale_selection"
        | "readonly"
        | "unknown_structure_member"
        | "unknown_symbol"
        | "unsupported_unicode"
        | "unsupported_text";
    };

export type VisualMathStructurePlacement = "selection" | "end";

const visualMathStructureRequestMarker = Symbol(
  "mrnote.visualMathStructureRequest",
);

type VisualMathCatalogInsertRequest =
  | {
      marker: typeof visualMathStructureRequestMarker;
      expected: VisualMathNodeIdentity;
      kind: "structure";
      id: string;
      result: VisualMathStructureInsertResult | null;
    }
  | {
      marker: typeof visualMathStructureRequestMarker;
      expected: VisualMathNodeIdentity;
      kind: "symbol";
      id: string;
      result: VisualMathStructureInsertResult | null;
    }
  | {
      marker: typeof visualMathStructureRequestMarker;
      expected: VisualMathNodeIdentity;
      kind: "focus";
      id: "";
      result: VisualMathStructureInsertResult | null;
    }
  | {
      marker: typeof visualMathStructureRequestMarker;
      expected: VisualMathNodeIdentity;
      kind: "normalText";
      id: "";
      result: VisualMathStructureInsertResult | null;
      /** Whether the draft types ordinary text at its caret afterwards. */
      active: boolean;
    };

interface LegacyVisualMathStructureInsertRequest {
  marker: typeof visualMathStructureRequestMarker;
  expected: VisualMathNodeIdentity;
  memberId: string;
  result: VisualMathStructureInsertResult | null;
}

function sameVisualMathIdentity(
  left: VisualMathNodeIdentity,
  right: VisualMathNodeIdentity,
): boolean {
  return (
    left.pos === right.pos &&
    left.nodeType === right.nodeType &&
    left.latex === right.latex &&
    left.inputMode === right.inputMode &&
    left.layoutMode === right.layoutMode
  );
}

/**
 * Route a contextual Ribbon structure command to the exact active equation
 * NodeView. The request is synchronous and never falls back to rewriting the
 * ProseMirror atom when its live controller cannot prove identity.
 */
export function requestVisualMathStructureInsert(
  editor: Editor,
  expected: VisualMathNodeIdentity,
  structureId: EquationStructureId,
): VisualMathStructureInsertResult {
  const structure = EQUATION_STRUCTURES.find(
    (entry) => entry.id === structureId,
  );
  if (!structure) {
    return { ok: false, reason: "unknown_structure_member" };
  }
  return requestVisualMathStructureMemberInsert(
    editor,
    expected,
    structure.defaultMemberId,
  );
}

/**
 * Route one frozen family member through the exact same synchronous NodeView
 * seam. An arbitrary caller string is resolved both before DOM dispatch and
 * again inside the controller; raw LaTeX never crosses the event boundary.
 */
export function requestVisualMathStructureMemberInsert(
  editor: Editor,
  expected: VisualMathNodeIdentity,
  memberId: string,
): VisualMathStructureInsertResult {
  if (!resolveEquationStructureMember(memberId)) {
    return { ok: false, reason: "unknown_structure_member" };
  }
  if (!editor.isEditable) return { ok: false, reason: "readonly" };
  const current = editor.state.doc.nodeAt(expected.pos);
  if (
    !current ||
    current.type.name !== expected.nodeType ||
    String(current.attrs.latex ?? "") !== expected.latex ||
    normalizeEquationInputMode(current.attrs.inputMode) !==
      expected.inputMode ||
    normalizeEquationLayoutMode(current.attrs.layoutMode) !==
      expected.layoutMode
  ) {
    return { ok: false, reason: "stale_selection" };
  }
  const dom = editor.view.nodeDOM(expected.pos);
  if (!(dom instanceof HTMLElement)) {
    return { ok: false, reason: "stale_selection" };
  }
  const request: VisualMathCatalogInsertRequest = {
    marker: visualMathStructureRequestMarker,
    expected,
    kind: "structure",
    id: memberId,
    result: null,
  };
  dom.dispatchEvent(
    new CustomEvent(INSERT_VISUAL_MATH_STRUCTURE_EVENT, { detail: request }),
  );
  return request.result ?? { ok: false, reason: "stale_selection" };
}

/** Route one frozen symbol identity to the exact active equation NodeView. */
export function requestVisualMathSymbolInsert(
  editor: Editor,
  expected: VisualMathNodeIdentity,
  symbolId: string,
): VisualMathStructureInsertResult {
  if (!resolveEquationPaletteSymbol(symbolId)) {
    return { ok: false, reason: "unknown_symbol" };
  }
  if (!editor.isEditable) return { ok: false, reason: "readonly" };
  const current = editor.state.doc.nodeAt(expected.pos);
  if (
    !current ||
    current.type.name !== expected.nodeType ||
    String(current.attrs.latex ?? "") !== expected.latex ||
    normalizeEquationInputMode(current.attrs.inputMode) !==
      expected.inputMode ||
    normalizeEquationLayoutMode(current.attrs.layoutMode) !==
      expected.layoutMode
  ) {
    return { ok: false, reason: "stale_selection" };
  }
  const dom = editor.view.nodeDOM(expected.pos);
  if (!(dom instanceof HTMLElement)) {
    return { ok: false, reason: "stale_selection" };
  }
  const request: VisualMathCatalogInsertRequest = {
    marker: visualMathStructureRequestMarker,
    expected,
    kind: "symbol",
    id: symbolId,
    result: null,
  };
  dom.dispatchEvent(
    new CustomEvent(INSERT_VISUAL_MATH_STRUCTURE_EVENT, { detail: request }),
  );
  return request.result ?? { ok: false, reason: "stale_selection" };
}

/**
 * The Equation tab's Normal Text on the exact live draft (opened if it is
 * not yet): ordinary text at its caret, or math again. Answers whether the
 * draft now types ordinary text, or null when the equation is not the one
 * selected or has no built-up draft (Linear has no caret mode).
 */
export function requestVisualMathNormalText(
  editor: Editor,
  expected: VisualMathNodeIdentity,
): boolean | null {
  if (!editor.isEditable) return null;
  const current = editor.state.doc.nodeAt(expected.pos);
  if (
    !current ||
    current.type.name !== expected.nodeType ||
    String(current.attrs.latex ?? "") !== expected.latex
  ) {
    return null;
  }
  const dom = editor.view.nodeDOM(expected.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const request: VisualMathCatalogInsertRequest = {
    marker: visualMathStructureRequestMarker,
    expected,
    kind: "normalText",
    id: "",
    result: null,
    active: false,
  };
  dom.dispatchEvent(
    new CustomEvent(INSERT_VISUAL_MATH_STRUCTURE_EVENT, { detail: request }),
  );
  return request.result?.ok ? request.active : null;
}

/** Re-focus the exact live draft after a portaled gallery has closed. */
export function requestVisualMathEditorFocus(
  editor: Editor,
  expected: VisualMathNodeIdentity,
): VisualMathStructureInsertResult {
  if (!editor.isEditable) return { ok: false, reason: "readonly" };
  const current = editor.state.doc.nodeAt(expected.pos);
  if (
    !current ||
    current.type.name !== expected.nodeType ||
    String(current.attrs.latex ?? "") !== expected.latex ||
    normalizeEquationInputMode(current.attrs.inputMode) !==
      expected.inputMode ||
    normalizeEquationLayoutMode(current.attrs.layoutMode) !==
      expected.layoutMode
  ) {
    return { ok: false, reason: "stale_selection" };
  }
  const dom = editor.view.nodeDOM(expected.pos);
  if (!(dom instanceof HTMLElement)) {
    return { ok: false, reason: "stale_selection" };
  }
  const request: VisualMathCatalogInsertRequest = {
    marker: visualMathStructureRequestMarker,
    expected,
    kind: "focus",
    id: "",
    result: null,
  };
  dom.dispatchEvent(
    new CustomEvent(INSERT_VISUAL_MATH_STRUCTURE_EVENT, { detail: request }),
  );
  return request.result ?? { ok: false, reason: "stale_selection" };
}

/** Resolve a live-structure request inside one exact equation NodeView. */
export function resolveVisualMathStructureInsertRequest(
  event: Event,
  current: VisualMathNodeIdentity | null,
  wasEditing: boolean,
  getOrStartController: () => VisualMathEditorController | null,
): void {
  if (
    event.type !== INSERT_VISUAL_MATH_STRUCTURE_EVENT ||
    !(event instanceof CustomEvent)
  ) {
    return;
  }
  const request = event.detail as
    | VisualMathCatalogInsertRequest
    | LegacyVisualMathStructureInsertRequest
    | null;
  if (!request || request.marker !== visualMathStructureRequestMarker) return;
  event.stopPropagation();
  if (!current || !sameVisualMathIdentity(current, request.expected)) {
    request.result = { ok: false, reason: "stale_selection" };
    return;
  }
  const controller = getOrStartController();
  if (!controller) {
    request.result = { ok: false, reason: "stale_selection" };
    return;
  }
  if ("kind" in request && request.kind === "focus") {
    controller.focus();
    request.result = { ok: true };
    return;
  }
  if ("kind" in request && request.kind === "normalText") {
    const toggled = controller.toggleNormalText?.() === true;
    request.active = controller.normalTextActive?.() === true;
    request.result = toggled ? { ok: true } : { ok: false, reason: "stale_selection" };
    return;
  }
  const placement = wasEditing ? "selection" : "end";
  if ("kind" in request && request.kind === "symbol") {
    if (!resolveEquationPaletteSymbol(request.id)) {
      request.result = { ok: false, reason: "unknown_symbol" };
      return;
    }
    request.result = controller.insertSymbol(request.id, placement);
    return;
  }
  const memberId = "kind" in request ? request.id : request.memberId;
  request.result = controller.insertStructureMember(memberId, placement);
}

/**
 * Open the catalog node inserted nearest the current selection.
 *
 * The template already carries useful starter LaTeX, so relying on the node
 * view's empty-formula auto-open rule would leave a finished-looking preview
 * that users have to discover is double-clickable. Locating the just-inserted
 * node by type/value keeps the open request transient (no auto-edit attribute
 * is serialized into formula-heavy documents).
 */
export function openInsertedVisualMathEditor(
  editor: Editor,
  nodeType: string,
  latex: string,
): boolean {
  pendingInsertedEditorOpen.get(editor)?.();
  const selectionPosition = editor.state.selection.from;
  // ProseMirror invokes the visitor synchronously, but TypeScript deliberately
  // does not model assignments made inside callbacks for later narrowing. A
  // mutable ref keeps the runtime behaviour explicit without a type assertion.
  const targetRef: {
    current: { pos: number; distance: number } | null;
  } = { current: null };
  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name !== nodeType ||
      String(node.attrs.latex ?? "") !== latex
    ) {
      return true;
    }
    const distance = Math.abs(pos + node.nodeSize - selectionPosition);
    if (targetRef.current === null || distance < targetRef.current.distance) {
      targetRef.current = { pos, distance };
    }
    return true;
  });
  const target = targetRef.current;
  if (target === null) return false;

  const targetNode = editor.state.doc.nodeAt(target.pos);
  if (!targetNode) return false;

  let disposed = false;
  let observer: MutationObserver | null = null;
  let nextFrame: number | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    observer = null;
    if (nextFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(nextFrame);
    }
    nextFrame = null;
    if (deadline !== null) clearTimeout(deadline);
    deadline = null;
    if (pendingInsertedEditorOpen.get(editor) === cleanup) {
      pendingInsertedEditorOpen.delete(editor);
    }
  };

  const targetIsCurrent = () => {
    if (editor.isDestroyed) return false;
    const current = editor.state.doc.nodeAt(target.pos);
    return Boolean(
      current &&
      current.type.name === nodeType &&
      String(current.attrs.latex ?? "") === latex &&
      (current === targetNode || current.eq(targetNode)),
    );
  };

  const openWhenReady = (): boolean => {
    if (disposed) return false;
    if (!targetIsCurrent()) {
      cleanup();
      return false;
    }
    const dom = editor.view.nodeDOM(target.pos);
    if (!(dom instanceof HTMLElement)) return false;
    dom.dispatchEvent(new CustomEvent(OPEN_VISUAL_MATH_EDITOR_EVENT));
    cleanup();
    return true;
  };

  pendingInsertedEditorOpen.set(editor, cleanup);
  if (openWhenReady()) return true;

  // Paged document NodeViews can be mounted by the page renderer after the
  // insertion transaction has completed. Observe the actual editor DOM rather
  // than guessing a longer timeout, and keep the request tied to the exact
  // node identity so a later selection/change cannot open a stale formula.
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      openWhenReady();
    });
    observer.observe(editor.view.dom, { childList: true, subtree: true });
  }
  queueMicrotask(() => {
    if (openWhenReady() || disposed) return;
    if (typeof requestAnimationFrame === "function") {
      nextFrame = requestAnimationFrame(() => {
        nextFrame = null;
        openWhenReady();
      });
    }
  });
  deadline = setTimeout(cleanup, INSERTED_EDITOR_OPEN_DEADLINE_MS);
  return true;
}

/**
 * Re-open the equation a placement change just produced. Word keeps the
 * equation active in its container after "Change to Inline" / "Change to
 * Display"; the conversion leaves the new node selected, so it is the node to
 * open (the open waits for a paged NodeView that mounts late).
 */
export function reopenSelectedVisualMathEditor(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  const { node } = selection;
  if (node.type.name !== "mathBlock" && node.type.name !== "inlineMath") {
    return false;
  }
  return openInsertedVisualMathEditor(
    editor,
    node.type.name,
    String(node.attrs.latex ?? ""),
  );
}

export interface VisualMathEditorLabels {
  label: string;
  inputFormat: string;
  unicodeMode: string;
  latexMode: string;
  textMode: string;
  layout: string;
  professionalMode: string;
  linearMode: string;
  structures: string;
  symbols: string;
  done: string;
  cancel: string;
  loading: string;
  loadFailed: string;
  hint: string;
  sourceLabel: string;
  conversionUnavailable: string;
   
  latexInvalid?: string;
  textUnavailable: string;
  templateLabels: Record<string, string>;
  symbolLabels: Record<string, string>;
  /** What the input formats are (Unicode / LaTeX / Text). */
  inputAxisHint?: string;
  /** What the layout toggle changes (Professional / Linear). */
  layoutAxisHint?: string;
  /** Symbol group headings by `EQUATION_SYMBOL_GROUPS` id; English otherwise. */
  symbolGroupLabels?: Record<string, string>;
  /** The in-place container's options tab (Word's "Equation Options"). */
  equationOptions?: string;
  changeToInline?: string;
  changeToDisplay?: string;
}

export interface VisualMathEditorState {
  latex: string;
  inputMode: EquationInputMode;
  layoutMode: EquationLayoutMode;
}

const EQUATION_FORMAT_SHORTCUTS: Readonly<Record<string, "bold" | "italic" | "underline">> = {
  b: "bold",
  i: "italic",
  u: "underline",
};

// The equation drafts open on the page, so a host's Home tab can format the
// selected part of the one inside its own document (Word's Bold on part of an
// equation being edited).
const OPEN_VISUAL_MATH_EDITORS = new Set<VisualMathEditorController>();
// Told when any open draft's selection or formatting changes, or a draft
// opens or closes: a Home tab showing Bold / Italic / Underline reads again.
const OPEN_VISUAL_MATH_SELECTION_LISTENERS = new Set<() => void>();
function notifyOpenVisualMathSelection(): void {
  for (const listener of OPEN_VISUAL_MATH_SELECTION_LISTENERS) listener();
}

/** Be told when an open draft's selection or formatting changes (or one opens or closes). */
export function subscribeOpenVisualMathSelection(listener: () => void): () => void {
  OPEN_VISUAL_MATH_SELECTION_LISTENERS.add(listener);
  return () => {
    OPEN_VISUAL_MATH_SELECTION_LISTENERS.delete(listener);
  };
}

/**
 * Bold / Italic / Underline as Home shows them for the equation draft open
 * inside `within` (its selected part, by the rule its toggles use);
 * `undefined` when no draft is open there, `null` when it cannot be read.
 */
export function openVisualMathSelectionFormatState(
  within: Element,
  kind: "bold" | "italic" | "underline",
): boolean | null | undefined {
  for (const controller of OPEN_VISUAL_MATH_EDITORS) {
    if (!controller.dom.isConnected || !within.contains(controller.dom)) continue;
    return controller.selectionFormatState?.(kind) ?? null;
  }
  return undefined;
}

/**
 * Commit every equation draft open inside `within` (WUA 165): a page saved
 * while its equation's source was still being edited stored the formula as
 * it was before, though the page said Saved. Word saves what the equation
 * shows. Returns how many drafts were committed.
 */
export function commitOpenVisualMathEditors(within: Element): number {
  let committed = 0;
  for (const controller of [...OPEN_VISUAL_MATH_EDITORS]) {
    if (!controller.dom.isConnected || !within.contains(controller.dom) || !controller.commitDraft) continue;
    controller.commitDraft();
    committed += 1;
  }
  return committed;
}

/** What MathLive says of the element ending at an offset (its depth, and its
 * LaTeX: "" for the empty first element every branch begins with). */
export type VisualMathOffsetInfo = (offset: number) => { readonly depth?: number; readonly latex?: string } | undefined;











export function visualMathStructureRange(
  info: VisualMathOffsetInfo,
  lastOffset: number,
  range: readonly [number, number],
): [number, number] {
  let start = Math.max(0, Math.min(range[0], range[1]));
  let end = Math.min(lastOffset, Math.max(range[0], range[1]));
  if (end <= start) return [start, end];
  const depth = (offset: number) => info(offset)?.depth ?? 0;
  const branchStart = (offset: number) => offset > 0 && (info(offset)?.latex ?? "") === "";
  let level = Infinity;
  for (let offset = start + 1; offset <= end; offset += 1) level = Math.min(level, depth(offset));
  for (let guard = 0; guard < 64 && Number.isFinite(level); guard += 1) {
    // Out of anything deeper than the level the selection reaches: the end
    // to the element closing it, the start to before the structure.
    while (end < lastOffset && depth(end) > level) end += 1;
    while (start > 0 && depth(start) > level) start -= 1;
    let crosses = false;
    for (let offset = start + 1; offset <= end && !crosses; offset += 1) {
      crosses = depth(offset) === level && branchStart(offset);
    }
    if (!crosses || level === 0) break;
    // Two arguments of one structure: the structure itself.
    level -= 1;
  }
  return [start, end];
}

/** Format the selection of the equation draft open inside `within`; false
 * when none is open there (the host formats its own selection instead). */
export function formatOpenVisualMathSelection(
  within: Element,
  format: EquationSelectionFormat,
): boolean {
  for (const controller of OPEN_VISUAL_MATH_EDITORS) {
    if (!controller.dom.isConnected || !within.contains(controller.dom)) continue;
    return controller.formatSelection?.(format) === true;
  }
  return false;
}

/** The caret and selection of an open draft (see `getCaret`). */
export interface VisualMathEditorCaret {
  readonly source: readonly [number, number] | null;
  readonly math: {
    readonly ranges: ReadonlyArray<readonly [number, number]>;
    readonly direction?: "forward" | "backward" | "none";
  } | null;
}

export interface VisualMathEditorController {
  dom: HTMLElement;
  focus(): void;
  getValue(): string;
  getState(): VisualMathEditorState;
  /** The ribbon's Unicode / LaTeX / Text switch, applied to the open draft. */
  setInputMode(mode: EquationInputMode): boolean;
  /** The ribbon's Professional / Linear switch, applied to the open draft. */
  setLayoutMode(mode: EquationLayoutMode): void;
  /** The press that opened the editor landed at these screen coordinates:
   * put the caret there and let the drag that follows select from it. With
   * `edge`, the drag began beside the mathematics on that side and selects
   * from that edge of the equation to the pointer. */
  beginPointerSelection(
    clientX: number,
    clientY: number,
    options?: { readonly edge?: "start" | "end" },
  ): void;
  /** The editor was entered with an arrow key from the text on one side:
   * the caret starts at that edge of the mathematics (Word's Right arrow
   * into a math zone lands at its start, Left at its end). */
  placeCaretAtEdge(edge: "start" | "end"): void;
  /** Where the caret and selection are in the draft, to put them back in an
   * editor opened again on the same draft (its view was rebuilt). */
  getCaret?(): VisualMathEditorCaret;
  /** Put the caret and selection back where `getCaret` read them; the
   * built-up field's waits until it is mounted. */
  restoreCaret?(caret: VisualMathEditorCaret): void;
  insertStructure(
    structureId: EquationStructureId,
    placement?: VisualMathStructurePlacement,
  ): VisualMathStructureInsertResult;
  insertStructureMember(
    memberId: string,
    placement?: VisualMathStructurePlacement,
  ): VisualMathStructureInsertResult;
  insertSymbol(
    symbolId: string,
    placement?: VisualMathStructurePlacement,
  ): VisualMathStructureInsertResult;
  /**
   * Office's Normal Text toggle (the Equation tab's "abc"): what is typed next
   * in the built-up draft is ordinary text (`\text{...}`) rather than math,
   * until toggled back. False when the draft is not built up (Linear).
   * Optional: hosts without the Equation tab never call it.
   */
  toggleNormalText?(): boolean;
  /** Whether the built-up draft is typing Normal Text at its caret. */
  normalTextActive?(): boolean;
  /**
   * A whole equation (the Equation gallery's pick) at the draft's caret, over
   * its selection, as Office inserts a gallery equation into the equation
   * being edited. Optional: hosts without a gallery never call it.
   */
  insertLatex?(latex: string): void;
  /**
   * Character formatting on the part of the draft that is selected (Word's
   * and PowerPoint's Bold / Italic / Underline / Font Color while editing an
   * equation): Office states it on those math runs only. With only a caret,
   * the formatting is for what is typed next. False when the draft cannot
   * take it (a Unicode/Text linear draft).
   */
  formatSelection?(format: EquationSelectionFormat): boolean;
  /**
   * Whether Bold / Italic / Underline shows on for the selected part of the
   * draft (with only a caret, the character before it), by the rule the
   * buttons toggle with (`equationLettersFormatState`); null when it holds
   * nothing the button changes or cannot be read.
   */
  selectionFormatState?(kind: "bold" | "italic" | "underline"): boolean | null;
  /** Be told when the draft's selection or formatting changes; returns the unsubscribe. */
  subscribeSelection?(listener: () => void): () => void;
  /** Commit the open draft as Done does (a page save before the person left
   * the equation keeps what they typed). */
  commitDraft?(): void;
  destroy(): void;
}

export type EquationSelectionFormat =
  | { readonly kind: "bold" | "italic" | "underline" }
  | { readonly kind: "color"; readonly color: string | null };

export interface VisualMathEditorOptions {
  initialLatex: string;
  initialInputMode?: EquationInputMode;
  initialLayoutMode?: EquationLayoutMode;
  variant: "inline" | "block";
  chrome?: "full" | "field-only";
  /**
   * What an EMPTY in-place (field-only) equation shows and measures as. Word's
   * placeholder box by default; PowerPoint's equation box prompts with its
   * "Type equation here." text (`\text{...}`).
   */
  emptyPlaceholderLatex?: string;
  labels: VisualMathEditorLabels;
  /** `via: "escape"` is Esc in the in-place (field-only) editor, which keeps
   * the edit as Word does; hosts leave the equation selected for it. */
  onCommit: (
    state: VisualMathEditorState,
    detail?: { readonly via: "done" | "escape" },
  ) => void;
  onCancel: () => void;
  /**
   * The caret tried to leave the equation's own content — Left at the very
   * first position, Right at the very last, or Tab with nowhere left to go.
   * Word does not park the caret against the inside edge of the equation: it
   * hands it to the document on that side of the whole structure. The host node
   * view answers by committing the draft and landing the caret outside.
   *
   * Return `true` when the host took the caret, so the arrow key is consumed;
   * returning `false` (or leaving the hook unset) keeps MathLive's own
   * behaviour.
   */
  onMoveOut?: (direction: "backward" | "forward") => boolean;
  /**
   * A drag that selects inside the equation moved (still held): `true` when
   * the host has taken it over because it left the equation (Word: a
   * selection that leaves a math zone takes the whole zone), which ends the
   * drag here.
   */
  onPointerSelectionExit?: (event: PointerEvent) => boolean;
  /**
   * The options tab asked for the other placement (Word's "Change to
   * Inline" / "Change to Display"). The host commits the draft first and then
   * converts the node; unset hides the entry.
   */
  onPlacementChange?: (placement: "inline" | "display") => void;
  /**
   * The draft's selection (or caret) moved or its formatting changed: a host
   * showing Bold / Italic / Underline for it reads `selectionFormatState`
   * again.
   */
  onSelectionChange?: () => void;
  /** The draft changed: the host's unseen equation follows it (equationInPlace). */
  onDraftChange?: (latex: string) => void;
}

interface InteractiveMathLiveRuntime {
  MathfieldElement: {
    new (): MathfieldElement;
    soundsDirectory: string | null;
  };
}

interface StructureInsert {
  id: string;
  latex: string;
  glyph: string;
}

type VisualMathCatalogCategory =
  | {
      id: EquationStructureId;
      kind: "structure";
      label: string;
      previewLatex: string;
    }
  | {
      id: "symbols";
      kind: "symbols";
      label: string;
      previewLatex: string;
    };

const VISUAL_MATH_CATALOG_PAGE_SIZE = 8;
const VISUAL_MATH_COMPACT_SYMBOL_COUNT = 40;

interface VisualMathCatalogItem {
  id: string;
  label: string;
  latex: string;
  glyph?: string;
  testId: string;
  insert: () => void;
}

let visualMathEditorSequence = 0;
let interactiveMathLiveRuntimePromise: Promise<InteractiveMathLiveRuntime> | null =
  null;

/**
 * Load only the browser-only MathLive JavaScript at interaction time. Its font
 * faces are declared by the root layout (app/layout.tsx) from the first
 * paint, so a CSS chunk failure cannot make the constructor look unavailable.
 * A rejected JS edge is deliberately uncached so the next explicit
 * Professional action can retry it.
 */
function loadInteractiveMathLiveRuntime(): Promise<InteractiveMathLiveRuntime> {
  if (interactiveMathLiveRuntimePromise) {
    return interactiveMathLiveRuntimePromise;
  }
  interactiveMathLiveRuntimePromise = import("mathlive")
    .then((mathlive) => ({ MathfieldElement: mathlive.MathfieldElement }))
    .catch((error: unknown) => {
      interactiveMathLiveRuntimePromise = null;
      throw error;
    });
  return interactiveMathLiveRuntimePromise;
}

/**
 * MathLive placeholder fragments used by the visual structure palette.
 * `#?` becomes a keyboard-reachable placeholder after insertion, so users can
 * build a fraction or matrix without knowing the underlying LaTeX syntax.
 */
export const VISUAL_MATH_STRUCTURES: readonly StructureInsert[] =
  EQUATION_STRUCTURES;

export const DEFAULT_VISUAL_MATH_EDITOR_LABELS: VisualMathEditorLabels = {
  label: "Equation editor",
  inputFormat: "Input format",
  unicodeMode: "Unicode",
  latexMode: "LaTeX",
  textMode: "Text",
  layout: "Layout",
  professionalMode: "Professional",
  linearMode: "Linear",
  structures: "Structures",
  symbols: "Symbols",
  done: "Done",
  cancel: "Cancel",
  loading: "Loading visual editor…",
  loadFailed: "Visual editor unavailable. Continue in LaTeX mode.",
  hint: "Type naturally or choose a structure. Space inserts visible math spacing.",
  sourceLabel: "LaTeX source",
  conversionUnavailable:
    "This formula cannot be converted reversibly to the supported Unicode subset.",
  textUnavailable:
    "This formula contains math structure that cannot be represented as plain text.",
  templateLabels: {},
  symbolLabels: {},
  inputAxisHint:
    "Unicode (limited/reversible), LaTeX (complete), and Text (plain only) are linear source formats.",
  layoutAxisHint: "Professional / Linear changes only the editing layout.",
  equationOptions: "Equation Options",
  changeToInline: "Change to Inline",
  changeToDisplay: "Change to Display",
};

/**
 * What an EMPTY equation shows and measures as: one placeholder box, the same
 * hollow square a structure's empty slot uses. The live field displays it as
 * its placeholder, the passive previews render it, and the hidden size
 * reference measures it, so an empty equation is one math line tall in every
 * state and the first keystroke only replaces the square.
 */
export const EMPTY_EQUATION_PLACEHOLDER_LATEX = "\\square";

/**
 * Translate a live MathLive draft into the vocabulary the passive KaTeX
 * renderer understands.
 *
 * MathLive keeps editing-only atoms in its LaTeX serialization: the empty slot
 * a structure template leaves behind round-trips as `\placeholder{}` (or
 * `\placeholder[hint]{value}` once something is typed into it), and KaTeX has
 * no spelling for it. Render it as the dotted placeholder box the structure
 * gallery and a committed equation's empty arguments show (latexWithSlotsDrawn),
 * so a half-filled template still measures as a real box instead of failing to
 * parse. Nothing here reaches the document: only the hidden sizing reference
 * renders this string.
 */
export function katexSizingLatex(latex: string): string {
  return latexWithSlotsDrawn(latex);
}

function button(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

function resolvedLabel(
  labels: Record<string, string>,
  id: string,
  fallback: string,
): string {
  return labels[id] || fallback;
}

/**
 * Build the active equation editor as plain DOM. Source previews and frozen
 * catalog thumbnails reuse the already-loaded KaTeX seam. MathLive and its
 * fonts are a single static product dependency so Professional never depends
 * on two independently resolved browser chunks.
 */
export function createVisualMathEditor(
  options: VisualMathEditorOptions,
): VisualMathEditorController {
  const labels = { ...DEFAULT_VISUAL_MATH_EDITOR_LABELS, ...options.labels };
  const fieldOnly = options.chrome === "field-only";
  const emptyPlaceholderLatex =
    options.emptyPlaceholderLatex?.trim() || EMPTY_EQUATION_PLACEHOLDER_LATEX;
  const editorId = `visual-math-editor-${++visualMathEditorSequence}`;
  const root = document.createElement(
    options.variant === "inline" ? "span" : "div",
  );
  root.className = `visual-math-editor visual-math-editor--${options.variant} ${styles.root}${fieldOnly ? ` ${styles.fieldOnly}` : ""}`;
  root.setAttribute("role", fieldOnly ? "group" : "dialog");
  // Focusable only by script: it holds focus while the field mounts.
  if (fieldOnly) root.tabIndex = -1;
  root.setAttribute("aria-label", labels.label);
  root.setAttribute(
    "data-visual-math-editor-chrome",
    fieldOnly ? "field-only" : "full",
  );
  root.setAttribute("data-testid", `visual-math-editor-${options.variant}`);

  const header = document.createElement("span");
  header.className = "visual-math-editor__header";
  header.hidden = fieldOnly;
  const title = document.createElement("span");
  title.className = "visual-math-editor__title";
  title.textContent = labels.label;
  header.appendChild(title);

  const inputModes = document.createElement("span");
  inputModes.className = "visual-math-editor__tabs";
  inputModes.setAttribute("role", "group");
  inputModes.setAttribute("aria-label", labels.inputFormat);
  header.appendChild(inputModes);

  const layoutTabs = document.createElement("span");
  layoutTabs.className = "visual-math-editor__tabs";
  layoutTabs.setAttribute("role", "tablist");
  layoutTabs.setAttribute("aria-label", labels.layout);
  header.appendChild(layoutTabs);
  root.appendChild(header);

  const symbolGroupLabels = labels.symbolGroupLabels ?? {};
  const axisExplanation = document.createElement("span");
  axisExplanation.className = styles.axisExplanation;
  axisExplanation.hidden = fieldOnly;
  axisExplanation.setAttribute(
    "data-testid",
    "visual-math-editor-axis-explanation",
  );
  const sourceAxisExplanation = document.createElement("span");
  sourceAxisExplanation.textContent =
    labels.inputAxisHint ??
    DEFAULT_VISUAL_MATH_EDITOR_LABELS.inputAxisHint ??
    "";
  const layoutAxisExplanation = document.createElement("span");
  layoutAxisExplanation.textContent =
    labels.layoutAxisHint ??
    DEFAULT_VISUAL_MATH_EDITOR_LABELS.layoutAxisHint ??
    "";
  axisExplanation.append(sourceAxisExplanation, layoutAxisExplanation);
  root.appendChild(axisExplanation);

  const visualPanel = document.createElement("span");
  visualPanel.className = `visual-math-editor__panel ${styles.visualPanel}`;
  visualPanel.setAttribute("role", "tabpanel");
  visualPanel.setAttribute("data-testid", "visual-math-editor-visual-panel");
  visualPanel.id = `${editorId}-visual-panel`;

  const fieldHost = document.createElement("span");
  fieldHost.className = "visual-math-editor__field-host";
  const sizingReference = fieldOnly ? document.createElement("span") : null;
  if (sizingReference) {
    sizingReference.className = "visual-math-editor__size-reference";
    sizingReference.setAttribute("aria-hidden", "true");
  }
  const loading = document.createElement("span");
  loading.className = "visual-math-editor__loading";
  loading.setAttribute("role", "status");
  loading.textContent = labels.loading;
  fieldHost.appendChild(loading);
  visualPanel.appendChild(fieldHost);

  const hint = document.createElement("span");
  hint.className = "visual-math-editor__hint";
  hint.textContent = labels.hint;
  hint.hidden = fieldOnly;
  visualPanel.appendChild(hint);

  const sourcePanel = document.createElement("span");
  sourcePanel.className =
    "visual-math-editor__panel visual-math-editor__panel--source";
  sourcePanel.setAttribute("role", "tabpanel");
  sourcePanel.setAttribute("data-testid", "visual-math-editor-latex-panel");
  sourcePanel.id = `${editorId}-latex-panel`;
  sourcePanel.hidden = true;
  const sourceLabel = document.createElement("label");
  sourceLabel.className = "visual-math-editor__source-label";
  if (!fieldOnly) sourceLabel.textContent = labels.sourceLabel;
  const source = document.createElement("textarea");
  source.className = "visual-math-editor__source";
  const inlineInPlace = fieldOnly && options.variant === "inline";
  source.rows = inlineInPlace ? 1 : options.variant === "inline" ? 2 : 3;
  source.value = options.initialLatex;
  source.setAttribute("aria-label", labels.sourceLabel);
  source.setAttribute("data-testid", "visual-math-editor-source");
  sourceLabel.appendChild(source);
  sourcePanel.appendChild(sourceLabel);

  const linearPreview = document.createElement("span");
  linearPreview.className = "visual-math-editor__linear-preview";
  linearPreview.setAttribute("aria-label", labels.professionalMode);
  linearPreview.setAttribute("aria-live", "polite");
  linearPreview.setAttribute("aria-readonly", "true");
  linearPreview.setAttribute(
    "data-testid",
    "visual-math-editor-linear-preview",
  );
  linearPreview.textContent = labels.loading;
  linearPreview.setAttribute("aria-busy", "true");
  linearPreview.hidden = fieldOnly;
  sourcePanel.appendChild(linearPreview);

  const status = document.createElement("span");
  status.className = "visual-math-editor__hint";
  status.setAttribute("role", "status");
  status.setAttribute("data-testid", "visual-math-editor-conversion-status");
  status.hidden = true;

  root.appendChild(visualPanel);
  root.appendChild(sourcePanel);
  root.appendChild(status);

  let inputMode = normalizeEquationInputMode(options.initialInputMode);
  let layoutMode = normalizeEquationLayoutMode(options.initialLayoutMode);
  let draft = options.initialLatex;
  let sourceDirty = false;
  let destroyed = false;
  let mathfield: MathfieldElement | null = null;
  let mathfieldInputListener: EventListener | null = null;
  let mathfieldMountListener: EventListener | null = null;
  let mathfieldMoveOutListener: EventListener | null = null;
  let professionalFocusRequested = false;
  // Characters typed while MathLive is still mounting (the first equation
  // opened after load, held on the editor itself): typed into the field once
  // it takes the focus, so the first key after opening is never lost.
  let typedBeforeMount = "";
  let professionalFocusFrame: number | null = null;
  interface DraftSnapshot {
    draft: string;
    inputMode: EquationInputMode;
    layoutMode: EquationLayoutMode;
    sourceValue: string;
    sourceDirty: boolean;
    sourceSelectionStart: number;
    sourceSelectionEnd: number;
    activeElement: HTMLElement | null;
    mathfieldValue: string | null;
    mathfieldSelection: {
      ranges: Array<[number, number]>;
      direction?: "forward" | "backward" | "none";
    } | null;
  }
  interface PendingCatalogInsert {
    kind: "structure" | "symbol";
    id: string;
    placement: VisualMathStructurePlacement;
    snapshot: DraftSnapshot;
    /**
     * The item is already spelled into the draft (the Linear source's own
     * selection took it); the field only has to move to its first placeholder.
     */
    applied?: boolean;
  }
  let pendingCatalogInsert: PendingCatalogInsert | null = null;
  let pendingCommit = false;
  let pendingCommitVia: "done" | "escape" = "done";
  let professionalMountPromise: Promise<boolean> | null = null;

  const nativeRangeIntersectsEditor = (range: Range): boolean => {
    try {
      if (range.intersectsNode(root)) return true;
    } catch {
      // Safari can reject intersectsNode() at an atom-node boundary. The
      // explicit endpoint and range-boundary checks below remain authoritative.
    }
    if (
      root.contains(range.startContainer) ||
      root.contains(range.endContainer)
    ) {
      return true;
    }
    const editorRange = root.ownerDocument.createRange();
    try {
      if (root.parentNode) editorRange.selectNode(root);
      else editorRange.selectNodeContents(root);
      return (
        range.compareBoundaryPoints(Range.END_TO_START, editorRange) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, editorRange) > 0
      );
    } catch {
      return false;
    }
  };

  const clearIntersectingNativeSelection = () => {
    const selection = root.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const intersectsEditor = Array.from(
      { length: selection.rangeCount },
      (_, index) => selection.getRangeAt(index),
    ).some(nativeRangeIntersectsEditor);
    if (intersectsEditor) selection.removeAllRanges();
  };

  const professionalFieldIsReady = (
    field: MathfieldElement | null,
  ): field is MathfieldElement => {
    if (destroyed || field !== mathfield || !field?.isConnected) return false;
    try {
      // MathLive can be connected while its custom-element reactions are still
      // rebuilding the private controller (notably in Safari). Its public
      // lastOffset remains -1 until that controller is available.
      return field.lastOffset >= 0;
    } catch {
      return false;
    }
  };

  // Word opens an equation where the pointer lands: the press that opens
  // the editor puts the caret at that point in the mathematics, and holding
  // the button and moving selects from there, so part of a structure can be
  // selected without first opening the editor some other way. The press
  // reached the rendered preview (the field did not exist yet), so the
  // caret is placed here from the pointer's coordinates once the field has
  // laid the formula out, and the drag is followed on the document.
  let pointerSelection: {
    x: number;
    y: number;
    anchor: number | null;
    active: boolean;
    edge: "start" | "end" | null;
  } | null = null;
  const offsetAtPoint = (field: MathfieldElement, x: number, y: number): number => {
    try {
      const offset = field.getOffsetFromPoint(x, y);
      return typeof offset === "number" && offset >= 0 ? offset : -1;
    } catch {
      return -1;
    }
  };
  const applyPointerAnchor = (field: MathfieldElement) => {
    const pending = pointerSelection;
    if (!pending || pending.anchor !== null || destroyed || layoutMode !== "professional") return;
    const offset = offsetAtPoint(field, pending.x, pending.y);
    if (offset < 0) return;
    if (pending.edge) {
      // The drag began beside the mathematics: it selects from that edge.
      const edge = pending.edge === "start" ? 0 : field.lastOffset;
      pending.anchor = edge;
      try {
        field.selection = {
          ranges: [[Math.min(edge, offset), Math.max(edge, offset)]],
          direction: offset < edge ? "backward" : "forward",
        };
      } catch {
        // A field whose controller is being rebuilt keeps its own caret.
      }
      return;
    }
    pending.anchor = offset;
    try {
      field.position = offset;
    } catch {
      // A field whose controller is being rebuilt keeps its own caret.
    }
  };
  const beginPointerSelection = (
    x: number,
    y: number,
    selectionOptions?: { readonly edge?: "start" | "end" },
  ) => {
    if (destroyed || layoutMode !== "professional") return;
    const ownerDocument = root.ownerDocument;
    pointerSelection = {
      x,
      y,
      anchor: null,
      active: true,
      edge: selectionOptions?.edge ?? null,
    };
    const field = mathfield;
    if (field && professionalFieldIsReady(field)) {
      requestAnimationFrame(() => applyPointerAnchor(field));
    }
    const move = (event: PointerEvent) => {
      const pending = pointerSelection;
      if (!pending?.active) return;
      if (!(event.buttons & 1)) {
        stop();
        return;
      }
      // Out of the equation the document takes the drag over.
      if (options.onPointerSelectionExit?.(event)) {
        stop();
        return;
      }
      const live = mathfield;
      if (pending.anchor === null || !live) return;
      const offset = offsetAtPoint(live, event.clientX, event.clientY);
      if (offset < 0) return;
      try {
        live.selection = {
          ranges: [[Math.min(pending.anchor, offset), Math.max(pending.anchor, offset)]],
          direction: offset < pending.anchor ? "backward" : "forward",
        };
      } catch {
        // Selection on a rebuilding field: keep the caret.
      }
    };
    const stop = () => {
      if (pointerSelection) pointerSelection.active = false;
      ownerDocument.removeEventListener("pointermove", move);
      ownerDocument.removeEventListener("pointerup", stop);
      ownerDocument.removeEventListener("pointercancel", stop);
    };
    ownerDocument.addEventListener("pointermove", move);
    ownerDocument.addEventListener("pointerup", stop);
    ownerDocument.addEventListener("pointercancel", stop);
  };

  // An arrow key from the text beside the equation opened it: Word's caret
  // goes in at the edge it came from (Right enters at the start, Left at the
  // end). The field may not exist yet, so the edge waits for it like the
  // pointer's anchor does.
  let pendingCaretEdge: "start" | "end" | null = null;
  const applyCaretEdge = (field: MathfieldElement) => {
    const edge = pendingCaretEdge;
    if (!edge || destroyed || layoutMode !== "professional") return;
    if (!professionalFieldIsReady(field)) return;
    pendingCaretEdge = null;
    try {
      field.position = edge === "start" ? 0 : field.lastOffset;
    } catch {
      // A field whose controller is being rebuilt keeps its own caret.
    }
  };
  // A caret carried over from an editor opened on the same draft before
  // (its view was rebuilt): the field's part waits for it like the edge does.
  let pendingCaretMath: VisualMathEditorCaret["math"] = null;
  const applyCarriedCaret = (field: MathfieldElement) => {
    const math = pendingCaretMath;
    if (!math || destroyed || layoutMode !== "professional") return;
    if (!professionalFieldIsReady(field)) return;
    pendingCaretMath = null;
    try {
      field.selection = {
        ranges: math.ranges.map((range) => [range[0], range[1]] as [number, number]),
        ...(math.direction ? { direction: math.direction } : {}),
      };
    } catch {
      // A field whose controller is being rebuilt keeps its own caret.
    }
  };
  const getCaret = (): VisualMathEditorCaret => ({
    source: [
      source.selectionStart ?? source.value.length,
      source.selectionEnd ?? source.value.length,
    ],
    math: mathfield
      ? {
          ranges: mathfield.selection.ranges.map(
            (range) => [range[0], range[1]] as [number, number],
          ),
          direction: mathfield.selection.direction,
        }
      : null,
  });
  const restoreCaret = (caret: VisualMathEditorCaret) => {
    if (destroyed) return;
    pointerSelection = null;
    pendingCaretEdge = null;
    if (caret.source) {
      const length = source.value.length;
      try {
        source.setSelectionRange(
          Math.min(caret.source[0], length),
          Math.min(caret.source[1], length),
        );
      } catch {
        // A detached textarea keeps its own caret.
      }
    }
    pendingCaretMath = caret.math;
    const field = mathfield;
    if (field) applyCarriedCaret(field);
  };
  const placeCaretAtEdge = (edge: "start" | "end") => {
    if (destroyed) return;
    pointerSelection = null;
    if (layoutMode === "linear") {
      const at = edge === "start" ? 0 : source.value.length;
      try {
        source.setSelectionRange(at, at);
      } catch {
        // A detached textarea keeps its own caret.
      }
      return;
    }
    pendingCaretEdge = edge;
    const field = mathfield;
    if (field) applyCaretEdge(field);
  };

  const focusProfessionalField = (
    field: MathfieldElement | null = mathfield,
  ): boolean => {
    if (!professionalFieldIsReady(field)) return false;
    try {
      (field as HTMLElement).focus({ preventScroll: true });
      return true;
    } catch {
      // A disconnect/reconnect reaction can invalidate MathLive between the
      // readiness check and focus(). Keep the editor alive and retry on mount.
      return false;
    }
  };

  const clearStatus = () => {
    status.textContent = "";
    status.hidden = true;
  };

  const showStatus = (message: string) => {
    status.textContent = message;
    status.hidden = false;
  };

  const linearValueFor = (
    mode: EquationInputMode,
    latex: string,
  ): string | null => {
    if (mode === "latex") return latex;
    if (mode === "unicode") {
      return latexToReversibleWordLinear(latex)?.linear ?? null;
    }
    return latexToEquationText(latex);
  };

  // The field keeps its own spelling of Word's bar-less stack (`\atop`,
  // equationLiveLatex.ts); the draft is always the document's (`\genfrac`).
  const readLiveField = (field: MathfieldElement): string =>
    latexFromLiveField(field.value);
  const writeLiveField = (field: MathfieldElement, latex: string): void => {
    field.setValue(latexForLiveField(latex), { silenceNotifications: true });
  };
  const readProfessionalValue = () => {
    if (mathfield) draft = readLiveField(mathfield);
    return draft;
  };

  // The passive/print renderer owns document-flow geometry even while
  // MathLive owns input. A single hidden, draft-only reference avoids page
  // movement from differences between the two engines' editor struts.
  //
  // It is a FLOOR, never a cap: the reference and the live field share one
  // grid cell (see the field-only chrome CSS), so the box is the larger of
  // the two. Keeping a stale reference when the draft stops parsing is what
  // used to freeze the editing frame at an old size while the formula grew
  // past it, so an unrenderable draft empties the reference and hands the
  // geometry to the live field until it parses again.
  //
  // An EMPTY equation is measured as the placeholder box the live field
  // shows (Word's empty-equation placeholder), not as a fixed floor: a floor
  // sized from the paragraph (`1lh`) left the container a text line tall
  // while an ordinary formula is a math line tall, so the frame opened on an
  // empty equation was visibly thicker than the same formula opened later.
  const syncProfessionalSize = () => {
    if (!sizingReference) return;
    const empty = !draft.trim();
    const markup = renderValidatedKatexMarkup(
      katexSizingLatex(empty ? emptyPlaceholderLatex : draft),
      options.variant === "block",
    );
    sizingReference.innerHTML = markup ?? "";
    sizingReference.toggleAttribute("data-empty", empty);
    scheduleLiveFieldAlignment();
    options.onDraftChange?.(draft);
  };

  // In place, the frame is the KaTeX rendering's box (the committed look) and
  // MathLive draws the same formula on top of it. MathLive rounds its struts
  // to two decimals (0.65em / 0.73em against KaTeX's 0.6444em / 0.7278em), so
  // its own line box comes out a pixel taller with the baseline lower, and a
  // `\quad` or `\text{…}` can typeset a few pixels wider -- each enough to
  // move the formula the moment editing starts. The live field therefore
  // takes the reference's box, and its content is shifted so its baseline
  // and left edge land exactly on the reference's. A draft KaTeX cannot
  // render (the reference is empty) hands the geometry back to the field.
  let liveFieldAlignmentFrame: number | null = null;
  // Client rects are in screen pixels: a zoomed document (the surface's
  // scale transform) multiplies them, while the widths, heights and shifts
  // written below are CSS pixels of the field. Everything measured is
  // divided back by the reference's own scale, read as its screen box over
  // its layout box; at 100% that is 1. Writing screen pixels as CSS pixels
  // made the field zoom-times too big at 125% / 150%, the frame grew around
  // the formula and the formula jumped to the centre of it.
  const referenceScale = (): { x: number; y: number } => {
    if (!sizingReference) return { x: 1, y: 1 };
    const rect = sizingReference.getBoundingClientRect();
    const x = sizingReference.offsetWidth > 0 && rect.width > 0 ? rect.width / sizingReference.offsetWidth : 1;
    const y = sizingReference.offsetHeight > 0 && rect.height > 0 ? rect.height / sizingReference.offsetHeight : 1;
    return { x: Number.isFinite(x) && x > 0 ? x : 1, y: Number.isFinite(y) && y > 0 ? y : 1 };
  };
  const baselineOf = (strut: Element | null | undefined, scaleY: number): number | null => {
    if (!strut) return null;
    const rect = strut.getBoundingClientRect();
    if (!rect.height) return null;
    const verticalAlign = getComputedStyle(strut).verticalAlign;
    const offset = verticalAlign === "baseline" ? 0 : Number.parseFloat(verticalAlign);
    return rect.bottom / scaleY + (Number.isFinite(offset) ? offset : 0);
  };
  const clearLiveFieldAlignment = (field: HTMLElement) => {
    field.style.removeProperty("width");
    field.style.removeProperty("height");
    field.style.removeProperty("--mrai-live-dx");
    field.style.removeProperty("--mrai-live-dy");
  };
  const alignLiveFieldToReference = () => {
    liveFieldAlignmentFrame = null;
    const field = mathfield;
    if (!sizingReference || !field || destroyed || layoutMode !== "professional") return;
    const referenceMath = sizingReference.querySelector(".katex-html");
    const referenceBox = sizingReference.getBoundingClientRect();
    const liveMath = field.shadowRoot?.querySelector(".ML__base");
    if (!referenceMath || !liveMath || !referenceBox.width || !referenceBox.height) {
      clearLiveFieldAlignment(field);
      return;
    }
    const readShift = (name: string) =>
      Number.parseFloat(field.style.getPropertyValue(name)) || 0;
    const scale = referenceScale();
    // Take the reference's box FIRST: the field centres its content in its
    // own box, so pinning it after measuring moved the formula again by half
    // the size difference (MathLive's line box is ~1px taller).
    field.style.width = `${referenceBox.width / scale.x}px`;
    field.style.height = `${referenceBox.height / scale.y}px`;
    const referenceRect = referenceMath.getBoundingClientRect();
    const liveRect = liveMath.getBoundingClientRect();
    // MathLive typesets after it mounts; an unlaid formula has no position
    // to align yet. The size observer below brings us back once it has one.
    if (!liveRect.width || !liveRect.height) return;
    const referenceBaseline = baselineOf(referenceMath.querySelector(".strut"), scale.y);
    // MathLive puts its struts beside `.ML__base`, not inside it, so the
    // baseline is read from the typeset content as a whole.
    const liveBaseline = baselineOf(
      field.shadowRoot?.querySelector(
        "[part=content] .ML__strut, [part=content] .ML__strut--bottom",
      ),
      scale.y,
    );
    const dx = readShift("--mrai-live-dx") + (referenceRect.left - liveRect.left) / scale.x;
    const dy =
      readShift("--mrai-live-dy") +
      (referenceBaseline !== null && liveBaseline !== null
        ? referenceBaseline - liveBaseline
        : (referenceRect.top - liveRect.top) / scale.y);
    field.style.setProperty("--mrai-live-dx", `${dx.toFixed(3)}px`);
    field.style.setProperty("--mrai-live-dy", `${dy.toFixed(3)}px`);
    frameWhatIsShown(referenceMath, liveMath, scale);
    applyPointerAnchor(field);
    applyCaretEdge(field);
    applyCarriedCaret(field);
  };
  // The frame hugs what is shown -- the reference and the live formula
  // together -- by how far they reach past the shared box on each side
  // (the CSS draws it as an overlay): MathLive can typeset a formula a few
  // pixels wider than KaTeX, and the box's own outline stopped short of it.
  const frameWhatIsShown = (referenceMath: Element, liveMath: Element, scale: { x: number; y: number }) => {
    const box = fieldHost.getBoundingClientRect();
    const reference = referenceMath.getBoundingClientRect();
    const live = liveMath.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const reach = {
      t: (box.top - Math.min(reference.top, live.top)) / scale.y,
      r: (Math.max(reference.right, live.right) - box.right) / scale.x,
      b: (Math.max(reference.bottom, live.bottom) - box.bottom) / scale.y,
      l: (box.left - Math.min(reference.left, live.left)) / scale.x,
    };
    for (const [side, value] of Object.entries(reach)) {
      fieldHost.style.setProperty(`--mrai-frame-${side}`, `${Math.max(0, value).toFixed(2)}px`);
    }
  };
  function scheduleLiveFieldAlignment() {
    if (!fieldOnly || destroyed || typeof requestAnimationFrame !== "function") return;
    if (liveFieldAlignmentFrame !== null) return;
    liveFieldAlignmentFrame = requestAnimationFrame(alignLiveFieldToReference);
  }
  // Re-align whenever either rendering changes size: MathLive's first
  // typeset, a draft edit, a font arriving. The alignment itself only
  // translates, which never changes a size, so it cannot feed back.
  let liveFieldSizeObserver: ResizeObserver | null = null;
  const observeLiveFieldSizes = (field: MathfieldElement) => {
    if (!fieldOnly || typeof ResizeObserver !== "function") return;
    liveFieldSizeObserver?.disconnect();
    liveFieldSizeObserver = new ResizeObserver(() => scheduleLiveFieldAlignment());
    const content = field.shadowRoot?.querySelector("[part=content]");
    if (content) liveFieldSizeObserver.observe(content);
    if (sizingReference) liveFieldSizeObserver.observe(sizingReference);
  };

  const parseLinearSource = (): string | null => {
    if (inputMode === "latex") return source.value;
    if (inputMode === "unicode") {
      return wordLinearToLatex(source.value)?.latex ?? null;
    }
    return equationTextToLatex(source.value);
  };

  const conversionFailureMessage = () =>
    inputMode === "text"
      ? labels.textUnavailable
      : inputMode === "latex"
        ? (labels.latexInvalid ?? labels.conversionUnavailable)
        : labels.conversionUnavailable;

  // Placeholders (`\\placeholder{}`) are MathLive's empty arguments, which
  // KaTeX does not know; the previews and the commit validation see them as
  // the same hollow squares the size reference and the ribbon draw, so a
  // matrix of empty cells previews and commits like any other formula.
  const previewMarkupFor = (latex: string): string | null => {
    return renderValidatedKatexMarkup(
      katexSizingLatex(latex),
      options.variant === "block",
    );
  };

  const sourceLatexIsValid = (latex: string): boolean =>
    previewMarkupFor(latex) !== null;

  const renderTrustedLatex = (target: HTMLElement, latex: string): boolean => {
    const markup = previewMarkupFor(latex);
    if (!markup) return false;
    const preview = document.createElement("span");
    // Keep the legacy sizing hook while KaTeX owns the actual markup.
    preview.className = "ML__mathlive visual-math-editor__katex-preview";
    preview.setAttribute("data-latex", latex);
    preview.innerHTML = markup;
    target.replaceChildren(preview);
    target.removeAttribute("aria-busy");
    target.removeAttribute("data-invalid");
    return true;
  };

  // An in-line linear equation is one line of text as wide as that text
  // (browsers without `field-sizing: content` size the box from `cols`).
  const fitInlineSource = () => {
    if (!inlineInPlace) return;
    source.cols = Math.max(
      2,
      ...source.value.split("\n").map((line) => line.length + 1),
    );
  };

  const updateLinearPreview = (): boolean => {
    fitInlineSource();
    syncProfessionalSize();
    const nextLatex = parseLinearSource();
    if (nextLatex === null) {
      linearPreview.textContent = conversionFailureMessage();
      linearPreview.removeAttribute("aria-busy");
      linearPreview.setAttribute("data-invalid", "true");
      showStatus(conversionFailureMessage());
      return false;
    }
    if (!renderTrustedLatex(linearPreview, nextLatex)) {
      linearPreview.textContent = conversionFailureMessage();
      linearPreview.removeAttribute("aria-busy");
      linearPreview.setAttribute("data-invalid", "true");
      showStatus(conversionFailureMessage());
      return false;
    }
    clearStatus();
    return true;
  };

  const flushLinearSource = (): boolean => {
    // A derived Unicode/Text source can normalize spelling even when untouched
    // (for example `\\alpha` -> `\\alpha{}`). Validate the exact current draft
    // on no-op commits, and only parse/replace it after a real source edit.
    const nextLatex = sourceDirty ? parseLinearSource() : draft;
    if (nextLatex === null || !sourceLatexIsValid(nextLatex)) {
      showStatus(conversionFailureMessage());
      updateLinearPreview();
      return false;
    }
    clearStatus();
    draft = nextLatex;
    sourceDirty = false;
    if (mathfield) writeLiveField(mathfield, draft);
    updateLinearPreview();
    return true;
  };

  const updateSourceLabel = () => {
    const name =
      inputMode === "latex"
        ? labels.sourceLabel
        : inputMode === "unicode"
          ? labels.unicodeMode
          : labels.textMode;
    // The field's own accessible name follows the input format too: a
    // screen reader read "LaTeX source" over a Unicode linear formula.
    source.setAttribute("aria-label", name);
    // An in-place field has no visible caption: its label's first child is
    // the field itself, whose text must not be overwritten.
    const caption = sourceLabel.firstChild;
    if (caption && caption !== source) caption.textContent = name;
  };

  const syncSourceFromDraft = (): boolean => {
    let nextSource = linearValueFor(inputMode, draft);
    if (nextSource === null) {
      // The bounded Unicode / Text subsets cannot spell this formula; the
      // Linear view still opens, in LaTeX (the lossless semantic source),
      // rather than refusing with an error the professional view never had.
      inputMode = "latex";
      updateModeButtons();
      nextSource = draft;
    }
    clearStatus();
    source.value = nextSource;
    sourceDirty = false;
    updateSourceLabel();
    updateLinearPreview();
    return true;
  };

  // What a host stores: MathLive's editing-only slots become ordinary groups
  // (committedEquationLatex); the draft itself keeps them while it is open.
  const getState = (): VisualMathEditorState => ({
    latex: committedEquationLatex(
      layoutMode === "professional"
        ? readProfessionalValue()
        : (parseLinearSource() ?? draft),
    ),
    inputMode,
    layoutMode,
  });

  const getValue = () => getState().latex;

  const commit = (via: "done" | "escape" = "done") => {
    if (destroyed) return;
    if (pendingCatalogInsert) {
      pendingCommit = true;
      pendingCommitVia = via;
      root.setAttribute("aria-busy", "true");
      return;
    }
    if (layoutMode === "linear") {
      if (!flushLinearSource()) return;
    } else {
      const nextDraft = readProfessionalValue();
      if (!sourceLatexIsValid(nextDraft)) {
        showStatus(conversionFailureMessage());
        return;
      }
      // As in Word, the input format (Unicode / LaTeX / Text) only governs
      // the LINEAR view; a professional-layout draft is always committed as
      // its LaTeX. Whether it can be shown in Unicode is decided when the
      // user switches to Linear (see syncSourceFromDraft).
      draft = nextDraft;
      clearStatus();
    }
    const state = { latex: committedEquationLatex(draft), inputMode, layoutMode };
    if (via === "escape") options.onCommit(state, { via });
    else options.onCommit(state);
  };

  const updateModeButtons = () => {
    for (const [mode, element] of inputButtons) {
      element.setAttribute("aria-pressed", String(inputMode === mode));
    }
    const professionalActive = layoutMode === "professional";
    professionalTab.setAttribute("aria-selected", String(professionalActive));
    linearTab.setAttribute("aria-selected", String(!professionalActive));
    professionalTab.tabIndex = professionalActive ? 0 : -1;
    linearTab.tabIndex = professionalActive ? -1 : 0;
    visualPanel.hidden = !professionalActive;
    sourcePanel.hidden = professionalActive;
    updateSourceLabel();
  };

  const captureDraftSnapshot = (): DraftSnapshot => ({
    draft,
    inputMode,
    layoutMode,
    sourceValue: source.value,
    sourceDirty,
    sourceSelectionStart: source.selectionStart ?? source.value.length,
    sourceSelectionEnd: source.selectionEnd ?? source.value.length,
    activeElement:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    mathfieldValue: mathfield?.value ?? null,
    mathfieldSelection: mathfield
      ? {
          ranges: mathfield.selection.ranges.map(
            (range) => [range[0], range[1]] as [number, number],
          ),
          direction: mathfield.selection.direction,
        }
      : null,
  });

  const restoreDraftSnapshot = (snapshot: DraftSnapshot) => {
    draft = snapshot.draft;
    syncProfessionalSize();
    inputMode = snapshot.inputMode;
    layoutMode = snapshot.layoutMode;
    source.value = snapshot.sourceValue;
    sourceDirty = snapshot.sourceDirty;
    source.setSelectionRange(
      snapshot.sourceSelectionStart,
      snapshot.sourceSelectionEnd,
    );
    if (mathfield && snapshot.mathfieldValue !== null) {
      mathfield.setValue(snapshot.mathfieldValue, {
        silenceNotifications: true,
      });
      if (snapshot.mathfieldSelection) {
        mathfield.selection = snapshot.mathfieldSelection;
      }
    }
    updateSourceLabel();
    updateModeButtons();
    if (snapshot.layoutMode === "professional") {
      focusDraftSurface();
    } else if (snapshot.layoutMode === "linear") {
      source.focus();
    } else {
      snapshot.activeElement?.focus();
    }
  };

  /** Switch the input format; reports whether `mode` is now the active one. */
  const setInputMode = (mode: EquationInputMode): boolean => {
    if (inputMode === mode) return true;
    if (layoutMode === "linear" && !flushLinearSource()) return false;
    if (layoutMode === "professional") readProfessionalValue();
    const nextSource = linearValueFor(mode, draft);
    if (nextSource === null) {
      showStatus(
        mode === "text" ? labels.textUnavailable : labels.conversionUnavailable,
      );
      return false;
    }
    inputMode = mode;
    source.value = nextSource;
    sourceDirty = false;
    updateSourceLabel();
    clearStatus();
    updateModeButtons();
    updateLinearPreview();
    return true;
  };

  const setLayoutMode = (mode: EquationLayoutMode) => {
    if (layoutMode === mode) return;
    if (mode === "linear") professionalFocusRequested = false;
    if (layoutMode === "linear" && !flushLinearSource()) return;
    if (mode === "professional" && !mathfield) {
      root.setAttribute("aria-busy", "true");
      void mountProfessionalEditor().then((mounted) => {
        if (!mounted || destroyed) return;
        layoutMode = "professional";
        updateModeButtons();
        queueMicrotask(() => notifySelection());
        requestAnimationFrame(() => focusDraftSurface());
      });
      return;
    }
    if (mode === "linear") {
      readProfessionalValue();
      if (!syncSourceFromDraft()) return;
    }
    layoutMode = mode;
    updateModeButtons();
    if (mode === "linear") updateLinearPreview();
    // The host's Professional / Linear buttons read the mode again: the
    // equation's own Options menu switches it here (live audit S-173: the
    // ribbon kept Professional lit over the linear source). After this turn:
    // the listeners are declared further down this constructor.
    queueMicrotask(() => notifySelection());
    requestAnimationFrame(() => {
      if (destroyed) return;
      if (mode === "professional") focusDraftSurface();
      else source.focus();
    });
  };

  // Word's equation container: a thin frame hugging the formula with a small
  // tab on its right edge that opens "Equation Options" (Professional /
  // Linear, Change to Inline / Display). Only the in-place (field-only) chrome
  // draws the container; the full editor keeps its own header tabs.
  const optionsTab = fieldOnly ? document.createElement("button") : null;
  const optionsMenu = fieldOnly ? document.createElement("span") : null;
  // The open menu is shown from a body-level host: inside the page it stacks
  // under the page's own overlays (an equation at the page's foot opened its
  // menu under the footer's hit area, whose click went to the footer and
  // "Change to Inline" did nothing) and the page clips it. The host carries
  // the editor's own class names so the menu keeps its styling.
  let optionsMenuHost: HTMLElement | null = null;
  const unportalOptionsMenu = () => {
    if (!optionsMenu || !optionsMenuHost?.isConnected) return;
    optionsMenu.style.position = "";
    optionsMenu.style.left = "";
    optionsMenu.style.top = "";
    optionsMenu.style.zIndex = "";
    fieldHost.appendChild(optionsMenu);
    optionsMenuHost.remove();
  };
  const portalOptionsMenu = () => {
    if (!optionsMenu || !optionsTab) return;
    const doc = optionsTab.ownerDocument;
    if (!optionsMenuHost) {
      optionsMenuHost = doc.createElement("div");
      optionsMenuHost.className = root.className;
      optionsMenuHost.style.display = "contents";
      optionsMenuHost.setAttribute("data-visual-math-editor-options-host", "true");
      // A press inside the menu belongs to this editing session, like one in
      // the portaled catalog: it must not read as a click outside that commits.
      optionsMenuHost.setAttribute(VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE, "true");
    }
    doc.body.appendChild(optionsMenuHost);
    optionsMenuHost.appendChild(optionsMenu);
    const tab = optionsTab.getBoundingClientRect();
    optionsMenu.style.position = "fixed";
    optionsMenu.style.zIndex = "10000";
    let left = tab.right + 4;
    let top = tab.bottom + 8;
    optionsMenu.style.left = `${left}px`;
    optionsMenu.style.top = `${top}px`;
    // Kept inside the viewport: below the tab when there is room, else above.
    const menu = optionsMenu.getBoundingClientRect();
    const view = doc.defaultView;
    if (view && menu.width > 0) {
      if (menu.bottom > view.innerHeight) top = Math.max(0, tab.top - 8 - menu.height);
      if (menu.right > view.innerWidth) left = Math.max(0, tab.left - 4 - menu.width);
      optionsMenu.style.left = `${left}px`;
      optionsMenu.style.top = `${top}px`;
    }
  };
  const closeOptionsMenu = (refocus = false) => {
    if (!optionsMenu || !optionsTab || optionsMenu.hidden) return;
    optionsMenu.hidden = true;
    optionsTab.setAttribute("aria-expanded", "false");
    unportalOptionsMenu();
    if (refocus) focusDraftSurface();
  };
  if (optionsTab && optionsMenu) {
    const optionsLabel =
      labels.equationOptions ?? DEFAULT_VISUAL_MATH_EDITOR_LABELS.equationOptions!;
    optionsTab.type = "button";
    optionsTab.className = "visual-math-editor__options-tab";
    optionsTab.setAttribute("aria-label", optionsLabel);
    optionsTab.title = optionsLabel;
    optionsTab.setAttribute("aria-haspopup", "menu");
    optionsTab.setAttribute("aria-expanded", "false");
    optionsTab.setAttribute("data-testid", "visual-math-editor-options-tab");
    optionsTab.innerHTML =
      '<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    optionsMenu.className =
      "docs-cupertino-menu visual-math-editor__options-menu";
    optionsMenu.setAttribute("role", "menu");
    optionsMenu.setAttribute("aria-label", optionsLabel);
    optionsMenu.setAttribute("data-testid", "visual-math-editor-options-menu");
    optionsMenu.hidden = true;

    const layoutItems = new Map<EquationLayoutMode, HTMLButtonElement>();
    const menuItem = (
      label: string,
      role: "menuitem" | "menuitemradio",
      onSelect: () => void,
    ) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "visual-math-editor__options-item";
      item.setAttribute("role", role);
      item.tabIndex = -1;
      const check = document.createElement("span");
      check.className = "visual-math-editor__options-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      const text = document.createElement("span");
      text.textContent = label;
      item.append(check, text);
      // The field keeps focus and the draft: the click must not read as a
      // click outside the equation.
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeOptionsMenu();
        onSelect();
      });
      return item;
    };
    for (const [mode, label] of [
      ["professional", labels.professionalMode],
      ["linear", labels.linearMode],
    ] as const) {
      const item = menuItem(label, "menuitemradio", () => setLayoutMode(mode));
      item.setAttribute("data-testid", `visual-math-editor-options-${mode}`);
      layoutItems.set(mode, item);
      optionsMenu.appendChild(item);
    }
    if (options.onPlacementChange) {
      const separator = document.createElement("span");
      separator.setAttribute("role", "separator");
      optionsMenu.appendChild(separator);
      const target = options.variant === "block" ? "inline" : "display";
      const label =
        target === "inline"
          ? (labels.changeToInline ??
            DEFAULT_VISUAL_MATH_EDITOR_LABELS.changeToInline!)
          : (labels.changeToDisplay ??
            DEFAULT_VISUAL_MATH_EDITOR_LABELS.changeToDisplay!);
      const item = menuItem(label, "menuitem", () =>
        options.onPlacementChange?.(target),
      );
      item.setAttribute("data-testid", "visual-math-editor-options-placement");
      optionsMenu.appendChild(item);
    }
    const openOptionsMenu = () => {
      for (const [mode, item] of layoutItems) {
        item.setAttribute("aria-checked", String(layoutMode === mode));
      }
      optionsMenu.hidden = false;
      optionsTab.setAttribute("aria-expanded", "true");
      portalOptionsMenu();
      (
        optionsMenu.querySelector<HTMLButtonElement>("[aria-checked='true']") ??
        optionsMenu.querySelector<HTMLButtonElement>("button")
      )?.focus();
    };
    optionsTab.addEventListener("mousedown", (event) => event.preventDefault());
    optionsTab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (optionsMenu.hidden) openOptionsMenu();
      else closeOptionsMenu(true);
    });
    optionsMenu.addEventListener("keydown", (event) => {
      const items = [...optionsMenu.querySelectorAll<HTMLButtonElement>("button")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeOptionsMenu(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      } else if (event.key === "Tab") {
        closeOptionsMenu(true);
      }
    });
    fieldHost.append(optionsTab, optionsMenu);
  }

  // The live field hugs its own formula, so the container can be larger than
  // it (a committed formula wider than the draft, a placeholder box). A click
  // on that part of the container still belongs to the equation: it puts the
  // caret at the nearer end, as Word does inside its equation container.
  const handleFieldHostPointerDown = (event: PointerEvent) => {
    if (!fieldOnly || event.button !== 0 || layoutMode !== "professional") {
      return;
    }
    const field = mathfield;
    const target = event.target;
    if (!field || !(target instanceof Node)) return;
    if (
      field.contains(target) ||
      optionsTab?.contains(target) ||
      optionsMenu?.contains(target)
    ) {
      return;
    }
    event.preventDefault();
    if (!focusProfessionalField(field)) return;
    const rect = field.getBoundingClientRect();
    try {
      field.position =
        event.clientX < rect.left + rect.width / 2 ? 0 : field.lastOffset;
    } catch {
      // A field whose controller is being rebuilt keeps its own caret.
    }
  };
  if (fieldOnly) {
    fieldHost.addEventListener("pointerdown", handleFieldHostPointerDown);
  }

  const inputButtons = new Map<EquationInputMode, HTMLButtonElement>();
  for (const [mode, label] of [
    ["unicode", labels.unicodeMode],
    ["latex", labels.latexMode],
    ["text", labels.textMode],
  ] as const) {
    const inputButton = button(label, "visual-math-editor__tab", () =>
      setInputMode(mode),
    );
    inputButton.textContent = label;
    inputButton.setAttribute("aria-pressed", String(inputMode === mode));
    inputButton.setAttribute("data-testid", `visual-math-editor-input-${mode}`);
    inputModes.appendChild(inputButton);
    inputButtons.set(mode, inputButton);
  }

  const professionalTab = button(
    labels.professionalMode,
    "visual-math-editor__tab",
    () => setLayoutMode("professional"),
  );
  professionalTab.textContent = labels.professionalMode;
  professionalTab.setAttribute("role", "tab");
  professionalTab.id = `${editorId}-professional-tab`;
  professionalTab.setAttribute("aria-controls", visualPanel.id);
  visualPanel.setAttribute("aria-labelledby", professionalTab.id);
  professionalTab.setAttribute("data-testid", "visual-math-editor-tab-visual");
  const linearTab = button(labels.linearMode, "visual-math-editor__tab", () =>
    setLayoutMode("linear"),
  );
  linearTab.textContent = labels.linearMode;
  linearTab.setAttribute("role", "tab");
  linearTab.id = `${editorId}-linear-tab`;
  linearTab.setAttribute("aria-controls", sourcePanel.id);
  sourcePanel.setAttribute("aria-labelledby", linearTab.id);
  linearTab.setAttribute("data-testid", "visual-math-editor-tab-latex");
  layoutTabs.append(professionalTab, linearTab);
  updateModeButtons();
  if (layoutMode === "linear") syncSourceFromDraft();

  const insertLatex = (latex: string) => {
    const insertedLatex = latex.replaceAll("#?", "").replaceAll("#@", "");
    if (layoutMode === "linear") {
      const previousSource = source.value;
      const start = source.selectionStart ?? previousSource.length;
      const end = source.selectionEnd ?? start;
      if (!flushLinearSource()) return;
      const insertedSource =
        inputMode === "latex"
          ? insertedLatex
          : inputMode === "unicode"
            ? latexToReversibleWordLinear(insertedLatex)?.linear
            : latexToEquationText(insertedLatex);
      if (insertedSource === null || insertedSource === undefined) {
        showStatus(
          inputMode === "text"
            ? labels.textUnavailable
            : labels.conversionUnavailable,
        );
        return;
      }
      source.setRangeText(insertedSource, start, end, "end");
      sourceDirty = true;
      if (!flushLinearSource()) {
        source.value = previousSource;
        sourceDirty = false;
        source.setSelectionRange(start, end);
        return;
      }
      source.focus();
      return;
    }
    if (!mathfield) {
      draft += insertedLatex;
      source.value = draft;
      inputMode = "latex";
      setLayoutMode("linear");
      return;
    }
    mathfield.insert(latex, {
      insertionMode: "replaceSelection",
      selectionMode: "placeholder",
      focus: true,
      feedback: false,
    });
    draft = readLiveField(mathfield);
    syncProfessionalSize();
  };

  // Office's Bold keeps a letter's math italic (`m:sty bi`, \boldsymbol);
  // Italic on math letters, which are italic already, sets them upright
  // (`m:sty p`, \mathrm); Underline is Word's run underline (\uline, one
  // line under each run), not the Bar structure (\underline).
  const LINEAR_SELECTION_WRAPPERS: Record<"bold" | "italic" | "underline", string> = {
    bold: "\\boldsymbol",
    italic: "\\mathrm",
    underline: "\\uline",
  };
  const EQUATION_SELECTION_UNWRAP: Record<"bold" | "italic" | "underline", RegExp> = {
    bold: /^\\(?:mathbfit|boldsymbol|mathbf|bm)\{([\s\S]*)\}$/,
    italic: /^\\(?:mathrm|mathup)\{([\s\S]*)\}$/,
    underline: /^\\uline\{([\s\S]*)\}$/,
  };
  const selectionListeners = new Set<() => void>();
  const notifySelection = () => {
    options.onSelectionChange?.();
    for (const listener of selectionListeners) listener();
    notifyOpenVisualMathSelection();
  };
  const subscribeSelection = (listener: () => void) => {
    selectionListeners.add(listener);
    return () => {
      selectionListeners.delete(listener);
    };
  };

  const selectionFormatState = (kind: "bold" | "italic" | "underline"): boolean | null => {
    try {
      if (layoutMode === "linear") {
        if (inputMode !== "latex") return null;
        const start = source.selectionStart ?? source.value.length;
        const end = source.selectionEnd ?? start;
        return equationLettersFormatState(start === end ? source.value : source.value.slice(start, end), kind);
      }
      const field = mathfield;
      if (!field) return null;
      if (field.selectionIsCollapsed) {
        const at = field.position;
        if (at <= 0) return null;
        // The character before the caret; inside a wrapper MathLive reads
        // that as nothing, so the smallest whole structure around it.
        let latex = field.getValue([at - 1, at], "latex");
        if (!latex.trim()) {
          latex = field.getValue(
            visualMathStructureRange((offset) => field.getElementInfo(offset), field.lastOffset, [at - 1, at]),
            "latex",
          );
        }
        return latex.trim() ? equationLettersFormatState(latexFromLiveField(latex), kind) : null;
      }
      return equationLettersFormatState(latexFromLiveField(field.getValue(field.selection, "latex")), kind);
    } catch {
      return null;
    }
  };

  const formatSelection = (format: EquationSelectionFormat): boolean => {
    if (layoutMode === "linear") {
      if (inputMode !== "latex") return false;
      const start = source.selectionStart ?? source.value.length;
      const end = source.selectionEnd ?? start;
      if (start === end) return false;
      const selected = source.value.slice(start, end);
      const wrapped =
        format.kind === "color"
          ? format.color
            ? `\\textcolor{${format.color}}{${selected}}`
            : selected
          : `${LINEAR_SELECTION_WRAPPERS[format.kind]}{${selected}}`;
      source.setRangeText(wrapped, start, end, "select");
      sourceDirty = true;
      if (!flushLinearSource()) return false;
      source.focus();
      return true;
    }
    const field = mathfield;
    if (!field) return false;
    // Formatting never takes part of a structure (Word): the selection is
    // widened to whole structures first.
    const range = field.selection.ranges[0];
    if (range && !field.selectionIsCollapsed) {
      field.selection = {
        ranges: [visualMathStructureRange((offset) => field.getElementInfo(offset), field.lastOffset, range)],
      };
    }
    if (format.kind === "color") {
      field.applyStyle({ color: format.color ?? "none" });
    } else if (!field.selectionIsCollapsed) {
      // Office Math: Bold and Italic change the selected LETTERS (math
      // italic / upright / bold / bold italic), Underline every selected
      // run (a line under each, on its own baseline), each where it is; the
      // structure stays (a radical keeps its radicand). Toggled as the
      // button shows: off when every character has it.
      const selected = latexFromLiveField(field.getValue(field.selection, "latex"));
      const formatted = equationLatexWithLetterFormat(selected, format.kind);
      if (formatted !== selected) {
        field.insert(latexForLiveField(formatted), {
          insertionMode: "replaceSelection",
          selectionMode: "item",
          focus: true,
          feedback: false,
        });
      }
    } else {
      // A wrapper the selection is already in comes off (the button is a
      // toggle); otherwise the selection goes into it. With only a caret the
      // empty wrapper takes what is typed next.
      const selected = field.selectionIsCollapsed
        ? ""
        : field.getValue(field.selection, "latex").trim();
      let wrapped = EQUATION_SELECTION_UNWRAP[format.kind].exec(selected);
      // MathLive's bold italic sits in two wrappers (\mathbf{\mathbfit{…}}).
      while (format.kind === "bold" && wrapped) {
        const deeper = EQUATION_SELECTION_UNWRAP.bold.exec(wrapped[1]!.trim());
        if (!deeper) break;
        wrapped = deeper;
      }
      field.insert(
        wrapped
          ? wrapped[1]!
          : format.kind === "underline"
            ? latexForLiveField("\\uline{#@}")
            : `${format.kind === "bold" ? "\\mathbfit" : LINEAR_SELECTION_WRAPPERS[format.kind]}{#@}`,
        {
          insertionMode: "replaceSelection",
          selectionMode: wrapped ? "item" : "placeholder",
          focus: true,
          feedback: false,
        },
      );
    }
    draft = readLiveField(field);
    syncProfessionalSize();
    focusProfessionalField(field);
    notifySelection();
    return true;
  };

  const representabilityFailure = (
    latex: string,
  ): VisualMathStructureInsertResult | null => {
    if (inputMode === "unicode" && !latexToReversibleWordLinear(latex)) {
      return { ok: false, reason: "unsupported_unicode" };
    }
    if (inputMode === "text" && latexToEquationText(latex) === null) {
      return { ok: false, reason: "unsupported_text" };
    }
    return null;
  };

  const showRepresentabilityFailure = (
    result: VisualMathStructureInsertResult,
  ) => {
    if (result.ok) return;
    if (result.reason === "unsupported_text") {
      showStatus(labels.textUnavailable);
    } else if (result.reason === "unsupported_unicode") {
      showStatus(labels.conversionUnavailable);
    }
  };

  const resolveCatalogLatex = (
    kind: "structure" | "symbol",
    id: string,
  ): string | null => {
    if (kind === "structure") {
      return resolveEquationStructureMember(id)?.latex ?? null;
    }
    return resolveEquationPaletteSymbol(id)?.latex ?? null;
  };

  const insertCatalogIntoMathfield = (
    kind: "structure" | "symbol",
    id: string,
    placement: VisualMathStructurePlacement,
  ): VisualMathStructureInsertResult => {
    const insertedLatex = resolveCatalogLatex(kind, id);
    const field = mathfield;
    if (!insertedLatex) {
      return {
        ok: false,
        reason:
          kind === "symbol" ? "unknown_symbol" : "unknown_structure_member",
      };
    }
    if (!field || destroyed) {
      return { ok: false, reason: "stale_selection" };
    }
    const previousSelection = {
      ranges: field.selection.ranges.map(
        (range) => [range[0], range[1]] as [number, number],
      ),
      direction: field.selection.direction,
    };
    if (placement === "end") field.position = field.lastOffset;
    const inserted = field.insert(insertedLatex, {
      insertionMode: "replaceSelection",
      selectionMode: "placeholder",
      focus: false,
      feedback: false,
    });
    if (!inserted) {
      field.selection = previousSelection;
      showStatus(labels.loadFailed);
      return { ok: false, reason: "stale_selection" };
    }
    // Word inserts any structure into a professional-layout equation (a
    // matrix of placeholders included) without consulting the linear input
    // format; only the Linear view has to be able to spell it.
    draft = readLiveField(field);
    syncProfessionalSize();
    clearStatus();
    professionalFocusRequested = !focusProfessionalField(field);
    return { ok: true };
  };

  const insertCatalogItem = (
    kind: "structure" | "symbol",
    id: string,
    placement: VisualMathStructurePlacement = "selection",
  ): VisualMathStructureInsertResult => {
    const insertedLatex = resolveCatalogLatex(kind, id);
    if (!insertedLatex) {
      return {
        ok: false,
        reason:
          kind === "symbol" ? "unknown_symbol" : "unknown_structure_member",
      };
    }
    if (destroyed) {
      return { ok: false, reason: "stale_selection" };
    }
    const snapshot = captureDraftSnapshot();
    // A selection in a LaTeX source is a range of the equation itself; one
    // in a Text source refers to spelling that promotion rewrites.
    const sourceIsLatex = inputMode === "latex";
    if (kind === "structure" && inputMode === "text") {
      if (!setInputMode("latex")) {
        const failure: VisualMathStructureInsertResult = {
          ok: false,
          reason: "unsupported_text",
        };
        restoreDraftSnapshot(snapshot);
        showRepresentabilityFailure(failure);
        return failure;
      }
    }
    let appliedInSource = false;
    if (layoutMode === "linear") {
      // The Linear view's own selection is the target: a structure wraps the
      // selected source, a symbol replaces it, as the same selection in the
      // Professional view would. Handing the field a selection it never had
      
      const selectionStart = source.selectionStart ?? 0;
      const selectionEnd = source.selectionEnd ?? 0;
      if (sourceIsLatex && selectionEnd > selectionStart) {
        const selected = source.value.slice(selectionStart, selectionEnd);
        const template =
          kind === "structure"
            ? (resolveEquationStructureMember(id)?.latex ?? insertedLatex)
            : insertedLatex;
        const grouped =
          selected.length > 1 && !/^\{[\s\S]*\}$/.test(selected)
            ? `{${selected}}`
            : selected;
        const spelled = template.includes("#@")
          ? template.replaceAll("#@", grouped).replaceAll("#?", "\\placeholder{}")
          : template.replaceAll("#?", "\\placeholder{}");
        source.value = `${source.value.slice(0, selectionStart)}${spelled}${source.value.slice(selectionEnd)}`;
        sourceDirty = true;
        appliedInSource = true;
      }
      const candidateBase = sourceDirty ? parseLinearSource() : draft;
      if (candidateBase === null) {
        const failure: VisualMathStructureInsertResult = {
          ok: false,
          reason:
            inputMode === "text" ? "unsupported_text" : "unsupported_unicode",
        };
        showRepresentabilityFailure(failure);
        return failure;
      }
      const structure =
        kind === "structure" ? resolveEquationStructureMember(id) : null;
      const normalizedInsertion = structure
        ? equationStructureLatex(structure)
        : insertedLatex;
      const failure = representabilityFailure(
        appliedInSource ? candidateBase : `${candidateBase}${normalizedInsertion}`,
      );
      if (failure) {
        restoreDraftSnapshot(snapshot);
        showRepresentabilityFailure(failure);
        return failure;
      }
      if (!flushLinearSource()) {
        const flushFailure: VisualMathStructureInsertResult = {
          ok: false,
          reason:
            inputMode === "text" ? "unsupported_text" : "unsupported_unicode",
        };
        restoreDraftSnapshot(snapshot);
        showRepresentabilityFailure(flushFailure);
        return flushFailure;
      }
      layoutMode = "professional";
      updateModeButtons();
    }
    if (!mathfield) {
      if (pendingCatalogInsert) {
        return { ok: false, reason: "stale_selection" };
      }
      pendingCatalogInsert = {
        kind,
        id,
        placement: "end",
        snapshot,
        applied: appliedInSource,
      };
      root.setAttribute("aria-busy", "true");
      clearStatus();
      void mountProfessionalEditor();
      return { ok: true };
    }
    if (appliedInSource) {
      selectFirstPlaceholder(mathfield);
      return { ok: true };
    }
    const result = insertCatalogIntoMathfield(kind, id, placement);
    if (!result.ok) restoreDraftSnapshot(snapshot);
    return result;
  };

  /** The field's caret into the first placeholder of what the source spelled. */
  const selectFirstPlaceholder = (field: MathfieldElement) => {
    if (typeof field.executeCommand === "function") {
      field.position = 0;
      field.executeCommand("moveToNextPlaceholder");
    }
    syncProfessionalSize();
    clearStatus();
    professionalFocusRequested = !focusProfessionalField(field);
  };

  const insertStructureMember = (
    memberId: string,
    placement: VisualMathStructurePlacement = "selection",
  ): VisualMathStructureInsertResult =>
    insertCatalogItem("structure", memberId, placement);

  const insertSymbol = (
    symbolId: string,
    placement: VisualMathStructurePlacement = "selection",
  ): VisualMathStructureInsertResult =>
    insertCatalogItem("symbol", symbolId, placement);

  // MathLive's own insertion mode at the caret: "text" types \text{...}.
  const mathfieldMode = (field: MathfieldElement): { mode?: string } =>
    field as unknown as { mode?: string };
  const toggleNormalText = (): boolean => {
    const field = mathfield;
    if (!field || layoutMode !== "professional") return false;
    const target = mathfieldMode(field);
    target.mode = target.mode === "text" ? "math" : "text";
    focusProfessionalField(field);
    return true;
  };
  const normalTextActive = (): boolean =>
    !!mathfield && layoutMode === "professional" && mathfieldMode(mathfield).mode === "text";

  const insertStructure = (
    structureId: EquationStructureId,
    placement: VisualMathStructurePlacement = "selection",
  ): VisualMathStructureInsertResult => {
    const structure = EQUATION_STRUCTURES.find(
      (entry) => entry.id === structureId,
    );
    if (!structure) {
      return { ok: false, reason: "unknown_structure_member" };
    }
    return insertStructureMember(structure.defaultMemberId, placement);
  };

  const renderCatalogPreview = (target: HTMLElement, latex: string) => {
    target.setAttribute("aria-hidden", "true");
    target.setAttribute("aria-busy", "true");
    if (!renderTrustedLatex(target, latex)) {
      target.textContent = labels.loadFailed;
      target.removeAttribute("aria-busy");
      target.setAttribute("data-invalid", "true");
    }
  };

  const basicMathSymbolGroup = EQUATION_SYMBOL_GROUPS.find(
    (group) => group.id === "basicMath",
  );
  const firstSymbol = basicMathSymbolGroup?.symbols[0];
  if (!firstSymbol) throw new Error("Visual math symbol catalog is empty");
  const structureCategories: VisualMathCatalogCategory[] =
    EQUATION_STRUCTURES.map((family) => ({
      id: family.id,
      kind: "structure" as const,
      label: resolvedLabel(labels.templateLabels, family.id, family.id),
      previewLatex: equationStructurePreviewLatex(family),
    }));
  const symbolCategory: VisualMathCatalogCategory = {
    id: "symbols",
    kind: "symbols",
    label: labels.symbols,
    previewLatex: firstSymbol.latex,
  };

  const catalogGroup = document.createElement("span");
  catalogGroup.className = `visual-math-editor__palette-group ${styles.catalogGroup}`;
  catalogGroup.hidden = fieldOnly;
  const catalogHeading = document.createElement("span");
  catalogHeading.className = "visual-math-editor__palette-label";
  catalogHeading.textContent = labels.structures;
  const catalogRail = document.createElement("span");
  catalogRail.className = styles.catalogRail;
  catalogRail.setAttribute("role", "toolbar");
  catalogRail.setAttribute("aria-label", labels.structures);
  catalogRail.setAttribute("data-testid", "visual-math-editor-structures");

  const symbolGroup = document.createElement("span");
  symbolGroup.className = `visual-math-editor__palette-group ${styles.symbolGroup}`;
  symbolGroup.setAttribute("data-testid", "visual-math-editor-symbol-row");
  const symbolHeading = document.createElement("span");
  symbolHeading.className = "visual-math-editor__palette-label";
  symbolHeading.textContent = labels.symbols;
  const symbolRail = document.createElement("span");
  symbolRail.className = styles.symbolRail;
  symbolRail.setAttribute("role", "toolbar");
  symbolRail.setAttribute("aria-label", labels.symbols);
  const compactSymbolViewport = document.createElement("span");
  compactSymbolViewport.className = styles.compactSymbolViewport;
  compactSymbolViewport.setAttribute(
    "data-testid",
    "visual-math-editor-symbol-preview",
  );
  const compactSymbolGrid = document.createElement("span");
  compactSymbolGrid.className = styles.compactSymbolGrid;
  compactSymbolGrid.setAttribute("role", "group");
  compactSymbolGrid.setAttribute(
    "aria-label",
    resolvedLabel(
      symbolGroupLabels,
      basicMathSymbolGroup.id,
      basicMathSymbolGroup.label,
    ),
  );
  compactSymbolViewport.appendChild(compactSymbolGrid);
  symbolGroup.append(symbolHeading, symbolRail);

  const detail = document.createElement("span");
  detail.id = `${editorId}-catalog-detail`;
  detail.className = `docs-cupertino-menu docs-home-gallery-menu ${styles.detail}`;
  detail.setAttribute("role", "dialog");
  detail.setAttribute("aria-modal", "false");
  detail.setAttribute(VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE, "true");
  detail.setAttribute("data-state", "closed");
  detail.setAttribute("data-testid", "visual-math-editor-catalog-detail");
  detail.hidden = true;

  const detailHeader = document.createElement("span");
  detailHeader.className = styles.detailHeader;
  const detailHeading = document.createElement("span");
  detailHeading.id = `${editorId}-catalog-detail-heading`;
  detailHeading.className = styles.detailHeading;
  detail.setAttribute("aria-labelledby", detailHeading.id);

  const pager = document.createElement("span");
  pager.className = styles.pager;
  const previousPageButton = button("‹", styles.pagerButton, () => {
    changeCatalogPage(-1);
  });
  previousPageButton.textContent = "‹";
  previousPageButton.setAttribute(
    "data-testid",
    "visual-math-editor-catalog-previous",
  );
  const pageStatus = document.createElement("span");
  pageStatus.className = styles.pageStatus;
  pageStatus.setAttribute("role", "status");
  pageStatus.setAttribute("aria-live", "polite");
  pageStatus.setAttribute("aria-atomic", "true");
  pageStatus.setAttribute(
    "data-testid",
    "visual-math-editor-catalog-page-status",
  );
  const nextPageButton = button("›", styles.pagerButton, () => {
    changeCatalogPage(1);
  });
  nextPageButton.textContent = "›";
  nextPageButton.setAttribute("data-testid", "visual-math-editor-catalog-next");
  pager.append(previousPageButton, pageStatus, nextPageButton);
  detailHeader.append(detailHeading, pager);

  const detailSection = document.createElement("span");
  detailSection.className = `docs-home-gallery-menu__section ${styles.detailSection}`;
  const detailGrid = document.createElement("span");
  detailGrid.className = `docs-home-gallery-menu__grid ${styles.detailGrid}`;
  detailGrid.setAttribute("role", "group");
  detailGrid.setAttribute("data-testid", "visual-math-editor-catalog-grid");
  detailSection.appendChild(detailGrid);
  detail.append(detailHeader, detailSection);
  catalogGroup.append(catalogHeading, catalogRail, symbolGroup);
  visualPanel.appendChild(catalogGroup);
  document.body.appendChild(detail);

  const catalogTriggers: HTMLButtonElement[] = [];
  const structureCatalogTriggers: HTMLButtonElement[] = [];
  let activeCatalogCategory: VisualMathCatalogCategory | null = null;
  let activeCatalogTrigger: HTMLButtonElement | null = null;
  let activeCatalogPage = 0;
  let catalogPositionFrame: number | null = null;

  const positionCatalog = () => {
    if (detail.hidden || !activeCatalogTrigger) return;
    const triggerRect = activeCatalogTrigger.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight =
      document.documentElement.clientHeight || window.innerHeight;
    const viewportMargin = 12;
    const gap = 6;
    const detailWidth = Math.min(
      detailRect.width || 596,
      Math.max(0, viewportWidth - viewportMargin * 2),
    );
    const preferredHeight =
      activeCatalogCategory?.kind === "symbols" ? 680 : 340;
    const left = Math.min(
      Math.max(
        viewportMargin,
        triggerRect.left + triggerRect.width / 2 - detailWidth / 2,
      ),
      Math.max(viewportMargin, viewportWidth - viewportMargin - detailWidth),
    );
    const below = triggerRect.bottom + gap;
    const availableBelow = Math.max(0, viewportHeight - viewportMargin - below);
    detail.style.maxHeight = `${Math.floor(
      Math.min(preferredHeight, availableBelow),
    )}px`;
    detail.style.left = `${Math.round(left)}px`;
    detail.style.top = `${Math.round(below)}px`;
  };

  const scheduleCatalogPosition = () => {
    if (catalogPositionFrame !== null || detail.hidden) return;
    catalogPositionFrame = requestAnimationFrame(() => {
      catalogPositionFrame = null;
      positionCatalog();
    });
  };

  const handleCatalogViewportChange = () => scheduleCatalogPosition();
  window.addEventListener("resize", handleCatalogViewportChange);
  window.addEventListener("scroll", handleCatalogViewportChange, true);

  const focusDraftSurface = () => {
    clearIntersectingNativeSelection();
    if (layoutMode === "linear") {
      professionalFocusRequested = false;
      source.focus();
    } else if (focusProfessionalField()) {
      professionalFocusRequested = false;
    } else {
      professionalFocusRequested = true;
      // Hold focus INSIDE the editor until MathLive mounts, so the mount
      
      // there is no visible header tab to hold it: focusing the hidden one
      
      // equation opened after load took keystrokes into the paragraph.
      if (fieldOnly) root.focus({ preventScroll: true });
      else professionalTab.focus();
    }
  };
  root.addEventListener("keydown", (raw) => {
    const event = raw as KeyboardEvent;
    if (
      !professionalFocusRequested ||
      layoutMode !== "professional" ||
      event.target !== root ||
      event.isComposing ||
      event.ctrlKey || event.metaKey || event.altKey ||
      event.key.length !== 1
    ) {
      return;
    }
    event.preventDefault();
    typedBeforeMount += event.key;
  });

  const scheduleRequestedProfessionalFocus = (field: MathfieldElement) => {
    if (!professionalFocusRequested || professionalFocusFrame !== null) return;
    professionalFocusFrame = requestAnimationFrame(() => {
      professionalFocusFrame = null;
      const activeElement = root.ownerDocument.activeElement;
      if (
        !professionalFocusRequested ||
        destroyed ||
        mathfield !== field ||
        layoutMode !== "professional" ||
        !activeElement ||
        !root.contains(activeElement)
      ) {
        professionalFocusRequested = false;
        return;
      }
      clearIntersectingNativeSelection();
      if (focusProfessionalField(field)) {
        professionalFocusRequested = false;
        const typed = typedBeforeMount;
        typedBeforeMount = "";
        for (const character of typed) {
          try {
            field.executeCommand(["typedText", character]);
          } catch {
            field.insert(character);
          }
        }
      }
    });
  };

  const insertPaletteSymbol = (symbol: EquationPaletteSymbol) => {
    if (layoutMode === "linear") insertLatex(symbol.latex);
    else insertSymbol(symbol.id);
  };

  const catalogItemsFor = (
    category: VisualMathCatalogCategory,
  ): VisualMathCatalogItem[] => {
    if (category.kind === "symbols") {
      return EQUATION_SYMBOL_GROUPS.flatMap((group) =>
        group.symbols.map((entry) => ({
          id: entry.id,
          label: resolvedLabel(labels.symbolLabels, entry.id, entry.label),
          latex: entry.latex,
          glyph: entry.glyph,
          testId: `visual-math-editor-symbols-${entry.id}`,
          insert: () => insertPaletteSymbol(entry),
        })),
      );
    }
    return equationStructureMembersForFamily(category.id).map((member) => ({
      id: member.id,
      label: resolvedLabel(labels.templateLabels, member.id, category.label),
      latex: equationStructurePreviewLatex(member),
      testId: `visual-math-editor-member-${member.id}`,
      insert: () => {
        if (layoutMode === "linear") insertLatex(member.latex);
        else insertStructureMember(member.id);
      },
    }));
  };

  function closeCatalog(restoreTriggerFocus: boolean) {
    const triggerToRestore = activeCatalogTrigger;
    activeCatalogCategory = null;
    activeCatalogTrigger = null;
    activeCatalogPage = 0;
    for (const trigger of catalogTriggers) {
      trigger.setAttribute("aria-expanded", "false");
    }
    detail.hidden = true;
    detail.setAttribute("data-state", "closed");
    detail.removeAttribute("data-catalog-kind");
    detail.style.removeProperty("left");
    detail.style.removeProperty("top");
    detail.style.removeProperty("max-height");
    if (
      catalogPositionFrame !== null &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(catalogPositionFrame);
      catalogPositionFrame = null;
    }
    detailGrid.replaceChildren();
    detailSection.replaceChildren(detailGrid);
    pager.hidden = false;
    pageStatus.textContent = "";
    if (restoreTriggerFocus) triggerToRestore?.focus({ preventScroll: true });
  }

  const createCatalogTile = (
    item: VisualMathCatalogItem,
    position: number,
    setSize: number,
    symbolTile = false,
  ) => {
    const tile = button(
      item.label,
      `docs-home-gallery-menu__tile ${styles.detailTile}${
        symbolTile ? ` ${styles.symbolDetailTile}` : ""
      }`,
      () => {
        item.insert();
        closeCatalog(false);
        focusDraftSurface();
      },
    );
    tile.setAttribute("data-testid", item.testId);
    tile.setAttribute("aria-posinset", String(position));
    tile.setAttribute("aria-setsize", String(setSize));
    const preview = document.createElement("span");
    preview.className = `docs-home-gallery-menu__preview visual-math-editor__palette-preview ${styles.detailPreview}${
      symbolTile ? ` ${styles.symbolDetailGlyph}` : ""
    }`;
    if (symbolTile && item.glyph) {
      preview.setAttribute("aria-hidden", "true");
      preview.textContent = item.glyph;
    } else {
      renderCatalogPreview(preview, item.latex);
    }
    tile.appendChild(preview);
    if (!symbolTile) {
      const itemLabel = document.createElement("span");
      itemLabel.className = `docs-home-gallery-menu__label ${styles.detailLabel}`;
      itemLabel.textContent = item.label;
      tile.appendChild(itemLabel);
    }
    return tile;
  };

  const renderSymbolGallery = (focusFirstTile: boolean) => {
    const items = catalogItemsFor(symbolCategory);
    let position = 0;
    const sections = EQUATION_SYMBOL_GROUPS.map((group) => {
      const section = document.createElement("span");
      section.className = styles.symbolDetailSection;
      const heading = document.createElement("span");
      heading.id = `${editorId}-symbol-group-${group.id}`;
      heading.className = styles.symbolDetailHeading;
      heading.textContent = resolvedLabel(
        symbolGroupLabels,
        group.id,
        group.label,
      );
      const grid = document.createElement("span");
      grid.className = styles.symbolDetailGrid;
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-labelledby", heading.id);
      grid.setAttribute("data-symbol-group", group.id);
      for (const symbol of group.symbols) {
        position += 1;
        const item = items[position - 1];
        if (item)
          grid.appendChild(
            createCatalogTile(item, position, items.length, true),
          );
      }
      section.append(heading, grid);
      return section;
    });
    detailHeading.textContent = symbolCategory.label;
    detail.setAttribute("data-catalog-kind", "symbols");
    pager.hidden = true;
    pageStatus.textContent = "";
    detailSection.replaceChildren(...sections);
    positionCatalog();
    if (focusFirstTile) {
      sections[0]?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  };

  function renderCatalogPage(focusFirstTile = false) {
    const category = activeCatalogCategory;
    if (!category) return;
    if (category.kind === "symbols") {
      renderSymbolGallery(focusFirstTile);
      return;
    }
    detail.setAttribute("data-catalog-kind", "structure");
    pager.hidden = false;
    detailSection.replaceChildren(detailGrid);
    const items = catalogItemsFor(category);
    const pageCount = Math.max(
      1,
      Math.ceil(items.length / VISUAL_MATH_CATALOG_PAGE_SIZE),
    );
    activeCatalogPage = Math.min(activeCatalogPage, pageCount - 1);
    const pageStart = activeCatalogPage * VISUAL_MATH_CATALOG_PAGE_SIZE;
    const pageItems = items.slice(
      pageStart,
      pageStart + VISUAL_MATH_CATALOG_PAGE_SIZE,
    );
    const pageText = `${activeCatalogPage + 1} / ${pageCount}`;

    detailHeading.textContent = category.label;
    detailGrid.setAttribute("aria-label", category.label);
    pageStatus.textContent = pageText;
    previousPageButton.disabled = activeCatalogPage === 0;
    nextPageButton.disabled = activeCatalogPage === pageCount - 1;
    const previousTarget = Math.max(1, activeCatalogPage);
    const nextTarget = Math.min(pageCount, activeCatalogPage + 2);
    const previousLabel = `${category.label} ${previousTarget} / ${pageCount} ←`;
    const nextLabel = `${category.label} ${nextTarget} / ${pageCount} →`;
    previousPageButton.setAttribute("aria-label", previousLabel);
    previousPageButton.title = previousLabel;
    nextPageButton.setAttribute("aria-label", nextLabel);
    nextPageButton.title = nextLabel;

    const tiles: HTMLButtonElement[] = [];
    for (const [pageIndex, item] of pageItems.entries()) {
      const tile = createCatalogTile(
        item,
        pageStart + pageIndex + 1,
        items.length,
      );
      tiles.push(tile);
    }
    detailGrid.replaceChildren(...tiles);
    positionCatalog();
    if (focusFirstTile) tiles[0]?.focus();
  }

  function changeCatalogPage(delta: -1 | 1) {
    const category = activeCatalogCategory;
    if (!category || category.kind === "symbols") return;
    const pageCount = Math.max(
      1,
      Math.ceil(
        catalogItemsFor(category).length / VISUAL_MATH_CATALOG_PAGE_SIZE,
      ),
    );
    const nextPage = Math.min(
      pageCount - 1,
      Math.max(0, activeCatalogPage + delta),
    );
    if (nextPage === activeCatalogPage) return;
    activeCatalogTrigger?.focus();
    activeCatalogPage = nextPage;
    renderCatalogPage();
    (delta === -1 ? nextPageButton : previousPageButton).focus();
  }

  const setStructureCatalogRovingIndex = (index: number) => {
    for (const [triggerIndex, trigger] of structureCatalogTriggers.entries()) {
      trigger.tabIndex = triggerIndex === index ? 0 : -1;
    }
  };

  const openCatalog = (
    category: VisualMathCatalogCategory,
    trigger: HTMLButtonElement,
  ) => {
    const structureTriggerIndex = structureCatalogTriggers.indexOf(trigger);
    if (structureTriggerIndex >= 0) {
      setStructureCatalogRovingIndex(structureTriggerIndex);
    }
    activeCatalogCategory = category;
    activeCatalogTrigger = trigger;
    activeCatalogPage = 0;
    for (const candidate of catalogTriggers) {
      candidate.setAttribute(
        "aria-expanded",
        String(candidate === activeCatalogTrigger),
      );
    }
    detail.hidden = false;
    detail.setAttribute("data-state", "open");
    renderCatalogPage(true);
    scheduleCatalogPosition();
  };

  for (const symbol of basicMathSymbolGroup.symbols.slice(
    0,
    VISUAL_MATH_COMPACT_SYMBOL_COUNT,
  )) {
    const shortcutLabel = resolvedLabel(
      labels.symbolLabels,
      symbol.id,
      symbol.label,
    );
    const shortcut = button(shortcutLabel, styles.symbolShortcut, () => {
      insertPaletteSymbol(symbol);
      focusDraftSurface();
    });
    shortcut.setAttribute(
      "data-testid",
      `visual-math-editor-symbol-shortcut-${symbol.id}`,
    );
    const glyph = document.createElement("span");
    glyph.className = styles.symbolShortcutGlyph;
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = symbol.glyph;
    shortcut.appendChild(glyph);
    compactSymbolGrid.appendChild(shortcut);
  }

  for (const category of structureCategories) {
    const trigger = button(
      category.label,
      `visual-math-editor__palette-button ${styles.catalogTrigger}`,
      () => openCatalog(category, trigger),
    );
    trigger.id = `${editorId}-catalog-trigger-${category.id}`;
    trigger.tabIndex = catalogTriggers.length === 0 ? 0 : -1;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", detail.id);
    trigger.setAttribute("data-catalog-category", category.id);
    trigger.setAttribute(
      "data-testid",
      category.kind === "symbols"
        ? "visual-math-editor-symbols"
        : `visual-math-editor-structures-${category.id}`,
    );
    const preview = document.createElement("span");
    preview.className = `visual-math-editor__palette-preview ${styles.catalogTriggerPreview}`;
    renderCatalogPreview(preview, category.previewLatex);
    const labelRow = document.createElement("span");
    labelRow.className = styles.catalogTriggerLabel;
    const triggerLabel = document.createElement("span");
    triggerLabel.className = styles.catalogTriggerText;
    triggerLabel.textContent = category.label;
    const chevron = document.createElement("span");
    chevron.className = styles.chevron;
    chevron.setAttribute("aria-hidden", "true");
    labelRow.append(triggerLabel, chevron);
    trigger.append(preview, labelRow);
    catalogTriggers.push(trigger);
    structureCatalogTriggers.push(trigger);
    catalogRail.appendChild(trigger);
  }

  const symbolDisclosure = button(labels.symbols, styles.symbolDisclosure, () =>
    openCatalog(symbolCategory, symbolDisclosure),
  );
  symbolDisclosure.id = `${editorId}-catalog-trigger-symbols`;
  symbolDisclosure.tabIndex = 0;
  symbolDisclosure.setAttribute("aria-haspopup", "dialog");
  symbolDisclosure.setAttribute("aria-expanded", "false");
  symbolDisclosure.setAttribute("aria-controls", detail.id);
  symbolDisclosure.setAttribute("data-catalog-category", "symbols");
  symbolDisclosure.setAttribute("data-testid", "visual-math-editor-symbols");
  const symbolDisclosureChevron = document.createElement("span");
  symbolDisclosureChevron.className = styles.chevron;
  symbolDisclosureChevron.setAttribute("aria-hidden", "true");
  symbolDisclosure.appendChild(symbolDisclosureChevron);
  catalogTriggers.push(symbolDisclosure);
  symbolRail.append(compactSymbolViewport, symbolDisclosure);

  const handleCatalogRailKeydown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!(keyboardEvent.target instanceof Element)) return;
    const trigger = keyboardEvent.target.closest<HTMLButtonElement>(
      "[data-catalog-category]",
    );
    if (
      !trigger ||
      (!catalogRail.contains(trigger) && !symbolRail.contains(trigger))
    ) {
      return;
    }
    const structureTriggerIndex = structureCatalogTriggers.indexOf(trigger);
    const isStructureTrigger = structureTriggerIndex >= 0;

    let nextIndex: number | null = null;
    if (isStructureTrigger && keyboardEvent.key === "ArrowLeft") {
      nextIndex =
        (structureTriggerIndex - 1 + structureCatalogTriggers.length) %
        structureCatalogTriggers.length;
    } else if (isStructureTrigger && keyboardEvent.key === "ArrowRight") {
      nextIndex = (structureTriggerIndex + 1) % structureCatalogTriggers.length;
    } else if (isStructureTrigger && keyboardEvent.key === "Home") {
      nextIndex = 0;
    } else if (isStructureTrigger && keyboardEvent.key === "End") {
      nextIndex = structureCatalogTriggers.length - 1;
    }

    if (nextIndex !== null) {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      setStructureCatalogRovingIndex(nextIndex);
      structureCatalogTriggers[nextIndex]?.focus();
      return;
    }
    if (
      keyboardEvent.key === "Enter" ||
      keyboardEvent.key === " " ||
      keyboardEvent.key === "ArrowDown"
    ) {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      openCatalog(
        isStructureTrigger
          ? structureCategories[structureTriggerIndex]!
          : symbolCategory,
        trigger,
      );
    }
  };
  catalogRail.addEventListener("keydown", handleCatalogRailKeydown);
  symbolRail.addEventListener("keydown", handleCatalogRailKeydown);

  const footer = document.createElement("span");
  footer.className = "visual-math-editor__footer";
  footer.hidden = fieldOnly;
  const cancelButton = button(
    labels.cancel,
    "visual-math-editor__action visual-math-editor__action--secondary",
    options.onCancel,
  );
  cancelButton.textContent = labels.cancel;
  cancelButton.setAttribute("data-testid", "visual-math-editor-cancel");
  const doneButton = button(
    labels.done,
    "visual-math-editor__action visual-math-editor__action--primary",
    () => commit(),
  );
  doneButton.textContent = labels.done;
  doneButton.setAttribute("data-testid", "visual-math-editor-done");
  footer.append(cancelButton, doneButton);
  root.appendChild(footer);

  source.addEventListener("input", () => {
    sourceDirty = true;
    updateLinearPreview();
  });

  // UnicodeMath input, as Word's linear format types it: letters become math
  // italic variables (𝑥), a recognized function name turns upright when a
  // space or bracket follows it, and `\alpha␣` style keywords are replaced by
  // their character (Math AutoCorrect). Inserted through insertText so the
  // textarea's own undo keeps working.
  let applyingLinearInput = false;
  const replaceSourceRange = (text: string, start: number, end: number) => {
    applyingLinearInput = true;
    try {
      source.setSelectionRange(start, end);
      const inserted =
        typeof document.execCommand === "function" &&
        document.execCommand("insertText", false, text);
      if (!inserted) {
        source.setRangeText(text, start, end, "end");
        source.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } finally {
      applyingLinearInput = false;
    }
  };
  source.addEventListener("beforeinput", (event) => {
    if (applyingLinearInput || inputMode !== "unicode") return;
    const inputEvent = event as InputEvent;
    if (inputEvent.isComposing) return;
    const data =
      inputEvent.inputType === "insertText"
        ? inputEvent.data
        : inputEvent.inputType === "insertFromPaste" ||
            inputEvent.inputType === "insertFromDrop"
          ? (inputEvent.dataTransfer?.getData("text/plain") ?? null)
          : null;
    if (!data) return;
    const start = source.selectionStart ?? source.value.length;
    const end = source.selectionEnd ?? start;
    const before = source.value.slice(0, start);
    const typed = translateLinearInput(data, before);
    // What the text would read with the insertion, then the completions a
    // terminating character triggers right before the caret.
    let value = before + typed + source.value.slice(end);
    let caret = before.length + typed.length;
    let replaced = typed !== data;
    if (Array.from(data).length === 1) {
      const keyword = completeLinearKeyword(value, caret);
      if (keyword) {
        value = keyword.text;
        caret = keyword.cursor;
        replaced = true;
      } else {
        const upright = uprightFunctionNameBefore(value, caret);
        if (upright) {
          value = upright.text;
          caret = upright.cursor;
          replaced = true;
        }
      }
    }
    if (!replaced) return;
    event.preventDefault();
    // Replace the smallest span that changed, so undo restores exactly it.
    const original = source.value;
    let prefix = 0;
    while (
      prefix < start &&
      prefix < value.length &&
      original[prefix] === value[prefix]
    ) {
      prefix += 1;
    }
    // Never split a surrogate pair (math italic letters are astral).
    if (prefix > 0 && /[\uD800-\uDBFF]/u.test(original[prefix - 1] ?? "")) prefix -= 1;
    const tail = original.length - end;
    replaceSourceRange(
      value.slice(prefix, value.length - tail),
      prefix,
      end,
    );
    source.setSelectionRange(caret, caret);
  });

  // Linear editing gets the same escape as Professional: an arrow key at the
  // first/last character of the source hands the caret to the document on that
  // side of the equation rather than parking it against the inside edge.
  source.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight") {
      return;
    }
    if (keyboardEvent.altKey || keyboardEvent.metaKey || keyboardEvent.shiftKey) {
      return;
    }
    const { selectionStart, selectionEnd, value } = source;
    if (selectionStart === null || selectionEnd === null) return;
    if (selectionStart !== selectionEnd) return;
    const backward = keyboardEvent.key === "ArrowLeft";
    if (backward ? selectionStart !== 0 : selectionStart !== value.length) return;
    if (!options.onMoveOut?.(backward ? "backward" : "forward")) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
  });

  const handleEditorKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (
      keyboardEvent.target === professionalTab ||
      keyboardEvent.target === linearTab
    ) {
      if (
        keyboardEvent.key === "ArrowLeft" ||
        keyboardEvent.key === "ArrowRight"
      ) {
        keyboardEvent.preventDefault();
        setLayoutMode(
          layoutMode === "professional" ? "linear" : "professional",
        );
        return;
      }
      if (keyboardEvent.key === "Home" || keyboardEvent.key === "End") {
        keyboardEvent.preventDefault();
        setLayoutMode(keyboardEvent.key === "Home" ? "professional" : "linear");
        return;
      }
    }
    if (keyboardEvent.key === "Escape") {
      handleEscapeKeyDown(keyboardEvent);
    } else if (
      (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
      !keyboardEvent.altKey &&
      !keyboardEvent.shiftKey &&
      !keyboardEvent.defaultPrevented &&
      (keyboardEvent.target === mathfield || keyboardEvent.target === source) &&
      EQUATION_FORMAT_SHORTCUTS[keyboardEvent.key.toLowerCase()]
    ) {
      // Ctrl/Cmd+B, I, U inside the equation format the selected part of it,
      // as in Word and PowerPoint; the document around never sees the key.
      const kind = EQUATION_FORMAT_SHORTCUTS[keyboardEvent.key.toLowerCase()]!;
      if (formatSelection({ kind })) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
      }
    } else if (
      keyboardEvent.key === "Enter" &&
      (keyboardEvent.metaKey || keyboardEvent.ctrlKey)
    ) {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      commit();
    } else if (
      fieldOnly &&
      keyboardEvent.key === "Enter" &&
      !keyboardEvent.shiftKey &&
      !keyboardEvent.altKey &&
      !keyboardEvent.isComposing
    ) {
      // In place there is no Done button: Enter finishes the equation, as
      // clicking outside it does. MathLive has already handled the key by
      // now; when it used Enter itself (a new row in a multi-line structure
      // such as gathered or aligned) the draft changed and the equation
      // stays open.
      const valueBeforeEnter = mathfieldValueBeforeEnter;
      mathfieldValueBeforeEnter = null;
      const fromField =
        layoutMode === "professional" &&
        mathfield !== null &&
        keyboardEvent.target === mathfield &&
        valueBeforeEnter !== null &&
        mathfield.value === valueBeforeEnter;
      const fromInlineSource =
        inlineInPlace &&
        layoutMode === "linear" &&
        keyboardEvent.target === source;
      if (!fromField && !fromInlineSource) return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      commit();
    }
  };
  // The field's value as Enter reached it (captured before MathLive runs).
  let mathfieldValueBeforeEnter: string | null = null;
  const captureMathfieldValueBeforeEnter = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    mathfieldValueBeforeEnter =
      fieldOnly &&
      keyboardEvent.key === "Enter" &&
      mathfield !== null &&
      keyboardEvent.target === mathfield
        ? mathfield.value
        : null;
  };
  // Esc is the editor's, before MathLive's: MathLive's own Escape binding
  // switches the SELECTION to LaTeX mode, and a draft read after that lost
  // the selected part of the formula (select "b^2-4a" by drag, press Esc:
  // the committed equation kept only "c"). In the capture phase the field's
  // internal handler never sees it.
  // `root` is a span or a div, so its listeners take a plain Event.
  function handleEscapeKeyDown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Escape" || keyboardEvent.defaultPrevented) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    if (activeCatalogCategory) {
      closeCatalog(true);
      return;
    }
    // In place there is no Cancel to reach for, and Word never abandons an
    // equation edit: Esc keeps the draft and leaves the equation selected.
    // The full editor keeps Esc as its Cancel button's shortcut.
    if (fieldOnly) commit("escape");
    else options.onCancel();
  }
  root.addEventListener("keydown", captureMathfieldValueBeforeEnter, true);
  root.addEventListener("keydown", handleEscapeKeyDown, true);
  root.addEventListener("keydown", handleEditorKeyDown);
  detail.addEventListener("keydown", handleEditorKeyDown);

  // A Mermaid or code chart block wears a dialog's card in the page
  // (`office-dialog--embedded`), which is no dialog: a press on one is a press
  // back in the document, and it leaves the equation like any other.
  const isExternalFocusOwner = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    Boolean(target.closest(VISUAL_MATH_EDITOR_FOCUS_OWNER_SELECTOR)) &&
    !target.closest(".office-dialog--embedded")?.closest(".ProseMirror");

  const handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (
      optionsMenu &&
      optionsTab &&
      !optionsMenu.hidden &&
      !(
        target instanceof Node &&
        (optionsMenu.contains(target) || optionsTab.contains(target))
      )
    ) {
      closeOptionsMenu();
    }
    if (target instanceof Node && detail.contains(target)) {
      return;
    }
    if (activeCatalogCategory) {
      closeCatalog(false);
      return;
    }
    if (
      (target instanceof Node && root.contains(target)) ||
      isExternalFocusOwner(target)
    ) {
      return;
    }
    commit();
  };

  // A draft ends only through Done, Escape/Cancel, or a deliberate pointer
  // action outside the complete editor session. Transient focus movement
  // through MathLive's shadow tree or this portaled catalog is not a commit.
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);

  /** Load and mount Professional after the editor is opened in a browser. */
  function mountProfessionalEditor(): Promise<boolean> {
    if (destroyed) return Promise.resolve(false);
    if (mathfield) return Promise.resolve(true);
    if (professionalMountPromise) return professionalMountPromise;
    root.setAttribute("aria-busy", "true");
    loading.textContent = labels.loading;
    loading.removeAttribute("data-error");
    let candidateField: MathfieldElement | null = null;
    let candidateInputListener: EventListener | null = null;
    let candidateMountListener: EventListener | null = null;
    let candidateMoveOutListener: EventListener | null = null;

    professionalMountPromise = loadInteractiveMathLiveRuntime()
      .then(({ MathfieldElement }) => {
        if (destroyed) return false;
        MathfieldElement.soundsDirectory = null;
        const field = new MathfieldElement();
        candidateField = field;
        field.className = "visual-math-editor__mathfield";
        field.setAttribute("aria-label", labels.label);
        field.setAttribute("data-testid", "visual-math-editor-mathfield");
        candidateMountListener = () => {
          keepMathSelectionPainted(field);
          if (mathfield === field) scheduleRequestedProfessionalFocus(field);
          observeLiveFieldSizes(field);
          scheduleLiveFieldAlignment();
          // The press that opened the editor: the caret goes where it landed
          // once the formula is typeset (the alignment pass re-tries too).
          if (mathfield === field) {
            requestAnimationFrame(() => {
              applyPointerAnchor(field);
              applyCaretEdge(field);
              applyCarriedCaret(field);
            });
          }
          // MathLive and KaTeX metrics move once the math fonts arrive.
          void document.fonts?.ready.then(() => scheduleLiveFieldAlignment());
        };
        field.addEventListener("mount", candidateMountListener);
        fieldHost.replaceChildren(
          ...[sizingReference, field, optionsTab, optionsMenu].filter(
            (element): element is HTMLElement => element !== null,
          ),
        );
        field.menuItems = [];
        // amsmath's dots, which KaTeX and Word's equations draw but MathLive
        // 0.109 does not define: an equation holding "\dots" opened as the
        // raw command, marked as an error ("e^x = 1 + x + ... + \dots").
        // Each is drawn as the dots it stands for and written back as itself.
        field.macros = {
          ...field.macros,
          ...AMS_DOTS_MACROS,
        };
        field.mathModeSpace = "\\;";
        field.mathVirtualKeyboardPolicy = "manual";
        field.smartFence = true;
        // An inline equation is typeset in text style (fractions, limits and
        // large operators at their in-line size), exactly like the KaTeX
        // rendering it replaces; display equations keep display style.
        if (options.variant === "inline") field.defaultMode = "inline-math";
        // In place, an empty equation shows Word's placeholder box and is
        // measured as that same box (see syncProfessionalSize).
        if (fieldOnly) field.placeholder = emptyPlaceholderLatex;
        writeLiveField(field, draft);
        candidateInputListener = () => {
          draft = readLiveField(field);
          syncProfessionalSize();
        };
        field.addEventListener("input", candidateInputListener);
        // MathLive's cancellable `move-out` fires exactly at the edge Word hands
        // the caret back to the document from. Only horizontal escapes are
        // Word's behaviour; up/down inside a fraction or matrix stay MathLive's.
        candidateMoveOutListener = (event: Event) => {
          if (mathfield !== field) return;
          const detail = (event as CustomEvent<{ direction?: string }>).detail;
          const direction = detail?.direction;
          if (direction !== "forward" && direction !== "backward") return;
          if (!options.onMoveOut?.(direction)) return;
          event.preventDefault();
        };
        field.addEventListener("move-out", candidateMoveOutListener);
        // A selection that reaches into a structure takes all of it (Word).
        field.addEventListener("selection-change", () => {
          if (mathfield !== field) return;
          notifySelection();
          const range = field.selection.ranges[0];
          if (!range || field.selectionIsCollapsed) return;
          const whole = visualMathStructureRange((offset) => field.getElementInfo(offset), field.lastOffset, range);
          if (whole[0] === Math.min(range[0], range[1]) && whole[1] === Math.max(range[0], range[1])) return;
          field.selection = { ranges: [whole], direction: field.selection.direction };
        });
        mathfield = field;
        mathfieldInputListener = candidateInputListener;
        mathfieldMountListener = candidateMountListener;
        mathfieldMoveOutListener = candidateMoveOutListener;
        updateLinearPreview();
        root.removeAttribute("aria-busy");
        loading.removeAttribute("data-error");
        clearStatus();
        const pending = pendingCatalogInsert;
        pendingCatalogInsert = null;
        if (pending?.applied) {
          selectFirstPlaceholder(field);
          if (pendingCommit) {
            pendingCommit = false;
            commit(pendingCommitVia);
          }
        } else if (pending) {
          const result = insertCatalogIntoMathfield(
            pending.kind,
            pending.id,
            pending.placement,
          );
          if (!result.ok) {
            restoreDraftSnapshot(pending.snapshot);
            pendingCommit = false;
            if (result.reason === "stale_selection") {
              showStatus(labels.loadFailed);
            }
          } else if (pendingCommit) {
            pendingCommit = false;
            commit(pendingCommitVia);
          }
        }
        scheduleRequestedProfessionalFocus(field);
        return true;
      })
      .catch(() => {
        if (candidateField && candidateInputListener) {
          candidateField.removeEventListener("input", candidateInputListener);
        }
        if (candidateField && candidateMountListener) {
          candidateField.removeEventListener("mount", candidateMountListener);
        }
        if (candidateField && candidateMoveOutListener) {
          candidateField.removeEventListener(
            "move-out",
            candidateMoveOutListener,
          );
        }
        if (mathfield === candidateField) {
          mathfield = null;
          mathfieldInputListener = null;
          mathfieldMountListener = null;
          mathfieldMoveOutListener = null;
        }
        candidateField?.remove();
        if (destroyed) return false;
        if (loading.parentElement !== fieldHost) {
          fieldHost.replaceChildren(loading);
        }
        const pending = pendingCatalogInsert;
        pendingCatalogInsert = null;
        pendingCommit = false;
        professionalFocusRequested = false;
        mathfield = null;
        root.removeAttribute("aria-busy");
        loading.textContent = labels.loadFailed;
        loading.setAttribute("data-error", "true");
        if (pending) restoreDraftSnapshot(pending.snapshot);
        layoutMode = "linear";
        if (!syncSourceFromDraft()) {
          inputMode = "latex";
          source.value = draft;
          sourceDirty = false;
          updateSourceLabel();
          updateLinearPreview();
        }
        updateModeButtons();
        showStatus(labels.loadFailed);
        return false;
      })
      .finally(() => {
        professionalMountPromise = null;
      });
    return professionalMountPromise;
  }

  syncProfessionalSize();
  if (sizingReference) fieldHost.prepend(sizingReference);
  void mountProfessionalEditor();

  const controller: VisualMathEditorController = {
    dom: root,
    focus() {
      focusDraftSurface();
    },
    getValue,
    getState,
    setInputMode,
    setLayoutMode,
    beginPointerSelection,
    placeCaretAtEdge,
    getCaret,
    restoreCaret,
    insertStructure,
    insertStructureMember,
    insertSymbol,
    toggleNormalText,
    formatSelection,
    selectionFormatState,
    subscribeSelection,
    normalTextActive,
    insertLatex,
    commitDraft() {
      commit();
    },
    destroy() {
      OPEN_VISUAL_MATH_EDITORS.delete(controller);
      notifyOpenVisualMathSelection();
      unportalOptionsMenu();
      optionsMenuHost?.remove();
      destroyed = true;
      pointerSelection = null;
      if (liveFieldAlignmentFrame !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(liveFieldAlignmentFrame);
        liveFieldAlignmentFrame = null;
      }
      liveFieldSizeObserver?.disconnect();
      liveFieldSizeObserver = null;
      root.removeEventListener("keydown", handleEscapeKeyDown, true);
      root.removeEventListener("keydown", handleEditorKeyDown);
      root.removeEventListener(
        "keydown",
        captureMathfieldValueBeforeEnter,
        true,
      );
      detail.removeEventListener("keydown", handleEditorKeyDown);
      fieldHost.removeEventListener("pointerdown", handleFieldHostPointerDown);
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      window.removeEventListener("resize", handleCatalogViewportChange);
      window.removeEventListener("scroll", handleCatalogViewportChange, true);
      if (
        catalogPositionFrame !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(catalogPositionFrame);
      }
      catalogPositionFrame = null;
      if (
        professionalFocusFrame !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(professionalFocusFrame);
      }
      professionalFocusFrame = null;
      professionalFocusRequested = false;
      pendingCatalogInsert = null;
      pendingCommit = false;
      root.removeAttribute("aria-busy");
      if (mathfield && mathfieldInputListener) {
        mathfield.removeEventListener("input", mathfieldInputListener);
      }
      if (mathfield && mathfieldMountListener) {
        mathfield.removeEventListener("mount", mathfieldMountListener);
      }
      if (mathfield && mathfieldMoveOutListener) {
        mathfield.removeEventListener("move-out", mathfieldMoveOutListener);
      }
      mathfieldInputListener = null;
      mathfieldMountListener = null;
      mathfieldMoveOutListener = null;
      mathfield = null;
      detail.remove();
      root.remove();
    },
  };
  OPEN_VISUAL_MATH_EDITORS.add(controller);
  notifyOpenVisualMathSelection();
  return controller;
}
