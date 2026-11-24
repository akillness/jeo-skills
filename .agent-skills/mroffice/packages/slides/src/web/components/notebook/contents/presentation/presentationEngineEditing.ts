/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A body's rows with the letters its editing host holds and the window has
 * not drawn yet (a typing burst: `typingBurstRef` in PresentationWindow keeps
 * the window from rendering while letters come). The engine's drawing of a
 * body being typed in (`PresentationEngineEditLayer`) lays these rows out, so
 * each letter is drawn the moment the host has it, without the window.
 *
 * Only an edit inside one row, in words the row draws as its runs say them
 * (no field shown in their place), is taken; anything else answers null and
 * the host's own rows are shown until the window draws the body again.
 */
import type { TextRun } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import type { PresentationParagraphRowPlan } from "./presentationParagraphRows";

function rowText(row: PresentationParagraphRowPlan): string {
  return row.runs ? row.runs.map((run) => run.text).join("") : row.text;
}

/** The rows' words as a body's host reads them: its rows joined by "\n". */
export function presentationRowsText(rows: readonly PresentationParagraphRowPlan[]): string {
  return rows.map(rowText).join("\n");
}

/**
 * `rows` with their words made `after` (the host's text), or null when the
 * difference is not one edit inside one row, or touches a row whose runs do
 * not say its words (`rowText` differs from `row.text`).
 */
export function presentationRowsWithTypedText(
  rows: readonly PresentationParagraphRowPlan[],
  after: string,
  /** `presentationRowsText(rows)`, when the caller has it. */
  before: string = presentationRowsText(rows),
): readonly PresentationParagraphRowPlan[] | null {
  if (before === after) return rows;
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (suffix < limit - prefix && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)) suffix += 1;
  const removedEnd = before.length - suffix;
  const inserted = after.slice(prefix, after.length - suffix);
  // A row's break typed or taken: the window's to draw.
  if (inserted.includes("\n") || before.slice(prefix, removedEnd).includes("\n")) return null;
  let rowStart = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const text = rowText(row);
    const rowEnd = rowStart + text.length;
    if (prefix >= rowStart && removedEnd <= rowEnd) {
      if (row.runs && text !== row.text) return null;
      const from = prefix - rowStart;
      const to = removedEnd - rowStart;
      const nextText = text.slice(0, from) + inserted + text.slice(to);
      const runs = row.runs ? editRuns(row.runs, from, to, inserted) : null;
      const out = rows.slice();
      out[index] = { ...row, text: nextText, runs };
      return out;
    }
    rowStart = rowEnd + 1;
  }
  return null;
}

/**
 * The runs with [from, to) of their words replaced by `inserted`: the new
 * letters take the run they are typed into (the run before the caret at a run
 * boundary, as the model's letters in place do; the first run at the row's
 * start).
 */
function editRuns(runs: readonly TextRun[], from: number, to: number, inserted: string): TextRun[] {
  const out: TextRun[] = [];
  let start = 0;
  let placed = inserted.length === 0;
  runs.forEach((run, index) => {
    const end = start + run.text.length;
    let text = run.text;
    const cutFrom = Math.max(from, start) - start;
    const cutTo = Math.min(to, end) - start;
    if (cutFrom < cutTo) text = text.slice(0, cutFrom) + text.slice(cutTo);
    const takes = !placed && (from < end || (from === end && from > start) || (from === 0 && index === 0) || index === runs.length - 1) && from >= start;
    if (takes) {
      const at = from - start;
      text = text.slice(0, at) + inserted + text.slice(at);
      placed = true;
    }
    out.push(text === run.text ? run : { ...run, text });
    start = end;
  });
  return out;
}
