/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word for Mac's Page Numbers and Page Number Format dialogs, as data.
 *
 * The dialogs themselves (DocumentPageNumberDialogs.tsx) only collect choices;
 * this module turns a choice into the existing section commands, so the ribbon
 * menu, the Header & Footer tab and the tests share one mapping and no command
 * logic is duplicated.
 *
 * Word semantics this follows (Microsoft Support "Insert page numbers" /
 * "Format page numbers", Word VBA PageNumbers.Add / ShowFirstPageNumber /
 * WdPageNumberAlignment, ISO/IEC 29500 w:titlePg and w:pgNumType):
 *
 *  - Position picks the story: Top of page (Header) writes the PAGE field into
 *    the section's header, Bottom of page (Footer) into its footer. The field
 *    goes into every story that prints on that section's pages (the primary
 *    story, the even-page story while Different Odd & Even is on, and the
 *    first-page story while Different First Page is on).
 *  - Show number on first page cleared = PageNumbers.Add(FirstPage:=False):
 *    the section gets a different first page (w:titlePg) and no number is
 *    added to the first-page story. Checked keeps the section's titlePg as it
 *    is and also numbers the first-page story when one is in use
 *    (ShowFirstPageNumber = True "adds page numbers" to the first page).
 *  - Inside / Outside mirror the number on facing pages: odd (right-hand)
 *    pages put Inside on the left and Outside on the right, even pages the
 *    reverse. Word for Mac offers both whatever the document's Different Odd
 *    & Even is (Word places the number in a frame aligned inside/outside).
 *    MRAI's stories hold no frames, so it draws the mirror with the odd and
 *    even stories: choosing Inside or Outside turns Different Odd & Even on
 *    (the Header & Footer tab's setting) and numbers both stories.
 *  - Page Center (Vertical) / Vertical, Inside / Vertical, Outside (listed by
 *    Word for Mac's dialog too) put the number in a frame in the side margin.
 *    MRAI's header/footer stories hold no margin frames yet, so they stay
 *    listed but unavailable.
 *  - Page Number Format writes the section's w:pgNumType: fmt, chapStyle
 *    (Heading 1-9) + chapSep, and start (absent = Continue from previous
 *    section).
 *
 * PURE: no React, no editor.
 */

import {
  formatPageNumber,
  MAX_PAGE_NUMBER_DIALOG_START,
  normalizePageNumberChapterSeparator,
  normalizePageNumberChapterStyle,
  normalizePageNumberFormat,
  normalizePageNumberStart,
  PAGE_NUMBER_CHAPTER_SEPARATOR_GLYPHS,
  type PageNumberChapterSeparator,
  type PageNumberFormat,
} from "@mrnote/core/web/components/console/editor/native-document/pageNumberFormat.ts";
import type { PageNumberStoryAlignment } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";

// ---------------------------------------------------------------------------
// Page Numbers dialog.
// ---------------------------------------------------------------------------

export const PAGE_NUMBER_DIALOG_POSITIONS = [
  "top",
  "bottom",
  "pageCenter",
  "verticalInside",
  "verticalOutside",
] as const;
export type PageNumberDialogPosition =
  (typeof PAGE_NUMBER_DIALOG_POSITIONS)[number];

export const PAGE_NUMBER_DIALOG_ALIGNMENTS = [
  "left",
  "center",
  "right",
  "inside",
  "outside",
] as const;
export type PageNumberDialogAlignment =
  (typeof PAGE_NUMBER_DIALOG_ALIGNMENTS)[number];

/** Why an option is listed but unavailable. */
export type PageNumberOptionBlocker = "marginFrame";

export interface PageNumberDialogContext {
  /** The document's Different Odd & Even Pages (w:evenAndOddHeaders). */
  readonly differentOddEven: boolean;
  /** The target section's Different First Page (w:titlePg). */
  readonly titlePage: boolean;
  /** The header and footer the page holding the selection shows, when the
   *  selection is in the target section: what Remove Page Numbers acts on. */
  readonly currentVariant?: "default" | "first" | "even";
}

export interface PageNumberDialogValue {
  readonly position: PageNumberDialogPosition;
  readonly alignment: PageNumberDialogAlignment;
  readonly showOnFirstPage: boolean;
  /** MRAI's "Page X / Y" building block (Word Mac reaches it through the
   * header/footer gallery; kept here so the Page Numbers entry can add it). */
  readonly includePageCount: boolean;
}

export function pageNumberPositionBlocker(
  position: PageNumberDialogPosition,
): PageNumberOptionBlocker | null {
  return position === "top" || position === "bottom" ? null : "marginFrame";
}

/** Inside / Outside: the number mirrors on facing pages. */
export function pageNumberAlignmentMirrors(
  alignment: PageNumberDialogAlignment,
): boolean {
  return alignment === "inside" || alignment === "outside";
}

/** Word's dialog opens on Bottom of page, Right, first page numbered unless
 * the section already has a different first page. */
export function defaultPageNumberDialogValue(
  context: PageNumberDialogContext,
  includePageCount = false,
): PageNumberDialogValue {
  return {
    position: "bottom",
    alignment: "right",
    showOnFirstPage: !context.titlePage,
    includePageCount,
  };
}

/** Where the number sits on an odd (right-hand) and an even (left-hand) page. */
export function pageNumberFacingAlignments(alignment: PageNumberDialogAlignment): {
  readonly odd: PageNumberStoryAlignment;
  readonly even: PageNumberStoryAlignment;
} {
  switch (alignment) {
    case "inside":
      return { odd: "left", even: "right" };
    case "outside":
      return { odd: "right", even: "left" };
    default:
      return { odd: alignment, even: alignment };
  }
}

/** One `setSectionPageNumberStory` call. `alignment: null` removes the field. */
export interface PageNumberStoryWrite {
  readonly kind: "header" | "footer";
  readonly variant: "default" | "first" | "even";
  readonly alignment: PageNumberStoryAlignment | null;
  readonly includePageCount: boolean;
}

export interface PageNumberInsertionPlan {
  /**
   * `setDifferentOddEven(true)`, run after the primary story is known to take
   * the number and before any write: Inside / Outside on a document that
   * prints one story on odd and even pages alike.
   */
  readonly enableDifferentOddEven: boolean;
  /**
   * `setSectionDifferentFirstPage(section, true)`, run just before the
   * first-page write: the first-page story it creates starts as a clone of
   * the primary one, which by then holds the number the write removes.
   */
  readonly enableTitlePage: boolean;
  /** In order: primary, even-page, first-page. */
  readonly writes: readonly PageNumberStoryWrite[];
}

/**
 * The section commands the Page Numbers dialog's OK runs, in order, or null
 * when the choice is one MRAI cannot represent (a blocked option).
 */
export function planPageNumberInsertion(
  value: PageNumberDialogValue,
  context: PageNumberDialogContext,
): PageNumberInsertionPlan | null {
  if (pageNumberPositionBlocker(value.position)) return null;
  const kind = value.position === "top" ? "header" : "footer";
  const { odd, even } = pageNumberFacingAlignments(value.alignment);
  const includePageCount = value.includePageCount;
  const enableDifferentOddEven =
    pageNumberAlignmentMirrors(value.alignment) && !context.differentOddEven;
  const writes: PageNumberStoryWrite[] = [
    { kind, variant: "default", alignment: odd, includePageCount },
  ];
  if (context.differentOddEven || enableDifferentOddEven) {
    writes.push({ kind, variant: "even", alignment: even, includePageCount });
  }
  let enableTitlePage = false;
  if (value.showOnFirstPage) {
    // The first page is page 1 of the section: a right-hand (odd) page.
    if (context.titlePage) {
      writes.push({ kind, variant: "first", alignment: odd, includePageCount });
    }
  } else {
    enableTitlePage = !context.titlePage;
    writes.push({
      kind,
      variant: "first",
      alignment: null,
      includePageCount: false,
    });
  }
  return { enableDifferentOddEven, enableTitlePage, writes };
}

/** The section commands a plan runs on, bound to one section. */
export interface PageNumberPlanCommands {
  /** One `setSectionPageNumberStory` write; `dryRun` only asks whether it could. */
  readonly write: (write: PageNumberStoryWrite, dryRun: boolean) => boolean;
  /** `setDifferentOddEven(true)`. */
  readonly enableDifferentOddEven: () => boolean;
  /** `setSectionDifferentFirstPage(section, true)`. */
  readonly enableTitlePage: () => boolean;
}

/**
 * Run the Page Numbers dialog's OK: false (nothing written) when the
 * primary story can neither take the number nor already holds it. Different
 * Odd & Even goes on before any write, so the even write lands in the
 * even-page story it creates; Different First Page goes on after the primary
 * story holds the number, so the first-page story it creates (a clone of
 * that story) is the one the first-page write clears.
 */
export function runPageNumberInsertionPlan(
  plan: PageNumberInsertionPlan,
  commands: PageNumberPlanCommands,
): boolean {
  const primary = plan.writes[0];
  if (
    !primary ||
    (!commands.write(primary, true) &&
      !commands.write(
        { ...primary, alignment: null, includePageCount: false },
        true,
      ))
  ) {
    return false;
  }
  if (plan.enableDifferentOddEven && !commands.enableDifferentOddEven()) {
    return false;
  }
  let titlePagePending = plan.enableTitlePage;
  for (const write of plan.writes) {
    if (write.variant === "first" && titlePagePending) {
      titlePagePending = false;
      if (!commands.enableTitlePage()) return false;
    }
    if (commands.write(write, true)) commands.write(write, false);
  }
  return true;
}

/**
 * Remove Page Numbers: every story that prints on the section's pages, in
 * the header and the footer.
 */
export function planPageNumberRemoval(
  context: PageNumberDialogContext,
): PageNumberStoryWrite[] {
  // Word 16.86's Remove Page Numbers acts on the header and footer of the
  // page the cursor is on (measured: on a title page only the first-page
  // stories, only the cursor's section; outputs/a6/word-out). Without that
  // page (the selection outside the section), every story the section prints.
  const variants: Array<PageNumberStoryWrite["variant"]> = context.currentVariant
    ? [context.currentVariant]
    : ["default"];
  if (!context.currentVariant && context.differentOddEven) variants.push("even");
  if (!context.currentVariant && context.titlePage) variants.push("first");
  return (["footer", "header"] as const).flatMap((kind) =>
    variants.map((variant) => ({
      kind,
      variant,
      alignment: null,
      includePageCount: false,
    })),
  );
}

// ---------------------------------------------------------------------------
// Page Number Format dialog.
// ---------------------------------------------------------------------------

/**
 * Word for Mac's Number format list, in its order: each entry is the w:fmt
 * the document model stores (ECMA-376 17.18.59 ST_NumberFormat). Word 16.86
 * for Mac lists exactly these thirteen (read from its Format Page Numbers
 * dialog); the other ST_NumberFormat styles reach a document only from a file
 * and are shown by {@link pageNumberDialogFormatOptions} for the section that
 * has one.
 */
export const PAGE_NUMBER_DIALOG_FORMATS = [
  { id: "decimal", format: "decimal" },
  { id: "numberInDash", format: "numberInDash" },
  { id: "decimalFullWidth", format: "decimalFullWidth" },
  { id: "lowerLetter", format: "lowerLetter" },
  { id: "upperLetter", format: "upperLetter" },
  { id: "lowerRoman", format: "lowerRoman" },
  { id: "upperRoman", format: "upperRoman" },
  { id: "ideographLegalTraditional", format: "ideographLegalTraditional" },
  { id: "taiwaneseCountingThousand", format: "taiwaneseCountingThousand" },
  { id: "chineseCountingThousand", format: "chineseCountingThousand" },
  { id: "chineseLegalSimplified", format: "chineseLegalSimplified" },
  { id: "ideographTraditional", format: "ideographTraditional" },
  { id: "ideographZodiac", format: "ideographZodiac" },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly format: PageNumberFormat;
}>;

export type PageNumberDialogFormatId =
  (typeof PAGE_NUMBER_DIALOG_FORMATS)[number]["id"];

/** One entry of the dialog's Number format list. */
export type PageNumberDialogFormatOption =
  | { readonly kind: "dialog"; readonly id: PageNumberDialogFormatId; readonly format: PageNumberFormat }
  /** The section's own style from an opened file, which Word's list lacks:
   * kept as it is (its label is its first three numbers). */
  | { readonly kind: "document"; readonly format: PageNumberFormat; readonly sample: string };

/**
 * The Number format list for a section: Word's thirteen and, when the section
 * uses a style outside them (a Hebrew or Thai document, say), that style too,
 * so opening the dialog and pressing OK never changes it.
 */
export function pageNumberDialogFormatOptions(
  current: PageNumberFormat,
): readonly PageNumberDialogFormatOption[] {
  const options: PageNumberDialogFormatOption[] = PAGE_NUMBER_DIALOG_FORMATS.map(
    (entry) => ({ kind: "dialog", id: entry.id, format: entry.format }),
  );
  if (options.some((option) => option.format === current)) return options;
  const samples = [1, 2, 3].map((n) => formatPageNumber(current, n));
  // `none` and `custom` show no number at all, only Word's error text.
  const sample =
    current === "none" || current === "custom"
      ? current
      : `${samples.join(", ")}, \u2026`;
  return [...options, { kind: "document", format: current, sample }];
}

export interface PageNumberFormatDialogValue {
  readonly format: PageNumberFormat;
  readonly includeChapter: boolean;
  /** Heading 1-9 (w:chapStyle). */
  readonly chapterStyle: number;
  readonly chapterSeparator: PageNumberChapterSeparator;
  /** Continue from previous section (no w:start). */
  readonly continuePrevious: boolean;
  readonly startAt: number;
}

/** What a section's stored w:pgNumType shows in the dialog. */
export interface SectionPageNumberSettings {
  readonly format?: unknown;
  readonly start?: unknown;
  readonly chapterStyle?: unknown;
  readonly chapterSeparator?: unknown;
}

export function pageNumberFormatDialogInitial(
  section: SectionPageNumberSettings | null | undefined,
): PageNumberFormatDialogValue {
  const chapterStyle = normalizePageNumberChapterStyle(section?.chapterStyle);
  const start = normalizePageNumberStart(section?.start);
  return {
    format: normalizePageNumberFormat(section?.format) ?? "decimal",
    includeChapter: chapterStyle !== null,
    chapterStyle: chapterStyle ?? 1,
    chapterSeparator:
      normalizePageNumberChapterSeparator(section?.chapterSeparator) ??
      "hyphen",
    continuePrevious: start === null,
    startAt: start ?? 1,
  };
}

export interface SectionPageNumberPatch {
  format?: PageNumberFormat | null;
  start?: number | null;
  chapterStyle?: number | null;
  chapterSeparator?: PageNumberChapterSeparator | null;
}

/**
 * The `updateSectionLayout(section, { pageNumber })` patch for the dialog's
 * OK: only the fields that differ from what the section stores, so an OK
 * that changes nothing writes nothing. Null when the start is out of range.
 */
export function pageNumberFormatPatch(
  value: PageNumberFormatDialogValue,
  section: SectionPageNumberSettings | null | undefined,
): SectionPageNumberPatch | null {
  const format = normalizePageNumberFormat(value.format);
  if (!format) return null;
  let start: number | null = null;
  if (!value.continuePrevious) {
    if (
      !Number.isInteger(value.startAt) ||
      value.startAt < 0 ||
      value.startAt > MAX_PAGE_NUMBER_DIALOG_START
    ) {
      return null;
    }
    start = value.startAt;
  }
  const chapterStyle = value.includeChapter
    ? normalizePageNumberChapterStyle(value.chapterStyle)
    : null;
  if (value.includeChapter && chapterStyle === null) return null;
  const chapterSeparator = value.includeChapter
    ? (normalizePageNumberChapterSeparator(value.chapterSeparator) ?? "hyphen")
    : null;

  const stored = {
    format: normalizePageNumberFormat(section?.format),
    start: normalizePageNumberStart(section?.start),
    chapterStyle: normalizePageNumberChapterStyle(section?.chapterStyle),
    chapterSeparator: normalizePageNumberChapterSeparator(
      section?.chapterSeparator,
    ),
  };
  const patch: SectionPageNumberPatch = {};
  // Decimal is the default: a section that stores no format already shows it.
  if (format !== (stored.format ?? "decimal")) patch.format = format;
  if (start !== stored.start) patch.start = start;
  if (chapterStyle !== stored.chapterStyle) patch.chapterStyle = chapterStyle;
  if (chapterSeparator !== stored.chapterSeparator) {
    patch.chapterSeparator = chapterSeparator;
  }
  return patch;
}

/** Word's "Examples" line under the separator: `1-1, 1-A` with the chosen
 * separator. */
export function pageNumberChapterExample(
  separator: PageNumberChapterSeparator,
): string {
  const glyph = PAGE_NUMBER_CHAPTER_SEPARATOR_GLYPHS[separator];
  return `1${glyph}1, 1${glyph}A`;
}
