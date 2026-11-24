"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  OFFICE_CHART_HIT_EVENT,
  OFFICE_CHART_PLACE_EVENT,
  officeChartPicturePartAt,
  officeChartTextEditOfHit,
  type OfficeChartHitEventDetail,
  type OfficeChartPlaceEventDetail,
} from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import { chartWithDataLabelOverride, chartWithPlacedElement, chartWithoutSelectedElement, chartWithoutSeries, officeChartDeletedSeries } from "@mrnote/core/web/lib/office-charts/chart-elements.ts";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { selectOfficeChartAreaByKey } from "@mrnote/core/web/lib/office-charts/chart-element-keys.ts";
import { chartTakesElementLayout } from "@mrnote/core/web/lib/office-charts/chart-element-layout.ts";
import { officeChartWithTypedText } from "@mrnote/core/web/lib/office-charts/chart-element-text.ts";
import { chartAutomaticTitleText, chartWithAutomaticTitle } from "@mrnote/core/web/lib/office-charts/chart-automatic-title.ts";
import {
  beginOfficeChartTextEdit,
  endOfficeChartTextEdit,
  isOfficeChartTitlePart,
  officeChartTextEditOf,
  type OfficeChartEditablePart,
} from "@mrnote/core/web/lib/office-charts/chart-text-edit-store.ts";
import type { ChartTextPart } from "@mrnote/core/web/lib/engine-host/charts-types.ts";
import { officeChartAreaPart, officeChartAxisRole } from "@mrnote/core/web/lib/office-charts/chart-hit.ts";
import {
  officeChartHostKey,
  officeChartSelectedArea,
  officeChartSelectionDetail,
  setOfficeChartSelectedArea,
  useOfficeChartSelectedArea,
} from "@mrnote/core/web/lib/office-charts/chart-selection-store.ts";
import { MAX_CHART_TEXT_CHARS } from "@mrnote/core/web/lib/office-charts/chart-limits.generated.ts";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import {
  combineTransactionSteps,
  getChangedRanges,
  mergeAttributes,
  Node,
  type Editor,
} from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "@mrnote/core/web/components/console/editor/extensions/reactNodeViewPosition.tsx";
import { floatFlowMode, normalizeFloatAnchor } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { floatHostParagraphAnchor } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import { startFloatingDrawingDrag } from "../native-document/floatDrawingDrag";
import { moveLiveDocumentChartBy } from "@mrnote/core/web/components/console/editor/native-document/chartPlacement.ts";
import {
  beginDocumentLiveGesture,
  documentLiveTranslateTarget,
  registerDocumentLiveTarget,
} from "@mrnote/core/web/components/console/editor/native-document/documentLiveTransform.ts";
import { toggleDocumentChartPick } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import dynamic from "@mrnote/core/host/next/dynamic.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import {
  chartDataEditOrigins,
  chartFormatFollowingDataEdit,
  chartNodeAttrsOnV2,
  isChartStylePreset,
  normalizeChartBlockAttrs,
  validateChartBlockAttrsV2,
  type ChartBlockAttrsV2,
  type ChartStylePresetId,
} from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import { ChartDataWindow, chartDataWindowLabels } from "./ChartDataWindow";
import { DocumentChartWorkbookEditor } from "./DocumentChartWorkbookEditor";
import { DocumentChartWorkbookWindow } from "./DocumentChartWorkbookWindow";
import { useDocumentWorkbookPersistence } from "./DocumentWorkbookPersistence";
import { activateChartWorkbookWindow } from "@mrnote/sheets/web/lib/spreadsheet/chart-workbook-window-session.ts";
import { chartWorkbookNeedsResults, chartWorkbookWithoutSeries, importedChartWorkbook, seedDocumentChartWorkbook, sameChartWorkbookDataShape } from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbook.ts";
import { calculateDocumentChartWorkbook, subscribeChartWorkbookResults, type ChartWorkbookCalculation } from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbookCalculation.ts";
import {
  CHART_HOST_EMU_PER_PX,
  DEFAULT_DOCUMENT_CHART_SIZE,
  DOCUMENT_CHART_EX_FAMILIES,
  documentChartEditableWorkbook,
  documentChartFloatAnchor,
  documentChartHostWithWorkbook,
  documentChartLayout,
  documentChartPlanInputs,
  documentChartSize,
  documentChartParagraphAlignment,
  normalizeDocumentChartHost,
  documentChartPreserveReasons,
} from "@mrnote/core/web/components/console/editor/extensions/documentChartHost.ts";
import { chartPreset } from "@mrnote/core/web/components/console/editor/extensions/chartPresets.tsx";
import { chartPictureSeriesColors } from "@mrnote/core/web/lib/office-charts/chart-picture-client.ts";
import { useChartPicturePosted } from "@mrnote/core/web/lib/office-charts/chart-picture-board.ts";
import { documentChartPictureContent, documentChartThemeFace } from "@mrnote/core/web/lib/office-charts/document-chart-picture.ts";
import { presentationChartAreaStyleCss } from "@mrnote/core/web/lib/presentation-chart-area-style.ts";
import { officeDrawingSelectionStyles, OFFICE_DRAWING_RESIZE_HANDLES, OfficeDrawingResizeGrip } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { useDocumentChartResize } from "../native-document/useDocumentChartResize";
import { officeChartDataTable, officeChartDataTableCellEdges } from "@mrnote/core/web/lib/office-charts/data-table.ts";
import { documentThemeColorsForExport } from "@mrnote/core/web/lib/office-table-style-word.ts";
import { imeSafeAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

// ---------------------------------------------------------------------------
// The one chart canvas (client-only, fetched on first chart render)
// ---------------------------------------------------------------------------

const ChartBlockV2Canvas = dynamic(() => import("./ChartBlockV2Canvas"), {
  ssr: false,
});

/** The Office 2016 families: see `DOCUMENT_CHART_EX_FAMILIES`. */
const CHART_EX_FAMILIES = DOCUMENT_CHART_EX_FAMILIES;

/**
 * Item-level bridges used by the document Chart Design contextual ribbon.
 * They target only the exact ProseMirror NodeView returned by nodeDOM(pos), so
 * opening Edit Data or previewing a style can never leak to another chart.
 */
export const DOCUMENT_CHART_EDIT_DATA_EVENT = "mrnote:document-chart-edit-data";
export const DOCUMENT_CHART_STYLE_PREVIEW_EVENT =
  "mrnote:document-chart-style-preview";
export const DOCUMENT_CHART_LAYOUT_PREVIEW_EVENT =
  "mrnote:document-chart-layout-preview";

export interface DocumentChartStylePreviewEventDetail {
  readonly stylePreset: ChartStylePresetId | null;
}

export interface DocumentChartLayoutPreviewEventDetail {
  readonly attrs: ChartBlockAttrsV2 | null;
}

export interface DocumentChartEditDataEventDetail {
  readonly returnFocus: HTMLElement;
  readonly chartPosition: number;
  readonly chartNode: ProseMirrorNode;
}

export { ChartDataGrid } from "./ChartDataGrid";
export type { ChartDataGridLabels, ChartDataGridProps } from "./ChartDataGrid";


/** `window.__docsWordChartBlockMarginOff = true` asks the older reading (an
 * imported block chart stands 8 px apart like an inserted one), for an A/B
 * of one build. */
function wordChartBlockMarginOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsWordChartBlockMarginOff?: boolean}).__docsWordChartBlockMarginOff === true;
}

