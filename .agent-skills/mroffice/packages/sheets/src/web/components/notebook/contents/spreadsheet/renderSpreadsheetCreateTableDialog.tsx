"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { type CreateTableDraft } from "./spreadsheetDialogDrafts";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { type SpreadsheetRangePick } from "./useSpreadsheetRangePick";

/** What renderSpreadsheetCreateTableDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetCreateTableDialogInputs {
  rangePick: SpreadsheetRangePick;
  confirmCreateTable: () => void;
  createTableDraft: CreateTableDraft | null;
  createTableErrorMessage: string | null;
  createTableRangeInputRef: RefObject<HTMLInputElement | null>;
  setCreateTableDraft: Dispatch<SetStateAction<CreateTableDraft | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetCreateTableDialog({
  rangePick,
  confirmCreateTable,
  createTableDraft,
  createTableErrorMessage,
  createTableRangeInputRef,
  setCreateTableDraft,
  t,
}: RenderSpreadsheetCreateTableDialogInputs) {
  // Collapsed while a range of it is picked on the sheet.
  if (rangePick.picking("spreadsheet-create-table")) return null;
  return (
       createTableDraft ? (
        <OfficeDialogShell
          open
          title={t("spreadsheet.createTable.title")}
          description={
            <span className="sr-only">
              {t("spreadsheet.createTable.source")}
            </span>
          }
          defaultActionLabel={t("spreadsheet.fmtOk")}
          cancelActionLabel={t("spreadsheet.fmtCancel")}
          onDefaultAction={confirmCreateTable}
          onCancel={() => setCreateTableDraft(null)}
          initialFocusRef={createTableRangeInputRef}
          testIdPrefix="spreadsheet-create-table"
        >
          <label
            style={{
              display: "grid",
              gap: 6,
              color: "var(--foreground, #111827)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>{t("spreadsheet.createTable.source")}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <input
                ref={createTableRangeInputRef}
                value={createTableDraft.range}
                onChange={(event) =>
                  setCreateTableDraft((current) =>
                    current
                      ? { ...current, range: event.target.value, error: null }
                      : current,
                  )
                }
                aria-invalid={Boolean(createTableDraft.error)}
                data-testid="spreadsheet-create-table-range"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 32,
                  border: `1px solid ${
                    createTableDraft.error ? "#dc2626" : "var(--border, #d1d5db)"
                  }`,
                  borderRadius: 5,
                  background: "var(--background, #ffffff)",
                  color: "var(--foreground, #111827)",
                  padding: "0 8px",
                  fontSize: 12,
                  fontWeight: 400,
                }}
              />
              <SpreadsheetCollapseDialogButton
                label={t("spreadsheet.cfDialog.collapse")}
                onClick={() =>
                  rangePick.start({
                    id: "spreadsheet-create-table-range",
                    dialogLabel: t("spreadsheet.createTable.title"),
                    inputLabel: t("spreadsheet.createTable.source"),
                    style: "absoluteFormula",
                    value: String(createTableDraft.range),
                    onChange: (text: string) => setCreateTableDraft((current) =>
                      current
                        ? { ...current, range: text, error: null }
                        : current,
                    ),
                  })
                }
                testId="spreadsheet-create-table-range-pick"
              />
            </span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "var(--foreground, #111827)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={createTableDraft.hasHeaders}
              onChange={(event) =>
                setCreateTableDraft((current) =>
                  current
                    ? {
                        ...current,
                        hasHeaders: event.target.checked,
                        error: null,
                      }
                    : current,
                )
              }
              data-testid="spreadsheet-create-table-headers"
            />
            <span>{t("spreadsheet.createTable.hasHeaders")}</span>
          </label>
          {createTableErrorMessage ? (
            <span
              role="alert"
              data-testid="spreadsheet-create-table-error"
              style={{ color: "#dc2626", fontSize: 12 }}
            >
              {createTableErrorMessage}
            </span>
          ) : null}
        </OfficeDialogShell>
      ) : null
  );
}
