"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * In-cell rich text AUTHORING dialog (Excel inline rich text). FORMAT-ONLY: the
 * cell text is typed in the grid as usual; this dialog lets the user SELECT a
 * substring of that text and apply bold / italic / underline / colour to just
 * that span. No contenteditable text-editing (so no fragile DOM↔runs sync) — the
 * preview is selectable text; a toolbar click maps the browser selection to
 * character offsets (rangeToCharOffsets) and runs it through the pure, tested
 * applyRunFormat. On OK the resulting runs are handed back (or undefined when
 * they collapse to plain text).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogClassName,
  officeDialogParts as dialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  applyRunFormat,
  cellRunStyleCss,
  cellRunsForEdit,
  normalizeCellRuns,
  runFieldAtSelection,
  textFromRuns,
  type TextRun,
} from "@mrnote/core/web/lib/spreadsheet/cell-rich-text.ts";
import { rangeToCharOffsets, selectCharOffsets } from "../../../lib/spreadsheet/cell-rich-text-selection";

interface CellRichTextDialogProps {
  /** The cell's flat text (the runs always concatenate to this). */
  value: string;
  /** The cell's existing runs, if any. */
  runs?: TextRun[];
  /** Receives the new runs (or undefined when they're plain/flat). */
  onConfirm: (runs: TextRun[] | undefined) => void;
  onCancel: () => void;
  /**
   * Where the keyboard goes when the dialog closes and the control that
   * opened it is gone (a ribbon menu item unmounts with its menu): the host
   * hands over the grid's active cell.
   */
  returnFocusTarget?: () => HTMLElement | null;
}

const RUN_COLORS = [
  "#111827",
  "#dc2626",
  "#ea580c",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
];

