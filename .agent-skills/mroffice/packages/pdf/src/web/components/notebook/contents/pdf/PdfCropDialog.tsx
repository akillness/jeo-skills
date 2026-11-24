"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  CROP_MIN_PERCENT,
  type CropMargins,
  type CropScope,
} from "../../../../lib/pdf/crop-box";
import type { PdfSmartCropResult } from "../../../../lib/pdf/smart-crop";

export interface PdfCropDialogProps {
  /** 1-based page the crop applies to (shown in the header). */
  page: number;
  /** Total page count, so "apply to all" / a range can be offered when > 1. */
  pageCount?: number;
  /** Current edge margins (percent) for the page, to seed the inputs. */
  margins: CropMargins;
  /** Whether the page is currently cropped (enables the Reset button). */
  cropped: boolean;
  /**
   * Apply the entered margins. `scope` selects which pages get the crop:
   * `"page"` (this page), `"all"` (every page), or `"range"` (the pages
   * `rangeSpec` — an Acrobat-style `"1-3, 5, 8-"` — selects). The host bakes the
   * margins into a keep-rect and applies it across the resolved page list.
   */
  onApply: (margins: CropMargins, scope: CropScope, rangeSpec: string) => void;
  /** Clear the page's crop (restore the full page). */
  onReset: () => void;
  /** Detect uniform rendered-page margins; detection updates only this draft. */
  onDetect?: () => PdfSmartCropResult;
  /** Exact command that opened the dialog, restored after cancel/apply. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Resolves the live command when the Ribbon replaces its button on rerender. */
  returnFocusTarget?: () => HTMLElement | null;
  /** Close the dialog without applying. */
  onClose: () => void;
  /**
   * The page as rendered (uncropped), shown behind the crop frame so the
   * user sees what is kept before applying; its aspect ratio is the page's.
   */
  pagePreview?: { src: string; width: number; height: number } | null;
  /** The page's size in PDF points, for the kept-area size readout. */
  pageSizePoints?: { width: number; height: number } | null;
}

const EDGES: ReadonlyArray<{ key: keyof CropMargins; labelKey: string }> = [
  { key: "left", labelKey: "pdf.crop.left" },
  { key: "top", labelKey: "pdf.crop.top" },
  { key: "right", labelKey: "pdf.crop.right" },
  { key: "bottom", labelKey: "pdf.crop.bottom" },
];

const SCOPES: ReadonlyArray<{ value: CropScope; labelKey: string }> = [
  { value: "page", labelKey: "pdf.crop.scopePage" },
  { value: "all", labelKey: "pdf.crop.scopeAll" },
  { value: "range", labelKey: "pdf.crop.scopeRange" },
];

/** The most one edge can take: the page keeps at least CROP_MIN_PERCENT. */
const MAX_EDGE_PERCENT = 100 - CROP_MIN_PERCENT;

function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > MAX_EDGE_PERCENT) return MAX_EDGE_PERCENT;
  return value;
}






export function cropMarginsIssue(
  margins: CropMargins,
): "horizontal" | "vertical" | null {
  if (margins.left + margins.right > MAX_EDGE_PERCENT) return "horizontal";
  if (margins.top + margins.bottom > MAX_EDGE_PERCENT) return "vertical";
  return null;
}

type CropHandle =
  | "move"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const HANDLES: ReadonlyArray<{ handle: CropHandle; style: CSSProperties }> = [
  { handle: "top-left", style: { left: 0, top: 0, cursor: "nwse-resize" } },
  { handle: "top", style: { left: "50%", top: 0, cursor: "ns-resize" } },
  { handle: "top-right", style: { left: "100%", top: 0, cursor: "nesw-resize" } },
  { handle: "right", style: { left: "100%", top: "50%", cursor: "ew-resize" } },
  { handle: "bottom-right", style: { left: "100%", top: "100%", cursor: "nwse-resize" } },
  { handle: "bottom", style: { left: "50%", top: "100%", cursor: "ns-resize" } },
  { handle: "bottom-left", style: { left: 0, top: "100%", cursor: "nesw-resize" } },
  { handle: "left", style: { left: 0, top: "50%", cursor: "ew-resize" } },
];

