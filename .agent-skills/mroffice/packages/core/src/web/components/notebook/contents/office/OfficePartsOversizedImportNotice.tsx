"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import { useTranslations } from "../../../../../host/next-intl";

import { OriginalFileCard } from "./OriginalFileCard";
import { OversizedImportNotice } from "./OversizedImportNotice";
import type { OversizedImportPreview } from "../../../../lib/office/oversized-import";

/**
 * The read-only preview notice of a deck or a document.
 *
 * A deck says which of its slides are on the page, since a reader can check
 * that against the file. A document says only that its beginning is shown: its
 * unit here is a block, which is nothing a reader can count in Word.
 */
export const OfficePartsOversizedImportNotice = memo(
  function OfficePartsOversizedImportNotice({
    pageId,
    preview,
  }: {
    pageId: string;
    preview: OversizedImportPreview;
  }) {
    const t = useTranslations("console-notebooks");
    if (preview.sourceKind === "file") return <OriginalFileCard pageId={pageId} preview={preview} />;
    if (preview.sourceKind !== "pptx" && preview.sourceKind !== "docx") return null;
    const presentation = preview.sourceKind === "pptx";
    return (
      <OversizedImportNotice
        pageId={pageId}
        format={preview.sourceKind}
        testIdPrefix={presentation ? "presentation" : "document"}
        original={preview.original}
        body={t(
          presentation
            ? "oversizedImport.presentationBody"
            : "oversizedImport.documentBody",
        )}
        details={
          presentation ? (
            preview.shown !== null && preview.total !== null ? (
              <p>
                {preview.shown >= preview.total
                  ? t("oversizedImport.presentationAllSlides", { total: preview.total })
                  : t("oversizedImport.presentationSlides", {
                      shown: preview.shown,
                      total: preview.total,
                    })}
              </p>
            ) : null
          ) : preview.shown !== null && preview.total !== null ? (
            <p>
              {preview.shown >= preview.total
                ? t("oversizedImport.documentWhole")
                : t("oversizedImport.documentBlocks", {
                    shown: preview.shown,
                    total: preview.total,
                  })}
            </p>
          ) : (
            <p>{t("oversizedImport.documentBeginning")}</p>
          )
        }
      />
    );
  },
);
