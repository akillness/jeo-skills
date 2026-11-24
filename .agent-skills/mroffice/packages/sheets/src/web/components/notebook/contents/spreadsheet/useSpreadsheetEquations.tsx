"use client";




































/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  VisualMathEditorController,
  EquationSelectionFormat,
  VisualMathEditorState,
} from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import type { EquationInputMode, EquationLayoutMode } from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import type { EquationInPlaceCommitVia } from "@mrnote/core/web/components/office-equation/EquationInPlaceEditor.tsx";
import type { EquationDraftCommand } from "@/components/office-equation/officeEquationDraftAdapter";
import {
  OFFICE_FIELD_EQUATION_ENTER_EVENT,
  type OfficeFieldEquationEnterDetail,
  type PresentationCellTextElement,
} from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import {
  PresentationEquationSlotEditor,
  PresentationInlineEquationEditor,
} from "@mrnote/slides/web/components/notebook/contents/presentation/PresentationEquationBoxEditor.tsx";
import {
  isPresentationEquationSlotSentinel,
  PRESENTATION_EQUATION_SLOT_HEIGHT_VAR,
  PRESENTATION_EQUATION_SLOT_TEXT,
  PRESENTATION_EQUATION_SLOT_WIDTH_VAR,
  presentationEquationSlotSentinel,
} from "@mrnote/core/web/components/notebook/contents/presentation/presentationEquationSlot.ts";
import {
  presentationEquationAtomAnchor,
  presentationEquationSelectionAnchor,
  type PresentationInlineEquationAnchor,
} from "@mrnote/slides/web/components/notebook/contents/presentation/presentationEquationInlineAnchor.ts";
import {
  cellTextRunsInRange,
  insertCellEquation,
  replaceCellTextRangeWithRuns,
  type CellEquation,
} from "@mrnote/core/web/lib/presentation-cell-rich-text.ts";
import { fetchPresentationEquationText } from "@mrnote/slides/web/lib/presentation/equation-text-client.ts";
import type { TextRun } from "@mrnote/core/web/lib/presentation-runs.ts";
import { normalizeShapeStyle, spreadsheetEquationFits, type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { latexToReversibleWordLinear } from "@mrnote/core/web/lib/unicode-math/index.ts";
import { spreadsheetEquationBoxLatex, spreadsheetEquationBoxShape } from "../../../../lib/spreadsheet/equation-box";

import { SpreadsheetEquationBoxEditor } from "./SpreadsheetEquationBoxEditor";
import { fitSpreadsheetEquationBox } from "./SpreadsheetEquationDrawing";
import type { SpreadsheetObject } from "./spreadsheetSheetModel";
import type { DrawingGrid } from "../../../../lib/spreadsheet/object-buttons";

export type SpreadsheetEquationPointer = { readonly clientX: number; readonly clientY: number };

/** The shape text field open now: whose words, and the field itself. */
export interface SpreadsheetEquationTextField {
  readonly objectId: string;
  readonly element: PresentationCellTextElement;
}

export interface SpreadsheetEquationHost {
  readonly readOnly: boolean;
  readonly t: (key: string) => string;
  /** The active sheet's objects as rendered (the Equation tab follows the selection). */
  readonly objects: readonly SpreadsheetObject[];
  /** The active sheet's objects now (a commit reads the latest). */
  readonly liveObjects: () => readonly SpreadsheetObject[];
  readonly selectedObjectId: string | null;
  /** Whether objects may be edited now; says why not itself when they may not. */
  readonly canEditObjects: () => boolean;
  /**
   * A new equation text box in the middle of the visible sheet, selected
   * (empty, or holding `equation` from the start); null when none can be added.
   */
  readonly insertBox: (equation?: { readonly latex: string; readonly text: string }) => string | null;
  /** The active sheet with these objects, one history step. */
  readonly writeObjects: (objects: readonly SpreadsheetObject[]) => void;
  readonly select: (objectId: string | null) => void;
  readonly notify: (message: string) => void;
  /** The undo history's depth now (a mark before a new box goes in). */
  readonly historyDepth: () => number;
  /**
   * The steps recorded since `depth` as one (`fold`: before the first to
   * after the last), or none at all (`drop`: they cancelled out). Nothing
   * happens unless exactly the box's own steps were recorded since.
   */
  readonly settleHistorySince: (depth: number, steps: number, how: "fold" | "drop") => void;
  /** The keyboard onto the box (Esc keeps it selected). */
  readonly focusObject: (objectId: string) => void;
  /** The box's drawn size (layout px) now, so editing it only ever grows it. */
  readonly boxSize?: (objectId: string) => { width: number; height: number } | null;
  /** The grid a Move-and-size box's far marker is placed on as it grows. */
  readonly drawingGrid?: () => DrawingGrid;
  /** The words and runs of the open shape text field, as typed. */
  readonly fieldWords?: () => { readonly text: string; readonly runs: readonly TextRun[] | undefined } | null;
  /** The shape text field open now, if any (an equation goes in at its caret). */
  readonly textField?: () => SpreadsheetEquationTextField | null;
  /**
   * Open shape `objectId`'s words for typing with the caret at `caret` --
   * an equation box's too, its equation one atom among them, not reopened
   * as the equation; false when they cannot be (and why, said).
   */
  readonly openShapeText?: (objectId: string, caret: number) => boolean;
  /** Shape `objectId`'s words become `text` with `runs` (one history step). */
  readonly writeShapeText?: (objectId: string, text: string, runs: readonly TextRun[] | null) => void;
  /** Whether `object` holds words (a line, ink or a picture does not). */
  readonly shapeTakesText?: (object: SpreadsheetObject) => boolean;
  /** Whether a chart is the selection (Excel puts no equation in one). */
  readonly chartSelected?: () => boolean;
  /** Object `objectId`'s element on screen (the in-line editor is drawn in it). */
  readonly objectElement?: (objectId: string) => HTMLElement | null;
}

/** The equation the Equation tab acts on. */
export interface SpreadsheetActiveEquation {
  readonly objectId: string;
  /** The in-place editor is open on it. */
  readonly editing: boolean;
  /** Its LaTeX, when it is an equation already on the sheet (Save Selection to Equation Gallery). */
  readonly latex: string | null;
}

/** An equation box open in place (`shape.equation`, the box all equation). */
interface BoxSession {
  readonly kind: "box";
  readonly key: number;
  readonly objectId: string;
  readonly latex: string;
  /** A box just inserted: Cancel, or an empty commit, takes it out again. */
  readonly fresh: boolean;
  /** The undo depth before a fresh box went in. */
  readonly historyMark: number;
  readonly pointer: SpreadsheetEquationPointer | null;
  readonly inputMode: EquationInputMode;
}

/**
 * An equation among a shape's words open in place over its line: a new one
 * going in over `range` of the words, or the equation `edit` that `range`
 * is.
 */
interface InlineSession {
  readonly kind: "inline";
  readonly key: number;
  readonly objectId: string;
  readonly range: { readonly start: number; readonly end: number };
  readonly edit: { readonly latex: string; readonly display: boolean } | null;
  readonly anchor: PresentationInlineEquationAnchor | null;
  readonly pointer: SpreadsheetEquationPointer | null;
  readonly inputMode: EquationInputMode;
  /** The edge an arrow key walked the caret in at (Right: the start). */
  readonly edge?: "start" | "end" | null;
  /**
   * The equation's place in its line while it is written (the deck's slot):
   * one atom in the open words, as wide as the open field, so the words
   * after it make room as it grows. `range` is then the slot's character;
   * `original` the words it stands in for (put back when nothing is put in).
   */
  readonly slot?: { readonly sentinel: string; readonly original: readonly TextRun[] } | null;
}

type EquationSession = BoxSession | InlineSession;

/** An equation on its way into a shape's words (its characters asked for). */
interface PendingWords {
  readonly range: { readonly start: number; readonly end: number };
  /** The words' commit took it in (`settleWords`): it is not put in again. */
  claimed: boolean;
  readonly equation: Promise<{ equation: CellEquation; native: boolean } | null>;
}

/** An equation on its own line is a display equation (`m:oMathPara`); among words, inline (`m:oMath`). */
function rangeFillsLine(text: string, start: number, end: number): boolean {
  return (start === 0 || text[start - 1] === "\n") && (end === text.length || text[end] === "\n");
}

function equationLatexOf(object: SpreadsheetObject | undefined): string | null {
  if (!object || object.type !== "shape") return null;
  return spreadsheetEquationBoxLatex(normalizeShapeStyle(object.shape));
}

/** A shape's words and their runs (one plain run when it has none). */
function wordsOf(shape: SpreadsheetShapeStyle): { text: string; runs: TextRun[] } {
  const text = shape.text ?? "";
  const runs = shape.textRuns?.length ? [...shape.textRuns] : text ? [{ text }] : [];
  return { text, runs };
}

/** Whether a shape's words start with an equation (an equation box's always do). */
function wordsStartWithEquation(shape: SpreadsheetShapeStyle): boolean {
  return spreadsheetEquationBoxLatex(shape) !== null || Boolean(shape.textRuns?.[0]?.math);
}

export function useSpreadsheetEquations(host: SpreadsheetEquationHost) {
  const hostRef = useRef(host);
  // Every callback below reads the window's current wiring when it runs.
  useLayoutEffect(() => {
    hostRef.current = host;
  });
  const [session, setSession] = useState<EquationSession | null>(null);
  const sessionRef = useRef<EquationSession | null>(null);
  useLayoutEffect(() => {
    sessionRef.current = session;
  });
  const [controller, setController] = useState<VisualMathEditorController | null>(null);
  const [layoutMode, setLayoutMode] = useState<EquationLayoutMode>("professional");
  const [normalText, setNormalText] = useState(false);
  // The linear input format (Unicode / LaTeX): Office keeps it as an
  // application setting rather than per equation, so it is this window's
  // and every equation box opens in it. UnicodeMath is Office's default.
  const [inputMode, setInputModeState] = useState<EquationInputMode>("unicode");
  const inputModeRef = useRef<EquationInputMode>("unicode");
  const sessionKeyRef = useRef(0);
  // The open draft's own size (layout px), keyed by its session, for the box
  // to follow while it is typed.
  const [draftSize, setDraftSize] = useState<{ key: number; width: number; height: number } | null>(null);
  const pendingEditorCommandRef = useRef<EquationDraftCommand | null>(null);
  // An equation waiting for the words it goes into to open for typing (a
  // selected shape's: Excel puts it at their start).
  // Equations whose characters are being asked for, by the shape whose
  // words they go into.
  const pendingWordsRef = useRef(new Map<string, PendingWords>());
  const pendingStartRef = useRef<{ readonly objectId: string; readonly latex: string | null; readonly at: number } | null>(null);

  /** The linear format a draft of `latex` opens in: one with no UnicodeMath spelling opens in LaTeX. */
  const draftInputModeFor = (latex: string): EquationInputMode =>
    inputModeRef.current === "unicode" && latex.trim() && !latexToReversibleWordLinear(latex)
      ? "latex"
      : inputModeRef.current;

  const closeSession = useCallback(() => {
    setSession(null);
    setController(null);
    setNormalText(false);
    setDraftSize(null);
  }, []);

  const openSession = useCallback(
    (
      objectId: string,
      latex: string,
      fresh: boolean,
      pointer: SpreadsheetEquationPointer | null,
      historyMark = 0,
    ) => {
      sessionKeyRef.current += 1;
      setLayoutMode("professional");
      setSession({
        kind: "box",
        key: sessionKeyRef.current,
        objectId,
        latex,
        fresh,
        historyMark,
        pointer,
        inputMode: inputModeRef.current,
      });
    },
    [],
  );

  /** An equation among shape `objectId`'s words open in place. */
  const openInline = useCallback(
    (
      objectId: string,
      range: { start: number; end: number },
      edit: InlineSession["edit"],
      anchor: PresentationInlineEquationAnchor | null,
      pointer: SpreadsheetEquationPointer | null = null,
      edge: "start" | "end" | null = null,
    ) => {
      sessionKeyRef.current += 1;
      // The deck's slot: the equation's place in the open words, which the
      // in-line field is drawn over (a field without the slot's API keeps
      // the field over its caret instead).
      let slot: InlineSession["slot"] = null;
      let slotRange = range;
      const field = hostRef.current.textField?.() ?? null;
      const words = field && field.objectId === objectId ? hostRef.current.fieldWords?.() ?? null : null;
      if (field && field.objectId === objectId && words && typeof field.element.replaceRange === "function") {
        const sentinel = presentationEquationSlotSentinel(sessionKeyRef.current);
        const display = edit ? edit.display : rangeFillsLine(words.text, range.start, range.end);
        const runs = words.runs?.length ? [...words.runs] : words.text ? [{ text: words.text }] : [];
        const original = range.end > range.start ? cellTextRunsInRange(runs, range) : [];
        if (
          field.element.replaceRange(
            range,
            [{ text: PRESENTATION_EQUATION_SLOT_TEXT, math: { latex: sentinel, ...(display ? { display: true } : {}) } }],
            { start: range.start, end: range.start },
          )
        ) {
          slot = { sentinel, original };
          slotRange = { start: range.start, end: range.start + PRESENTATION_EQUATION_SLOT_TEXT.length };
        }
      }
      setLayoutMode("professional");
      setSession({
        kind: "inline",
        key: sessionKeyRef.current,
        objectId,
        range: slotRange,
        edit,
        anchor,
        pointer,
        edge,
        slot,
        inputMode: draftInputModeFor(edit?.latex ?? ""),
      });
    },
    [],
  );

  const removeBox = useCallback((objectId: string) => {
    const current = hostRef.current;
    current.writeObjects(current.liveObjects().filter((object) => object.id !== objectId));
  }, []);

  /**
   * An equation as its box holds it: its LaTeX, and the UnicodeMath linear
   * form a reader without the equation sees. Null (and a notice) when it does
   * not fit the box.
   */
  const boxEquation = useCallback((latex: string): { latex: string; text: string } | null => {
    const current = hostRef.current;
    const linear = latexToReversibleWordLinear(latex)?.linear ?? latex;
    if (!spreadsheetEquationFits(latex, linear)) {
      current.notify(current.t("spreadsheet.uiCopy.equationTooLongForTextBox"));
      return null;
    }
    return { latex, text: linear };
  }, []);

  /**
   * The equation into its box, the box sized to it: exactly for a box just
   * inserted, grown (never shrunk) for one that was already there. The box
   * holds it as the deck's equation box does -- one display equation run
   * with the characters the server's Office Math draws (a page's older
   * `shape.equation` becomes that run here, on its edit). False when it does
   * not fit the box or its characters could not be had.
   */
  const writeEquation = useCallback(async (objectId: string, latex: string, fresh = false): Promise<boolean> => {
    const current = hostRef.current;
    if (!boxEquation(latex)) return false;
    const answer = await fetchPresentationEquationText(latex, true);
    if (!answer.ok) {
      current.notify(
        current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
      );
      return false;
    }
    if (!spreadsheetEquationFits(answer.equation.latex, answer.equation.text)) {
      current.notify(current.t("spreadsheet.uiCopy.equationTooLongForTextBox"));
      return false;
    }
    current.writeObjects(
      current.liveObjects().map((object) =>
        object.id === objectId && object.type === "shape"
          ? fitSpreadsheetEquationBox(
              {
                ...object,
                // The shape as stored (a new box's size is kept before it has words).
                shape: spreadsheetEquationBoxShape(object.shape as SpreadsheetShapeStyle, answer.equation),
              } as SpreadsheetObject,
              fresh ? "fit" : "grow",
              fresh ? null : (current.boxSize?.(objectId) ?? null),
              current.drawingGrid?.(),
            )
          : object,
      ),
    );
    if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"));
    return true;
  }, [boxEquation]);

  /** The box grown (never shrunk) to the equation it holds now, when it is too small. */
  const refitBox = useCallback((objectId: string) => {
    const current = hostRef.current;
    let changed = false;
    const next = current.liveObjects().map((object) => {
      if (object.id !== objectId) return object;
      const fitted = fitSpreadsheetEquationBox(object, "grow", current.boxSize?.(objectId) ?? null, current.drawingGrid?.());
      if (fitted !== object) changed = true;
      return fitted;
    });
    if (changed) current.writeObjects(next);
  }, []);

  /**
   * Where Insert > Equation puts a new equation now, by Excel's rule: the
   * caret of the words being typed, the start of a selected shape's words,
   * nowhere (a chart; a box whose words start with an equation), or a new box.
   */
  const currentTarget = useCallback(():
    | { readonly kind: "field"; readonly field: SpreadsheetEquationTextField; readonly range: { start: number; end: number } }
    | { readonly kind: "start"; readonly objectId: string }
    | { readonly kind: "none" }
    | { readonly kind: "new-box" } => {
    const current = hostRef.current;
    const field = current.textField?.() ?? null;
    if (field && field.element.isConnected) {
      const start = Math.min(field.element.selectionStart, field.element.selectionEnd);
      const end = Math.max(field.element.selectionStart, field.element.selectionEnd);
      return { kind: "field", field, range: { start, end } };
    }
    if (current.chartSelected?.()) return { kind: "none" };
    const selected = current.selectedObjectId
      ? current.liveObjects().find((object) => object.id === current.selectedObjectId)
      : undefined;
    if (selected?.type === "shape" && current.shapeTakesText?.(selected)) {
      return wordsStartWithEquation(normalizeShapeStyle(selected.shape))
        ? { kind: "none" }
        : { kind: "start", objectId: selected.id };
    }
    return { kind: "new-box" };
  }, []);

  /**
   * Put an equation into shape `objectId`'s words over `range`: into the open
   * field when its words are being typed (the caret after it, or the
   * equation left selected), else into the shape's saved words. The
   * characters it draws come from the server first.
   */
  const placeInWords = useCallback(
    async (
      objectId: string,
      range: { start: number; end: number },
      latex: string,
      options: { readonly display?: boolean; readonly caret: "after" | "before" | "select" },
    ) => {
      const current = hostRef.current;
      const liveShape = () => {
        const object = current.liveObjects().find((item) => item.id === objectId);
        return object?.type === "shape" ? normalizeShapeStyle(object.shape) : null;
      };
      const openField = () => {
        const field = hostRef.current.textField?.() ?? null;
        return field && field.objectId === objectId && field.element.isConnected ? field.element : null;
      };
      const before = openField()?.value ?? (liveShape() ? wordsOf(liveShape()!).text : "");
      const display = options.display ?? rangeFillsLine(before, range.start, range.end);
      // While the characters are asked for, the words may be left (a press
      // elsewhere): their commit then takes the equation in (`settleWords`).
      const pending: PendingWords = {
        range,
        claimed: false,
        equation: fetchPresentationEquationText(latex, display).then((answer) => {
          if (answer.ok) return answer;
          current.notify(
            current.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
          );
          return null;
        }),
      };
      pendingWordsRef.current.set(objectId, pending);
      const answer = await pending.equation;
      if (pendingWordsRef.current.get(objectId) === pending) pendingWordsRef.current.delete(objectId);
      if (!answer || pending.claimed) {
        if (answer && !answer.native) current.notify(current.t("presentation.equation.linearOnly"));
        return;
      }
      const field = openField();
      if (field) {
        // Words typed after leaving the equation, while its characters were
        // asked for, went in after its place (the caret was parked there):
        // they stay after it.
        const typed =
          field.selectionStart === field.selectionEnd && field.selectionStart >= range.end
            ? field.selectionStart - range.end
            : 0;
        // Where the caret was moved to meanwhile (Left out of the equation,
        // then on through the words): it stays there.
        const parked = field.selectionStart === field.selectionEnd ? field.selectionStart : null;
        field.focus({ preventScroll: true });
        field.setSelectionRange(range.start, range.end);
        if (!field.insertEquation(answer.equation)) {
          current.notify(current.t("presentation.equation.cannotPlace"));
          return;
        }
        if (options.caret === "before") {
          // Left out of its start: the caret stays before it, or where the
          // keys took it on through the words meanwhile.
          const grown = answer.equation.text.length - (range.end - range.start);
          const caret =
            parked === null || parked === range.start
              ? range.start
              : parked < range.start
                ? parked
                : parked >= range.end
                  ? parked + grown
                  : range.start;
          field.setSelectionRange(caret, caret);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (field.isConnected && field.selectionStart === range.start && field.selectionEnd !== range.start) {
                field.setSelectionRange(caret, caret);
              }
            }),
          );
        } else if (options.caret === "after") {
          // After the field has drawn the equation (it selects what it put
          // in when it renders): the caret goes after it, so the words go on.
          const end = range.start + answer.equation.text.length;
          const caret = end + typed;
          field.setSelectionRange(caret, caret);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (field.isConnected && field.selectionStart === range.start && field.selectionEnd === end) {
                field.setSelectionRange(caret, caret);
              }
            }),
          );
        }
        if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"));
        return;
      }
      // The words were left (a press elsewhere ended them): the equation goes
      // into the words as they were saved.
      const shape = liveShape();
      if (!shape || !current.writeShapeText) return;
      const words = wordsOf(shape);
      const next =
        range.end <= words.text.length ? insertCellEquation(words.runs, range, answer.equation) : null;
      if (!next) {
        current.notify(current.t("presentation.equation.cannotPlace"));
        return;
      }
      current.writeShapeText(objectId, next.map((run) => run.text).join(""), next);
      if (!answer.native) current.notify(current.t("presentation.equation.linearOnly"));
    },
    [],
  );

  /**
   * The words of shape `objectId` as they are committed, with the equation
   * still being placed among them put in (the words were left while its
   * characters were asked for); null when none is pending.
   */
  const settleWords = useCallback(
    (
      objectId: string,
      typed: { readonly text: string; readonly runs: readonly TextRun[] | undefined },
    ): Promise<{ text: string; runs: TextRun[] | undefined }> | null => {
      const pending = pendingWordsRef.current.get(objectId);
      if (!pending) {
        // The words left while an equation was still being written among
        // them: its slot goes, and the words it stood in for come back (the
        // equation goes into the saved words when it is left).
        const open = sessionRef.current;
        const runs = typed.runs ?? [];
        let offset = 0;
        for (const run of runs) {
          if (run.math && isPresentationEquationSlotSentinel(run.math.latex)) {
            const original = open?.kind === "inline" && open.slot?.sentinel === run.math.latex ? open.slot.original : [];
            const next = replaceCellTextRangeWithRuns(runs, { start: offset, end: offset + run.text.length }, original) ?? runs;
            return Promise.resolve({ text: next.map((item) => item.text).join(""), runs: [...next] });
          }
          offset += run.text.length;
        }
        return null;
      }
      pending.claimed = true;
      pendingWordsRef.current.delete(objectId);
      return pending.equation.then((answer) => {
        const runs = typed.runs?.length ? [...typed.runs] : typed.text ? [{ text: typed.text }] : [];
        const next =
          answer && pending.range.end <= typed.text.length
            ? insertCellEquation(runs, pending.range, answer.equation)
            : null;
        return next
          ? { text: next.map((run) => run.text).join(""), runs: next }
          : { text: typed.text, runs: typed.runs ? [...typed.runs] : undefined };
      });
    },
    [],
  );

  /** An equation among the words of the open field, open in place at its caret. */
  const openInlineAtField = useCallback(
    (field: SpreadsheetEquationTextField, range: { start: number; end: number }) => {
      const canvas = hostRef.current.objectElement?.(field.objectId) ?? null;
      // An equation selected whole in the words opens that equation, over it
      // (the selection covers it).
      const selected = field.element.selectedEquation?.() ?? null;
      if (selected) {
        openInline(
          field.objectId,
          { start: selected.start, end: selected.end },
          { latex: selected.latex, display: selected.display },
          presentationEquationSelectionAnchor(canvas, field.element),
        );
        return;
      }
      openInline(field.objectId, range, null, presentationEquationSelectionAnchor(canvas, field.element));
    },
    [openInline],
  );

  // A selected shape's words opened for an equation at their start: once the
  // field is live, the equation goes in (a gallery pick) or opens there.
  useEffect(() => {
    const pending = pendingStartRef.current;
    if (!pending) return;
    // Words that did not open soon after are not waiting for it any more.
    if (Date.now() - pending.at > 3_000) {
      pendingStartRef.current = null;
      return;
    }
    const field = host.textField?.() ?? null;
    if (!field || field.objectId !== pending.objectId || !field.element.isConnected) return;
    pendingStartRef.current = null;
    // After the field has put its caret in (its own opening), on the next frame.
    requestAnimationFrame(() => {
      if (!field.element.isConnected) return;
      if (pending.latex !== null) {
        void placeInWords(pending.objectId, { start: 0, end: 0 }, pending.latex, { caret: "select" });
        return;
      }
      field.element.setSelectionRange(0, 0);
      openInlineAtField(field, { start: 0, end: 0 });
    });
  });

  /** Open a selected shape's words at their start for an equation (`latex`: put it in at once). */
  const startInSelectedWords = useCallback((objectId: string, latex: string | null) => {
    const current = hostRef.current;
    if (!current.openShapeText) return;
    pendingStartRef.current = { objectId, latex, at: Date.now() };
    if (!current.openShapeText(objectId, 0)) pendingStartRef.current = null;
  }, []);

  /**
   * Insert New Equation (the Equation face and the gallery's Insert New
   * Equation): Office's "Type equation here." open in place where Excel puts
   * a new equation (`currentTarget`).
   */
  const insertNewEquation = useCallback(() => {
    const current = hostRef.current;
    if (current.readOnly || !current.canEditObjects()) return;
    // An equation open in place keeps the keyboard.
    if (sessionRef.current) return;
    const target = currentTarget();
    if (target.kind === "none") return;
    if (target.kind === "field") {
      openInlineAtField(target.field, target.range);
      return;
    }
    if (target.kind === "start") {
      startInSelectedWords(target.objectId, null);
      return;
    }
    const historyMark = current.historyDepth();
    const objectId = current.insertBox();
    if (!objectId) return;
    openSession(objectId, "", true, null, historyMark);
  }, [currentTarget, openInlineAtField, openSession, startInSelectedWords]);

  /**
   * A gallery equation (or a template or a symbol from the Insert menu): into
   * the open draft at its caret, else where Excel puts a new equation, at once.
   */
  const insertEquation = useCallback(
    (latex: string) => {
      const trimmed = latex.trim();
      if (!trimmed) return;
      if (controller) {
        controller.insertLatex?.(trimmed);
        controller.focus();
        return;
      }
      const current = hostRef.current;
      if (current.readOnly || !current.canEditObjects()) return;
      const target = currentTarget();
      if (target.kind === "none") return;
      if (target.kind === "field") {
        // Office leaves the equation it put in selected, so the Equation tab acts on it.
        void placeInWords(target.field.objectId, target.range, trimmed, { caret: "select" });
        return;
      }
      if (target.kind === "start") {
        startInSelectedWords(target.objectId, trimmed);
        return;
      }
      // The box goes in holding its equation (the characters its Office
      // Math draws first): one step, one Undo.
      if (!boxEquation(trimmed)) return;
      void fetchPresentationEquationText(trimmed, true).then((answer) => {
        const live = hostRef.current;
        if (!answer.ok) {
          live.notify(
            live.t(answer.reason === "unreadable" ? "presentation.equation.unreadable" : "presentation.equation.unavailable"),
          );
          return;
        }
        live.insertBox({ latex: answer.equation.latex, text: answer.equation.text });
      });
    },
    [boxEquation, controller, currentTarget, placeInWords, startInSelectedWords],
  );

  /** An equation box's equation, open in place (the caret where the press landed). */
  const editEquation = useCallback(
    (objectId: string, pointer: SpreadsheetEquationPointer | null = null) => {
      const current = hostRef.current;
      if (current.readOnly) return;
      const latex = equationLatexOf(current.liveObjects().find((object) => object.id === objectId));
      if (latex === null) return;
      openSession(objectId, latex, false, pointer);
    },
    [openSession],
  );

  /**
   * The equation the open field's selection is, open in place over it (a
   * double-click on an equation among the words; the Equation tab on it).
   */
  const editFieldEquation = useCallback(
    (
      pointer: SpreadsheetEquationPointer | null = null,
      atom: Element | null = null,
      edge: "start" | "end" | null = null,
    ): boolean => {
      const current = hostRef.current;
      if (current.readOnly) return false;
      const field = current.textField?.() ?? null;
      const selected = field?.element.selectedEquation?.() ?? null;
      if (!field || !selected) return false;
      const canvas = current.objectElement?.(field.objectId) ?? null;
      openInline(
        field.objectId,
        { start: selected.start, end: selected.end },
        { latex: selected.latex, display: selected.display },
        (atom ? presentationEquationAtomAnchor(canvas, atom) : null) ??
          presentationEquationSelectionAnchor(canvas, field.element),
        pointer,
        edge,
      );
      return true;
    },
    [openInline],
  );

  const acceptBox = useCallback(
    (
      done: BoxSession,
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
      const latex = state.latex.trim();
      // An emptied equation box goes, as Office drops an empty text box; a
      // box just inserted and left empty goes and leaves no Undo step.
      if (!latex) {
        removeBox(done.objectId);
        if (done.fresh) current.settleHistorySince(done.historyMark, 2, "drop");
        return;
      }
      // Walked out of the equation's edge with the arrows: Office leaves the
      // caret in the box's words beside the equation -- before it from its
      // start, after it from its end -- so words go on around it in the same
      // box, as a slide's equation box does (`usePresentationEquations`).
      const outOfEdge = via === "move-out";
      const caretBeside = () => {
        const object = current.liveObjects().find((item) => item.id === done.objectId);
        if (object?.type !== "shape" || !current.openShapeText) {
          current.focusObject(done.objectId);
          return;
        }
        const words = wordsOf(normalizeShapeStyle(object.shape));
        current.openShapeText(done.objectId, direction === "backward" ? 0 : words.text.length);
      };
      const settle = (written: boolean) => {
        if (!written && done.fresh) {
          removeBox(done.objectId);
          current.settleHistorySince(done.historyMark, 2, "drop");
          return;
        }
        // A new box and its equation are one Undo step, as Office records them.
        if (done.fresh) current.settleHistorySince(done.historyMark, 2, "fold");
        if (outOfEdge) requestAnimationFrame(caretBeside);
      };
      if (latex !== done.latex.trim()) {
        void writeEquation(done.objectId, latex, done.fresh).then(settle);
      } else {
        // An equation kept as it was can still need a larger box: its size
        // was changed from Home while it was open.
        refitBox(done.objectId);
        settle(true);
      }
      if (outOfEdge) return;
      // Esc keeps the edit and the box selected, as Office does; otherwise the
      // keyboard goes back onto the box unless the press that ended the edit
      // put it somewhere.
      if (via === "escape") {
        current.focusObject(done.objectId);
        return;
      }
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) current.focusObject(done.objectId);
      });
    },
    [closeSession, refitBox, removeBox, writeEquation],
  );

  /**
   * An equation among words left: a new one goes into the words at its place
   * (an empty one puts nothing in), an edited one is rewritten -- or, emptied
   * in saved words, taken out. The caret goes after it in the words still
   * open (Esc: the equation selected).
   */
  const acceptInline = useCallback(
    (
      done: InlineSession,
      state: VisualMathEditorState,
      via: EquationInPlaceCommitVia,
      direction?: "backward" | "forward",
    ) => {
      closeSession();
      // Left out of its start: the words go on before it (Office).
      const outBefore = via === "move-out" && direction === "backward";
      const current = hostRef.current;
      if (state.inputMode === "unicode" || state.inputMode === "latex") {
        inputModeRef.current = state.inputMode;
        setInputModeState(state.inputMode);
      }
      const field = current.textField?.() ?? null;
      const open = field && field.objectId === done.objectId && field.element.isConnected ? field.element : null;
      const backToWords = (start: number, end: number) => {
        if (!open) return;
        open.focus({ preventScroll: true });
        open.setSelectionRange(start, end);
      };
      const latex = state.latex.trim();
      // The slot put back as the words it stood in for (nothing typed, an
      // unchanged equation): the range those words take then.
      const unslot = (): { start: number; end: number } => {
        const length = (done.slot?.original ?? []).reduce((sum, run) => sum + run.text.length, 0);
        if (done.slot && open) open.replaceRange(done.range, done.slot.original, { start: done.range.start, end: done.range.start + length });
        return { start: done.range.start, end: done.range.start + length };
      };
      if (done.slot && !open) {
        // The words were left first: their commit put back what the slot
        // stood in for, and the equation goes into the saved words there.
        const saved = unslot();
        if (latex && latex !== (done.edit?.latex.trim() ?? "")) {
          void placeInWords(done.objectId, saved, latex, {
            ...(done.edit ? { display: done.edit.display } : {}),
            caret: "after",
          });
        }
        return;
      }
      if (done.slot && (!latex || (done.edit && latex === done.edit.latex.trim()))) {
        const back = unslot();
        if (!latex && !done.edit) backToWords(back.start, back.start);
        else if (via === "escape" || !latex) backToWords(back.start, back.end);
        else if (outBefore) backToWords(back.start, back.start);
        else backToWords(back.end, back.end);
        return;
      }
      if (!latex) {
        if (!done.edit) {
          backToWords(done.range.start, done.range.end);
          return;
        }
        if (open) {
          // Still among the words: the emptied equation is left selected,
          // and Delete takes it out whole.
          backToWords(done.range.start, done.range.end);
          return;
        }
        const object = current.liveObjects().find((item) => item.id === done.objectId);
        if (object?.type !== "shape" || !current.writeShapeText) return;
        const words = wordsOf(normalizeShapeStyle(object.shape));
        const next = replaceCellTextRangeWithRuns(words.runs, done.range, []);
        if (next) current.writeShapeText(done.objectId, next.map((run) => run.text).join(""), next);
        return;
      }
      if (done.edit && latex === done.edit.latex.trim()) {
        if (via === "escape") backToWords(done.range.start, done.range.end);
        else if (outBefore) backToWords(done.range.start, done.range.start);
        else backToWords(done.range.end, done.range.end);
        return;
      }
      // The keyboard goes back into the words at once, after the equation's
      // place, while its characters are asked for: what is typed meanwhile
      // follows the equation, as it does in Excel.
      if (via !== "escape") {
        if (outBefore) backToWords(done.range.start, done.range.start);
        else backToWords(done.range.end, done.range.end);
      }
      void placeInWords(done.objectId, done.range, latex, {
        ...(done.edit ? { display: done.edit.display } : {}),
        caret: via === "escape" ? "select" : outBefore ? "before" : "after",
      });
    },
    [closeSession, placeInWords],
  );

  const cancelSession = useCallback(
    (done: EquationSession) => {
      closeSession();
      if (done.kind === "inline") {
        const field = hostRef.current.textField?.() ?? null;
        if (field && field.objectId === done.objectId && field.element.isConnected) {
          field.element.focus({ preventScroll: true });
          if (done.slot) {
            const length = done.slot.original.reduce((sum, run) => sum + run.text.length, 0);
            field.element.replaceRange(done.range, done.slot.original, {
              start: done.range.start,
              end: done.range.start + length,
            });
          } else {
            field.element.setSelectionRange(done.range.start, done.range.end);
          }
        }
        return;
      }
      if (!done.fresh) return;
      removeBox(done.objectId);
      hostRef.current.settleHistorySince(done.historyMark, 2, "drop");
    },
    [closeSession, removeBox],
  );

  // The equation selected among the words being typed (a click on one
  // selects it whole): the Equation tab acts on it, as Excel shows the tab
  // with the caret in a math zone. Read on each selection change, kept only
  // when it changes.
  const [fieldEquation, setFieldEquation] = useState<{ objectId: string; latex: string } | null>(null);
  // Whether an equation is held, so the common case (none before, none now)
  // queues no update at all: every grid cell an input mounts in fires a
  // selectionchange, thousands over a scroll.
  const fieldEquationHeldRef = useRef(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const read = () => {
      const field = hostRef.current.textField?.() ?? null;
      const selected = field?.element.selectedEquation?.() ?? null;
      const next = field && selected ? { objectId: field.objectId, latex: selected.latex } : null;
      if (!next && !fieldEquationHeldRef.current) return;
      fieldEquationHeldRef.current = next !== null;
      setFieldEquation((previous) =>
        previous?.objectId === next?.objectId && previous?.latex === next?.latex ? previous : next,
      );
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  // The caret walks INTO an equation among the words being typed (Office):
  // Right just before one opens it at its start, Left just after one at its
  // end; the field raises the step, the open field hands the caret back out
  // past either edge (`acceptInline`).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const enter = (event: Event) => {
      const detail = (event as CustomEvent<OfficeFieldEquationEnterDetail>).detail;
      const field = hostRef.current.textField?.() ?? null;
      if (!field || !detail || event.target !== field.element || hostRef.current.readOnly) return;
      if (sessionRef.current) {
        event.preventDefault();
        return;
      }
      field.element.setSelectionRange(detail.start, detail.end);
      if (editFieldEquation(null, detail.atom, detail.edge)) event.preventDefault();
    };
    document.addEventListener(OFFICE_FIELD_EQUATION_ENTER_EVENT, enter);
    return () => document.removeEventListener(OFFICE_FIELD_EQUATION_ENTER_EVENT, enter);
  }, [editFieldEquation]);

  // The equation box the selection is on.
  const selectedEquation = useMemo((): { objectId: string; latex: string } | null => {
    if (!host.selectedObjectId) return null;
    const latex = equationLatexOf(host.objects.find((object) => object.id === host.selectedObjectId));
    return latex === null ? null : { objectId: host.selectedObjectId, latex };
  }, [host.objects, host.selectedObjectId]);

  const activeEquation = useMemo((): SpreadsheetActiveEquation | null => {
    if (session?.kind === "box") {
      return { objectId: session.objectId, editing: true, latex: session.fresh ? null : session.latex };
    }
    if (session?.kind === "inline") {
      return { objectId: session.objectId, editing: true, latex: session.edit?.latex ?? null };
    }
    // (Never the host's field during render: the window declares it after
    // this hook, so it is read only on selection changes.)
    if (fieldEquation) return { ...fieldEquation, editing: false };
    return selectedEquation ? { ...selectedEquation, editing: false } : null;
  }, [fieldEquation, selectedEquation, session]);

  /**
   * An Equation-tab command on the open draft. With no draft open it opens the
   * selected equation (an equation box's, or the one selected among the words
   * being typed) and runs once the draft is live.
   */
  const runInEditor = useCallback(
    (command: EquationDraftCommand) => {
      if (controller) {
        command(controller, true);
        return;
      }
      const field = hostRef.current.textField?.() ?? null;
      if (field?.element.selectedEquation?.()) {
        pendingEditorCommandRef.current = command;
        editFieldEquation();
        return;
      }
      if (!selectedEquation) return;
      pendingEditorCommandRef.current = command;
      editEquation(selectedEquation.objectId);
    },
    [controller, editEquation, editFieldEquation, selectedEquation],
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

  // Home's Bold / Italic / Underline / Font Color while an equation is open:
  // the selected part of it takes the formatting, as Excel states it on
  // those math runs; false when no equation is being edited.
  const formatInEditor = useCallback(
    (format: EquationSelectionFormat): boolean => controller?.formatSelection?.(format) === true,
    [controller],
  );

  // What Home's Bold / Italic / Underline show while an equation is open:
  // the selected part's (Office Math), read again whenever the draft's
  // selection or formatting changes; null when none is open.
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

  /**
   * The open equation's in-place editor, drawn inside object `object`'s
   * element: an equation box's over the box, an equation among words over
   * its line.
   */
  const editorFor = useCallback(
    (object: SpreadsheetObject) => {
      if (!session || session.objectId !== object.id || object.type !== "shape") return null;
      if (session.kind === "inline" && session.slot) {
        const sentinel = session.slot.sentinel;
        return (
          <PresentationEquationSlotEditor
            key={session.key}
            // The words stay open while their equation is written: presses in
            // it are not presses outside them.
            chrome
            sentinel={sentinel}
            latex={session.edit?.latex ?? ""}
            inputMode={session.inputMode}
            placeholder={hostRef.current.t("presentation.equation.placeholder")}
            pointer={session.pointer}
            onSize={(width, height) => {
              const field = hostRef.current.textField?.()?.element;
              field?.style.setProperty(PRESENTATION_EQUATION_SLOT_WIDTH_VAR, `${width}px`);
              field?.style.setProperty(PRESENTATION_EQUATION_SLOT_HEIGHT_VAR, `${height}px`);
            }}
            onCommit={(state, via) => acceptInline(session, state, via)}
            onCancel={() => cancelSession(session)}
            onController={handleController}
          />
        );
      }
      if (session.kind === "inline") {
        return (
          <PresentationInlineEquationEditor
            key={session.key}
            // The words stay open while their equation is written: presses in
            // it are not presses outside them.
            chrome
            anchor={
              session.anchor ?? {
                left: 0,
                top: 0,
                height: 18,
                minWidth: 0,
                fontSizePx: normalizeShapeStyle(object.shape).textSize ?? 15,
                color: null,
                backdrop: "rgb(255, 255, 255)",
              }
            }
            latex={session.edit?.latex ?? ""}
            inputMode={session.inputMode}
            placeholder={hostRef.current.t("presentation.equation.placeholder")}
            pointer={session.pointer}
            edge={session.edge ?? null}
            onCommit={(state, via, direction) => acceptInline(session, state, via, direction)}
            onCancel={() => cancelSession(session)}
            onController={handleController}
          />
        );
      }
      return (
        <SpreadsheetEquationBoxEditor
          key={session.key}
          shape={normalizeShapeStyle(object.shape)}
          latex={session.latex}
          inputMode={session.inputMode}
          placeholder={hostRef.current.t("presentation.equation.placeholder")}
          pointer={session.pointer}
          onCommit={(state, via, direction) => acceptBox(session, state, via, direction)}
          onCancel={() => cancelSession(session)}
          onController={handleController}
          onDraftSize={(size) => setDraftSize({ key: session.key, ...size })}
        />
      );
    },
    [acceptBox, acceptInline, cancelSession, handleController, session],
  );

  /** The open draft's size (layout px), and whether its box was just inserted. */
  const draftContent = useMemo(
    () =>
      session?.kind === "box" && draftSize?.key === session.key
        ? { objectId: session.objectId, fresh: session.fresh, width: draftSize.width, height: draftSize.height }
        : null,
    [draftSize, session],
  );

  return {
    draftContent,
    insertEquation,
    insertNewEquation,
    editEquation,
    editFieldEquation,
    settleWords,
    activeEquation,
    selectedEquationLatex: activeEquation?.latex ?? null,
    editorOpen: session !== null,
    /** The equation box open in place (its own drawing of the equation is hidden). */
    editingObjectId: session?.kind === "box" ? session.objectId : null,
    /** The object whose equation is open, box or among words (the Equation tab comes forward). */
    equationObjectId: session?.objectId ?? null,
    layoutMode,
    setEditorLayoutMode,
    inputMode,
    setEditorInputMode,
    focusDraft,
    normalText,
    toggleNormalText,
    runInEditor,
    formatInEditor,
    editorFormatState,
    editorFor,
  };
}

export type SpreadsheetEquations = ReturnType<typeof useSpreadsheetEquations>;
