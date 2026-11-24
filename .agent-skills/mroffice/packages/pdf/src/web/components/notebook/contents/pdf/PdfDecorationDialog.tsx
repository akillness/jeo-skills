"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  CalendarDays,
  Files,
  Hash,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeDraftNumberInput } from "@mrnote/core/web/components/office-ribbon/OfficeDraftNumberInput.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  RibbonFontFamilyPicker,
  type RibbonFontFamilySection,
} from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import { RibbonValueCombobox } from "@mrnote/core/web/components/office-ribbon/RibbonValueCombobox.tsx";
import {
  createDefaultPdfDecoration,
  parsePdfDecorationRangeSpec,
  pdfDecorationPreviewEntries,
  sanitizePdfDocumentDecorations,
  type PdfDecorationFont,
  type PdfDecorationHorizontal,
  type PdfDecorationKind,
  type PdfDecorationPageRange,
  type PdfDocumentDecorations,
  type PdfHeaderFooterDecoration,
  type PdfHeaderFooterMargins,
  type PdfPageNumberDecoration,
  type PdfWatermarkDecoration,
  type PdfWatermarkImageSource,
  type PdfWatermarkRepeatRows,
  type PdfWatermarkVertical,
} from "../../../../lib/pdf/document-decorations";
import {
  pdfMillimetresToPoints,
  pdfPointsToMillimetres,
} from "../../../../lib/pdf/page-size";

import { pdfWriteRefusalReason } from "../../../../lib/pdf/write-refusal";
import styles from "./PdfDecorationDialog.module.css";

/** Decoration margins: 4 pt (1.4 mm) to 144 pt (50.8 mm) from the edge. */
const DECORATION_MARGIN_MIN_MM = 1.4;
const DECORATION_MARGIN_MAX_MM = 50.8;

function clampDecorationMarginPoints(millimetres: number): number {
  return Math.min(144, Math.max(4, pdfMillimetresToPoints(millimetres)));
}

function formatDecorationMillimetres(millimetres: number): string {
  return String(Math.round(millimetres * 10) / 10);
}

