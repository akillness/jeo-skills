"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { WindowContentFallback } from "@mrnote/core/web/components/notebook/WindowContentFallback.tsx";
import dynamic from "@mrnote/core/host/next/dynamic.tsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { DocumentWorkbookPersistence } from "./DocumentWorkbookPersistence";
import type { ChartBlockAttrsV2 } from "@mrnote/core/web/components/console/editor/extensions/chartBlockShared.ts";
import {
  CHART_SINGLE_SAMPLE_COLUMN,
  CHART_VALUE_OUT_OF_RANGE,
  chartWorkbookIsStale,
  chartWorkbookNeedsResults,
  chartWorkbookRange,
  parseChartWorkbookRange,
  rebindChartWorkbookAfterEdit,
  type DocumentChartWorkbook,
  extendChartWorkbookBindingToTypedNeighbours,
  chartWorkbookData,
} from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbook.ts";
import {
  calculateDocumentChartWorkbook,
  calculateDocumentChartWorkbookSettled,
  subscribeChartWorkbookResults,
  type ChartWorkbookCalculation,
} from "@mrnote/core/web/components/console/editor/extensions/documentChartWorkbookCalculation.ts";
import styles from "./DocumentChartWorkbookEditor.module.css";

const SpreadsheetWindow = dynamic(
  () => import("@mrnote/sheets/web/components/notebook/contents/SpreadsheetWindow.tsx"),
  {
    ssr: false,
    loading: () => <WindowContentFallback kind="spreadsheet" />,
  },
);

