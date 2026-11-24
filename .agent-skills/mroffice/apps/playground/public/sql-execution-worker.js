/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/* MRNote SQL execution worker. Authored SQL never runs on the page thread. */
"use strict";

const PROTOCOL = "mrnote.sql-execution.v1";
const RUNTIME = "sqljs-1.14.1";
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 300000;
const MAX_COLUMNS = 100;
const MAX_ROWS = 1000;
const MAX_CELL_CHARS = 2000;
const MAX_COLUMN_CHARS = 1000;
const MAX_TABLES = 100;
const MAX_TABLE_METADATA_BYTES = 32 * 1024;
// Result sets before the last one in a run: shown as text above the last
// table, as the sqlite3 shell prints every SELECT. Bounded on their own.
const MAX_EARLIER_RESULTS = 20;
const MAX_EARLIER_ROWS = 50;
const encoder = new TextEncoder();

let database = null;
let runtimeFailed = false;

function boundedString(value, limit) {
  const rendered = typeof value === "string" ? value : String(value ?? "");
  return rendered.length <= limit ? rendered : `${rendered.slice(0, limit - 1)}…`;
}

function boundedCell(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return boundedString(value, MAX_CELL_CHARS);
  if (value instanceof Uint8Array) return `[blob ${value.byteLength} bytes]`;
  return "<unsupported value>";
}

function stringBytes(value) {
  return encoder.encode(value).byteLength;
}

