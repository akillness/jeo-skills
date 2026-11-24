"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties, ReactNode } from "react";
import { accountingUnderlineBlockCss } from "@mrnote/core/web/lib/spreadsheet/cell-text-effects.ts";

/**
 * The reading order and the accounting rule around a stack of cell text
 * lines (a wrapped or broken cell, live audit B397/B400), drawn as the
 * single-line display layer draws them (lib/spreadsheet/cell-text-effects):
 *
 *  - `dir` lays every line out in the cell's base direction while the lines
 *    stay where the layer's own alignment puts them;
 *  - `accounting` rules the whole cell under the last line: a column box that
 *    reaches through the layer's insets (`insetLeft` / `insetRight`) and pads
 *    them back, keeping the lines aligned by `alignItems` as the layer did.
 *
 * A cell with neither gets its children back unwrapped, so its markup does
 * not change.
 */
export function SpreadsheetCellTextEffects({
  dir,
  accounting,
  insetLeft,
  insetRight,
  alignItems,
  children,
}: {
  dir: "ltr" | "rtl" | "auto" | undefined;
  accounting: "single" | "double" | null;
  insetLeft: number;
  insetRight: number;
  alignItems: CSSProperties["alignItems"];
  children?: ReactNode;
}) {
  if (!dir && !accounting) return <>{children}</>;
  // `display: contents` keeps the lines the layer's own items: the direction
  // reaches their text without moving them.
  const directed = dir ? <span dir={dir} style={{ display: "contents" }}>{children}</span> : children;
  if (!accounting) return directed;
  return (
    <span
      data-accounting-underline={accounting}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems,
        ...accountingUnderlineBlockCss(accounting, insetLeft, insetRight),
      }}
    >
      {directed}
    </span>
  );
}
