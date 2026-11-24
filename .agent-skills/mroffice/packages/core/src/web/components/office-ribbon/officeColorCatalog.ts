/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Shared Microsoft Office colour slots used by docs and sheets. */

export const OFFICE_THEME_COLOR_COLUMNS = /* own data: OFFICE_THEME_COLOR_COLUMNS */ [["#ffffff","#f2f2f2","#d9d9d9","#bfbfbf","#a6a6a6","#808080"],["#000000","#808080","#595959","#404040","#262626","#0d0d0d"],["#eef1f4","#d6d9dc","#b3b5b7","#77797a","#3c3c3d","#181818"],["#1f2a37","#e9eaeb","#c7cacd","#8f959b","#575f69","#353f4b"],["#2f6fd6","#d5e2f7","#acc5ef","#82a9e6","#2353a1","#18386b"],["#e07b39","#f9e5d7","#f3cab0","#ecb088","#a85c2b","#703e1d"],["#3a9d6b","#d8ebe1","#b0d8c4","#89c4a6","#2c7650","#1d4f36"],["#8c5cc9","#e8def4","#d1bee9","#ba9ddf","#694597","#462e65"],["#d04b6b","#f6dbe1","#ecb7c4","#e393a6","#9c3850","#682636"],["#2c9aa8","#d5ebee","#abd7dc","#80c2cb","#21747e","#164d54"]];

/**
 * Office's ten Standard Colors, the same row under the theme grid in every
 * Office app: Dark Red, Red, Orange, Yellow, Light Green, Green, Light Blue,
 * Blue, Dark Blue, Purple.
 */
export const OFFICE_STANDARD_COLORS = /* own data: OFFICE_STANDARD_COLORS */ ["#921c24","#e72330","#f58514","#fbde23","#88ce5a","#239554","#2ab7ea","#1e66b8","#13295d","#75389f"];

/** Message-key suffixes of {@link OFFICE_STANDARD_COLORS}' tooltip names. */
export const OFFICE_STANDARD_COLOR_NAME_KEYS = [
  "darkRed",
  "red",
  "orange",
  "yellow",
  "lightGreen",
  "green",
  "lightBlue",
  "blue",
  "darkBlue",
  "purple",
] as const;

export function officeThemeColorsRowMajor(): string[] {
  const rows = OFFICE_THEME_COLOR_COLUMNS[0]?.length ?? 0;
  const colors: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (const column of OFFICE_THEME_COLOR_COLUMNS) colors.push(column[row]);
  }
  return colors;
}