function cellBytes(value) {
  return stringBytes(typeof value === "string" ? value : String(value ?? ""));
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function inspectTables() {
  if (!database) return [];
  const summaries = [];
  let metadataBytes = 0;
  try {
    const result = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const rows = result.length > 0 ? result[0].values || [] : [];
    for (const row of rows.slice(0, MAX_TABLES)) {
      const name = boundedString(row[0], MAX_COLUMN_CHARS);
      if (!name) continue;
      const quoted = quoteIdentifier(name);
      let rowCount = 0;
      let columns = [];
      try {
        const count = database.exec(`SELECT COUNT(*) FROM ${quoted}`);
        const rawCount = count.length > 0 ? Number(count[0].values?.[0]?.[0] ?? 0) : 0;
        rowCount = Number.isSafeInteger(rawCount) && rawCount >= 0 ? rawCount : 0;
        const info = database.exec(`PRAGMA table_info(${quoted})`);
        columns = (info.length > 0 ? info[0].values || [] : [])
          .slice(0, MAX_COLUMNS)
          .map((column) => boundedString(column[1], MAX_COLUMN_CHARS));
      } catch {
        // A table changed during its own statement; keep the trusted name only.
      }
      const candidateBytes =
        stringBytes(name) +
        columns.reduce((total, column) => total + stringBytes(column), 0);
      if (metadataBytes + candidateBytes > MAX_TABLE_METADATA_BYTES) break;
      metadataBytes += candidateBytes;
      summaries.push({ name, rowCount, columns });
    }
  } catch {
    return [];
  }
  return summaries;
}

function failure(id, message) {
  return {
    protocol: PROTOCOL,
    runtime: RUNTIME,
    type: "result",
    id,
    status: "runtime-error",
    error: boundedString(message || "SQL execution failed.", 50000),
    tables: inspectTables(),
  };
}

function failRuntime() {
  if (runtimeFailed) return;
  runtimeFailed = true;
  database = null;
  self.postMessage({ protocol: PROTOCOL, runtime: RUNTIME, type: "fatal" });
}

function boundedResultSet(result, maxRows, outputBytes) {
  const rawColumns = Array.isArray(result.columns) ? result.columns : [];
  const columns = rawColumns
    .slice(0, MAX_COLUMNS)
    .map((column) => boundedString(column, MAX_COLUMN_CHARS));
  const sourceRows = Array.isArray(result.values) ? result.values : [];
  const rows = [];
  let used = columns.reduce((total, column) => total + stringBytes(column), 0);
  let truncated = sourceRows.length > maxRows || rawColumns.length > MAX_COLUMNS;
  for (const sourceRow of sourceRows.slice(0, maxRows)) {
    if (!Array.isArray(sourceRow)) {
      truncated = true;
      continue;
    }
    const row = sourceRow
      .slice(0, columns.length)
      .map((cell) => boundedCell(cell));
    while (row.length < columns.length) row.push(null);
    const rowBytes = row.reduce((total, cell) => total + cellBytes(cell), 0);
    if (used + rowBytes > outputBytes) {
      truncated = true;
      break;
    }
    used += rowBytes;
    rows.push(row);
  }
  if (rows.length < sourceRows.length) truncated = true;
  return { columns, rows, totalRows: sourceRows.length, truncated, used };
}

function queryReceipt(id, result, outputBytes, earlierResults) {
  // The earlier result sets spend the budget first, so the last one (the
  // table) is what gets cut when a run returns more than the budget.
  const earlier = [];
  let earlierBytes = 0;
  for (const earlierResult of earlierResults.slice(-MAX_EARLIER_RESULTS)) {
    const set = boundedResultSet(
      earlierResult,
      MAX_EARLIER_ROWS,
      Math.max(0, Math.floor(outputBytes / 2) - earlierBytes),
    );
    if (set.columns.length === 0) continue;
    earlierBytes += set.used;
    earlier.push({
      columns: set.columns,
      rows: set.rows,
      totalRows: set.totalRows,
      truncated: set.truncated,
    });
  }
  outputBytes -= earlierBytes;
  const rawColumns = Array.isArray(result.columns) ? result.columns : [];
  const columns = rawColumns
    .slice(0, MAX_COLUMNS)
    .map((column) => boundedString(column, MAX_COLUMN_CHARS));
  const sourceRows = Array.isArray(result.values) ? result.values : [];
  const rows = [];
  let used = columns.reduce((total, column) => total + stringBytes(column), 0);
  let truncated = sourceRows.length > MAX_ROWS || rawColumns.length > MAX_COLUMNS;
  for (const sourceRow of sourceRows.slice(0, MAX_ROWS)) {
    if (!Array.isArray(sourceRow)) {
      truncated = true;
      continue;
    }
    const row = sourceRow
      .slice(0, columns.length)
      .map((cell) => boundedCell(cell));
    while (row.length < columns.length) row.push(null);
    const rowBytes = row.reduce((total, cell) => total + cellBytes(cell), 0);
    if (used + rowBytes > outputBytes) {
      truncated = true;
      break;
    }
    used += rowBytes;
    rows.push(row);
  }
  if (rows.length < sourceRows.length) truncated = true;
  return {
    protocol: PROTOCOL,
    runtime: RUNTIME,
    type: "result",
    id,
    status: "succeeded",
    kind: "query",
    columns,
    rows,
    totalRows: sourceRows.length,
    truncated,
    ...(earlier.length > 0 ? { earlier } : {}),
    tables: inspectTables(),
  };
}

function runSqlRequest(id, source, outputBytes) {
  if (!database) return failure(id, "SQL runtime is unavailable.");
  try {
    const results = database.exec(source);
    if (results.length === 0) {
      const rowsModified = Number(database.getRowsModified());
      return {
        protocol: PROTOCOL,
        runtime: RUNTIME,
        type: "result",
        id,
        status: "succeeded",
        kind: "statement",
        rowsModified:
          Number.isSafeInteger(rowsModified) && rowsModified >= 0 ? rowsModified : 0,
        tables: inspectTables(),
      };
    }
    return queryReceipt(
      id,
      results[results.length - 1],
      outputBytes,
      results.slice(0, -1),
    );
  } catch (error) {
    return failure(id, error instanceof Error ? error.message : String(error));
  }
}

self.onmessage = (event) => {
  const value = event.data;
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const id = record && typeof record.id === "string" ? record.id : "";
  if (
    runtimeFailed ||
    !record ||
    record.protocol !== PROTOCOL ||
    record.type !== "run" ||
    id.length === 0 ||
    id.length > 160 ||
    typeof record.source !== "string" ||
    encoder.encode(record.source).byteLength > MAX_SOURCE_BYTES ||
    !Number.isSafeInteger(record.outputBytes) ||
    record.outputBytes <= 0 ||
    record.outputBytes > MAX_OUTPUT_BYTES
  ) {
    self.postMessage(failure(id, "Malformed SQL execution request."));
    return;
  }
  try {
    self.postMessage(runSqlRequest(id, record.source, record.outputBytes));
  } catch {
    self.postMessage(failure(id, "SQL execution receipt failed."));
  }
};

try {
  importScripts("/sql-wasm.js");
  const initialize = self.initSqlJs;
  if (typeof initialize !== "function") throw new Error("sql.js loader unavailable");
  initialize({ locateFile: () => "/sql-wasm.wasm" })
    .then((SQL) => {
      if (runtimeFailed || !SQL || typeof SQL.Database !== "function") {
        throw new Error("sql.js module unavailable");
      }
      database = new SQL.Database();
      self.postMessage({ protocol: PROTOCOL, runtime: RUNTIME, type: "ready" });
    })
    .catch(failRuntime);
} catch {
  failRuntime();
}
