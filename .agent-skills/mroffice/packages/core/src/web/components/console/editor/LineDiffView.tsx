"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Render a {@link LineDiff} as added / removed / context rows (green / red /
 * neutral). Shared by the inline AI-proposal preview and the selection-action
 * rewrite preview so both surfaces show the SAME line-diff UI from the single
 * `lib/proposal-diff.ts` source of truth.
 *
 * Pure presentation — it takes an already-computed diff and renders it. `wrap`
 * controls line wrapping: code diffs keep `pre` (no wrap) so indentation is
 * exact; prose-rewrite diffs use `pre-wrap` so long sentences stay readable.
 */

import type { DiffRow, LineDiff } from "../../../__cut__/mf8df84de44";

export interface LineDiffViewProps {
  diff: LineDiff;
  /** Wrap long lines (prose) vs. keep them on one line (code). Default true. */
  wrap?: boolean;
  testId?: string;
  /**
   * Show only this many unchanged rows around each change and fold the rest
   * into one line; unset shows every row. A document proposal's diff is the
   * whole page otherwise, which hides the few paragraphs that changed.
   */
  collapseContext?: number;
  /** The folded line's words, given how many rows it stands for. */
  collapsedLabel?: (count: number) => string;
}

type RenderRow = { kind: "row"; row: DiffRow; index: number } | { kind: "folded"; count: number; index: number };

/** The rows to draw: every row, or the changed ones with `context` rows around them. */
export function collapseDiffRows(rows: readonly DiffRow[], context: number | undefined): RenderRow[] {
  if (context === undefined || context < 0) {
    return rows.map((row, index) => ({ kind: "row", row, index }));
  }
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.type === "context") return;
    for (let i = Math.max(0, index - context); i <= Math.min(rows.length - 1, index + context); i += 1) {
      keep[i] = true;
    }
  });
  const out: RenderRow[] = [];
  let folded = 0;
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (folded > 0) {
        out.push({ kind: "folded", count: folded, index: index - folded });
        folded = 0;
      }
      out.push({ kind: "row", row, index });
    } else {
      folded += 1;
    }
  });
  if (folded > 0) out.push({ kind: "folded", count: folded, index: rows.length - folded });
  return out;
}

export default function LineDiffView({
  diff,
  wrap = true,
  testId,
  collapseContext,
  collapsedLabel,
}: LineDiffViewProps) {
  const rendered = collapseDiffRows(diff.rows, collapseContext);
  return (
    <pre
      data-testid={testId}
      className="m-0 px-0 py-1"
      style={{
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        whiteSpace: wrap ? "pre-wrap" : "pre",
        wordBreak: wrap ? "break-word" : "normal",
      }}
    >
      {rendered.map((entry) =>
        entry.kind === "folded" ? (
          <div
            key={`folded-${entry.index}`}
            data-diff-type="folded"
            data-testid="line-diff-folded"
            className="text-slate-400 dark:text-slate-500"
            style={{ padding: "2px 12px", fontStyle: "italic", userSelect: "none" }}
          >
            {collapsedLabel ? collapsedLabel(entry.count) : `… ${entry.count} …`}
          </div>
        ) : (
        <div
          key={entry.index}
          data-diff-type={entry.row.type}
          className={
            entry.row.type === "added"
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
              : entry.row.type === "removed"
                ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100"
                : "text-slate-600 dark:text-slate-300"
          }
          style={{ padding: "0 12px" }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "1.25em",
              userSelect: "none",
              opacity: 0.7,
            }}
          >
            {entry.row.type === "added" ? "+" : entry.row.type === "removed" ? "-" : " "}
          </span>
          {entry.row.text === "" ? " " : entry.row.text}
        </div>
        ),
      )}
    </pre>
  );
}
