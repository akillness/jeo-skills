/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's document-wide page and tab settings (`word/settings.xml`) that the
 * Page Setup and Tabs dialogs edit, carried on the doc node as the closed
 * `wordSettings` attr.
 *
 * Word semantics this module reproduces (Microsoft Support "Set gutter
 * margins", "Set mirror margins for facing pages", "Page margin basics";
 * ECMA-376 Part 1 17.15.1.78 CT_Settings):
 *
 * - Page Setup > Margins > Pages > Multiple pages is ONE choice among Normal,
 *   Mirror margins, 2 pages per sheet and Book fold. The file stores it as
 *   the settings booleans `w:mirrorMargins`, `w:printTwoOnOne` and
 *   `w:bookFoldPrinting`; Word writes at most one of them. "Normal" writes
 *   none.
 * - Mirror margins swaps the left and right margins on facing (even) pages;
 *   the dialog then calls them Inside and Outside, and the gutter always sits
 *   on the inside.
 * - 2 pages per sheet prints two consecutive pages on one sheet: each page is
 *   half the paper along its long side, and the margins across the fold
 *   mirror like mirror margins (Top and Bottom become Outside and Inside on a
 *   portrait sheet).
 * - Book fold is a booklet: the sheet is landscape, each page is half of it,
 *   and Left and Right become Inside and Outside.
 * - Gutter position (`w:gutterAtTop`) is Left or Top. It is only offered for
 *   Normal pages: the three other modes decide the gutter's side themselves.
 * - Default tab stops (`w:defaultTabStop`, Tabs dialog) is the interval, in
 *   twips, of the implicit stops past the last custom one. Word's default is
 *   0.5 in (720 twips).
 *
 * The value is canonical: every key is optional, a key equal to Word's default
 * is ABSENT, and an empty bag is stored as `null`, so a document that never
 * touched these settings stays byte-identical.
 */

export const WORD_MULTIPLE_PAGES = [
  "mirrorMargins",
  "printTwoOnOne",
  "bookFold",
] as const;
export type WordMultiplePages = (typeof WORD_MULTIPLE_PAGES)[number];

/** Word's own default for `w:defaultTabStop` (0.5 in). */
export const WORD_DEFAULT_TAB_STOP_TWIPS = 720;
/** Word refuses a default interval of 0; 22 in is the widest page. */
export const MIN_DEFAULT_TAB_STOP_TWIPS = 1;
export const MAX_DEFAULT_TAB_STOP_TWIPS = 31_680;

export interface WordDocumentSettings {
  multiplePages?: WordMultiplePages;
  gutterAtTop?: true;
  defaultTabStopTwips?: number;
  /** Word's compatibility option "Don't expand character spaces on a line
   * ending with SHIFT-RETURN" (w:compat/w:doNotExpandShiftReturn): read on
   * import and written back; a justified line a manual break ends stays
   * ragged (justifiedLineBreaks.ts). */
  doNotExpandShiftReturn?: true;
  /** File > Protect > Always Open Read-Only, with no password
   * (w:writeProtection w:recommended): read on import and written back. */
  readOnlyRecommended?: true;
}

const KEYS = [
  "multiplePages",
  "gutterAtTop",
  "defaultTabStopTwips",
  "doNotExpandShiftReturn",
  "readOnlyRecommended",
] as const;

/**
 * Closed normalizer. Unknown keys or out-of-range values reject the whole bag
 * (`null`) rather than being dropped one by one, so a forged value can never
 * be half-applied. Default-valued keys are removed.
 */