export default function CellRichTextDialog({
  value,
  runs,
  onConfirm,
  onCancel,
  returnFocusTarget,
}: CellRichTextDialogProps) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<TextRun[]>(() =>
    cellRunsForEdit(runs, value),
  );
  const editorRef = useRef<HTMLDivElement>(null);
  // The characters a format was just applied to. Splitting a run redraws the
  // preview's spans, and the browser's selection over the old text went with
  // them: the next button formatted nothing until the text was selected again
  // (S-071). The same characters are selected again once the preview shows
  // the new runs, as Excel keeps the selection across its format buttons.
  const formattedRef = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const kept = formattedRef.current;
    const el = editorRef.current;
    formattedRef.current = null;
    if (kept && el) selectCharOffsets(el, kept[0], kept[1]);
  }, [draft]);

  // Resolve the current selection to character offsets in the cell text, or null
  // when there's no selection inside the editor (a format then no-ops).
  const selectionOffsets = (): [number, number] | null => {
    const el = editorRef.current;
    if (!el) return null;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    const offsets = rangeToCharOffsets(el, range);
    formattedRef.current = offsets;
    return offsets;
  };

  // Apply a toggle for a boolean run field over the selection (sets the opposite
  // of the selection's current uniform value), or a direct patch for colour.
  const applyToggle = (key: "bold" | "italic" | "underline") => {
    const offsets = selectionOffsets();
    if (!offsets) return;
    setDraft((current) => {
      const present = runFieldAtSelection(current, offsets[0], offsets[1], key);
      return applyRunFormat(current, offsets[0], offsets[1], {
        [key]: present === true ? false : true,
      });
    });
  };

  const applyColor = (color: string) => {
    const offsets = selectionOffsets();
    if (!offsets) return;
    setDraft((current) =>
      applyRunFormat(current, offsets[0], offsets[1], { color }),
    );
  };

  const clearFormatting = () => {
    const offsets = selectionOffsets();
    if (!offsets) return;
    setDraft((current) =>
      applyRunFormat(current, offsets[0], offsets[1], {
        bold: false,
        italic: false,
        underline: false,
        color: "",
      }),
    );
  };

  // Escape cancels, like every other spreadsheet dialog. Native overlay (not
  // Radix) so the grid selection under it survives; capture phase beats the
  // grid's own key handling.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  // A modal owns the keyboard: focus enters the window when it opens, Tab and
  // Shift+Tab cycle inside it (the sheet-tab controls behind it are not
  // reachable), and the control that opened it gets focus back when it
  // closes. The overlay is native, so this is done here rather than by Radix.
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTargetRef = useRef(returnFocusTarget);
  useEffect(() => {
    returnFocusTargetRef.current = returnFocusTarget;
  }, [returnFocusTarget]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      // The opener is often a ribbon menu item that unmounted with its menu;
      // then the keyboard goes back to the grid's active cell, as in Excel,
      // rather than falling to the document body.
      const target = opener?.isConnected
        ? opener
        : (returnFocusTargetRef.current?.() ?? null);
      target?.focus({ preventScroll: true });
    };
  }, []);
  const cycleFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((candidate) => candidate.isConnected);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const backward = event.shiftKey && index <= 0;
    const forward = !event.shiftKey && (index < 0 || index === focusable.length - 1);
    if (!backward && !forward) return;
    event.preventDefault();
    focusable[backward ? focusable.length - 1 : 0].focus();
  };

  return (
    <div
      className="app-modal-overlay"
      role="presentation"
      onClick={onCancel}
      data-testid="cell-richtext-overlay"
    >
      <div
        ref={dialogRef}
        className={officeDialogClassName({ tone: "spreadsheet", size: "lg" })}
        role="dialog"
        aria-modal="true"
        aria-label={t("spreadsheet.richTextTitle")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={cycleFocus}
        data-testid="cell-richtext-dialog"
      >
        <div className={dialogParts.header}>
          <h2 className={dialogParts.title}>
            {t("spreadsheet.richTextTitle")}
          </h2>
          <button
            type="button"
            className={dialogParts.close}
            onClick={onCancel}
            aria-label={t("common.close")}
            data-testid="cell-richtext-dialog-close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <p className={dialogParts.description}>
          {t("spreadsheet.richTextHint")}
        </p>

        {/* Toolbar — onMouseDown preventDefault keeps the text selection alive. */}
        <div className={dialogParts.row} style={{ gap: 6 }}>
          <button
            type="button"
            data-testid="cell-richtext-bold"
            aria-label={t("spreadsheet.bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyToggle("bold")}
            className={dialogParts.compactButton}
            style={{ minWidth: 28 }}
          >
            <SpreadsheetDialogIcon name="bold" />
          </button>
          <button
            type="button"
            data-testid="cell-richtext-italic"
            aria-label={t("spreadsheet.italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyToggle("italic")}
            className={dialogParts.compactButton}
            style={{ minWidth: 28 }}
          >
            <SpreadsheetDialogIcon name="italic" />
          </button>
          <button
            type="button"
            data-testid="cell-richtext-underline"
            aria-label={t("spreadsheet.underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyToggle("underline")}
            className={dialogParts.compactButton}
            style={{ minWidth: 28 }}
          >
            <SpreadsheetDialogIcon name="underline" />
          </button>
          <span style={{ width: 1, height: 18, background: "var(--office-dialog-divider)" }} />
          {RUN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`cell-richtext-color-${c}`}
              aria-label={`${t("spreadsheet.textColor")} ${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyColor(c)}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "1px solid var(--office-dialog-control-border)",
                background: c,
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
          <span style={{ width: 1, height: 18, background: "var(--office-dialog-divider)" }} />
          <button
            type="button"
            data-testid="cell-richtext-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearFormatting}
            className={dialogParts.compactButton}
          >
            <SpreadsheetDialogIcon name="clear" />
            {t("spreadsheet.richTextClear")}
          </button>
        </div>

        {/* Selectable preview — the user selects a substring here, then formats. */}
        <div
          ref={editorRef}
          data-testid="cell-richtext-editor"
          className={dialogParts.list}
          style={{
            display: "block",
            padding: "8px 10px",
            minHeight: 64,
            maxHeight: 200,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            userSelect: "text",
            fontSize: 13,
          }}
        >
          {draft.length > 0 ? (
            draft.map((run, i) => (
              <span key={i} style={cellRunStyleCss(run.style)}>
                {run.text}
              </span>
            ))
          ) : (
            <span style={{ opacity: 0.5 }}>{value}</span>
          )}
        </div>

        <div className={dialogParts.footer}>
          <button
            type="button"
            className={dialogParts.button}
            onClick={onCancel}
            data-testid="cell-richtext-cancel"
          >
            {t("spreadsheet.fmtCancel")}
          </button>
          <button
            type="button"
            className={dialogParts.primaryButton}
            onClick={() => onConfirm(normalizeCellRuns(draft, textFromRuns(draft)))}
            data-testid="cell-richtext-ok"
          >
            {t("spreadsheet.fmtOk")}
          </button>
        </div>
      </div>
    </div>
  );
}
