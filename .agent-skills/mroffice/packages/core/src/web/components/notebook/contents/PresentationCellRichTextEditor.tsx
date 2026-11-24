"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { textSpliceIsGuess } from "../../../lib/collab/json-crdt";
import { mapCaretThroughTextChange } from "../../../lib/presentation-collab-text";
import { PX_PER_PT } from "../../../lib/office-units";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import type { RunStyle, TextRun } from "../../../lib/presentation-runs";
import type { OfficeTextPaint } from "../../../lib/office-text-paint";
import { officeCaretFontScale, setOfficeCaretFontScale } from "../../../lib/office-painted-caret";
import { caretWordRange } from "../../../lib/presentation-text-buttons";
import {
  CELL_RUNS_CLIPBOARD_TYPE,
  cellCharacterRuns,
  cellEquationInRange,
  inlineEquationsBesideWords,
  insertCellEquation,
  type CellEquation,
  cellCharacterStyleAt,
  cellRunsFromClipboardHtml,
  cellRunSymbolFontFamily,
  cellRunSymbolPieces,
  cellTextRunCss,
  presentationCellTextRunCss,
  cellTextRunsInRange,
  formatCellTextRange,
  mapCellTextRange,
  parseCellRunsClipboard,
  patchCellCharacterStyle,
  replaceCellTextRange,
  replaceCellTextRangeWithRuns,
  validCellTextRange,
  type CellTextRange,
} from "../../../lib/presentation-cell-rich-text";
import {
  presentationTextRunsForCell,
  readPresentationTextRunsFlavour,
} from "../../../lib/presentation-text-clipboard";
import { CELL_SOFT_BREAK } from "../../../lib/presentation-cell-soft-break";
import { presentationDoubleClickWord, presentationParagraphRange } from "../../../lib/presentation/text-selection";
import {
  isPresentationMathAtom,
  presentationAtomAwareDomPoint,
  presentationAtomAwareOffset,
  presentationMathAtomOf,
  presentationMathAtomText,
  OFFICE_TEXT_MARKER_ATTRIBUTE,
  PRESENTATION_TRAILING_LINE_BOX_ATTRIBUTE,
} from "../../../lib/presentation/math-atom";
import { createPresentationMathAtomElement } from "./presentation/PresentationMathRun";
import { equationFormatFromCss } from "../../../lib/office-equation-format";
import { powerPointLineFitStaleAfter, requestPowerPointLineFit } from "../../../lib/presentation/powerpoint-line-fit-dom";

/**
 * Raised (cancelable, bubbling) on the words when Left or Right would step
 * over an equation beside a bare caret: Office's caret walks INTO the math
 * zone instead (Right before it enters at its start, Left after it at its
 * end). The host that edits equations in these words opens it from that
 * edge and cancels the event; an unclaimed event leaves the browser's step.
 */
export const OFFICE_FIELD_EQUATION_ENTER_EVENT = "office-field-equation-enter";

export interface OfficeFieldEquationEnterDetail {
  readonly start: number;
  readonly end: number;
  readonly latex: string;
  readonly display: boolean;
  /** The edge of the equation the caret comes in at. */
  readonly edge: "start" | "end";
  /** The equation's drawing among the words. */
  readonly atom: Element | null;
}

export type PresentationCellTextElement = HTMLDivElement & {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  setSelectionRange(start: number, end: number): void;
  /**
   * A character format on the selection (a caret inside a word: the word).
   * A function works the patch out from each run's style as drawn (its own
   * over the field's), so Grow / Shrink Font steps each run from its own
   * size, as PowerPoint and Word do over words of mixed sizes.
   */
  formatCharacters(
    patch: Partial<RunStyle> | ((drawn: RunStyle) => Partial<RunStyle>),
  ): boolean;
  /**
   * WordArt on the selected characters (a caret: the word it is in; between
   * words, nothing): each run's own paint edited by `transform` (null: none),
   * as PowerPoint's and Word's WordArt Styles, Text Fill, Text Outline and
   * Text Effects format the selected text. `alongside` (a gallery style's
   * bold) goes on the same characters in the same edit. False when nothing
   * changed.
   */
  formatCharacterPaint(
    transform: (paint: OfficeTextPaint | null, style: RunStyle | undefined) => OfficeTextPaint | null,
    alongside?: Partial<RunStyle>,
  ): boolean;
  characterState(key: keyof RunStyle): { value: unknown; mixed: boolean };
  /**
   * Insert > Equation in a cell (PPT-A052): `equation` replaces the
   * selection -- or rewrites the equation the selection is exactly (Edit
   * Equation) -- as one atomic run. `equation.text` is what the server's
   * Office Math draws for the LaTeX (`POST /api/v1/presentation/equation-text`).
   * False when read-only or refused.
   */
  insertEquation(equation: CellEquation): boolean;
  /**
   * `range` of the words replaced by `runs` as they are (an equation run
   * kept whole), the caret after them unless `caret` says. False when
   * read-only or refused. A host's own edit of the words (a sheet shape's
   * equation slot put back).
   */
  replaceRange(range: { start: number; end: number }, runs: readonly TextRun[], caret?: { start: number; end: number }): boolean;
  /**
   * Where the room carried this member's caret (a collaborator's delivery,
   * or this member's own key written past words the field had not drawn
   * yet), in the words `words` the room now holds. Taken when the field
   * shows those words -- now, or when they are drawn -- in place of the
   * caret moved by comparing the old words with the new: compared, this
   * member's own letter arriving with them read as a collaborator's at the
   * caret, and the next key went in front of it (two-person cell typing,
   * "qagixs" drawn "qagix ... s"). A press, a key other than a letter, or
   * an input drops it.
   */
  carryCaret(words: string, start: number, end: number): void;
  /** The equation the selection is exactly (a click on one selects it), else null. */
  selectedEquation(): {
    start: number;
    end: number;
    text: string;
    latex: string;
    display: boolean;
  } | null;
};

/**
 * How one paragraph of the words is drawn when the host lays them out as
 * paragraphs (a Word shape's `w:txbxContent`): the block's own CSS (its
 * alignment, line height and spacing) and the type an unformatted run takes
 * in it (its size and face), as the host draws the paragraph at rest.
 */
export interface PresentationCellParagraphStyle {
  readonly block: CSSProperties;
  readonly font?: { readonly fontSize?: string; readonly fontFamily?: string };
  /**
   * The paragraph's bullet or number, drawn before its words as it is at rest
   * (a worksheet shape's list): not typed, not counted, never holding the
   * caret (`OFFICE_TEXT_MARKER_ATTRIBUTE`). Lengths are CSS strings.
   */
  readonly marker?: { readonly text: string; readonly css?: CSSProperties };
}

type Props = Omit<
  HTMLAttributes<PresentationCellTextElement>,
  "onChange" | "onInput"
