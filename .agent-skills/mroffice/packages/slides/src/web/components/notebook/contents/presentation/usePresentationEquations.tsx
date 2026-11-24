"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A slide's equations in the editor (PowerPoint's Insert > Equation and the
 * contextual Equation tab, PPT-A052): the window wires its selection and its
 * commit boundary in, this hook owns the rest.
 *
 * - Insert a gallery equation (or a template or a symbol from the Insert
 *   menu) at once; "Insert New Equation" (and Alt+=) opens the visual editor
 *   on an empty draft and inserts on Done. Where the equation goes is
 *   PowerPoint's rule (`presentationEquationTarget`).
 * - With nothing that takes text selected the equation gets its own EQUATION
 *   BOX (`presentationEquationBoxSpan`: a text box whose whole text is one
 *   display equation), edited IN PLACE with the Docs MathBlock's field
 *   (`EquationInPlaceEditor`) under PowerPoint's "Type equation here."
 *   prompt; leaving the equation commits it and sizes the box to it. A new
 *   box is a draft until then: an empty one never reaches the slide.
 * - A click on an equation box's equation opens it in place, the caret where
 *   the press landed; a click on an equation among other text opens the
 *   shared editor dialog on it. Done replaces it in place, an emptied draft
 *   removes it (an emptied equation box goes whole), Cancel changes nothing.
 * - Every equation that reaches the page carries the characters the server's
 *   Office Math draws (`fetchPresentationEquationText`); a refusal or a
 *   network failure inserts nothing and says so. Each insertion or edit is
 *   one commit, so one Undo.
 * - The contextual Equation tab drives the open draft (`runInEditor`); with
 *   no draft open it opens the editor on the selected equation first.
 */

import { pointsToDesignPx } from "@mrnote/core/web/lib/presentation/text-units.ts";
import { officeShownTextColor } from "@mrnote/core/web/lib/office-painted-caret.ts";
import {
  presentationPreviewAtomSpans,
  presentationPreviewPlainText,
  presentationPreviewSelection,
  setPresentationPreviewSelection,
} from "@mrnote/core/web/lib/presentation/text-selection.ts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";

import { EquationVisualEditorDialog } from "@mrnote/core/web/components/office-equation/EquationVisualEditorDialog.tsx";
import type { EquationInPlaceCommitVia } from "@mrnote/core/web/components/office-equation/EquationInPlaceEditor.tsx";
import type {
  VisualMathEditorController,
  EquationSelectionFormat,
  VisualMathEditorState,
} from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import type { EquationInputMode, EquationLayoutMode } from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import { latexToReversibleWordLinear } from "@mrnote/core/web/lib/unicode-math/index.ts";
import { NEW_TEXT_BOX_FONT_SIZE_PX } from "@mrnote/core/web/lib/presentation-shape-buttons.ts";
import { officeInkEquationFontSizePt } from "@mrnote/core/web/lib/office-ink-conversion.ts";
import { POWERPOINT_FONT_SIZE_POINTS } from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import type { PresentationTextBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { nativeOfficeOwnsFocus } from "@mrnote/core/web/lib/native-office-focus.ts";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { reconcilePresentationTextBlock } from "@mrnote/core/web/lib/presentation-shape-buttons.ts";
import {
  defaultEquationBoxFrame,
  equationBoxFrame,
  presentationEquationBoxSpan,
  presentationEquationSpanAt,
  presentationEquationSpans,
  presentationEquationTarget,
  presentationEquationTargetDisplay,
  slideWithEquation,
  textBlockWithEquationReplaced,
  type PresentationEquationSpan,
  type PresentationEquationTarget,
} from "../../../../lib/presentation-equation-buttons";
import { fetchPresentationEquationText } from "../../../../lib/presentation/equation-text-client";
import { PRESENTATION_MATH_SELECTOR } from "@mrnote/core/web/lib/presentation/math-atom.ts";
import {
  OFFICE_FIELD_EQUATION_ENTER_EVENT,
  type OfficeFieldEquationEnterDetail,
  type PresentationCellTextElement,
} from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import { measurePresentationEquation } from "./equationBoxMeasure";
import {
  PresentationEquationBoxEditor,
  PresentationEquationSlotEditor,
  PresentationInlineEquationEditor,
  presentationEquationLiveLook,
} from "./PresentationEquationBoxEditor";
import {
  PRESENTATION_EQUATION_SLOT_ATTRIBUTE,
  PRESENTATION_EQUATION_SLOT_TEXT,
  presentationEquationSlotSentinel,
} from "@mrnote/core/web/components/notebook/contents/presentation/presentationEquationSlot.ts";
import {
  presentationEquationAtomAnchor,
  presentationEquationCaretAnchor,
  presentationEquationSelectionAnchor,
  type PresentationInlineEquationAnchor,
} from "./presentationEquationInlineAnchor";

type SlideLike = { readonly id: string; readonly blocks: readonly unknown[]; readonly [key: string]: unknown };
type Frame = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
type LiveTextSelection = { blockId: string; start: number; end: number } | null;

export interface PresentationEquationHost<Slide extends SlideLike> {
  readonly readOnly: boolean;
  readonly t: (key: string) => string;
  readonly notify: (message: string, tone: "error" | "info") => void;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly slideCanvasRef: RefObject<HTMLElement | null>;
  readonly slidesRef: MutableRefObject<Slide[]>;
  readonly activeIndexRef: MutableRefObject<number>;
  readonly selectedBlockIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly textSelectionRef: MutableRefObject<LiveTextSelection>;
  /** The live text selection as rendered state, so the Equation tab follows it. */
  readonly textSelection: LiveTextSelection;
  readonly commitSlides: (slides: Slide[]) => void;
  /** Select the box an equation went into (a new box on an empty selection). */
  readonly selectBlock: (blockId: string) => void;
  /** Put the caret back in the box after the commit renders. */
  readonly restoreCaret: (blockId: string, start: number, end: number) => void;
  readonly newId: () => string;
  readonly maxBlocksPerSlide: number;
  /** Which shapes' labels take an equation (the editor's own text rule). */
  readonly shapeTakesEquation?: (block: unknown) => boolean;
  /**
   * The table cell being edited (`blockId:row:col`) and its rich-text element:
   * Insert > Equation goes into the cell at its selection, through the
   * element's own `insertEquation` (one commit, the cell's undo).
   */
  readonly focusedCell?: () => { readonly key: string; readonly element: PresentationCellTextElement } | null;
  /** The cell element of `key` while it is mounted. */
  readonly cellElement?: (key: string) => PresentationCellTextElement | null;
  /** Changes whenever the cell's selection does, so the Equation tab follows it. */
  readonly cellSelectionVersion?: unknown;
}

/** The equation a cell's selection is exactly (`selectedEquation()` of the cell element). */
type CellEquationSpan = { start: number; end: number; latex: string; display: boolean };

/** Whether an equation over `[start, end)` of a cell's text is all of its line. */
function cellRangeFillsLine(text: string, start: number, end: number): boolean {
  return (start === 0 || text[start - 1] === "\n") && (end === text.length || text[end] === "\n");
}

/**
 * An equation among words open IN PLACE over its line (`anchor`, with the
 * linear format it opens in and the press that opened it); without an
 * anchor (the words are not drawn) it opens in the editor dialog.
 */
type InlinePlace = {
  readonly anchor: PresentationInlineEquationAnchor | null;
  readonly inputMode: EquationInputMode;
  readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
  /** The side an arrow key walked the caret in from (Right: the start). */
  readonly edge?: "start" | "end" | null;
  /**
   * The equation's place IN its line (`presentationEquationSlot`): the box's
   * words drawn with the equation run whose LaTeX is `sentinel`, where the
   * commit will put it. Preferred over `anchor`, which only knows a point.
   */
  readonly slot?: { readonly blockId: string; readonly block: PresentationTextBlock; readonly sentinel: string } | null;
  /** What the field opens on (the selected words a new equation converts). */
  readonly initialLatex?: string;
};

/** The keyboard is in some words already (the press that closed an equation put it there). */









function typingElsewhere(blockId?: string): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  // The equation field being left still holds the keyboard as it goes.
  if (active instanceof HTMLElement && active.closest("[data-presentation-equation-inline-editor], math-field")) {
    return false;
  }
  if (
    blockId &&
    active instanceof HTMLElement &&
    active.closest("[data-block-id]")?.getAttribute("data-block-id") === blockId
  ) {
    return false;
  }
  return (
    active instanceof HTMLElement &&
    active !== document.body &&
    (active.matches("textarea, input") || active.isContentEditable)
  );
}