export function DocumentChartWorkbookEditor({
  attrs,
  workbook,
  onCommit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  windowId,
  onError,
  preserveNativeStructure = false,
  persistence,
  stripExtras,
}: {
  attrs: ChartBlockAttrsV2;
  workbook: DocumentChartWorkbook;
  /**
   * The edited workbook and the chart's data read from it. A `pending` one
   * carries the cells as typed with the previous results (marked stale);
   * the editor commits the results again, with `settle`, when they land:
   * that commit only fills results in and is not an undo step of its own.
   */
  onCommit: (
    next: ChartWorkbookCalculation,
    options?: { settle?: boolean },
  ) => boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  windowId: string;
  onError: (error: string | null) => void;
  preserveNativeStructure?: boolean;
  persistence?: DocumentWorkbookPersistence | null;
  /** A host's own commands beside the data range (the deck's Hidden and
   * Empty Cells..., which PowerPoint keeps with the chart's data source). */
  stripExtras?: ReactNode;
}) {
  const t = useTranslations("console-notebooks");
  const readOnlyReason=preserveNativeStructure && attrs.data.kind==="sample"
    ? t("block.chart.workbook.statisticalViewOnly") : undefined;
  const [draft, setDraft] = useState(workbook);
  const [revision, setRevision] = useState(0);
  const [range, setRange] = useState(() => chartWorkbookRange(workbook));
  const [error, setError] = useState<string | null>(null);
  const incoming = JSON.stringify(workbook);
  const lastLocal = useRef(incoming);
  useEffect(() => {
    if (incoming === lastLocal.current) return;
    lastLocal.current = incoming;
    setDraft(workbook);
    setRange(chartWorkbookRange(workbook));
    setRevision((n) => n + 1);
    setError(null);
    onError(null);
  }, [incoming, workbook, onError]);
  const errorMessage = (caught: unknown) =>
    caught instanceof Error && caught.message === CHART_SINGLE_SAMPLE_COLUMN
      ? t("block.chart.workbook.singleColumnRequired")
      : caught instanceof Error && caught.message === CHART_VALUE_OUT_OF_RANGE
        ? t("block.chart.workbook.valueOutOfRange")
        : t("block.chart.workbook.invalidFormulaOrRange");
  // The workbook as last typed: the one whose results a landing answer fills
  // in (an answer for an older edit is never committed).
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const attrsRef = useRef(attrs);
  attrsRef.current = attrs;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const commit = (next: DocumentChartWorkbook) => {
    if(readOnlyReason)return false;
    // The range the field showed for the workbook before this edit: a field
    // the user has not retyped follows the new binding (a row inserted above
    // the data moves it), else leaving the field re-applies a stale address
    // and reports it as the user's mistake (PPT-B365).
    const shownBefore = chartWorkbookRange(draftRef.current);
    setDraft(next);
    draftRef.current = next;
    // The field follows the new binding even when this edit cannot be
    // charted yet: a row inserted inside the data is blank until it is
    // typed, and its first commit fails; the field kept the old address, the
    // next edit no longer matched it, and leaving it unchanged re-applied
    
    setRange((shown) => (shown.trim() === shownBefore ? chartWorkbookRange(next) : shown));
    try {
      // The cells commit at once; a result still on its way is filled in by
      // `settle` (the chart keeps its data until then).
      const calculated = calculateDocumentChartWorkbook(attrs, next);
      if (!onCommit(calculated)) throw Error("stale_chart");
      lastLocal.current = JSON.stringify(calculated.workbook);
      setDraft(calculated.workbook);
      draftRef.current = calculated.workbook;
      setRange((shown) =>
        shown.trim() === shownBefore || shown.trim() === chartWorkbookRange(next)
          ? chartWorkbookRange(calculated.workbook)
          : shown,
      );
      setError(null);
      onError(null);
      return true;
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      onError(message);
      return false;
    }
  };
  const errorMessageRef = useRef(errorMessage);
  errorMessageRef.current = errorMessage;
  /** The latest workbook's results, committed once they are known. */
  const settle = useCallback(() => {
    const current = draftRef.current;
    if (readOnlyReason || !chartWorkbookNeedsResults(current)) return;
    let calculated: ChartWorkbookCalculation;
    try {
      calculated = calculateDocumentChartWorkbook(attrsRef.current, current);
    } catch (caught) {
      // The answer shows the source cannot be charted (a formula error where
      // a number goes): said as any edit says it; the cells stay as typed.
      const message = errorMessageRef.current(caught);
      setError(message);
      onErrorRef.current(message);
      return;
    }
    if (calculated.pending) return;
    // A refusal here is not the user's failure: the cells are committed and
    // stay stale; the chart fills its results in when it is drawn next.
    if (!onCommitRef.current(calculated, { settle: true })) return;
    lastLocal.current = JSON.stringify(calculated.workbook);
    draftRef.current = calculated.workbook;
    setDraft(calculated.workbook);
  }, [readOnlyReason]);
  useEffect(() => {
    let live = true;
    const unsubscribe = subscribeChartWorkbookResults(() => { if (live) settle(); });
    return () => { live = false; unsubscribe(); };
  }, [settle]);
  // A workbook opened stale (the editor was closed before its answer), or
  // brought back stale by Undo: asked for (or filled in from) its results.
  useEffect(() => { settle(); }, [draft, settle]);
  const resetDraft=()=>{setDraft(workbook);setRange(chartWorkbookRange(workbook));setRevision(n=>n+1);setError(null);onError(null);};
  // The typed source range is applied on Enter AND when the field is left: a
  // click into the sheet or on Close used to drop it without a word
  // (PPT-B152). An invalid range says so and stays in the field.
  const applyRange = () => {
    if (range.trim() === chartWorkbookRange(draft)) return;
    const parsed = parseChartWorkbookRange(range);
    if (!parsed) {
      const message = t("block.chart.workbook.invalidRange");
      setError(message);
      onError(message);
      return;
    }
    const next = { ...draft, binding: { ...draft.binding, ...parsed } };
    if (commit(next)) setRange(chartWorkbookRange(next));
  };
  return (
    <div
      data-testid="document-chart-workbook-editor"
      data-theme="console"
      style={{ height: "100%", display: "flex", flexDirection: "column", fontSize:13 }}
    >
      <div className={styles.strip}>
        <label>
          {t("block.chart.workbook.chartSource")}{" "}
          <select
            disabled={Boolean(readOnlyReason)}
            aria-label={t("block.chart.workbook.sourceSheet")}
            value={draft.binding.sheetId}
            onChange={(event) =>
              commit({
                ...draft,
                binding: { ...draft.binding, sheetId: event.target.value },
              })
            }
          >
            {draft.content.sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
        <input
          readOnly={Boolean(readOnlyReason)}
          aria-label={t("block.chart.workbook.dataRange")}
          data-testid="document-chart-workbook-range"
          value={range}
          onChange={(event) => setRange(event.target.value)}
          onBlur={() => {
            if (!readOnlyReason) applyRange();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            applyRange();
          }}
        />
        {stripExtras}
        {chartWorkbookIsStale(draft) ? (
          // C4: the workbook's results are behind its cells (the server has
          // not answered yet); the chart keeps the last calculated values.
          <span role="status" data-testid="document-chart-workbook-stale">
            {t("block.chart.workbook.calculationStale")}
          </span>
        ) : null}
        {readOnlyReason ? <span role="status" className={styles.status}>{readOnlyReason}</span> : null}
        {error ? (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <SpreadsheetWindow
          pageId={`chart-workbook-${windowId}`}
          windowId={windowId}
          guestMode
          initialSpreadsheet={draft.content}
          embeddedWorkbook={{
            presentation:"full",
            saveStatus:error?"unsaved":persistence?.status ?? "unsaved",
            closeStatus:error?"unsaved":"saved",
            saveDisabledReason:!persistence?.available ? t("block.chart.workbook.saveThroughParent") : undefined,
            save:async()=>await persistence?.save()??false,
            exportXlsx:async(content)=>{
              // With the server's results; when it cannot answer, the
              // results the workbook holds.
              const calculated=await calculateDocumentChartWorkbookSettled(attrs,{...draft,content:content as DocumentChartWorkbook["content"]});
              // The .xlsx is written by the server (the chart's own workbook
              // writer); the browser holds no Excel package writer.
              const {requestServerChartWorkbookXlsx}=await import("../../../../lib/document-export/docx-server-export");
              const blob=await requestServerChartWorkbookXlsx(calculated.workbook);
              const url=URL.createObjectURL(blob);
              const link=document.createElement("a");link.href=url;link.download="ChartData.xlsx";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
            },
            readOnlyReason,
            lockStructure: preserveNativeStructure,
            maxSheets: 8,
            content: draft.content,
            revision,
            canUndo:Boolean(error)||canUndo,
            // Redo stays live while the workbook shows an error: after Undo
            // took a correction back, Redo is the way to the corrected state
            // (WUA 155: the button went grey while Cmd+Shift+Z still worked).
            canRedo,
            undo: ()=>{if(error)resetDraft();else onUndo();},
            redo: onRedo,
            onChange: (content) => {
              const next = content as DocumentChartWorkbook["content"];
              // A row or column inserted or deleted in the sheet moves the
              
              const moved = rebindChartWorkbookAfterEdit(draft, next);
              // …and a value typed directly beneath or beside it grows the
              // range onto it, as Word's chart data sheet does.
              const binding = extendChartWorkbookBindingToTypedNeighbours(draft, next, moved, (candidate) => {
                try {
                  chartWorkbookData(attrs, { ...draft, content: next, binding: candidate }, { missing: "blank" });
                  return true;
                } catch {
                  return false;
                }
              });
              return commit({ ...draft, content: next, binding });
            },
          }}
        />
      </div>
    </div>
  );
}
