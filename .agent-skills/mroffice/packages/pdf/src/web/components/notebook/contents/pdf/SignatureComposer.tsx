"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  Eraser,
  Upload,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogClassName,
  officeDialogParts as parts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import {
  SIGNATURE_MAX_IMAGE_BYTES,
  DEFAULT_SIGNATURE_FONT,
  SIGNATURE_FONT_KEYS,
  SIGNATURE_MAX_TEXT,
  SIGNATURE_UPLOAD_MIME_TYPES,
  isSignatureFont,
  normalizeSignatureText,
  resolveSignatureFont,
  sanitizeSignatureImage,
  validateSignatureImageFile,
  type SignatureKind,
} from "@mrnote/core/web/lib/pdf/signatures.ts";
import { pdfStampPictureForWriter } from "../../../../lib/pdf/stamp-picture-check";

// Keep the full panel and its focus ring inside the clipped PDF page.
const COMPOSER_EDGE_INSET = 16;
// A font choice is a tile that previews the signature face; it keeps
// its 44px tile. The chrome sizes every other control.
const SIGNATURE_FONT_TILE_CLASS = "min-h-11 min-w-11";
const SIGNATURE_COMPOSER_CHROME = officeDialogClassName({ tone: "pdf" });

// Drawing-pad pixel size. A modest fixed canvas (the page-overlay box can be any
// size; the captured PNG scales into it). Kept small so the persisted data URL
// stays well under the 1 MB decoded-byte cap enforced by signatures.ts.
const PAD_WIDTH = 300;
const PAD_HEIGHT = 120;
const PAD_STROKE = "#0f172a";
const PAD_LINE_WIDTH = 2.2;

export interface SignatureDraft {
  kind: SignatureKind;
  text: string;
  font: string;
  image: string | null;
}

export type SignatureComposerMode = "draw" | "type" | "upload";

export interface SignatureComposerProps {
  /** Page-relative anchor in percent [0..100] (positions the composer). */
  x: number;
  y: number;
  /** The current draft (controlled by the parent). */
  draft: SignatureDraft;
  /** Canonical Insert subcommand that opened this composer. */
  initialMode?: SignatureComposerMode;
  /** Update the draft (kind / text / font / drawn image). */
  onChange: (next: SignatureDraft) => void;
  saving?: boolean;
  /**
   * Persist the composed signature. Receives the FINAL draft (with the just-
   * captured canvas image for a drawn signature) so the parent never has to read
   * back a freshly-set `draft` prop on the next render.
   */
  onConfirm: (finalDraft: SignatureDraft) => void;
  /** Dismiss without persisting (discards the in-progress signature). */
  onCancel: () => void;
}

/**
 * Anchored composer for placing a VISUAL (non-cryptographic) signature on a PDF
 * page. Two modes:
 *
 *   - DRAWN: a `<canvas>` ink pad; pointer drags paint a line. On confirm the
 *     canvas is exported to a PNG data URL (the parent persists it via
 *     buildSignaturePayload, which re-validates it as a safe PNG/JPEG within the
 *     byte cap).
 *   - TYPED: a single-line text input rendered live in an allow-listed script
 *     font. The text is normalized by signatures.ts on persist and ALWAYS
 *     rendered as a plain text node, never innerHTML.
 *
 * No real digital-certificate signing happens here — this is a visual mark only.
 */