type EquationSession =
  | ({ readonly kind: "new"; readonly key: number; readonly slideId: string; readonly target: PresentationEquationTarget } & InlinePlace)
  | ({
      readonly kind: "edit";
      readonly key: number;
      readonly slideId: string;
      readonly blockId: string;
      readonly span: PresentationEquationSpan;
    } & InlinePlace)
  /** Insert New Equation in a table cell: inserts over `range` on Done. */
  | ({ readonly kind: "cell-new"; readonly key: number; readonly cellKey: string; readonly range: { start: number; end: number } } & InlinePlace)
  /** The equation a cell's selection is, open in the editor. */
  | ({ readonly kind: "cell-edit"; readonly key: number; readonly cellKey: string; readonly span: CellEquationSpan } & InlinePlace)
  /**
   * An equation box open IN PLACE: a new one (`blockId` null, a draft not on
   * the slide until it commits) or one already on the slide. `frame` is the
   * box's slide geometry (EMU) the draft is drawn centred on.
   */
  | {
      readonly kind: "box";
      readonly key: number;
      readonly slideId: string;
      readonly blockId: string | null;
      readonly span: PresentationEquationSpan | null;
      readonly frame: Frame;
      readonly fontSizePx: number;
      readonly color: string | null;
      readonly inputMode: EquationInputMode;
      readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
    };

/**
 * An Equation-tab command on the live draft. `wasOpen` is false when the tab
 * opened the editor for it: the draft's caret is then at its end, not where
 * the person left it.
 */
export type EquationEditorCommand = (controller: VisualMathEditorController, wasOpen: boolean) => void;

/** The equation the Equation tab acts on. */
export interface PresentationActiveEquation {
  readonly blockId: string;
  readonly span: PresentationEquationSpan | null;
  /** The visual editor is open on it. */
  readonly editing: boolean;
  /** Its LaTeX, when it is an equation already on the page (Save Selection to Equation Gallery). */
  readonly latex: string | null;
}

/**
 * The box an equation lives in: a text box, or a shape whose text frame takes
 * equations (the host's `shapeTakesEquation`, the rule Insert uses) -- a
 * shape's label has a text box's model, so the same reading and rewriting
 * apply to it (PPT-B402).
 */
function textBlockOf(
  slide: SlideLike | undefined,
  blockId: string,
  shapeTakesEquation?: (block: unknown) => boolean,
): PresentationTextBlock | null {
  const block = slide?.blocks.find((item) => (item as { id?: unknown })?.id === blockId) as
    | (PresentationTextBlock & { type: string })
    | undefined;
  if (!block) return null;
  if (block.type === "text") return block;
  if (block.type === "shape" && shapeTakesEquation?.(block) === true) return block;
  return null;
}