function ChartBlockDataTable({
  attrs,
  label,
  pictureKey,
}: {
  attrs: ChartBlockAttrsV2;
  label: string;
  /** The content key of the canvas's picture, so the keys match its series. */
  pictureKey: string;
}) {
  const table = officeChartDataTable(attrs);
  // A row's legend key is the colour the chart's picture paints that series
  // (a Change Colors pick, a stated series fill, the style's palette), as the
  // server's chart engine answered it; grey until the chart is drawn.
  const picture = useChartPicturePosted(table ? pictureKey : null);
  if (!table) return null;
  const keyColors = picture ? chartPictureSeriesColors(picture, table.series.map((series) => series.name)) : [];
  const preset = chartPreset(attrs.stylePreset);
  // Format Data Table ▸ Table Borders: the inner lines and the outline.
  const rule = "1px solid #cbd5e1";
  const rows = table.series.length + 1;
  const columns = table.categories.length + 1;
  // Each cell draws its right and bottom edge, the table its top and left
  // (the outline): the last column's right and the last row's bottom are the
  
  const edges = (row: number, column: number) => {
    const drawn = officeChartDataTableCellEdges(table.borders, row, column, rows, columns);
    return { borderRight: drawn.right ? rule : "none", borderBottom: drawn.bottom ? rule : "none" };
  };
  const cellStyle = {
    padding: "4px 6px",
    minWidth: 64,
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as const;
  return (
    <div
      data-testid="chart-block-data-table"
      style={{ overflowX: "auto", marginTop: 6 }}
    >
      <table
        aria-label={label}
        style={{
          width: "max-content",
          minWidth: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          borderTop: table.borders?.outline === false ? "none" : rule,
          borderLeft: table.borders?.outline === false ? "none" : rule,
          color: "#334155",
          fontSize: 11,
          lineHeight: 1.25,
          tableLayout: "fixed",
          ...presentationChartAreaStyleCss(attrs.format?.dataTableStyle),
        }}
      >
        <thead>
          <tr>
            <th scope="col" style={{ ...cellStyle, ...edges(0, 0), minWidth: 112 }} />
            {table.categories.map((category, index) => (
              <th
                key={`${index}:${category}`}
                scope="col"
                style={{ ...cellStyle, ...edges(0, index + 1), background: "#f8fafc" }}
                title={category}
              >
                {category}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.series.map((series, seriesIndex) => (
            <tr key={`${seriesIndex}:${series.name}`}>
              <th
                scope="row"
                style={{
                  ...cellStyle,
                  ...edges(seriesIndex + 1, 0),
                  minWidth: 112,
                  background: "#f8fafc",
                  fontWeight: 500,
                  textAlign: "left",
                }}
                title={series.name}
              >
                {table.legendKeys ? (
                  <span
                    aria-hidden="true"
                    data-testid="chart-block-data-table-legend-key"
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      marginRight: 5,
                      borderRadius: 2,
                      background:
                        keyColors[seriesIndex] ??
                        preset.palette[seriesIndex % preset.palette.length],
                    }}
                  />
                ) : null}
                {series.name}
              </th>
              {series.values.map((value, valueIndex) => (
                <td
                  key={valueIndex}
                  style={{ ...cellStyle, ...edges(seriesIndex + 1, valueIndex + 1), textAlign: "right" }}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node view
// ---------------------------------------------------------------------------

export function ChartBlockView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor, getPos, node, selected, updateAttributes } = props;
  // The chart element Current Selection names (a click on its title, legend,
  // an axis, its labels or data labels; the Format pane's pick), by the key
  // the toolbar and this node share: the editor's and the node's place.
  const chartSelectionKey = `${officeChartHostKey(editor)}${
    typeof node.attrs.block_id === "string" && node.attrs.block_id ? node.attrs.block_id : String(getPos() ?? "")
  }`;
  const chartSelectedArea = useOfficeChartSelectedArea(selected ? chartSelectionKey : null);
  const rawAttrs = node.attrs as {
    schemaVersion?: unknown;
    chartType?: unknown;
    chartSubtype?: unknown;
    title?: unknown;
    categories?: unknown;
    series?: unknown;
    data?: unknown;
    stylePreset?: unknown;
    format?: unknown;
    documentChart?: unknown;
    textAlign?: unknown;
    floatAnchor?: unknown;
    source?: unknown;
  };
  const normalized = useMemo(() => normalizeChartBlockAttrs(rawAttrs), [rawAttrs]);
  let hostSize: ReturnType<typeof documentChartSize>;
  let hostLayout: ReturnType<typeof documentChartLayout> = { mode: "inline" };
  try { hostSize = documentChartSize(rawAttrs); } catch { hostSize = undefined; }
  try { hostLayout = documentChartLayout(rawAttrs); } catch { hostLayout = { mode: "inline" }; }
  const paragraphAlignment = documentChartParagraphAlignment(rawAttrs);
  // Word "In Line with Text" chart (`inlineChart`): a glyph of its text line.
  // Paragraph alignment and floating placement belong to the host paragraph /
  // the block node, never to the run.
  const inlinePlacement = node.type.isInline;
  // A Word chart "In Line with Text" alone on a single-spaced line, handed
  // over as a block of its own: Word's line is the chart's own height (a
  // picture's line takes no descent, documentAutoLineSpacing), so the block
  // takes none of the 8 px a chart inserted here stands apart by (corpus
  // R287-D06: three such charts, a page each, 6 pt a chart too far apart).
  // On a line grid the line is whole slots (note-editor.css).
  const wordLineBlock = !inlinePlacement && !wordChartBlockMarginOff() &&
    (rawAttrs.source as { adapter?: unknown } | null | undefined)?.adapter === "docx" &&
    hostLayout.mode !== "floating";
  // A floating chart (`wp:anchor`) is placed on its page by the float pass
  // that places a floating picture (`floatingTextBoxLayout`): the wrapper
  // publishes the anchor and that pass owns its position, float and margins.
  const floatAnchor = inlinePlacement ? null : documentChartFloatAnchor(rawAttrs);
  // Every chart is drawn, edited and exported on the one chart model. A V1
  // node the editor has not lifted yet (see `liftChartNodesOntoV2`) is read
  // through the same converter, never drawn by a second renderer.
  const attrsV2 = normalized.attrs;
  const title = attrsV2.title;

  const editorWindowId = useId();
  const workbookPersistence=useDocumentWorkbookPersistence();
  const [editing, setEditing] = useState(false);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  // Show Data Table draws the table inside the chart area, as Office does:
  // the plot gives up the table's height, and the chart keeps its size
  
  const [dataTableHeight, setDataTableHeight] = useState(0);
  const dataTableObserverRef = useRef<ResizeObserver | null>(null);
  const observeDataTable = useCallback((element: HTMLDivElement | null) => {
    dataTableObserverRef.current?.disconnect();
    dataTableObserverRef.current = null;
    if (!element) {
      setDataTableHeight(0);
      return;
    }
    const measure = () => setDataTableHeight(element.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    dataTableObserverRef.current = observer;
  }, []);
  useEffect(() => {
    const syncTextEditing = () => {
      const pos = getPos();
      if (!(editor.state.selection instanceof NodeSelection) || editor.state.selection.from !== pos) {
        // The chart lost the selection: the words typed are kept, as a click
        // outside keeps them.
        endOfficeChartTextEdit(chartSelectionKeyRef.current);
      }
    };
    editor.on("selectionUpdate", syncTextEditing);
    return () => { editor.off("selectionUpdate", syncTextEditing); };
  }, [editor, getPos]);
  const workbookErrorRef=useRef<string|null>(null);
  const setWorkbookError=useCallback((error:string|null)=>{workbookErrorRef.current=error;},[]);
  // A Word chart drawn from the preserve-only reading takes no edit
  // (`source.preserveReasons`): its part keeps what the model has no words
  // for, and the save declines every change to it, as the deck's does.
  const preserved = documentChartPreserveReasons(rawAttrs.source) !== null;
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable && !preserved,
  );
  const [previewStylePreset, setPreviewStylePreset] =
    useState<ChartStylePresetId | null>(null);
  const [previewLayoutAttrs, setPreviewLayoutAttrs] =
    useState<ChartBlockAttrsV2 | null>(null);
  const nodeViewRef = useRef<HTMLDivElement>(null);
  const beginResize = useDocumentChartResize(props, nodeViewRef, editable);
  // A floating chart dragged by its chart area moves on its page, as Word
  // moves it: the anchor's offsets on the same origins (`chartPlacement`).
  // A press on an element (title, legend, plot) is that element's.
  const beginFloatMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wrapper = nodeViewRef.current;
    if (!wrapper || !floatAnchor || !selected || !editable) return;
    if (officeChartPicturePartAt(wrapper, event.clientX, event.clientY) !== null) return;
    if ((event.target as Element | null)?.closest?.("[data-document-selection-chrome]")) return;
    const pos = getPos();
    startFloatingDrawingDrag(
      event.nativeEvent,
      wrapper,
      (dx, dy) => {
        moveLiveDocumentChartBy(editor, wrapper, dx, dy);
      },
      typeof pos === "number" ? beginDocumentLiveGesture(editor.view, [pos]) : null,
    );
  };
  // Another member dragging this floating chart: it follows their hand here
  // (documentLiveTransform), drawn as this desk's own drag draws it.
  useEffect(() => {
    const wrapper = nodeViewRef.current;
    if (!wrapper) return;
    return registerDocumentLiveTarget(wrapper, documentLiveTranslateTarget(wrapper));
  }, []);

  const dataEditorReturnFocusRef = useRef<HTMLElement | null>(null);
  const dataEditorTargetPosRef = useRef<number | null>(null);
  const incomingAttrsRef = useRef(node.attrs);
  const latestV2AttrsRef = useRef(attrsV2);
  useEffect(() => {
    if (incomingAttrsRef.current !== node.attrs) {
      incomingAttrsRef.current = node.attrs;
      latestV2AttrsRef.current = attrsV2;
    }
  }, [attrsV2, node.attrs]);

  const openDataEditor = useCallback(
    (opener: HTMLElement | null) => {
      const position = getPos();
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        typeof position !== "number" ||
        editor.state.doc.nodeAt(position)?.type !== node.type ||
        documentChartPreserveReasons(node.attrs.source) !== null ||
        // An imported Office 2016 chart opens only when its own part seeds a
        // grid that reads back as the numbers that part holds. Imported classic
        // charts keep their own editor, which their writer rebuilds from
        // complete attrs.
        (Boolean(node.attrs.source) &&
          CHART_EX_FAMILIES.has(attrsV2.chartType) &&
          !importedChartWorkbook(attrsV2))
      ) {
        return;
      }
      dataEditorReturnFocusRef.current = opener?.isConnected ? opener : null;
      dataEditorTargetPosRef.current = position;
      if(activateChartWorkbookWindow(editorWindowId))return;
      workbookErrorRef.current=null;
      setEditing(true);
    },
    [editor, getPos, editorWindowId, node.attrs.source, attrsV2],
  );

  const closeDataEditor = useCallback(() => {
    const returnFocus = dataEditorReturnFocusRef.current;
    const targetPosition = dataEditorTargetPosRef.current;
    const stableTestId = returnFocus?.dataset.testid;
    dataEditorReturnFocusRef.current = null;
    dataEditorTargetPosRef.current = null;
    const restoreTargetSelection = () => {
      if (
        editor.isDestroyed ||
        typeof targetPosition !== "number" ||
        editor.state.doc.nodeAt(targetPosition)?.type !== node.type ||
        (editor.state.selection instanceof NodeSelection &&
          editor.state.selection.from === targetPosition)
      ) {
        return;
      }
      editor.view.dispatch(
        editor.state.tr
          .setSelection(NodeSelection.create(editor.state.doc, targetPosition))
          .setMeta("addToHistory", false),
      );
    };
    const resolveReturnFocus = () => {
      if (
        returnFocus?.isConnected &&
        !(returnFocus instanceof HTMLButtonElement && returnFocus.disabled)
      ) {
        return returnFocus;
      }
      const replacementFocus = stableTestId
        ? Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid]"),
          ).find((element) => element.dataset.testid === stableTestId)
        : null;
      if (
        replacementFocus?.isConnected &&
        !(
          replacementFocus instanceof HTMLButtonElement &&
          replacementFocus.disabled
        )
      ) {
        return replacementFocus;
      }
      return null;
    };
    const focusReturnDestination = () => {
      const focusTarget = resolveReturnFocus();
      if (focusTarget) {
        focusTarget.focus({ preventScroll: true });
        restoreTargetSelection();
        if (document.activeElement === focusTarget) return;
      }
      if (editor.isDestroyed) return;
      restoreTargetSelection();
      try {
        editor.view.focus();
      } catch {
        editor.view.dom.focus({ preventScroll: true });
      }
      restoreTargetSelection();
    };

    // Move focus out of the portal while its active control is still mounted.
    // Unmounting first briefly focuses the page boundary, which ProseMirror can
    // interpret as a TextSelection inside the block-only page container.
    focusReturnDestination();
    setEditing(false);

    const focusAfterClose = () => {
      const focusTarget = resolveReturnFocus();
      if (focusTarget && document.activeElement === focusTarget) {
        restoreTargetSelection();
        return;
      }
      focusReturnDestination();
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusAfterClose);
    } else {
      window.setTimeout(focusAfterClose, 0);
    }
  }, [editor]);

  useEffect(() => {
    const syncEditable = () => {
      const next = !editor.isDestroyed && editor.isEditable && !preserved;
      setEditable(next);
      if (!next && editing) closeDataEditor();
    };
    editor.on("update", syncEditable);
    editor.on("transaction", syncEditable);
    return () => {
      editor.off("update", syncEditable);
      editor.off("transaction", syncEditable);
    };
    // A chart that becomes preserved (or stops being) is read again at once.
  }, [closeDataEditor, editing, editor, preserved]);

  const restoreChartFocus = useCallback(() => {
    if (editor.isDestroyed) return;
    const focusEditor = () => {
      if (!editor.isDestroyed) editor.view.focus();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusEditor);
    } else {
      window.setTimeout(focusEditor, 0);
    }
  }, [editor]);

  // A title or an axis title typed in place: the caret where the click
  // landed, Enter a new line, the runs keeping their format; the words are
  // written when the edit ends (a click outside, Esc).
  const latestTextEdit = useRef({ attrsV2, updateAttributes, restoreChartFocus });
  latestTextEdit.current = { attrsV2, updateAttributes, restoreChartFocus };
  const chartSelectionKeyRef = useRef(chartSelectionKey);
  chartSelectionKeyRef.current = chartSelectionKey;
  const beginTextEdit = useCallback((kind: OfficeChartEditablePart, at?: { clientX: number; clientY: number }) => {
    const label = /^label:(\d+):(\d+)$/.exec(kind);
    if (label) {
      // One data label typed in place: its own words (a static label).
      const target = { seriesIndex: Number(label[1]), pointIndex: Number(label[2]) };
      beginOfficeChartTextEdit(chartSelectionKeyRef.current, {
        part: kind as `label:${number}:${number}`,
        at,
        label: t("spreadsheet.chartDataLabels"),
        testId: "chart-block-label-input",
        onFinish: (commit, value) => {
          const latest = latestTextEdit.current;
          const words = value.text.trim();
          const next = commit
            ? chartWithDataLabelOverride(latest.attrsV2, target, { text: words ? words.slice(0, MAX_CHART_TEXT_CHARS) : undefined })
            : null;
          if (next) latest.updateAttributes({ format: next.format ?? null });
          latest.restoreChartFocus();
        },
      });
      return;
    }
    if (!isOfficeChartTitlePart(kind)) return;
    const current = latestTextEdit.current.attrsV2;
    // Office's automatic title is typed over like any title: its words become
    // the chart's own once they are changed.
    const automatic = kind === "title" ? chartAutomaticTitleText(current, t("presentation.ui.chart.defaultChartTitle")) : "";
    const words = kind === "title" ? current.title || automatic : kind === "axisX" ? current.axisTitleX : current.axisTitleY;
    if (!words) return;
    beginOfficeChartTextEdit(chartSelectionKeyRef.current, {
      part: kind,
      at,
      label:
        kind === "title"
          ? t("block.chart.titleLabel")
          : kind === "axisX"
            ? t("presentation.chartAxisTitleX")
            : t("presentation.chartAxisTitleY"),
      testId: kind === "title" ? "chart-block-title-input" : `chart-block-axis-title-${kind === "axisX" ? "x" : "y"}-input`,
      onFinish: (commit, value) => {
        const latest = latestTextEdit.current;
        const typedOver = automatic && !latest.attrsV2.title ? { ...latest.attrsV2, title: automatic } : latest.attrsV2;
        const next = commit ? officeChartWithTypedText(typedOver, kind, value) : null;
        if (next) {
          const { automaticTitle: _automatic, ...ownFormat } = latest.attrsV2.format ?? {};
          latest.updateAttributes(
            kind === "title"
              ? {
                  title: next.title,
                  titleRuns: next.titleRuns ?? null,
                  ...(latest.attrsV2.format?.automaticTitle ? { format: Object.keys(ownFormat).length ? ownFormat : null } : {}),
                }
              : kind === "axisX"
                ? { axisTitleX: next.axisTitleX }
                : { axisTitleY: next.axisTitleY },
          );
        }
        latest.restoreChartFocus();
      },
    });
  }, [t]);
  // A click on the title already selected types in it, as Office's second
  // click does (the chart's picture reports it as `again`).
  useEffect(() => {
    const nodeView = nodeViewRef.current;
    if (!nodeView || !selected || !editable) return;
    const onHit = (event: Event) => {
      const detail = (event as CustomEvent<OfficeChartHitEventDetail>).detail;
      if (!detail || detail.open) return;
      const part = officeChartTextEditOfHit(detail);
      if (!part || officeChartTextEditOf(chartSelectionKeyRef.current)?.part === part) return;
      beginTextEdit(part, detail.at);
    };
    nodeView.addEventListener(OFFICE_CHART_HIT_EVENT, onHit);
    // An element dragged (sized) by hand keeps its place (`c:manualLayout`).
    const onPlace = (event: Event) => {
      const detail = (event as CustomEvent<OfficeChartPlaceEventDetail>).detail;
      if (!detail) return;
      const latest = latestTextEdit.current;
      const next = chartWithPlacedElement(latest.attrsV2, detail.part, detail.box, detail);
      if (next) latest.updateAttributes({ format: next.format ?? null });
    };
    nodeView.addEventListener(OFFICE_CHART_PLACE_EVENT, onPlace);
    // F2 on a selected title (the node's shortcut): every character selected.
    const onEditRequest = (event: Event) => {
      const kind = (event as CustomEvent<ChartTextPart>).detail;
      if (kind === "title" || kind === "axisX" || kind === "axisY") beginTextEdit(kind);
    };
    nodeView.addEventListener(CHART_TEXT_EDIT_REQUEST_EVENT, onEditRequest);
    // Delete on a selected series the chart cannot give up (the node's
    // shortcut): why, rather than nothing.
    const onDeleteRefused = (event: Event) => {
      const reason = (event as CustomEvent<ChartDeleteRefusal>).detail;
      toast({
        variant: "destructive",
        title: t(reason === "lastSeries" ? "toolbar.chartDeleteSeries.lastSeries" : "toolbar.chartDeleteSeries.unavailable"),
      });
    };
    nodeView.addEventListener(CHART_DELETE_REFUSED_EVENT, onDeleteRefused);
    return () => {
      nodeView.removeEventListener(OFFICE_CHART_HIT_EVENT, onHit);
      nodeView.removeEventListener(OFFICE_CHART_PLACE_EVENT, onPlace);
      nodeView.removeEventListener(CHART_TEXT_EDIT_REQUEST_EVENT, onEditRequest);
      nodeView.removeEventListener(CHART_DELETE_REFUSED_EVENT, onDeleteRefused);
    };
  }, [beginTextEdit, editable, selected, t]);

  useEffect(() => {
    const nodeView = nodeViewRef.current;
    if (!nodeView) return;

    const openDataEditorFromRibbon = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object") return;
      const request = detail as Partial<DocumentChartEditDataEventDetail>;
      const position = getPos();
      if (
        typeof position !== "number" ||
        request.chartPosition !== position ||
        request.chartNode !== editor.state.doc.nodeAt(position) ||
        !(request.returnFocus instanceof HTMLElement)
      ) {
        return;
      }
      openDataEditor(request.returnFocus);
    };
    const previewStyle = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const requested =
        detail && typeof detail === "object" && "stylePreset" in detail
          ? (detail as { stylePreset?: unknown }).stylePreset
          : null;
      setPreviewStylePreset(
        requested === null || isChartStylePreset(requested) ? requested : null,
      );
    };
    const previewLayout = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const requested =
        detail && typeof detail === "object" && "attrs" in detail
          ? (detail as { attrs?: unknown }).attrs
          : null;
      setPreviewLayoutAttrs(
        requested === null || validateChartBlockAttrsV2(requested).valid
          ? (requested as ChartBlockAttrsV2 | null)
          : null,
      );
    };

    nodeView.addEventListener(
      DOCUMENT_CHART_EDIT_DATA_EVENT,
      openDataEditorFromRibbon,
    );
    nodeView.addEventListener(DOCUMENT_CHART_STYLE_PREVIEW_EVENT, previewStyle);
    nodeView.addEventListener(
      DOCUMENT_CHART_LAYOUT_PREVIEW_EVENT,
      previewLayout,
    );
    return () => {
      nodeView.removeEventListener(
        DOCUMENT_CHART_EDIT_DATA_EVENT,
        openDataEditorFromRibbon,
      );
      nodeView.removeEventListener(
        DOCUMENT_CHART_STYLE_PREVIEW_EVENT,
        previewStyle,
      );
      nodeView.removeEventListener(
        DOCUMENT_CHART_LAYOUT_PREVIEW_EVENT,
        previewLayout,
      );
    };
  }, [editor, getPos, openDataEditor]);

  useEffect(() => {
    if (!editing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if(document.getElementById(`chart-workbook-session-${editorWindowId}`))return;
      if (event.key !== "Escape" || event.defaultPrevented || workbookErrorRef.current) return;
      event.preventDefault();
      closeDataEditor();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDataEditor, editing, editorWindowId]);

  const baseRenderedAttrsV2 = previewLayoutAttrs ?? attrsV2;
  const renderedAttrsV2 =
    previewStylePreset === null
      ? baseRenderedAttrsV2
      : { ...baseRenderedAttrsV2, stylePreset: previewStylePreset };
  // Selection chrome must not remove native titles/recalculate the plot grid.
  // Office's automatic title is drawn in the reader's language.
  const automaticTitleWord = t("presentation.ui.chart.defaultChartTitle");
  const canvasAttrsV2 = useMemo(
    () => chartWithAutomaticTitle(renderedAttrsV2, automaticTitleWord),
    [renderedAttrsV2, automaticTitleWord],
  );
  // What the one planner draws this chart with, read where the offline HTML
  // export reads it (`documentChartPlanInputs`): the look an imported Office
  // 2016 chart's style and colour parts give it (a preset preview is drawn
  // without it), the document theme a Change Colors palette resolves against
  // (the one Word draws the file's `accentN` in), the sheet's number format.
  const documentThemeKey = JSON.stringify(
    documentThemeColorsForExport(
      editor.isDestroyed ? undefined : editor.state?.doc?.attrs,
    ),
  );
  const basePlanInputs = useMemo(
    () =>
      documentChartPlanInputs(node.attrs as Record<string, unknown>, {
        // The resolved theme, handed back as the theme the document states.
        documentThemeColors: JSON.parse(documentThemeKey) as unknown,
      }),
    [node.attrs, documentThemeKey],
  );
  const planInputs = useMemo(
    () =>
      previewStylePreset === null
        ? basePlanInputs
        : { ...basePlanInputs, nativeLook: undefined },
    [basePlanInputs, previewStylePreset],
  );
  const nativeLook = planInputs.nativeLook;
  const documentAccents = planInputs.themeAccents;
  const themeFontFamily = documentChartThemeFace(editor.isDestroyed ? undefined : editor.state?.doc?.attrs?.documentDesign);
  // Only a Pie of Pie / Bar of Pie draws the word; other charts keep their
  // drawing across a locale change.
  const otherSliceLabel =
    canvasAttrsV2.chartSubtype === "pieOfPie" || canvasAttrsV2.chartSubtype === "barOfPie"
      ? t("office.chart.otherSlice")
      : undefined;
  // The canvas's picture, by its content key (the data table reads its colours).
  const pictureKey = useMemo(
    () =>
      documentChartPictureContent({
        attrs: canvasAttrsV2,
        nativeLook,
        themeAccents: documentAccents,
        linkedValueNumberFormat: planInputs.linkedValueNumberFormat,
        otherSliceLabel,
        themeFontFamily,
      }).contentKey,
    [canvasAttrsV2, nativeLook, documentAccents, planInputs.linkedValueNumberFormat, otherSliceLabel, themeFontFamily],
  );

  const persistV2 = useCallback(
    (patch: Partial<ChartBlockAttrsV2>) => {
      // Spreadsheet inputs can emit multiple changes before TipTap supplies a
      // replacement node prop. Merge each change into the latest local V2
      // snapshot so a following cell edit cannot restore the previous title
      // (or vice versa).
      const next: ChartBlockAttrsV2 = {
        ...latestV2AttrsRef.current,
        ...patch,
      };
      const position = getPos();
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        typeof position !== "number" ||
        documentChartPreserveReasons(editor.state.doc.nodeAt(position)?.attrs.source) !== null
      ) {
        return;
      }
      const currentNode = editor.state.doc.nodeAt(position);
      if (
        currentNode?.type !== node.type ||
        dataEditorTargetPosRef.current !== position
      ) {
        return;
      }
      if (
        !(editor.state.selection instanceof NodeSelection) ||
        editor.state.selection.from !== position
      ) {
        editor.view.dispatch(
          editor.state.tr
            .setSelection(NodeSelection.create(editor.state.doc, position))
            .setMeta("addToHistory", false),
        );
      }
      const selectedNode = editor.state.doc.nodeAt(position);
      if (selectedNode?.type !== node.type) return;
      let transaction = editor.state.tr.setNodeMarkup(position, undefined, {
        ...selectedNode.attrs,
        ...next,
        // A stale V1 shadow would let an old exporter silently emit the wrong
        // chart. Null forces a fail-closed legacy path while V2 exporters read
        // the discriminated `data` contract.
        categories: null,
        series: null,
      });
      transaction = transaction.setSelection(
        NodeSelection.create(transaction.doc, position),
      );
      if (!transaction.docChanged) return;
      latestV2AttrsRef.current = next;
      editor.view.dispatch(transaction);
    },
    [editor, getPos],
  );

  // An imported Office 2016 chart is edited through the grid its own part
  // seeds; an imported classic chart keeps the editor that can also add and
  // remove rows, which the classic writer rebuilds from complete attrs.
  const activeWorkbook = editing
    ? documentChartEditableWorkbook(node.attrs, attrsV2, {
        seed: seedDocumentChartWorkbook,
        imported: importedChartWorkbook,
      })
    : null;
  const commitWorkbook = (next:ChartWorkbookCalculation, options?:{settle?:boolean}):boolean => {
    const pos=getPos();
    if(editor.isDestroyed || !editor.isEditable || typeof pos!=="number" || dataEditorTargetPosRef.current!==pos)return false;
    return writeWorkbook(pos,next,options?.settle===true);
  };
  /** Writes a calculated workbook and its data onto this chart. A settle only
   * fills results in for cells already committed: no undo step of its own
   * (Undo returns to before the edit, not to the stale results). */
  const writeWorkbook = (pos:number, next:ChartWorkbookCalculation, settle:boolean):boolean => {
    const current=editor.state.doc.nodeAt(pos);
    if(current?.type!==node.type)return false;
    if(current.attrs.block_id!==node.attrs.block_id)return false;
    if (current.attrs.source) {
      // Original-package chart writes currently keep the native series shape.
      const before=normalizeChartBlockAttrs(current.attrs).attrs.data;
      if(!sameChartWorkbookDataShape(before,next.data))return false;
    }
    const documentChart=documentChartHostWithWorkbook(current.attrs,next.workbook);
    if(JSON.stringify(current.attrs.documentChart)===JSON.stringify(documentChart) && JSON.stringify(current.attrs.data)===JSON.stringify(next.data))return true;
    // The format follows its series and categories through a row or column
    // inserted or deleted in the sheet, as Select Data's does (WUA 166).
    const previous=normalizeChartBlockAttrs(current.attrs).attrs;
    const origins=previous.format ? chartDataEditOrigins(previous.data,next.data) : null;
    const format=origins ? chartFormatFollowingDataEdit(previous.format,origins.series,origins.categories) : undefined;
    const marked=editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,...previous,
      ...(origins ? {format} : {}),categories:null,series:null,documentChart,data:next.data});
    if(settle){editor.view.dispatch(marked.setMeta("addToHistory",false));return true;}
    let tr=closeHistory(marked);
    tr=tr.setSelection(NodeSelection.create(tr.doc,pos));editor.view.dispatch(tr);return true;
  };
  // A workbook committed before its formulas' results landed (the editor was
  // closed at once, a quick data edit, Undo): drawn here, its results are
  // asked for and filled in when they land. The open editor does this itself.
  const hostWorkbook=(()=>{try{return normalizeDocumentChartHost(node.attrs.documentChart)?.workbook;}catch{return undefined;}})();
  const staleWorkbook=!editing && editable && hostWorkbook && chartWorkbookNeedsResults(hostWorkbook) ? hostWorkbook : null;
  const staleWorkbookKey=staleWorkbook ? JSON.stringify(staleWorkbook) : null;
  const writeWorkbookRef=useRef(writeWorkbook);
  writeWorkbookRef.current=writeWorkbook;
  useEffect(()=>{
    if(!staleWorkbookKey)return;
    let live=true;
    const attempt=()=>{
      const pos=getPos();
      if(!live || editor.isDestroyed || !editor.isEditable || typeof pos!=="number")return;
      const current=editor.state.doc.nodeAt(pos);
      if(current?.type!==node.type)return;
      let book;
      try{book=normalizeDocumentChartHost(current.attrs.documentChart)?.workbook;}catch{return;}
      // Only the workbook this effect was started for (a newer one has its own).
      if(!book || JSON.stringify(book)!==staleWorkbookKey)return;
      let next:ChartWorkbookCalculation;
      try{next=calculateDocumentChartWorkbook(normalizeChartBlockAttrs(current.attrs).attrs,book);}catch{return;}
      if(!next.pending)writeWorkbookRef.current(pos,next,true);
    };
    const unsubscribe=subscribeChartWorkbookResults(attempt);
    attempt();
    return ()=>{live=false;unsubscribe();};
  },[staleWorkbookKey,editor,getPos,node.type]);

  return (
    <NodeViewWrapper
      ref={nodeViewRef}
      as={inlinePlacement ? "span" : "div"}
      className={`chart-block-wrapper ${officeDrawingSelectionStyles.selectedHost}`}
      data-inline-chart={inlinePlacement ? "true" : undefined}
      data-chart-word-line={wordLineBlock && !floatAnchor ? "true" : undefined}
      data-testid="chart-block"
      data-selected={selected || undefined}
      // One of its elements selected: the chart's own frame steps back.
      data-chart-element-selected={selected && chartSelectedArea ? "true" : undefined}
      data-chart-preview-layout={previewLayoutAttrs ? "on" : undefined}
      data-chart-preview-layout-json={
        previewLayoutAttrs
          ? JSON.stringify(previewLayoutAttrs.format ?? {})
          : undefined
      }
      data-chart-preview-style={previewStylePreset ?? undefined}
      data-chart-semantic-source={normalized.source}
      data-document-chart-size={hostSize ? JSON.stringify(hostSize) : undefined}
      data-document-chart-layout={floatAnchor ? "anchor" : hostLayout.mode}
      data-chart-float={floatAnchor ? "true" : undefined}
      data-float-anchor={floatAnchor ? JSON.stringify(floatAnchor) : undefined}
      // The pass may restate the mode (a both-sides wrap leaves the flow); this
      // is only the first one, never re-asserted over the pass's answer.
      data-float-mode={floatAnchor ? floatFlowMode(floatAnchor) : undefined}
      data-float-host-anchor={floatAnchor ? floatHostParagraphAnchor(rawAttrs.source) ?? undefined : undefined}
      data-chart-semantic-json={JSON.stringify(attrsV2)}
      data-chart-selection-key={chartSelectionKey}
      // A finger's double tap edits a title as a double-click does (an iPad
      
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        // Shift / Ctrl + click beside a selected shape or chart: this chart
        // joins them (Word groups a floating chart with shapes).
        const position = getPos();
        if (typeof position === "number" && editable && toggleDocumentChartPick(editor.view, position, event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (floatAnchor) beginFloatMove(event);
      }}
      onDragStart={floatAnchor ? (event: ReactMouseEvent<HTMLDivElement>) => event.preventDefault() : undefined}
      onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (isDoubleTap(event.nativeEvent, nodeViewRef)) {
          event.currentTarget.dispatchEvent(
            new MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true,
              clientX: event.clientX,
              clientY: event.clientY,
            }),
          );
        }
      }}
      onDoubleClick={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (!editable || (event.target as Element).closest("button,input,textarea,select,[contenteditable='true']")) return;
        // Only a double-click ON a title types in it (Office: "click the
        // chart title or axis title, then type"), in the chart's own drawing
        // of it, the caret where the click landed. Elsewhere it does nothing.
        const part = officeChartPicturePartAt(event.currentTarget, event.clientX, event.clientY);
        if (part !== "title" && part !== "axisX" && part !== "axisY") return;
        if (officeChartTextEditOf(chartSelectionKey)?.part === part) return;
        beginTextEdit(part, { clientX: event.clientX, clientY: event.clientY });
      }}
      style={{
        // An anchored chart's position, display, float and margins are the
        // float pass's (`applyPicturePlacement`); stating them here would
        // undo its placement on the next render.
        ...(floatAnchor ? {} : { position: "relative" as const }),
        // A chart in its own paragraph sits on a line beside a floating
        // picture: Word places it there when it fits and below the picture
        // otherwise, never over it. A block formatting context does both.
        ...(hostLayout.mode === "floating" || floatAnchor ? {} : { display: "flow-root" }),
        border: 0,
        borderRadius: 0,
        padding: 0,
        ...(floatAnchor ? {} : { margin: wordLineBlock ? 0 : "8px 0" }),
        ...(wordLineBlock && hostSize ? { "--chart-line-height": `${hostSize.heightEmu / CHART_HOST_EMU_PER_PX}px` } : {}),
        backgroundColor: renderedAttrsV2.format?.chartAreaStyle?.fill === "none"
          ? "transparent" : renderedAttrsV2.format?.chartAreaStyle?.fill ?? "#ffffff",
        ...(hostSize ? {
          boxSizing: "border-box", width: hostSize.widthEmu / CHART_HOST_EMU_PER_PX,
          height: hostSize.heightEmu / CHART_HOST_EMU_PER_PX,
          ...(floatAnchor
            ? {
                // Its rank in the page's one floating stack (Word's
                // relativeHeight), as the pass states it.
                zIndex: "var(--picture-float-rank, auto)",
              }
            : hostLayout.mode === "floating"
            ? {
                float:
                  hostLayout.wrap === "square" &&
                  hostLayout.horizontal !== "center"
                    ? hostLayout.horizontal
                    : undefined,
                margin:
                  hostLayout.horizontal === "center"
                    ? "8px auto"
                    : hostLayout.horizontal === "left"
                      ? "8px 12px 8px 0"
                      : "8px 0 8px 12px",
                zIndex:
                  hostLayout.wrap === "behindText"
                    ? -1
                    : hostLayout.wrap === "inFrontOfText"
                      ? Math.max(1, hostLayout.relativeHeight)
                      : undefined,
              }
            : {
                marginLeft: paragraphAlignment === "left" ? 0 : "auto",
                marginRight: paragraphAlignment === "right" ? 0 : "auto",
              }),
        } as const : {}),
        // Inline run: the chart box floats inside the inline-block host span
        // (`.node-inlineChart`), which then has no in-flow line box and takes
        // its bottom edge as its baseline -- Word's picture-on-baseline rule.
        ...(inlinePlacement
          ? { display: "block", float: "left", margin: 0, zIndex: undefined }
          : {}),
      }}
    >
      {selected && editable && normalized.validation.valid ? OFFICE_DRAWING_RESIZE_HANDLES.map(handle => (
        <OfficeDrawingResizeGrip key={handle} handle={handle}
          label={t(`presentation.resizeHandle.${handle}`)}
          data-testid={`document-chart-resize-${handle}`} contentEditable={false}
          data-document-selection-chrome="true"
          onPointerDown={event => beginResize(handle, event)} />
      )) : null}
      {!normalized.validation.valid ? (
        <div
          className="chart-block__invalid"
          data-testid="chart-block-v2-invalid"
          role="alert"
          style={{ color: "#b91c1c", fontSize: 13 }}
        >
          <strong>{t("block.chart.v2.invalid")}</strong>
          <ul>
            {normalized.validation.issues.slice(0, 5).map((entry, index) => (
              <li key={`${entry.path}-${entry.code}-${index}`}>
                {entry.path}: {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : typeof window !== "undefined" ? (
        <div
          ref={canvasHostRef}
          style={{
            position: "relative",
            ...(hostSize ? {height:"100%"} : {}),
          }}
        >
          <ChartBlockV2Canvas
            selectedPart={officeChartAreaPart(attrsV2, chartSelectedArea)}
            // Its title and axis titles are typed in place while selected,
            // and its elements dragged by hand.
            textEditKey={selected && editable ? chartSelectionKey : null}
            placeable={selected && editable && chartTakesElementLayout(attrsV2.chartType)}
            // Word's clicks: the first selects the chart, the next one the
            // element under the pointer; a selected chart names its elements
            // on hover.
            chartSelected={selected}
            elementTips={selected}
            // A right click names the series under it: Word's menu on a
            // series offers that series' own rows.
            contextMenuHits
            attrs={canvasAttrsV2}
            nativeLook={nativeLook}
            themeAccents={documentAccents}
            themeFontFamily={themeFontFamily}
            linkedValueNumberFormat={planInputs.linkedValueNumberFormat}
            // The title is drawn in the chart, as in Word, sized or not: a
            // chart whose host gives no size is drawn at the height Word gives
            // a chart without extents (the offline HTML's fallback too).
            heightPx={Math.max(
              40,
              (hostSize ?? DEFAULT_DOCUMENT_CHART_SIZE).heightEmu / CHART_HOST_EMU_PER_PX -
                dataTableHeight,
            )}
            widthPx={hostSize ? hostSize.widthEmu / CHART_HOST_EMU_PER_PX : undefined}
            labels={{
              loading: t("block.chart.v2.loading"),
              renderError: t("block.chart.v2.renderError"),
              threeDimensionalProjection: t(
                "block.chart.v2.threeDimensionalProjection",
              ),
              ...(otherSliceLabel ? { otherSlice: otherSliceLabel } : {}),
            }}
          />
          <div ref={observeDataTable} style={{ display: "flow-root" }}>
            <ChartBlockDataTable
              attrs={renderedAttrsV2}
              label={t("presentation.chartShowDataTable")}
              pictureKey={pictureKey}
            />
          </div>
        </div>
      ) : null}
      {editing && activeWorkbook ? (
        <DocumentChartWorkbookWindow id={editorWindowId} title={`${title || t("block.chart.editData")} — ChartData`}
          inCanvas={Boolean(nodeViewRef.current?.closest(".wm-window"))}
          hostWindowId={nodeViewRef.current?.closest<HTMLElement>(".wm-window[data-window-id]")?.dataset.windowId}
          beforeClose={()=>!workbookErrorRef.current} onClose={closeDataEditor}>
          {(windowId)=><DocumentChartWorkbookEditor attrs={attrsV2} workbook={activeWorkbook} windowId={windowId}
            persistence={workbookPersistence} preserveNativeStructure={Boolean(node.attrs.source)}
            onCommit={commitWorkbook} onUndo={()=>editor.commands.undo()} onRedo={()=>editor.commands.redo()}
            canUndo={editor.can().undo()} canRedo={editor.can().redo()} onError={setWorkbookError}/>}
        </DocumentChartWorkbookWindow>
      ) : editing ? (
        <ChartDataWindow
          windowId={editorWindowId}
          windowTitle={t("block.chart.editData")}
          closeLabel={t("block.chart.done")}
          chartType={attrsV2.chartType}
          title={title}
          data={attrsV2.data}
          issues={normalized.validation.issues}
          labels={chartDataWindowLabels(t)}
          onTitleChange={(nextTitle) => persistV2({ title: nextTitle })}
          onChange={(data) => persistV2({ data })}
          onDone={()=>{if(!workbookErrorRef.current)closeDataEditor();}}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// One chart model in the editor
// ---------------------------------------------------------------------------

/** A JSON object an attribute of a chart's HTML carries, or undefined. */
function chartJsonAttribute(
  element: HTMLElement,
  name: string,
): Record<string, unknown> | undefined {
  const raw = element.getAttribute(name);
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** `chartJsonAttribute` for an attribute whose JSON is an array (the title's runs). */
function chartJsonArrayAttribute(element: HTMLElement, name: string): unknown[] | undefined {
  const raw = element.getAttribute(name);
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lift every V1 chart node of type `typeName` in `ranges` of `state` onto the
 * one chart model (`chartNodeAttrsOnV2`), or null when there is none. The
 * lift is not an edit: it stays out of the undo history.
 */
function liftChartNodesOntoV2(
  state: EditorState,
  typeName: string,
  ranges: ReadonlyArray<{ from: number; to: number }>,
): Transaction | null {
  const tr = state.tr;
  const lifted = new Set<number>();
  for (const range of ranges) {
    state.doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (node.type.name !== typeName) return true;
      if (lifted.has(pos)) return false;
      const attrs = chartNodeAttrsOnV2(node.attrs);
      if (attrs) {
        lifted.add(pos);
        tr.setNodeMarkup(pos, undefined, attrs, node.marks);
      }
      return false;
    });
  }
  if (!tr.docChanged) return null;
  // A chart's attributes are set by replacing the node (it is a leaf), which
  // maps a selection of it to a caret beside it: a V1 chart dropped into a
  // line of text or pasted was left unselected. A lifted chart that was
  // selected stays selected.
  const { selection } = state;
  if (selection instanceof NodeSelection && lifted.has(selection.from)) {
    tr.setSelection(NodeSelection.create(tr.doc, selection.from));
  }
  return tr.setMeta("addToHistory", false);
}

/**
 * The editor never holds a V1 chart: a stored page is read onto the model
 * before it is set (`withLegacyChartsOnV2`), and a V1 chart that reaches the
 * document any other way -- initial content, a collaborator's room, a paste,
 * a command -- is lifted by the same converter in the transaction that
 * brought it.
 */
function chartModelPlugin(typeName: string): Plugin {
  return new Plugin({
    key: new PluginKey(`${typeName}OnChartModel`),
    appendTransaction: imeSafeAppendTransaction(
      (transactions, oldState, newState) => {
        // The page ledger's moves ("structuralRebalance", pageRebalanceExtension)
        // bring no chart that was not here, and a step of a long document has
        // hundreds of steps to map through one another.
        if (!transactions.some((transaction) => transaction.docChanged && transaction.getMeta("structuralRebalance") !== true)) {
          return null;
        }
        const ranges = getChangedRanges(
          combineTransactionSteps(oldState.doc, [...transactions]),
        ).map(({ newRange }) => newRange);
        return liftChartNodesOntoV2(newState, typeName, ranges);
      },
    ),
  });
}

function liftInitialChartNodes(editor: Editor, typeName: string): void {
  if (editor.isDestroyed) return;
  const tr = liftChartNodesOntoV2(editor.state, typeName, [
    { from: 0, to: editor.state.doc.content.size },
  ]);
  if (tr) editor.view.dispatch(tr.setMeta("preventUpdate", true));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/** A keyboard request to type in a selected chart title (F2), sent to its node view. */
const CHART_TEXT_EDIT_REQUEST_EVENT = "mrai-office-chart-text-edit-request";
const CHART_DELETE_REFUSED_EVENT = "mrai-office-chart-delete-refused";
type ChartDeleteRefusal = "lastSeries" | "unavailable";

/** The chart node selected, its element selection key and its model. */
function selectedChartNode(editor: Editor, name: string) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== name) return null;
  const node = selection.node;
  const key = `${officeChartHostKey(editor)}${
    typeof node.attrs.block_id === "string" && node.attrs.block_id ? node.attrs.block_id : String(selection.from)
  }`;
  const normalized = normalizeChartBlockAttrs(node.attrs);
  return normalized.validation.valid ? { pos: selection.from, node, key, attrs: normalized.attrs } : null;
}

const ChartBlock = Node.create({
  name: "chart",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addKeyboardShortcuts() {
    // An element of the selected chart selected (its title, legend, a
    // legend entry, labels): Office's Delete deletes that element, not the
    // chart; the chart area selected, Delete takes the chart as before.
    const deleteElement = () => {
      if (!this.editor.isEditable) return false;
      const chart = selectedChartNode(this.editor, this.name);
      if (!chart || documentChartPreserveReasons(chart.node.attrs.source) !== null) return false;
      // A whole series selected: it leaves the chart, as Word's Delete and
      // Select Data > Remove take it -- its cells stay in the chart's sheet,
      // outside the range the chart reads (`chartWorkbookWithoutSeries`).
      // One step, one Undo.
      const removed = officeChartDeletedSeries(
        officeChartSelectedArea(chart.key),
        officeChartSelectionDetail(chart.key),
      );
      if (removed !== null) {
        const refuse = (reason: ChartDeleteRefusal) => {
          const dom = this.editor.view.nodeDOM(chart.pos);
          const host = dom instanceof HTMLElement
            ? (dom.matches(".chart-block-wrapper") ? dom : dom.querySelector(".chart-block-wrapper"))
            : null;
          host?.dispatchEvent(new CustomEvent<ChartDeleteRefusal>(CHART_DELETE_REFUSED_EVENT, { detail: reason }));
          return true;
        };
        const next = chartWithoutSeries(chart.attrs, removed);
        if (!next) return refuse("lastSeries");
        let book;
        try {
          book = normalizeDocumentChartHost(chart.node.attrs.documentChart)?.workbook;
        } catch {
          return refuse("unavailable");
        }
        // An imported chart's sheet keeps its series as its part states them
        // (the workbook writer's rule, `writeWorkbook`).
        if (book && chart.node.attrs.source) return refuse("unavailable");
        const nextBook = book
          ? chartWorkbookWithoutSeries(book, next, removed, chart.attrs.data.kind, chart.attrs.chartSubtype)
          : undefined;
        if (nextBook === null) return refuse("unavailable");
        const { tr } = this.editor.state;
        tr.setNodeMarkup(chart.pos, undefined, {
          ...chart.node.attrs,
          ...next,
          titleRuns: next.titleRuns ?? null,
          format: next.format ?? null,
          categories: null,
          series: null,
          ...(nextBook ? { documentChart: documentChartHostWithWorkbook(chart.node.attrs, nextBook) } : {}),
        });
        this.editor.view.dispatch(tr);
        setOfficeChartSelectedArea(chart.key, null);
        return true;
      }
      const result = chartWithoutSelectedElement(
        chart.attrs,
        officeChartSelectedArea(chart.key),
        officeChartSelectionDetail(chart.key),
      );
      if (result === null) return false;
      if (result !== "keep") {
        const { tr } = this.editor.state;
        tr.setNodeMarkup(chart.pos, undefined, {
          ...chart.node.attrs,
          title: result.title,
          titleRuns: result.titleRuns ?? null,
          axisTitleX: result.axisTitleX,
          axisTitleY: result.axisTitleY,
          format: result.format ?? null,
        });
        this.editor.view.dispatch(tr);
        setOfficeChartSelectedArea(chart.key, null);
      }
      return true;
    };
    // F2 on a selected title or axis title: its words, every character selected.
    const editTitle = () => {
      const chart = selectedChartNode(this.editor, this.name);
      if (!chart || !this.editor.isEditable || documentChartPreserveReasons(chart.node.attrs.source) !== null) return false;
      const area = officeChartSelectedArea(chart.key);
      const axis = area ? /^axisTitle:(category|value)$/.exec(area) : null;
      const kind: ChartTextPart | null =
        area === "chartTitleStyle"
          ? "title"
          : axis
            ? officeChartAxisRole(chart.attrs, "X") === axis[1] ? "axisX" : "axisY"
            : null;
      const dom = this.editor.view.nodeDOM(chart.pos);
      if (!kind || !(dom instanceof HTMLElement)) return false;
      const host = dom.matches(".chart-block-wrapper") ? dom : dom.querySelector(".chart-block-wrapper");
      host?.dispatchEvent(new CustomEvent<ChartTextPart>(CHART_TEXT_EDIT_REQUEST_EVENT, { detail: kind }));
      return Boolean(host);
    };
    // An element of the selected chart selected: the arrow keys select the
    // next element (Office's chart keys never nudge an element), Esc lets
    // the element go and leaves the chart selected.
    const stepElement = (key: string) => () => {
      const chart = selectedChartNode(this.editor, this.name);
      return chart ? selectOfficeChartAreaByKey(chart.key, chart.attrs, key) : false;
    };
    return {
      Delete: deleteElement,
      Backspace: deleteElement,
      F2: editTitle,
      ArrowUp: stepElement("ArrowUp"),
      ArrowDown: stepElement("ArrowDown"),
      ArrowLeft: stepElement("ArrowLeft"),
      ArrowRight: stepElement("ArrowRight"),
      Escape: stepElement("Escape"),
    };
  },

  addAttributes() {
    return {
      textAlign: {
        default: undefined,
        parseHTML: (element) => {
          const value = element.getAttribute("data-text-align");
          return value === "left" || value === "center" || value === "right" ? value : undefined;
        },
        renderHTML: (attrs) => attrs.textAlign ? { "data-text-align": attrs.textAlign } : {},
      },
      schemaVersion: { default: 1 },
      chartType: { default: "bar" },
      chartSubtype: { default: null },
      stylePreset: { default: "classic" },
      title: { default: "" },
      // The title's runs with their own format (`chart-title-runs`), absent
      // for a title of one plain run; an object, so it travels as JSON.
      titleRuns: {
        default: undefined,
        parseHTML: (element) => chartJsonArrayAttribute(element, "data-chart-title-runs"),
        renderHTML: (attrs) =>
          attrs.titleRuns ? { "data-chart-title-runs": JSON.stringify(attrs.titleRuns) } : {},
      },
      axisTitleX: { default: undefined },
      axisTitleY: { default: undefined },
      // The chart's data and format are objects: they travel through HTML
      // (a copy's clipboard, getHTML) as JSON, never as "[object Object]".
      data: {
        default: null,
        parseHTML: (element) => chartJsonAttribute(element, "data-chart-data") ?? null,
        renderHTML: (attrs) =>
          attrs.data ? { "data-chart-data": JSON.stringify(attrs.data) } : {},
      },
      // Optional V2 attrs must stay absent on new nodes. A null default is
      // serialized by Tiptap and previously made an otherwise-valid AI/manual
      // chart fail the shared `format must be an object` contract.
      format: {
        default: undefined,
        parseHTML: (element) => chartJsonAttribute(element, "data-chart-format"),
        renderHTML: (attrs) =>
          attrs.format ? { "data-chart-format": JSON.stringify(attrs.format) } : {},
      },
      documentChart: { default: undefined, parseHTML: (element) => {
        const raw=element.getAttribute("data-document-chart");
        if (!raw) return undefined;
        try { return normalizeDocumentChartHost(JSON.parse(raw)); } catch { return undefined; }
      }, renderHTML: (attrs) => attrs.documentChart ? {"data-document-chart": JSON.stringify(normalizeDocumentChartHost(attrs.documentChart))} : {} },
      // A floating chart's `wp:anchor`, the `floatAnchor` a floating picture
      // carries (`office-float-anchor`). Absent: in line with its text.
      floatAnchor: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-chart-float-anchor");
          if (!raw) return undefined;
          try { return normalizeFloatAnchor(JSON.parse(raw)) ?? undefined; } catch { return undefined; }
        },
        renderHTML: (attrs) => {
          const anchor = normalizeFloatAnchor(attrs.floatAnchor);
          return anchor ? { "data-chart-float-anchor": JSON.stringify(anchor) } : {};
        },
      },
      // Alt Text (Word's `wp:docPr@descr` and Mark as decorative), written in
      // the Alt Text pane. Absent: the chart states none (a chart imported
      // before charts carried it keeps the file's own description).
      alt: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-chart-alt") ?? undefined,
        renderHTML: (attrs) =>
          typeof attrs.alt === "string" ? { "data-chart-alt": attrs.alt } : {},
      },
      decorative: {
        default: undefined,
        parseHTML: (element) =>
          element.getAttribute("data-chart-decorative") === "true" ? true : undefined,
        renderHTML: (attrs) =>
          attrs.decorative === true ? { "data-chart-decorative": "true" } : {},
      },
      // A V1 chart's data grid. Declared only so a V1 node that reaches the
      // editor keeps its data until it is lifted onto the model (see
      // `chartModelPlugin`); a chart in the editor always holds null here,
      // which the save strips (`withoutInactiveChartUnionAttrs`).
      categories: { default: null, rendered: false },
      series: { default: null, rendered: false },
    };
  },

  onCreate() {
    liftInitialChartNodes(this.editor, this.name);
  },

  addProseMirrorPlugins() {
    return [chartModelPlugin(this.name)];
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw=HTMLAttributes["data-document-chart"];
    const size=raw ? normalizeDocumentChartHost(JSON.parse(String(raw)))?.size : undefined;
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "chart",
      ...(size ? {style:`width:${size.widthEmu/CHART_HOST_EMU_PER_PX}px;height:${size.heightEmu/CHART_HOST_EMU_PER_PX}px;box-sizing:border-box`} : {})})];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(ChartBlockView);
  },
});

/**
 * Word inline chart (`w:r/w:drawing/wp:inline` + `c:chart`): the SAME chart
 * (identical attributes, node view and writers) as an inline atom on a text
 * line. `textAlign` stays declared so a block<->inline conversion round-trips,
 * but the run never renders it -- alignment belongs to the host paragraph.
 */
export const InlineChart = ChartBlock.extend({
  name: "inlineChart",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'span[data-type="inline-chart"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw=HTMLAttributes["data-document-chart"];
    const size=raw ? normalizeDocumentChartHost(JSON.parse(String(raw)))?.size : undefined;
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "inline-chart",
      style: `display:inline-block;vertical-align:baseline${size ? `;width:${size.widthEmu/CHART_HOST_EMU_PER_PX}px;height:${size.heightEmu/CHART_HOST_EMU_PER_PX}px;box-sizing:border-box` : ""}`})];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(ChartBlockView);
  },
});

export default ChartBlock;
