"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Reflow: the PDF's text set as one column at a size the reader picks, for
 * a phone (where a page fitted to the screen's width sets its text too small
 * to read) and for anyone who wants it. A reading view over the pages: the
 * pages stay as they are under it, and "Show page" goes back to the page a
 * passage is on. Text only, as Acrobat's Reflow and Liquid Mode read it; a
 * page without text (a scan) says so.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { reflowPageBlocks, type ReflowBlock, type ReflowTextRun } from "../../../../lib/pdf/reflow-reading";

interface ReflowPageSource {
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: readonly unknown[] }> }>;
}

export interface PdfReflowViewProps {
  readonly document: ReflowPageSource;
  /** The pages in reading order (the reader's visible pages). */
  readonly pageNumbers: readonly number[];
  /** Where to start: the page the reader shows. */
  readonly startPage: number;
  readonly onShowPage: (pageNumber: number) => void;
  readonly onClose: () => void;
  readonly t: (key: string, values?: Record<string, string | number>) => string;
}

const SIZES = [14, 16, 18, 20, 23, 26, 30] as const;
const SIZE_KEY = "mrai.pdf.reflow.size";
/** Pages read ahead of the one the reader reaches. */
const READ_AHEAD = 3;

type PageText = { readonly state: "loading" } | { readonly state: "ready"; readonly blocks: readonly ReflowBlock[] } | { readonly state: "failed" };

function storedSize(): number {
  try {
    const value = Number(window.localStorage.getItem(SIZE_KEY));
    return SIZES.includes(value as (typeof SIZES)[number]) ? value : 18;
  } catch {
    return 18;
  }
}

export default function PdfReflowView({ document, pageNumbers, startPage, onShowPage, onClose, t }: PdfReflowViewProps) {
  const [size, setSize] = useState<number>(18);
  const [pages, setPages] = useState<ReadonlyMap<number, PageText>>(new Map());
  const startIndex = Math.max(0, pageNumbers.indexOf(startPage));
  const [readUntil, setReadUntil] = useState(Math.min(pageNumbers.length, startIndex + READ_AHEAD));
  const requested = useRef(new Set<number>());
  const sentinel = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setSize(storedSize()); }, []);
  useEffect(() => { closeButton.current?.focus({ preventScroll: true }); }, []);
  const changeSize = useCallback((step: 1 | -1) => {
    setSize((current) => {
      const index = Math.max(0, SIZES.indexOf(current as (typeof SIZES)[number]));
      const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, index + step))];
      try { window.localStorage.setItem(SIZE_KEY, String(next)); } catch { /* not kept */ }
      return next;
    });
  }, []);

  const mounted = useRef(true);
  useEffect(() => {
    // (Set again on a remount: React's development double mount runs the
    // cleanup once before the view is really shown.)
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Each page's text, read once, as the reader comes to it.
  useEffect(() => {
    for (const pageNumber of pageNumbers.slice(startIndex, readUntil)) {
      if (requested.current.has(pageNumber)) continue;
      requested.current.add(pageNumber);
      setPages((current) => new Map(current).set(pageNumber, { state: "loading" }));
      void document.getPage(pageNumber)
        .then((page) => page.getTextContent())
        .then((content) => reflowPageBlocks(content.items.filter((item): item is ReflowTextRun =>
          Boolean(item) && typeof (item as ReflowTextRun).str === "string")))
        .then((blocks) => { if (mounted.current) setPages((current) => new Map(current).set(pageNumber, { state: "ready", blocks })); },
          () => { if (mounted.current) setPages((current) => new Map(current).set(pageNumber, { state: "failed" })); });
    }
  }, [document, pageNumbers, readUntil, startIndex]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setReadUntil((current) => Math.min(pageNumbers.length, current + READ_AHEAD));
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [pageNumbers.length]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="pdf-viewer__reflow" role="dialog" aria-modal="true" aria-label={t("pdf.reflow.title")}
      data-testid="pdf-reflow-view" onKeyDown={onKeyDown}>
      <div className="pdf-viewer__reflow-bar">
        <strong className="pdf-viewer__reflow-title">{t("pdf.reflow.title")}</strong>
        <button type="button" className="pdf-viewer__reflow-button" onClick={() => changeSize(-1)}
          disabled={size <= SIZES[0]} aria-label={t("pdf.reflow.smaller")} title={t("pdf.reflow.smaller")}
          data-testid="pdf-reflow-smaller">A−</button>
        <button type="button" className="pdf-viewer__reflow-button" onClick={() => changeSize(1)}
          disabled={size >= SIZES[SIZES.length - 1]} aria-label={t("pdf.reflow.larger")} title={t("pdf.reflow.larger")}
          data-testid="pdf-reflow-larger">A+</button>
        <button type="button" ref={closeButton} className="pdf-viewer__reflow-button pdf-viewer__reflow-close" onClick={onClose}
          data-testid="pdf-reflow-close">{t("pdf.reflow.close")}</button>
      </div>
      <div className="pdf-viewer__reflow-text" style={{ fontSize: `${size}px` }} data-testid="pdf-reflow-text">
        {pageNumbers.slice(startIndex, readUntil).map((pageNumber, index) => {
          const page = pages.get(pageNumber);
          return (
            <section key={pageNumber} className="pdf-viewer__reflow-page" data-page-number={pageNumber}
              aria-label={t("pdf.reflow.page", { page: startIndex + index + 1 })}>
              <div className="pdf-viewer__reflow-page-head">
                <span>{t("pdf.reflow.page", { page: startIndex + index + 1 })}</span>
                <button type="button" className="pdf-viewer__reflow-link" onClick={() => onShowPage(pageNumber)}>
                  {t("pdf.reflow.showPage")}
                </button>
              </div>
              {!page || page.state === "loading" ? (
                <p className="pdf-viewer__reflow-note">{t("pdf.reflow.loading")}</p>
              ) : page.state === "failed" ? (
                <p className="pdf-viewer__reflow-note">{t("pdf.reflow.failed")}</p>
              ) : page.blocks.length === 0 ? (
                <p className="pdf-viewer__reflow-note">{t("pdf.reflow.noText")}</p>
              ) : (
                page.blocks.map((block, blockIndex) => block.kind === "heading" ? (
                  block.level === 1 ? <h2 key={blockIndex}>{block.text}</h2>
                    : block.level === 2 ? <h3 key={blockIndex}>{block.text}</h3> : <h4 key={blockIndex}>{block.text}</h4>
                ) : <p key={blockIndex}>{block.text}</p>)
              )}
            </section>
          );
        })}
        <div ref={sentinel} aria-hidden="true" className="pdf-viewer__reflow-sentinel" />
        {readUntil < pageNumbers.length ? (
          <button type="button" className="pdf-viewer__reflow-more"
            onClick={() => setReadUntil((current) => Math.min(pageNumbers.length, current + READ_AHEAD))}>
            {t("pdf.reflow.more")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
