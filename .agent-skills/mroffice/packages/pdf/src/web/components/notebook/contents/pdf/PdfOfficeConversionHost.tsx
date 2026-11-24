"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import type { WindowManagerActions } from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import { ToastAction } from "@mrnote/core/web/components/ui/toast.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import { dispatchNotebookPagesChanged } from "@mrnote/core/web/lib/notebook-events.ts";
import {
  downloadPageExport,
  type PdfEditableProjectionTarget,
} from "@mrnote/core/web/lib/page-export.ts";
import {
  cancelTrackedPdfConversionJob,
  getActivePdfConversionJobForResource,
  getTrackedPdfConversionJob,
  PDF_CONVERSION_UNREACHABLE_CODE,
  reattachPdfConversionJobs,
  subscribePdfConversionJobs,
  trackPdfConversionJob,
  type PdfConversionJobSettleHandler,
} from "../../../../lib/pdf/office-conversion-jobs";
import {
  createPdfConversionJob,
  preparePdfConversion,
  type PdfConversionExportFormat,
  type PdfConversionJob,
  type PdfConversionJobError,
} from "@mrnote/core/web/lib/resources-sdk.ts";

import PdfOfficeProjectionDialog, {
  pdfOfficeProjectionExtension,
  type PdfOfficeProjectionView,
} from "./PdfOfficeProjectionDialog";

/** "Continue in background" is offered once a conversion has run this long. */
export const PDF_CONVERSION_BACKGROUND_OFFER_MS = 2500;
const PDF_CONVERSION_MAX_PAGE_COUNT_HINT = 1000;

export interface PdfOfficeConversionHostHandle {
  /** Open the conversion dialog for `target`; focus returns to `trigger`. */
  readonly open: (
    target: PdfEditableProjectionTarget,
    trigger: HTMLElement | null,
  ) => void;
  /** Let the server start reading the PDF on screen (once per version). */
  readonly prepare: () => void;
}

export interface PdfOfficeConversionHostProps {
  readonly controllerRef?: Ref<PdfOfficeConversionHostHandle | null>;
  readonly notebookId: string;
  /**
   * The PDF page converted from (the server reads the PDF it shows now), or
   * null to convert the resource's original upload, as a reference window
   * shows it: `expectedSha256` is then the resource's own digest.
   */
  readonly pageId: string | null;
  readonly resourceId: string | null;
  /** A conversion may start now: the server's source is the PDF on screen. */
  readonly available: boolean;
  /** Why it may not, when it may not. */
  readonly unavailableReason?: string;
  /** Digest of the PDF on screen, while a conversion may start. */
  readonly expectedSha256: string | null;
  /** Identity of the PDF on screen: a result for another one is never
   * downloaded or opened by itself. */
  readonly authorityKey: string | null;
  readonly pageCount: number;
  readonly windowManager: Pick<WindowManagerActions, "openWindow"> | null;
  /** A converted page now exists (a result taken here, or a cancel that
   * kept its page): the window may refresh what it knows of the resource. */
  readonly onConverted?: () => void;
}

interface ConversionRequest {
  readonly target: PdfEditableProjectionTarget;
  readonly resourceId: string;
  /** Null converts the original upload. */
  readonly pageId: string | null;
  readonly notebookId: string;
  readonly expectedSha256: string;
  readonly authorityKey: string | null;
  readonly title: string;
  readonly pageCountHint: number | undefined;
}

interface ConvertedPage {
  readonly pageId: string;
  readonly contentVersion: number;
  readonly format: PdfConversionExportFormat;
}

type DialogState =
  | { readonly kind: "closed" }
  | {
      readonly kind: "confirm";
      readonly target: PdfEditableProjectionTarget;
      readonly starting: boolean;
    }
  | {
      readonly kind: "progress";
      readonly target: PdfEditableProjectionTarget;
      readonly jobId: string;
      readonly backgroundReady: boolean;
      readonly downloading: boolean;
      readonly cancelling: boolean;
    }
  | {
      readonly kind: "failed";
      readonly target: PdfEditableProjectionTarget;
      readonly message: string;
      readonly starting: boolean;
    };

const CLOSED: DialogState = { kind: "closed" };













function opensBeforeItsFile(job: PdfConversionJob, target: PdfEditableProjectionTarget): boolean {
  return job.open_before_file ?? target !== "document";
}

