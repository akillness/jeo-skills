/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ReactElement } from "react";
import type { EditorDefinition, EditorProps } from "mroffice-core";

export declare const MRSHEET_TYPE: "mrnote.spreadsheet.v1";
export type Cell = { value: string; kind: "number" | "text"; formula?: string };
/** A .mrsheet workbook: the editor's own JSON. */
export type Workbook = { type: string; title: string; sheets: Array<{ id: string; name: string; rowCount: number; columnCount: number; cells: Record<string, Cell> }> } & Record<string, unknown>;

export declare function emptyWorkbook(title?: string): Workbook;
export declare function workbookFromDelimited(name: string, text: string, delimiter: string): Workbook;
/** The first sheet's values as CSV/TSV. */
export declare function delimitedFromWorkbook(book: Workbook, delimiter: string): string;
/** A local file (.mrsheet, .csv, .tsv) as a workbook. */
export declare function workbookFromFile(name: string, bytes: Uint8Array): Workbook;
export declare function SpreadsheetEditor(props: EditorProps): ReactElement;
export declare const sheetsEditor: EditorDefinition;
export default sheetsEditor;
