"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The block format inspector for tables, charts, embeds and the other block
 * types without their own format pane.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { PRESENTATION_PANE_CHROME } from "../../../../lib/presentation/window-constants";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { OfficeTaskPaneTabs } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  Trash2,
  X,
  Table2,
  Plus,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { canEditBlockContent } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { presentationChartV2CanEdit, presentationChartV2DataWritable } from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import { tableLogicalWidth } from "@mrnote/core/web/lib/presentation-table-merge.ts";
import {
  normalizeCellStyle,
  normalizeCellColor,
  type TableCellFontFamily,
  TABLE_CELL_FONT_FAMILIES,
  MIN_TABLE_CELL_FONT_SIZE,
  MAX_TABLE_CELL_FONT_SIZE,
  tableCellFontSizeFromInput,
  normalizeCellAlignment,
  type CellAlignment,
  CELL_ALIGNMENTS,
  type CellStyleInput,
  type ResolvedCellStyle,
  type TableBorderSelectionPosition,
} from "@mrnote/core/web/lib/presentation-table-style.ts";
import { inspectorChipStyle } from "../../../../lib/presentation/window-chrome-styles";
import { readVerticalAnchor, persistedVerticalAnchor, VERTICAL_ANCHORS } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { MIN_TABLE_AXIS_PX, MAX_TABLE_AXIS_PX, axisSizeAt } from "@mrnote/core/web/lib/presentation-table-size.ts";
import { normalizeEmbedKind, assetBackedPresentationMediaSource, EMBED_KINDS } from "@mrnote/core/web/lib/presentation-embed.ts";
import { PresentationEmbedAddressInput } from "./PresentationEmbedAddressInput";
import { PresentationVideoFormatFields } from "./PresentationVideoFormatMenus";
import type {
  PresentationEmbedBlock,
  PresentationBlock,
  PresentationChartBlock,
  PresentationTableBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { videoAdjustEditable, withVideoCorrections, withVideoRecolor } from "../../../../lib/presentation-video-format";
import {
  normalizeBlockAnimation,
  BLOCK_ANIMATIONS,
  parseSlideLinkTarget,
  buildSlideLinkHref,
  sanitizeBlockHref,
} from "@mrnote/core/web/lib/presentation-block-fx.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { PresentationTaskPaneDock } from "../../../../lib/presentation/presentationTaskPaneDock";
import type { TableAxisSelectionRange } from "@mrnote/core/web/lib/presentation-table-selection.ts";
import { useEffect, useRef } from "react";
import {
  OfficeShapeFormatPaneSections,
  revealOfficeShapeFormatPaneSection,
} from "@mrnote/core/web/components/office-ribbon/OfficeShapeFormatPane.tsx";
import { officeEffectsPaneSections } from "@mrnote/core/web/components/office-ribbon/officeEffectsPaneSections.tsx";
import type { OFFICE_GLOW_ACCENTS, OfficePictureEffectKind, OfficePictureEffectValues } from "@mrnote/core/web/lib/office-picture-effects.ts";
import { presentationPictureEffectsBlocker } from "../../../../lib/presentation-picture-effects";
import { presentationEffectsPaneLabels } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEffectsLabels.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationBlockInspectorCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  formatPaneOpen: boolean;
  setFormatPaneOpen: Dispatch<SetStateAction<boolean>>;
  slides: SlideModel[];
  blockHrefDraft: { blockId: string; text: string; } | null;
  setBlockHrefDraft: Dispatch<SetStateAction<{ blockId: string; text: string; } | null>>;
  tableCellFocus: { blockId: string; row: number; col: number; } | null;
  slidesRef: RefObject<SlideModel[]>;
  deckSlideIds: Set<string>;
  inspectorBlock: PresentationTableBlock | PresentationChartBlock | PresentationEmbedBlock;
  taskPaneDock: PresentationTaskPaneDock;
  taskPaneTabsLabel: string;
  formatPaneInFront: boolean;
  renderInspectorGeometry: (block: PresentationBlock) => ReactNode;
  deleteBlock: (blockId: string) => void;
  updateEmbedBlock: (blockId: string, patch: Partial<PresentationEmbedBlock>) => void;
  updateBlockAnimation: (blockId: string, value: string) => void;
  updateBlockHref: (blockId: string, value: string, tooltip?: string | null) => void;
  appendTableRowToBlock: (blockId: string) => void;
  appendTableColumnToBlock: (blockId: string) => void;
  deleteLastTableRowFromBlock: (blockId: string) => void;
  deleteLastTableColumnFromBlock: (blockId: string) => void;
  updateTableCellStyle: (blockId: string, rowIndex: number, cellIndex: number, patch: Partial<CellStyleInput> | ((position: TableBorderSelectionPosition, style: ResolvedCellStyle) => Partial<CellStyleInput>)) => void;
  updateTableFlags: (blockId: string, patch: Partial<Pick<PresentationTableBlock, "borders" | "headerRow" | "bandedRows" | "totalRow" | "firstColumn" | "lastColumn" | "bandedColumns">>) => void;
  updateTableAxisSize: (blockId: string, axis: "col" | "row", index: number, size: number | null, selectionRange?: TableAxisSelectionRange | null) => void;
  distributeTableAxis: (blockId: string, axis: "col" | "row", selectionRange?: TableAxisSelectionRange | null) => void;
  openChartDataDialog: (blockId: string) => void;
  commitVideoFormat: (blockId: string, change: (block: PresentationEmbedBlock) => PresentationEmbedBlock | null) => void;
  /** Format Video > Effects: the video's `pictureEffects`, as a picture's. */
  commitPictureEffect: <K extends OfficePictureEffectKind>(blockId: string, kind: K, value: OfficePictureEffectValues[K] | null) => void;
  deckAccentColors: Readonly<Record<(typeof OFFICE_GLOW_ACCENTS)[number], string>>;
  /** The page Video Effects' 3-D Options... asked for ("effects"). */
  formatPaneRequestedTab: { readonly id: string; readonly serial: number; readonly section?: string } | null;
}

