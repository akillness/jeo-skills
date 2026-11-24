/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function spreadsheetRangeA1(range: {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}): string {
  const start = `${columnLabel(range.c1)}${range.r1 + 1}`;
  const end = `${columnLabel(range.c2)}${range.r2 + 1}`;
  return start === end ? start : `${start}:${end}`;
}
