/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { documentTableMeasurementUnit } from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";

export interface DocumentTableInsertDialogCopy {
  readonly appInsertMenu: string;
  readonly appTableMenu: string;
  readonly appInsertSubmenu: string;
  readonly appTableDialog: string;
  readonly title: string;
  readonly description: string;
  readonly columns: string;
  readonly rows: string;
  readonly autoFitBehavior: string;
  readonly initialColumnWidth: string;
  readonly auto: string;
  readonly autoFitContents: string;
  readonly autoFitWindow: string;
  readonly measurementUnit: "cm" | "in";
  readonly setAsDefault: string;
  readonly cancel: string;
  readonly insert: string;
  readonly requiredError: string;
  readonly integerError: string;
  readonly columnsRangeError: string;
  readonly rowsRangeError: string;
  readonly capacityError: string;
  readonly largeTableContainerError: string;
  readonly widthNumberError: string;
  readonly widthRangeError: (
    minimum: string,
    maximum: string,
    unit: string,
  ) => string;
  readonly insertUnavailable: string;
  readonly preferenceUnavailable: string;
}

type BaseDocumentTableInsertDialogCopy = Omit<
  DocumentTableInsertDialogCopy,
  "measurementUnit"
>;

type DocumentTableInsertDialogTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function baseDocumentTableInsertDialogCopy(
  t: DocumentTableInsertDialogTranslate,
): BaseDocumentTableInsertDialogCopy {
  const k = (leaf: string) => t(`toolbar.insertTableDialog.${leaf}`);
  return {
    appInsertMenu: k("appInsertMenu"),
    appTableMenu: k("appTableMenu"),
    appInsertSubmenu: k("appInsertSubmenu"),
    appTableDialog: k("appTableDialog"),
    title: k("title"),
    description: k("description"),
    columns: k("columns"),
    rows: k("rows"),
    autoFitBehavior: k("autoFitBehavior"),
    initialColumnWidth: k("initialColumnWidth"),
    auto: k("auto"),
    autoFitContents: k("autoFitContents"),
    autoFitWindow: k("autoFitWindow"),
    setAsDefault: k("setAsDefault"),
    cancel: k("cancel"),
    insert: k("insert"),
    requiredError: k("requiredError"),
    integerError: k("integerError"),
    columnsRangeError: k("columnsRangeError"),
    rowsRangeError: k("rowsRangeError"),
    capacityError: k("capacityError"),
    largeTableContainerError: k("largeTableContainerError"),
    widthNumberError: k("widthNumberError"),
    widthRangeError: (minimum, maximum, unit) =>
      t("toolbar.insertTableDialog.widthRangeError", {
        minimum,
        maximum,
        unit,
      }),
    insertUnavailable: k("insertUnavailable"),
    preferenceUnavailable: k("preferenceUnavailable"),
  };
}

export function documentTableInsertDialogCopy(
  locale: string,
  t: DocumentTableInsertDialogTranslate,
): DocumentTableInsertDialogCopy {
  return {
    ...baseDocumentTableInsertDialogCopy(t),
    measurementUnit: documentTableMeasurementUnit(locale),
  };
}