function parseDecorationNumber(text: string): number | null {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

type PdfDecorationDraft =
  PdfWatermarkDecoration | PdfPageNumberDecoration | PdfHeaderFooterDecoration;

type HeaderFooterSlot = Readonly<{
  vertical: "header" | "footer";
  horizontal: PdfDecorationHorizontal;
}>;

/** From this many pages on, a save in progress says it is writing a long
 * document (below it the write is over before the line could be read). */
const PDF_DECORATION_LONG_DOCUMENT_PAGES = 50;

interface PdfDecorationDialogProps {
  open: boolean;
  kind: PdfDecorationKind;
  decorations: PdfDocumentDecorations;
  currentPage: number;
  pageCount: number;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onCommit: (next: PdfDocumentDecorations) => void | Promise<void>;
  onRemove: (kind: PdfDecorationKind) => void | Promise<void>;
  onUploadWatermarkImage?: (file: File) => Promise<string>;
  resolveWatermarkImageUrl?: (dataItemId: string) => string;
  watermarkImageDisabledReason?: string;
  



  pagePreview?: { src: string; width: number; height: number } | null;
  /** The current page's size in PDF points (aspect ratio and margins). */
  pageSizePoints?: { width: number; height: number } | null;
}

/** The three faces a decoration is written in, named in the reader's
 * language. */
function fontSections(
  t: ReturnType<typeof useTranslations>,
): readonly RibbonFontFamilySection[] {
  return [
    {
      id: "pdf-decoration-fonts",
      options: [
        {
          id: "sans",
          label: t("pdf.decoration.fontSans"),
          value: "sans",
          previewFamily: "system-ui",
        },
        {
          id: "serif",
          label: t("pdf.decoration.fontSerif"),
          value: "serif",
          previewFamily: "serif",
        },
        {
          id: "mono",
          label: t("pdf.decoration.fontMono"),
          value: "mono",
          previewFamily: "monospace",
        },
      ],
    },
  ];
}

const SIZE_OPTIONS = ["6", "8", "9", "10", "11", "12", "14", "16", "18", "24"];
const WATERMARK_SIZE_OPTIONS = ["8", "10", "12", "16", "20", "24", "32"];
const WATERMARK_IMAGE_SCALE_OPTIONS = ["10", "20", "30", "35", "40", "50", "65", "80"];
const WATERMARK_REPEAT_ROW_OPTIONS: readonly PdfWatermarkRepeatRows[] = [
  2, 3, 6, 8, 12,
];
const HEADER_FOOTER_SLOT_MAX_LENGTH = 240;

async function readWatermarkImageSize(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error("invalid_image");
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function currentDecoration(
  decorations: PdfDocumentDecorations,
  kind: PdfDecorationKind,
): PdfDecorationDraft | null {
  if (kind === "watermark") return decorations.watermark;
  if (kind === "page-number") return decorations.pageNumber;
  return decorations.headerFooter;
}

function cloneDraft(value: PdfDecorationDraft): PdfDecorationDraft {
  return JSON.parse(JSON.stringify(value)) as PdfDecorationDraft;
}

function replaceDecoration(
  decorations: PdfDocumentDecorations,
  draft: PdfDecorationDraft | null,
  kind: PdfDecorationKind,
): PdfDocumentDecorations {
  return sanitizePdfDocumentDecorations({
    ...decorations,
    ...(kind === "watermark" ? { watermark: draft } : {}),
    ...(kind === "page-number" ? { pageNumber: draft } : {}),
    ...(kind === "header-footer" ? { headerFooter: draft } : {}),
  });
}

function rangeLabels(
  t: ReturnType<typeof useTranslations>,
): Record<PdfDecorationPageRange["mode"], string> {
  return {
    all: t("pdf.decoration.rangeAll"),
    odd: t("pdf.decoration.rangeOdd"),
    even: t("pdf.decoration.rangeEven"),
    "current-onward": t("pdf.decoration.rangeCurrentOnward"),
    "current-only": t("pdf.decoration.rangeCurrentOnly"),
    custom: t("pdf.decoration.rangeCustom"),
  };
}

function fontFamily(font: PdfDecorationFont): string {
  return font === "serif"
    ? "serif"
    : font === "mono"
      ? "monospace"
      : "system-ui";
}

export function PdfDecorationOverlay({
  decorations,
  page,
  pageCount,
  pageWidth,
  pageHeight,
  scale = 1,
  preview = false,
  resolveWatermarkImageUrl,
}: {
  decorations: PdfDocumentDecorations;
  page: number;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  preview?: boolean;
  resolveWatermarkImageUrl?: (dataItemId: string) => string;
}) {
  const entries = pdfDecorationPreviewEntries(
    decorations,
    page,
    pageCount,
    pageWidth,
    pageHeight,
  );
  if (entries.length === 0) return null;
  return (
    <div
      className={`${styles.overlay}${preview ? ` ${styles.previewOverlay}` : ""}`}
      aria-hidden="true"
      data-testid={
        preview
          ? "pdf-decoration-dialog-preview"
          : "pdf-decoration-page-overlay"
      }
    >
      {entries.map((entry) => {
        const isWatermark = entry.kind !== "slot";
        const horizontalInset = `${Math.min(
          45,
          Math.max(
            0,
            ((Number(entry.horizontalMargin ?? entry.margin ?? 24) * scale) /
              Math.max(1, pageWidth)) *
              100,
          ),
        )}%`;
        const verticalInset = `${Math.min(
          45,
          Math.max(
            0,
            ((Number(entry.verticalMargin ?? entry.margin ?? 24) * scale) /
              Math.max(1, pageHeight)) *
              100,
          ),
        )}%`;
        const placement =
          isWatermark
            ? styles.watermark
            : `${styles.slot} ${styles[entry.vertical ?? "footer"]} ${styles[entry.horizontal ?? "center"]}`;
        const style = {
          color: entry.color,
          opacity: entry.opacity,
          fontFamily: fontFamily(entry.font),
          fontSize:
            isWatermark
              ? `${Math.max(6, (entry.fontSize / 100) * Math.min(pageWidth, pageHeight))}px`
              : `${Math.max(5, entry.fontSize * scale)}px`,
          ...(isWatermark
            ? {
                left: `${(entry.x ?? 0.5) * 100}%`,
                top: `${(entry.y ?? 0.5) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${-Number(entry.angle ?? 0)}deg)`,
              }
            : {
                ...(entry.vertical === "header"
                  ? { top: verticalInset }
                  : { bottom: verticalInset }),
                ...(entry.horizontal === "left"
                  ? { left: horizontalInset }
                  : entry.horizontal === "right"
                    ? { right: horizontalInset }
                    : {}),
              }),
        } satisfies CSSProperties;
        if (entry.kind === "watermark-image") {
          const source = entry.dataItemId
            ? resolveWatermarkImageUrl?.(entry.dataItemId)
            : "";
          if (!source) return null;
          const width = entry.imageWidthFraction
            ? entry.imageWidthFraction * pageWidth
            : Math.min(pageWidth, pageHeight) * (entry.scaleFraction ?? 0.35);
          const height = entry.imageHeightFraction
            ? entry.imageHeightFraction * pageHeight
            : width / Math.max(0.02, entry.imageAspectRatio ?? 1);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.key}
              className={`${placement} ${styles.watermarkImage}`}
              style={{ ...style, width, height }}
              src={source}
              alt=""
              draggable={false}
            />
          );
        }
        return (
          <span key={entry.key} className={placement} style={style}>
            {entry.text}
          </span>
        );
      })}
    </div>
  );
}