export default function SignatureComposer({
  x,
  y,
  draft,
  initialMode =
    draft.kind === "typed" ? "type" : draft.kind === "image" ? "upload" : "draw",
  onChange,
  saving = false,
  onConfirm,
  onCancel,
}: SignatureComposerProps) {
  const t = useTranslations("console-notebooks");
  const composerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const drawKindButtonRef = useRef<HTMLButtonElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
  const uploadReadRunRef = useRef(0);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the pad has any ink yet (gates the confirm button + "clear").
  const [hasInk, setHasInk] = useState(false);
  // Within the "drawn" kind the user can either DRAW on the pad or UPLOAD an
  // image; both persist as kind:"drawn" with an `image` data URL (so storage /
  // sanitization is unchanged). This is UI-only state — `draft.kind` stays
  // "drawn" for both. Default to the pad (the historical behaviour).
  const [padMode, setPadMode] = useState<"draw" | "upload">(
    initialMode === "upload" ? "upload" : "draw",
  );
  // Validation error for an upload attempt (localized message), or null.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clampedPosition, setClampedPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    const container = composer?.offsetParent;
    if (!composer || !(container instanceof HTMLElement)) return;

    const update = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      const composerWidth = composer.offsetWidth;
      const composerHeight = composer.offsetHeight;
      const rawLeft = (Math.min(100, Math.max(0, x)) / 100) * width;
      const rawTop = (Math.min(100, Math.max(0, y)) / 100) * height;
      const maxLeft = Math.max(
        COMPOSER_EDGE_INSET,
        width - composerWidth - COMPOSER_EDGE_INSET,
      );
      const maxTop = Math.max(
        COMPOSER_EDGE_INSET,
        height - composerHeight - COMPOSER_EDGE_INSET,
      );
      const next = {
        left: Math.min(Math.max(COMPOSER_EDGE_INSET, rawLeft), maxLeft),
        top: Math.min(Math.max(COMPOSER_EDGE_INSET, rawTop), maxTop),
      };
      setClampedPosition((current) =>
        current?.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };

    update();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(container);
    observer?.observe(composer);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [draft.image, draft.kind, padMode, uploadError, x, y]);

  useEffect(() => {
    const target =
      draft.kind === "typed"
        ? textInputRef.current
        : draft.kind === "image"
          ? uploadButtonRef.current
          : drawKindButtonRef.current;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  }, [draft.kind, padMode]);

  useEffect(
    () => () => {
      uploadReadRunRef.current += 1;
    },
    [],
  );

  const invalidateUploadRead = useCallback(() => {
    uploadReadRunRef.current += 1;
  }, []);

  const padPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // Map client coords into the canvas's intrinsic pixel space.
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    [],
  );

  const handlePadDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (saving) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const point = padPoint(event);
      if (!point) return;
      drawingRef.current = true;
      lastPointRef.current = point;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
    },
    [padPoint, saving],
  );

  const handlePadMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const point = padPoint(event);
      const last = lastPointRef.current;
      if (!canvas || !ctx || !point || !last) return;
      ctx.strokeStyle = PAD_STROKE;
      ctx.lineWidth = PAD_LINE_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      if (!hasInk) setHasInk(true);
    },
    [hasInk, padPoint],
  );

  const endStroke = useCallback(() => {
    drawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange({ ...draft, image: null });
  }, [draft, onChange]);

  // Switch DRAWN sub-mode (pad vs upload). Leaving upload clears any picked
  // image + error; entering upload resets the pad-ink flag so the confirm gate
  // is recomputed from the upload state instead.
  const switchPadMode = useCallback(
    (mode: "draw" | "upload") => {
      invalidateUploadRead();
      setPadMode(mode);
      setUploadError(null);
      // Dropping the current image when switching sub-modes keeps the two paths
      // from confusingly sharing a stale picked/painted image.
      onChange({
        ...draft,
        kind: mode === "upload" ? "image" : "drawn",
        image: null,
      });
      setHasInk(false);
    },
    [draft, invalidateUploadRead, onChange],
  );

  const handleUploadPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      // Allow re-picking the SAME file later (the change event won't fire for an
      // identical value otherwise).
      event.target.value = "";
      if (!file) return;
      const uploadReadRun = ++uploadReadRunRef.current;
      setUploadError(null);
      const check = validateSignatureImageFile(file);
      if (!check.ok) {
        setUploadError(
          check.reason === "size"
            ? t("pdfSign.uploadErrorSize")
            : t("pdfSign.uploadErrorType"),
        );
        onChange({ ...draft, kind: "image", image: null });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (uploadReadRunRef.current !== uploadReadRun) return;
        const result = typeof reader.result === "string" ? reader.result : "";
        // Re-validate the decoded data URL with the SAME guard the persisted
        // payload must pass (PNG/JPEG allow-list + byte cap) so a spoofed file
        // type can't smuggle non-raster content into the <img src>.
        const safe = sanitizeSignatureImage(result);
        if (!safe) {
          setUploadError(t("pdfSign.uploadErrorType"));
          onChange({ ...draft, kind: "image", image: null });
          return;
        }
        // The picture as the PDF's writer takes it (stamp-picture-check.ts):
        // a file a browser draws though its data is damaged or cut short,
        // or one larger than the writer reads, is kept as the browser draws
        // it, encoded again -- taken as it was, the signature's row was
        // refused by the writer and every later write of the page with it.
        void pdfStampPictureForWriter({ dataUrl: safe, maxBytes: SIGNATURE_MAX_IMAGE_BYTES }).then((taken) => {
          if (uploadReadRunRef.current !== uploadReadRun) return;
          const picture = taken ? sanitizeSignatureImage(taken) : null;
          if (!picture) {
            setUploadError(t("pdfSign.uploadErrorRead"));
            onChange({ ...draft, kind: "image", image: null });
            return;
          }
          onChange({ ...draft, kind: "image", image: picture });
        });
      };
      reader.onerror = () => {
        if (uploadReadRunRef.current !== uploadReadRun) return;
        setUploadError(t("pdfSign.uploadErrorRead"));
        onChange({ ...draft, kind: "image", image: null });
      };
      reader.readAsDataURL(file);
    },
    [draft, onChange, t],
  );

  const setKind = useCallback(
    (kind: SignatureKind) => {
      invalidateUploadRead();
      onChange({ ...draft, kind, image: null });
      if (kind === "drawn") {
        setHasInk(false);
        setUploadError(null);
      }
    },
    [draft, invalidateUploadRead, onChange],
  );

  const handleCancel = useCallback(() => {
    if (saving) return;
    invalidateUploadRead();
    onCancel();
  }, [invalidateUploadRead, onCancel, saving]);

  const handleConfirm = useCallback(() => {
    if (saving) return;
    if (draft.kind === "image") {
      if (!draft.image) return;
      onConfirm(draft);
      return;
    }
    if (draft.kind === "drawn") {
      const canvas = canvasRef.current;
      if (!canvas || !hasInk) return;
      // Export the pad to a PNG data URL; the parent's buildSignaturePayload
      // re-validates it (PNG/JPEG allow-list + byte cap) before persisting. Pass
      // the final draft (with the image) straight to onConfirm so there is no
      // read-back of a freshly-set prop on the next render.
      let dataUrl: string | null = null;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        dataUrl = null;
      }
      if (!dataUrl) return;
      const finalDraft = { ...draft, image: dataUrl };
      onChange(finalDraft);
      onConfirm(finalDraft);
      return;
    }
    if (!normalizeSignatureText(draft.text)) return;
    onConfirm(draft);
  }, [draft, hasInk, onChange, onConfirm, saving]);

  const left = clampedPosition
    ? `${clampedPosition.left}px`
    : `${Math.min(100, Math.max(x, 0))}%`;
  const top = clampedPosition
    ? `${clampedPosition.top}px`
    : `${Math.min(100, Math.max(y, 0))}%`;

  const canConfirm =
    !saving &&
    (draft.kind === "drawn"
      ? hasInk
      : draft.kind === "image"
        ? Boolean(draft.image)
      : normalizeSignatureText(draft.text).length > 0);

  return (
    <div
      ref={composerRef}
      className={`${SIGNATURE_COMPOSER_CHROME} pdf-signature-composer office-pop-in`}
      role="dialog"
      aria-modal="false"
      aria-label={t("pdfSign.composerLabel")}
      aria-describedby="pdf-signature-composer-note"
      data-testid="pdf-signature-composer"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || saving) return;
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
      }}
    >
      <header className={`${parts.header} pdf-signature-composer__header`}>
        <strong className={parts.title}>{t("pdfSign.title")}</strong>
        <button
          type="button"
          className={parts.close}
          onClick={handleCancel}
          aria-label={t("pdfSign.cancel")}
          title={t("pdfSign.cancel")}
          data-testid="pdf-signature-cancel"
          disabled={saving}
        >
          <X size={13} />
        </button>
      </header>

      <div
        className={`${parts.tabs} pdf-signature-composer__kinds`}
        role="group"
        aria-label={t("pdfSign.kindLabel")}
      >
        <button
          ref={drawKindButtonRef}
          type="button"
          className={`${parts.tab} pdf-signature-composer__kind`}
          aria-pressed={draft.kind === "drawn" && padMode === "draw"}
          disabled={saving}
          onClick={() => {
            if (draft.kind !== "drawn") setKind("drawn");
            switchPadMode("draw");
          }}
          data-testid="pdf-signature-kind-drawn"
        >
          {t("pdfSign.draw")}
        </button>
        <button
          type="button"
          className={`${parts.tab} pdf-signature-composer__kind`}
          aria-pressed={draft.kind === "typed"}
          disabled={saving}
          onClick={() => setKind("typed")}
          data-testid="pdf-signature-kind-typed"
        >
          {t("pdfSign.type")}
        </button>
        <button
          type="button"
          className={`${parts.tab} pdf-signature-composer__kind`}
          aria-pressed={draft.kind === "image"}
          disabled={saving}
          onClick={() => {
            switchPadMode("upload");
          }}
          data-testid="pdf-signature-kind-upload"
        >
          {t("pdfSign.upload")}
        </button>
      </div>

      {draft.kind === "drawn" && padMode === "draw" ? (
        <div className="pdf-signature-composer__pad-wrap">
          <canvas
            ref={canvasRef}
            width={PAD_WIDTH}
            height={PAD_HEIGHT}
            className="pdf-signature-composer__pad"
            data-chrome-preview=""
            data-testid="pdf-signature-pad"
            onPointerDown={handlePadDown}
            onPointerMove={handlePadMove}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
            onPointerCancel={endStroke}
          />
          <button
            type="button"
            className={`${parts.button} pdf-signature-composer__clear`}
            onClick={handleClear}
            disabled={!hasInk || saving}
            aria-label={t("pdfSign.clear")}
            title={t("pdfSign.clear")}
            data-testid="pdf-signature-clear"
          >
            <Eraser size={12} />
            {t("pdfSign.clear")}
          </button>
        </div>
      ) : draft.kind === "image" ? (
        <div
          className="pdf-signature-composer__upload"
          data-testid="pdf-signature-upload"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SIGNATURE_UPLOAD_MIME_TYPES.join(",")}
            className="pdf-signature-composer__sr"
            aria-label={t("pdfSign.uploadLabel")}
            data-testid="pdf-signature-upload-input"
            disabled={saving}
            onChange={handleUploadPick}
          />
          {draft.image ? (
            // Preview the (already-sanitized) picked image; plain <img src>, the
            // src is a re-validated PNG/JPEG data URL only. next/image can't
            // optimize a data URL, so disable the rule (as the persisted-
            // signature <img> in PDFViewer does).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.image}
              alt={t("pdfSign.uploadPreviewAlt")}
              className="pdf-signature-composer__upload-preview"
              data-chrome-preview=""
              data-testid="pdf-signature-upload-preview"
            />
          ) : null}
          <button
            ref={uploadButtonRef}
            type="button"
            className={`${parts.button} pdf-signature-composer__upload-pick`}
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            data-testid="pdf-signature-upload-pick"
          >
            <Upload size={12} />
            {draft.image ? t("pdfSign.uploadReplace") : t("pdfSign.uploadPick")}
          </button>
          {uploadError ? (
            <p
              className={`${parts.error} pdf-signature-composer__upload-error`}
              role="alert"
              data-testid="pdf-signature-upload-error"
            >
              {uploadError}
            </p>
          ) : (
            <p className={`${parts.hint} pdf-signature-composer__upload-hint`}>
              {t("pdfSign.uploadHint")}
            </p>
          )}
        </div>
      ) : (
        <div className="pdf-signature-composer__typed">
          <label className="pdf-signature-composer__field">
            <span className="pdf-signature-composer__sr">
              {t("pdfSign.textLabel")}
            </span>
            <input
              ref={textInputRef}
              type="text"
              value={draft.text}
              maxLength={SIGNATURE_MAX_TEXT}
              placeholder={t("pdfSign.textPlaceholder")}
              aria-label={t("pdfSign.textLabel")}
              data-testid="pdf-signature-text"
              disabled={saving}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
            />
          </label>
          <div
            className="pdf-signature-composer__fonts"
            role="group"
            aria-label={t("pdfSign.fontLabel")}
          >
            {SIGNATURE_FONT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`pdf-signature-composer__font${
                  draft.font === key ? " is-active" : ""
                } ${SIGNATURE_FONT_TILE_CLASS}`}
                style={{ fontFamily: resolveSignatureFont(key) }}
                aria-pressed={draft.font === key}
                aria-label={t("pdfSign.fontOption", { font: key })}
                title={key}
                disabled={saving}
                onClick={() =>
                  onChange({
                    ...draft,
                    font: isSignatureFont(key) ? key : DEFAULT_SIGNATURE_FONT,
                  })
                }
                data-testid="pdf-signature-font"
              >
                Ab
              </button>
            ))}
          </div>
          {/* Live preview — plain text node, never innerHTML. */}
          <div
            className="pdf-signature-composer__preview"
            data-chrome-preview=""
            style={{ fontFamily: resolveSignatureFont(draft.font) }}
            data-testid="pdf-signature-preview"
          >
            {normalizeSignatureText(draft.text) || t("pdfSign.previewEmpty")}
          </div>
        </div>
      )}

      <p
        id="pdf-signature-composer-note"
        className={`${parts.hint} pdf-signature-composer__upload-hint`}
      >
        {t("pdfSign.note")}
      </p>

      <footer className="pdf-signature-composer__footer">
        <button
          type="button"
          className={`${parts.primaryButton} pdf-signature-composer__confirm`}
          onClick={handleConfirm}
          disabled={!canConfirm}
          data-testid="pdf-signature-confirm"
        >
          <Check size={12} />
          {t("pdfSign.confirm")}
        </button>
      </footer>
    </div>
  );
}
