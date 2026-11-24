"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OversizedImportNotice } from "@mrnote/core/web/components/notebook/contents/office/OversizedImportNotice.tsx";
import type { OversizedImportPreview } from "@mrnote/core/web/lib/office/oversized-import.ts";

/** Sheets named inline; the rest are counted. */
const LISTED_SHEETS = 3;

export interface OversizedImportSheetLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * The read-only preview notice of a workbook, saying which rows each cut sheet
 * shows and that its formulas are the values the file saved.
 */
export const SpreadsheetOversizedImportNotice = memo(
  function SpreadsheetOversizedImportNotice({
    pageId,
    preview,
    sheets,
  }: {
    pageId: string;
    preview: OversizedImportPreview;
    sheets: readonly OversizedImportSheetLabel[];
  }) {
    const t = useTranslations("console-notebooks");
    const names = new Map(sheets.map((sheet) => [sheet.id, sheet.name]));
    const cuts = preview.sheets.flatMap((cut) => {
      const name = names.get(cut.sheetId);
      return name === undefined ? [] : [{ ...cut, name }];
    });
    const listed = cuts.slice(0, LISTED_SHEETS);

    return (
      <OversizedImportNotice
        pageId={pageId}
        format="xlsx"
        testIdPrefix="spreadsheet"
        original={preview.original}
        body={t("spreadsheet.oversizedImport.body")}
        details={
          <>
            {listed.length > 0 ? (
              <ul className="list-disc pl-5">
                {listed.map((cut) => (
                  <li key={cut.sheetId}>
                    {cut.rowsShown > 0
                      ? t("spreadsheet.oversizedImport.sheetRows", {
                          sheet: cut.name,
                          shown: cut.rowsShown,
                          total: cut.rowCount,
                        })
                      : t("spreadsheet.oversizedImport.sheetNoRows", {
                          sheet: cut.name,
                          total: cut.rowCount,
                        })}
                  </li>
                ))}
                {cuts.length > listed.length ? (
                  <li>
                    {t("spreadsheet.oversizedImport.moreSheets", {
                      count: cuts.length - listed.length,
                    })}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {preview.formulasShowSavedValues ? (
              <p>{t("spreadsheet.oversizedImport.formulas")}</p>
            ) : null}
          </>
        }
      />
    );
  },
);