const roundPercent = (value: number) => Math.round(value * 10) / 10;

/**
 * Apply one drag of the crop frame (Acrobat's crop rectangle / WPS's crop
 * handles): an edge or corner moves only its own sides, the frame body
 * moves the kept area whole. The kept area never drops below
 * CROP_MIN_PERCENT on either axis and never leaves the page.
 */
export function dragCropMargins(
  start: CropMargins,
  handle: CropHandle,
  dxPercent: number,
  dyPercent: number,
): CropMargins {
  const next = { ...start };
  const moves = (side: "left" | "right" | "top" | "bottom") =>
    handle === side || handle.includes(side);
  if (handle === "move") {
    const dx = Math.max(-start.left, Math.min(start.right, dxPercent));
    const dy = Math.max(-start.top, Math.min(start.bottom, dyPercent));
    next.left = start.left + dx;
    next.right = start.right - dx;
    next.top = start.top + dy;
    next.bottom = start.bottom - dy;
  } else {
    if (moves("left")) {
      next.left = Math.max(
        0,
        Math.min(start.left + dxPercent, MAX_EDGE_PERCENT - start.right),
      );
    }
    if (moves("right")) {
      next.right = Math.max(
        0,
        Math.min(start.right - dxPercent, MAX_EDGE_PERCENT - start.left),
      );
    }
    if (moves("top")) {
      next.top = Math.max(
        0,
        Math.min(start.top + dyPercent, MAX_EDGE_PERCENT - start.bottom),
      );
    }
    if (moves("bottom")) {
      next.bottom = Math.max(
        0,
        Math.min(start.bottom - dyPercent, MAX_EDGE_PERCENT - start.top),
      );
    }
  }
  return {
    left: roundPercent(next.left),
    right: roundPercent(next.right),
    top: roundPercent(next.top),
    bottom: roundPercent(next.bottom),
  };
}