export function PresentationBlockInspector({ ctl }: { ctl: PresentationBlockInspectorCtl }) {
  const {
    t,
    formatPaneOpen,
    setFormatPaneOpen,
    slides,
    blockHrefDraft,
    setBlockHrefDraft,
    tableCellFocus,
    slidesRef,
    deckSlideIds,
    inspectorBlock,
    taskPaneDock,
    taskPaneTabsLabel,
    formatPaneInFront,
    renderInspectorGeometry,
    deleteBlock,
    updateEmbedBlock,
    updateBlockAnimation,
    updateBlockHref,
    appendTableRowToBlock,
    appendTableColumnToBlock,
    deleteLastTableRowFromBlock,
    deleteLastTableColumnFromBlock,
    updateTableCellStyle,
    updateTableFlags,
    updateTableAxisSize,
    distributeTableAxis,
    openChartDataDialog,
    commitVideoFormat,
    commitPictureEffect,
    deckAccentColors,
    formatPaneRequestedTab,
  } = ctl;
  // Video Effects > "... Options" (Glow Options..., 3-D Options..., ...):
  // the pane opens with its Effects in view, that effect's section first, as
  // PowerPoint opens Format Video at Effects.
  const videoEffectsRef = useRef<HTMLDivElement>(null);
  const requestedEffects = formatPaneRequestedTab?.id === "effects" ? formatPaneRequestedTab.serial : null;
  const requestedSection = formatPaneRequestedTab?.id === "effects" ? formatPaneRequestedTab.section : undefined;
  useEffect(() => {
    if (requestedEffects === null) return;
    if (requestedSection && revealOfficeShapeFormatPaneSection(videoEffectsRef.current, requestedSection)) return;
    videoEffectsRef.current?.scrollIntoView?.({ block: "start" });
  }, [requestedEffects, requestedSection]);
  return (
            <div
              className={`${PRESENTATION_PANE_CHROME} presentation-window__inspector`}
              role={formatPaneInFront ? "dialog" : undefined}
              aria-modal={formatPaneInFront ? "false" : undefined}
              aria-labelledby={
                formatPaneInFront ? "presentation-block-inspector-title" : undefined
              }
              data-testid="presentation-block-inspector"
              data-open={formatPaneOpen ? "true" : "false"}
              aria-hidden={!formatPaneInFront}
              style={{ display: formatPaneInFront ? undefined : "none" }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                setFormatPaneOpen(false);
              }}
            >
              <header
                className={`presentation-window__inspector-header ${presentationChrome.taskPaneHeader}`}
              >
                <span>
                  <OfficeTaskPaneTabs
                    tabs={taskPaneDock.tabs("format")}
                    label={taskPaneTabsLabel}
                    selectedId="presentation-block-inspector-title"
                  />
                </span>
                <button
                  type="button"
                  className={dialogParts.compactButton}
                  data-tone="danger"
                  onClick={() => deleteBlock(inspectorBlock.id)}
                  data-testid="presentation-delete-block"
                >
                  <Trash2 size={13} />
                  {t("presentation.deleteBlock")}
                </button>
                <button
                  type="button"
                  className={presentationChrome.taskPaneClose}
                  onClick={() => setFormatPaneOpen(false)}
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  data-testid="presentation-block-inspector-close"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>
              {renderInspectorGeometry(inspectorBlock)}
              {inspectorBlock.type === "chart" && inspectorBlock.chartV2 ? (
                <button type="button" className="office-ribbon-control" data-office-control-part="button"
                  data-testid="presentation-chart-edit-data"
                  disabled={!canEditBlockContent(inspectorBlock) || !presentationChartV2CanEdit(inspectorBlock) || !presentationChartV2DataWritable(inspectorBlock)}
                  onClick={() => openChartDataDialog(inspectorBlock.id)}>
                  <Table2 size={15} aria-hidden="true" />{t("block.chart.editData")}
                </button>
              ) : null}
              {inspectorBlock.type === "table" ? (
                <>
                  <div className="presentation-window__table-actions">
                    <button
                      type="button"
                      onClick={() => appendTableRowToBlock(inspectorBlock.id)}
                      data-testid="presentation-table-add-row"
                    >
                      <Plus size={13} />
                      {t("presentation.addRow")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        appendTableColumnToBlock(inspectorBlock.id)
                      }
                      data-testid="presentation-table-add-column"
                    >
                      <Plus size={13} />
                      {t("presentation.addColumn")}
                    </button>
                    <button
                      type="button"
                      disabled={inspectorBlock.rows.length <= 1}
                      onClick={() =>
                        deleteLastTableRowFromBlock(inspectorBlock.id)
                      }
                      data-testid="presentation-table-delete-row"
                    >
                      <Trash2 size={13} />
                      {t("presentation.deleteRow")}
                    </button>
                    <button
                      type="button"
                      disabled={tableLogicalWidth(inspectorBlock.rows) <= 1}
                      onClick={() =>
                        deleteLastTableColumnFromBlock(inspectorBlock.id)
                      }
                      data-testid="presentation-table-delete-column"
                    >
                      <Trash2 size={13} />
                      {t("presentation.deleteColumn")}
                    </button>
                  </div>
                  {/* Table cell formatting (PowerPoint parity). Table-level thin
                    borders + header-row emphasis are one-bit toggles. The
                    per-cell controls apply to the most recently FOCUSED cell
                    (click a cell input to target it); every edit re-derives the
                    persisted style so a default value is dropped — an un-styled
                    table serializes byte-for-byte. */}
                  {(() => {
                    const focus =
                      tableCellFocus?.blockId === inspectorBlock.id
                        ? tableCellFocus
                        : null;
                    const focusedCell =
                      focus && inspectorBlock.rows[focus.row]?.[focus.col]
                        ? inspectorBlock.rows[focus.row][focus.col]
                        : null;
                    const focusedCellStyle = focusedCell
                      ? normalizeCellStyle(focusedCell)
                      : null;
                    return (
                      <div
                        className="presentation-window__table-style"
                        data-testid="presentation-table-style"
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 6,
                        }}
                      >
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.borders === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                borders: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-borders"
                          />
                          {t("presentation.tableBorders")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.headerRow === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                headerRow: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-header-row"
                          />
                          {t("presentation.tableHeaderRow")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.bandedRows === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                bandedRows: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-banded-rows"
                          />
                          {t("presentation.tableBandedRows")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.totalRow === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                totalRow: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-total-row"
                          />
                          {t("presentation.tableTotalRow")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.firstColumn === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                firstColumn: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-first-column"
                          />
                          {t("presentation.tableFirstColumn")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.lastColumn === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                lastColumn: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-last-column"
                          />
                          {t("presentation.tableLastColumn")}
                        </label>
                        <label style={inspectorChipStyle}>
                          <input
                            type="checkbox"
                            checked={inspectorBlock.bandedColumns === true}
                            onChange={(event) =>
                              updateTableFlags(inspectorBlock.id, {
                                bandedColumns: event.target.checked
                                  ? true
                                  : undefined,
                              })
                            }
                            data-testid="presentation-table-banded-columns"
                          />
                          {t("presentation.tableBandedColumns")}
                        </label>
                        {focus && focusedCell ? (
                          <>
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableCellFill")}
                              <input
                                type="color"
                                value={normalizeCellColor(
                                  focusedCell.fill,
                                  "#ffffff",
                                )}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      fill: normalizeCellColor(
                                        event.target.value,
                                        undefined,
                                      ),
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-fill"
                                aria-label={t("presentation.tableCellFill")}
                              />
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableCellColor")}
                              <input
                                type="color"
                                value={normalizeCellColor(
                                  focusedCell.color,
                                  "#000000",
                                )}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      color: normalizeCellColor(
                                        event.target.value,
                                        undefined,
                                      ),
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-color"
                                aria-label={t("presentation.tableCellColor")}
                              />
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.ui.tableCell.font")}
                              <select
                                value={focusedCellStyle?.fontFamily ?? ""}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      fontFamily:
                                        event.target.value === ""
                                          ? undefined
                                          : (event.target
                                              .value as TableCellFontFamily),
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-font-family"
                                aria-label={t("presentation.ui.tableCell.fontAria")}
                              >
                                <option value="">{t("presentation.ui.tableCell.inherit")}</option>
                                {TABLE_CELL_FONT_FAMILIES.map((option) => (
                                  <option
                                    key={option.typeface}
                                    value={option.typeface}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.ui.tableCell.size")}
                              <input
                                type="number"
                                min={MIN_TABLE_CELL_FONT_SIZE}
                                max={MAX_TABLE_CELL_FONT_SIZE}
                                step={0.5}
                                value={focusedCellStyle?.fontSize ?? ""}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      fontSize: tableCellFontSizeFromInput(
                                        Number(event.target.value),
                                      ),
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-font-size"
                                aria-label={t("presentation.ui.tableCell.sizeAria")}
                                style={{ width: 64 }}
                              />
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.bold === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      bold: event.target.checked
                                        ? true
                                        : undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-bold"
                              />
                              {t("presentation.tableCellBold")}
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.italic === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      italic: event.target.checked
                                        ? true
                                        : undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-italic"
                              />
                              {t("presentation.ui.tableCell.italic")}
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.underline === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      underline: event.target.checked
                                        ? true
                                        : undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-underline"
                              />
                              {t("presentation.ui.tableCell.underline")}
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.strike === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      strike: event.target.checked
                                        ? true
                                        : undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-strike"
                              />
                              {t("presentation.ui.tableCell.strike")}
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.superscript === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      superscript: event.target.checked
                                        ? true
                                        : undefined,
                                      subscript: undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-superscript"
                              />
                              {t("presentation.ui.tableCell.superscript")}
                            </label>
                            <label style={inspectorChipStyle}>
                              <input
                                type="checkbox"
                                checked={focusedCellStyle?.subscript === true}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      superscript: undefined,
                                      subscript: event.target.checked
                                        ? true
                                        : undefined,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-subscript"
                              />
                              {t("presentation.ui.tableCell.subscript")}
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.ui.tableCell.highlight")}
                              <input
                                type="color"
                                value={focusedCellStyle?.highlight ?? "#fef08a"}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    { highlight: event.target.value },
                                  )
                                }
                                data-testid="presentation-table-cell-highlight"
                                aria-label={t("presentation.ui.tableCell.highlightColor")}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    { highlight: undefined },
                                  )
                                }
                                disabled={focusedCellStyle?.highlight === null}
                                aria-label={t("presentation.ui.tableCell.clearHighlight")}
                                data-testid="presentation-table-cell-highlight-clear"
                              >
                                ⌫
                              </button>
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableCellAlign")}
                              <select
                                value={normalizeCellAlignment(
                                  focusedCell.align,
                                )}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      align: event.target
                                        .value as CellAlignment,
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-align"
                                aria-label={t("presentation.tableCellAlign")}
                              >
                                {CELL_ALIGNMENTS.map((value) => (
                                  <option key={value} value={value}>
                                    {t(
                                      `presentation.tableAlign.${value}` as "presentation.tableAlign.left",
                                    )}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {/* VERTICAL cell alignment (top / middle / bottom),
                          mirroring the shape-text valign. The default `top` is
                          persisted as ABSENT (byte-clean) via
                          `persistedVerticalAnchor`; emitted on the `<td>` as
                          `vertical-align` by `cellStyleCss`. */}
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableCellVAlign")}
                              <select
                                value={readVerticalAnchor(focusedCell)}
                                onChange={(event) =>
                                  updateTableCellStyle(
                                    inspectorBlock.id,
                                    focus.row,
                                    focus.col,
                                    {
                                      verticalAlign: persistedVerticalAnchor(
                                        event.target.value,
                                      ),
                                    },
                                  )
                                }
                                data-testid="presentation-table-cell-valign"
                                aria-label={t("presentation.tableCellVAlign")}
                              >
                                {VERTICAL_ANCHORS.map((value) => (
                                  <option key={value} value={value}>
                                    {t(
                                      `presentation.tableVAlign.${value}` as "presentation.tableVAlign.top",
                                    )}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {/* COLUMN WIDTH / ROW HEIGHT (px) for the focused cell's
                          column / row (PowerPoint parity). Blank → auto-size.
                          Bounds enforced by `updateTableAxisSize`. */}
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableColWidthLabel")}
                              <input
                                type="number"
                                min={MIN_TABLE_AXIS_PX}
                                max={MAX_TABLE_AXIS_PX}
                                value={
                                  axisSizeAt(
                                    inspectorBlock.colWidths,
                                    focus.col,
                                  ) ?? ""
                                }
                                onChange={(event) => {
                                  const raw = event.target.value.trim();
                                  const parsed = Number.parseInt(raw, 10);
                                  updateTableAxisSize(
                                    inspectorBlock.id,
                                    "col",
                                    focus.col,
                                    raw === "" || !Number.isFinite(parsed)
                                      ? null
                                      : parsed,
                                  );
                                }}
                                style={{ width: 64 }}
                                data-testid="presentation-table-col-width"
                                aria-label={t(
                                  "presentation.tableColWidthLabel",
                                )}
                              />
                            </label>
                            <label style={inspectorChipStyle}>
                              {t("presentation.tableRowHeightLabel")}
                              <input
                                type="number"
                                min={MIN_TABLE_AXIS_PX}
                                max={MAX_TABLE_AXIS_PX}
                                value={
                                  axisSizeAt(
                                    inspectorBlock.rowHeights,
                                    focus.row,
                                  ) ?? ""
                                }
                                onChange={(event) => {
                                  const raw = event.target.value.trim();
                                  const parsed = Number.parseInt(raw, 10);
                                  updateTableAxisSize(
                                    inspectorBlock.id,
                                    "row",
                                    focus.row,
                                    raw === "" || !Number.isFinite(parsed)
                                      ? null
                                      : parsed,
                                  );
                                }}
                                style={{ width: 64 }}
                                data-testid="presentation-table-row-height"
                                aria-label={t(
                                  "presentation.tableRowHeightLabel",
                                )}
                              />
                            </label>
                            {/* DISTRIBUTE rows / columns equally (PowerPoint / WPS
                          "Distribute Rows" / "Distribute Columns"). Table-wide:
                          equalizes every row height / column width via
                          `distributeTableAxis`. */}
                            <button
                              type="button"
                              style={inspectorChipStyle}
                              onClick={() =>
                                distributeTableAxis(inspectorBlock.id, "row")
                              }
                              data-testid="presentation-table-distribute-rows"
                              title={t("presentation.tableDistributeRows")}
                              aria-label={t("presentation.tableDistributeRows")}
                            >
                              {t("presentation.tableDistributeRows")}
                            </button>
                            <button
                              type="button"
                              style={inspectorChipStyle}
                              onClick={() =>
                                distributeTableAxis(inspectorBlock.id, "col")
                              }
                              data-testid="presentation-table-distribute-cols"
                              title={t("presentation.tableDistributeColumns")}
                              aria-label={t(
                                "presentation.tableDistributeColumns",
                              )}
                            >
                              {t("presentation.tableDistributeColumns")}
                            </button>
                          </>
                        ) : (
                          <span
                            data-testid="presentation-table-cell-hint"
                            style={{ fontSize: 11, opacity: 0.7 }}
                          >
                            {t("presentation.tableCellHint")}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : null}
              {inspectorBlock.type === "embed" ? (
                <div
                  className="presentation-window__inspector-fields presentation-window__embed-fields"
                  data-testid="presentation-embed-fields"
                >
                  <select
                    value={normalizeEmbedKind(inspectorBlock.kind)}
                    onChange={(event) =>
                      updateEmbedBlock(inspectorBlock.id, {
                        kind: normalizeEmbedKind(event.target.value),
                      })
                    }
                    aria-label={t("presentation.embedKindLabel")}
                    data-testid="presentation-embed-kind"
                    disabled={
                      assetBackedPresentationMediaSource(
                        inspectorBlock as Record<string, unknown>,
                      ) !== null
                    }
                  >
                    {EMBED_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(
                          `presentation.embed.kind.${kind}` as "presentation.embed.kind.iframe",
                        )}
                      </option>
                    ))}
                  </select>
                  <PresentationEmbedAddressInput
                    kind={inspectorBlock.kind}
                    url={inspectorBlock.url}
                    placeholder={t("presentation.embedUrlPlaceholder")}
                    onCommit={(url) => updateEmbedBlock(inspectorBlock.id, { url })}
                    disabled={
                      assetBackedPresentationMediaSource(
                        inspectorBlock as Record<string, unknown>,
                      ) !== null
                    }
                  />
                  <input
                    value={inspectorBlock.title || ""}
                    onChange={(event) =>
                      updateEmbedBlock(inspectorBlock.id, {
                        title: event.target.value,
                      })
                    }
                    placeholder={t("presentation.embedTitlePlaceholder")}
                    data-testid="presentation-embed-title"
                  />
                </div>
              ) : null}
              {inspectorBlock.type === "embed" && inspectorBlock.kind === "video" ? (
                // Format Video > Video: Corrections and Color (PPT-A155).
                <PresentationVideoFormatFields
                  block={inspectorBlock as PresentationEmbedBlock}
                  disabled={!canEditBlockContent(inspectorBlock) || !videoAdjustEditable(inspectorBlock as PresentationEmbedBlock)}
                  disabledReason={
                    videoAdjustEditable(inspectorBlock as PresentationEmbedBlock)
                      ? undefined
                      : t("presentation.media.videoAdjustPreserved")
                  }
                  onCorrections={(brightness, contrast) =>
                    commitVideoFormat(inspectorBlock.id, (target) => withVideoCorrections(target, brightness, contrast))
                  }
                  onRecolor={(preset) => commitVideoFormat(inspectorBlock.id, (target) => withVideoRecolor(target, preset))}
                />
              ) : null}
              {inspectorBlock.type === "embed" && inspectorBlock.kind === "video" ? (
                // Format Video > Effects (Shadow, Reflection, Glow, Soft
                // Edges, 3-D Format, 3-D Rotation): the shared sections a
                // picture's pane shows, over the video's own `pictureEffects`
                // (the same p:spPr effects the Video Effects menu writes).
                <div
                  ref={videoEffectsRef}
                  className="presentation-window__inspector-fields"
                  data-testid="presentation-video-effects"
                >
                  <OfficeShapeFormatPaneSections
                    sections={officeEffectsPaneSections({
                      effects: (inspectorBlock as PresentationEmbedBlock).pictureEffects,
                      accentColors: deckAccentColors,
                      labels: presentationEffectsPaneLabels(t),
                      disabled:
                        !canEditBlockContent(inspectorBlock) ||
                        presentationPictureEffectsBlocker(inspectorBlock as PresentationEmbedBlock) !== null,
                      disabledReason:
                        presentationPictureEffectsBlocker(inspectorBlock as PresentationEmbedBlock) === "preserved"
                          ? t("presentation.shapeEffectsUnavailable")
                          : undefined,
                      testIdPrefix: "effects",
                      onChange: (kind, value) => commitPictureEffect(inspectorBlock.id, kind, value),
                    })}
                    labels={{
                      title: "",
                      close: t("common.close"),
                      apply: t("presentation.ui.shapeFormatPane.apply"),
                      cancel: t("common.cancel"),
                    }}
                    testIdPrefix="presentation-video-format"
                    writable={canEditBlockContent(inspectorBlock)}
                  />
                </div>
              ) : null}
              <div
                className="presentation-window__inspector-fields presentation-window__block-fx-fields"
                data-testid="presentation-block-fx-fields"
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                  }}
                >
                  {t("presentation.animationLabel")}
                  <select
                    value={normalizeBlockAnimation(inspectorBlock.animation)}
                    onChange={(event) =>
                      updateBlockAnimation(
                        inspectorBlock.id,
                        event.target.value,
                      )
                    }
                    data-testid="presentation-block-animation"
                    aria-label={t("presentation.animationLabel")}
                  >
                    {BLOCK_ANIMATIONS.map((value) => (
                      <option key={value} value={value}>
                        {t(
                          `presentation.animation.${value}` as "presentation.animation.none",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                {(() => {
                  // The block's href can be EITHER an external web/mail URL OR
                  // an internal `slide://<id>` link. The slide <select> drives
                  // the internal case (validated against existing slides); the
                  // URL <input> drives the external case. They are mutually
                  // exclusive: picking a slide sets a `slide://` href, typing a
                  // URL replaces it. The URL field hides a `slide://` value (it
                  // is not a navigable URL) so the two controls never fight.
                  const slideLinkId = parseSlideLinkTarget(
                    inspectorBlock.href,
                    deckSlideIds,
                  );
                  const externalHrefValue =
                    typeof inspectorBlock.href === "string" && !slideLinkId
                      ? inspectorBlock.href
                      : "";
                  return (
                    <>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        {t("presentation.linkSlideLabel")}
                        <select
                          value={slideLinkId ?? ""}
                          onChange={(event) => {
                            const id = event.target.value;
                            // Empty → clear; a slide id → a `slide://` href the
                            // sanitizer round-trips against the live deck.
                            updateBlockHref(
                              inspectorBlock.id,
                              id ? (buildSlideLinkHref(id) ?? "") : "",
                            );
                          }}
                          data-testid="presentation-block-slide-link"
                          aria-label={t("presentation.linkSlideLabel")}
                        >
                          <option value="">
                            {t("presentation.linkSlideNone")}
                          </option>
                          {slides.map((slide, index) => (
                            <option key={slide.id} value={slide.id}>
                              {t("presentation.linkSlideOption", {
                                index: index + 1,
                                title:
                                  slide.title.trim() ||
                                  t("presentation.untitledSlide"),
                              })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        {t("presentation.link")}
                        <input
                          type="url"
                          // The field holds what is being typed; the block
                          // takes it once it is an address the link rule
                          // accepts ("h", "https:" are on the way to one and
                          // were wiped at every key, PPT-B298). Leaving the
                          // field drops a draft that never became one.
                          value={
                            blockHrefDraft?.blockId === inspectorBlock.id
                              ? blockHrefDraft.text
                              : externalHrefValue
                          }
                          onChange={(event) => {
                            const text = event.target.value;
                            setBlockHrefDraft({ blockId: inspectorBlock.id, text });
                            if (
                              text.trim() === "" ||
                              sanitizeBlockHref(
                                text,
                                new Set(slidesRef.current.map((slide) => slide.id)),
                              )
                            ) {
                              updateBlockHref(inspectorBlock.id, text);
                            }
                          }}
                          onBlur={() => setBlockHrefDraft(null)}
                          placeholder={t("presentation.linkPlaceholder")}
                          data-testid="presentation-block-href"
                          aria-label={t("presentation.link")}
                        />
                      </label>
                    </>
                  );
                })()}
              </div>
            </div>
  );
}