function pageCountHint(pageCount: number): number | undefined {
  return Number.isSafeInteger(pageCount) &&
    pageCount >= 1 &&
    pageCount <= PDF_CONVERSION_MAX_PAGE_COUNT_HINT
    ? pageCount
    : undefined;
}

function progressView(
  dialog: Extract<DialogState, { kind: "progress" }>,
  job: PdfConversionJob | null,
): PdfOfficeProjectionView {
  const step =
    dialog.downloading || job?.status === "succeeded"
      ? "download"
      : job?.phase === "creating_page"
        ? "page"
        : job?.phase === "exporting" || job?.phase === "done"
          ? "file"
          : "analyze";
  return {
    kind: "progress",
    step,
    queued: !job || job.status === "queued" || job.phase === "queued",
    pagesDone: job?.progress.pages_done ?? 0,
    pagesTotal: job?.progress.pages_total ?? null,
    backgroundReady: dialog.backgroundReady,
    cancelling: dialog.cancelling || Boolean(job?.cancel_requested),
  };
}

/**
 * PDF → Word / Excel / PPT for one PDF page window (or a reference window,
 * which converts the upload): the confirmation, the running conversion's
 * progress, and its result: opened as soon as its page exists and its
 * Office file downloaded behind it when the dialog still shows it for the
 * PDF on screen, otherwise announced in a notice with Open and Download. The job itself is followed outside this
 * component (lib/pdf/office-conversion-jobs), so closing the window does not
 * lose its result.
 */