> & {
  value: string;
  runs?: unknown;
  readOnly?: boolean;
  inheritedStyle?: RunStyle;
  /**
   * The words are drawn as paragraphs, one block per line break of `value`
   * (the last style serves any paragraph past the list), so they are typed in
   * the size, alignment and spacing each paragraph is drawn in. Absent: one
   * flow of runs, as before.
   */
  paragraphStyles?: readonly PresentationCellParagraphStyle[];
  /**
   * End each paragraph's lines where PowerPoint ends them (a slide table's
   * cell): `lib/presentation/powerpoint-line-fit-dom`. Off for the worksheet
   * and Docs hosts, whose words are laid out by their own rules.
   */
  powerPointLineFit?: boolean;
  /**
   * Draw each run's own face as a slide's run draws it (a slide table's
   * cell): its open stand-in's own name behind the Office name, then the
   * cell's faces (`presentationCellTextRunCss`), so its Cyrillic, Greek and
   * Vietnamese words are not left to the cell's East Asian face or the
   * system's. Off for the worksheet and Docs hosts.
   */
  slideFaces?: boolean;
  /**
   * The size a superscript / subscript run is drawn at, as a multiple of its
   * own (the host's own scale: a sheet's 0.75, a Docs shape's 0.65). Absent:
   * raised or lowered at full size, as before.
   */
  scriptScale?: number;
  






  lineBreak?: string;
  /**
   * A caret alone inside a word formats that word, as PowerPoint and Word
   * format a slide's, a table cell's and a shape's words (PPT-B006); between
   * words the format is held for the characters typed there. Absent: a
   * caret always holds the format (a worksheet cell being edited, as Excel
   * does).
   */
  caretFormatsWord?: boolean;
  /**
   * The WordArt the field's container wears (a slide table cell's Table
   * Design > WordArt Styles): its characters wear it unless they have their
   * own, so Font Color reaches it (`patchCellCharacterStyle`).
   */
  containerPaint?: OfficeTextPaint | null;
  








  nativeTyping?: boolean;
  /**
   * The style of the line an empty LAST paragraph stands on (the words end
   * on a paragraph break): a slide table's cell, whose row grows to that
   * line as PowerPoint's does, at its end mark's size
   * (`presentationTableCellTrailingParagraphStyle`). Absent or null: a final
   * paragraph break draws no line, as before (the worksheet and Docs hosts).
   */
  trailingParagraph?: RunStyle | null;
  onChange(event: { target: { value: string; runs: TextRun[]; edit?: PresentationCellTextEdit } }): void;
  onSelectionUpdate?(): void;
};

/**
 * The edit a change made, of the words the field showed when it was made
 * (`base`): [start, end) of them replaced by `insert`. A collaborative host
 * writes it into its room where it was typed (a slide table's cell), however
 * far the words the host holds have moved on with a collaborator's.
 */
export interface PresentationCellTextEdit {
  readonly base: string;
  readonly start: number;
  readonly end: number;
  readonly insert: string;
}

/** The one splice turning `before` into `after`, placed by the caret it left.
 * The caret stands where the edit's new words end, so what follows it is the
 * words' unchanged end: a key typed in a run of repeats ("aa" -> "aaa") and
 * words typed over a selection ("Hello" with its "o" selected, typed "lo")
 * are placed where they were typed. A change the caret does not explain is
 * placed by comparing the two texts only where that comparison is not a
 * guess (TRIAGE 49): among repeated letters it would pick which letter the
 * change follows, and a collaborator's concurrent key could then land inside
 * the word (TRIAGE 47). The host writes such a change without a place, and
 * the room refuses a guess rather than make one. */
