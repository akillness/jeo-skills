"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { placeScrollTop, scrollInMotion } from "@mrnote/core/web/lib/scroll-follow.ts";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

import {
  PDF_JS_DOCUMENT_ASSETS,
  loadCompatiblePdfJs,
} from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";
import {
  PDF_COMPARE_MAX_PAGES,
  destroyPdfCompareResources,
  pdfCompareProjectedScrollTop,
  rejectPdfCompareFile,
  synchronizePdfCompareScroll,
} from "../../../../lib/pdf/compare-view";
import {
  PdfReadOnlyPage,
  readPdfReadOnlyPageDescriptors,
  type PdfReadOnlyPageDescriptor,
} from "./PdfReadOnlyPage";

const COMPARE_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const COMPARE_LABEL_TARGET_CLASS =
  "min-h-11 min-w-11 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1";

type ComparePage = PdfReadOnlyPageDescriptor;

interface ActiveCompareSession {
  readonly generation: number;
  readonly isDisposed: () => boolean;
  readonly release: () => Promise<void>;
  failed: boolean;
}

export interface PdfComparePanelProps {
  readonly file: File;
  readonly leftScrollRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

export default function PdfComparePanel({
  file,
  leftScrollRef,
  onClose,
}: PdfComparePanelProps) {
  const t = useTranslations("console-notebooks");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionGenerationRef = useRef(0);
  const activeSessionRef = useRef<ActiveCompareSession | null>(null);
  const [pages, setPages] = useState<readonly ComparePage[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorKey, setErrorKey] = useState<
    "pdfViewer.compareLoadFailed" | "pdfViewer.compareTooLarge"
  >("pdfViewer.compareLoadFailed");
  const [synchronous, setSynchronous] = useState(true);
  const [panelWidth, setPanelWidth] = useState(600);

  const handlePageRenderError = useCallback((sessionGeneration: number) => {
    const session = activeSessionRef.current;
    if (
      !session ||
      session.generation !== sessionGeneration ||
      session.failed ||
      session.isDisposed()
    ) {
      return;
    }
    session.failed = true;
    setPages([]);
    setErrorKey("pdfViewer.compareLoadFailed");
    setPhase("error");
    void session.release();
  }, []);

  useEffect(() => {
    const rejection = rejectPdfCompareFile(file);
    if (rejection) {
      setErrorKey(
        rejection === "too_large"
          ? "pdfViewer.compareTooLarge"
          : "pdfViewer.compareLoadFailed",
      );
      setPhase("error");
      setPages([]);
      return;
    }

    const sessionGeneration = ++sessionGenerationRef.current;
    let disposed = false;
    let released = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let documentProxy: PDFDocumentProxy | null = null;
    let objectUrl: string | null = null;
    const release = async () => {
      if (released) return;
      released = true;
      await destroyPdfCompareResources({
        loadingTask,
        document: documentProxy,
        objectUrl,
      });
      loadingTask = null;
      documentProxy = null;
      objectUrl = null;
    };
    const session: ActiveCompareSession = {
      generation: sessionGeneration,
      isDisposed: () => disposed,
      release,
      failed: false,
    };
    activeSessionRef.current = session;

    setPhase("loading");
    setPages([]);
    void (async () => {
      try {
        objectUrl = URL.createObjectURL(file);
        const pdfjs = await loadCompatiblePdfJs();
        if (disposed) return;
        loadingTask = pdfjs.getDocument({
          url: objectUrl,
          ...PDF_JS_DOCUMENT_ASSETS,
        });
        documentProxy = await loadingTask.promise;
        if (disposed) return;
        if (
          documentProxy.numPages < 1 ||
          documentProxy.numPages > PDF_COMPARE_MAX_PAGES
        ) {
          setErrorKey("pdfViewer.compareTooLarge");
          await release();
          if (!disposed) setPhase("error");
          return;
        }

        const nextPages = await readPdfReadOnlyPageDescriptors(
          documentProxy,
          sessionGeneration,
          () => disposed,
        );
        if (!nextPages) return;
        if (!disposed) {
          setPages(nextPages);
          setPhase("ready");
        }
      } catch {
        await release();
        if (!disposed) {
          setPages([]);
          setErrorKey("pdfViewer.compareLoadFailed");
          setPhase("error");
        }
      }
    })();

    return () => {
      disposed = true;
      if (activeSessionRef.current?.generation === sessionGeneration) {
        activeSessionRef.current = null;
      }
      void release();
    };
  }, [file]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setPanelWidth(Math.max(240, node.clientWidth - 32));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!synchronous || phase !== "ready") return;
    const left = leftScrollRef.current;
    const right = scrollRef.current;
    if (!left || !right) return;
    // The scroll a pane makes because the other moved comes back as a scroll
    // event of its own. Told apart by where it lands, not by a frame: after a
    // page button's smooth scroll, the echo arrived a frame late, was taken
    // for the reader's own scroll and written back, which cut the smooth
    // scroll short -- Last Page stayed on 1/2 and First Page bounced back to
    // 2/2 (user audit PDF 0034).
    const echoes = new Map<HTMLElement, number>();
    const mirror = (source: HTMLElement, target: HTMLElement) => {
      const echo = echoes.get(source);
      echoes.delete(source);
      if (echo !== undefined && Math.abs(source.scrollTop - echo) < 1) return;
      // A column the reader is scrolling keeps their scroll: written from
      // script mid-swipe, it moved from two threads at once and Safari's
      // screen and its hit testing parted (lib/wheel-gesture).
      if (scrollInMotion(target)) return;
      placeScrollTop(target, pdfCompareProjectedScrollTop(source, target));
      echoes.set(target, target.scrollTop);
    };
    const fromLeft = () => mirror(left, right);
    const fromRight = () => mirror(right, left);
    left.addEventListener("scroll", fromLeft, { passive: true });
    right.addEventListener("scroll", fromRight, { passive: true });
    synchronizePdfCompareScroll(left, right);
    echoes.set(right, right.scrollTop);
    return () => {
      left.removeEventListener("scroll", fromLeft);
      right.removeEventListener("scroll", fromRight);
    };
  }, [leftScrollRef, pages.length, phase, synchronous]);

  return (
    <section
      aria-label={t("pdfViewer.compareSideBySide")}
      data-testid="pdf-compare-panel"
      style={{
        display: "flex",
        flex: "1 1 0",
        minWidth: 0,
        minHeight: 0,
        flexDirection: "column",
        borderLeft: "1px solid var(--win-hairline, rgba(13, 148, 136, 0.18))",
        background: "#eef2f6",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 38,
          padding: "6px 10px",
          borderBottom:
            "1px solid var(--pdf-chrome-divider, var(--win-hairline, rgba(13, 148, 136, 0.14)))",
          // The header is chrome (light/dark tokens from pdf-viewer-chrome.css);
          // the grey desk below stays the reading area's colour.
          background: "var(--pdf-chrome-pane, #fff)",
          color: "var(--pdf-chrome-ink, #0f172a)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={file.name}
          >
            {file.name}
          </strong>
          <span
            style={{
              display: "block",
              color: "var(--pdf-chrome-muted, #64748b)",
              fontSize: 10,
            }}
          >
            {t("pdfViewer.compareReadOnly")}
          </span>
        </div>
        <label
          className={COMPARE_LABEL_TARGET_CLASS}
          data-testid="pdf-compare-synchronous-target"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "var(--pdf-chrome-secondary, #334155)",
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={synchronous}
            data-testid="pdf-compare-synchronous"
            onChange={(event) => setSynchronous(event.currentTarget.checked)}
          />
          {t("pdfViewer.compareSynchronous")}
        </label>
        <button
          type="button"
          className={COMPARE_TARGET_CLASS}
          aria-label={t("pdfViewer.compareClose")}
          data-testid="pdf-compare-close"
          onClick={onClose}
          style={{
            display: "inline-flex",
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            border: 0,
            borderRadius: 7,
            background: "transparent",
            color: "var(--pdf-chrome-secondary, #475569)",
            cursor: "pointer",
          }}
        >
          <X aria-hidden size={15} />
        </button>
      </header>

      <div
        ref={scrollRef}
        data-testid="pdf-compare-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          // Its pages are clientWidth - 32 wide: the bar's room is kept
          // whether or not it shows, or a bar that comes and goes changes
          
          scrollbarGutter: "stable",
          padding: "16px",
        }}
      >
        {phase === "loading" ? (
          <EditorLoadingState
            kind="pdf"
            compact
            label={t("pdfViewer.compareLoading")}
          />
        ) : phase === "error" ? (
          <div
            role="alert"
            data-testid="pdf-compare-error"
            style={{
              margin: "32px auto",
              maxWidth: 360,
              borderRadius: 10,
              background: "#fff",
              color: "#b91c1c",
              padding: 16,
              textAlign: "center",
            }}
          >
            {t(errorKey)}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              // A page wider than the column (at the 0.1x floor) scrolls
              // sideways instead of spilling off the left edge.
              alignItems: "safe center",
              gap: 16,
            }}
          >
            {pages.map((descriptor) => (
              <PdfReadOnlyPage
                key={descriptor.pageNumber}
                descriptor={descriptor}
                onRenderError={handlePageRenderError}
                root={scrollRef}
                width={panelWidth}
                canvasTestId="pdf-compare-page-canvas"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