export default function PdfCropDialog({
  page,
  pageCount,
  margins,
  cropped,
  onApply,
  onReset,
  onDetect,
  returnFocusRef,
  returnFocusTarget,
  onClose,
  pagePreview = null,
  pageSizePoints = null,
}: PdfCropDialogProps) {
  const t = useTranslations("console-notebooks");
  // Seeded once from the page's current margins. The host remounts the dialog
  // (key={page}) when the page changes, so this always opens with that page's
  // margins without a setState-in-effect re-seed.
  const [draft, setDraft] = useState<CropMargins>(margins);
  // Which pages the crop applies to. Defaults to just this page (the historical
  // behaviour); "all" / "range" only make sense with more than one page.
  const [scope, setScope] = useState<CropScope>("page");
  // Acrobat-style range spec used only when scope === "range" (seeded to this
  // page so the obvious default targets the page the user is looking at).
  const [rangeSpec, setRangeSpec] = useState<string>(String(page));
  const [detectStatus, setDetectStatus] = useState<
    PdfSmartCropResult["status"] | null
  >(null);
  const firstMarginRef = useRef<HTMLInputElement | null>(null);
  const multiPage = typeof pageCount === "number" && pageCount > 1;
  const issue = cropMarginsIssue(draft);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    pointerId: number;
    x: number;
    y: number;
    start: CropMargins;
  } | null>(null);
  const aspect =
    pagePreview && pagePreview.width > 0 && pagePreview.height > 0
      ? pagePreview.width / pagePreview.height
      : pageSizePoints && pageSizePoints.width > 0 && pageSizePoints.height > 0
        ? pageSizePoints.width / pageSizePoints.height
        : 612 / 792;
  const keptWidthPercent = Math.max(0, 100 - draft.left - draft.right);
  const keptHeightPercent = Math.max(0, 100 - draft.top - draft.bottom);
  const keptSizeLabel = pageSizePoints
    ? `${Math.round(((pageSizePoints.width * keptWidthPercent) / 100) * (25.4 / 72))} × ${Math.round(((pageSizePoints.height * keptHeightPercent) / 100) * (25.4 / 72))} mm`
    : `${roundPercent(keptWidthPercent)}% × ${roundPercent(keptHeightPercent)}%`;
  const beginDrag =
    (handle: CropHandle) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        handle,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: draft,
      };
      previewRef.current?.setPointerCapture?.(event.pointerId);
    };
  const onPreviewPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = previewRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !box) return;
    if (box.width <= 0 || box.height <= 0) return;
    const dx = ((event.clientX - drag.x) / box.width) * 100;
    const dy = ((event.clientY - drag.y) / box.height) * 100;
    setDraft(dragCropMargins(drag.start, drag.handle, dx, dy));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    previewRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const inputStyle: CSSProperties = {
    width: 56,
    boxSizing: "border-box",
  };

  return (
    <OfficeDialogShell
      open
      title={t("pdf.crop.title", { page })}
      description={t("pdf.crop.hint")}
      defaultActionLabel={t("pdf.crop.apply")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => {
        if (issue) return;
        onApply(draft, multiPage ? scope : "page", rangeSpec);
      }}
      defaultActionDisabled={issue !== null}
      onCancel={onClose}
      initialFocusRef={firstMarginRef}
      returnFocusRef={returnFocusRef}
      returnFocusTarget={returnFocusTarget}
      testIdPrefix="pdf-crop"
      defaultActionTestId="pdf-crop-apply"
    >
      {onDetect ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            type="button"
            className={parts.compactButton}
            data-testid="pdf-crop-detect"
            onClick={() => {
              const result = onDetect();
              setDetectStatus(result.status);
              if (result.status === "detected") setDraft(result.margins);
            }}
            style={{ alignSelf: "flex-start" }}
          >
            {t("pdf.crop.detect")}
          </button>
          {detectStatus ? (
            <span
              role="status"
              aria-live="polite"
              data-testid="pdf-crop-detect-status"
              className={parts.hint}
            >
              {t(
                detectStatus === "detected"
                  ? "pdf.crop.detectReady"
                  : detectStatus === "no-uniform-margin"
                    ? "pdf.crop.detectNone"
                    : "pdf.crop.detectUnavailable",
              )}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        ref={previewRef}
        data-testid="pdf-crop-preview"
        aria-hidden="true"
        onPointerMove={onPreviewPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative",
          alignSelf: "center",
          width: aspect >= 1 ? 240 : Math.round(240 * aspect),
          height: aspect >= 1 ? Math.round(240 / aspect) : 240,
          // A sheet of paper keeps its printed look in either theme.
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.18)",
          borderRadius: 3,
          touchAction: "none",
          userSelect: "none",
          overflow: "visible",
        }}
      >
        {pagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local data URL of the rendered page
          <img
            src={pagePreview.src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              pointerEvents: "none",
            }}
          />
        ) : (
          
          <span
            data-testid="pdf-crop-preview-pending"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              textAlign: "center",
              fontSize: 11,
              color: "#64748b",
              pointerEvents: "none",
            }}
          >
            {t("pdf.crop.previewPending")}
          </span>
        )}
        {/* Everything outside the kept area is dimmed. */}
        {(
          [
            { left: 0, top: 0, width: "100%", height: `${draft.top}%` },
            {
              left: 0,
              top: `${100 - draft.bottom}%`,
              width: "100%",
              height: `${draft.bottom}%`,
            },
            {
              left: 0,
              top: `${draft.top}%`,
              width: `${draft.left}%`,
              height: `${keptHeightPercent}%`,
            },
            {
              left: `${100 - draft.right}%`,
              top: `${draft.top}%`,
              width: `${draft.right}%`,
              height: `${keptHeightPercent}%`,
            },
          ] satisfies CSSProperties[]
        ).map((style, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              background: "rgba(15, 23, 42, 0.38)",
              pointerEvents: "none",
              ...style,
            }}
          />
        ))}
        <div
          data-testid="pdf-crop-frame"
          onPointerDown={beginDrag("move")}
          style={{
            position: "absolute",
            left: `${draft.left}%`,
            top: `${draft.top}%`,
            width: `${keptWidthPercent}%`,
            height: `${keptHeightPercent}%`,
            boxSizing: "border-box",
            border: "1.5px solid var(--office-dialog-accent, #0d9488)",
            cursor: "move",
          }}
        >
          {HANDLES.map(({ handle, style }) => (
            <span
              key={handle}
              data-testid={`pdf-crop-handle-${handle}`}
              className="pdf-crop-dialog__handle"
              onPointerDown={beginDrag(handle)}
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                marginLeft: -6,
                marginTop: -6,
                background: "#ffffff",
                border: "1.5px solid var(--office-dialog-accent, #0d9488)",
                borderRadius: 2,
                ...style,
              }}
            />
          ))}
        </div>
      </div>
      <p className={parts.hint} data-testid="pdf-crop-kept-size">
        {t("pdf.crop.keptArea", { keptSizeLabel })}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {EDGES.map(({ key, labelKey }) => (
          <label key={key} className={parts.field}>
            <span className={parts.label}>{t(labelKey)}</span>
            <input
              ref={key === "left" ? firstMarginRef : undefined}
              type="number"
              min={0}
              max={MAX_EDGE_PERCENT}
              // Dragging the frame sets margins to a tenth of a percent; a
              // whole-number step made the browser refuse to submit a dragged
              
              step={0.1}
              value={draft[key]}
              data-testid={`pdf-crop-${key}`}
              aria-invalid={
                (issue === "horizontal" && (key === "left" || key === "right")) ||
                (issue === "vertical" && (key === "top" || key === "bottom"))
              }
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, [key]: roundPercent(clampMargin(Number(event.target.value))) }))
              }
              style={inputStyle}
            />
          </label>
        ))}
      </div>
      {issue ? (
        <p
          role="alert"
          className={parts.message}
          data-tone="error"
          data-testid="pdf-crop-margin-error"
        >
          {issue === "horizontal"
            ? t("pdf.crop.horizontalTooLarge", {
                max: MAX_EDGE_PERCENT,
                min: CROP_MIN_PERCENT,
              })
            : t("pdf.crop.verticalTooLarge", {
                max: MAX_EDGE_PERCENT,
                min: CROP_MIN_PERCENT,
              })}
        </p>
      ) : null}
      {multiPage ? (
        <fieldset
          data-testid="pdf-crop-scope"
          style={{
            border: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <legend>
            {t("pdf.crop.scopeLabel")}
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SCOPES.map(({ value, labelKey }) => (
              <label
                key={value}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  minHeight: 44,
                  alignItems: "center",
                  paddingLeft: 52,
                  paddingRight: 8,
                }}
              >
                <input
                  type="radio"
                  name="pdf-crop-scope"
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  data-testid={`pdf-crop-scope-${value}`}
                  className={`${parts.markInput} absolute left-0 top-0 h-11 w-11 cursor-pointer`}
                />
                <span
                  aria-hidden
                  className={`${parts.mark} pointer-events-none absolute left-[14px] top-1/2 size-4 -translate-y-1/2`} data-shape="radio"
                />
                <span>{t(labelKey)}</span>
              </label>
            ))}
          </div>
          {scope === "range" ? (
            <input
              type="text"
              value={rangeSpec}
              onChange={(event) => setRangeSpec(event.target.value)}
              placeholder={t("pdf.crop.scopeRangePlaceholder")}
              aria-label={t("pdf.crop.scopeRangeLabel")}
              data-testid="pdf-crop-range-input"
              style={{ ...inputStyle, width: "100%" }}
            />
          ) : null}
        </fieldset>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={parts.compactButton}
          data-testid="pdf-crop-reset"
          onClick={onReset}
          disabled={!cropped}
        >
          {t("pdf.crop.reset")}
        </button>
      </div>
    </OfficeDialogShell>
  );
}
