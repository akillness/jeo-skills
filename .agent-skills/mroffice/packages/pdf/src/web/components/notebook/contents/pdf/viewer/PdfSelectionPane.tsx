"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Selection pane of a PDF page (Office: Home > Arrange > Selection Pane,
 * Alt+F10): the page's annotations and its page content, each front first.
 *
 * Annotations are a section of their own above the page content: a PDF
 * reader paints every annotation after the page content, so they are listed
 * and never take part in its order. In the page content every object drags up
 * and down (or Ctrl+Shift+F / Ctrl+Shift+B) -- a shape, a picture, text, a
 * shading, a Form the page draws whole -- and the drop is written as one
 * revision and one Undo step (pdfSelectionPaneMoves ->
 * planPdfNativeContentReorderChain). Objects the page draws inside one
 * `q`…`Q` group (or marked section) are one row, as one layer step passes
 * them whole; it expands to list them.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  OfficeSelectionPaneList,
  OfficeSelectionPaneRow,
  type OfficeSelectionPaneMove,
} from "@mrnote/core/web/components/office-ribbon/OfficeSelectionPaneList.tsx";
import {
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Shapes,
  Boxes,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  pdfSelectionPaneMoves,
  type PdfSelectionPaneContentRow,
  type PdfSelectionPaneMoves,
} from "../../../../../lib/pdf/page-object-list";

export interface PdfSelectionPaneAnnotationRow {
  readonly key: string;
  readonly label: string;
}

export interface PdfSelectionPaneProps {
  readonly pageNumber: number;
  /** The page content, front first (pdfSelectionPaneContentRows). */
  readonly rows: readonly PdfSelectionPaneContentRow[];
  /** The page's annotations, front first (the /Annots order reversed). */
  readonly annotations: readonly PdfSelectionPaneAnnotationRow[];
  /** The selected source vectors' renderer operator indices. */
  readonly selectedVectors: ReadonlySet<number>;
  readonly writable: boolean;
  readonly onSelectVector: (operatorIndex: number, additive: boolean) => void;
  /** A picture's row selects the picture (its own commands move it). */
  readonly onSelectImage?: (operatorIndex: number) => void;
  readonly onReorder: (moves: PdfSelectionPaneMoves) => void;
  readonly onClose: () => void;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly closeClassName?: string;
}

const CONTENT = "content";
const ANNOTATIONS = "annotations";

