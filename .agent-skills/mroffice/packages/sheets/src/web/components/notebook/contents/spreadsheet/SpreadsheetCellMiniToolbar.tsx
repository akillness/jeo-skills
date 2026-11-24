"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useImperativeHandle, type Ref } from "react";
import {
  OfficeTextSelectionMiniToolbar,
  useOfficeMouseSelectionMiniToolbar,
  type OfficeMiniToolbarToggle,
} from "@mrnote/core/web/components/office-ribbon/OfficeTextSelectionMiniToolbar.tsx";
import type { PresentationCellTextElement } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import type {
  SpreadsheetDraftCharacterFormat,
  SpreadsheetRichDraftIntent,
} from "./SpreadsheetDraftInput";

/** The cell editor's surface the toolbar reads: an input, a text area, or the
 * rich editor (which can also tell and change the format of its selection). */
type CellEditorHost = HTMLElement &
  Partial<Pick<PresentationCellTextElement, "formatCharacters" | "characterState">> & {
    value?: string;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  };

const RICH_EDITOR_SELECTOR = '[data-selection-owner="cell-rich-editor"]';

export interface SpreadsheetCellMiniToolbarHandle {
  /** The rich editor's selection or format changed. */
  refresh(): void;
}

/**
 * The Docs glass mini toolbar over characters selected in the cell being
 * edited (Excel's Mini Toolbar on a selection). Bold, Italic and
 * Strikethrough format the characters selected, as Excel's cell editor does:
 * a plain entry turns rich at that selection, a rich one formats it in place.
 * AI opens the sheet's own AI panel. A formula has no character formatting,
 * so its text gets no toolbar.
 */
export function SpreadsheetCellMiniToolbar({
  handleRef,
  editingCell,
  getRoot,
  inheritedFormat,
  onTurnRich,
  ai,
}: {
  readonly handleRef: Ref<SpreadsheetCellMiniToolbarHandle>;
  /** The cell open for editing on this sheet; null shows nothing. */
  readonly editingCell: { readonly row: number; readonly col: number } | null;
  readonly getRoot: () => HTMLElement | null;
  /** The cell's own font, which characters without a format of their own show. */
  readonly inheritedFormat: (row: number, col: number) => Required<SpreadsheetDraftCharacterFormat>;
  readonly onTurnRich: (row: number, col: number, intent: Omit<SpreadsheetRichDraftIntent, "nonce">) => void;
  readonly ai?: { readonly onClick: () => void; readonly disabled?: boolean; readonly disabledReason?: string };
}): React.JSX.Element | null {
  const cellKey = editingCell ? `${editingCell.row}:${editingCell.col}` : null;
  const toolbar = useOfficeMouseSelectionMiniToolbar({
    enabled: cellKey !== null,
    hostFor: (target) => {
      if (!cellKey || !(target instanceof Element)) return null;
      const editor = target.closest<HTMLElement>(`input, textarea, ${RICH_EDITOR_SELECTOR}`);
      if (!editor || editor.getAttribute("data-cell") !== cellKey) return null;
      if (editor.getAttribute("data-testid") === "spreadsheet-formula") return null;
      if (String((editor as CellEditorHost).value ?? "").trim().startsWith("=")) return null;
      return editor;
    },
  });
  useImperativeHandle(handleRef, () => ({ refresh: () => toolbar.refresh() }), [toolbar]);
  const host = toolbar.host as CellEditorHost | null;
  if (!editingCell || !host) return null;
  const { row, col } = editingCell;
  const inherited = inheritedFormat(row, col);
  const rich = typeof host.characterState === "function" && typeof host.formatCharacters === "function";

  const toggle = (key: keyof SpreadsheetDraftCharacterFormat): OfficeMiniToolbarToggle => {
    const state = rich ? host.characterState!(key) : null;
    const active: boolean | "mixed" = state
      ? state.mixed
        ? "mixed"
        : state.value === true
      : inherited[key];
    return {
      active,
      onToggle: () => {
        if (rich) {
          host.formatCharacters!({ [key]: active !== true });
          toolbar.refresh();
          return;
        }
        const start = host.selectionStart ?? 0;
        const end = host.selectionEnd ?? 0;
        if (end <= start) return;
        onTurnRich(row, col, { start, end, format: { [key]: !inherited[key] } });
        // The rich editor replaces the input: the toolbar follows it.
        requestAnimationFrame(() => {
          const replacement = getRoot()?.querySelector<HTMLElement>(
            `${RICH_EDITOR_SELECTOR}[data-cell="${row}:${col}"]`,
          );
          if (replacement) toolbar.refresh(replacement);
          else toolbar.dismiss();
        });
      },
    };
  };

  return (
    <OfficeTextSelectionMiniToolbar
      anchor={toolbar.anchor}
      testIdPrefix="spreadsheet-cell-mini-toolbar"
      commands={{
        bold: toggle("bold"),
        italic: toggle("italic"),
        strikethrough: toggle("strike"),
        ...(ai ? { ai } : {}),
      }}
    />
  );
}

/**
 * The same toolbar over words selected in a shape or text box on the sheet.
 * Its buttons are the Home tab's own shape font commands, which format the
 * selected characters of the words being typed (each run its own `a:rPr`),
 * and show what those characters are.
 */
export function SpreadsheetShapeTextMiniToolbar({
  objectId,
  font,
  onToggle,
}: {
  /** The shape whose words are being edited; null shows nothing. */
  readonly objectId: string | null;
  readonly font: { readonly bold: boolean; readonly italic: boolean; readonly strike: boolean };
  readonly onToggle: (field: "textBold" | "textItalic" | "textStrike") => void;
}): React.JSX.Element | null {
  const toolbar = useOfficeMouseSelectionMiniToolbar({
    enabled: objectId !== null,
    hostFor: (target) =>
      objectId && target instanceof Element
        ? target.closest<HTMLElement>(
            `[data-testid="spreadsheet-shape-text-input-${CSS.escape(objectId)}"]`,
          )
        : null,
  });
  if (!objectId) return null;
  // The selected characters' own format, where the words keep runs.
  const words = toolbar.host as (HTMLElement & {
    characterState?: (key: "bold" | "italic" | "strike") => { value: unknown; mixed: boolean };
  }) | null;
  const pressed = (key: "bold" | "italic" | "strike", fallback: boolean) => {
    if (typeof words?.characterState !== "function") return fallback;
    const state = words.characterState(key);
    return state.value === true && !state.mixed;
  };
  const toggle = (field: "textBold" | "textItalic" | "textStrike", active: boolean): OfficeMiniToolbarToggle => ({
    active,
    onToggle: () => {
      onToggle(field);
      toolbar.refresh();
    },
  });
  return (
    <OfficeTextSelectionMiniToolbar
      anchor={toolbar.anchor}
      testIdPrefix="spreadsheet-shape-text-mini-toolbar"
      commands={{
        bold: toggle("textBold", pressed("bold", font.bold)),
        italic: toggle("textItalic", pressed("italic", font.italic)),
        strikethrough: toggle("textStrike", pressed("strike", font.strike)),
      }}
    />
  );
}