export function normalizeWordDocumentSettings(
  value: unknown,
): WordDocumentSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).every((key) => (KEYS as readonly string[]).includes(key))) {
    return null;
  }
  const result: WordDocumentSettings = {};
  if (raw.multiplePages !== undefined && raw.multiplePages !== null) {
    if (!(WORD_MULTIPLE_PAGES as readonly unknown[]).includes(raw.multiplePages)) {
      return null;
    }
    result.multiplePages = raw.multiplePages as WordMultiplePages;
  }
  if (raw.gutterAtTop !== undefined && raw.gutterAtTop !== null) {
    if (typeof raw.gutterAtTop !== "boolean") return null;
    // Word ignores Gutter position outside Normal pages; storing it there
    // would describe a setting the dialog cannot show.
    if (raw.gutterAtTop && result.multiplePages === undefined) {
      result.gutterAtTop = true;
    }
  }
  if (raw.defaultTabStopTwips !== undefined && raw.defaultTabStopTwips !== null) {
    const twips = raw.defaultTabStopTwips;
    if (
      typeof twips !== "number" ||
      !Number.isInteger(twips) ||
      // 0 is a stated zero-length default tab stop (an imported
      // w:defaultTabStop of 0 or 65536, corpus R66-D27); the dialog itself
      // still asks for at least MIN_DEFAULT_TAB_STOP_TWIPS.
      twips < 0 ||
      twips > MAX_DEFAULT_TAB_STOP_TWIPS
    ) {
      return null;
    }
    if (twips !== WORD_DEFAULT_TAB_STOP_TWIPS) result.defaultTabStopTwips = twips;
  }
  if (raw.doNotExpandShiftReturn !== undefined && raw.doNotExpandShiftReturn !== null) {
    if (typeof raw.doNotExpandShiftReturn !== "boolean") return null;
    if (raw.doNotExpandShiftReturn) result.doNotExpandShiftReturn = true;
  }
  if (raw.readOnlyRecommended !== undefined && raw.readOnlyRecommended !== null) {
    if (typeof raw.readOnlyRecommended !== "boolean") return null;
    if (raw.readOnlyRecommended) result.readOnlyRecommended = true;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Merge a patch (a `null` key resets it to Word's default) into a bag. */
export function mergeWordDocumentSettings(
  current: unknown,
  patch: {
    multiplePages?: WordMultiplePages | null;
    gutterAtTop?: boolean | null;
    defaultTabStopTwips?: number | null;
    doNotExpandShiftReturn?: boolean | null;
    readOnlyRecommended?: boolean | null;
  },
): WordDocumentSettings | null | undefined {
  const base = { ...(normalizeWordDocumentSettings(current) ?? {}) } as Record<
    string,
    unknown
  >;
  for (const key of KEYS) {
    if (!(key in patch)) continue;
    const next = patch[key];
    if (next === null || next === undefined || next === false) delete base[key];
    else base[key] = next;
  }
  if (Object.keys(base).length === 0) return null;
  const normalized = normalizeWordDocumentSettings(base);
  // `undefined` = the patch itself was invalid (a caller must fail closed).
  return normalized === null ? undefined : normalized;
}

export function wordDefaultTabStopTwips(settings: unknown): number {
  return (
    normalizeWordDocumentSettings(settings)?.defaultTabStopTwips ??
    WORD_DEFAULT_TAB_STOP_TWIPS
  );
}

/**
 * How one physical page's margins resolve under the multiple-pages setting.
 * `pageIndex` is zero-based across the document (page 1 is a right-hand
 * page). Returns the page box and the four margins to paint, in twips, with
 * the gutter already folded into the binding side. PURE.
 */
export function resolveWordPageBox(
  layout: {
    pageSize: { widthTwips: number; heightTwips: number };
    pageMargins: {
      topTwips: number;
      rightTwips: number;
      bottomTwips: number;
      leftTwips: number;
      gutterTwips: number;
    };
  },
  settings: WordDocumentSettings | null,
  pageIndex: number,
): {
  widthTwips: number;
  heightTwips: number;
  topTwips: number;
  rightTwips: number;
  bottomTwips: number;
  leftTwips: number;
} {
  const { widthTwips, heightTwips } = layout.pageSize;
  const { topTwips, rightTwips, bottomTwips, leftTwips, gutterTwips } =
    layout.pageMargins;
  const even = pageIndex % 2 === 1;
  const mode = settings?.multiplePages;
  if (mode === "mirrorMargins" || mode === "bookFold") {
    // Left is Inside, Right is Outside. A right-hand (odd) page binds on its
    // left; a left-hand (even) page binds on its right.
    const inside = leftTwips + gutterTwips;
    const outside = rightTwips;
    // A book fold page is the section's own page size: Word 16.86 lays the
    // pages out at w:pgSz and only imposes two of them on a doubled sheet
    // when it prints (its PDF of corpus R75-D15, an A4 portrait booklet:
    // sheets of 595 x 1684 pt, each two whole A4 pages; landscape alike).
    // Halving the width set every line in half the measure (11 pages for
    // Word's 4).
    return {
      widthTwips,
      heightTwips,
      topTwips,
      bottomTwips,
      leftTwips: even ? outside : inside,
      rightTwips: even ? inside : outside,
    };
  }
  if (mode === "printTwoOnOne") {
    const portrait = heightTwips >= widthTwips;
    if (portrait) {
      // Top is Outside, Bottom is Inside across the horizontal fold.
      const outside = topTwips;
      const inside = bottomTwips + gutterTwips;
      return {
        widthTwips,
        heightTwips: Math.max(1, Math.round(heightTwips / 2)),
        leftTwips,
        rightTwips,
        topTwips: even ? inside : outside,
        bottomTwips: even ? outside : inside,
      };
    }
    const inside = leftTwips + gutterTwips;
    const outside = rightTwips;
    return {
      widthTwips: Math.max(1, Math.round(widthTwips / 2)),
      heightTwips,
      topTwips,
      bottomTwips,
      leftTwips: even ? outside : inside,
      rightTwips: even ? inside : outside,
    };
  }
  if (settings?.gutterAtTop) {
    return {
      widthTwips,
      heightTwips,
      topTwips: topTwips + gutterTwips,
      rightTwips,
      bottomTwips,
      leftTwips,
    };
  }
  return {
    widthTwips,
    heightTwips,
    topTwips,
    rightTwips,
    bottomTwips,
    leftTwips: leftTwips + gutterTwips,
  };
}
