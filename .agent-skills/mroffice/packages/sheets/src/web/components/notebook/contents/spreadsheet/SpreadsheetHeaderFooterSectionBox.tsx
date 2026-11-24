"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * One section box of Excel's Custom Header / Custom Footer (Microsoft Support,
 * "Headers and footers in a worksheet"): a rich edit box whose text is typed
 * freely and keeps per-character formatting. Typing takes the format of the
 * character before the caret, Enter starts a new line, a paste arrives as
 * plain text, and the host's buttons insert field codes at the caret or
 * format the selection (Format Text).
 *
 * The box is controlled: the section's text and runs come in as props and
 * every edit goes out through `onChange`. The DOM is painted from the runs
 * (one span per run) and never trusted as the model: an edit the box can
 * describe exactly (typing, Enter, Backspace/Delete, paste) is applied to the
 * runs directly; anything else the browser does on its own (an IME, a word
 * delete, a spelling fix) is read back from the DOM and folded into the runs
 * with the shared keep-the-format rule ({@link editedRunsKeepingFormat}).
 */
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { officeCaretFontScale, setOfficeCaretFontScale } from "@mrnote/core/web/lib/office-painted-caret.ts";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  type CSSProperties,
} from "react";

import { editedRunsKeepingFormat } from "@mrnote/core/web/lib/spreadsheet/cell-rich-text.ts";
import {
  rangeToCaretOffsets,
  selectCharOffsets,
} from "../../../../lib/spreadsheet/cell-rich-text-selection";
import {
  formatHeaderFooterRange,
  headerFooterRangeFormat,
  headerFooterRunCss,
  headerFooterRunsFromStyled,
  headerFooterStyleAt,
  headerFooterStyledRuns,
  patchHeaderFooterStyle,
  replaceHeaderFooterRange,
  type HeaderFooterFormatField,
  type HeaderFooterFormatPatch,
  type HeaderFooterRunStyle,
  type HeaderFooterStyledRun,
} from "../../../../lib/spreadsheet/header-footer-rich-text";
import {
  headerFooterNativeLength,
  type PrintHeaderFooterRun,
} from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";

export interface HeaderFooterSectionBoxHandle {
  focus(): void;
  /** The box's selection, kept while the focus is elsewhere (a button, the Font dialog). */
  selection(): { start: number; end: number };
  /** Replace the selection with `text` (a field code); false when it would not fit. */
  insert(text: string): boolean;
  /** Format the selection, or choose the format typing at the caret takes. */
  format(patch: HeaderFooterFormatPatch): void;
  /** The format the selection shows, as the Font dialog opens on it. */
  rangeFormat(): { style: HeaderFooterRunStyle; mixed: HeaderFooterFormatField[] };
}

export interface HeaderFooterSectionBoxProps {
  text: string;
  runs?: readonly PrintHeaderFooterRun[];
  /** The section's limit in NATIVE characters (headerFooterNativeLength):
   * Excel counts `&P`, not the `&[Page]` the box shows. */
  maxLength: number;
  onChange(next: { text: string; runs: PrintHeaderFooterRun[] | undefined }): void;
  onFocus?(): void;
  ariaLabel: string;
  testId: string;
  className?: string;
  style?: CSSProperties;
}

/** The sentinel a trailing line break needs to show its empty last line. */
const TRAILING_BREAK = "headerFooterTrailingBreak";

/** The text the box shows: text nodes, plus a line for each <br>/<div>. */
function readText(host: HTMLElement): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeName === "BR") {
      return (node as HTMLElement).dataset?.[TRAILING_BREAK] ? "" : "\n";
    }
    return [...node.childNodes]
      .map(
        (child, index) =>
          `${index > 0 && ["DIV", "P"].includes(child.nodeName) ? "\n" : ""}${read(child)}`,
      )
      .join("");
  };
  return read(host).replace(/\r\n?/g, "\n");
}

/** Dialog-size drawing of point sizes (big sizes are capped to fit the box). */
const pointToPx = (points: number) => ptToPx(Math.min(points, 28));

function codePointBefore(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const low = text.charCodeAt(offset - 1);
  const high = offset >= 2 ? text.charCodeAt(offset - 2) : 0;
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff
    ? offset - 2
    : offset - 1;
}

