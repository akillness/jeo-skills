"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { captureSavedPageHotCacheScope, isSavedPageHotCacheScopeCurrent } from "@mrnote/core/web/lib/saved-page-hot-cache.ts";
import { dispatchNotebookPagesChanged } from "@mrnote/core/web/lib/notebook-events.ts";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import type { SpreadsheetWorkbookImportResult } from "../../../../lib/spreadsheet/workbook-import-client";
import { type WorkbookImportAuthority, spreadsheetWorkbookImportFailureDescription } from "./spreadsheetWindowHelpers";
import { type Dispatch, type SetStateAction } from "react";
import { type WindowManagerActions } from "@mrnote/core/web/components/notebook/WindowManager.tsx";

/** What useSpreadsheetRunWorkbookImport reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetRunWorkbookImportInputs {
  applyImportedWorkbook: (result: SpreadsheetWorkbookImportResult) => void;
  dataQueryImportBusyRef: RefObject<number | null>;
  dataQueryImportOwnerRef: RefObject<{ pageId: string; notebookId: string; actorId: string; allowed: boolean; }>;
  liveWorkbookImportAuthorityRef: RefObject<Omit<WorkbookImportAuthority, "requestId">>;
  setOverwriteConfirm: Dispatch<SetStateAction<{ title: string; body?: string; confirmLabel?: string; cancelLabel?: string; confirmVariant?: "default" | "destructive"; onConfirm: () => void; } | null>>;
  setSpreadsheetImporting: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  windowManager: WindowManagerActions | null;
  workbookHasContent: boolean;
  workbookImportAbortRef: RefObject<AbortController | null>;
  workbookImportRequestRef: RefObject<number>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetRunWorkbookImport({
  applyImportedWorkbook,
  dataQueryImportBusyRef,
  dataQueryImportOwnerRef,
  liveWorkbookImportAuthorityRef,
  setOverwriteConfirm,
  setSpreadsheetImporting,
  t,
  windowManager,
  workbookHasContent,
  workbookImportAbortRef,
  workbookImportRequestRef,
}: SpreadsheetRunWorkbookImportInputs) {
  const runWorkbookImport = useCallback(
    async function importWorkbook(
      file: File,
      allowLossy = false,
      authority: WorkbookImportAuthority | null = null,
    ): Promise<void> {
      const importAuthority =
        authority ??
        Object.freeze({
          requestId: workbookImportRequestRef.current + 1,
          ...liveWorkbookImportAuthorityRef.current,
        });
      if (!authority) {
        workbookImportRequestRef.current = importAuthority.requestId;
      }
      const importAuthorityIsCurrent = () => {
        const live = liveWorkbookImportAuthorityRef.current;
        return (
          workbookImportRequestRef.current === importAuthority.requestId &&
          live.pageId === importAuthority.pageId &&
          live.workbook === importAuthority.workbook &&
          live.title === importAuthority.title &&
          live.referenceStyle === importAuthority.referenceStyle &&
          live.viewOptions === importAuthority.viewOptions
        );
      };
      const rejectStaleImport = () => {
        toast({
          variant: "destructive",
          title: t("spreadsheet.uiCopy.workbookChanged"),
          description: t("spreadsheet.uiCopy.theWorkbookChangedWhileTheImportWasBeingPrepared"),
        });
      };
      if (!authority) {
        // A newer file selection owns the import; the older request is
        // abandoned (its answer would be rejected as stale anyway).
        workbookImportAbortRef.current?.abort();
        workbookImportAbortRef.current = new AbortController();
      }
      const importSignal = workbookImportAbortRef.current?.signal;
      setSpreadsheetImporting(true);
      try {
        const workbookImport =
          await import("../../../../lib/spreadsheet/workbook-import-client");
        // Read on the server (the browser keeps no Excel reader). This
        // import replaces the page and keeps no package, so a workbook with
        // native charts, queries, or SmartArt only its package can carry is
        // refused and opens source-backed instead (below). The consented
        // lossy re-run reuses the answer already read.
        const result = await workbookImport.importSpreadsheetWorkbook(file, {
          allowLossy,
          signal: importSignal,
        });
        if (!importAuthorityIsCurrent()) {
          rejectStaleImport();
          return;
        }
        if (workbookHasContent && !allowLossy) {
          setOverwriteConfirm({
            title: t("spreadsheet.uiCopy.replaceTheCurrentWorkbook"),
            body: t("spreadsheet.dynamicCopy.replaceWorkbook", { file: file.name, sheets: result.sheetCount, cells: result.cellCount }),
            confirmLabel: t("spreadsheet.uiCopy.replaceAndImport"),
            confirmVariant: "destructive",
            onConfirm: () => {
              if (!importAuthorityIsCurrent()) {
                rejectStaleImport();
                return;
              }
              applyImportedWorkbook(result);
            },
          });
          return;
        }
        applyImportedWorkbook(result);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError" &&
          !importAuthorityIsCurrent()
        ) {
          return;
        }
        const workbookImport =
          await import("../../../../lib/spreadsheet/workbook-import-client");
        if (error instanceof workbookImport.SpreadsheetWorkbookTooLargeError) {
          // More cells than a page stores: loading it here would only produce
          // a workbook every save refuses. The server imports such a file as a
          // read-only preview of each sheet's top rows, with the original kept
          // as its download, so offer that instead.
          const owner = { ...dataQueryImportOwnerRef.current };
          const accountScope = captureSavedPageHotCacheScope();
          const ownsOversizedImport = () => {
            const live = dataQueryImportOwnerRef.current;
            return importAuthorityIsCurrent() && isSavedPageHotCacheScopeCurrent(accountScope) &&
              live.allowed && live.pageId === owner.pageId && live.notebookId === owner.notebookId && live.actorId === owner.actorId;
          };
          if (!owner.allowed || !owner.notebookId || !windowManager || !ownsOversizedImport()) {
            toast({ variant: "destructive", title: t("spreadsheet.uiCopy.couldNotOpenWorkbook"),
              description: t("spreadsheet.oversizedImport.importBody", { file: file.name }) });
            return;
          }
          setOverwriteConfirm({
            title: t("spreadsheet.uiCopy.openAsANewWorkbook"),
            body: t("spreadsheet.oversizedImport.importBody", { file: file.name }),
            confirmLabel: t("spreadsheet.oversizedImport.importConfirm"),
            confirmVariant: "default",
            onConfirm: () => {
              if (!ownsOversizedImport() || dataQueryImportBusyRef.current !== null) return;
              dataQueryImportBusyRef.current = importAuthority.requestId;
              setSpreadsheetImporting(true);
              void (async () => {
                try {
                  const { createPageFromFile } = await import("@mrnote/core/web/lib/page-file-import.ts");
                  if (!ownsOversizedImport()) return;
                  const created = await createPageFromFile(owner.notebookId, file);
                  if (!ownsOversizedImport()) return;
                  if (!created.id || created.page_type !== "spreadsheet" || created.notebook_id !== owner.notebookId) throw new Error("oversized_import_receipt_invalid");
                  windowManager.openWindow({ type: "note", title: created.title || file.name,
                    meta: { notebookId: owner.notebookId, pageId: created.id, pageType: "spreadsheet" } });
                  dispatchNotebookPagesChanged(owner.notebookId);
                } catch {
                  if (ownsOversizedImport()) toast({ variant: "destructive", title: t("spreadsheet.uiCopy.couldNotOpenWorkbook"),
                    description: t("spreadsheet.oversizedImport.importBody", { file: file.name }) });
                } finally {
                  dataQueryImportBusyRef.current = null;
                  setSpreadsheetImporting(false);
                }
              })();
            },
          });
          return;
        }
        const chartCustody =
          error instanceof workbookImport.SpreadsheetChartSourceCustodyRequiredError;
        const diagramCustody =
          error instanceof workbookImport.SpreadsheetDiagramSourceCustodyRequiredError;
        if (
          chartCustody ||
          diagramCustody ||
          error instanceof workbookImport.SpreadsheetQuerySourceCustodyRequiredError
        ) {
          const owner = { ...dataQueryImportOwnerRef.current };
          const accountScope = captureSavedPageHotCacheScope();
          const ownsSourceImport = () => {
            const live = dataQueryImportOwnerRef.current;
            return importAuthorityIsCurrent() && isSavedPageHotCacheScopeCurrent(accountScope) &&
              live.allowed && live.pageId === owner.pageId && live.notebookId === owner.notebookId && live.actorId === owner.actorId;
          };
          if (!owner.allowed || !owner.notebookId || !windowManager || !ownsSourceImport()) {
            toast({ variant: "destructive", title: t("spreadsheet.uiCopy.originalFileRequired"),
              description: t("spreadsheet.uiCopy.openThisFileInASignedInNotebookTo") });
            return;
          }
          setOverwriteConfirm({
            title: t("spreadsheet.uiCopy.openAsANewWorkbook"),
            body: t(
              chartCustody
                ? "spreadsheet.uiCopy.thisFileContainsNativeChartsKeepTheOriginalFile"
                : diagramCustody
                  ? "spreadsheet.uiCopy.thisFileContainsNativeSmartArtKeepTheOriginalFile"
                  : "spreadsheet.uiCopy.thisFileContainsNativeQueriesKeepTheOriginalFile",
            ),
            confirmLabel: t(
              chartCustody
                ? "spreadsheet.uiCopy.keepChartsAndOpen"
                : diagramCustody
                  ? "spreadsheet.uiCopy.keepSmartArtAndOpen"
                  : "spreadsheet.uiCopy.preserveQueriesAndOpen",
            ),
            confirmVariant: "default",
            onConfirm: () => {
              if (!ownsSourceImport() || dataQueryImportBusyRef.current !== null) return;
              dataQueryImportBusyRef.current = importAuthority.requestId;
              setSpreadsheetImporting(true);
              void (async () => {
                try {
                  const { createPageFromFile } = await import("@mrnote/core/web/lib/page-file-import.ts");
                  if (!ownsSourceImport()) return;
                  const created = await createPageFromFile(owner.notebookId, file);
                  if (!ownsSourceImport()) return;
                  if (!created.id || created.page_type !== "spreadsheet" || created.notebook_id !== owner.notebookId) throw new Error("query_import_receipt_invalid");
                  windowManager.openWindow({ type: "note", title: created.title || file.name,
                    meta: { notebookId: owner.notebookId, pageId: created.id, pageType: "spreadsheet" } });
                  dispatchNotebookPagesChanged(owner.notebookId);
                } catch {
                  if (ownsSourceImport()) toast({ variant: "destructive", title: t("spreadsheet.uiCopy.couldNotOpenWorkbook"),
                    description: t("spreadsheet.uiCopy.theNativeFileImportDidNotCompleteYourCurrent") });
                } finally {
                  if (dataQueryImportBusyRef.current === importAuthority.requestId) dataQueryImportBusyRef.current = null;
                  if (workbookImportRequestRef.current === importAuthority.requestId) setSpreadsheetImporting(false);
                }
              })();
            },
          });
          return;
        }
        if (
          error instanceof workbookImport.SpreadsheetWorkbookLossError &&
          !allowLossy
        ) {
          if (!importAuthorityIsCurrent()) {
            rejectStaleImport();
            return;
          }
          const lossSummary = workbookImport.formatSpreadsheetWorkbookLosses(
            error.lossManifest,
            t,
          );
          const preview = error.preview;
          const sheetNames =
            preview?.sheetNames
              .filter((name) => name.trim())
              .slice(0, 3)
              .join("、") || "";
          const previewSummary = preview ? t(sheetNames ? "spreadsheet.dynamicCopy.importParsedNamed" : "spreadsheet.dynamicCopy.importParsed", { sheets: preview.sheetCount, cells: preview.cellCount, names: preview.sheetNames.slice(0, 3).join(t("spreadsheet.dynamicCopy.listSeparator")) }) : t("spreadsheet.dynamicCopy.importNotWritten");
          setOverwriteConfirm({
            title: t("spreadsheet.uiCopy.confirmLossyImport"),
            body: t("spreadsheet.dynamicCopy.importLossConfirmation", { file: file.name, losses: lossSummary, preview: previewSummary }),
            confirmLabel: t("spreadsheet.uiCopy.importWithLosses"),
            confirmVariant: "destructive",
            onConfirm: () => {
              if (!importAuthorityIsCurrent()) {
                rejectStaleImport();
                return;
              }
              void importWorkbook(file, true, importAuthority);
            },
          });
          return;
        }
        toast({
          title: t("spreadsheet.uiCopy.xLSXImportFailed"),
          description: spreadsheetWorkbookImportFailureDescription(
            error,
            t,
          ),
          variant: "destructive",
        });
      } finally {
        // An older parse finishing after a newer file selection must not clear
        // the busy state owned by that newer request.
        if (workbookImportRequestRef.current === importAuthority.requestId) {
          setSpreadsheetImporting(false);
        }
      }
    },
    [applyImportedWorkbook, windowManager, workbookHasContent, t],
  );
  return {
    runWorkbookImport,
  };
}
