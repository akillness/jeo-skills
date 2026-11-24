/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The spreadsheet editor: SpreadsheetWindow, MR Note's spreadsheet, over a
// local file in its browser-only mode. It keeps its own workbook format
// (.mrsheet, the editor's JSON) and opens and saves CSV/TSV.
import { useEffect, useRef } from "react";
import type { EditorDefinition, EditorProps } from "@mrnote/core";

import SpreadsheetWindow from "./web/components/notebook/contents/SpreadsheetWindow";
import { looksNumeric, parseDelimited } from "./web/lib/spreadsheet/csv-import";

export const MRSHEET_TYPE = "mrnote.spreadsheet.v1";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Cell = { value: string; kind: "number" | "text"; formula?: string };
type Workbook = { type: string; title: string; sheets: Array<{ id: string; name: string; rowCount: number; columnCount: number; cells: Record<string, Cell> }> } & Record<string, unknown>;

function stem(name: string): string {
  return name.replace(/\.(mrsheet)(\.json)?$|\.[^.]+$/i, "") || "Workbook";
}

export function emptyWorkbook(title = "Workbook"): Workbook {
  return { type: MRSHEET_TYPE, title, sheets: [{ id: "sheet-1", name: "Sheet1", rowCount: 100, columnCount: 26, cells: {} }] };
}

/** A delimited text file as a one-sheet workbook. */
export function workbookFromDelimited(name: string, text: string, delimiter: string): Workbook {
  const rows = parseDelimited(text.replace(/^﻿/, ""), delimiter);
  const cells: Record<string, Cell> = {};
  let columns = 0;
  rows.forEach((row, r) => {
    columns = Math.max(columns, row.length);
    row.forEach((value, c) => {
      if (value === "") return;
      cells[`${r}:${c}`] = { value, kind: looksNumeric(value) ? "number" : "text" };
    });
  });
  const book = emptyWorkbook(stem(name));
  book.sheets[0] = { ...book.sheets[0], name: stem(name).slice(0, 31) || "Sheet1", rowCount: Math.max(100, rows.length + 20), columnCount: Math.max(26, columns + 4), cells };
  return book;
}

/** The first sheet's values as delimited text. */
export function delimitedFromWorkbook(book: Workbook, delimiter: string): string {
  const sheet = book.sheets?.[0];
  if (!sheet) return "";
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells ?? {})) {
    const [r, c] = key.split(":").map(Number);
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, c + 1);
  }
  const quote = (value: string) => (/[",\n\r\t]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    const line: string[] = [];
    for (let c = 0; c < cols; c += 1) line.push(quote(String(sheet.cells[`${r}:${c}`]?.value ?? "")));
    lines.push(line.join(delimiter));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function workbookFromFile(name: string, bytes: Uint8Array): Workbook {
  const lower = name.toLowerCase();
  const text = decoder.decode(bytes);
  if (lower.endsWith(".csv")) return workbookFromDelimited(name, text, ",");
  if (lower.endsWith(".tsv")) return workbookFromDelimited(name, text, "\t");
  if (lower.endsWith(".xlsx")) throw new Error("Excel files (.xlsx) open free in MR Office: online at https://mroffice.ai in any browser (Linux too), or in the desktop app; the open-source editor opens .mrsheet, CSV and TSV.");
  const parsed = JSON.parse(text) as Workbook;
  if (parsed.type !== MRSHEET_TYPE || !Array.isArray(parsed.sheets)) throw new Error(`${name} is not an MR Note workbook.`);
  return parsed;
}

export function SpreadsheetEditor({ file, registerSave, onSaveRequest, onDirty }: EditorProps) {
  const opened = useRef<Workbook | null>(null);
  if (!opened.current) opened.current = workbookFromFile(file.name, file.bytes);
  const latest = useRef<Workbook>(opened.current);
  useEffect(
    () =>
      registerSave(() => {
        const lower = file.name.toLowerCase();
        const delimiter = lower.endsWith(".csv") ? "," : lower.endsWith(".tsv") ? "\t" : null;
        if (delimiter) return { name: file.name, type: "text/csv;charset=utf-8", bytes: encoder.encode(delimitedFromWorkbook(latest.current, delimiter)) };
        return { name: `${stem(file.name)}.mrsheet`, type: "application/json", bytes: encoder.encode(`${JSON.stringify(latest.current)}\n`) };
      }),
    [file.name, registerSave],
  );
  return (
    <SpreadsheetWindow
      pageId={`sheet-${file.id}`}
      windowId={`window-${file.id}`}
      guestMode
      initialSpreadsheet={opened.current}
      onGuestSaveRequest={onSaveRequest}
      onGuestContentChange={(change: { final: Record<string, unknown> }) => {
        latest.current = change.final as Workbook;
        onDirty?.();
      }}
    />
  );
}

export const sheetsEditor: EditorDefinition = {
  id: "sheets",
  label: "Spreadsheet",
  extensions: [".mrsheet", ".mrsheet.json", ".csv", ".tsv"],
  newFile: () => ({ name: "Workbook.mrsheet", bytes: encoder.encode(`${JSON.stringify(emptyWorkbook())}\n`) }),
  Component: SpreadsheetEditor,
};

export default sheetsEditor;