function codePointAfter(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const high = text.charCodeAt(offset);
  const low = text.charCodeAt(offset + 1);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff
    ? offset + 2
    : offset + 1;
}

const SpreadsheetHeaderFooterSectionBox = forwardRef<
  HeaderFooterSectionBoxHandle,
  HeaderFooterSectionBoxProps
>(function SpreadsheetHeaderFooterSectionBox(props, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // A box not clicked yet has its caret after its text, so a field button
  // pressed first appends the field.
  const selection = useRef({ start: props.text.length, end: props.text.length });
  // A format chosen with Format Text at a caret, for the text typed next.
  const pending = useRef<HeaderFooterRunStyle | null>(null);
  const composing = useRef(false);
  const painted = useRef<string | null>(null);
  const [, repaint] = useReducer((tick: number) => tick + 1, 0);

  const styledRuns = (): HeaderFooterStyledRun[] =>
    headerFooterStyledRuns(latest.current.text, latest.current.runs);
  // A size held at the caret draws the caret at that size: the browser's
  
  // `office-painted-caret.ts`). Read after every change.
  const syncHeldCaretSize = () => {
    const host = hostRef.current;
    if (!host) return;
    const held = pending.current;
    const { start, end } = selection.current;
    setOfficeCaretFontScale(
      host,
      held && typeof held.fontSize === "number" && start === end
        ? officeCaretFontScale(held.fontSize, headerFooterStyleAt(styledRuns(), start)?.fontSize ?? 11)
        : null,
    );
  };
  useLayoutEffect(syncHeldCaretSize);

  /** Read the live selection when it is inside the box. */
  const capture = () => {
    const host = hostRef.current;
    const browser = typeof window !== "undefined" ? window.getSelection() : null;
    if (!host || !browser || browser.rangeCount === 0) return;
    const range = browser.getRangeAt(0);
    if (!host.contains(range.startContainer) || !host.contains(range.endContainer)) {
      return;
    }
    const [start, end] = rangeToCaretOffsets(host, range);
    const length = latest.current.text.length;
    const next = { start: Math.min(start, length), end: Math.min(end, length) };
    if (next.start !== selection.current.start || next.end !== selection.current.end) {
      pending.current = null;
      selection.current = next;
      syncHeldCaretSize();
    }
  };

  const commit = (
    runs: HeaderFooterStyledRun[],
    caret: { start: number; end: number },
  ): boolean => {
    const text = runs.map((run) => run.text).join("");
    if (headerFooterNativeLength(text) > latest.current.maxLength) {
      // Too long for the section: the box goes back to what it held.
      painted.current = null;
      repaint();
      return false;
    }
    selection.current = caret;
    painted.current = null;
    latest.current.onChange({ text, runs: headerFooterRunsFromStyled(runs) });
    repaint();
    return true;
  };

  const replace = (start: number, end: number, inserted: string): boolean => {
    const next = replaceHeaderFooterRange(
      styledRuns(),
      start,
      end,
      inserted,
      pending.current,
    );
    const caret = start + inserted.length;
    const ok = commit(next, { start: caret, end: caret });
    if (ok) pending.current = null;
    return ok;
  };

  const restoreSelection = () => {
    const host = hostRef.current;
    if (!host) return;
    const { start, end } = selection.current;
    selectCharOffsets(host, start, end);
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        const host = hostRef.current;
        if (!host) return;
        host.focus({ preventScroll: true });
        restoreSelection();
      },
      selection() {
        if (document.activeElement === hostRef.current) capture();
        return { ...selection.current };
      },
      insert(text: string) {
        if (document.activeElement === hostRef.current) capture();
        const { start, end } = selection.current;
        return replace(start, end, text);
      },
      format(patch: HeaderFooterFormatPatch) {
        const { start, end } = selection.current;
        if (start === end) {
          const base = pending.current ?? headerFooterStyleAt(styledRuns(), start);
          pending.current = patchHeaderFooterStyle(base, patch) ?? {};
          syncHeldCaretSize();
          return;
        }
        commit(formatHeaderFooterRange(styledRuns(), start, end, patch), {
          start,
          end,
        });
      },
      rangeFormat() {
        const { start, end } = selection.current;
        if (start === end && pending.current) {
          return { style: { ...pending.current }, mixed: [] };
        }
        return headerFooterRangeFormat(styledRuns(), start, end);
      },
    }),
    // The handle reads live props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Paint the runs whenever they differ from what the box shows.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || composing.current) return;
    const runs = styledRuns();
    const signature = JSON.stringify(runs);
    if (painted.current === signature && readText(host) === latest.current.text) return;
    painted.current = signature;
    const focused = document.activeElement === host;
    const fragment = document.createDocumentFragment();
    runs.forEach((run, index) => {
      const span = document.createElement("span");
      span.textContent = run.text;
      span.dataset.headerFooterRun = String(index);
      const css = headerFooterRunCss(run.style, { pointToPx });
      // A CSS declaration object takes strings: a bare number for the size
      // is invalid CSS and the browser drops it (React would append px), so
      // every run drew at the box's 11 pt whatever Format Text set.
      Object.assign(span.style, {
        ...css,
        fontSize: typeof css.fontSize === "number" ? `${css.fontSize}px` : css.fontSize,
      });
      fragment.appendChild(span);
    });
    if (latest.current.text.endsWith("\n")) {
      const sentinel = document.createElement("br");
      sentinel.dataset[TRAILING_BREAK] = "true";
      fragment.appendChild(sentinel);
    }
    host.replaceChildren(fragment);
    if (focused) restoreSelection();
  });

  // Edits the box can describe exactly go straight to the runs.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onBeforeInput = (event: InputEvent) => {
      if (composing.current || event.isComposing) return;
      capture();
      const { start, end } = selection.current;
      const text = latest.current.text;
      switch (event.inputType) {
        case "insertText":
        case "insertReplacementText": {
          const data =
            event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
          if (!data) return;
          event.preventDefault();
          replace(start, end, data.replace(/\r\n?/g, "\n"));
          return;
        }
        case "insertParagraph":
        case "insertLineBreak":
          event.preventDefault();
          replace(start, end, "\n");
          return;
        case "deleteContentBackward":
          event.preventDefault();
          if (start !== end) replace(start, end, "");
          else if (start > 0) replace(codePointBefore(text, start), start, "");
          return;
        case "deleteContentForward":
          event.preventDefault();
          if (start !== end) replace(start, end, "");
          else if (start < text.length) replace(start, codePointAfter(text, start), "");
          return;
        case "insertFromDrop":
        case "historyUndo":
        case "historyRedo":
          event.preventDefault();
          return;
        default:
          // Browser formatting commands (Cmd+B in an editable) would write
          // <b> into the box; Format Text is how a section is formatted.
          if (event.inputType.startsWith("format")) event.preventDefault();
      }
    };
    const onSelectionChange = () => {
      if (!composing.current) capture();
    };
    host.addEventListener("beforeinput", onBeforeInput);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      host.removeEventListener("beforeinput", onBeforeInput);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
    // Mount-owned listeners read live props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fold an edit the browser made on its own into the runs. */
  const acceptDomInput = () => {
    const host = hostRef.current;
    if (!host || composing.current) return;
    const text = readText(host);
    const old = styledRuns();
    const oldText = latest.current.text;
    if (text === oldText) return;
    capture();
    let next = editedRunsKeepingFormat(old, text);
    if (!next) {
      // Nothing formatted survived, or the whole text was replaced: the
      // typed text then takes the format at the start.
      const sharesEdge =
        text !== "" &&
        oldText !== "" &&
        (text[0] === oldText[0] || text.at(-1) === oldText.at(-1));
      const style = sharesEdge
        ? undefined
        : (pending.current ?? headerFooterStyleAt(old, 0));
      next = text ? [style ? { text, style } : { text }] : [];
    }
    const caret = Math.min(selection.current.end, text.length);
    commit(next, { start: caret, end: caret });
  };

  const { ariaLabel, testId, className, style, onFocus } = props;
  return (
    <div
      ref={hostRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={className}
      data-testid={testId}
      data-header-footer-section="true"
      style={{
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        cursor: "text",
        fontFamily: "Aptos, Calibri, sans-serif",
        fontSize: pointToPx(11),
        ...style,
      }}
      onFocus={() => {
        capture();
        onFocus?.();
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
        event.preventDefault();
        capture();
        const pasted = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        if (!pasted) return;
        const { start, end } = selection.current;
        replace(start, end, pasted);
      }}
      onDrop={(event) => event.preventDefault()}
    />
  );
});

export default SpreadsheetHeaderFooterSectionBox;
