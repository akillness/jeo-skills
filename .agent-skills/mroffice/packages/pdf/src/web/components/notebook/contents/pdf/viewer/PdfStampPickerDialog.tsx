"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import insertRibbonStyles from "../PdfInsertRibbonTab.module.css";
import { useRef, type Dispatch, type SetStateAction, type RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@mrnote/core/web/components/ui/dialog.tsx";
import { PDF_POPOVER_CHROME } from "./popoverChrome";
import {
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  OfficeGalleryMenuGrid,
  OfficeGalleryMenuTileBody,
  officeGalleryMenuStyles,
} from "@mrnote/core/web/components/office-ribbon/OfficeGalleryMenu.tsx";
import {
  X,
  Image as ImageIcon,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { STAMP_PRESETS } from "../../../../../lib/pdf/stamps-annotation";
import { SIGNATURE_UPLOAD_MIME_TYPES } from "@mrnote/core/web/lib/pdf/signatures.ts";
import { pdfStampPictureFromFile } from "../../../../../lib/pdf/stamp-picture-file";
import type { PdfManagedStampCommandOrigin } from "./readerStamp";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfStampPickerDialogProps {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  stampPickerOpen: boolean;
  setStampPickerOpen: Dispatch<SetStateAction<boolean>>;
  setStampPickerImageOnly: Dispatch<SetStateAction<boolean>>;
  stampPickerImageOnly: boolean;
  stampPickerReturnFocusRef: RefObject<HTMLButtonElement | null>;
  setArmedStamp: Dispatch<SetStateAction<{ kind: "preset"; preset: string; origin: PdfManagedStampCommandOrigin; } | { kind: "image"; image: string; aspectRatio: number; origin: PdfManagedStampCommandOrigin; } | null>>;
  stampPickerOrigin: PdfManagedStampCommandOrigin;
  setStampUploadError: Dispatch<SetStateAction<boolean>>;
  stampUploadError: boolean;
  stampUploadRunRef: RefObject<number>;
}

export function PdfStampPickerDialog({
  t,
  stampPickerOpen,
  setStampPickerOpen,
  setStampPickerImageOnly,
  stampPickerImageOnly,
  stampPickerReturnFocusRef,
  setArmedStamp,
  stampPickerOrigin,
  setStampUploadError,
  stampUploadError,
  stampUploadRunRef,
}: PdfStampPickerDialogProps) {
  // The upload entry is a button: a <label> around a hidden file input took
  // no keyboard focus, so Tab never reached it (user audit PDF 0014).
  const stampUploadInputRef = useRef<HTMLInputElement | null>(null);
  return (
    stampPickerOpen ? (
      <Dialog
        open={stampPickerOpen}
        onOpenChange={(open) => {
          if (!open) stampUploadRunRef.current += 1;
          setStampPickerOpen(open);
          if (!open) {
            setStampPickerImageOnly(false);
            setStampUploadError(false);
          }
        }}
      >
        <DialogContent
          skin="none"
          className={`${PDF_POPOVER_CHROME} ${insertRibbonStyles.decorationDialog}`}
          showCloseButton={false}
          data-pdf-ribbon-surface="annotate"
          data-testid="pdf-stamp-picker"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = stampPickerReturnFocusRef.current;
            stampPickerReturnFocusRef.current = null;
            trigger?.focus();
          }}
        >
          <div className={officeDialogParts.header}>
            <DialogTitle className={officeDialogParts.title}>
              {stampPickerImageOnly
                ? t("pdf.insertImage")
                : t("pdfStampTool.pickerLabel")}
            </DialogTitle>
            <DialogClose
              className={officeDialogParts.close}
              aria-label={t("common.close")}
            >
              <X size={14} aria-hidden="true" />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            {stampPickerImageOnly
              ? t("pdf.insertImage")
              : t("pdfStampTool.pickerLabel")}
          </DialogDescription>
          <div
            className={insertRibbonStyles.decorationForm}
            role="group"
            aria-label={t("pdfStampTool.pickerLabel")}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {

}
            {stampPickerImageOnly ? null : (
              <OfficeGalleryMenuGrid columns={2} tileWidth={132} testId="pdf-stamp-preset-grid">
                {STAMP_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={officeGalleryMenuStyles.tile}
                    data-testid="pdf-stamp-preset"
                    data-preset={preset.key}
                    aria-label={preset.text}
                    title={preset.text}
                    onClick={() => {
                      stampUploadRunRef.current += 1;
                      setArmedStamp({
                        kind: "preset",
                        preset: preset.key,
                        origin: stampPickerOrigin,
                      });
                      setStampPickerOpen(false);
                    }}
                  >
                    <OfficeGalleryMenuTileBody
                      thumbnail={
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color: preset.color,
                            border: `2px solid ${preset.color}`,
                            borderRadius: 6,
                          }}
                        >
                          {preset.text}
                        </span>
                      }
                      name={preset.text}
                    />
                  </button>
                ))}
              </OfficeGalleryMenuGrid>
            )}
            <button
              type="button"
              className={officeDialogParts.compactButton}
              data-testid="pdf-stamp-upload-button"
              onClick={() => stampUploadInputRef.current?.click()}
              style={{ alignSelf: "flex-start" }}
            >
              <ImageIcon size={13} aria-hidden />
              {t("pdfStampTool.upload")}
            </button>
              <input
                ref={stampUploadInputRef}
                type="file"
                accept={SIGNATURE_UPLOAD_MIME_TYPES.join(",")}
                data-testid="pdf-stamp-upload"
                tabIndex={-1}
                aria-hidden
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const stampUploadRun = ++stampUploadRunRef.current;
                  // The file as the page's writer takes it, fitted to the
                  // stamp's 1 MB when larger (stamp-picture-file.ts, shared
                  // with the live editor's insertPicture).
                  void pdfStampPictureFromFile(
                    file,
                    () => stampUploadRunRef.current === stampUploadRun,
                  ).then((taken) => {
                    if (stampUploadRunRef.current !== stampUploadRun) return;
                    if (!taken) {
                      setStampUploadError(true);
                      return;
                    }
                    setStampUploadError(false);
                    setArmedStamp({
                      kind: "image",
                      image: taken.image,
                      aspectRatio: taken.aspectRatio,
                      origin: stampPickerOrigin,
                    });
                    setStampPickerImageOnly(false);
                    setStampPickerOpen(false);
                  });
                }}
              />
            {stampUploadError ? (
              <span
                role="alert"
                data-testid="pdf-stamp-upload-error"
                className={officeDialogParts.error}
              >
                {t("pdfStampTool.uploadError")}
              </span>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    ) : null
  );
}
