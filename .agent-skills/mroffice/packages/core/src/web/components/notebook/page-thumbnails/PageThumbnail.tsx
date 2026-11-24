"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A page drawn small from its own content (Finder's Quick Look thumbnails):
 * a document's first blocks on a sheet of paper, a workbook's first cells
 * with their styles, a code page's first lines, a deck's first slide through
 * the presentation editor's own renderer, a PDF's first page through PDF.js.
 *
 * Content is read only for a thumbnail on screen, two pages at a time, from
 * the encrypted saved-page cache when it holds this version, else from the
 * server. What a thumbnail needs is kept in memory for this tab only, keyed
 * by page and content version, never written to disk in the clear.
 */
import dynamic from "../../../../host/next/dynamic";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { HandwritingCoverFace } from "../HandwritingCoverFace";
import { PageTypeArtwork } from "../PageTypeArtwork";
import {
  handwritingPageMm,
  handwritingPaperDataUrl,
  normalizeHandwritingDocument,
  type HandwritingDocumentSetting,
} from "../../../lib/handwriting-paper";
import { fetchWorkspaceScoped } from "../../../lib/api";
import { getApiHttpBaseUrl } from "../../../lib/env";
import { getPage, type PageItem } from "../../../lib/notebook-sdk";
import { pagePictureUrl, pictureObjectTokenSha } from "../../../lib/page-picture-objects";
import { activeMountWorkspaceId, mountWorkspaceFor } from "../../../lib/workspace-mounts";
import {
  codeThumbnailLines,
  documentThumbnailPage,
  spreadsheetThumbnailGrid,
  type DocumentThumbnailBlock,
  type DocumentThumbnailPage,
  type SpreadsheetThumbnailGrid,
} from "../../../lib/page-thumbnail-model";
import { readSavedPageHotCache } from "../../../lib/saved-page-hot-cache";
import styles from "./PageThumbnail.module.css";

export interface PageThumbnailPage {
  id: string;
  title: string;
  page_type: string;
  content_version?: number;
}

type ThumbnailSource =
  | { kind: "document"; page: DocumentThumbnailPage }
  | { kind: "spreadsheet"; grid: SpreadsheetThumbnailGrid | null }
  | { kind: "code"; language: string; lines: string[] }
  | { kind: "presentation"; slide: unknown; theme: unknown; masters: unknown }
  | { kind: "pdf"; image: string | null; aspect: number }
  // a handwriting document: its cover, or its first page of paper
  | { kind: "handwriting"; setting: HandwritingDocumentSetting; widthMm: number; heightMm: number };

/* ------------------------------------------------------------- loading */

const MAX_CACHED = 80;
const CONCURRENCY = 2;
const cache = new Map<string, ThumbnailSource | null>();
const inflight = new Map<string, Promise<ThumbnailSource | null>>();
let running = 0;
const waiting: (() => void)[] = [];

