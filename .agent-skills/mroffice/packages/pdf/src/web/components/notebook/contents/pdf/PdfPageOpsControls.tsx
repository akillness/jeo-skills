"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfPageOpsControlsProps {
  /** Original 1-based page number these controls act on. */
  page: number;
  /** Whether the page is currently in the deleted set (shows restore instead). */
  deleted: boolean;
  /** Disables "move up" when the page is already first in the visible order. */
  canMoveUp: boolean;
  /** Disables "move down" when the page is already last in the visible order. */
  canMoveDown: boolean;
  /** Disables every control (e.g. while the document is still loading). */
  disabled?: boolean;
  /** Rotate the page CLOCKWISE (right 90°). */
  onRotate: (page: number) => void;
  /** Rotate the page COUNTER-CLOCKWISE (left 90°). */
  onRotateCcw: (page: number) => void;
  onToggleDelete: (page: number) => void;
  onMoveUp: (page: number) => void;
  onMoveDown: (page: number) => void;
  onInsertBlankAfter: (page: number) => void;
  /** Duplicate the page (insert a copy of it right after). */
  onDuplicate: (page: number) => void;
}

const PAGE_OP_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

/**
 * Per-thumbnail page-operation toolbar (rotate / delete + restore / move up /
 * move down / insert blank after). Purely presentational — all edit state lives
 * in the parent PDFViewer and is produced by `lib/pdf/page-ops.ts`. Stateless so
 * it can be unit-tested without the pdf.js stack (mirrors PdfViewModeToggle).
 *
 * `onClick` handlers stop propagation so clicking a control never also triggers
 * the thumbnail's "go to page" button it is rendered inside / beside.
 */
export default function PdfPageOpsControls({
  page,
  deleted,
  canMoveUp,
  canMoveDown,
  disabled,
  onRotate,
  onRotateCcw,
  onToggleDelete,
  onMoveUp,
  onMoveDown,
  onInsertBlankAfter,
  onDuplicate,
}: PdfPageOpsControlsProps) {
  const t = useTranslations("console-notebooks");
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return (
    <div
      className="pdf-viewer__page-ops !grid grid-cols-3 gap-1"
      data-testid="pdf-page-ops"
      data-page={page}
      role="group"
      aria-label={t("pdfPageOps.groupLabel", { page })}
    >
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-rotate"
        onClick={(event) => {
          stop(event);
          onRotate(page);
        }}
        disabled={disabled || deleted}
        title={t("pdfPageOps.rotate")}
        aria-label={t("pdfPageOps.rotatePage", { page })}
      >
        <RotateCw size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-rotate-ccw"
        onClick={(event) => {
          stop(event);
          onRotateCcw(page);
        }}
        disabled={disabled || deleted}
        title={t("pdfPageOps.rotateCcw")}
        aria-label={t("pdfPageOps.rotateCcwPage", { page })}
      >
        <RotateCcw size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-move-up"
        onClick={(event) => {
          stop(event);
          onMoveUp(page);
        }}
        disabled={disabled || deleted || !canMoveUp}
        title={t("pdfPageOps.moveUp")}
        aria-label={t("pdfPageOps.moveUpPage", { page })}
      >
        <ArrowUp size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-move-down"
        onClick={(event) => {
          stop(event);
          onMoveDown(page);
        }}
        disabled={disabled || deleted || !canMoveDown}
        title={t("pdfPageOps.moveDown")}
        aria-label={t("pdfPageOps.moveDownPage", { page })}
      >
        <ArrowDown size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-insert"
        onClick={(event) => {
          stop(event);
          onInsertBlankAfter(page);
        }}
        disabled={disabled || deleted}
        title={t("pdfPageOps.insertBlank")}
        aria-label={t("pdfPageOps.insertBlankAfter", { page })}
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op ${PAGE_OP_TARGET_CLASS}`}
        data-testid="pdf-page-op-duplicate"
        onClick={(event) => {
          stop(event);
          onDuplicate(page);
        }}
        disabled={disabled || deleted}
        title={t("pdfPageOps.duplicate")}
        aria-label={t("pdfPageOps.duplicatePage", { page })}
      >
        <Copy size={12} />
      </button>
      <button
        type="button"
        className={`pdf-viewer__page-op${deleted ? " is-restore" : " is-delete"} ${PAGE_OP_TARGET_CLASS}`}
        data-testid={deleted ? "pdf-page-op-restore" : "pdf-page-op-delete"}
        onClick={(event) => {
          stop(event);
          onToggleDelete(page);
        }}
        disabled={disabled}
        title={deleted ? t("pdfPageOps.restore") : t("pdfPageOps.delete")}
        aria-label={
          deleted
            ? t("pdfPageOps.restorePage", { page })
            : t("pdfPageOps.deletePage", { page })
        }
      >
        {deleted ? <Undo2 size={12} /> : <Trash2 size={12} />}
      </button>
    </div>
  );
}