function cellTextEditBetween(before: string, after: string, caret: number): PresentationCellTextEdit | null {
  if (before === after) return null;
  const tail = after.length - caret;
  if (caret >= 0 && tail >= 0 && tail <= before.length && after.slice(caret) === before.slice(before.length - tail)) {
    const end = before.length - tail;
    const most = Math.min(caret, end);
    let start = 0;
    while (start < most && before[start] === after[start]) start++;
    return { base: before, start, end, insert: after.slice(start, caret) };
  }
  if (textSpliceIsGuess(before, after)) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let suffix = 0;
  while (suffix < before.length - start && suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { base: before, start, end: before.length - suffix, insert: after.slice(start, after.length - suffix) };
}

/** A paragraph block of a field drawn as paragraphs. */
const PARAGRAPH_ATTRIBUTE = "data-cell-paragraph";

/** Each paragraph block of `host` (or the host itself, drawn as one) fitted
 * to PowerPoint's line ends. */
function fitCellLinesToPowerPoint(host: HTMLElement): void {
  const blocks = host.querySelectorAll<HTMLElement>(`[${PARAGRAPH_ATTRIBUTE}]`);
  requestPowerPointLineFit(blocks.length ? blocks : [host]);
}

/** CSS lengths a host may state as numbers (React's px shorthand). */
const LENGTH_PROPERTIES = new Set([
  "fontSize",
  "letterSpacing",
  "marginTop",
  "marginBottom",
  "textIndent",
  "textDecorationThickness",
]);

/**
 * Write React-style CSS onto a node the field paints by hand. An absent value
 * stays absent (Object.assign wrote "undefined", which for font-family named
 * a font that does not exist and lost the host's face, PPT-B356), and a
 * length given as a number is written in px: a bare number is no CSS length,
 * so the browser dropped it and the words fell back to the host's size.
 */
function paintCss(node: HTMLElement, css: CSSProperties): void {
  for (const [property, value] of Object.entries(css)) {
    if (value === undefined || value === null) continue;
    // A custom property (a paint's marks: its ink for the caret, its
    // outline for the outline overlay) is set by name; assigned it is lost.
    if (property.startsWith("--")) {
      node.style.setProperty(property, String(value));
      continue;
    }
    (node.style as unknown as Record<string, string>)[property] =
      typeof value === "number" && LENGTH_PROPERTIES.has(property)
        ? `${value}px`
        : String(value);
  }
}

/**
 * A caret just after a paragraph's break stands at the start of the next
 * paragraph. The break is the last character of its paragraph's block (the
 * flat text keeps it, so every offset still counts it once), and a caret put
 * after it would be drawn at the end of the line it ends.
 */
function paragraphStartAfterBreak(
  host: HTMLElement,
  point: { node: Node; offset: number },
): { node: Node; offset: number } {
  const text = point.node;
  if (text.nodeType !== Node.TEXT_NODE) return point;
  const data = (text as Text).data;
  if (point.offset !== data.length || !data.endsWith("\n")) return point;
  const block = text.parentElement?.closest(`[${PARAGRAPH_ATTRIBUTE}]`);
  if (!block || !host.contains(block)) return point;
  const next = block.nextElementSibling;
  if (!next || !next.hasAttribute(PARAGRAPH_ATTRIBUTE)) return point;
  const walker = host.ownerDocument.createTreeWalker(next, NodeFilter.SHOW_TEXT, {
    // The paragraph's marker is not its words.
    acceptNode: (node) =>
      node.parentElement?.closest(`[${OFFICE_TEXT_MARKER_ATTRIBUTE}]`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const first = walker.nextNode();
  return first ? { node: first, offset: 0 } : { node: next, offset: 0 };
}

function readText(host: HTMLElement): string {
  const read = (node: Node): string => {
    // An equation (PPT-A052) is an atom: its characters are the run's text,
    // not the KaTeX glyph markup inside it.
    if (isPresentationMathAtom(node)) return presentationMathAtomText(node);
    // A paragraph's bullet or number is drawn, not typed.
    if ((node as Element).hasAttribute?.(OFFICE_TEXT_MARKER_ATTRIBUTE)) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      // An equation's caret place is no character.
      if (node.parentElement?.closest(`[${PRESENTATION_TRAILING_LINE_BOX_ATTRIBUTE}]`)) {
        return (node.textContent ?? "").replace(/\u200b/g, "");
      }
      // A line break (Shift+Enter, `a:br`) is painted as a "\n" its span
      // marks; it reads back as the break, not as a new paragraph.
      return (node.parentElement as HTMLElement | null)?.dataset
        .cellSoftBreak === "true"
        ? (node.textContent ?? "").replace(/\n/g, CELL_SOFT_BREAK)
        : (node.textContent ?? "");
    }
    // The placeholder that gives a trailing line break its empty line.
    if (
      node.nodeName === "BR" &&
      (node as HTMLElement).dataset?.cellSoftBreakTail === "true"
    )
      return "";
    if (node.nodeName === "BR") return "\n";
    return [...node.childNodes]
      .map(
        (child, index) =>
          `${index > 0 && ["DIV", "P"].includes(child.nodeName) ? "\n" : ""}${read(child)}`,
      )
      .join("");
  };
  return read(host).replace(/\r\n?/g, "\n");
}

function baseCharacterStyle(style: CSSProperties = {}): RunStyle {
  const size =
    typeof style.fontSize === "number"
      ? style.fontSize
      : Number.parseFloat(String(style.fontSize));
  return {
    bold: Number(style.fontWeight) >= 600,
    italic: style.fontStyle === "italic",
    underline: String(style.textDecoration ?? "").includes("underline"),
    strike: String(style.textDecoration ?? "").includes("line-through"),
    ...(Number.isFinite(size)
      ? { fontSize: size * (String(style.fontSize).endsWith("pt") ? PX_PER_PT : 1) }
      : {}),
    ...(typeof style.fontFamily === "string"
      ? {
          fontFamily: style.fontFamily
            .split(",")[0]
            .replace(/["']/g, "")
            .trim(),
        }
      : {}),
    ...(typeof style.color === "string" ? { color: style.color } : {}),
  };
}








const selectionWatchers = new WeakMap<Document, Map<Element, () => void>>();
const restoringHosts = new Set<Element>();
function watchSelection(host: HTMLElement, capture: () => void): () => void {
  const doc = host.ownerDocument;
  let watchers = selectionWatchers.get(doc);
  if (!watchers) {
    const map = new Map<Element, () => void>();
    watchers = map;
    selectionWatchers.set(doc, map);
    doc.addEventListener("selectionchange", () => {
      const called = new Set<() => void>();
      const call = (element: Element) => {
        const handler = map.get(element);
        if (!handler || called.has(handler)) return;
        called.add(handler);
        handler();
      };
      for (let element = doc.activeElement; element; element = element.parentElement) call(element);
      for (const element of [...restoringHosts]) call(element);
    });
  }
  watchers.set(host, capture);
  return () => {
    if (watchers.get(host) === capture) watchers.delete(host);
  };
}

/** A real rich-text host. The compatibility accessors are DOM Range adapters,
 * not a hidden textarea; navigation and text selection use the same glyphs. */
const PresentationCellRichTextEditor = forwardRef<
  PresentationCellTextElement,
  Props
>(function PresentationCellRichTextEditor(props, forwardedRef) {
  const {
    value,
    runs,
    readOnly,
    inheritedStyle,
    paragraphStyles,
    scriptScale,
    powerPointLineFit,
    slideFaces: _slideFaces,
    lineBreak: _lineBreak,
    caretFormatsWord,
    containerPaint: _containerPaint,
    nativeTyping: _nativeTyping,
    onChange,
    onSelectionUpdate,
    ...attributes
  } = props;
  void _containerPaint;
  void _slideFaces;
  void _lineBreak;
  void _nativeTyping;
  const hostRef = useRef<PresentationCellTextElement | null>(null);
  // Fitted again when a font arrives or the cell's width changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!powerPointLineFit || !host) return;
    const refit = () => fitCellLinesToPowerPoint(host);
    // A face this cell's words are drawn in arriving, not any face: every
    // cell of a 3_515-cell table refitted at each of the page's font loads.
    const refitForFonts = (event: Event) => {
      const blocks = host.querySelectorAll<HTMLElement>(`[${PARAGRAPH_ATTRIBUTE}]`);
      if (powerPointLineFitStaleAfter(blocks.length ? blocks : [host], event)) refit();
    };
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    fonts?.addEventListener?.("loadingdone", refitForFonts);
    let width = -1;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(([entry]) => {
            if (!entry || entry.contentRect.width === width) return;
            width = entry.contentRect.width;
            refit();
          });
    if (host.parentElement) observer?.observe(host.parentElement);
    return () => {
      fonts?.removeEventListener?.("loadingdone", refitForFonts);
      observer?.disconnect();
    };
  }, [powerPointLineFit]);
  const latest = useRef(props);
  latest.current = { ...props, inheritedStyle, caretFormatsWord, onChange, onSelectionUpdate };
  const selection = useRef<CellTextRange>({ start: 0, end: 0 });
  const pending = useRef<RunStyle | null>(null);
  const composing = useRef(false);
  const restoring = useRef(false);
  const expectedText = useRef(value);
  /** The caret the room carried, owed to the words it names (`carryCaret`). */
  const carriedCaret = useRef<{ words: string; start: number; end: number } | null>(null);
  // The text an edit committed that the host does not show yet. Until it is
  // painted, the browser's selection sits in the old text, so it is no
  // reading of where the caret is: React reads `selectionStart` while it
  // commits the edit, and that read put the caret back before the character
  // just typed, so the next one went in front of it (PPT-B314: B then C
  // typed "CB").
  const unpainted = useRef<string | null>(null);
  const paintSignature = useRef("");
  const currentRuns = () =>
    cellCharacterRuns(latest.current.value, latest.current.runs);
  // A size held at a bare caret (Grow Font with nothing highlighted) draws
  // the caret at that size: the browser's own caret took the height of the
  
  // Read again after every change, since the characters typed there take it.
  const syncHeldCaretSize = () => {
    const host = hostRef.current;
    if (!host) return;
    const held = pending.current;
    const range = selection.current;
    if (!held || typeof held.fontSize !== "number" || range.start !== range.end) {
      setOfficeCaretFontScale(host, null);
      return;
    }
    const beside =
      cellCharacterStyleAt(currentRuns(), range.start)?.fontSize ??
      latest.current.inheritedStyle?.fontSize ??
      baseCharacterStyle(latest.current.style).fontSize;
    setOfficeCaretFontScale(host, officeCaretFontScale(held.fontSize, beside));
  };
  const holdPending = (next: RunStyle | null) => {
    pending.current = next;
    syncHeldCaretSize();
  };
  useLayoutEffect(syncHeldCaretSize);

  // Whether the keyboard is in the field. While it is elsewhere -- in a
  // ribbon menu, a dialog, the colour palette -- the field's range is the
  // one recorded here, not the browser's: a preview that rewrites the text
  // nodes collapses the browser's selection, and putting it back through
  // the Selection API would focus the contenteditable, pulling the keyboard
  // out of the menu on every hovered row (the rows stayed highlighted one
  // after another, the held highlight flickered, a dialog could lose its
  // focus). The DOM selection is brought up to date when the focus returns.
  const hostFocused = () => {
    const host = hostRef.current;
    const active = host?.ownerDocument.activeElement;
    return !!host && !!active && host.contains(active);
  };
  /** The range set while the keyboard was away, owed to the DOM on return. */
  const heldRange = useRef<CellTextRange | null>(null);
  const restore = (start: number, end: number) => {
    const host = hostRef.current;
    if (!host || !validCellTextRange(readText(host), { start, end })) return;
    selection.current = { start, end };
    if (!hostFocused()) {
      heldRange.current = { start, end };
      return;
    }
    heldRange.current = null;
    // Equation atoms count as their characters and are never entered.
    const locate = (offset: number): [Node, number] => {
      const found = presentationAtomAwareDomPoint(host, offset);
      const point = latest.current.paragraphStyles ? paragraphStartAfterBreak(host, found) : found;
      return [point.node, point.offset];
    };
    const [a, from] = locate(start),
      [b, to] = locate(end);
    const browser = window.getSelection();
    // Already the browser's selection (a keystroke's caret, put back after
    // its commit): left as it is. Replacing it made the browser lay out the
    
    // ~45 ms on its 3_515 cells).
    if (browser && browser.rangeCount === 1) {
      const current = browser.getRangeAt(0);
      if (current.startContainer === a && current.startOffset === from &&
          current.endContainer === b && current.endOffset === to) return;
    }
    const range = document.createRange();
    range.setStart(a, from);
    range.setEnd(b, to);
    restoring.current = true;
    restoringHosts.add(host);
    try {
      browser?.removeAllRanges();
      browser?.addRange(range);
    } finally {
      restoring.current = false;
      restoringHosts.delete(host);
    }
  };
  const capture = () => {
    const host = hostRef.current,
      browser = window.getSelection();
    if (!host || !browser?.rangeCount) return;
    // The browser's selection is the field's only while the field has the
    // keyboard (see `restore`); a collapse caused by chrome rewriting the
    // nodes under a held range is not a move of the caret.
    if (!hostFocused() && !restoring.current) return;
    if (unpainted.current !== null) {
      if (readText(host) !== unpainted.current) return;
      unpainted.current = null;
    }
    const range = browser.getRangeAt(0);
    if (
      !host.contains(range.startContainer) ||
      !host.contains(range.endContainer)
    )
      return;
    const offset = (node: Node, end: number) =>
      presentationAtomAwareOffset(host, node, end);
    const next = {
      start: offset(range.startContainer, range.startOffset),
      end: offset(range.endContainer, range.endOffset),
    };
    if (!validCellTextRange(latest.current.value, next)) return;
    // A caret the browser put in a paragraph's drawn marker (Home, a click
    // on the bullet) is not in the words: it goes to the paragraph's start,
    // where typing and Backspace act on the words.
    const inMarker = (node: Node) =>
      Boolean((node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)
        ?.closest(`[${OFFICE_TEXT_MARKER_ATTRIBUTE}]`));
    if (!restoring.current && (inMarker(range.startContainer) || inMarker(range.endContainer))) {
      restore(next.start, next.end);
    }
    if (
      next.start !== selection.current.start ||
      next.end !== selection.current.end
    ) {
      if (!restoring.current) holdPending(null);
      selection.current = next;
      latest.current.onSelectionUpdate?.();
    }
  };
  const commit = (edited: TextRun[], caret: CellTextRange, placed = true) => {
    // Words beside a display equation make it in-line (Word, PowerPoint).
    const next = inlineEquationsBesideWords(edited);
    const text = next.map((run) => run.text).join("");
    // Measured from the words this field showed (its last edit, or the
    // value it was last given), not from the value prop, which a host
    // drawing a typing burst late has not moved on yet.
    const edit = placed ? cellTextEditBetween(expectedText.current, text, caret.end) : null;
    selection.current = caret;
    expectedText.current = text;
    unpainted.current = text;
    latest.current.onChange({ target: { value: text, runs: next, ...(edit ? { edit } : {}) } });
    // An edit the owner does not take is never painted: the caret is read
    // from the host again by the next frame.
    requestAnimationFrame(() => {
      if (unpainted.current === text) unpainted.current = null;
    });
  };
  const insert = (text: string) => {
    if (latest.current.readOnly) return;
    capture();
    const range = selection.current;
    const next = replaceCellTextRange(
      currentRuns(),
      range,
      text,
      pending.current ?? undefined,
    );
    const caret = range.start + text.length;
    commit(next, { start: caret, end: caret });
  };
  





  const insertClipboard = (data: DataTransfer) => {
    if (latest.current.readOnly) return;
    const plain = data.getData("text/plain");
    const textRuns = readPresentationTextRunsFlavour(data, plain);
    const rich =
      parseCellRunsClipboard(data.getData(CELL_RUNS_CLIPBOARD_TYPE), plain) ??
      (textRuns ? presentationTextRunsForCell(textRuns) : null) ??
      cellRunsFromClipboardHtml(data.getData("text/html"), plain);
    if (!rich) {
      insert(plain);
      return;
    }
    capture();
    const range = selection.current;
    const next = replaceCellTextRangeWithRuns(currentRuns(), range, rich);
    if (!next) return;
    const length = rich.reduce((sum, run) => sum + run.text.length, 0);
    const caret = range.start + length;
    commit(next, { start: caret, end: caret });
  };
  /** Copy / Cut of a character selection: its text, and its runs beside it. */
  const writeClipboard = (data: DataTransfer): boolean => {
    capture();
    const range = selection.current;
    if (range.end <= range.start) return false;
    const runs = cellTextRunsInRange(currentRuns(), range);
    if (runs.length === 0) return false;
    const text = runs.map((run) => run.text).join("");
    // The cell's own soft break (Shift+Enter, U+000B) is a line break to
    // every other reader: the plain text carries "\n" and the HTML a <br>,
    // as PowerPoint's clipboard does; the cell flavour keeps the soft break
    // (a bare U+000B pasted into a text box folded to one space, PPT-B430).
    data.setData("text/plain", text.replace(/\v/g, "\n"));
    data.setData(CELL_RUNS_CLIPBOARD_TYPE, JSON.stringify(runs));
    const escape = (value: string) =>
      value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
    data.setData(
      "text/html",
      runs
        .map((run) => {
          const css = cellTextRunCss(run.style);
          const style = [
            run.style?.bold ? "font-weight:700" : "",
            run.style?.italic ? "font-style:italic" : "",
            css.textDecorationLine && css.textDecorationLine !== "none"
              ? `text-decoration:${css.textDecorationLine}${
                  css.textDecorationStyle ? ` ${css.textDecorationStyle}` : ""
                }`
              : "",
          ]
            .filter(Boolean)
            .join(";");
          return `<span${style ? ` style="${style}"` : ""}>${escape(run.text).replace(/[\n\v]/g, "<br>")}</span>`;
        })
        .join(""),
    );
    return true;
  };
  const apply: PresentationCellTextElement["formatCharacters"] = (format) => {
    const host = hostRef.current;
    if (!host?.isConnected || latest.current.readOnly || composing.current)
      return false;
    capture();
    const range = selection.current;
    if (!validCellTextRange(latest.current.value, range)) return false;
    // Each run's patch from its style as drawn: its own over the field's,
    // the base `characterState` reads too.
    const base: RunStyle = {
      ...baseCharacterStyle(latest.current.style),
      ...latest.current.inheritedStyle,
    };
    const patch: Partial<RunStyle> | ((style: RunStyle | undefined) => Partial<RunStyle>) =
      typeof format === "function"
        ? (style) => format({ ...base, ...(style ?? {}) })
        : format;
    if (typeof patch === "function") {
      // A worked-out patch that changes no run (each already at the end of
      // the size list) is no edit.
      const before = currentRuns();
      const target =
        range.start === range.end && latest.current.caretFormatsWord
          ? caretWordRange(latest.current.value, range.start)
          : [range.start, range.end];
      if (
        target[0] < target[1] &&
        JSON.stringify(formatCellTextRange(before, { start: target[0], end: target[1] }, patch, latest.current.containerPaint)) ===
          JSON.stringify(before)
      ) {
        return false;
      }
    }
    const word =
      range.start === range.end && latest.current.caretFormatsWord
        ? caretWordRange(latest.current.value, range.start)
        : null;
    const paint = latest.current.containerPaint;
    if (word && word[0] < word[1]) {
      // A caret inside a word: the word, the caret kept where it was.
      commit(formatCellTextRange(currentRuns(), { start: word[0], end: word[1] }, patch, paint), range);
    } else if (range.start === range.end) {
      const at = pending.current ?? cellCharacterStyleAt(currentRuns(), range.start);
      holdPending(
        patchCellCharacterStyle(
          at,
          typeof patch === "function" ? patch(at) : patch,
          paint,
        ) ?? {},
      );
      latest.current.onSelectionUpdate?.();
    } else commit(formatCellTextRange(currentRuns(), range, patch, paint), range);
    host.focus({ preventScroll: true });
    restore(range.start, range.end);
    return true;
  };

  const applyPaint: PresentationCellTextElement["formatCharacterPaint"] = (transform, alongside) => {
    const host = hostRef.current;
    if (!host?.isConnected || latest.current.readOnly || composing.current)
      return false;
    capture();
    const selected = selection.current;
    const value = latest.current.value;
    if (!validCellTextRange(value, selected)) return false;
    // A caret alone: the word it is in, as Office formats it.
    const [start, end] =
      selected.start === selected.end
        ? caretWordRange(value, selected.start)
        : [selected.start, selected.end];
    if (start === end) return false;
    const before = currentRuns();
    const next = mapCellTextRange(before, { start, end }, (style) => {
      const paint = transform(style?.textPaint ?? null, style);
      const restyled = { ...(style ?? {}), ...(alongside ?? {}) } as RunStyle;
      if (paint) {
        // The paint owns the glyphs' fill and outline.
        restyled.textPaint = paint;
        delete restyled.color;
        delete restyled.textOutline;
      } else delete restyled.textPaint;
      return restyled;
    });
    if (JSON.stringify(next) === JSON.stringify(before)) return false;
    commit(next, selected);
    host.focus({ preventScroll: true });
    restore(selected.start, selected.end);
    return true;
  };

  useLayoutEffect(() => {
    const host = hostRef.current!;
    // Settable, as a textarea's are: React writes them back on the focused
    // element after a commit that moved the focus (`restoreSelection`), and
    // a getter alone threw in the middle of that commit (a colour picked
    // from a menu while a WordArt label's words were open in Docs).
    Object.defineProperties(host, {
      value: { configurable: true, get: () => readText(host) },
      selectionStart: {
        configurable: true,
        get: () => {
          capture();
          return selection.current.start;
        },
        set: (start: number) => {
          if (!Number.isInteger(start)) return;
          restore(start, Math.max(start, selection.current.end));
        },
      },
      selectionEnd: {
        configurable: true,
        get: () => {
          capture();
          return selection.current.end;
        },
        set: (end: number) => {
          if (!Number.isInteger(end)) return;
          restore(Math.min(selection.current.start, end), end);
        },
      },
    });
    host.setSelectionRange = (start, end) => {
      const changed =
        start !== selection.current.start || end !== selection.current.end;
      if (changed) holdPending(null);
      restore(start, end);
      if (changed) latest.current.onSelectionUpdate?.();
    };
    host.formatCharacters = apply;
    host.formatCharacterPaint = applyPaint;
    host.insertEquation = (equation) => {
      if (latest.current.readOnly || composing.current) return false;
      capture();
      const range = selection.current;
      const next = insertCellEquation(
        currentRuns(),
        range,
        equation,
        pending.current ?? undefined,
      );
      if (!next) return false;
      const end = range.start + equation.text.length;
      // The new equation stays selected, as PowerPoint selects an equation
      // it inserts, so its contextual tab and Edit Equation apply to it.
      commit(next, { start: range.start, end });
      return true;
    };
    host.carryCaret = (words, start, end) => {
      carriedCaret.current = null;
      if (composing.current || start < 0 || start > end || end > words.length) return;
      if (expectedText.current === words && latest.current.value === words && unpainted.current === null) {
        // Already drawn: the caret goes there now.
        if (hostFocused()) restore(start, end);
        return;
      }
      carriedCaret.current = { words, start, end };
    };
    host.replaceRange = (range, runs, caret) => {
      if (latest.current.readOnly || composing.current) return false;
      const next = replaceCellTextRangeWithRuns(currentRuns(), range, runs);
      if (!next) return false;
      const end = range.start + runs.reduce((sum, run) => sum + run.text.length, 0);
      commit(next, caret ?? { start: end, end });
      return true;
    };
    host.selectedEquation = () => {
      capture();
      const found = cellEquationInRange(currentRuns(), selection.current);
      if (!found) return null;
      return {
        start: found.start,
        end: found.end,
        text: found.run.text,
        latex: found.run.math.latex,
        display: found.run.math.display === true,
      };
    };
    // A click on an equation selects it whole (it has no caret positions of
    // its own), as PowerPoint selects an equation object.
    const selectAtom = (event: MouseEvent) => {
      const atom = presentationMathAtomOf(event.target as Node | null);
      if (!atom || !host.contains(atom)) return;
      const index = Number(atom.getAttribute("data-run-index"));
      const runs = currentRuns();
      if (!Number.isInteger(index) || !runs[index]?.math) return;
      const start = runs
        .slice(0, index)
        .reduce((sum, run) => sum + run.text.length, 0);
      event.preventDefault();
      host.focus({ preventScroll: true });
      host.setSelectionRange(start, start + runs[index]!.text.length);
    };
    host.addEventListener("click", selectAtom);
    // A double- or triple-click selects the word or the paragraph in the
    // field's own words (`presentationDoubleClickWord`), never a paragraph's
    // break: the browser's word selection past a line's last word took the
    
    // box, the same in a cell).
    const selectWord = (event: MouseEvent) => {
      carriedCaret.current = null;
      if (event.button !== 0 || event.detail < 2 || composing.current) return;
      if (presentationMathAtomOf(event.target as Node | null)) return;
      const doc = host.ownerDocument as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };
      const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
      const position = range ? null : doc.caretPositionFromPoint?.(event.clientX, event.clientY);
      const node = range?.startContainer ?? position?.offsetNode ?? null;
      if (!node || !host.contains(node)) return;
      const at = presentationAtomAwareOffset(host, node, range?.startOffset ?? position?.offset ?? 0);
      const value = latest.current.value;
      const [start, end] =
        event.detail === 2 ? presentationDoubleClickWord(value, at) : presentationParagraphRange(value, at);
      event.preventDefault();
      host.focus({ preventScroll: true });
      host.setSelectionRange(start, end);
    };
    host.addEventListener("mousedown", selectWord);
    host.characterState = (key) => {
      const range = selection.current,
        base = {
          ...baseCharacterStyle(latest.current.style),
          ...latest.current.inheritedStyle,
        };
      if (range.start === range.end)
        return {
          value:
            (pending.current ??
              cellCharacterStyleAt(currentRuns(), range.start))?.[key] ??
            base[key],
          mixed: false,
        };
      let offset = 0;
      const values: unknown[] = [];
      for (const run of currentRuns()) {
        const end = offset + run.text.length;
        if (end > range.start && offset < range.end)
          values.push(run.style?.[key] ?? base[key]);
        offset = end;
      }
      return {
        value: values[0],
        mixed: values.some((value) => value !== values[0]),
      };
    };
    // Shift+Enter is read off the key, not the input's type: WebKit on macOS
    // raises the same `insertParagraph` for Return and Shift+Return (both are
    // AppKit's insertNewline:), so in Safari Shift+Enter started a new
    // paragraph where PowerPoint breaks the line inside it.
    let shiftEnterDown = false;
    const keyDown = (event: KeyboardEvent) => {
      // A key that moves the caret is this member's own placing of it.
      if (!(event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) &&
          event.key !== "Shift" && event.key !== "Process") carriedCaret.current = null;
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey &&
        !event.isComposing && !composing.current
      ) {
        capture();
        const range = selection.current;
        if (range.start === range.end) {
          const forward = event.key === "ArrowRight";
          let offset = 0;
          const runs = currentRuns();
          for (let index = 0; index < runs.length; index += 1) {
            const run = runs[index]!;
            const end = offset + run.text.length;
            if (run.math && (forward ? offset === range.start : end === range.start)) {
              const atom =
                host.querySelector(`[data-run-index="${index}"]`) ?? null;
              const claim = new CustomEvent<OfficeFieldEquationEnterDetail>(OFFICE_FIELD_EQUATION_ENTER_EVENT, {
                bubbles: true,
                cancelable: true,
                detail: {
                  start: offset,
                  end,
                  latex: run.math.latex,
                  display: run.math.display === true,
                  edge: forward ? "start" : "end",
                  atom,
                },
              });
              if (!host.dispatchEvent(claim)) {
                event.preventDefault();
                event.stopPropagation();
              }
              break;
            }
            offset = end;
          }
        }
      }
      shiftEnterDown =
        event.key === "Enter" &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Shift") shiftEnterDown = false;
    };
    // The browser types a plain character itself (`nativeTyping`) where it
    // can only land in the run the field would put it in: a collapsed caret
    // after a character of a run's own words, no format held for the next
    // character, nothing the browser would spell differently (a space it may
    // write as a no-break space, a break, a tab).
    const browserTypes = (data: string): boolean => {
      if (!latest.current.nativeTyping || pending.current) return false;
      if (!/^[^\s\u00a0\u200b\u000b]+$/u.test(data)) return false;
      const browser = window.getSelection();
      if (!browser || browser.rangeCount !== 1 || !browser.isCollapsed) return false;
      const node = browser.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE || browser.anchorOffset === 0) return false;
      const span = node.parentElement;
      if (!span || span.dataset.cellTextRun !== "true" || span.dataset.cellSoftBreak === "true") return false;
      if (span.childNodes.length !== 1 || !host.contains(span)) return false;
      const range = selection.current;
      return range.start === range.end;
    };
    const beforeInput = (event: InputEvent) => {
      // An input is read at the caret the field shows.
      carriedCaret.current = null;
      if (latest.current.readOnly) {
        event.preventDefault();
        return;
      }
      capture();
      if (composing.current || event.isComposing) return;
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        // Shift+Enter: a line break inside the paragraph (`a:br`), as in
        // PowerPoint; Enter starts a new paragraph.
        event.preventDefault();
        insert(
          event.inputType === "insertLineBreak" || shiftEnterDown
            ? (latest.current.lineBreak ?? CELL_SOFT_BREAK)
            : "\n",
        );
      } else if (event.inputType === "insertText" && event.data !== null) {
        if (browserTypes(event.data)) return;
        event.preventDefault();
        insert(event.data);
      } else if (
        event.inputType === "deleteContentBackward" &&
        latest.current.paragraphStyles?.some((paragraph) => paragraph.marker)
      ) {
        // Backspace at a paragraph's start joins it to the one above, as
        // Office does; the browser would remove the drawn marker instead.
        const range = selection.current;
        if (range.start === range.end && range.start > 0 && latest.current.value[range.start - 1] === "\n") {
          event.preventDefault();
          const at = range.start - 1;
          commit(replaceCellTextRange(currentRuns(), { start: at, end: range.start }, ""), { start: at, end: at });
        }
      }
    };
    host.addEventListener("keydown", keyDown);
    host.addEventListener("keyup", keyUp);
    host.addEventListener("beforeinput", beforeInput);
    // The range kept while the keyboard was away (see `restore`) becomes the
    // browser's again when it returns, where the field left it, not where
    // the browser landed it.
    const onFocus = () => {
      const kept = heldRange.current;
      if (!kept) return;
      restore(kept.start, kept.end);
      // A browser that places its own caret at the start of a freshly
      // focused editable around the focus event would record that caret
      // over the kept range; the range wins. A click's own caret lands
      // later still and keeps the last word.
      queueMicrotask(() => {
        if (hostFocused()) restore(kept.start, kept.end);
      });
    };
    host.addEventListener("focus", onFocus);
    const unwatchSelection = watchSelection(host, capture);
    return () => {
      host.removeEventListener("click", selectAtom);
      host.removeEventListener("mousedown", selectWord);
      host.removeEventListener("keydown", keyDown);
      host.removeEventListener("keyup", keyUp);
      host.removeEventListener("beforeinput", beforeInput);
      host.removeEventListener("focus", onFocus);
      unwatchSelection();
      holdPending(null);
    };
    // These mount-owned adapters read live props through latest.current.
    // Rebinding them per keystroke would retire the active IME/typing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || composing.current) return;
    if (readOnly) holdPending(null);
    if (expectedText.current !== value) {
      // Words that changed under the caret (a collaborator typing in this
      // cell): the caret keeps its characters, and stays behind this
      // member's own last letter at their insertion, as a text box's does
      // (lib/presentation/collab-caret). Kept at its offset, the next key
      // went into the middle of the collaborator's word.
      const carried = carriedCaret.current;
      if (document.activeElement === host && carried?.words === value) {
        // Where the room carried it (`carryCaret`).
        capture();
        selection.current = { start: carried.start, end: carried.end };
        carriedCaret.current = null;
      } else if (document.activeElement === host) {
        capture();
        const before = expectedText.current;
        const start = mapCaretThroughTextChange(selection.current.start, before, value);
        selection.current = { start, end: Math.max(start, mapCaretThroughTextChange(selection.current.end, before, value)) };
      }
      holdPending(null);
      expectedText.current = value;
      unpainted.current = null;
    }
    const signature = JSON.stringify([
      value,
      runs,
      props.style,
      props.inheritedStyle,
      paragraphStyles,
      scriptScale,
      latest.current.trailingParagraph,
    ]);
    if (paintSignature.current === signature) return;
    paintSignature.current = signature;
    const focused = document.activeElement === host;
    const fragment = document.createDocumentFragment();
    const paragraphs = latest.current.paragraphStyles;
    // Where the next run's nodes go: the field itself, or the paragraph it is
    // drawn in when the words are laid out as paragraphs.
    let target: Node = fragment;
    let paragraphIndex = 0;
    const paragraphStyle = () =>
      paragraphs?.[Math.min(paragraphIndex, paragraphs.length - 1)];
    const openParagraph = () => {
      const block = document.createElement("span");
      block.setAttribute(PARAGRAPH_ATTRIBUTE, String(paragraphIndex));
      // The paragraph's own type on the block too: its strut (the line box a
      // line keeps whatever its runs) is the paragraph's size, as at rest.
      paintCss(block, { ...paragraphStyle()?.block, ...paragraphStyle()?.font, display: "block" });
      const marker = paragraphStyle()?.marker;
      if (marker) {
        const drawn = document.createElement("span");
        drawn.setAttribute(OFFICE_TEXT_MARKER_ATTRIBUTE, "");
        drawn.setAttribute("aria-hidden", "true");
        drawn.contentEditable = "false";
        drawn.textContent = marker.text;
        paintCss(drawn, { ...marker.css });
        block.appendChild(drawn);
      }
      fragment.appendChild(block);
      target = block;
    };
    // A run states what it formats; the rest it takes from its paragraph's
    // type (as the paragraph is drawn at rest), then the field's. A raised or
    // lowered run is drawn at the host's script size, as the host draws it.
    // The host's scale applies to the run's own size once: the CSS a cell
    // run is read into (`cellTextRunCss`) already draws a raised run at a
    // slide table's two thirds, and scaling that again drew it a third
    // smaller while typed than where it rests. Without a host scale, that
    // table size is the one it is drawn at.
    const runCss = (style: RunStyle | undefined): CSSProperties => {
      const css = baseRunCss(style);
      const scale = latest.current.scriptScale;
      if (!scale || (css.verticalAlign !== "super" && css.verticalAlign !== "sub")) return css;
      const own = baseRunCss({ ...(style ?? {}), superscript: false, subscript: false }).fontSize;
      const size = Number.parseFloat(String(own ?? ""));
      return {
        ...css,
        fontSize:
          String(own ?? "").endsWith("px") && Number.isFinite(size)
            ? `${Math.round(size * scale * 100) / 100}px`
            : `${scale}em`,
      };
    };
    const cellRunCss = latest.current.slideFaces ? presentationCellTextRunCss : cellTextRunCss;
    const baseRunCss = (style: RunStyle | undefined) => {
      const font = paragraphStyle()?.font;
      if (!font) {
        return cellRunCss(style, latest.current.style, latest.current.inheritedStyle);
      }
      const inherited: RunStyle = { ...latest.current.inheritedStyle };
      const base: CSSProperties = { ...latest.current.style };
      if (font.fontSize !== undefined) {
        delete inherited.fontSize;
        base.fontSize = font.fontSize;
      }
      if (font.fontFamily !== undefined) {
        delete inherited.fontFamily;
        base.fontFamily = font.fontFamily;
      }
      return cellRunCss(style, base, inherited);
    };
    const appendText = (
      text: string,
      css: CSSProperties,
      softBreak: boolean,
      painted = false,
      symbolFamily?: string,
    ) => {
      const span = document.createElement("span");
      const pieces = symbolFamily ? cellRunSymbolPieces(text) : [];
      if (pieces.some((piece) => piece.symbol)) {
        // The run's symbol-encoded characters in its symbol font, every other
        // one in the run's own face (as the show draws them, `cellRunDisplay`):
        // each symbol stretch a span of its own inside the run's, the rest the
        // run's own text, so offsets still count each character once.
        for (const piece of pieces) {
          if (!piece.symbol) {
            span.appendChild(document.createTextNode(piece.text));
            continue;
          }
          const symbol = document.createElement("span");
          symbol.textContent = piece.text;
          symbol.style.fontFamily = symbolFamily as string;
          symbol.style.lineHeight = "0";
          symbol.dataset.runSymbolFont = "";
          span.appendChild(symbol);
        }
      } else {
        span.textContent = text;
      }
      paintCss(span, css);
      // A typed line break is a "\n" the host's pre-wrap breaks at; the run
      // states that it takes the host's white space, so an enclosing
      // editor's `span { white-space: nowrap }` (the worksheet object caption
      // rule) cannot fold the break onto one line while the words are open.
      if (css.whiteSpace === undefined) span.style.whiteSpace = "inherit";
      span.dataset.cellTextRun = "true";
      if (softBreak) span.dataset.cellSoftBreak = "true";
      // The run's own WordArt draws over the cell's (`[data-text-paint]`).
      if (painted) span.dataset.runTextPaint = "true";
      target.appendChild(span);
    };
    if (paragraphs) openParagraph();
    for (const [runIndex, run] of currentRuns().entries()) {
      if (run.math) {
        const css = runCss(run.style);
        // An equation: one KaTeX atom standing for its characters.
        const atom = createPresentationMathAtomElement(document, {
          text: run.text,
          latex: run.math.latex,
          display: run.math.display === true,
          runIndex,
          // Bold / Underline / Strikethrough on the equation's run.
          format: equationFormatFromCss(css),
        });
        paintCss(atom, {
          color: css.color,
          fontSize: css.fontSize,
          backgroundColor: css.backgroundColor,
        });
        atom.dataset.cellMathRun = "true";
        // A display equation fills its line as a full-width inline block: as
        // a block, the caret's place after it and its paragraph's "\n" made
        
        if (run.math.display === true) {
          atom.style.display = "inline-block";
          atom.style.width = "100%";
        }
        // A caret's place beside the equation: a zero-width character the
        // readers skip (`data-trailing-line-box`), as a slide draws after
        // its equations (`PresentationMathRun`). An atom that is not editable
        // and starts or ends its line leaves the browser no place for a caret
        // there, so nothing could be typed before or after an equation box's
        // equation (the arrows had walked out of it into the words).
        const caretAnchor = () => {
          const anchor = document.createElement("span");
          anchor.setAttribute(PRESENTATION_TRAILING_LINE_BOX_ATTRIBUTE, "");
          anchor.dataset.equationCaretAnchor = "";
          anchor.textContent = "\u200b";
          return anchor;
        };
        // Before the equation as well when it starts its line: first in its
        // block, or after a line break (a caret between a break and an atom
        // is moved by the browser to the end of the line above, where an
        // input method's text then went) or after a display equation.
        const drawn = [...target.childNodes].filter(
          (node) => !(node as Element).hasAttribute?.(OFFICE_TEXT_MARKER_ATTRIBUTE),
        );
        const previous = drawn[drawn.length - 1] as HTMLElement | undefined;
        const startsLine =
          !previous ||
          (previous.dataset?.equationCaretAnchor !== undefined &&
            (previous.previousSibling as HTMLElement | null)?.style?.width === "100%") ||
          (previous.dataset?.cellTextRun === "true" && (previous.textContent ?? "").endsWith("\n"));
        if (startsLine) target.appendChild(caretAnchor());
        target.appendChild(atom);
        target.appendChild(caretAnchor());
        continue;
      }
      // Drawn as paragraphs, a paragraph break ends the block it is in: its
      // "\n" is that block's last character (one character, so offsets stay
      // the text's) and the next paragraph opens a block of its own.
      (paragraphs ? run.text.split("\n") : [run.text]).forEach((segment, segmentIndex) => {
        const painted = Boolean(run.style?.textPaint);
        if (segmentIndex > 0) {
          appendText("\n", runCss(run.style), false, painted);
          paragraphIndex += 1;
          openParagraph();
        }
        const css = runCss(run.style);
        const symbolFamily = cellRunSymbolFontFamily(run.style);
        // A line break (`\v`) is its own span holding a "\n", which CSS
        // breaks at; it is one character long, so offsets stay the text's.
        segment.split(CELL_SOFT_BREAK).forEach((piece, index) => {
          const pieces = index > 0 ? ["\n", piece] : [piece];
          pieces.forEach((text, part) => {
            if (!text) return;
            appendText(text, css, index > 0 && part === 0, painted, symbolFamily);
          });
        });
      });
    }
    // A trailing line break needs something on its line to draw it (and
    // the caret) at all; so does an empty last paragraph.
    if (
      value.endsWith(CELL_SOFT_BREAK) ||
      (paragraphs &&
        ![...target.childNodes].some(
          (node) => !(node as Element).hasAttribute?.(OFFICE_TEXT_MARKER_ATTRIBUTE),
        ))
    ) {
      const tail = document.createElement("br");
      tail.dataset.cellSoftBreakTail = "true";
      target.appendChild(tail);
    }
    // An empty last paragraph (the words end on a paragraph break) is a line
    
    
    // line at all; a block of the mark's own type holding a break the
    // readers skip does, at exactly that line's height: a block's line box
    // stands on its own type, not on the field's (a superscript mark's line
    // is two thirds of the field's).
    const trailing = latest.current.trailingParagraph;
    if (!paragraphs && trailing && value.endsWith("\n")) {
      const css = runCss(trailing);
      const line = document.createElement("span");
      paintCss(line, { display: "block", fontSize: css.fontSize, fontFamily: css.fontFamily });
      line.dataset.cellParagraphTail = "true";
      const tail = document.createElement("br");
      tail.dataset.cellSoftBreakTail = "true";
      line.appendChild(tail);
      target.appendChild(line);
    }
    // The words already drawn as this paint draws them (a character the
    // browser typed itself, `nativeTyping`): the nodes, and the caret in
    // them, are left as they are.
    const drawn = host.childNodes;
    const same = drawn.length === fragment.childNodes.length &&
      [...fragment.childNodes].every((node, index) => node.isEqualNode(drawn[index]));
    if (!same) host.replaceChildren(fragment);
    unpainted.current = null;
    if (latest.current.powerPointLineFit) fitCellLinesToPowerPoint(host);
    if (focused)
      restore(
        Math.min(selection.current.start, value.length),
        Math.min(selection.current.end, value.length),
      );
  });

  /** Where the browser left the caret after its own edit, if collapsed. */
  const domCaret = (): number | null => {
    const host = hostRef.current,
      browser = window.getSelection();
    if (!host || !browser?.rangeCount || !browser.isCollapsed) return null;
    const range = browser.getRangeAt(0);
    if (!host.contains(range.startContainer)) return null;
    return presentationAtomAwareOffset(host, range.startContainer, range.startOffset);
  };
  const acceptDomInput = () => {
    if (composing.current || latest.current.readOnly || !hostRef.current)
      return;
    const text = readText(hostRef.current),
      old = latest.current.value;
    if (text === old) return;
    let from = 0,
      oldEnd = old.length,
      newEnd = text.length;
    while (from < oldEnd && from < newEnd && old[from] === text[from]) from++;
    while (
      oldEnd > from &&
      newEnd > from &&
      old[oldEnd - 1] === text[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }
    // Deleting or inserting inside a run of the same character ("AA" -> "A")
    // reads the same wherever it happened; the common prefix alone put it at
    // the END of the run, so the wrong character's formatting survived
    // (PPT-B191). The caret the browser left says where it was.
    const removed = oldEnd - from,
      added = newEnd - from,
      caret = domCaret();
    // The caret ends the browser's own edit: what follows it is the words'
    // unchanged end, so words typed over a selection in a run of repeats are
    // read where they were typed too (TRIAGE 49).
    const tail = caret === null ? -1 : text.length - caret;
    if (caret !== null && tail >= 0 && tail <= old.length && text.slice(caret) === old.slice(old.length - tail)) {
      oldEnd = old.length - tail;
      newEnd = caret;
      const most = Math.min(oldEnd, newEnd);
      from = 0;
      while (from < most && old[from] === text[from]) from++;
    } else if (caret !== null && (removed === 0) !== (added === 0)) {
      let suffix = 0;
      while (
        suffix < old.length &&
        suffix < text.length &&
        old[old.length - 1 - suffix] === text[text.length - 1 - suffix]
      )
        suffix++;
      const shorter = Math.min(old.length, text.length);
      const lowest = Math.max(0, shorter - suffix);
      const at = Math.min(from, Math.max(lowest, caret - added));
      from = at;
      oldEnd = at + removed;
      newEnd = at + added;
    }
    while (from > 0 && !validCellTextRange(old, { start: from, end: from }))
      from--;
    while (
      oldEnd < old.length &&
      !validCellTextRange(old, { start: oldEnd, end: oldEnd })
    ) {
      oldEnd++;
      newEnd++;
    }
    if (!validCellTextRange(old, { start: from, end: oldEnd })) return;
    const next = replaceCellTextRange(
      currentRuns(),
      { start: from, end: oldEnd },
      text.slice(from, newEnd),
      pending.current ?? undefined,
    );
    paintSignature.current = "";
    // A change the caret did not place, read among repeated letters, is a
    // guess at which letter it follows: it is handed over without a place.
    const placed = (caret !== null && caret === newEnd) || !textSpliceIsGuess(old, text);
    commit(next, { start: newEnd, end: newEnd }, placed);
  };
  return (
    <div
      {...attributes}
      ref={(node) => {
        hostRef.current = node as PresentationCellTextElement | null;
        if (typeof forwardedRef === "function") forwardedRef(hostRef.current);
        else if (forwardedRef) forwardedRef.current = hostRef.current;
      }}
      role="textbox"
      aria-multiline="true"
      aria-readonly={readOnly || undefined}
      tabIndex={0}
      data-selection-owner="cell-rich-editor"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      style={{
        ...props.style,
        // The cell's highlight is the words' (each run takes it from this
        // style), not a fill over the whole cell, as PowerPoint draws it.
        backgroundColor: undefined,
        textDecoration: "none",
        outline: "none",
        cursor: "text",
      }}
      onInput={acceptDomInput}
      onCompositionStart={() => {
        capture();
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        acceptDomInput();
      }}
      onPaste={(event) => {
        props.onPaste?.(
          event as ReactClipboardEvent<PresentationCellTextElement>,
        );
        if (!event.defaultPrevented) {
          event.preventDefault();
          insertClipboard(event.clipboardData);
        }
      }}
      onCopy={(event) => {
        props.onCopy?.(
          event as ReactClipboardEvent<PresentationCellTextElement>,
        );
        if (!event.defaultPrevented && writeClipboard(event.clipboardData)) {
          event.preventDefault();
        }
      }}
      onCut={(event) => {
        props.onCut?.(
          event as ReactClipboardEvent<PresentationCellTextElement>,
        );
        if (!event.defaultPrevented) {
          capture();
          const range = selection.current;
          if (range.end > range.start && writeClipboard(event.clipboardData)) {
            event.preventDefault();
            insert("");
          }
        }
      }}
    />
  );
});
export default PresentationCellRichTextEditor;