export function usePresentationEquations<Slide extends SlideLike>(host: PresentationEquationHost<Slide>) {
  const hostRef = useRef(host);
  // Every callback below reads the window's current wiring when it runs.
  useLayoutEffect(() => {
    hostRef.current = host;
  });
  const [session, setSession] = useState<EquationSession | null>(null);
  // The open in-line field's size, which its slot in the line takes.
  const [slotSize, setSlotSize] = useState<{ width: number; height: number }>({ width: 1, height: 1 });
  const [controller, setController] = useState<VisualMathEditorController | null>(null);
  const [layoutMode, setLayoutMode] = useState<EquationLayoutMode>("professional");
  const [normalText, setNormalText] = useState(false);
  // The linear input format (Unicode / LaTeX): PowerPoint keeps it as an
  // application setting rather than per equation, so it is this window's
  // and every equation box opens in it. UnicodeMath is Office's default.
  const [inputMode, setInputModeState] = useState<EquationInputMode>("unicode");
  const inputModeRef = useRef<EquationInputMode>("unicode");
  const sessionKeyRef = useRef(0);
  const sessionRef = useRef<EquationSession | null>(null);
  const pendingEditorCommandRef = useRef<EquationEditorCommand | null>(null);
  useLayoutEffect(() => {
    sessionRef.current = session;
  });

  const liveSlide = () => {
    const { slidesRef, activeIndexRef } = hostRef.current;
    return { slides: slidesRef.current, index: activeIndexRef.current, slide: slidesRef.current[activeIndexRef.current] };
  };

  /** Whether block `blockId`'s words are drawn by the text box renderer (which lays out a slot). */
  const drawsEquationSlot = (blockId: string): boolean =>
    (liveSlide().slide?.blocks.find((item) => (item as { id?: unknown })?.id === blockId) as { type?: unknown } | undefined)
      ?.type === "text";

  /** The linear format a draft of `latex` opens in: a draft with no UnicodeMath spelling opens in LaTeX. */
  const draftInputModeFor = (latex: string): EquationInputMode =>
    inputModeRef.current === "unicode" && latex.trim() && !latexToReversibleWordLinear(latex)
      ? "latex"
      : inputModeRef.current;

  /** Where a new equation goes now, by PowerPoint's rule. */
  const currentTarget = useCallback((): { slideId: string; target: PresentationEquationTarget } | null => {
    const { slide } = liveSlide();
    if (!slide) return null;
    const { selectedBlockIdsRef, textSelectionRef } = hostRef.current;
    const target = presentationEquationTarget(
      slide,
      [...selectedBlockIdsRef.current],
      textSelectionRef.current,
      hostRef.current.shapeTakesEquation,
    );
    // An equation box holds its one equation: a new equation beside it gets
    // a box of its own.
    if (target.kind !== "new-box") {
      const block = slide.blocks.find((item) => (item as { id?: unknown })?.id === target.blockId);
      if (presentationEquationBoxSpan(block)) return { slideId: slide.id, target: { kind: "new-box" } };
    }
    return { slideId: slide.id, target };
  }, []);

  /** The equation's characters and LaTeX from the server, or null (and why, said). */
  const askServer = useCallback(async (latex: string, display: boolean) => {
    const current = hostRef.current;
    const answer = await fetchPresentationEquationText(latex, display);
    if (!answer.ok) {
      current.notify(
        current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
        "error",
      );
      return null;
    }
    return answer;
  }, []);

  /** Open an equation box in place: a new draft, or the box `blockId` of the active slide. */
  const openBox = useCallback(
    (
      options:
        | { readonly kind: "new"; readonly frame: Frame }
        | {
            readonly kind: "edit";
            readonly blockId: string;
            readonly span: PresentationEquationSpan;
            readonly pointer?: { readonly clientX: number; readonly clientY: number } | null;
          },
    ) => {
      const current = hostRef.current;
      if (current.readOnly) return;
      const { slide } = liveSlide();
      if (!slide) return;
      let frame: Frame;
      let fontSizePx = NEW_TEXT_BOX_FONT_SIZE_PX;
      let color: string | null = null;
      if (options.kind === "new") {
        frame = options.frame;
      } else {
        const block = slide.blocks.find((item) => (item as { id?: unknown })?.id === options.blockId) as
          | Record<string, unknown>
          | undefined;
        if (!block) return;
        const number = (value: unknown, fallback: number) =>
          typeof value === "number" && Number.isFinite(value) ? value : fallback;
        frame = {
          left: number(block.left, 0),
          top: number(block.top, 0),
          width: number(block.width, 1),
          height: number(block.height, 1),
        };
        // The equation is edited at the size and colour the slide draws it in.
        const atom = Array.from(
          current.slideCanvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [],
        )
          .find((element) => element.dataset.blockId === options.blockId)
          ?.querySelector<HTMLElement>(PRESENTATION_MATH_SELECTOR);
        if (atom && typeof window !== "undefined") {
          const computed = window.getComputedStyle(atom);
          const size = Number.parseFloat(computed.fontSize);
          if (Number.isFinite(size) && size > 0) fontSizePx = size;
          // A gradient-filled WordArt's colour is transparent: one that shows.
          color = officeShownTextColor(atom);
        }
      }
      const latex = options.kind === "edit" ? options.span.latex : "";
      const draftInputMode = draftInputModeFor(latex);
      sessionKeyRef.current += 1;
      setLayoutMode("professional");
      setSession({
        kind: "box",
        key: sessionKeyRef.current,
        slideId: slide.id,
        blockId: options.kind === "edit" ? options.blockId : null,
        span: options.kind === "edit" ? options.span : null,
        frame,
        fontSizePx,
        color,
        inputMode: draftInputMode,
        pointer: options.kind === "edit" ? (options.pointer ?? null) : null,
      });
    },
    [],
  );

  /**
   * A new equation box on slide `slideId` holding `latex`, sized to it and
   * centred on `around` (or kept at its top-left, `anchor: "start"`: an
   * equation that grows where it stands), in one commit; then selected, and
   * open in place for `after: "open"` (PowerPoint leaves a gallery equation
   * active).
   */
  const placeBox = useCallback(
    async (
      slideId: string,
      latex: string,
      around: Frame,
      after: "open" | "select" | "none",
      anchor: "center" | "start" = "center",
      /** Told which box the equation became, once it is on the slide. */
      onPlaced?: (blockId: string) => void,
      /** Ink to Math: the equation takes the size `around` (the writing) was written at. */
      sizeToWriting = false,
    ) => {
      const current = hostRef.current;
      const answer = await askServer(latex, true);
      if (!answer) return;
      const { slides } = liveSlide();
      const index = slides.findIndex((slide) => slide.id === slideId);
      const slide = slides[index];
      if (!slide) return;
      const measure = (fontSizePx: number) =>
        measurePresentationEquation(current.slideCanvasRef.current, answer.equation.latex, fontSizePx);
      const writtenPt = sizeToWriting
        ? officeInkEquationFontSizePt(around, measure, POWERPOINT_FONT_SIZE_POINTS)
        : null;
      const fontSizePx = writtenPt === null ? NEW_TEXT_BOX_FONT_SIZE_PX : pointsToDesignPx(writtenPt);
      const frame = equationBoxFrame(measure(fontSizePx), around, anchor);
      const placed = slideWithEquation(slide, { kind: "new-box", box: frame, fontSizePx }, answer.equation, {
        newId: current.newId,
        slideSize: slideBounds(slide),
        maxBlocks: current.maxBlocksPerSlide,
        shapeTakesEquation: current.shapeTakesEquation,
      });
      if (!placed) {
        current.notify(current.t("presentation.equation.cannotPlace"), "error");
        return;
      }
      current.commitSlides(slides.map((item, at) => (at === index ? placed.slide : item)));
      onPlaced?.(placed.blockId);
      if (after !== "none") current.selectBlock(placed.blockId);
      if (after === "open") {
        const block = placed.slide.blocks.find((item) => (item as { id?: unknown })?.id === placed.blockId);
        const span = presentationEquationBoxSpan(block);
        if (span) openBox({ kind: "edit", blockId: placed.blockId, span });
      }
      if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"), "info");
    },
    [askServer, openBox],
  );

  /**
   * Ask the server, then place the equation at `target` of slide `slideId` in
   * one commit. The new equation is left selected (`caret: "select"`), or the
   * caret goes after it (`"after"`: an equation written in place and left
   * with Enter or the arrows, the words go on after it; `"before"`: left by
   * Left at its start) unless the press that ended it put the caret in some
   * words already.
   */
  const placeEquation = useCallback(async (
    slideId: string,
    target: PresentationEquationTarget,
    latex: string,
    caret: "select" | "after" | "before" = "select",
  ) => {
    const current = hostRef.current;
    const atRequest = liveSlide().slides.find((slide) => slide.id === slideId);
    if (!atRequest) return;
    const display = presentationEquationTargetDisplay(atRequest, target, current.shapeTakesEquation);
    const answer = await fetchPresentationEquationText(latex, display);
    if (!answer.ok) {
      current.notify(
        current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
        "error",
      );
      return;
    }
    const { slides } = liveSlide();
    const index = slides.findIndex((slide) => slide.id === slideId);
    const slide = slides[index];
    if (!slide) return;
    const placed = slideWithEquation(slide, target, answer.equation, {
      newId: current.newId,
      slideSize: slideBounds(slide),
      maxBlocks: current.maxBlocksPerSlide,
      shapeTakesEquation: current.shapeTakesEquation,
    });
    if (!placed) {
      current.notify(current.t("presentation.equation.cannotPlace"), "error");
      return;
    }
    current.commitSlides(slides.map((item, at) => (at === index ? placed.slide : item)));
    if (target.kind === "new-box") current.selectBlock(placed.blockId);
    // The new equation is left selected, as PowerPoint leaves it: the Equation
    // tab follows it and Delete or a gallery pick acts on it.
    if (caret === "select") current.restoreCaret(placed.blockId, placed.start, placed.end);
    else if (caret === "before") {
      if (!typingElsewhere(placed.blockId)) current.restoreCaret(placed.blockId, placed.start, placed.start);
    } else if (!typingElsewhere(placed.blockId)) {
      current.restoreCaret(placed.blockId, placed.end, placed.end);
      // The restore yields to any later selection change, and the field
      // closing makes one (the box takes the focus back at the insertion
      // point): over the next frames a caret still standing where the
      // equation went in -- now just BEFORE it -- is put after it.
      let frames = 0;
      const settle = () => {
        frames += 1;
        const preview = Array.from(
          current.slideCanvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [],
        )
          .find((element) => element.dataset.blockId === placed.blockId)
          ?.querySelector<HTMLElement>('[data-selection-owner="rich-preview"]');
        if (preview && preview.contains(document.activeElement)) {
          const range = presentationPreviewSelection(preview, presentationPreviewPlainText(preview).length);
          if (range && range.start === placed.start && range.end === placed.start) {
            setPresentationPreviewSelection(preview, placed.end, placed.end);
          }
        }
        if (frames < 8) requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    }
    if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"), "info");
  }, []);

  /**
   * Put an equation into the cell `cellKey` over `range` (or over the
   * equation there, which it then rewrites): the server's characters first,
   * then the cell element's own insertion.
   */
  const placeCellEquation = useCallback(
    async (
      cellKey: string,
      range: { start: number; end: number },
      latex: string,
      display?: boolean,
      /** Where the caret goes after it (the arrows left it on that side); else it stays selected. */
      caret?: "before" | "after",
    ) => {
      const current = hostRef.current;
      const before = current.cellElement?.(cellKey);
      if (!before) return;
      const lineDisplay = display ?? cellRangeFillsLine(before.value, range.start, range.end);
      const answer = await fetchPresentationEquationText(latex, lineDisplay);
      if (!answer.ok) {
        current.notify(
          current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
          "error",
        );
        return;
      }
      const element = current.cellElement?.(cellKey);
      if (!element) return;
      element.setSelectionRange(range.start, range.end);
      if (!element.insertEquation(answer.equation)) {
        current.notify(current.t("presentation.equation.cannotPlace"), "error");
        return;
      }
      if (caret) {
        const at = caret === "before" ? range.start : range.start + answer.equation.text.length;
        element.setSelectionRange(at, at);
      }
      if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"), "info");
    },
    [],
  );

  /** The cell being edited and its selection, when Insert > Equation should go there. */
  const currentCell = useCallback(() => {
    const cell = hostRef.current.focusedCell?.() ?? null;
    if (!cell) return null;
    const start = Math.min(cell.element.selectionStart, cell.element.selectionEnd);
    const end = Math.max(cell.element.selectionStart, cell.element.selectionEnd);
    return { key: cell.key, range: { start, end } };
  }, []);

  /**
   * Gallery / template / symbol: straight in. While an equation is open in
   * an editor the pick goes into it at its caret, as Office inserts a gallery
   * equation into the equation being edited. With `bounds` (slide EMU; Ink
   * to Math) the equation gets its own box centred there, selected.
   */
  const insertEquation = useCallback(
    (latex: string, options?: { readonly bounds?: Frame }) => {
      if (hostRef.current.readOnly) return;
      const { slide } = liveSlide();
      if (options?.bounds) {
        if (slide) void placeBox(slide.id, latex, options.bounds, "select");
        return;
      }
      if (controller?.insertLatex && sessionRef.current) {
        controller.insertLatex(latex);
        controller.focus();
        return;
      }
      const cell = currentCell();
      if (cell) {
        void placeCellEquation(cell.key, cell.range, latex);
        return;
      }
      const at = currentTarget();
      if (!at || !slide) return;
      if (at.target.kind === "new-box") {
        void placeBox(at.slideId, latex, at.target.box ?? defaultEquationBoxFrame(slideBounds(slide)), "open");
        return;
      }
      void placeEquation(at.slideId, at.target, latex);
    },
    [controller, currentCell, currentTarget, placeBox, placeCellEquation, placeEquation],
  );

  /**
   * Insert New Equation (Alt+=): PowerPoint's "Type equation here." open in
   * place -- in its own box on an empty selection, else at the caret of the
   * text box or table cell being written in (over the words it replaces), or
   * on a new last line of a box selected by its border. Leaving it inserts
   * it; an empty one inserts nothing.
   */
  const insertNewEquation = useCallback(() => {
    if (hostRef.current.readOnly) return;
    // An equation is open in place already: it keeps the keyboard.
    if (
      sessionRef.current?.kind === "box" ||
      (sessionRef.current && "anchor" in sessionRef.current && (sessionRef.current.anchor || sessionRef.current.slot))
    ) {
      return;
    }
    const canvas = hostRef.current.slideCanvasRef.current;
    const place = (anchor: PresentationInlineEquationAnchor | null): InlinePlace => ({
      anchor,
      inputMode: draftInputModeFor(""),
      pointer: null,
    });
    const cell = currentCell();
    if (cell) {
      const element = hostRef.current.cellElement?.(cell.key) ?? null;
      sessionKeyRef.current += 1;
      setLayoutMode("professional");
      setSession({
        kind: "cell-new",
        key: sessionKeyRef.current,
        cellKey: cell.key,
        range: cell.range,
        ...place(element ? presentationEquationSelectionAnchor(canvas, element) : null),
      });
      return;
    }
    const at = currentTarget();
    if (!at) return;
    if (at.target.kind === "new-box") {
      // PowerPoint's own box, "Type equation here.", open in place.
      openBox({ kind: "new", frame: at.target.box ?? defaultEquationBoxFrame(slideBounds(liveSlide().slide)) });
      return;
    }
    const block = textBlockOf(liveSlide().slide, at.target.blockId, hostRef.current.shapeTakesEquation);
    const text = block?.text ?? "";
    const anchor =
      at.target.kind === "caret"
        ? presentationEquationCaretAnchor(canvas, at.target.blockId, text, at.target.start, at.target.end)
        : presentationEquationCaretAnchor(canvas, at.target.blockId, text, text.length, text.length, { append: true });
    sessionKeyRef.current += 1;
    // PowerPoint puts the equation INTO the words at the caret (or converts
    // the selected words into it): the box is drawn with the equation's
    // place in its line while it is written, laid out as the commit will lay
    // it out (a lone paragraph's equation is a display one).
    const sentinel = presentationEquationSlotSentinel(sessionKeyRef.current);
    const { slide: live } = liveSlide();
    const slotted = live
      ? slideWithEquation(live, at.target, { text: PRESENTATION_EQUATION_SLOT_TEXT, latex: sentinel }, {
          newId: () => "",
          slideSize: slideBounds(live),
          shapeTakesEquation: hostRef.current.shapeTakesEquation,
        })
      : null;
    // Only a text box's words are drawn by the renderer that lays out the
    // slot; a shape's label (its own words field) takes the field over the
    // caret, which a missing slot left hidden and unfocusable.
    const slotBlock =
      slotted && drawsEquationSlot(at.target.blockId)
        ? textBlockOf(slotted.slide, at.target.blockId, hostRef.current.shapeTakesEquation)
        : null;
    const selected =
      at.target.kind === "caret" && at.target.end > at.target.start ? text.slice(at.target.start, at.target.end) : "";
    const initialLatex = selected && !selected.includes("\n") && selected.length <= 200 ? selected : "";
    setLayoutMode("professional");
    setSession({
      kind: "new",
      key: sessionKeyRef.current,
      slideId: at.slideId,
      target: at.target,
      ...place(anchor),
      inputMode: draftInputModeFor(initialLatex),
      slot: slotBlock ? { blockId: at.target.blockId, block: slotBlock, sentinel } : null,
      initialLatex,
    });
  }, [currentCell, currentTarget, openBox]);

  /** The atom drawing equation `span` of block `blockId` (in the layer its words are edited in). */
  const atomOf = useCallback((blockId: string, span: PresentationEquationSpan): Element | null => {
    const current = hostRef.current;
    const wrapper = Array.from(current.slideCanvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []).find(
      (element) => element.dataset.blockId === blockId,
    );
    const block = textBlockOf(liveSlide().slide, blockId, current.shapeTakesEquation);
    if (!wrapper || !block) return null;
    const index = presentationEquationSpans(block).findIndex((item) => item.start === span.start && item.end === span.end);
    if (index < 0) return null;
    const atoms = Array.from(wrapper.querySelectorAll(PRESENTATION_MATH_SELECTOR));
    const preview = wrapper.querySelector('[data-selection-owner="rich-preview"]');
    const layer = preview && atoms.some((atom) => preview.contains(atom)) ? preview : atoms[0]?.closest("[data-selection-owner]") ?? null;
    const inLayer = atoms.filter((atom) => (layer ? layer.contains(atom) : true));
    return inLayer[index] ?? null;
  }, []);

  const editCellEquation = useCallback(
    (
      cellKey: string,
      span: CellEquationSpan,
      options?: {
        readonly atom?: Element | null;
        readonly pointer?: { clientX: number; clientY: number } | null;
        readonly edge?: "start" | "end" | null;
      },
    ) => {
      if (hostRef.current.readOnly) return;
      const canvas = hostRef.current.slideCanvasRef.current;
      sessionKeyRef.current += 1;
      setLayoutMode("professional");
      setSession({
        kind: "cell-edit",
        key: sessionKeyRef.current,
        cellKey,
        span,
        anchor: options?.atom ? presentationEquationAtomAnchor(canvas, options.atom) : null,
        inputMode: draftInputModeFor(span.latex),
        pointer: options?.pointer ?? null,
        edge: options?.pointer ? null : (options?.edge ?? null),
      });
    },
    [],
  );

  /**
   * Open an equation on the slide where it stands: an equation box's in its
   * box, one among words over its place in the line (the caret where the
   * press landed).
   */
  const editEquation = useCallback(
    (
      blockId: string,
      span: PresentationEquationSpan,
      options?: {
        readonly atom?: Element | null;
        readonly pointer?: { clientX: number; clientY: number } | null;
        readonly edge?: "start" | "end" | null;
      },
    ) => {
      if (hostRef.current.readOnly) return;
      const { slide } = liveSlide();
      if (!slide) return;
      // An equation box's equation is edited where it stands.
      if (presentationEquationBoxSpan(slide.blocks.find((item) => (item as { id?: unknown })?.id === blockId))) {
        openBox({ kind: "edit", blockId, span, pointer: options?.pointer ?? null });
        return;
      }
      const atom = options?.atom ?? atomOf(blockId, span);
      const canvas = hostRef.current.slideCanvasRef.current;
      // Over the equation as drawn, else over its place in the words.
      const anchor =
        (atom ? presentationEquationAtomAnchor(canvas, atom) : null) ??
        presentationEquationCaretAnchor(
          canvas,
          blockId,
          textBlockOf(slide, blockId, hostRef.current.shapeTakesEquation)?.text ?? "",
          span.start,
          span.end,
        );
      sessionKeyRef.current += 1;
      // The equation is written where it stands in its line: its run drawn
      // as the open field's place, the words laid out around it.
      const sentinel = presentationEquationSlotSentinel(sessionKeyRef.current);
      const block = textBlockOf(slide, blockId, hostRef.current.shapeTakesEquation);
      const slotted = block && drawsEquationSlot(blockId)
        ? textBlockWithEquationReplaced(block, span, {
            text: block.text.slice(span.start, span.end),
            latex: sentinel,
            display: span.display,
          })
        : null;
      setLayoutMode("professional");
      setSession({
        kind: "edit",
        key: sessionKeyRef.current,
        slideId: slide.id,
        blockId,
        span,
        anchor,
        inputMode: draftInputModeFor(span.latex),
        pointer: options?.pointer ?? null,
        edge: options?.pointer ? null : (options?.edge ?? null),
        slot: slotted ? { blockId, block: slotted.block, sentinel } : null,
      });
    },
    [atomOf, openBox],
  );

  const closeSession = useCallback(() => {
    pendingEditorCommandRef.current = null;
    setSession(null);
  }, []);

  /**
   * Done: insert the new equation, or replace / remove the edited one. An
   * equation written in place (`via`) leaves the caret after it -- before it
   * when Left walked out of its start, Esc leaves it selected -- and an empty
   * new one puts the caret back where it was.
   */
  const acceptSession = useCallback(
    (state: VisualMathEditorState, via?: EquationInPlaceCommitVia, direction?: "backward" | "forward") => {
      const outBefore = via === "move-out" && direction === "backward";
      const done = session;
      closeSession();
      if (!done) return;
      // Left with the arrows: until the caret is placed beside the equation
      // (a new one first goes to the server and into the words; a rewritten
      // one takes the open field's slot back a few frames on), the words'
      // caret sat at their start -- a flash at the box's left edge. It stays
      // hidden until it is where it belongs.
      let hiddenCaret: { element: HTMLElement; color: string } | null = null;
      const hideCaretIn = (blockId: string) => {
        if (via !== "move-out" || hiddenCaret) return;
        const words = Array.from(current.slideCanvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [])
          .find((element) => element.dataset.blockId === blockId)
          ?.querySelector<HTMLElement>('[data-selection-owner="rich-preview"], [data-shape-rich-editor]');
        if (!words) return;
        hiddenCaret = { element: words, color: words.style.caretColor };
        words.style.caretColor = "transparent";
        window.setTimeout(showCaret, 1500);
      };
      const showCaret = () => {
        if (!hiddenCaret) return;
        hiddenCaret.element.style.caretColor = hiddenCaret.color;
        hiddenCaret = null;
      };
      const current = hostRef.current;
      if (via && (state.inputMode === "unicode" || state.inputMode === "latex")) {
        inputModeRef.current = state.inputMode;
        setInputModeState(state.inputMode);
      }
      const latex = state.latex.trim();
      if (done.kind === "new") {
        if (latex) {
          if (done.target.kind === "caret") hideCaretIn(done.target.blockId);
          void placeEquation(
            done.slideId,
            done.target,
            latex,
            outBefore ? "before" : via && via !== "escape" ? "after" : "select",
          ).finally(() => requestAnimationFrame(() => requestAnimationFrame(showCaret)));
        } else if (via && done.target.kind === "caret" && !typingElsewhere(done.target.blockId)) {
          current.restoreCaret(done.target.blockId, done.target.start, done.target.end);
        }
        return;
      }
      if (done.kind === "cell-new") {
        if (latex) {
          void placeCellEquation(done.cellKey, done.range, latex);
        } else if (via && !typingElsewhere()) {
          // An empty one inserts nothing: the caret goes back into the cell.
          const element = current.cellElement?.(done.cellKey);
          element?.focus({ preventScroll: true });
          element?.setSelectionRange(done.range.start, done.range.end);
        }
        return;
      }
      // An equation box commits through its own editor (`acceptBox`).
      if (done.kind === "box") return;
      if (done.kind === "cell-edit") {
        // Left by the arrows: the cell's words take the caret on that side
        // at once (and again once a rewritten equation is in).
        const side = via === "move-out" ? (outBefore ? "before" : "after") : undefined;
        if (side) {
          const element = current.cellElement?.(done.cellKey);
          if (element?.isConnected) {
            element.focus({ preventScroll: true });
            const at = side === "before" ? done.span.start : done.span.end;
            element.setSelectionRange(at, at);
          }
        }
        // A cell's equation is rewritten over its own characters; an emptied
        // draft leaves it as it was (the cell's Delete removes it whole).
        if (latex && latex !== done.span.latex.trim()) {
          void placeCellEquation(done.cellKey, done.span, latex, done.span.display, side);
        }
        return;
      }
      // Left by the arrows: the words take the caret NOW, before the field's
      // teardown leaves the focus nowhere (the window then hands it to the
      // slide, which ends the words' editing and drops the restore below).
      const previewOf = () =>
        Array.from(current.slideCanvasRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [])
          .find((element) => element.dataset.blockId === done.blockId)
          ?.querySelector<HTMLElement>('[data-selection-owner="rich-preview"], [data-shape-rich-editor]') ?? null;
      if (via === "move-out") {
        const preview = previewOf();
        if (preview) {
          hideCaretIn(done.blockId);
          preview.focus({ preventScroll: true });
          // Beside the open field's slot in the drawn words (it stands for
          // the equation's characters without holding them, so an offset
          // past it would land too far on).
          const slot = done.slot
            ? preview.querySelector(`[${PRESENTATION_EQUATION_SLOT_ATTRIBUTE}]`)
            : null;
          const selection = preview.ownerDocument.defaultView?.getSelection();
          if (slot && selection) {
            const range = preview.ownerDocument.createRange();
            if (outBefore) range.setStartBefore(slot);
            else range.setStartAfter(slot);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            const at = outBefore ? done.span.start : done.span.end;
            setPresentationPreviewSelection(preview, at, at);
          }
        }
      }
      // In place, the caret goes after the equation (before it when Left
      // walked out of its start; Esc: the equation selected), unless the
      // press that closed it put it in some words.
      const caretAfter = (start: number, end: number, textLength?: number) => {
        if (!via) current.restoreCaret(done.blockId, end, end);
        else if (via === "escape") current.restoreCaret(done.blockId, start, end);
        else if (via !== "move-out") {
          if (!typingElsewhere()) current.restoreCaret(done.blockId, end, end);
        } else {
          // Shown again once the caret is placed (or the wait gives up), at
          // the latest a moment after the last restore.
          window.setTimeout(showCaret, 1000);
          // The arrows leave by no press elsewhere: the box's own words
          // taking the focus back are not "elsewhere". The words may draw
          // the rewritten equation a few frames after the commit; an offset
          // past it applied to the old drawing lands too far on, so the
          // caret waits for the new one (the caret beside the field's slot
          // stands until then).
          let frames = 0;
          const restore = () => {
            const preview = previewOf();
            // The open field's slot is swapped back for the drawn equation
            // after the close; a caret set beside the slot is left before the
            // drawn equation by that swap (Right out of an equation left at
            // the end of the words put the caret in front of it), so the
            // caret waits for the equation to be drawn again.
            const slotDrawn = Boolean(preview?.querySelector(`[${PRESENTATION_EQUATION_SLOT_ATTRIBUTE}]`));
            if (
              preview &&
              (slotDrawn ||
                (textLength !== undefined && presentationPreviewPlainText(preview).length !== textLength)) &&
              ++frames < 30
            ) {
              requestAnimationFrame(restore);
              return;
            }
            if (typingElsewhere(done.blockId)) {
              showCaret();
              return;
            }
            const at = outBefore ? start : end;
            current.restoreCaret(done.blockId, at, at);
            // The restore lands a frame later: show the caret where it lands.
            requestAnimationFrame(() => requestAnimationFrame(showCaret));
          };
          // A shape's words are reopened by the restore itself: once the
          // field has gone, or the window hands the empty focus to the slide
          // after the words took it.
          if (textLength === undefined && !drawsEquationSlot(done.blockId)) requestAnimationFrame(restore);
          else restore();
        }
      };
      if (latex === done.span.latex.trim()) {
        if (via) caretAfter(done.span.start, done.span.end);
        return;
      }
      const commitBlock = (next: PresentationTextBlock, start: number, end: number) => {
        const { slides } = liveSlide();
        const index = slides.findIndex((slide) => slide.id === done.slideId);
        const slide = slides[index];
        if (!slide) return;
        const blocks = slide.blocks.map((item) => ((item as { id?: unknown })?.id === done.blockId ? next : item));
        current.commitSlides(slides.map((item, at) => (at === index ? ({ ...slide, blocks } as Slide) : item)));
        caretAfter(start, end, next.text.length);
      };
      if (!latex) {
        // An emptied equation goes, as PowerPoint removes an empty zone.
        const block = textBlockOf(
          liveSlide().slides.find((slide) => slide.id === done.slideId),
          done.blockId,
          current.shapeTakesEquation,
        );
        if (!block) return;
        const text = block.text;
        const next = reconcilePresentationTextBlock(
          block,
          `${text.slice(0, done.span.start)}${text.slice(done.span.end)}`,
          { start: done.span.start, end: done.span.end },
        );
        commitBlock(next, done.span.start, done.span.start);
        return;
      }
      void (async () => {
        const answer = await fetchPresentationEquationText(latex, done.span.display);
        if (!answer.ok) {
          current.notify(
            current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
            "error",
          );
          return;
        }
        const block = textBlockOf(
          liveSlide().slides.find((slide) => slide.id === done.slideId),
          done.blockId,
          current.shapeTakesEquation,
        );
        const edit = block ? textBlockWithEquationReplaced(block, done.span, answer.equation) : null;
        if (!edit) {
          current.notify(current.t("presentation.equation.cannotPlace"), "error");
          return;
        }
        commitBlock(edit.block, done.span.start, edit.end);
        if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"), "info");
      })();
    },
    [closeSession, placeCellEquation, placeEquation, session],
  );

  /**
   * An equation box's equation left (Enter, Esc, a press outside, the caret
   * arrowing out): a new box is placed sized to its equation (an empty draft
   * places nothing, as PowerPoint drops an empty text box); an edited box is
   * rewritten and re-sized in one commit, or removed whole when emptied. Esc
   * leaves the box selected, as Office leaves the equation.
   */
  const acceptBox = useCallback(
    (
      done: Extract<EquationSession, { kind: "box" }>,
      state: VisualMathEditorState,
      via: EquationInPlaceCommitVia,
      direction?: "backward" | "forward",
    ) => {
      closeSession();
      const current = hostRef.current;
      if (state.inputMode === "unicode" || state.inputMode === "latex") {
        inputModeRef.current = state.inputMode;
        setInputModeState(state.inputMode);
      }
      // Walked out of the equation's edge with the arrows: PowerPoint leaves
      // the caret in the box's words beside the equation, before it from its
      // start, after it from its end. The edit ended the box's editing
      // instead, and the keyboard went to the slide.
      const outOfEdge = via === "move-out";
      const caretBeside = (blockId: string, start: number, end: number) => {
        const at = direction === "backward" ? start : end;
        // The caret goes back only into the selected box: a new box placed
        // by the edge press is selected first.
        current.selectBlock(blockId);
        current.restoreCaret(blockId, at, at);
      };
      // The keyboard goes back to the slide unless the press that ended the
      // edit put it somewhere.
      if (!outOfEdge) {
        requestAnimationFrame(() => {
          const active = document.activeElement;
          if (!active || active === document.body) current.slideCanvasRef.current?.focus({ preventScroll: true });
        });
      }
      const latex = state.latex.trim();
      if (done.blockId === null) {
        if (latex) {
          void placeBox(
            done.slideId,
            latex,
            done.frame,
            via === "escape" ? "select" : "none",
            "center",
            outOfEdge
              ? (placedId) => {
                  const placed = textBlockOf(
                    liveSlide().slides.find((slide) => slide.id === done.slideId),
                    placedId,
                  );
                  const span = placed ? presentationEquationBoxSpan(placed) : null;
                  if (span) caretBeside(placedId, span.start, span.end);
                }
              : undefined,
          );
        }
        return;
      }
      const blockId = done.blockId;
      const commitBlock = (next: PresentationTextBlock | null) => {
        const { slides } = liveSlide();
        const index = slides.findIndex((slide) => slide.id === done.slideId);
        const slide = slides[index];
        if (!slide) return;
        const blocks = next
          ? slide.blocks.map((item) => ((item as { id?: unknown })?.id === blockId ? next : item))
          : slide.blocks.filter((item) => (item as { id?: unknown })?.id !== blockId);
        current.commitSlides(slides.map((item, at) => (at === index ? ({ ...slide, blocks } as Slide) : item)));
        if (next && via === "escape") current.selectBlock(blockId);
      };
      const liveBox = () =>
        textBlockOf(
          liveSlide().slides.find((slide) => slide.id === done.slideId),
          blockId,
        );
      if (!latex) {
        const block = liveBox();
        if (!block) return;
        const placeholder = typeof block.placeholderType === "string" && block.placeholderType.trim() !== "";
        if (!placeholder && (block.kind === undefined || block.kind === "textbox")) {
          // An emptied equation box goes, as PowerPoint drops an empty text
          // box (an imported one names no kind; a placeholder stays).
          commitBlock(null);
          return;
        }
        // A placeholder keeps its frame and loses the equation.
        const span = presentationEquationBoxSpan(block);
        if (!span) return;
        commitBlock(
          reconcilePresentationTextBlock(block, `${block.text.slice(0, span.start)}${block.text.slice(span.end)}`, {
            start: span.start,
            end: span.end,
          }),
        );
        return;
      }
      if (done.span && latex === done.span.latex.trim()) {
        if (via === "escape") current.selectBlock(blockId);
        else if (outOfEdge) caretBeside(blockId, done.span.start, done.span.end);
        return;
      }
      void (async () => {
        const answer = await askServer(latex, true);
        if (!answer) return;
        const block = liveBox();
        const span = block ? presentationEquationBoxSpan(block) : null;
        const edit = block && span ? textBlockWithEquationReplaced(block, span, answer.equation) : null;
        if (!block || !edit) {
          current.notify(current.t("presentation.equation.cannotPlace"), "error");
          return;
        }
        // A box that does not wrap is sized to its text ("Resize shape to
        // fit text"), keeping its top-left so the equation stays where it
        // was drawn; any other box keeps its frame.
        const record = block as Record<string, unknown>;
        // (An imported box states its wrap beside its style: `textWrap`.)
        const resizes =
          (block.style as { textWrap?: unknown } | undefined)?.textWrap === false || record.textWrap === false;
        // Measured at the size the slide draws the equation in now: Home may
        // have changed it while the equation was open.
        const drawnSizePx =
          presentationEquationLiveLook(current.slideCanvasRef.current, blockId)?.fontSizePx ?? done.fontSizePx;
        const frame = resizes
          ? equationBoxFrame(
              measurePresentationEquation(current.slideCanvasRef.current, answer.equation.latex, drawnSizePx),
              {
                left: typeof record.left === "number" ? record.left : done.frame.left,
                top: typeof record.top === "number" ? record.top : done.frame.top,
                width: typeof record.width === "number" ? record.width : done.frame.width,
                height: typeof record.height === "number" ? record.height : done.frame.height,
              },
              "start",
            )
          : null;
        commitBlock(frame ? ({ ...edit.block, ...frame } as PresentationTextBlock) : edit.block);
        if (outOfEdge && span) caretBeside(blockId, span.start, edit.end);
        if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"), "info");
      })();
    },
    [askServer, closeSession, placeBox],
  );

  // The equation the caret or selection of the edited box is on.
  const selectedEquation = useMemo((): { blockId: string; span: PresentationEquationSpan } | null => {
    const selection = host.textSelection;
    if (!selection) return null;
    const slide = host.slidesRef.current[host.activeIndexRef.current];
    const block = textBlockOf(slide, selection.blockId, host.shapeTakesEquation);
    const span = block ? presentationEquationSpanAt(block, selection.start, selection.end) : null;
    return span ? { blockId: selection.blockId, span } : null;
    // The selection state changes with every caret move and every commit.
  }, [host.textSelection, host.slidesRef, host.activeIndexRef, host.shapeTakesEquation]);

  // The equation a table cell's selection is (a click on one selects it whole).
  const selectedCellEquation = useMemo((): { cellKey: string; span: CellEquationSpan } | null => {
    const cell = host.focusedCell?.() ?? null;
    const found = cell?.element.selectedEquation?.() ?? null;
    return cell && found
      ? { cellKey: cell.key, span: { start: found.start, end: found.end, latex: found.latex, display: found.display } }
      : null;
    // Read again whenever the cell's selection moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.cellSelectionVersion]);

  const activeEquation = useMemo((): PresentationActiveEquation | null => {
    if (session?.kind === "box") {
      return { blockId: session.blockId ?? "", span: session.span, editing: true, latex: session.span?.latex ?? null };
    }
    if (session?.kind === "edit") {
      return { blockId: session.blockId, span: session.span, editing: true, latex: session.span.latex };
    }
    if (session?.kind === "new") {
      return {
        blockId: session.target.kind === "new-box" ? "" : session.target.blockId,
        span: null,
        editing: true,
        latex: null,
      };
    }
    if (session?.kind === "cell-new" || session?.kind === "cell-edit") {
      return { blockId: session.cellKey.split(":")[0] ?? "", span: null, editing: true, latex: session.kind === "cell-edit" ? session.span.latex : null };
    }
    if (selectedCellEquation) {
      return { blockId: selectedCellEquation.cellKey.split(":")[0] ?? "", span: null, editing: false, latex: selectedCellEquation.span.latex };
    }
    return selectedEquation ? { ...selectedEquation, editing: false, latex: selectedEquation.span.latex } : null;
  }, [selectedCellEquation, selectedEquation, session]);

  /**
   * An Equation-tab command on the open draft. With no draft open it opens the
   * editor on the selected equation and runs once the draft is live.
   */
  const runInEditor = useCallback(
    (command: EquationEditorCommand) => {
      if (controller) {
        command(controller, true);
        return;
      }
      if (selectedCellEquation) {
        pendingEditorCommandRef.current = command;
        editCellEquation(selectedCellEquation.cellKey, selectedCellEquation.span);
        return;
      }
      if (!selectedEquation) return;
      pendingEditorCommandRef.current = command;
      editEquation(selectedEquation.blockId, selectedEquation.span);
    },
    [controller, editCellEquation, editEquation, selectedCellEquation, selectedEquation],
  );

  // Home's Bold / Italic / Underline / Font Color while an equation is being
  // edited: the selected part of the equation takes it (PowerPoint states it
  // on those math runs), not the whole equation's run.
  const formatInEditor = useCallback(
    (format: EquationSelectionFormat): boolean => controller?.formatSelection?.(format) === true,
    [controller],
  );

  // What Home's Bold / Italic / Underline show while the equation is being
  // edited: the selected part's (Office Math), read again whenever the
  // draft's selection or formatting changes.
  const [editorSelectionVersion, setEditorSelectionVersion] = useState(0);
  useEffect(
    // A selection change, or the layout switched from the equation's own
    // Options menu: the Equation tab's Professional / Linear follow it.
    () => controller?.subscribeSelection?.(() => {
      setEditorSelectionVersion((version) => version + 1);
      setLayoutMode(controller.getState().layoutMode);
    }),
    [controller],
  );
  const editorFormatState = useCallback(
    (kind: "bold" | "italic" | "underline"): boolean | null => controller?.selectionFormatState?.(kind) ?? null,
    // The version is what makes a new selection read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, editorSelectionVersion],
  );

  const handleController = useCallback((next: VisualMathEditorController | null) => {
    setController(next);
    setNormalText(false);
    if (next) {
      const state = next.getState();
      setLayoutMode(state.layoutMode);
      if (state.inputMode === "unicode" || state.inputMode === "latex") setInputModeState(state.inputMode);
      const pending = pendingEditorCommandRef.current;
      pendingEditorCommandRef.current = null;
      pending?.(next, false);
    }
  }, []);

  /** The Equation tab's Normal Text: ordinary text at the draft's caret, or math again. */
  const toggleNormalText = useCallback(() => {
    runInEditor((live) => {
      if (live.toggleNormalText?.()) setNormalText(live.normalTextActive?.() === true);
    });
  }, [runInEditor]);

  /**
   * The Equation tab's Unicode / LaTeX: the open draft's linear input format,
   * and the window's from then on. False when the draft has no spelling in
   * it (the tab says so); undefined while the editor is still opening.
   */
  const setEditorInputMode = useCallback(
    (mode: EquationInputMode): boolean | undefined => {
      let applied: boolean | undefined;
      runInEditor((live) => {
        applied = live.setInputMode(mode);
        if (applied && (mode === "unicode" || mode === "latex")) {
          inputModeRef.current = mode;
          setInputModeState(mode);
        }
      });
      return applied;
    },
    [runInEditor],
  );

  /** The keyboard back into the open draft (a ribbon menu closed after a pick). */
  const focusDraft = useCallback(() => controller?.focus(), [controller]);

  const setEditorLayoutMode = useCallback(
    (mode: EquationLayoutMode) => {
      runInEditor((live) => {
        live.setLayoutMode(mode);
        setLayoutMode(mode);
        // Linear has no caret mode; built up again, the draft types math.
        setNormalText(live.normalTextActive?.() === true);
      });
    },
    [runInEditor],
  );

  // A press on an equation in a text box opens it in the editor, whether the
  // box is being edited (its rich preview draws the atoms) or not (the slide
  // draws them): the latter was ignored, so a click on an equation the user
  // had just inserted did nothing (PPT-A052 acceptance 公式-4). Listened for on
  // the document (the canvas remounts with the view) and claimed only inside
  // this editor's slide canvas.
  //
  // An equation box is all equation: a press anywhere on its text opens it,
  // including on the box's textarea, which lies over the slide's own drawing
  // of an unselected box (that press used to put a caret among the
  // equation's raw characters, where Backspace broke it into letters). The
  // press opens on its release: the click a press on the atoms should send
  // did not always arrive, so the release decides and the click that may
  // follow is swallowed. The frame (its move border, the grips) still moves
  // and sizes the box.
  useEffect(() => {
    const pressedEquation = (target: Element | null, point?: { readonly x: number; readonly y: number }) => {
      const canvas = hostRef.current.slideCanvasRef.current;
      if (!target || !canvas?.contains(target) || hostRef.current.readOnly) return null;
      const blockElement = target.closest<HTMLElement>("[data-block-id]");
      const blockId = blockElement?.dataset.blockId;
      if (!blockElement || !blockId) return null;
      const block = textBlockOf(liveSlide().slide, blockId, hostRef.current.shapeTakesEquation);
      if (!block) return null;
      const boxSpan = presentationEquationBoxSpan(block);
      // The equation under the press: its atom, or -- where a box's text
      // layer lies over its drawing -- the atom at that point. A press
      // BESIDE an equation is a press in the words (PowerPoint puts the
      // caret there, and words can be typed after the equation), equation
      // box or not.
      const atom =
        target.closest<HTMLElement>(PRESENTATION_MATH_SELECTOR) ??
        (point && typeof document.elementsFromPoint === "function"
          ? (document
              .elementsFromPoint(point.x, point.y)
              .find((element) => element.matches(PRESENTATION_MATH_SELECTOR) && blockElement.contains(element)) as
              | HTMLElement
              | undefined) ?? null
          : null);
      if (!atom) return null;
      // The atoms of one drawing of the box (its rich preview, or the slide's
      // own) are its equation runs in text order, one each; a box may hold
      // both drawings, so count only the layer the press landed in.
      const layer = atom.closest("[data-selection-owner]");
      const atoms = Array.from(blockElement.querySelectorAll(PRESENTATION_MATH_SELECTOR)).filter(
        (candidate) => candidate.closest("[data-selection-owner]") === layer,
      );
      const span = presentationEquationSpans(block)[atoms.indexOf(atom)];
      return span ? { blockId, span, box: boxSpan !== null, atom } : null;
    };
    type Found = NonNullable<ReturnType<typeof pressedEquation>>;
    const open = (found: Found, event: MouseEvent) => {
      if (found.box) {
        openBox({
          kind: "edit",
          blockId: found.blockId,
          span: found.span,
          pointer: { clientX: event.clientX, clientY: event.clientY },
        });
        return;
      }
      editEquation(found.blockId, found.span, {
        atom: found.atom,
        pointer: { clientX: event.clientX, clientY: event.clientY },
      });
    };
    const modified = (event: MouseEvent) => event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    let press: { pointerId: number; x: number; y: number; target: Element } | null = null;
    let lastDown: { x: number; y: number } | null = null;
    let swallowClickUntil = 0;
    const notePress = (event: PointerEvent) => {
      lastDown = { x: event.clientX, y: event.clientY };
      press =
        event.button === 0 && event.target instanceof Element
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: event.target }
          : null;
    };
    const openFromRelease = (event: PointerEvent) => {
      const pressed = press;
      press = null;
      if (!pressed || pressed.pointerId !== event.pointerId || event.button !== 0 || modified(event)) return;
      // A press that dragged (a move, a text selection) was not a click into it.
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return;
      const found = pressedEquation(pressed.target, { x: pressed.x, y: pressed.y });
      if (!found) return;
      swallowClickUntil = Date.now() + 600;
      event.preventDefault();
      open(found, event);
    };
    // The click after a release that opened the equation goes nowhere; a
    // click with no such release (a keyboard or scripted click) opens it.
    const openFromClick = (event: MouseEvent) => {
      if (Date.now() <= swallowClickUntil) {
        swallowClickUntil = 0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (modified(event)) return;
      const found = pressedEquation(event.target instanceof Element ? event.target : null, { x: event.clientX, y: event.clientY });
      if (!found) return;
      if (lastDown && Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) > 4) return;
      event.preventDefault();
      event.stopPropagation();
      open(found, event);
    };
    // A cell selects its equation whole on a click (its own handler); a
    // double-click opens it in the editor.
    const openCellEquation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const atom = target?.closest<HTMLElement>(PRESENTATION_MATH_SELECTOR);
      const cell = hostRef.current.focusedCell?.() ?? null;
      if (!atom || !cell || !cell.element.contains(atom) || hostRef.current.readOnly) return;
      const found = cell.element.selectedEquation?.();
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      editCellEquation(
        cell.key,
        { start: found.start, end: found.end, latex: found.latex, display: found.display },
        { atom, pointer: { clientX: event.clientX, clientY: event.clientY } },
      );
    };
    document.addEventListener("pointerdown", notePress, true);
    document.addEventListener("pointerup", openFromRelease, true);
    document.addEventListener("click", openFromClick, true);
    document.addEventListener("dblclick", openCellEquation, true);
    return () => {
      document.removeEventListener("pointerdown", notePress, true);
      document.removeEventListener("pointerup", openFromRelease, true);
      document.removeEventListener("click", openFromClick, true);
      document.removeEventListener("dblclick", openCellEquation, true);
    };
  }, [editCellEquation, editEquation, openBox]);

  // The caret walks INTO an equation beside it, as PowerPoint's does: Right
  // just before one opens it with the caret at its start, Left just after
  // one at its end. The open field hands the caret back out past either edge
  // (`acceptSession`), so the arrows go through the equation, not over it.
  // Shift+arrow still takes the equation whole into the selection.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (hostRef.current.readOnly) return;
      const canvas = hostRef.current.slideCanvasRef.current;
      const target = event.target instanceof Element ? event.target : null;
      // A text box's rich preview, or a shape's drawn words being typed.
      const preview = target?.closest<HTMLElement>('[data-selection-owner="rich-preview"], [data-shape-rich-editor]');
      if (!canvas || !preview || !canvas.contains(preview)) return;
      // A key repeating while the field opens: the caret is still beside the
      // equation, and must not open it a second time over the first.
      if (sessionRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const blockId = preview.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      const block = blockId ? textBlockOf(liveSlide().slide, blockId, hostRef.current.shapeTakesEquation) : null;
      if (!blockId || !block) return;
      const caret = presentationPreviewSelection(preview, presentationPreviewPlainText(preview).length);
      if (!caret || caret.start !== caret.end) return;
      const forward = event.key === "ArrowRight";
      // The preview's atoms are the block's equation runs in text order.
      const index = presentationPreviewAtomSpans(preview).findIndex(
        (span) => (forward ? span.start : span.end) === caret.start,
      );
      const span = index >= 0 ? presentationEquationSpans(block)[index] : undefined;
      if (!span) return;
      event.preventDefault();
      event.stopPropagation();
      editEquation(blockId, span, {
        atom: preview.querySelectorAll(PRESENTATION_MATH_SELECTOR)[index] ?? null,
        edge: forward ? "start" : "end",
      });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editEquation]);

  // The same walk in a table cell's words: the cell raises the step
  // (`OFFICE_FIELD_EQUATION_ENTER_EVENT`), the equation opens from that edge.
  useEffect(() => {
    const enter = (event: Event) => {
      const detail = (event as CustomEvent<OfficeFieldEquationEnterDetail>).detail;
      const cell = hostRef.current.focusedCell?.() ?? null;
      if (!cell || !detail || event.target !== cell.element || hostRef.current.readOnly) return;
      event.preventDefault();
      if (sessionRef.current) return;
      cell.element.setSelectionRange(detail.start, detail.end);
      editCellEquation(
        cell.key,
        { start: detail.start, end: detail.end, latex: detail.latex, display: detail.display },
        { atom: detail.atom, edge: detail.edge },
      );
    };
    document.addEventListener(OFFICE_FIELD_EQUATION_ENTER_EVENT, enter);
    return () => document.removeEventListener(OFFICE_FIELD_EQUATION_ENTER_EVENT, enter);
  }, [editCellEquation]);

  // Alt+= (PowerPoint's Insert New Equation) anywhere in this editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.code !== "Equal" && event.key !== "=") return;
      const root = hostRef.current.rootRef.current;
      if (!root || !nativeOfficeOwnsFocus(root, document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      insertNewEquation();
    };
    // Heard before the words being typed: a shape's words field stops the
    // keys it takes, and Alt+= typed "≠" into the shape instead.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [insertNewEquation]);

  const editorLatex = session?.kind === "edit" || session?.kind === "cell-edit" ? session.span.latex : "";
  // The editor dialog only for an equation whose words are not drawn (no
  // place to open it in).
  const dialog = session && session.kind !== "box" && !session.anchor && !session.slot ? (
    <EquationVisualEditorDialog
      key={session.key}
      latex={editorLatex}
      modal={false}
      testId="presentation-equation-editor-dialog"
      onAccept={(state) => acceptSession(state)}
      onCancel={closeSession}
      onController={handleController}
    />
  ) : null;

  // The equation box open in place, drawn on the slide's design surface (the
  // window puts it inside the slide canvas); an equation among words, over
  // its line.
  const inPlaceEditor =
    session && session.kind !== "box" && session.slot ? (
      <PresentationEquationSlotEditor
        key={session.key}
        sentinel={session.slot.sentinel}
        latex={session.kind === "edit" ? session.span.latex : (session.initialLatex ?? "")}
        inputMode={session.inputMode}
        placeholder={host.t("presentation.equation.placeholder")}
        pointer={session.pointer}
        onSize={(width, height) => setSlotSize({ width, height })}
        edge={session.edge ?? null}
        onCommit={(state, via, direction) => acceptSession(state, via, direction)}
        onCancel={closeSession}
        onController={handleController}
      />
    ) : session && session.kind !== "box" && session.anchor ? (
      <PresentationInlineEquationEditor
        key={session.key}
        anchor={session.anchor}
        latex={editorLatex}
        inputMode={session.inputMode}
        placeholder={host.t("presentation.equation.placeholder")}
        pointer={session.pointer}
        edge={session.edge ?? null}
        onCommit={(state, via, direction) => acceptSession(state, via, direction)}
        onCancel={closeSession}
        onController={handleController}
      />
    ) : session?.kind === "box" ? (
      <PresentationEquationBoxEditor
        key={session.key}
        frame={session.frame}
        fontSizePx={session.fontSizePx}
        color={session.color}
        latex={session.span?.latex ?? ""}
        inputMode={session.inputMode}
        hiddenBlockId={session.blockId}
        placeholder={host.t("presentation.equation.placeholder")}
        pointer={session.pointer}
        onCommit={(state, via, direction) => acceptBox(session, state, via, direction)}
        onCancel={closeSession}
        onController={handleController}
      />
    ) : null;

  /**
   * The earlier spelling of `insertEquation(latex, { bounds })` (Ink to Math
   * on selected strokes), kept for callers that still use it.
   */
  const insertEquationInBox = useCallback(
    (latex: string, box: { left: number; top: number; width: number; height: number }) =>
      insertEquation(latex, { bounds: box }),
    [insertEquation],
  );

  /**
   * Ink to Math's equation: a box where the writing was (or, `anchor:
   * "start"`, growing where the equation it replaces stood), placed without
   * being selected. Selecting it brought the Shape Format tab forward and
   * took the pen away with the Draw tab: after every reading the writer had
   * to go back to Draw to write the next symbol. `onPlaced` says which box
   * it became.
   */
  const placeInkEquation = useCallback(
    (
      latex: string,
      box: { left: number; top: number; width: number; height: number },
      anchor: "center" | "start",
      onPlaced: (blockId: string) => void,
    ) => {
      if (hostRef.current.readOnly) return;
      const { slide } = liveSlide();
      // A new reading stands at its writing's size; one that grows an
      // equation already placed keeps that equation's box.
      if (slide) void placeBox(slide.id, latex, box, "none", anchor, onPlaced, anchor === "center");
    },
    [placeBox],
  );

  return {
    insertEquation,
    insertEquationInBox,
    placeInkEquation,
    insertNewEquation,
    editEquation,
    activeEquation,
    selectedEquationLatex: activeEquation?.latex ?? null,
    editorOpen: session !== null,
    layoutMode,
    setEditorLayoutMode,
    inputMode,
    setEditorInputMode,
    focusDraft,
    inPlaceEditor,
    /** The text box drawn with the open equation's place in its line, and the slot's context. */
    equationSlot:
      session && session.kind !== "box" && session.slot
        ? {
            blockId: session.slot.blockId,
            block: session.slot.block,
            value: { sentinel: session.slot.sentinel, width: slotSize.width, height: slotSize.height },
          }
        : null,
    normalText,
    toggleNormalText,
    runInEditor,
    formatInEditor,
    editorFormatState,
    dialog,
  };
}