export function PdfSelectionPane({
  pageNumber,
  rows,
  annotations,
  selectedVectors,
  writable,
  onSelectVector,
  onSelectImage,
  onReorder,
  onClose,
  className,
  bodyClassName,
  closeClassName,
}: PdfSelectionPaneProps): React.JSX.Element {
  const t = useTranslations();
  // Office names objects by kind and the order they were made: here, the
  // order the page paints them.
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    const byKey = new Map<string, string>();
    const kindName = (row: PdfSelectionPaneContentRow) =>
      row.kind === "path"
        ? t("toolbar.shape")
        : row.kind === "image" || row.kind === "inline-image"
          ? t("editor.image")
          : row.kind === "text"
            ? t("pdf.selectionPane.text")
            : row.kind === "shading"
              ? t("pdf.selectionPane.shading")
              : row.kind === "form"
                ? t("pdf.selectionPane.form")
                : row.kind === "group"
                  ? t("pdf.selectionPane.group")
                  : t("pdf.selectionPane.other");
    const name = (list: readonly PdfSelectionPaneContentRow[]) => {
      for (const row of [...list].reverse()) {
        const count = (counts.get(row.kind) ?? 0) + 1;
        counts.set(row.kind, count);
        const kind = kindName(row);
        byKey.set(row.key, row.kind === "text" && row.weight > 1 ? `${kind} ${count} (${row.weight})` : `${kind} ${count}`);
        if (row.children) name(row.children);
      }
    };
    name(rows);
    return byKey;
  }, [rows, t]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const movable = (row: PdfSelectionPaneContentRow) => writable && row.members.length > 0;
  const selectedKeys = rows
    .flatMap((row) => [row, ...(row.children ?? [])])
    .filter((row) => row.vectorOperatorIndex !== undefined && selectedVectors.has(row.vectorOperatorIndex))
    .map((row) => row.key);
  const move = (paneMove: OfficeSelectionPaneMove) => {
    if (paneMove.container !== CONTENT || !writable) return;
    const moves = pdfSelectionPaneMoves(
      paneMove.kind === "drop"
        ? { rows, keys: paneMove.keys, slot: paneMove.slot }
        : { rows, keys: paneMove.keys, step: paneMove.direction },
    );
    if (moves) onReorder(moves);
  };
  const iconFor = (row: PdfSelectionPaneContentRow) =>
    row.kind === "image" || row.kind === "inline-image" ? <ImageIcon size={17} aria-hidden />
      : row.kind === "text" ? <FileText size={17} aria-hidden />
        : row.kind === "group" || row.kind === "form" ? <Boxes size={17} aria-hidden />
          : <Shapes size={17} aria-hidden />;
  return (
    <OfficeTaskPane
      title={t("toolbar.selectionPane")}
      closeLabel={t("presentation.selectionPane.close")}
      onClose={onClose}
      closeClassName={closeClassName}
      testIdPrefix="pdf-selection"
      testId="pdf-selection-pane"
      closeTestId="pdf-selection-pane-close"
      dockRight
      className={className}
      headerActions={<span data-testid="pdf-selection-pane-page">{t("pdf.selectionPane.page", { page: pageNumber })}</span>}
    >
      <div className={bodyClassName}>
        <p role="heading" aria-level={3} data-testid="pdf-selection-pane-annotations-heading">
          {t("pdf.selectionPane.annotations")}
        </p>
        <OfficeSelectionPaneList
          isEmpty={annotations.length === 0}
          emptyLabel={t("pdf.selectionPane.noAnnotations")}
          emptyTestId="pdf-selection-pane-annotations-empty"
          listLabel={t("pdf.selectionPane.annotations")}
        >
          {annotations.map((annotation) => (
            <OfficeSelectionPaneRow
              key={annotation.key}
              drag={{ key: annotation.key, container: ANNOTATIONS, movable: false }}
              icon={<MessageSquare size={17} aria-hidden />}
              label={annotation.label}
              selected={false}
              tabIndex={-1}
              testId="pdf-selection-pane-annotation"
              onClick={() => undefined}
            />
          ))}
        </OfficeSelectionPaneList>
        <p role="heading" aria-level={3} data-testid="pdf-selection-pane-content-heading">
          {t("pdf.selectionPane.pageContent")}
        </p>
        <OfficeSelectionPaneList
          isEmpty={rows.length === 0}
          emptyLabel={t("pdf.selectionPane.noContent")}
          emptyTestId="pdf-selection-pane-content-empty"
          listLabel={t("pdf.selectionPane.pageContent")}
          reorder={writable ? { onMove: move, hint: t("presentation.selectionPane.reorderHelp") } : null}
        >
          {rows.flatMap((row, index) => {
            const open = expanded.has(row.key);
            const select = (target: PdfSelectionPaneContentRow, additive: boolean) => {
              if (target.kind === "image") {
                onSelectImage?.(target.operatorIndex);
                return;
              }
              if (target.vectorOperatorIndex === undefined) return;
              onSelectVector(target.vectorOperatorIndex, additive);
            };
            const head = (
              <OfficeSelectionPaneRow
                key={row.key}
                drag={{ key: row.key, container: CONTENT, movable: movable(row) }}
                icon={iconFor(row)}
                label={labels.get(row.key) ?? row.key}
                position={{ index: index + 1, setSize: rows.length }}
                selected={selectedKeys.includes(row.key)}
                reorderable={movable(row)}
                tabIndex={index === 0 ? 0 : -1}
                testId="pdf-selection-pane-row"
                rowData={{ "data-object-kind": row.kind, "data-pane-key": row.key }}
                expansion={row.children ? {
                  expanded: open,
                  label: t(open ? "presentation.selectionPane.collapseGroup" : "presentation.selectionPane.expandGroup"),
                  testId: "pdf-selection-pane-expand",
                  onToggle: () => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(row.key)) next.delete(row.key);
                    else next.add(row.key);
                    return next;
                  }),
                } : null}
                onClick={(event) => select(row, event.ctrlKey || event.metaKey)}
              />
            );
            if (!row.children || !open) return [head];
            // A group's objects move with it: listed, selectable, not dragged
            // on their own (one layer step passes the group whole).
            return [head, ...row.children.map((child) => (
              <OfficeSelectionPaneRow
                key={child.key}
                drag={{ key: child.key, container: `group:${row.key}`, movable: false }}
                icon={iconFor(child)}
                label={labels.get(child.key) ?? child.key}
                level={1}
                selected={selectedKeys.includes(child.key)}
                tabIndex={-1}
                testId="pdf-selection-pane-group-member"
                rowData={{ "data-object-kind": child.kind, "data-pane-key": child.key }}
                onClick={(event) => select(child, event.ctrlKey || event.metaKey)}
              />
            ))];
          })}
        </OfficeSelectionPaneList>
      </div>
    </OfficeTaskPane>
  );
}