export default function PdfDecorationDialog({
  open,
  kind,
  decorations,
  currentPage,
  pageCount,
  returnFocusRef,
  onCancel,
  onCommit,
  onRemove,
  onUploadWatermarkImage,
  resolveWatermarkImageUrl,
  watermarkImageDisabledReason,
  pagePreview = null,
  pageSizePoints = null,
}: PdfDecorationDialogProps) {
  const t = useTranslations("console-notebooks");
  const [draft, setDraft] = useState<PdfDecorationDraft>(() =>
    cloneDraft(
      currentDecoration(decorations, kind) ??
        createDefaultPdfDecoration(kind, currentPage),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [watermarkImageError, setWatermarkImageError] = useState<string | null>(
    null,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const colorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [activeHeaderFooterSlot, setActiveHeaderFooterSlot] =
    useState<HeaderFooterSlot>({ vertical: "header", horizontal: "left" });
  const firstFieldRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const operationInFlightRef = useRef(false);
  const activeHeaderFooterSlotRef = useRef<HeaderFooterSlot>({
    vertical: "header",
    horizontal: "left",
  });
  const headerFooterInputRefs = useRef(new Map<string, HTMLInputElement>());
  const existing = currentDecoration(decorations, kind);

  useEffect(() => {
    if (!open) return;
    setDraft(
      cloneDraft(
        currentDecoration(decorations, kind) ??
          createDefaultPdfDecoration(kind, currentPage),
      ),
    );
    setPaletteOpen(false);
    setMediaBusy(false);
    setWatermarkImageError(null);
    setOperationError(null);
    operationInFlightRef.current = false;
    activeHeaderFooterSlotRef.current = {
      vertical: "header",
      horizontal: "left",
    };
    setActiveHeaderFooterSlot(activeHeaderFooterSlotRef.current);
  }, [currentPage, decorations, kind, open]);

  useEffect(() => {
    setOperationError(null);
  }, [draft]);

  const labels = useMemo(() => {
    const titles = {
      watermark: t("pdf.decoration.titleWatermark"),
      "page-number": t("pdf.decoration.titlePageNumber"),
      "header-footer": t("pdf.decoration.titleHeaderFooter"),
    };
    return {
      title: titles[kind],
      description:
        kind === "header-footer"
          ? t("pdf.decoration.headerFooterDescription")
          : t("pdf.decoration.description"),
      save: existing ? t("pdf.decoration.update") : t("pdf.decoration.add"),
      cancel: t("pdf.decoration.cancel"),
      remove: t("pdf.decoration.remove"),
      saveFailure:
        kind === "watermark"
          ? t("pdf.decoration.saveFailureWatermark")
          : kind === "page-number"
            ? t("pdf.decoration.saveFailurePageNumber")
            : t("pdf.decoration.saveFailureHeaderFooter"),
      removeFailure: t("pdf.decoration.removeFailure"),
    };
  }, [existing, kind, t]);

  const customRangeInvalid =
    draft.range.mode === "custom" &&
    parsePdfDecorationRangeSpec(draft.range.spec ?? "", pageCount) === null;
  const imageWatermarkAvailable = Boolean(
    onUploadWatermarkImage && resolveWatermarkImageUrl,
  );
  const imageDisabledReason =
    watermarkImageDisabledReason ??
    t("pdf.decoration.imageWatermarkUnavailable");
  const contentInvalid =
    draft.kind === "watermark"
      ? draft.sourceKind === "text"
        ? draft.text.trim() === ""
        : !draft.image || !imageWatermarkAvailable
      : draft.kind === "header-footer"
        ? !Object.values(draft.slots.header).some((value) => value.trim()) &&
          !Object.values(draft.slots.footer).some((value) => value.trim())
        : false;

  // The start number is a whole number: 2.5 is refused with a reason, not
  
  const startNumberInvalid =
    draft.kind === "page-number" &&
    (!Number.isInteger(draft.start) ||
      draft.start < 0 ||
      draft.start > 1_000_000_000);
  const commit = async () => {
    if (
      contentInvalid ||
      customRangeInvalid ||
      startNumberInvalid ||
      busy ||
      mediaBusy ||
      operationInFlightRef.current
    )
      return;
    operationInFlightRef.current = true;
    setBusy(true);
    setOperationError(null);
    try {
      const committed = {
        ...draft,
        appliedAt: new Date().toISOString(),
      } as PdfDecorationDraft;
      await onCommit(replaceDecoration(decorations, committed, kind));
    } catch (error) {
      setOperationError(pdfWriteRefusalReason(error) ?? labels.saveFailure);
    } finally {
      operationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || busy || mediaBusy || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setBusy(true);
    setOperationError(null);
    try {
      await onRemove(kind);
    } catch (error) {
      setOperationError(pdfWriteRefusalReason(error) ?? labels.removeFailure);
    } finally {
      operationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const setRange = (next: PdfDecorationPageRange["mode"]) => {
    setDraft((current) => ({
      ...current,
      range: {
        mode: next,
        ...(next === "current-onward" || next === "current-only"
          ? { anchorPage: Math.max(1, currentPage) }
          : {}),
        ...(next === "custom"
          ? { spec: current.range.spec ?? String(currentPage) }
          : {}),
      },
    }));
  };

  const setActiveSlot = (slot: HeaderFooterSlot) => {
    activeHeaderFooterSlotRef.current = slot;
    setActiveHeaderFooterSlot(slot);
    setOperationError(null);
  };

  const insertHeaderFooterToken = (token: "{date}" | "{page}" | "{pages}") => {
    if (draft.kind !== "header-footer") return;
    const slot = activeHeaderFooterSlotRef.current;
    const key = `${slot.vertical}:${slot.horizontal}`;
    const input = headerFooterInputRefs.current.get(key) ?? null;
    const current = draft.slots[slot.vertical][slot.horizontal];
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? start;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`.slice(
      0,
      HEADER_FOOTER_SLOT_MAX_LENGTH,
    );
    const caret = Math.min(start + token.length, next.length);
    setDraft({
      ...draft,
      slots: {
        ...draft.slots,
        [slot.vertical]: {
          ...draft.slots[slot.vertical],
          [slot.horizontal]: next,
        },
      },
    });
    setOperationError(null);
    window.requestAnimationFrame(() => {
      const currentInput = headerFooterInputRefs.current.get(key);
      currentInput?.focus();
      currentInput?.setSelectionRange(caret, caret);
    });
  };

  // The box keeps what is typed (OfficeDraftNumberInput); only the model
  // value is clamped, so "1" on the way to "10" is not rewritten to 1.4 under
  
  const updateHeaderFooterMargin = (
    side: keyof PdfHeaderFooterMargins,
    millimetres: number | null,
  ) => {
    if (draft.kind !== "header-footer") return;
    if (millimetres === null || !Number.isFinite(millimetres)) return;
    const points = clampDecorationMarginPoints(millimetres);
    setDraft({
      ...draft,
      margins: { ...draft.margins, [side]: points },
    });
    setOperationError(null);
  };

  const rangeNames = rangeLabels(t);
  const dialogPreview = replaceDecoration(decorations, draft, kind);
  // The preview has the page's own proportions and, when it is available,
  
  const previewPointWidth =
    pageSizePoints && pageSizePoints.width > 0
      ? pageSizePoints.width
      : pagePreview && pagePreview.width > 0 && pagePreview.height > 0
        ? (792 * pagePreview.width) / pagePreview.height
        : 612;
  const previewPointHeight =
    pageSizePoints && pageSizePoints.height > 0
      ? pageSizePoints.height
      : 792;
  const fontSizeValue =
    draft.kind === "watermark"
      ? String(
          Math.round(
            (draft.sourceKind === "image"
              ? draft.scaleFraction
              : draft.fontFraction) * 100,
          ),
        )
      : String(draft.fontSize);
  const updateFontSize = (value: string): boolean => {
    const parsed = Number(value);
    const min =
      draft.kind === "watermark" && draft.sourceKind === "image" ? 8 :
      draft.kind === "watermark" ? 2 : 4;
    const max =
      draft.kind === "watermark" && draft.sourceKind === "image" ? 90 :
      draft.kind === "watermark" ? 50 : 72;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return false;
    setDraft((current) =>
      current.kind === "watermark"
        ? current.sourceKind === "image"
          ? { ...current, scaleFraction: parsed / 100 }
          : { ...current, fontFraction: parsed / 100 }
        : { ...current, fontSize: parsed },
    );
    return true;
  };

  const uploadWatermarkImage = async (file: File | null) => {
    if (!file || !onUploadWatermarkImage || mediaBusy) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setWatermarkImageError(t("pdf.decoration.imageTypeInvalid"));
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    setMediaBusy(true);
    setWatermarkImageError(null);
    try {
      const dimensions = await readWatermarkImageSize(file);
      const dataItemId = await onUploadWatermarkImage(file);
      const image: PdfWatermarkImageSource = {
        dataItemId,
        filename: file.name,
        mimeType: file.type,
        ...dimensions,
      };
      setDraft((current) =>
        current.kind === "watermark"
          ? { ...current, sourceKind: "image", image }
          : current,
      );
    } catch {
      setWatermarkImageError(t("pdf.decoration.imageUploadFailed"));
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
      setMediaBusy(false);
    }
  };

  return (
    // A page-decoration command is an Office dialog like the reader's others:
    // the shared shell and chrome (title, description, Cancel and the default
    // action last), not the console's permission sheet.
    <OfficeDialogShell
      open={open}
      title={labels.title}
      description={labels.description}
      defaultActionLabel={labels.save}
      busyActionLabel={
        mediaBusy ? t("pdf.decoration.uploading") : t("pdf.decoration.saving")
      }
      cancelActionLabel={labels.cancel}
      onDefaultAction={() => void commit()}
      onCancel={onCancel}
      busy={busy || mediaBusy}
      defaultActionDisabled={
        contentInvalid || customRangeInvalid || startNumberInvalid
      }
      initialFocusRef={firstFieldRef}
      returnFocusRef={returnFocusRef}
      className={`max-h-[calc(100vh-48px)] overflow-y-auto sm:max-w-[760px]`}
      testIdPrefix={`pdf-decoration-${kind}`}
    >
      <div
        className={styles.layout}
        onKeyDown={(event) => {
          const target = event.target;
          if (
            event.key !== "Enter" ||
            event.defaultPrevented ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            !(target instanceof HTMLInputElement) ||
            [
              "button",
              "checkbox",
              "color",
              "file",
              "image",
              "radio",
              "range",
              "reset",
              "submit",
            ].includes(target.type)
          ) {
            return;
          }
          event.preventDefault();
          if (
            busy ||
            mediaBusy ||
            contentInvalid ||
            customRangeInvalid ||
            startNumberInvalid
          ) {
            return;
          }
          void commit();
        }}
      >
        <div className={styles.form}>
          {draft.kind === "watermark" ? (
            <fieldset className={styles.sourceFieldset}>
              <legend>{t("pdf.decoration.watermarkSource")}</legend>
              <div className={styles.sourceChoices}>
                <label className={styles.radioField}>
                  <input
                    ref={(element) => {
                      firstFieldRef.current = element;
                    }}
                    type="radio"
                    name="pdf-watermark-source"
                    value="text"
                    checked={draft.sourceKind === "text"}
                    onChange={() =>
                      setDraft({ ...draft, sourceKind: "text" })
                    }
                  />
                  <span>{t("pdf.decoration.sourceText")}</span>
                </label>
                <label
                  className={styles.radioField}
                  title={
                    imageWatermarkAvailable
                      ? undefined
                      : imageDisabledReason
                  }
                >
                  <input
                    type="radio"
                    name="pdf-watermark-source"
                    value="image"
                    checked={draft.sourceKind === "image"}
                    disabled={!imageWatermarkAvailable}
                    aria-describedby={
                      imageWatermarkAvailable
                        ? undefined
                        : "pdf-watermark-image-disabled-reason"
                    }
                    data-disabled-reason={
                      imageWatermarkAvailable
                        ? undefined
                        : imageDisabledReason
                    }
                    onChange={() =>
                      setDraft({ ...draft, sourceKind: "image" })
                    }
                  />
                  <span>{t("pdf.decoration.sourceImage")}</span>
                </label>
              </div>
              {draft.sourceKind === "text" ? (
                <label className={styles.field}>
                  <span>{t("pdf.decoration.watermarkText")}</span>
                  <input
                    value={draft.text}
                    maxLength={240}
                    onChange={(event) =>
                      setDraft({ ...draft, text: event.target.value })
                    }
                    data-testid="pdf-decoration-watermark-text"
                  />
                </label>
              ) : (
                <div className={styles.imageSource}>
                  <button
                    type="button"
                    className={officeDialogParts.compactButton}
                    disabled={!imageWatermarkAvailable || mediaBusy}
                    title={
                      imageWatermarkAvailable
                        ? undefined
                        : imageDisabledReason
                    }
                    onClick={() => imageInputRef.current?.click()}
                    data-testid="pdf-decoration-watermark-image-browse"
                  >
                    {mediaBusy
                      ? t("pdf.decoration.uploading")
                      : t("pdf.decoration.chooseImage")}
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) =>
                      void uploadWatermarkImage(event.target.files?.[0] ?? null)
                    }
                    hidden
                  />
                  <span className={styles.imageFilename}>
                    {draft.image?.filename ??
                      t("pdf.decoration.noImageSelected")}
                  </span>
                  {watermarkImageError ? (
                    <small role="alert">{watermarkImageError}</small>
                  ) : null}
                  {!imageWatermarkAvailable ? (
                    <small id="pdf-watermark-image-disabled-reason">
                      {imageDisabledReason}
                    </small>
                  ) : null}
                </div>
              )}
            </fieldset>
          ) : null}

          {draft.kind === "page-number" ? (
            <>
              <label className={styles.field}>
                <span>{t("pdf.decoration.numberFormat")}</span>
                <select
                  ref={(element) => {
                    firstFieldRef.current = element;
                  }}
                  value={draft.format}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      format: event.target
                        .value as PdfPageNumberDecoration["format"],
                    })
                  }
                >
                  <option value="number">1, 2, 3…</option>
                  <option value="zh-page-of-total">第1/X页</option>
                  <option value="number-of-total">1 / X</option>
                  <option value="zh-page-label">第1页</option>
                  <option value="zh-page-total-label">第1页，共X页</option>
                  <option value="page-of-total">Page 1 / X</option>
                  <option value="page-label">Page 1</option>
                  <option value="page-total-label">Page 1, X pages</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>{t("pdf.decoration.startNumber")}</span>
                <input
                  type="number"
                  min={0}
                  max={1_000_000_000}
                  step={1}
                  value={Number.isFinite(draft.start) ? draft.start : ""}
                  aria-invalid={startNumberInvalid}
                  data-testid="pdf-decoration-page-number-start"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      start:
                        event.target.value.trim() === ""
                          ? Number.NaN
                          : Number(event.target.value),
                    })
                  }
                />
                {startNumberInvalid ? (
                  <small data-testid="pdf-decoration-page-number-start-error">
                    {t("pdf.decoration.startNumberInvalid")}
                  </small>
                ) : null}
              </label>
              <div className={styles.inlineFields}>
                <label className={styles.field}>
                  <span>{t("pdf.decoration.verticalPosition")}</span>
                  <select
                    value={draft.vertical}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        vertical: event.target
                          .value as PdfPageNumberDecoration["vertical"],
                      })
                    }
                  >
                    <option value="header">{t("pdf.decoration.header")}</option>
                    <option value="footer">{t("pdf.decoration.footer")}</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t("pdf.decoration.alignment")}</span>
                  <select
                    value={draft.horizontal}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        horizontal: event.target
                          .value as PdfDecorationHorizontal,
                      })
                    }
                  >
                    <option value="left">{t("pdf.decoration.left")}</option>
                    <option value="center">{t("pdf.decoration.center")}</option>
                    <option value="right">{t("pdf.decoration.right")}</option>
                  </select>
                </label>
              </div>
              {

}
              <div className={styles.inlineFields}>
                <label className={styles.field}>
                  <span>
                    {draft.vertical === "header"
                      ? t("pdf.decoration.fromTopMm")
                      : t("pdf.decoration.fromBottomMm")}
                  </span>
                  <OfficeDraftNumberInput
                    flagOutOfRange
                    min={DECORATION_MARGIN_MIN_MM}
                    max={DECORATION_MARGIN_MAX_MM}
                    step={0.1}
                    value={pdfPointsToMillimetres(draft.margin)}
                    format={formatDecorationMillimetres}
                    parse={parseDecorationNumber}
                    onCommit={(millimetres) => {
                      if (millimetres === null) return;
                      setDraft({
                        ...draft,
                        margin: clampDecorationMarginPoints(millimetres),
                      });
                    }}
                    testId="pdf-decoration-page-number-margin-vertical"
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    {draft.horizontal === "right"
                      ? t("pdf.decoration.fromRightMm")
                      : t("pdf.decoration.fromLeftMm")}
                  </span>
                  <OfficeDraftNumberInput
                    flagOutOfRange
                    min={DECORATION_MARGIN_MIN_MM}
                    max={DECORATION_MARGIN_MAX_MM}
                    step={0.1}
                    disabled={draft.horizontal === "center"}
                    value={pdfPointsToMillimetres(
                      draft.horizontalMargin ?? draft.margin,
                    )}
                    format={formatDecorationMillimetres}
                    parse={parseDecorationNumber}
                    onCommit={(millimetres) => {
                      if (millimetres === null) return;
                      setDraft({
                        ...draft,
                        horizontalMargin:
                          clampDecorationMarginPoints(millimetres),
                      });
                    }}
                    testId="pdf-decoration-page-number-margin-horizontal"
                  />
                </label>
              </div>
            </>
          ) : null}

          {draft.kind === "header-footer" ? (
            <div className={styles.sixSlots}>
              <div
                className={styles.tokenToolbar}
                role="group"
                aria-label={t("pdf.decoration.insertField")}
              >
                <span className={styles.activeSlotLabel}>
                  {activeHeaderFooterSlot.vertical === "header"
                    ? t("pdf.decoration.header")
                    : t("pdf.decoration.footer")}
                  ·
                  {activeHeaderFooterSlot.horizontal === "left"
                    ? t("pdf.decoration.left")
                    : activeHeaderFooterSlot.horizontal === "center"
                      ? t("pdf.decoration.center")
                      : t("pdf.decoration.right")}
                </span>
                <button
                  ref={colorAnchorRef}
                  type="button"
                  onClick={() => insertHeaderFooterToken("{date}")}
                  className={officeDialogParts.compactButton}
                  data-testid="pdf-decoration-token-date"
                >
                  <CalendarDays size={15} aria-hidden />
                  {t("pdf.decoration.fieldDate")}
                </button>
                <button
                  type="button"
                  onClick={() => insertHeaderFooterToken("{page}")}
                  className={officeDialogParts.compactButton}
                  data-testid="pdf-decoration-token-page"
                >
                  <Hash size={15} aria-hidden />
                  {t("pdf.decoration.fieldPage")}
                </button>
                <button
                  type="button"
                  onClick={() => insertHeaderFooterToken("{pages}")}
                  className={officeDialogParts.compactButton}
                  data-testid="pdf-decoration-token-pages"
                >
                  <Files size={15} aria-hidden />
                  {t("pdf.decoration.fieldPageCount")}
                </button>
              </div>
              {(["header", "footer"] as const).map((vertical) => (
                <fieldset key={vertical}>
                  <legend>
                    {vertical === "header"
                      ? t("pdf.decoration.header")
                      : t("pdf.decoration.footer")}
                  </legend>
                  {(["left", "center", "right"] as const).map(
                    (horizontal, index) => (
                      <label key={horizontal} className={styles.field}>
                        <span>
                          {horizontal === "left"
                            ? t("pdf.decoration.left")
                            : horizontal === "center"
                              ? t("pdf.decoration.center")
                              : t("pdf.decoration.right")}
                        </span>
                        <input
                          ref={(element) => {
                            const key = `${vertical}:${horizontal}`;
                            if (element) {
                              headerFooterInputRefs.current.set(key, element);
                            } else {
                              headerFooterInputRefs.current.delete(key);
                            }
                            if (vertical === "header" && index === 0) {
                              firstFieldRef.current = element;
                            }
                          }}
                          value={draft.slots[vertical][horizontal]}
                          maxLength={HEADER_FOOTER_SLOT_MAX_LENGTH}
                          data-active={
                            activeHeaderFooterSlot.vertical === vertical &&
                            activeHeaderFooterSlot.horizontal === horizontal
                              ? "true"
                              : "false"
                          }
                          onFocus={() =>
                            setActiveSlot({ vertical, horizontal })
                          }
                          onChange={(event) => {
                            setDraft({
                              ...draft,
                              slots: {
                                ...draft.slots,
                                [vertical]: {
                                  ...draft.slots[vertical],
                                  [horizontal]: event.target.value,
                                },
                              },
                            });
                            setOperationError(null);
                          }}
                          data-testid={`pdf-decoration-${vertical}-${horizontal}`}
                        />
                      </label>
                    ),
                  )}
                </fieldset>
              ))}
              <p className={styles.tokenHint}>
                {t("pdf.decoration.tokensHint")}
              </p>
              <fieldset className={styles.marginFieldset}>
                <legend>{t("pdf.decoration.pageMargins")}</legend>
                <div className={styles.marginGrid}>
                  {(
                    ["top", "bottom", "left", "right"] as const
                  ).map((side) => (
                    <label key={side} className={styles.field}>
                      <span>
                        {side === "top"
                          ? t("pdf.decoration.marginTopMm")
                          : side === "bottom"
                            ? t("pdf.decoration.marginBottomMm")
                            : side === "left"
                              ? t("pdf.decoration.marginLeftMm")
                              : t("pdf.decoration.marginRightMm")}
                      </span>
                      <OfficeDraftNumberInput
                        flagOutOfRange
                        min={DECORATION_MARGIN_MIN_MM}
                        max={DECORATION_MARGIN_MAX_MM}
                        step={0.1}
                        value={pdfPointsToMillimetres(draft.margins[side])}
                        format={formatDecorationMillimetres}
                        parse={parseDecorationNumber}
                        onCommit={(millimetres) =>
                          updateHeaderFooterMargin(side, millimetres)
                        }
                        testId={`pdf-decoration-margin-${side}`}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {draft.kind !== "watermark" || draft.sourceKind === "text" ? (
            <div className={styles.styleRow}>
              <div className={styles.sharedPicker}>
                <span>{t("pdf.decoration.font")}</span>
                <RibbonFontFamilyPicker
                  label={t("pdf.decoration.font")}
                  activeLabel={
                    draft.font === "sans"
                      ? t("pdf.decoration.fontSans")
                      : draft.font === "serif"
                        ? t("pdf.decoration.fontSerif")
                        : t("pdf.decoration.fontMono")
                  }
                  activeFontFamily={fontFamily(draft.font)}
                  sections={fontSections(t)}
                  onSelect={(value) =>
                    value &&
                    setDraft({ ...draft, font: value as PdfDecorationFont })
                  }
                  testId="pdf-decoration-font"
                />
              </div>
              <div className={styles.sharedPicker}>
                <span>
                  {draft.kind === "watermark"
                    ? t("pdf.decoration.relativeSize")
                    : t("pdf.decoration.fontSizePt")}
                </span>
                <RibbonValueCombobox
                  testId="pdf-decoration-font-size"
                  label={t("pdf.decoration.fontSize")}
                  placeholder={fontSizeValue}
                  value={fontSizeValue}
                  inputMode="decimal"
                  options={(draft.kind === "watermark"
                    ? WATERMARK_SIZE_OPTIONS
                    : SIZE_OPTIONS
                  ).map((value) => ({ value, label: value }))}
                  onDraftChange={(value) => void updateFontSize(value)}
                  onFocusChange={() => undefined}
                  onRememberSelection={() => undefined}
                  onCommit={(value) => updateFontSize(value)}
                  restoreMenuInvokerOnSelect
                />
              </div>
              <div className={styles.colorField}>
                <span>{t("pdf.decoration.color")}</span>
                <button
                  type="button"
                  className={styles.colorButton}
                  style={{ background: draft.color }}
                  aria-label={t("pdf.decoration.chooseColor")}
                  onClick={() => setPaletteOpen((value) => !value)}
                  data-testid="pdf-decoration-color"
                />
                {paletteOpen ? (
                  <OfficeColorPalettePopover
                    anchorRef={colorAnchorRef}
                    value={draft.color}
                    labels={{
                      themeColors: t("pdf.decoration.themeColors"),
                      standardColors: t("pdf.decoration.standardColors"),
                      recentColors: t("pdf.decoration.recentColors"),
                      moreColors: t("pdf.decoration.moreColors"),
                    }}
                    onPick={(value) => {
                      if (value) setDraft({ ...draft, color: value });
                      setPaletteOpen(false);
                    }}
                    onDismiss={() => setPaletteOpen(false)}
                    testIdPrefix="pdf-decoration-color"
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.imageScaleRow}>
              <div className={styles.sharedPicker}>
                <span>{t("pdf.decoration.relativeScale")}</span>
                <RibbonValueCombobox
                  testId="pdf-decoration-image-scale"
                  label={t("pdf.decoration.imageScale")}
                  placeholder={fontSizeValue}
                  value={fontSizeValue}
                  inputMode="decimal"
                  options={WATERMARK_IMAGE_SCALE_OPTIONS.map((value) => ({
                    value,
                    label: value,
                  }))}
                  onDraftChange={(value) => void updateFontSize(value)}
                  onFocusChange={() => undefined}
                  onRememberSelection={() => undefined}
                  onCommit={(value) => updateFontSize(value)}
                  restoreMenuInvokerOnSelect
                />
              </div>
            </div>
          )}

          {draft.kind === "watermark" ? (
            <>
              <div className={styles.inlineFields}>
                <label className={styles.field}>
                  <span>{t("pdf.decoration.rotation")}</span>
                  <select
                    value={draft.angle}
                    onChange={(event) =>
                      setDraft({ ...draft, angle: Number(event.target.value) })
                    }
                  >
                    <option value={45}>+45°</option>
                    <option value={0}>0°</option>
                    <option value={-45}>-45°</option>
                    <option value={90}>90°</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>
                    {t("pdf.decoration.opacity", {
                      percent: Math.round(draft.opacity * 100),
                    })}
                  </span>
                  <input
                    type="range"
                    min={0.02}
                    max={1}
                    step={0.01}
                    value={draft.opacity}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <fieldset className={styles.geometryFieldset}>
                <legend>{t("pdf.decoration.repeatPosition")}</legend>
                <div className={styles.repeatRow}>
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={draft.repeatRows > 1}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          repeatRows: event.target.checked ? 2 : 1,
                        })
                      }
                    />
                    <span>{t("pdf.decoration.tileWatermark")}</span>
                  </label>
                  <label className={styles.field}>
                    <span>{t("pdf.decoration.rows")}</span>
                    <select
                      value={draft.repeatRows > 1 ? draft.repeatRows : 2}
                      disabled={draft.repeatRows === 1}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          repeatRows: Number(
                            event.target.value,
                          ) as PdfWatermarkRepeatRows,
                        })
                      }
                    >
                      {WATERMARK_REPEAT_ROW_OPTIONS.map((rows) => (
                        <option key={rows} value={rows}>
                          {rows}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.positionGrid}>
                  <label className={styles.field}>
                    <span>{t("pdf.decoration.horizontalAnchor")}</span>
                    <select
                      value={draft.horizontal}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          horizontal: event.target
                            .value as PdfDecorationHorizontal,
                        })
                      }
                    >
                      <option value="left">{t("pdf.decoration.left")}</option>
                      <option value="center">
                        {t("pdf.decoration.center")}
                      </option>
                      <option value="right">{t("pdf.decoration.right")}</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>{t("pdf.decoration.verticalAnchor")}</span>
                    <select
                      value={draft.vertical}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          vertical: event.target.value as PdfWatermarkVertical,
                        })
                      }
                    >
                      <option value="top">{t("pdf.decoration.top")}</option>
                      <option value="center">
                        {t("pdf.decoration.center")}
                      </option>
                      <option value="bottom">
                        {t("pdf.decoration.bottom")}
                      </option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>{t("pdf.decoration.horizontalOffset")}</span>
                    <OfficeDraftNumberInput
                      flagOutOfRange
                      min={-45}
                      max={45}
                      step={1}
                      value={draft.offsetX * 100}
                      format={(percent) => String(Math.round(percent))}
                      parse={parseDecorationNumber}
                      onCommit={(percent) => {
                        if (percent === null) return;
                        setDraft({
                          ...draft,
                          offsetX: Math.min(45, Math.max(-45, percent)) / 100,
                        });
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{t("pdf.decoration.verticalOffset")}</span>
                    <OfficeDraftNumberInput
                      flagOutOfRange
                      min={-45}
                      max={45}
                      step={1}
                      value={draft.offsetY * 100}
                      format={(percent) => String(Math.round(percent))}
                      parse={parseDecorationNumber}
                      onCommit={(percent) => {
                        if (percent === null) return;
                        setDraft({
                          ...draft,
                          offsetY: Math.min(45, Math.max(-45, percent)) / 100,
                        });
                      }}
                    />
                  </label>
                </div>
              </fieldset>
            </>
          ) : null}

          <div className={styles.rangeRow}>
            <label className={styles.field}>
              <span>{t("pdf.decoration.pageRange")}</span>
              <select
                value={draft.range.mode}
                onChange={(event) =>
                  setRange(event.target.value as PdfDecorationPageRange["mode"])
                }
              >
                {Object.entries(rangeNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {draft.range.mode === "custom" ? (
              <label className={styles.field}>
                <span>{t("pdf.decoration.rangePagesExample")}</span>
                <input
                  value={draft.range.spec ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      range: { ...draft.range, spec: event.target.value },
                    })
                  }
                  aria-invalid={customRangeInvalid}
                  data-testid="pdf-decoration-custom-range"
                />
                {customRangeInvalid ? (
                  <small>
                    {t("pdf.decoration.rangeInvalid", { pageCount })}
                  </small>
                ) : null}
              </label>
            ) : null}
          </div>

          {operationError ? (
            <p
              className={styles.operationError}
              role="alert"
              data-testid={`pdf-decoration-${kind}-error`}
            >
              {operationError}
            </p>
          ) : null}

          {busy && pageCount >= PDF_DECORATION_LONG_DOCUMENT_PAGES ? (
            // A decoration is written on every page it names in one save:
            // on a long document that is seconds, and the dialog says what
            // it is doing meanwhile.
            <p
              className={styles.operationProgress}
              role="status"
              data-testid={`pdf-decoration-${kind}-progress`}
            >
              {t("pdf.decoration.savingLongDocument", { pageCount })}
            </p>
          ) : null}

          {existing ? (
            <button
              type="button"
              className={`${officeDialogParts.compactButton} ${styles.removeButton}`}
              disabled={busy || mediaBusy}
              onClick={() => void remove()}
              data-testid={`pdf-decoration-${kind}-remove`}
            >
              {labels.remove}
            </button>
          ) : null}
        </div>

        <div className={styles.previewPanel}>
          <strong>{t("pdf.decoration.pagePreview")}</strong>
          <div
            className={styles.previewPage}
            style={{ aspectRatio: `${previewPointWidth} / ${previewPointHeight}` }}
            data-testid="pdf-decoration-preview-page"
          >
            {pagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local data URL of the rendered page
              <img
                src={pagePreview.src}
                alt=""
                draggable={false}
                className={styles.previewImage}
                data-testid="pdf-decoration-preview-image"
              />
            ) : (
              <span className={styles.previewText} />
            )}
            <PdfDecorationOverlay
              decorations={dialogPreview}
              page={Math.min(Math.max(1, currentPage), Math.max(1, pageCount))}
              pageCount={Math.max(1, pageCount)}
              pageWidth={220}
              pageHeight={(220 * previewPointHeight) / previewPointWidth}
              scale={220 / previewPointWidth}
              preview
              resolveWatermarkImageUrl={resolveWatermarkImageUrl}
            />
          </div>
          <span>
            {Math.min(Math.max(1, currentPage), Math.max(1, pageCount))} /{" "}
            {Math.max(1, pageCount)}
          </span>
        </div>
      </div>
    </OfficeDialogShell>
  );
}