function PdfOfficeConversionHost({
  controllerRef,
  notebookId,
  pageId,
  resourceId,
  available,
  unavailableReason,
  expectedSha256,
  authorityKey,
  pageCount,
  windowManager,
  onConverted,
}: PdfOfficeConversionHostProps): React.JSX.Element | null {
  const t = useTranslations("console-notebooks");
  const [dialog, setDialog] = useState<DialogState>(CLOSED);
  const tRef = useRef(t);
  tRef.current = t;
  const paramsRef = useRef({
    notebookId,
    pageId,
    resourceId,
    available,
    expectedSha256,
    authorityKey,
    pageCount,
    windowManager,
    onConverted,
  });
  paramsRef.current = {
    notebookId,
    pageId,
    resourceId,
    available,
    expectedSha256,
    authorityKey,
    pageCount,
    windowManager,
    onConverted,
  };
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const mountedRef = useRef(false);
  /** What the dialog shows, set as it opens (before React renders it). */
  const openTargetRef = useRef<PdfEditableProjectionTarget | null>(null);
  /** The job the open dialog shows (its result is taken in the foreground). */
  const dialogJobIdRef = useRef<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const startingRef = useRef(false);
  const preparedRef = useRef(new Set<string>());
  const handlersRef = useRef(new Map<string, PdfConversionJobSettleHandler>());
  /** What each followed job was asked for (its handler's request). */
  const requestsRef = useRef(new Map<string, ConversionRequest>());
  /** Jobs whose page this window opened while their Office file was still
   * being written: only the file is left to take when they end. */
  const openedAheadRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openTargetRef.current = null;
      dialogJobIdRef.current = null;
    };
  }, []);

  const titleFor = useCallback((target: PdfEditableProjectionTarget) => {
    const translate = tRef.current;
    return target === "spreadsheet"
      ? `${translate("references.editableVersionTitle")} · ${translate("pages.spreadsheet")}`
      : target === "presentation"
        ? `${translate("references.editableVersionTitle")} · ${translate("pages.presentation")}`
        : translate("references.editableVersionTitle");
  }, []);

  /** What a conversion of the PDF on screen would ask for now, if it may. */
  const currentRequest = useCallback(
    (target: PdfEditableProjectionTarget): ConversionRequest | null => {
      const params = paramsRef.current;
      if (
        !params.available ||
        !params.resourceId ||
        params.pageId === "" ||
        !params.expectedSha256 ||
        !params.windowManager
      ) {
        return null;
      }
      return {
        target,
        resourceId: params.resourceId,
        pageId: params.pageId,
        notebookId: params.notebookId,
        expectedSha256: params.expectedSha256,
        authorityKey: params.authorityKey,
        title: titleFor(target),
        pageCountHint: pageCountHint(params.pageCount),
      };
    },
    [titleFor],
  );

  /** A job this window did not start (it was followed again after a reload). */
  const requestForJob = useCallback(
    (job: PdfConversionJob): ConversionRequest => {
      const params = paramsRef.current;
      return {
        target: job.target_page_type,
        resourceId: job.resource_id,
        pageId: params.pageId,
        notebookId: params.notebookId,
        expectedSha256: job.source_sha256,
        authorityKey:
          params.expectedSha256 === job.source_sha256
            ? params.authorityKey
            : null,
        title: titleFor(job.target_page_type),
        pageCountHint: pageCountHint(params.pageCount),
      };
    },
    [titleFor],
  );

  const failureMessage = useCallback(
    (error: PdfConversionJobError | null): string => {
      const translate = tRef.current;
      if (error?.code === "pdf_conversion_interrupted") {
        return translate("pdf.officeProjection.interrupted");
      }
      if (error?.code === PDF_CONVERSION_UNREACHABLE_CODE) {
        return translate("pdf.officeProjection.unreachable");
      }
      // A PDF past what one conversion holds: said in the reader's words,
      // with what to do (the server's line read 「Universal document
      // requestNodes budget exceeded (15194 > 5000)」 under a 186-page report).
      if (error?.code === "pdf_conversion_document_too_long") {
        return translate("pdf.officeProjection.tooLong");
      }
      return (
        error?.message.trim() || translate("pdf.officeProjection.failedFallback")
      );
    },
    [],
  );

  const startFailureMessage = useCallback((error: unknown): string => {
    const translate = tRef.current;
    if (isApiRequestError(error)) {
      if (error.code === "pdf_conversion_busy") {
        return translate("pdf.officeProjection.busyElsewhere");
      }
      if (error.message) return error.message;
    }
    return translate("pdf.officeProjection.failedFallback");
  }, []);

  const openConvertedPage = useCallback(
    (request: ConversionRequest, page: ConvertedPage) => {
      dispatchNotebookPagesChanged(request.notebookId);
      paramsRef.current.windowManager?.openWindow({
        type: "note",
        title: request.title,
        meta: {
          notebookId: request.notebookId,
          pageId: page.pageId,
          pageType: request.target,
        },
      });
    },
    [],
  );

  const downloadConvertedPage = useCallback((page: ConvertedPage) => {
    void downloadPageExport({
      pageId: page.pageId,
      format: page.format,
      expectedContentVersion: page.contentVersion,
    }).catch(() => {
      toast({
        title: tRef.current("pdfFeatured.officeProjection.downloadFailed"),
        variant: "destructive",
      });
    });
  }, []);

  /**
   * The Office file of a page that is already open, downloaded while the
   * person reads or edits it. It is the file of the page as converted; when
   * the page has been edited by the time the file is asked for, it is the
   * file of the page as it now is. A download that fails says so, with the
   * download offered again.
   */
  const downloadBehindOpenPage = useCallback((page: ConvertedPage) => {
    void (async () => {
      try {
        await downloadPageExport({
          pageId: page.pageId,
          format: page.format,
          expectedContentVersion: page.contentVersion,
        });
        return;
      } catch (error) {
        if (isApiRequestError(error) && error.code === "page_version_conflict") {
          try {
            await downloadPageExport({ pageId: page.pageId, format: page.format });
            return;
          } catch {
            // said below
          }
        }
      }
      const downloadLabel = tRef.current("pdf.officeProjection.download");
      toast({
        title: tRef.current("pdfFeatured.officeProjection.downloadFailed"),
        variant: "destructive",
        action: (
          <ToastAction
            altText={downloadLabel}
            data-testid="pdf-office-projection-notice-download"
            onClick={() => downloadConvertedPage(page)}
          >
            {downloadLabel}
          </ToastAction>
        ),
      });
    })();
  }, [downloadConvertedPage]);

  const showReadyNotice = useCallback(
    (
      request: ConversionRequest,
      page: ConvertedPage,
      options: { readonly downloaded: boolean },
    ) => {
      const translate = tRef.current;
      const openLabel = translate("pdf.officeProjection.open");
      const downloadLabel = translate("pdf.officeProjection.download");
      toast({
        title: translate("pdf.officeProjection.readyTitle", {
          extension: pdfOfficeProjectionExtension(request.target),
        }),
        description: translate("pdf.officeProjection.readyDescription"),
        duration: Number.POSITIVE_INFINITY,
        action: (
          <div className="flex shrink-0 items-center gap-2">
            <ToastAction
              altText={openLabel}
              data-testid="pdf-office-projection-notice-open"
              onClick={() => openConvertedPage(request, page)}
            >
              {openLabel}
            </ToastAction>
            {options.downloaded ? null : (
              <ToastAction
                altText={downloadLabel}
                data-testid="pdf-office-projection-notice-download"
                onClick={() => downloadConvertedPage(page)}
              >
                {downloadLabel}
              </ToastAction>
            )}
          </div>
        ),
      });
    },
    [downloadConvertedPage, openConvertedPage],
  );

  // A handler per job and window; filled in below once `finish` exists.
  const finishRef = useRef<
    (job: PdfConversionJob, request: ConversionRequest, foreground: boolean) => void
  >(() => undefined);

  const handlerFor = useCallback(
    (jobId: string, request: ConversionRequest): PdfConversionJobSettleHandler => {
      const existing = handlersRef.current.get(jobId);
      if (existing) return existing;
      const handler: PdfConversionJobSettleHandler = {
        isForeground: () =>
          mountedRef.current && dialogJobIdRef.current === jobId,
        isMounted: () => mountedRef.current,
        settle: (job, foreground) => {
          handlersRef.current.delete(jobId);
          requestsRef.current.delete(jobId);
          finishRef.current(job, request, foreground);
        },
      };
      handlersRef.current.set(jobId, handler);
      requestsRef.current.set(jobId, request);
      return handler;
    },
    [],
  );

  const reattach = useCallback(() => {
    const id = paramsRef.current.resourceId;
    if (!id) return;
    void reattachPdfConversionJobs(id, (job) =>
      handlerFor(job.job_id, requestForJob(job)),
    ).catch(() => undefined);
  }, [handlerFor, requestForJob]);

  const prepare = useCallback(() => {
    const params = paramsRef.current;
    if (
      !params.available ||
      !params.resourceId ||
      params.pageId === "" ||
      !params.expectedSha256
    ) {
      return;
    }
    const key = `${params.resourceId}:${params.pageId ?? "upload"}:${params.expectedSha256}`;
    if (preparedRef.current.has(key)) return;
    preparedRef.current.add(key);
    const hint = pageCountHint(params.pageCount);
    // Never shown and never waited on: a conversion works without it.
    void preparePdfConversion(params.resourceId, {
      ...(params.pageId === null ? {} : { source_page_id: params.pageId }),
      expected_source_sha256: params.expectedSha256,
      ...(hint === undefined ? {} : { page_count_hint: hint }),
    }).catch(() => undefined);
  }, []);

  /** Start converting with `request`; the dialog follows it when it is open. */
  const startRequest = useCallback(
    async (request: ConversionRequest, showInDialog: boolean) => {
      if (startingRef.current) return;
      if (getActivePdfConversionJobForResource(request.resourceId)) return;
      startingRef.current = true;
      if (showInDialog) {
        setDialog((current) =>
          current.kind === "confirm" || current.kind === "failed"
            ? { ...current, starting: true }
            : current,
        );
      }
      try {
        const job = await createPdfConversionJob(request.resourceId, {
          notebook_id: request.notebookId,
          title: request.title,
          target_page_type: request.target,
          // The server converts the PDF this page shows now (without a page,
          // the upload) and refuses when that is not exactly these bytes.
          ...(request.pageId === null ? {} : { source_page_id: request.pageId }),
          expected_source_sha256: request.expectedSha256,
          ...(request.pageCountHint === undefined
            ? {}
            : { page_count_hint: request.pageCountHint }),
        });
        startingRef.current = false;
        if (
          showInDialog &&
          mountedRef.current &&
          openTargetRef.current === request.target &&
          dialogJobIdRef.current === null
        ) {
          dialogJobIdRef.current = job.job_id;
          setDialog({
            kind: "progress",
            target: request.target,
            jobId: job.job_id,
            backgroundReady: false,
            downloading: false,
            cancelling: false,
          });
        }
        trackPdfConversionJob(job, handlerFor(job.job_id, request));
      } catch (error) {
        startingRef.current = false;
        // A plan limit opens the upgrade dialog on its own (lib/api).
        const planLimit = isApiRequestError(error) && error.status === 402;
        if (isApiRequestError(error) && error.code === "pdf_conversion_busy") {
          reattach();
        }
        if (!showInDialog || !mountedRef.current) {
          if (!planLimit) {
            toast({
              title: startFailureMessage(error),
              variant: "destructive",
            });
          }
          return;
        }
        if (planLimit) {
          openTargetRef.current = null;
          setDialog(CLOSED);
          return;
        }
        setDialog((current) =>
          current.kind === "closed"
            ? current
            : {
                kind: "failed",
                target: request.target,
                message: startFailureMessage(error),
                starting: false,
              },
        );
      }
    },
    [handlerFor, reattach, startFailureMessage],
  );

  const start = useCallback(
    (target: PdfEditableProjectionTarget) => {
      const request = currentRequest(target);
      if (request) void startRequest(request, true);
    },
    [currentRequest, startRequest],
  );

  const open = useCallback(
    (target: PdfEditableProjectionTarget, trigger: HTMLElement | null) => {
      triggerRef.current = trigger;
      prepare();
      const id = paramsRef.current.resourceId;
      const active = id ? getActivePdfConversionJobForResource(id) : null;
      if (active && active.target_page_type === target) {
        // The conversion asked for is already running: show it, and take
        // its result here.
        trackPdfConversionJob(active, handlerFor(active.job_id, requestForJob(active)));
        openTargetRef.current = target;
        dialogJobIdRef.current = active.job_id;
        setDialog({
          kind: "progress",
          target,
          jobId: active.job_id,
          backgroundReady: true,
          downloading: false,
          cancelling: false,
        });
        return;
      }
      openTargetRef.current = target;
      dialogJobIdRef.current = null;
      setDialog({ kind: "confirm", target, starting: false });
    },
    [handlerFor, prepare, requestForJob],
  );

  /** A failure notice's Retry: in the dialog when this window is open. */
  const retryFromNotice = useCallback(
    (request: ConversionRequest) => {
      if (mountedRef.current) {
        open(request.target, null);
        start(request.target);
        return;
      }
      void startRequest(request, false);
    },
    [open, start, startRequest],
  );

  const finish = useCallback(
    (
      job: PdfConversionJob,
      request: ConversionRequest,
      foreground: boolean,
    ) => {
      const translate = tRef.current;
      const extension = pdfOfficeProjectionExtension(request.target);
      const inDialog = () =>
        mountedRef.current && dialogJobIdRef.current === job.job_id;
      const announceConverted = () => {
        if (mountedRef.current) paramsRef.current.onConverted?.();
      };
      const closeShownDialog = () => {
        if (!inDialog()) return;
        openTargetRef.current = null;
        dialogJobIdRef.current = null;
        setDialog(CLOSED);
      };
      const showFailure = (message: string) => {
        if (foreground && inDialog()) {
          dialogJobIdRef.current = null;
          setDialog({
            kind: "failed",
            target: request.target,
            message,
            starting: false,
          });
          return;
        }
        const retryLabel = translate("pdf.officeProjection.retry");
        toast({
          variant: "destructive",
          title: translate("pdf.officeProjection.failedTitle", { extension }),
          description: message,
          action: (
            <ToastAction
              altText={retryLabel}
              data-testid="pdf-office-projection-notice-retry"
              onClick={() => retryFromNotice(request)}
            >
              {retryLabel}
            </ToastAction>
          ),
        });
      };

      const openedAhead = openedAheadRef.current.delete(job.job_id);
      if (job.status === "cancelled") {
        closeShownDialog();
        // A cancel that came after the page was made keeps the page.
        if (job.page_id) {
          dispatchNotebookPagesChanged(request.notebookId);
          announceConverted();
        }
        toast({
          title: translate("pdf.officeProjection.cancelledTitle"),
          ...(job.page_id
            ? { description: translate("pdf.officeProjection.cancelledPageKept") }
            : {}),
        });
        return;
      }
      if (job.status === "failed") {
        if (job.error?.status === 402) {
          closeShownDialog();
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("mrnote:plan-required", { detail: job.error }),
            );
          }
          return;
        }
        showFailure(failureMessage(job.error));
        return;
      }

      const contentVersion = job.content_version;
      if (
        job.page_type !== request.target ||
        job.target_page_type !== request.target ||
        job.source_sha256 !== request.expectedSha256 ||
        !job.page_id ||
        contentVersion === null ||
        !Number.isSafeInteger(contentVersion) ||
        contentVersion < 1
      ) {
        showFailure(translate("pdf.pageWindow.conversionReceiptDoesNotMatch"));
        return;
      }
      const page: ConvertedPage = {
        pageId: job.page_id,
        contentVersion,
        format: job.export_format,
      };
      // Downloaded and opened by itself only while the dialog shows it for
      // the very PDF on screen; any other result is offered in a notice.
      if (openedAhead) {
        // Its page was opened while the file was being written (below):
        // the file is all that is left to take.
        downloadBehindOpenPage(page);
        return;
      }
      const stillCurrent = () =>
        inDialog() &&
        paramsRef.current.authorityKey !== null &&
        paramsRef.current.authorityKey === request.authorityKey &&
        paramsRef.current.windowManager !== null;
      if (!foreground || !stillCurrent()) {
        closeShownDialog();
        dispatchNotebookPagesChanged(request.notebookId);
        showReadyNotice(request, page, { downloaded: false });
        announceConverted();
        return;
      }
      if (!opensBeforeItsFile(job, request.target)) {
        // A document's file is downloaded before its page is opened (see
        // `opensBeforeItsFile`); a failed download still leaves the user on
        // the converted page, not on nothing.
        setDialog((current) =>
          current.kind === "progress" && current.jobId === job.job_id
            ? { ...current, downloading: true }
            : current,
        );
        void (async () => {
          let downloadFailed = false;
          try {
            await downloadPageExport({
              pageId: page.pageId,
              format: page.format,
              expectedContentVersion: page.contentVersion,
            });
          } catch {
            downloadFailed = true;
          }
          if (!stillCurrent()) {
            closeShownDialog();
            dispatchNotebookPagesChanged(request.notebookId);
            showReadyNotice(request, page, { downloaded: !downloadFailed });
            announceConverted();
            return;
          }
          closeShownDialog();
          openConvertedPage(request, page);
          announceConverted();
          if (downloadFailed) {
            toast({
              title: translate("pdfFeatured.officeProjection.downloadFailed"),
              variant: "destructive",
            });
          }
        })();
        return;
      }
      // The page is opened at once and its Office file follows it: the file
      // is still what the user asked for (as WPS gives it), but writing it is
      // seconds for a long document (and the download renders it where an
      // export pool does), which were spent looking at the dialog with the
      
      closeShownDialog();
      openConvertedPage(request, page);
      announceConverted();
      downloadBehindOpenPage(page);
    },
    [downloadBehindOpenPage, failureMessage, openConvertedPage, retryFromNotice, showReadyNotice],
  );
  finishRef.current = finish;

  const continueInBackground = useCallback(() => {
    openTargetRef.current = null;
    dialogJobIdRef.current = null;
    setDialog(CLOSED);
  }, []);

  const closeDialog = useCallback(() => {
    if (startingRef.current) return;
    openTargetRef.current = null;
    dialogJobIdRef.current = null;
    setDialog(CLOSED);
  }, []);

  const cancelConversion = useCallback(() => {
    const shown = dialogRef.current;
    if (shown.kind !== "progress" || shown.cancelling) return;
    const jobId = shown.jobId;
    setDialog((current) =>
      current.kind === "progress" && current.jobId === jobId
        ? { ...current, cancelling: true }
        : current,
    );
    void cancelTrackedPdfConversionJob(jobId).catch(() => {
      if (!mountedRef.current) return;
      setDialog((current) =>
        current.kind === "progress" && current.jobId === jobId
          ? { ...current, cancelling: false }
          : current,
      );
      toast({
        title: tRef.current("pdf.officeProjection.cancelFailed"),
        variant: "destructive",
      });
    });
  }, []);

  useImperativeHandle(controllerRef, () => ({ open, prepare }), [open, prepare]);

  // A conversion this person started before the window (or the page)
  // reloaded still ends with its notice.
  useEffect(() => {
    if (resourceId && pageId !== "") reattach();
  }, [pageId, reattach, resourceId]);

  const progressJobId = dialog.kind === "progress" ? dialog.jobId : null;
  const backgroundPending =
    dialog.kind === "progress" && !dialog.backgroundReady;
  useEffect(() => {
    if (!progressJobId || !backgroundPending) return;
    const timer = setTimeout(() => {
      setDialog((current) =>
        current.kind === "progress" && current.jobId === progressJobId
          ? { ...current, backgroundReady: true }
          : current,
      );
    }, PDF_CONVERSION_BACKGROUND_OFFER_MS);
    return () => clearTimeout(timer);
  }, [backgroundPending, progressJobId]);

  const shownJob = useSyncExternalStore(
    subscribePdfConversionJobs,
    () => (progressJobId ? getTrackedPdfConversionJob(progressJobId) : null),
    () => null,
  );
  const activeJob = useSyncExternalStore(
    subscribePdfConversionJobs,
    () => (resourceId ? getActivePdfConversionJobForResource(resourceId) : null),
    () => null,
  );

  // The page exists before its Office file does (the job's "exporting"
  // phase): it is opened then, for the PDF still on screen, and the file is
  // downloaded when the job ends (`finish`). A job that ends in one step
  // (page and file together) is opened by `finish` itself.
  const aheadJobId =
    shownJob !== null &&
    progressJobId === shownJob.job_id &&
    shownJob.status === "running" &&
    shownJob.phase === "exporting" &&
    shownJob.page_id
      ? shownJob.job_id
      : null;
  useEffect(() => {
    if (!aheadJobId || openedAheadRef.current.has(aheadJobId)) return;
    const job = getTrackedPdfConversionJob(aheadJobId);
    const request = requestsRef.current.get(aheadJobId);
    const contentVersion = job?.content_version ?? null;
    if (
      !job ||
      !request ||
      !opensBeforeItsFile(job, request.target) ||
      !job.page_id ||
      job.page_type !== request.target ||
      job.target_page_type !== request.target ||
      job.source_sha256 !== request.expectedSha256 ||
      contentVersion === null ||
      !Number.isSafeInteger(contentVersion) ||
      contentVersion < 1 ||
      dialogJobIdRef.current !== aheadJobId ||
      paramsRef.current.authorityKey === null ||
      paramsRef.current.authorityKey !== request.authorityKey ||
      paramsRef.current.windowManager === null
    ) {
      return;
    }
    openedAheadRef.current.add(aheadJobId);
    openTargetRef.current = null;
    dialogJobIdRef.current = null;
    setDialog(CLOSED);
    openConvertedPage(request, {
      pageId: job.page_id,
      contentVersion,
      format: job.export_format,
    });
    paramsRef.current.onConverted?.();
    // Said once: the page is in the notebook and its file is on its way
    // (the transfer line shows it once the download has been asked for).
    toast({
      title: tRef.current("pdf.officeProjection.stepCreateFile", {
        extension: pdfOfficeProjectionExtension(request.target),
      }),
      description: tRef.current("pdf.officeProjection.readyDescription"),
    });
  }, [aheadJobId, openConvertedPage]);

  if (dialog.kind === "closed") return null;

  const retryHeldReason =
    activeJob !== null
      ? t("pdf.officeProjection.busyOtherTarget", {
          extension: pdfOfficeProjectionExtension(activeJob.target_page_type),
        })
      : available
        ? null
        : (unavailableReason ?? t("document.capability.unavailable"));
  const view: PdfOfficeProjectionView =
    dialog.kind === "progress"
      ? progressView(dialog, shownJob)
      : dialog.kind === "failed"
        ? { kind: "failed", message: dialog.message, retryHeldReason }
        : { kind: "confirm", heldReason: retryHeldReason };

  return (
    <PdfOfficeProjectionDialog
      open
      target={dialog.target}
      busy={dialog.kind !== "progress" && dialog.starting}
      returnFocusRef={triggerRef}
      view={view}
      onStart={() => start(dialog.target)}
      onCancel={dialog.kind === "progress" ? continueInBackground : closeDialog}
      onCancelConversion={cancelConversion}
      onContinueInBackground={continueInBackground}
      onRetry={() => start(dialog.target)}
    />
  );
}

export default memo(PdfOfficeConversionHost);