function remember(key: string, value: ThumbnailSource | null) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function scheduled<T>(task: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

function keyOf(page: PageThumbnailPage): string {
  return `${page.id}:${page.content_version ?? "?"}`;
}

async function readPage(page: PageThumbnailPage): Promise<PageItem> {
  const cached = await readSavedPageHotCache(page.id).catch(() => null);
  if (
    cached &&
    (page.content_version === undefined ||
      cached.content_version === page.content_version)
  ) {
    return cached;
  }
  return getPage(page.id);
}

/** The PDF's first page as a JPEG, about 360px wide. */
async function pdfFirstPage(
  dataItemId: string,
): Promise<{ image: string | null; aspect: number }> {
  const response = await fetchWorkspaceScoped(
    `${getApiHttpBaseUrl()}/api/v1/data-items/${encodeURIComponent(dataItemId)}/preview`,
  );
  if (!response.ok) return { image: null, aspect: 1 / Math.SQRT2 };
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { loadCompatiblePdfJs, PDF_JS_DOCUMENT_ASSETS } = await import(
    "../../../lib/pdf/pdfjs-runtime"
  );
  const pdfjs = await loadCompatiblePdfJs();
  const task = pdfjs.getDocument({ data: bytes, ...PDF_JS_DOCUMENT_ASSETS });
  try {
    const document = await task.promise;
    const first = await document.getPage(1);
    const base = first.getViewport({ scale: 1 });
    const viewport = first.getViewport({ scale: 360 / Math.max(1, base.width) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return { image: null, aspect: base.width / base.height };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await first.render({ canvas, canvasContext: context, viewport }).promise;
    return {
      image: canvas.toDataURL("image/jpeg", 0.84),
      aspect: base.width / Math.max(1, base.height),
    };
  } finally {
    void task.destroy();
  }
}

async function buildSource(
  page: PageThumbnailPage,
): Promise<ThumbnailSource | null> {
  const detail = await readPage(page);
  const content = detail.content_json as unknown;
  switch (detail.page_type || page.page_type) {
    case "spreadsheet":
      return { kind: "spreadsheet", grid: spreadsheetThumbnailGrid(content) };
    case "code":
      return { kind: "code", ...codeThumbnailLines(content) };
    case "presentation": {
      const { normalizeSlides, parseDeckTheme, parseDeckMasters } = await import(
        "../../../lib/presentation/deck-model"
      );
      // The deck's pictures stored beside it are drawn from it
      // (lib/page-picture-objects).
      const { registerPagePictureObjects } = await import("../../../lib/page-picture-objects");
      registerPagePictureObjects(detail.id, content, detail.notebook_id);
      const slides = normalizeSlides(content as never) as unknown[];
      return {
        kind: "presentation",
        slide: slides[0] ?? null,
        theme: parseDeckTheme(content as never),
        masters: parseDeckMasters(content as never),
      };
    }
    case "pdf": {
      const dataItemId = (content as { dataItemId?: unknown } | null)?.dataItemId;
      if (typeof dataItemId !== "string" || !dataItemId) {
        return { kind: "pdf", image: null, aspect: 1 / Math.SQRT2 };
      }
      return { kind: "pdf", ...(await pdfFirstPage(dataItemId)) };
    }
    default: {
      const attrs = (content as { attrs?: Record<string, unknown> } | null)?.attrs;
      const setting = normalizeHandwritingDocument(attrs?.handwritingDocument);
      if (setting) {
        const mm = handwritingPageMm(
          typeof attrs?.pageSize === "string" ? attrs.pageSize : null,
          typeof attrs?.pageOrientation === "string" ? attrs.pageOrientation : null,
        );
        return { kind: "handwriting", setting, widthMm: mm.width, heightMm: mm.height };
      }
      // An imported Word document names its pictures by digest: drawn from
      // the page's own picture route, which checks the reader's access, as
      // the editor draws them (lib/document-picture-references). Not
      // registered there: a thumbnail is not the document opened last.
      const workspaceId =
        (detail.notebook_id ? mountWorkspaceFor(detail.notebook_id) : null) ?? activeMountWorkspaceId();
      return {
        kind: "document",
        page: documentThumbnailPage(content, {
          pictureSrc: (src) => {
            const sha = pictureObjectTokenSha(src);
            return sha ? pagePictureUrl(detail.id, sha, workspaceId) : null;
          },
        }),
      };
    }
  }
}

function loadSource(page: PageThumbnailPage): Promise<ThumbnailSource | null> {
  const key = keyOf(page);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = scheduled(() => buildSource(page))
    .catch(() => null)
    .then((source) => {
      remember(key, source);
      inflight.delete(key);
      return source;
    });
  inflight.set(key, promise);
  return promise;
}

/** Whether a source draws the page itself (not the format's icon). */
function drawsPage(source: ThumbnailSource | null | undefined): boolean {
  if (!source) return false;
  if (source.kind === "pdf") return Boolean(source.image);
  if (source.kind === "presentation") return Boolean(source.slide);
  return true;
}

/**
 * What this tab holds for a page at its version: its picture, nothing to
 * draw (an empty deck, a PDF that would not render, a read that failed), or
 * nothing yet.
 */
export function pageThumbnailStatus(page: PageThumbnailPage): "picture" | "blank" | "none" {
  const key = keyOf(page);
  if (!cache.has(key)) return "none";
  return drawsPage(cache.get(key)) ? "picture" : "blank";
}

/**
 * Reads what a page's thumbnail draws into this tab's cache, so a
 * PageThumbnail of it then draws at once (no editor is mounted for it).
 * Resolves true when there is a picture of the page.
 */
export async function loadPageThumbnail(page: PageThumbnailPage): Promise<boolean> {
  const source = cache.has(keyOf(page)) ? cache.get(keyOf(page)) : await loadSource(page);
  if (source?.kind === "presentation" && source.slide) {
    // the deck's own slide renderer, so the slide draws with the picture
    await import("@mrnote/slides/web/components/notebook/contents/PresentationWindow.tsx").catch(() => null);
  }
  return drawsPage(source);
}

/* ----------------------------------------------------------- rendering */

/** A Word drawing, by the editor's own painter (loaded only when drawn). */
const DocumentShapeThumb = dynamic(
  () => import("./DocumentShapeThumb").then((module) => module.DocumentShapeThumb),
  { ssr: false, loading: () => null },
);

const SlideMiniThumbnail = dynamic(
  () =>
    import("@mrnote/slides/web/components/notebook/contents/PresentationWindow.tsx").then(
      (module) => module.SlideMiniThumbnail,
    ),
  { ssr: false, loading: () => null },
);

/** Content laid out at its natural width, scaled down to the frame's. */
function Scaled({
  naturalWidth,
  children,
}: {
  naturalWidth: number;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setScale(host.clientWidth / naturalWidth);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [naturalWidth]);
  return (
    <div ref={hostRef} className={styles.scaledHost}>
      {scale > 0 ? (
        <div
          className={styles.scaled}
          style={{ width: naturalWidth, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Each numbered item's number: a run restarts after anything else. */
function ordinals(blocks: DocumentThumbnailBlock[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const block of blocks) {
    run = block.tag === "oli" ? run + 1 : 0;
    out.push(run);
  }
  return out;
}

/** The text's flow is laid out 600px wide (the paper's own padding). */
const FLOW_WIDTH = 600;

/** The drawings Word places on the page, at the page's own size. */
function DocumentFloats({ page, behind }: { page: DocumentThumbnailPage; behind: boolean }) {
  const floats = page.floats.filter((item) => item.behind === behind);
  if (!floats.length) return null;
  return (
    <Scaled naturalWidth={page.widthPx}>
      <div className={styles.floats} style={{ width: page.widthPx, height: page.heightPx }}>
        {floats.map((item, index) => {
          const box = {
            left: item.leftPx,
            top: item.topPx,
            width: Math.max(1, item.widthPx),
            height: Math.max(1, item.heightPx),
          };
          return item.kind === "image" && item.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- the page's own picture route.
            <img key={index} className={styles.floatImage} src={item.src} alt="" style={box} loading="lazy" decoding="async" />
          ) : (
            <DocumentShapeThumb key={index} attrs={item.attrs} style={box} />
          );
        })}
      </div>
    </Scaled>
  );
}

function DocumentSheet({ page }: { page: DocumentThumbnailPage }) {
  const blocks = page.blocks;
  const numbers = ordinals(blocks);
  // an in-line drawing keeps its size against the page's width
  const flowScale = FLOW_WIDTH / Math.max(1, page.widthPx);
  return (
    <>
      <DocumentFloats page={page} behind />
      <Scaled naturalWidth={FLOW_WIDTH}>
        <div className={styles.paper}>
          {blocks.map((block, index) => {
            switch (block.tag) {
              case "shape": {
                const width = Math.min(block.widthPx * flowScale, FLOW_WIDTH - 116);
                const height = block.heightPx * (width / Math.max(1, block.widthPx));
                return (
                  <div key={index} className={styles.inlineShape} style={{ width, height }}>
                    <DocumentShapeThumb attrs={block.attrs} style={{ left: 0, top: 0, width, height }} />
                  </div>
                );
              }
              case "h1":
                return <h1 key={index}>{block.text}</h1>;
              case "h2":
                return <h2 key={index}>{block.text}</h2>;
              case "h3":
                return <h3 key={index}>{block.text}</h3>;
              case "li":
                return (
                  <p key={index} className={styles.bullet}>
                    {block.text}
                  </p>
                );
              case "oli":
                return (
                  <p key={index} className={styles.numbered} data-n={`${numbers[index]}.`}>
                    {block.text}
                  </p>
                );
              case "task":
                return (
                  <p key={index} className={styles.task} data-checked={block.checked || undefined}>
                    {block.text}
                  </p>
                );
              case "quote":
                return (
                  <blockquote key={index}>{block.text}</blockquote>
                );
              case "code":
                return <pre key={index}>{block.text}</pre>;
              case "hr":
                return <hr key={index} />;
              case "img":
                // eslint-disable-next-line @next/next/no-img-element -- page images are arbitrary URLs.
                return <img key={index} src={block.src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
              case "table":
                return (
                  <table key={index}>
                    <tbody>
                      {block.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td key={c}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              default:
                return <p key={index}>{block.text || " "}</p>;
            }
          })}
        </div>
      </Scaled>
      <DocumentFloats page={page} behind={false} />
    </>
  );
}

function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function SpreadsheetSheet({ grid }: { grid: SpreadsheetThumbnailGrid | null }) {
  const rows = grid?.rows ?? 12;
  const columns = grid?.columns ?? 6;
  return (
    <Scaled naturalWidth={36 + columns * 92}>
      <div
        className={styles.sheet}
        style={{ gridTemplateColumns: `36px repeat(${columns}, 92px)` } as CSSProperties}
      >
        <span className={styles.corner} />
        {Array.from({ length: columns }, (_, c) => (
          <span key={`h${c}`} className={styles.columnHead}>
            {columnName(c)}
          </span>
        ))}
        {Array.from({ length: rows }, (_, r) => [
          <span key={`r${r}`} className={styles.rowHead}>
            {r + 1}
          </span>,
          ...Array.from({ length: columns }, (_, c) => {
            const cell = grid?.cells[r]?.[c] ?? null;
            return (
              <span
                key={`${r}:${c}`}
                className={styles.cell}
                style={
                  cell
                    ? ({
                        fontWeight: cell.bold ? 700 : undefined,
                        fontStyle: cell.italic ? "italic" : undefined,
                        color: cell.color,
                        background: cell.background,
                        textAlign: cell.align,
                      } as CSSProperties)
                    : undefined
                }
              >
                {cell?.text}
              </span>
            );
          }),
        ])}
      </div>
      {grid?.sheetName ? (
        <div className={styles.sheetTab}>{grid.sheetName}</div>
      ) : null}
    </Scaled>
  );
}

const CODE_TOKEN =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|import|from|export|default|class|new|def|async|await|true|false|null|None|True|False)\b/gm;

function highlighted(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(CODE_TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    const kind = match[1] ? "string" : match[2] ? "comment" : match[3] ? "number" : "keyword";
    out.push(
      <span key={at} data-token={kind}>
        {match[0]}
      </span>,
    );
    last = at + match[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function CodeSheet({ lines, language }: { lines: string[]; language: string }) {
  return (
    <Scaled naturalWidth={560}>
      <div className={styles.code} data-language={language || undefined}>
        {(lines.length ? lines : [""]).map((line, index) => (
          <div key={index} className={styles.codeLine}>
            <span className={styles.lineNumber}>{index + 1}</span>
            <span>{highlighted(line)}</span>
          </div>
        ))}
      </div>
    </Scaled>
  );
}

const ASPECT: Record<string, number> = {
  document: 1 / Math.SQRT2,
  spreadsheet: 4 / 3,
  code: 4 / 3,
  presentation: 16 / 9,
  pdf: 1 / Math.SQRT2,
};

export function PageThumbnail({
  page,
  variant,
  className,
}: {
  page: PageThumbnailPage;
  /** stage: the gallery's; card: a preview column's; strip: a strip tile's;
   *  dock: a side strip's file picture (DockThumbnail). */
  variant: "stage" | "card" | "strip" | "dock";
  className?: string;
}) {
  const key = keyOf(page);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{
    key: string;
    source: ThumbnailSource | null;
  } | null>(() => (cache.has(key) ? { key, source: cache.get(key) ?? null } : null));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (cache.has(key)) {
      setLoaded({ key, source: cache.get(key) ?? null });
      return;
    }
    let alive = true;
    void loadSource(page).then((source) => {
      if (alive) setLoaded({ key, source });
    });
    return () => {
      alive = false;
    };
    // the page's identity and version are the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible]);

  const source = loaded?.key === key ? loaded.source : undefined;
  const pending = source === undefined;
  const aspect =
    source?.kind === "pdf"
      ? source.aspect
      : source?.kind === "handwriting"
        ? source.widthMm / source.heightMm
        : source?.kind === "document" && source.page.widthPx > 0 && source.page.heightPx > 0
          ? source.page.widthPx / source.page.heightPx
          : (ASPECT[page.page_type] ?? ASPECT.document!);

  let body: ReactNode = null;
  if (source?.kind === "document") body = <DocumentSheet page={source.page} />;
  else if (source?.kind === "spreadsheet") body = <SpreadsheetSheet grid={source.grid} />;
  else if (source?.kind === "code") body = <CodeSheet lines={source.lines} language={source.language} />;
  else if (source?.kind === "handwriting") {
    body = source.setting.cover ? (
      <HandwritingCoverFace
        cover={source.setting.cover}
        title={page.title}
        typeLabel=""
        aspect={source.heightMm / source.widthMm}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- a drawn data URL.
      <img
        className={styles.pdfImage}
        src={handwritingPaperDataUrl(
          source.setting.paper,
          source.setting.paperColor,
          source.widthMm,
          source.heightMm,
          source.widthMm / 160,
        )}
        alt=""
      />
    );
  } else if (source?.kind === "pdf" && source.image) {
    // eslint-disable-next-line @next/next/no-img-element -- a rendered data URL.
    body = <img className={styles.pdfImage} src={source.image} alt="" />;
  } else if (source?.kind === "presentation" && source.slide) {
    body = (
      <SlideMiniThumbnail
        slide={source.slide as never}
        theme={source.theme as never}
        masters={source.masters as never}
        eager
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={[styles.frame, className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-kind={source?.kind ?? page.page_type}
      data-state={pending ? "loading" : body ? "ready" : "fallback"}
      style={{ "--thumb-aspect": String(aspect) } as CSSProperties}
      aria-hidden="true"
      data-testid="page-thumbnail"
    >
      {body ?? (
        <span className={styles.fallback}>
          <PageTypeArtwork pageType={page.page_type} className={styles.fallbackArt} />
        </span>
      )}
    </div>
  );
}
