/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx } from "../../../../lib/office-units";
import { wordBorderRuleWidthPt } from "../../../../lib/document-borders";
import type { EditorState } from "@tiptap/pm/state";

import {
  MANUSCRIPT_CELL_PX,
  normalizeColumns,
  normalizeManuscriptGrid,
  resolveColumnSeparator,
  resolveWritingMode,
} from "./documentLayout";
import {
  normalizeLineNumbers,
  normalizePageBorder,
  normalizePageOrientation,
  pageGeometryTwips,
} from "./pageSetup";
import {
  MAX_PAGE_NUMBER_START,
  normalizePageNumberChapterSeparator,
  normalizePageNumberFormat,
  normalizePageNumberStart,
  normalizePageNumberStartSection,
  PAGE_NUMBER_FORMATS,
  type PageNumberChapterSeparator,
} from "./pageNumberFormat";
import {
  resolveWordPageBox,
  type WordDocumentSettings,
} from "./wordDocumentSettings";
import {
  sanitizeSectionNoteProperties,
  type SectionNoteProperties,
} from "./footnotes";
import { sheetsOf } from "./paged/sheetMeasureMemo";

/**
 * Closed, lossless-enough representation of the section-local properties that
 * Word stores in each ordered `w:sectPr`.  Entries are ordered exactly like
 * the Word section chain: every paragraph-hosted section end, followed by the
 * body-final section properties.
 *
 * The live editor still exposes convenient document-wide page-setup controls.
 * `sectionLayouts` is the import/export fidelity layer used when those global
 * controls would flatten genuinely different Word sections (or an exact
 * non-default section value such as header distance / unequal columns).
 */

// Word sets no limit on sections (docx.js' page-number-formats probe: 168; a
// book converted from PDF holds one section per printed page, R442-D01: 625).
// The API's bound (document_section_layouts.MAX_SECTION_LAYOUTS), the same.
export const MAX_SECTION_LAYOUTS = 4096;
export const MAX_SECTION_COLUMNS = 45;
/** Runtime-only page decoration carrying exact unequal column tracks.
 *
 * The value is a closed comma-separated list of `widthTwips:gapAfterTwips`
 * pairs. It never enters the ProseMirror document or exported HTML; the
 * structural paginator consumes it to project Word's per-column geometry.
 */
export const SECTION_UNEQUAL_COLUMN_TRACKS_ATTR =
  "data-page-unequal-column-tracks";
export const SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR =
  "data-page-unequal-column-separator";
/** Runtime-only marker for a source-authored Word page border. */
export const SECTION_NATIVE_PAGE_BORDER_ATTR = "data-page-native-border";

/** Every `w:pgNumType/@w:fmt` the page-number formatter renders. */
export const SECTION_PAGE_NUMBER_FORMATS = PAGE_NUMBER_FORMATS;
export type SectionPageNumberFormat =
  (typeof SECTION_PAGE_NUMBER_FORMATS)[number];

export const SECTION_TEXT_DIRECTIONS = [
  "lrTb",
  "tbRl",
  "tbRlV",
  "tbV",
  "btLr",
  "lrTbV",
  "tbLrV",
] as const;
export type SectionTextDirection = (typeof SECTION_TEXT_DIRECTIONS)[number];

/** Word section-page vertical placement (`w:sectPr/w:vAlign`). */
export const SECTION_VERTICAL_ALIGNMENTS = [
  "top",
  "center",
  "both",
  "bottom",
] as const;
export type SectionVerticalAlignment =
  (typeof SECTION_VERTICAL_ALIGNMENTS)[number];

export const SECTION_GRID_TYPES = [
  "default",
  "lines",
  "linesAndChars",
  "snapToChars",
] as const;
export type SectionGridType = (typeof SECTION_GRID_TYPES)[number];

export const SECTION_LINE_NUMBER_RESTARTS = [
  "continuous",
  "newPage",
  "newSection",
] as const;
export type SectionLineNumberRestart =
  (typeof SECTION_LINE_NUMBER_RESTARTS)[number];

export const SECTION_BORDER_STYLES = [
  "nil",
  "none",
  "single",
  "thick",
  "double",
  "dotted",
  "dashed",
  "dotDash",
  "dotDotDash",
  "triple",
  "thinThickSmallGap",
  "thickThinSmallGap",
  "thinThickThinSmallGap",
  "thinThickMediumGap",
  "thickThinMediumGap",
  "thinThickThinMediumGap",
  "thinThickLargeGap",
  "thickThinLargeGap",
  "thinThickThinLargeGap",
  "wave",
  "doubleWave",
  "dashSmallGap",
  "dashDotStroked",
  "threeDEmboss",
  "threeDEngrave",
  "outset",
  "inset",
] as const;
export type SectionBorderStyle = (typeof SECTION_BORDER_STYLES)[number];

export const SECTION_THEME_COLORS = [
  "dark1",
  "light1",
  "dark2",
  "light2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hyperlink",
  "followedHyperlink",
  "none",
  "background1",
  "background2",
  "text1",
  "text2",
] as const;

export interface SectionBorderEdge {
  style: SectionBorderStyle;
  sizeEighths?: number;
  spacePt?: number;
  color?: string;
  themeColor?: string;
  themeTint?: string;
  themeShade?: string;
  /**
   * `w:shadow` (ECMA-376 17.3.4 CT_Border). Word's "Shadow" page-border setting
   * writes it on every edge; without custody the setting silently degraded to a
   * plain box on the next save.
   */
  shadow?: boolean;
  /**
   * `w:frame` (ECMA-376 17.3.4 CT_Border). Word's "3-D" page-border setting.
   * The standard does not say which edges it affects; Word applies it to the
   * right and bottom borders only, so it is carried per edge exactly as authored.
   */
  frame?: boolean;
}

export interface SectionLayoutColumn {
  widthTwips: number;
  /** Gap after this column. Word normally omits it on the final column. */
  spaceTwips?: number;
}

export interface SectionLayout {
  pageSize: {
    widthTwips: number;
    heightTwips: number;
    orientation: "portrait" | "landscape";
  };
  pageMargins: {
    topTwips: number;
    rightTwips: number;
    bottomTwips: number;
    leftTwips: number;
    headerTwips: number;
    footerTwips: number;
    gutterTwips: number;
  };
  columns: {
    count: number;
    separator: boolean;
    equalWidth: boolean;
    spaceTwips: number;
    /** Present only for an explicit unequal-width `<w:col>` sequence. */
    items?: SectionLayoutColumn[];
  };
  pageNumber?: {
    format?: SectionPageNumberFormat;
    start?: number;
    chapterStyle?: number;
    chapterSeparator?: PageNumberChapterSeparator;
  };
  /** Vertical placement of the section body within the printable page. */
  verticalAlignment?: SectionVerticalAlignment;
  textDirection?: SectionTextDirection;
  docGrid?: {
    type: SectionGridType;
    linePitch?: number;
    charSpace?: number;
  };
  lineNumbers?: {
    countBy?: number;
    start?: number;
    distanceTwips?: number;
    restart?: SectionLineNumberRestart;
  };
  pageBorders?: {
    offsetFrom: "page" | "text";
    display: "allPages" | "firstPage" | "notFirstPage";
    zOrder: "front" | "back";
    edges: Partial<
      Record<"top" | "left" | "bottom" | "right", SectionBorderEdge>
    >;
  };
  /**
   * The section's own `w:footnotePr` (Footnote and Endnote > Apply changes
   * to > This section): only the fields that differ from the document's
   * note values (footnotes.ts sectionNotePropertiesFor).
   */
  footnotePr?: SectionNoteProperties;
  /** The section's own `w:endnotePr` numbering (placement is document-wide). */
  endnotePr?: Omit<SectionNoteProperties, "position">;
  /**
   * Page Setup > Section direction: Right-to-left (`w:bidi`), stated only
   * when it is one. Word draws the section's line numbers beside the text's
   * right edge (corpus R404-D02).
   */
  rightToLeft?: true;
}

/**
 * The four page-border sides, in the order ECMA-376 17.6.10's CT_PageBorders
 * sequence declares them. Readers, writers and the ribbon all iterate this list
 * so a `<w:pgBorders>` is never written with its children out of schema order.
 */
export const SECTION_BORDER_EDGE_NAMES = [
  "top",
  "left",
  "bottom",
  "right",
] as const;
export type SectionBorderEdgeName = (typeof SECTION_BORDER_EDGE_NAMES)[number];

/**
 * Deep, section-local update shape. Required layout groups are patched field by
 * field; optional OOXML groups accept `null` to remove the group. Border edges
 * are patched independently and an individual `null` edge removes that edge.
 * Unknown keys and any result that does not pass {@link normalizeSectionLayouts}
 * are rejected.
 */
export interface SectionLayoutPatch {
  pageSize?: Partial<SectionLayout["pageSize"]>;
  pageMargins?: Partial<SectionLayout["pageMargins"]>;
  columns?: Partial<Omit<SectionLayout["columns"], "items">> & {
    /** `null` clears explicit unequal widths (normally with equalWidth=true). */
    items?: SectionLayoutColumn[] | null;
  };
  pageNumber?: {
    format?: SectionPageNumberFormat | null;
    start?: number | null;
    chapterStyle?: number | null;
    chapterSeparator?: PageNumberChapterSeparator | null;
  } | null;
  verticalAlignment?: SectionVerticalAlignment | null;
  textDirection?: SectionTextDirection | null;
  docGrid?: Partial<NonNullable<SectionLayout["docGrid"]>> | null;
  lineNumbers?: Partial<NonNullable<SectionLayout["lineNumbers"]>> | null;
  /** Field by field; a `null` member removes it, `null` removes the group. */
  footnotePr?: {
    [K in keyof SectionNoteProperties]?: SectionNoteProperties[K] | null;
  } | null;
  endnotePr?: {
    [K in keyof NonNullable<SectionLayout["endnotePr"]>]?:
      | NonNullable<SectionLayout["endnotePr"]>[K]
      | null;
  } | null;
  pageBorders?:
    | (Partial<Omit<NonNullable<SectionLayout["pageBorders"]>, "edges">> & {
        edges?: Partial<
          Record<
            SectionBorderEdgeName,
            | {
                [K in keyof SectionBorderEdge]?: SectionBorderEdge[K] | null;
              }
            | null
          >
        >;
      })
    | null;
}

const EXACT_KEYS = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

/** Strict normalizer: any malformed entry rejects the entire fidelity model. */
export function normalizeSectionLayouts(
  value: unknown,
): SectionLayout[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_SECTION_LAYOUTS
  ) {
    return null;
  }

  const layouts: SectionLayout[] = [];
  for (const candidate of value) {
    const item = record(candidate);
    if (
      !item ||
      !EXACT_KEYS(item, [
        "pageSize",
        "pageMargins",
        "columns",
        "pageNumber",
        "verticalAlignment",
        "textDirection",
        "docGrid",
        "lineNumbers",
        "pageBorders",
        "footnotePr",
        "endnotePr",
        "rightToLeft",
      ])
    ) {
      return null;
    }

    const rawSize = record(item.pageSize);
    const rawMargins = record(item.pageMargins);
    const rawColumns = record(item.columns);
    if (
      !rawSize ||
      !EXACT_KEYS(rawSize, ["widthTwips", "heightTwips", "orientation"]) ||
      !rawMargins ||
      !EXACT_KEYS(rawMargins, [
        "topTwips",
        "rightTwips",
        "bottomTwips",
        "leftTwips",
        "headerTwips",
        "footerTwips",
        "gutterTwips",
      ]) ||
      !rawColumns ||
      !EXACT_KEYS(rawColumns, [
        "count",
        "separator",
        "equalWidth",
        "spaceTwips",
        "items",
      ])
    ) {
      return null;
    }

    const widthTwips = integer(rawSize.widthTwips, 1, 69_120);
    const heightTwips = integer(rawSize.heightTwips, 1, 69_120);
    const orientation = rawSize.orientation;
    const marginValues = {
      topTwips: integer(rawMargins.topTwips, -31_680, 31_680),
      rightTwips: integer(rawMargins.rightTwips, -31_680, 31_680),
      bottomTwips: integer(rawMargins.bottomTwips, -31_680, 31_680),
      leftTwips: integer(rawMargins.leftTwips, -31_680, 31_680),
      headerTwips: integer(rawMargins.headerTwips, 0, 31_680),
      footerTwips: integer(rawMargins.footerTwips, 0, 31_680),
      gutterTwips: integer(rawMargins.gutterTwips, 0, 31_680),
    };
    if (
      widthTwips === null ||
      heightTwips === null ||
      (orientation !== "portrait" && orientation !== "landscape") ||
      Object.values(marginValues).some((part) => part === null)
    ) {
      return null;
    }

    const count = integer(rawColumns.count, 1, MAX_SECTION_COLUMNS);
    const spaceTwips = integer(rawColumns.spaceTwips, 0, 31_680);
    if (
      count === null ||
      spaceTwips === null ||
      typeof rawColumns.separator !== "boolean" ||
      typeof rawColumns.equalWidth !== "boolean"
    ) {
      return null;
    }
    let columnItems: SectionLayoutColumn[] | undefined;
    if (rawColumns.items !== undefined) {
      if (
        rawColumns.equalWidth ||
        !Array.isArray(rawColumns.items) ||
        rawColumns.items.length !== count
      ) {
        return null;
      }
      columnItems = [];
      for (const rawColumn of rawColumns.items) {
        const column = record(rawColumn);
        if (!column || !EXACT_KEYS(column, ["widthTwips", "spaceTwips"])) {
          return null;
        }
        const columnWidth = integer(column.widthTwips, 1, 69_120);
        const columnSpace =
          column.spaceTwips === undefined
            ? undefined
            : integer(column.spaceTwips, 0, 31_680);
        if (columnWidth === null || columnSpace === null) return null;
        columnItems.push({
          widthTwips: columnWidth,
          ...(columnSpace === undefined ? {} : { spaceTwips: columnSpace }),
        });
      }
    } else if (!rawColumns.equalWidth) {
      return null;
    }

    const layout: SectionLayout = {
      pageSize: { widthTwips, heightTwips, orientation },
      pageMargins: {
        topTwips: marginValues.topTwips!,
        rightTwips: marginValues.rightTwips!,
        bottomTwips: marginValues.bottomTwips!,
        leftTwips: marginValues.leftTwips!,
        headerTwips: marginValues.headerTwips!,
        footerTwips: marginValues.footerTwips!,
        gutterTwips: marginValues.gutterTwips!,
      },
      columns: {
        count,
        separator: rawColumns.separator,
        equalWidth: rawColumns.equalWidth,
        spaceTwips,
        ...(columnItems ? { items: columnItems } : {}),
      },
    };

    if (item.pageNumber !== undefined) {
      const pageNumber = record(item.pageNumber);
      if (
        !pageNumber ||
        !EXACT_KEYS(pageNumber, [
          "format",
          "start",
          "chapterStyle",
          "chapterSeparator",
        ])
      ) {
        return null;
      }
      const format = pageNumber.format;
      const start =
        pageNumber.start === undefined
          ? undefined
          : integer(pageNumber.start, 0, MAX_PAGE_NUMBER_START);
      const chapterStyle =
        pageNumber.chapterStyle === undefined
          ? undefined
          : integer(pageNumber.chapterStyle, 1, 9);
      const chapterSeparator =
        pageNumber.chapterSeparator === undefined
          ? undefined
          : normalizePageNumberChapterSeparator(pageNumber.chapterSeparator);
      if (
        (format !== undefined &&
          !SECTION_PAGE_NUMBER_FORMATS.includes(
            format as SectionPageNumberFormat,
          )) ||
        start === null ||
        chapterStyle === null ||
        chapterSeparator === null ||
        (format === undefined &&
          start === undefined &&
          chapterStyle === undefined &&
          chapterSeparator === undefined)
      ) {
        return null;
      }
      layout.pageNumber = {
        ...(format === undefined
          ? {}
          : { format: format as SectionPageNumberFormat }),
        ...(start === undefined ? {} : { start }),
        ...(chapterStyle === undefined ? {} : { chapterStyle }),
        ...(chapterSeparator === undefined ? {} : { chapterSeparator }),
      };
    }

    if (item.verticalAlignment !== undefined) {
      if (
        !SECTION_VERTICAL_ALIGNMENTS.includes(
          item.verticalAlignment as SectionVerticalAlignment,
        )
      ) {
        return null;
      }
      layout.verticalAlignment =
        item.verticalAlignment as SectionVerticalAlignment;
    }

    if (item.textDirection !== undefined) {
      if (
        !SECTION_TEXT_DIRECTIONS.includes(
          item.textDirection as SectionTextDirection,
        )
      ) {
        return null;
      }
      layout.textDirection = item.textDirection as SectionTextDirection;
    }

    if (item.docGrid !== undefined) {
      const docGrid = record(item.docGrid);
      if (
        !docGrid ||
        !EXACT_KEYS(docGrid, ["type", "linePitch", "charSpace"])
      ) {
        return null;
      }
      if (!SECTION_GRID_TYPES.includes(docGrid.type as SectionGridType)) {
        return null;
      }
      const linePitch =
        docGrid.linePitch === undefined
          ? undefined
          : integer(docGrid.linePitch, 0, 31_680);
      const charSpace =
        docGrid.charSpace === undefined
          ? undefined
          : // 4096ths of a point per character (ECMA-376 17.6.5), up to 1584 pt
            integer(docGrid.charSpace, -6_488_064, 6_488_064);
      if (linePitch === null || charSpace === null) return null;
      layout.docGrid = {
        type: docGrid.type as SectionGridType,
        ...(linePitch === undefined ? {} : { linePitch }),
        ...(charSpace === undefined ? {} : { charSpace }),
      };
    }

    if (item.lineNumbers !== undefined) {
      const lineNumbers = record(item.lineNumbers);
      if (
        !lineNumbers ||
        !EXACT_KEYS(lineNumbers, [
          "countBy",
          "start",
          "distanceTwips",
          "restart",
        ])
      ) {
        return null;
      }
      const countBy =
        lineNumbers.countBy === undefined
          ? undefined
          : integer(lineNumbers.countBy, 1, 1_000);
      const start =
        lineNumbers.start === undefined
          ? undefined
          : integer(lineNumbers.start, 0, 999_999);
      const distanceTwips =
        lineNumbers.distanceTwips === undefined
          ? undefined
          : integer(lineNumbers.distanceTwips, 0, 31_680);
      const restart = lineNumbers.restart;
      if (
        countBy === null ||
        start === null ||
        distanceTwips === null ||
        (restart !== undefined &&
          !SECTION_LINE_NUMBER_RESTARTS.includes(
            restart as SectionLineNumberRestart,
          )) ||
        (countBy === undefined &&
          start === undefined &&
          distanceTwips === undefined &&
          restart === undefined)
      ) {
        return null;
      }
      layout.lineNumbers = {
        ...(countBy === undefined ? {} : { countBy }),
        ...(start === undefined ? {} : { start }),
        ...(distanceTwips === undefined ? {} : { distanceTwips }),
        ...(restart === undefined
          ? {}
          : { restart: restart as SectionLineNumberRestart }),
      };
    }

    if (item.pageBorders !== undefined) {
      const borders = record(item.pageBorders);
      if (
        !borders ||
        !EXACT_KEYS(borders, ["offsetFrom", "display", "zOrder", "edges"]) ||
        (borders.offsetFrom !== "page" && borders.offsetFrom !== "text") ||
        !["allPages", "firstPage", "notFirstPage"].includes(
          String(borders.display),
        ) ||
        (borders.zOrder !== "front" && borders.zOrder !== "back")
      ) {
        return null;
      }
      const edges = record(borders.edges);
      if (
        !edges ||
        !EXACT_KEYS(edges, ["top", "left", "bottom", "right"]) ||
        Object.keys(edges).length === 0
      ) {
        return null;
      }
      const normalizedEdges: NonNullable<
        SectionLayout["pageBorders"]
      >["edges"] = {};
      for (const edgeName of ["top", "left", "bottom", "right"] as const) {
        if (edges[edgeName] === undefined) continue;
        const edge = record(edges[edgeName]);
        if (
          !edge ||
          !EXACT_KEYS(edge, [
            "style",
            "sizeEighths",
            "spacePt",
            "color",
            "themeColor",
            "themeTint",
            "themeShade",
            "shadow",
            "frame",
          ]) ||
          !SECTION_BORDER_STYLES.includes(edge.style as SectionBorderStyle)
        ) {
          return null;
        }
        const sizeEighths =
          edge.sizeEighths === undefined
            ? undefined
            : // A line border holds up to 12 pt; an imported art border
              // (chainLink, twistedLines1, ...) is drawn as a band of its
              // own width, up to 31 pt (ECMA-376 17.3.4, reading 200).
              integer(edge.sizeEighths, 0, 248);
        const spacePt =
          edge.spacePt === undefined ? undefined : integer(edge.spacePt, 0, 31);
        const color = edge.color;
        const themeColor = edge.themeColor;
        const themeTint = edge.themeTint;
        const themeShade = edge.themeShade;
        const shadow = edge.shadow;
        const frame = edge.frame;
        if (
          sizeEighths === null ||
          spacePt === null ||
          (shadow !== undefined && typeof shadow !== "boolean") ||
          (frame !== undefined && typeof frame !== "boolean") ||
          (color !== undefined &&
            (typeof color !== "string" ||
              !/^(?:auto|[0-9a-fA-F]{6})$/.test(color))) ||
          (themeColor !== undefined &&
            (typeof themeColor !== "string" ||
              !SECTION_THEME_COLORS.includes(
                themeColor as (typeof SECTION_THEME_COLORS)[number],
              ))) ||
          (themeTint !== undefined &&
            (typeof themeTint !== "string" ||
              !/^[0-9a-fA-F]{2}$/.test(themeTint))) ||
          (themeShade !== undefined &&
            (typeof themeShade !== "string" ||
              !/^[0-9a-fA-F]{2}$/.test(themeShade)))
        ) {
          return null;
        }
        normalizedEdges[edgeName] = {
          style: edge.style as SectionBorderStyle,
          ...(sizeEighths === undefined ? {} : { sizeEighths }),
          ...(spacePt === undefined ? {} : { spacePt }),
          ...(color === undefined ? {} : { color }),
          ...(themeColor === undefined ? {} : { themeColor }),
          ...(themeTint === undefined ? {} : { themeTint }),
          ...(themeShade === undefined ? {} : { themeShade }),
          ...(shadow === undefined ? {} : { shadow }),
          ...(frame === undefined ? {} : { frame }),
        };
      }
      layout.pageBorders = {
        offsetFrom: borders.offsetFrom,
        display: borders.display as "allPages" | "firstPage" | "notFirstPage",
        zOrder: borders.zOrder,
        edges: normalizedEdges,
      };
    }

    for (const [key, stream] of [
      ["footnotePr", "footnote"],
      ["endnotePr", "endnote"],
    ] as const) {
      if (item[key] === undefined) continue;
      const notes = sanitizeSectionNoteProperties(stream, item[key]);
      if (!notes) return null;
      layout[key] = notes;
    }
    if (item.rightToLeft !== undefined) {
      if (item.rightToLeft !== true) return null;
      layout.rightToLeft = true;
    }

    layouts.push(layout);
  }
  return layouts;
}

/** True when the exact section model carries information globals cannot keep. */
export function sectionLayoutsNeedFidelityModel(
  layouts: readonly SectionLayout[],
): boolean {
  if (layouts.length === 0) return false;
  // A right-to-left section alone changes nothing laid out without the model
  // (only its line numbers' side, which the model's lineNumbers ask for).
  layouts = layouts.map((layout) => {
    if (!layout.rightToLeft) return layout;
    const leftToRight = { ...layout };
    delete leftToRight.rightToLeft;
    return leftToRight;
  });
  if (layouts.length > 1) {
    const first = JSON.stringify(layouts[0]);
    if (layouts.some((layout) => JSON.stringify(layout) !== first)) return true;
  }
  const defaultLayout: SectionLayout = {
    pageSize: {
      widthTwips: 12_240,
      heightTwips: 15_840,
      orientation: "portrait",
    },
    pageMargins: {
      topTwips: 1_440,
      rightTwips: 1_440,
      bottomTwips: 1_440,
      leftTwips: 1_440,
      headerTwips: 720,
      footerTwips: 720,
      gutterTwips: 0,
    },
    columns: {
      count: 1,
      separator: false,
      equalWidth: true,
      spaceTwips: 720,
    },
  };
  return layouts.some(
    (layout) => JSON.stringify(layout) !== JSON.stringify(defaultLayout),
  );
}

/** Exact runtime token for one unequal-width Word column sequence. */
export function sectionLayoutUnequalColumnTracksToken(
  layout: SectionLayout,
): string | null {
  const { columns } = layout;
  if (
    columns.count <= 1 ||
    columns.equalWidth ||
    !columns.items ||
    columns.items.length !== columns.count
  ) {
    return null;
  }
  return columns.items
    .map((column, index) => {
      const gapAfterTwips =
        index === columns.count - 1
          ? 0
          : (column.spaceTwips ?? columns.spaceTwips);
      return `${column.widthTwips}:${gapAfterTwips}`;
    })
    .join(",");
}

/**
 * Runtime track token for ANY multi-column section: the exact unequal
 * sequence when Word wrote one, otherwise the equal grammar
 * `equal:<count>:<gapTwips>` whose track widths the projector derives from
 * the sheet's printable width. Every column layout is placed by the
 * structural paginator's own projection (never CSS Multi-column): Word moves
 * a block that does not fit the rest of a column whole into the next one and
 * cuts only splittable text at the boundary, and the page ledger can only
 * reproduce that when it owns the placement.
 */
export function sectionLayoutColumnTracksToken(
  layout: SectionLayout,
): string | null {
  if (layout.columns.count <= 1) return null;
  return (
    sectionLayoutUnequalColumnTracksToken(layout) ??
    equalColumnTracksToken(layout.columns.count, layout.columns.spaceTwips)
  );
}

export function equalColumnTracksToken(count: number, gapTwips: number): string | null {
  if (!Number.isInteger(count) || count <= 1) return null;
  const gap = Number.isFinite(gapTwips) && gapTwips >= 0 ? Math.round(gapTwips) : 0;
  return `equal:${count}:${gap}`;
}

/** CSS projection of one Word section's newspaper-column layout. */
export function sectionLayoutColumnsCss(_layout: SectionLayout): {
  columnCount?: string;
  columnGap?: string;
  columnRule?: string;
} {
  // No section paints CSS Multi-column any more: a column layout is stamped
  // as a track token (`sectionLayoutColumnTracksToken`) and placed by the
  // paginator's projection, equal tracks included. The browser's own column
  // fragmentation split charts and pictures across tracks, treated any
  // scrollable block as unbreakable, and left the ledger with no way to
  // charge the space a whole-moved block leaves behind.
  return {};
}

const sectionTwipsToPx = (twips: number): number =>
  Math.round((twips / 15) * 100) / 100;

/**
 * Physical sheet geometry for one normalized Word section. These values are
 * safe to place in a ProseMirror node decoration because every source number
 * has already passed the closed integer normalizer above. The default Word
 * gutter is added to the binding-side (left) body margin; the exact OOXML
 * value remains unchanged in the semantic model.
 */
export function sectionLayoutSheetCss(
  layout: SectionLayout,
  settings: WordDocumentSettings | null = null,
  pageIndex = 0,
  /** Which sheet's band overflow the padding reads: the page index, or
   * "self" for a sheet that carries its own (SHEET_BAND_EXTRA_SELF_*). */
  bandOverflowOf: number | "self" = pageIndex,
): {
  width: string;
  minHeight: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  pageHeight: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
} {
  // Word's Multiple pages / Gutter position (settings.xml) decide which side
  // the gutter joins and whether facing pages swap their margins.
  const box = resolveWordPageBox(layout, settings, pageIndex);
  const width = sectionTwipsToPx(box.widthTwips);
  const height = sectionTwipsToPx(box.heightTwips);
  // A NEGATIVE top or bottom margin (w:pgMar, ECMA-376 17.6.11) is exact: the
  // body starts that far from the edge whatever the header or footer holds,
  // and a taller header overlaps it instead of pushing it down (docx rounds
  // R280-D19, GOV.UK form: top -1366 twips under a full-page picture
  // header; Word starts the body 0.95 in from the top).
  const topExact = box.topTwips < 0;
  const bottomExact = box.bottomTwips < 0;
  const top = Math.abs(sectionTwipsToPx(box.topTwips));
  const right = Math.max(0, sectionTwipsToPx(box.rightTwips));
  const bottom = Math.abs(sectionTwipsToPx(box.bottomTwips));
  const left = Math.max(0, sectionTwipsToPx(box.leftTwips));
  return {
    width: `${width}px`,
    minHeight: `${height}px`,
    // The sheet's own header overflow (NoteEditor measures it per sheet):
    // Word pushes only the page whose header runs past its top margin.
    paddingTop: topExact ? `${top}px` : `calc(${top}px + var(--sheet-band-extra-top-${bandOverflowOf}, 0px))`,
    paddingRight: `${right}px`,
    // And its footer overflow: a footer taller than the bottom margin lifts
    // the body's end on that page only.
    paddingBottom: bottomExact ? `${bottom}px` : `calc(${bottom}px + var(--sheet-band-extra-bottom-${bandOverflowOf}, 0px))`,
    paddingLeft: `${left}px`,
    pageHeight: `${height}px`,
    marginTop: `${top}px`,
    marginRight: `${right}px`,
    marginBottom: `${bottom}px`,
    marginLeft: `${left}px`,
  };
}

/** Native band geometry belongs to the section, including overlay siblings
 * which do not inherit the physical sheet's margin variables. */
export function sectionLayoutBandCss(
  layout: SectionLayout | null | undefined,
  settings: WordDocumentSettings | null = null,
  pageIndex = 0,
): Record<`--${string}`, string> {
  if (!layout) return {};
  const sheet = sectionLayoutSheetCss(layout, settings, pageIndex);
  return {
    "--page-margin-top": sheet.marginTop,
    "--page-margin-right": sheet.marginRight,
    "--page-margin-bottom": sheet.marginBottom,
    "--page-margin-left": sheet.marginLeft,
    "--sheet-header-offset": `${sectionTwipsToPx(layout.pageMargins.headerTwips)}px`,
    "--sheet-footer-offset": `${sectionTwipsToPx(layout.pageMargins.footerTwips)}px`,
    "--sheet-header-alignment": "flex-start",
    "--sheet-footer-alignment": "flex-end",
  };
}

/**
 * CSS custom properties for one page sheet's border layer. The paint itself is
 * an absolutely positioned `::before` on the sheet (see the
 * `[data-page-native-border]` rule in note-editor.css): four independent
 * `border-*` sides, which `outline` cannot express, painted without taking part
 * in layout so Word's printable width and the pagination ledger are untouched.
 */
export type SectionPageBorderCss = Record<string, string>;

type PageBorderCssLineStyle =
  | "solid"
  | "double"
  | "dotted"
  | "dashed"
  | "groove"
  | "ridge"
  | "outset"
  | "inset";

/**
 * ST_Border (ECMA-376 17.3.4) → the nearest CSS line style. Word's compound and
 * wavy rules have no CSS equivalent, so each is mapped to the closest painted
 * line and the exact token stays in the model for export; `nil`/`none` are
 * deliberately absent so they paint nothing.
 */
const PAGE_BORDER_LINE_STYLES: Partial<
  Record<SectionBorderStyle, PageBorderCssLineStyle>
> = {
  single: "solid",
  thick: "solid",
  double: "double",
  dotted: "dotted",
  dashed: "dashed",
  dotDash: "dashed",
  dotDotDash: "dashed",
  dashSmallGap: "dashed",
  dashDotStroked: "dashed",
  triple: "double",
  thinThickSmallGap: "double",
  thickThinSmallGap: "double",
  thinThickThinSmallGap: "double",
  thinThickMediumGap: "double",
  thickThinMediumGap: "double",
  thinThickThinMediumGap: "double",
  thinThickLargeGap: "double",
  thickThinLargeGap: "double",
  thinThickThinLargeGap: "double",
  wave: "solid",
  doubleWave: "double",
  threeDEmboss: "groove",
  threeDEngrave: "ridge",
  outset: "outset",
  inset: "inset",
};

/** Whether two page-border edges carry the same OOXML attributes. */
export const sameSectionBorderEdge = (
  left: SectionBorderEdge,
  right: SectionBorderEdge,
): boolean =>
  left.style === right.style &&
  left.sizeEighths === right.sizeEighths &&
  left.spacePt === right.spacePt &&
  left.color === right.color &&
  left.themeColor === right.themeColor &&
  left.themeTint === right.themeTint &&
  left.themeShade === right.themeShade &&
  left.shadow === right.shadow &&
  left.frame === right.frame;

/**
 * Every CSS custom property {@link sectionLayoutPageBorderCss} can set. Callers
 * that paint onto a live element clear the whole set, so a border that shrinks
 * from four sides to one never leaves a stale side painted.
 */
export const PAGE_BORDER_CSS_PROPERTIES: readonly string[] = [
  ...SECTION_BORDER_EDGE_NAMES.flatMap((side) => [
    `--page-border-${side}`,
    `--page-border-${side}-inset`,
  ]),
  "--page-border-layer-z",
];

/** Word paints `w:color="auto"` on a border as black. */
const PAGE_BORDER_AUTO_COLOR = "000000";

function pageBorderLineWidthOnly(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsPageBorderLineWidth?: boolean }).__docsPageBorderLineWidth === true;
}

/** `window.__docsPageBorderBandPushOff = true` measures a border from the
 * text from the page's margins alone, as before (A/B). */
function pageBorderBandPushOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsPageBorderBandPushOff?: boolean }).__docsPageBorderBandPushOff === true;
}

/** One page-border edge as CSS, or `null` when it paints nothing. */
function pageBorderEdgeCss(
  edge: SectionBorderEdge | undefined,
): { width: string; style: PageBorderCssLineStyle; color: string } | null {
  if (!edge) return null;
  const style = PAGE_BORDER_LINE_STYLES[edge.style];
  if (!style || edge.sizeEighths === undefined || edge.sizeEighths <= 0) {
    return null;
  }
  // A theme-coloured border also carries the resolved literal `w:color` Word
  // wrote alongside `w:themeColor`, so it paints from that instead of being
  // declined; only a border with NO literal colour falls back to auto/black.
  const literal =
    typeof edge.color === "string" && /^[0-9a-fA-F]{6}$/.test(edge.color)
      ? edge.color
      : PAGE_BORDER_AUTO_COLOR;
  // `w:sz` is eighths of a point: px = sz / 8 * 4/3 = sz / 6. A compound
  // rule is drawn as wide as Word draws its lines and gaps together (CSS
  // `double` splits that width in thirds): one line's width, it drew the
  // double rule of a page as one hairline (corpus R441-D03: two 0.5 pt lines
  // and their 0.5 pt gap, 1.5 pt in all). `window.__docsPageBorderLineWidth
  // = true` keeps the older width (A/B).
  const ruleWidthPt = pageBorderLineWidthOnly() ? null : wordBorderRuleWidthPt(edge.style, edge.sizeEighths / 8);
  const widthPx = ruleWidthPt !== null ? ptToPx(ruleWidthPt) : edge.sizeEighths / 6;
  return {
    width: `${Math.round(widthPx * 100) / 100}px`,
    style,
    color: `#${literal.toUpperCase()}`,
  };
}

const PAGE_BORDER_SIDE_MARGIN_TWIPS = {
  top: "topTwips",
  left: "leftTwips",
  bottom: "bottomTwips",
  right: "rightTwips",
} as const;

/**
 * Exact display-layer projection of one Word page border onto one page sheet.
 *
 * The semantic `pageBorders` payload remains untouched for DOCX custody; this
 * only decides what the sheet paints. Each side is independent (Word's Custom
 * setting and its preview-edge toggles produce asymmetric borders), so the
 * result is a set of CSS custom properties consumed by the sheet's `::before`
 * border layer rather than a single `outline` shorthand. The layer is
 * absolutely positioned, so it changes neither Word's printable width nor the
 * pagination ledger, and it survives the structural print clone.
 *
 * `w:offsetFrom` decides what `w:space` is measured from (ECMA-376 17.6.10):
 * `page` insets the line from the paper edge, `text` offsets it outward from
 * the text extents, i.e. `margin - space` from the paper edge. `w:display`
 * selects which pages in the section paint at all. Returns `null` when nothing
 * would be painted, so a border-free sheet keeps its untouched style.
 */
export function sectionLayoutPageBorderCss(
  layout: SectionLayout,
  pageIndexInSection: number,
): SectionPageBorderCss | null {
  const borders = layout.pageBorders;
  if (
    !borders ||
    (borders.display === "firstPage" && pageIndexInSection !== 0) ||
    (borders.display === "notFirstPage" && pageIndexInSection === 0)
  ) {
    return null;
  }

  const properties: Record<string, string> = {};
  let painted = false;
  for (const side of SECTION_BORDER_EDGE_NAMES) {
    const css = pageBorderEdgeCss(borders.edges[side]);
    if (!css) {
      properties[`--page-border-${side}`] = "0 none transparent";
      properties[`--page-border-${side}-inset`] = "0px";
      continue;
    }
    painted = true;
    const spacePt = borders.edges[side]?.spacePt ?? 0;
    const spacePx = ptToPx(spacePt);
    // Measured from the text, the rule's inner edge stands `w:space` out
    // from it and the rule runs outward (a compound rule is wide).
    const insetPx =
      borders.offsetFrom === "page"
        ? spacePx
        : Math.max(
            0,
            sectionTwipsToPx(layout.pageMargins[PAGE_BORDER_SIDE_MARGIN_TWIPS[side]]) -
              spacePx -
              (pageBorderLineWidthOnly() ? 0 : Number.parseFloat(css.width) || 0),
          );
    properties[`--page-border-${side}`] =
      `${css.width} ${css.style} ${css.color}`;
    // Measured from the text, the top and bottom rules stand off the text
    // where it really starts and ends: a header taller than the top margin
    // pushes the body down and the rule with it, a footer taller than the
    // bottom margin lifts both (the sheet's own band overflow,
    // stampSheetBandOverflow). Windows Word 16, corpus R379-D02 and R399-D02
    // (thickThinSmallGap top, space 1 pt, header past its 0.5 in margin):
    // the rule stands under the header, 1 pt over the body's first line; the
    // page drew it at the margin, over the header's words. A margin stated
    // exact (negative) lets the band overlap the body, which stays put.
    const pushedBy =
      borders.offsetFrom !== "page" && (side === "top" || side === "bottom") && !pageBorderBandPushOff() &&
      layout.pageMargins[PAGE_BORDER_SIDE_MARGIN_TWIPS[side]] >= 0
        ? `var(--sheet-band-extra-${side}-self, 0px)`
        : null;
    const inset = `${Math.round(insetPx * 100) / 100}px`;
    properties[`--page-border-${side}-inset`] = pushedBy ? `calc(${inset} + ${pushedBy})` : inset;
  }
  if (!painted) return null;
  // `w:zOrder="back"` puts the border behind the text; the layer then paints
  // under the sheet's own in-flow content instead of over it.
  properties["--page-border-layer-z"] = borders.zOrder === "back" ? "0" : "2";
  return properties;
}

/** Widest physical paper in a validated section chain (for the sheet stack). */
export function widestSectionPageWidthPx(
  layouts: readonly SectionLayout[],
): number | null {
  if (layouts.length === 0) return null;
  return Math.max(
    ...layouts.map((layout) => sectionTwipsToPx(layout.pageSize.widthTwips)),
  );
}

const sectionBoundariesByDoc = new WeakMap<object, ReadonlyArray<{ from: number; to: number }>>();

/** The section breaks of `doc`, kept per document (asked on every toolbar
 * render); each caller gets its own copy. */
export function sectionBreakBoundaries(
  doc: Pick<EditorState, "doc">["doc"],
): Array<{ from: number; to: number }> {
  let known = sectionBoundariesByDoc.get(doc);
  if (!known) sectionBoundariesByDoc.set(doc, (known = findSectionBreakBoundaries(doc)));
  return known.map((boundary) => ({ ...boundary }));
}

function findSectionBreakBoundaries(
  doc: Pick<EditorState, "doc">["doc"],
): Array<{ from: number; to: number }> {
  const boundaries: Array<{ from: number; to: number }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      boundaries.push({ from: pos, to: pos + node.nodeSize });
    }
    return true;
  });
  boundaries.sort((a, b) => a.from - b.from);
  return boundaries;
}

function materializedPageBorders(
  attrs: Record<string, unknown>,
): SectionLayout["pageBorders"] {
  const border = normalizePageBorder(attrs.pageBorder);
  if (!border) return undefined;
  const edge = (): SectionBorderEdge => ({
    style: border.style,
    sizeEighths: Math.min(Math.max(Math.round(border.widthPt * 8), 2), 96),
    spacePt: 24,
    color: border.color,
  });
  return {
    offsetFrom: "page",
    display: "allPages",
    zOrder: "front",
    edges: {
      top: edge(),
      left: edge(),
      bottom: edge(),
      right: edge(),
    },
  };
}

export function materializedLineNumbers(
  attrs: Record<string, unknown>,
): SectionLayout["lineNumbers"] {
  const lineNumbers = normalizeLineNumbers(attrs.lineNumbers);
  if (!lineNumbers) return undefined;
  return {
    countBy: lineNumbers.countBy,
    restart: lineNumbers.restart,
    ...(lineNumbers.distancePt > 0
      ? { distanceTwips: Math.round(lineNumbers.distancePt * 20) }
      : {}),
  };
}

function materializedPageNumber(
  attrs: Record<string, unknown>,
  sectionIndex: number,
): SectionLayout["pageNumber"] {
  const format = normalizePageNumberFormat(attrs.pageNumberFormat);
  const start = normalizePageNumberStart(attrs.pageNumberStart);
  const startSection =
    normalizePageNumberStartSection(attrs.pageNumberStartSection) ?? 0;
  if (sectionIndex < startSection) return undefined;

  const pageNumber: NonNullable<SectionLayout["pageNumber"]> = {};
  if (format && format !== "decimal") pageNumber.format = format;
  if (
    sectionIndex === startSection &&
    (startSection > 0 || (start !== null && start !== 1))
  ) {
    pageNumber.start = start ?? 1;
  }
  return Object.keys(pageNumber).length > 0 ? pageNumber : undefined;
}

function materializedDocGrid(
  attrs: Record<string, unknown>,
): SectionLayout["docGrid"] {
  const mode = normalizeManuscriptGrid(attrs.manuscriptGrid);
  if (mode !== "grid" && mode !== "lines") return undefined;
  const rawPitch = Number(attrs.docGridLinePitch);
  const roundedPitch = Math.round(rawPitch);
  const linePitch =
    Number.isFinite(rawPitch) && roundedPitch >= 20 && roundedPitch <= 2_880
      ? roundedPitch
      : Math.round((MANUSCRIPT_CELL_PX / 96) * 1_440);
  return mode === "lines"
    ? { type: "lines", linePitch }
    : { type: "snapToChars", linePitch, charSpace: 0 };
}

/**
 * Convert the legacy document-wide setup into one exact section entry. This is
 * used only when `sectionLayouts` is genuinely absent; a present but malformed
 * or boundary-mismatched array is never overwritten. Every global property that
 * the exact `<w:sectPr>` serializer would otherwise shadow is carried forward.
 */
function materializeSectionLayout(
  attrs: Record<string, unknown>,
  sectionIndex: number,
): SectionLayout | null {
  const orientation =
    normalizePageOrientation(attrs.pageOrientation) ?? "portrait";
  const geometry = pageGeometryTwips(
    attrs.pageSize,
    attrs.pageMargins,
    attrs.customPageSize,
    attrs.customPageMargins,
    orientation,
  );
  const count = normalizeColumns(attrs.columns) ?? 1;
  const pageNumber = materializedPageNumber(attrs, sectionIndex);
  const textDirection =
    resolveWritingMode(attrs.writingMode) === "vertical-rl"
      ? ("tbRl" as const)
      : undefined;
  const docGrid = materializedDocGrid(attrs);
  const lineNumbers = materializedLineNumbers(attrs);
  const pageBorders = materializedPageBorders(attrs);
  return (
    normalizeSectionLayouts([
      {
        pageSize: {
          widthTwips: geometry.width,
          heightTwips: geometry.height,
          orientation,
        },
        pageMargins: {
          topTwips: geometry.top,
          rightTwips: geometry.right,
          bottomTwips: geometry.bottom,
          leftTwips: geometry.left,
          headerTwips: 720,
          footerTwips: 720,
          gutterTwips: 0,
        },
        columns: {
          count,
          separator: resolveColumnSeparator(attrs.columnSeparator),
          equalWidth: true,
          spaceTwips: 720,
        },
        ...(pageNumber ? { pageNumber } : {}),
        ...(textDirection ? { textDirection } : {}),
        ...(docGrid ? { docGrid } : {}),
        ...(lineNumbers ? { lineNumbers } : {}),
        ...(pageBorders ? { pageBorders } : {}),
      },
    ])?.[0] ?? null
  );
}

/** Word refuses a column narrower than this; about one millimetre. */
const MIN_PRESET_COLUMN_WIDTH_TWIPS = 57;

/**
 * Word's Columns ▸ Left / Right presets, expressed as an explicit two-column
 * `<w:col>` sequence.
 *
 * Both presets are two columns of UNEQUAL width. Word sizes the narrow one as
 * the column an equal THREE-column layout would get for the same gap —
 * `(text width − 2 × gap) / 3` — and gives the remainder to the wide one. On US
 * Letter with 1in margins and Word's 0.5in gap that reproduces Word's published
 * 1.83in + 4.17in pair exactly. "left" puts the narrow column first (Word's
 * "Left"); "right" puts the wide column first.
 *
 * Returns `null` when the section's text width cannot hold the pair, so the
 * caller leaves the section untouched rather than writing a degenerate column
 * sequence. PURE.
 */
export function unequalTwoColumnPreset(
  contentWidthTwips: number,
  spaceTwips: number,
  narrowSide: "left" | "right",
): SectionLayoutColumn[] | null {
  if (
    !Number.isFinite(contentWidthTwips) ||
    !Number.isFinite(spaceTwips) ||
    spaceTwips < 0
  ) {
    return null;
  }
  const gap = Math.round(spaceTwips);
  const narrow = Math.floor((contentWidthTwips - gap * 2) / 3);
  const wide = Math.round(contentWidthTwips) - gap - narrow;
  if (
    narrow < MIN_PRESET_COLUMN_WIDTH_TWIPS ||
    wide < MIN_PRESET_COLUMN_WIDTH_TWIPS
  ) {
    return null;
  }
  const [first, second] =
    narrowSide === "left" ? [narrow, wide] : [wide, narrow];
  // Word omits the gap on the final column, matching `initialColumnItems`.
  return [{ widthTwips: first, spaceTwips: gap }, { widthTwips: second }];
}

/**
 * Which Columns gallery row a section is currently on. `left`/`right` are only
 * reported for the exact two-column unequal shape the presets write; any other
 * unequal sequence (from an import or the More Columns dialog) reports its
 * column count, so the gallery never claims a preset the section is not on.
 * PURE.
 */
export function columnsPresetOfSection(
  layout: Pick<SectionLayout, "columns">,
): "left" | "right" | null {
  const { columns } = layout;
  if (columns.count !== 2 || columns.equalWidth) return null;
  const items = columns.items;
  if (!items || items.length !== 2) return null;
  if (items[0].widthTwips < items[1].widthTwips) return "left";
  if (items[0].widthTwips > items[1].widthTwips) return "right";
  return null;
}

function checkedPatchRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const patch = record(value);
  return patch && EXACT_KEYS(patch, keys) ? patch : null;
}

/** Apply one deep patch and validate the complete resulting section. */
function applySectionLayoutPatch(
  layout: SectionLayout,
  value: unknown,
): SectionLayout | null {
  const patch = checkedPatchRecord(value, [
    "pageSize",
    "pageMargins",
    "columns",
    "pageNumber",
    "verticalAlignment",
    "textDirection",
    "docGrid",
    "lineNumbers",
    "pageBorders",
    "footnotePr",
    "endnotePr",
  ]);
  const candidate = normalizeSectionLayouts([layout])?.[0];
  if (!patch || !candidate) return null;

  if (patch.pageSize !== undefined) {
    const size = checkedPatchRecord(patch.pageSize, [
      "widthTwips",
      "heightTwips",
      "orientation",
    ]);
    if (!size) return null;
    const previousOrientation = candidate.pageSize.orientation;
    const changesOrientation =
      typeof size.orientation === "string" &&
      size.orientation !== previousOrientation;
    const suppliesDimensions =
      size.widthTwips !== undefined || size.heightTwips !== undefined;
    const next = {
      ...candidate.pageSize,
      ...size,
    } as SectionLayout["pageSize"];
    // Orientation-only updates mirror Word's toggle: swap the concrete extents.
    // A caller supplying either extent owns the geometry and receives no guess.
    if (changesOrientation && !suppliesDimensions) {
      [next.widthTwips, next.heightTwips] = [next.heightTwips, next.widthTwips];
    }
    candidate.pageSize = next;
  }

  if (patch.pageMargins !== undefined) {
    const margins = checkedPatchRecord(patch.pageMargins, [
      "topTwips",
      "rightTwips",
      "bottomTwips",
      "leftTwips",
      "headerTwips",
      "footerTwips",
      "gutterTwips",
    ]);
    if (!margins) return null;
    candidate.pageMargins = {
      ...candidate.pageMargins,
      ...margins,
    } as SectionLayout["pageMargins"];
  }

  if (patch.columns !== undefined) {
    const columns = checkedPatchRecord(patch.columns, [
      "count",
      "separator",
      "equalWidth",
      "spaceTwips",
      "items",
    ]);
    if (!columns) return null;
    const next = {
      ...candidate.columns,
      ...columns,
    } as SectionLayout["columns"] & { items?: SectionLayoutColumn[] | null };
    if (
      columns.items === null ||
      (columns.equalWidth === true && columns.items === undefined)
    ) {
      delete next.items;
    }
    candidate.columns = next;
  }

  if (patch.pageNumber !== undefined) {
    if (patch.pageNumber === null) {
      delete candidate.pageNumber;
    } else {
      const pageNumber = checkedPatchRecord(patch.pageNumber, [
        "format",
        "start",
        "chapterStyle",
        "chapterSeparator",
      ]);
      if (!pageNumber) return null;
      const next = { ...(candidate.pageNumber ?? {}) } as Record<
        string,
        unknown
      >;
      for (const key of [
        "format",
        "start",
        "chapterStyle",
        "chapterSeparator",
      ] as const) {
        if (!Object.prototype.hasOwnProperty.call(pageNumber, key)) continue;
        if (pageNumber[key] === null) delete next[key];
        else next[key] = pageNumber[key];
      }
      if (Object.keys(next).length === 0) delete candidate.pageNumber;
      else {
        candidate.pageNumber = next as NonNullable<SectionLayout["pageNumber"]>;
      }
    }
  }

  for (const [key, keys] of [
    ["docGrid", ["type", "linePitch", "charSpace"]],
    ["lineNumbers", ["countBy", "start", "distanceTwips", "restart"]],
  ] as const) {
    const valueForKey = patch[key];
    if (valueForKey === undefined) continue;
    if (valueForKey === null) {
      delete candidate[key];
      continue;
    }
    const nested = checkedPatchRecord(valueForKey, keys);
    if (!nested) return null;
    candidate[key] = {
      ...(candidate[key] ?? {}),
      ...nested,
    } as never;
  }

  for (const [key, keys] of [
    ["footnotePr", ["numFmt", "start", "restart", "position"]],
    ["endnotePr", ["numFmt", "start", "restart"]],
  ] as const) {
    const valueForKey = patch[key];
    if (valueForKey === undefined) continue;
    if (valueForKey === null) {
      delete candidate[key];
      continue;
    }
    const nested = checkedPatchRecord(valueForKey, keys);
    if (!nested) return null;
    const next: Record<string, unknown> = { ...(candidate[key] ?? {}) };
    for (const [field, fieldValue] of Object.entries(nested)) {
      if (fieldValue === null) delete next[field];
      else next[field] = fieldValue;
    }
    if (Object.keys(next).length === 0) delete candidate[key];
    else candidate[key] = next as never;
  }

  if (patch.textDirection !== undefined) {
    if (patch.textDirection === null) delete candidate.textDirection;
    else candidate.textDirection = patch.textDirection as SectionTextDirection;
  }

  if (patch.verticalAlignment !== undefined) {
    if (patch.verticalAlignment === null) delete candidate.verticalAlignment;
    else {
      candidate.verticalAlignment =
        patch.verticalAlignment as SectionVerticalAlignment;
    }
  }

  if (patch.pageBorders !== undefined) {
    if (patch.pageBorders === null) {
      delete candidate.pageBorders;
    } else {
      const borders = checkedPatchRecord(patch.pageBorders, [
        "offsetFrom",
        "display",
        "zOrder",
        "edges",
      ]);
      if (!borders) return null;
      const withoutEdges = { ...borders };
      delete withoutEdges.edges;
      const next = {
        ...(candidate.pageBorders ?? {}),
        ...withoutEdges,
      } as NonNullable<SectionLayout["pageBorders"]>;
      if (borders.edges !== undefined) {
        const edges = checkedPatchRecord(borders.edges, [
          "top",
          "left",
          "bottom",
          "right",
        ]);
        if (!edges) return null;
        const nextEdges = { ...(candidate.pageBorders?.edges ?? {}) };
        for (const edgeName of ["top", "left", "bottom", "right"] as const) {
          if (!Object.prototype.hasOwnProperty.call(edges, edgeName)) continue;
          const edgeValue = edges[edgeName];
          if (edgeValue === null) {
            delete nextEdges[edgeName];
            continue;
          }
          const edge = checkedPatchRecord(edgeValue, [
            "style",
            "sizeEighths",
            "spacePt",
            "color",
            "themeColor",
            "themeTint",
            "themeShade",
            "shadow",
            "frame",
          ]);
          if (!edge) return null;
          // A `null` member CLEARS that one OOXML attribute. Picking a standard
          // colour has to drop an imported `w:themeColor`/tint/shade, and the
          // Shadow/3-D settings have to be able to go back off; without this a
          // theme-coloured import could never be recoloured from the ribbon.
          const merged: Record<string, unknown> = {
            ...(nextEdges[edgeName] ?? {}),
          };
          for (const [key, value] of Object.entries(edge)) {
            if (value === null) delete merged[key];
            else merged[key] = value;
          }
          nextEdges[edgeName] = merged as unknown as SectionBorderEdge;
        }
        next.edges = nextEdges;
      } else if (candidate.pageBorders) {
        next.edges = { ...candidate.pageBorders.edges };
      }
      candidate.pageBorders = next;
    }
  }

  return normalizeSectionLayouts([candidate])?.[0] ?? null;
}

export interface ResolvedSectionAtSelection {
  /** Zero-based section index in Word's ordered section chain. */
  sectionIndex: number;
  sectionCount: number;
  /** ProseMirror document positions delimiting the selected section. */
  from: number;
  to: number;
  /** Exact layout only when the stored array matches every live boundary. */
  layout: SectionLayout | null;
  layouts: SectionLayout[] | null;
}

/**
 * Resolve the Word section containing the selection head. A section-break atom
 * belongs to the section before it; the next section begins immediately after
 * the atom. The exact layout model fails closed when its length no longer
 * matches the live boundary count.
 */
export function resolveSectionAtSelection(
  state: Pick<EditorState, "doc" | "selection">,
): ResolvedSectionAtSelection {
  const boundaries = sectionBreakBoundaries(state.doc);

  const head = Math.max(
    0,
    Math.min(state.selection.head, state.doc.content.size),
  );
  const sectionIndex = boundaries.filter(
    (boundary) => head >= boundary.to,
  ).length;
  const sectionCount = boundaries.length + 1;
  const normalized = normalizeSectionLayouts(state.doc.attrs.sectionLayouts);
  const layouts =
    normalized && normalized.length === sectionCount ? normalized : null;
  return {
    sectionIndex,
    sectionCount,
    from: sectionIndex === 0 ? 0 : boundaries[sectionIndex - 1].to,
    to:
      sectionIndex < boundaries.length
        ? boundaries[sectionIndex].from
        : state.doc.content.size,
    layout: layouts?.[sectionIndex] ?? null,
    layouts,
  };
}

/**
 * The page border a section actually paints, read from the same source the
 * page renderer and the DOCX exporter use: the exact `pageBorders` entry once
 * the document carries `sectionLayouts`, otherwise the legacy document-wide
 * `pageBorder` box, expanded exactly as the first section-layout write will
 * materialize it. Reading anything else would show a drawn border as absent.
 */
export function effectiveSectionPageBorders(
  state: Pick<EditorState, "doc" | "selection">,
  sectionIndex?: number,
): NonNullable<SectionLayout["pageBorders"]> | null {
  const rawLayouts = state.doc.attrs.sectionLayouts;
  if (rawLayouts === null || rawLayouts === undefined) {
    return (
      materializedPageBorders(state.doc.attrs as Record<string, unknown>) ??
      null
    );
  }
  const resolved = resolveSectionAtSelection(state);
  return (
    resolved.layouts?.[sectionIndex ?? resolved.sectionIndex]?.pageBorders ??
    null
  );
}

export interface SectionBoundaryLayoutUpdate {
  /** Section affected by the boundary mutation in the OLD section chain. */
  sectionIndex: number;
  /** Section count after the boundary mutation. */
  sectionCount: number;
  layouts: SectionLayout[];
  /** True when absent legacy globals were expanded before the mutation. */
  materialized: boolean;
}

function completeSectionLayoutsForBoundaryMutation(
  state: Pick<EditorState, "doc" | "selection">,
  resolved: ResolvedSectionAtSelection,
): { layouts: SectionLayout[]; materialized: boolean } | null {
  const rawLayouts = state.doc.attrs.sectionLayouts;
  if (rawLayouts !== null && rawLayouts !== undefined) {
    // A present fidelity payload is authoritative only when every entry is
    // complete AND its length exactly matches the old live boundary count.
    return resolved.layouts
      ? { layouts: resolved.layouts, materialized: false }
      : null;
  }

  if (resolved.sectionCount > MAX_SECTION_LAYOUTS) return null;
  const attrs = state.doc.attrs as Record<string, unknown>;
  const expanded = Array.from({ length: resolved.sectionCount }, (_, index) =>
    materializeSectionLayout(attrs, index),
  );
  if (expanded.some((layout) => layout === null)) return null;
  return { layouts: expanded as SectionLayout[], materialized: true };
}

/**
 * The layout of the section at the selection as the page shows it: its stored
 * entry, or -- for a document that stores none yet (a new page) -- the one the
 * first page-setup write would materialize from the document's page settings.
 */
export function shownSectionLayoutAtSelection(
  state: Pick<EditorState, "doc" | "selection">,
): SectionLayout | null {
  const resolved = resolveSectionAtSelection(state);
  if (resolved.layout) return resolved.layout;
  return completeSectionLayoutsForBoundaryMutation(state, resolved)?.layouts[resolved.sectionIndex] ?? null;
}

/**
 * Split the selected Word section without losing its complete layout identity.
 * Both halves inherit the old section's exact normalized layout; the caller
 * inserts the physical section-break node in the same transaction.
 */
export function insertSectionLayoutAtSelection(
  state: Pick<EditorState, "doc" | "selection">,
): SectionBoundaryLayoutUpdate | null {
  const resolved = resolveSectionAtSelection(state);
  if (resolved.sectionCount >= MAX_SECTION_LAYOUTS) return null;
  const complete = completeSectionLayoutsForBoundaryMutation(state, resolved);
  if (!complete) return null;

  const layouts = normalizeSectionLayouts([
    ...complete.layouts.slice(0, resolved.sectionIndex + 1),
    complete.layouts[resolved.sectionIndex],
    ...complete.layouts.slice(resolved.sectionIndex + 1),
  ]);
  if (!layouts || layouts.length !== resolved.sectionCount + 1) return null;
  return {
    sectionIndex: resolved.sectionIndex,
    sectionCount: resolved.sectionCount + 1,
    layouts,
    materialized: complete.materialized,
  };
}

/**
 * Merge across one exact live section boundary using Word's ownership rule:
 * deleting a section break removes the PRECEDING section properties, so the
 * combined section keeps the complete formatting of the following section.
 */
export function removePrecedingSectionLayout(
  state: Pick<EditorState, "doc" | "selection">,
  breakPosition: number,
): SectionBoundaryLayoutUpdate | null {
  const boundaries = sectionBreakBoundaries(state.doc);
  const sectionIndex = boundaries.findIndex(
    (boundary) => boundary.from === breakPosition,
  );
  if (sectionIndex < 0) return null;

  const resolved = resolveSectionAtSelection(state);
  if (resolved.sectionCount !== boundaries.length + 1) return null;
  const complete = completeSectionLayoutsForBoundaryMutation(state, resolved);
  if (!complete) return null;

  const layouts = normalizeSectionLayouts(
    complete.layouts.filter((_, index) => index !== sectionIndex),
  );
  if (!layouts || layouts.length !== resolved.sectionCount - 1) return null;
  return {
    sectionIndex,
    sectionCount: resolved.sectionCount - 1,
    layouts,
    materialized: complete.materialized,
  };
}

export interface SectionLayoutUpdate {
  sectionIndex: number;
  sectionCount: number;
  layouts: SectionLayout[];
  /** True when absent legacy globals were expanded into one entry per section. */
  materialized: boolean;
}

/**
 * Backward-compatible form: replace the complete layout at the selection.
 */
export function updateSectionLayout(
  state: Pick<EditorState, "doc" | "selection">,
  candidate: unknown,
): SectionLayoutUpdate | null;
/**
 * Preferred form: patch an explicit zero-based section index. It never depends
 * on the current selection, and it preserves all sibling section entries.
 */
export function updateSectionLayout(
  state: Pick<EditorState, "doc" | "selection">,
  sectionIndex: number,
  patch: SectionLayoutPatch,
): SectionLayoutUpdate | null;
export function updateSectionLayout(
  state: Pick<EditorState, "doc" | "selection">,
  candidateOrSectionIndex: unknown,
  patch?: unknown,
): SectionLayoutUpdate | null {
  const resolved = resolveSectionAtSelection(state);
  const explicitIndex =
    typeof candidateOrSectionIndex === "number"
      ? candidateOrSectionIndex
      : resolved.sectionIndex;
  if (
    !Number.isInteger(explicitIndex) ||
    explicitIndex < 0 ||
    explicitIndex >= resolved.sectionCount
  ) {
    return null;
  }

  const complete = completeSectionLayoutsForBoundaryMutation(state, resolved);
  if (!complete) return null;
  const { layouts, materialized } = complete;

  const replacement =
    typeof candidateOrSectionIndex === "number"
      ? applySectionLayoutPatch(layouts[explicitIndex], patch)
      : (normalizeSectionLayouts([candidateOrSectionIndex])?.[0] ?? null);
  if (!replacement) return null;
  const updated = layouts.map((layout, index) =>
    index === explicitIndex ? replacement : layout,
  );
  return {
    sectionIndex: explicitIndex,
    sectionCount: resolved.sectionCount,
    layouts: updated,
    materialized,
  };
}

/**
 * Paint ordered section layouts onto structural page sheets. Returns false and
 * clears old stamps when the stored array no longer matches the current section
 * boundary count, avoiding a plausible-looking but wrong clamped preview.
 */
export function applySectionLayoutsToSheets(
  root: ParentNode,
  value: unknown,
  settings: WordDocumentSettings | null = null,
): boolean {
  const sheets = sheetsOf(root);
  const clear = () => {
    for (const sheet of sheets) {
      sheet.style.width = "";
      sheet.style.minHeight = "";
      sheet.style.paddingTop = "";
      sheet.style.paddingRight = "";
      sheet.style.paddingBottom = "";
      sheet.style.paddingLeft = "";
      sheet.style.marginLeft = "";
      sheet.style.marginRight = "";
      sheet.style.removeProperty("--page-height-px");
      sheet.style.removeProperty("--page-margin-top");
      sheet.style.removeProperty("--page-margin-right");
      sheet.style.removeProperty("--page-margin-bottom");
      sheet.style.removeProperty("--page-margin-left");
      for (const key of ["--sheet-header-offset", "--sheet-footer-offset", "--sheet-header-alignment", "--sheet-footer-alignment"]) sheet.style.removeProperty(key);
      sheet.style.columnCount = "";
      sheet.style.columnGap = "";
      sheet.style.columnRule = "";
      sheet.style.outlineColor = "";
      sheet.style.outlineStyle = "";
      sheet.style.outlineWidth = "";
      sheet.style.outlineOffset = "";
      sheet.removeAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR);
      sheet.removeAttribute(SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR);
      sheet.removeAttribute(SECTION_NATIVE_PAGE_BORDER_ATTR);
      delete sheet.dataset.sectionLayoutIndex;
    }
  };
  const layouts = normalizeSectionLayouts(value);
  if (!layouts || sheets.length === 0) {
    clear();
    return false;
  }
  const breakCounts = sheets.map(
    (sheet) => sheet.querySelectorAll('[data-type="section-break"]').length,
  );
  const sectionCount = breakCounts.reduce((sum, count) => sum + count, 1);
  if (layouts.length !== sectionCount) {
    clear();
    return false;
  }
  let sectionIndex = 0;
  let pageIndexInSection = 0;
  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index];
    const layout = layouts[sectionIndex];
    const css = sectionLayoutColumnsCss(layout);
    const geometry = sectionLayoutSheetCss(layout, settings, index);
    sheet.style.width = geometry.width;
    sheet.style.minHeight = geometry.minHeight;
    sheet.style.paddingTop = geometry.paddingTop;
    sheet.style.paddingRight = geometry.paddingRight;
    sheet.style.paddingBottom = geometry.paddingBottom;
    sheet.style.paddingLeft = geometry.paddingLeft;
    sheet.style.marginLeft = "auto";
    sheet.style.marginRight = "auto";
    sheet.style.setProperty("--page-height-px", geometry.pageHeight);
    sheet.style.setProperty("--page-margin-top", geometry.marginTop);
    sheet.style.setProperty("--page-margin-right", geometry.marginRight);
    sheet.style.setProperty("--page-margin-bottom", geometry.marginBottom);
    sheet.style.setProperty("--page-margin-left", geometry.marginLeft);
    for (const [key, value] of Object.entries(sectionLayoutBandCss(layout, settings, index))) sheet.style.setProperty(key, value);
    sheet.style.columnCount = css.columnCount ?? "";
    sheet.style.columnGap = css.columnGap ?? "";
    sheet.style.columnRule = css.columnRule ?? "";
    const pageBorder = sectionLayoutPageBorderCss(layout, pageIndexInSection);
    for (const property of PAGE_BORDER_CSS_PROPERTIES) {
      const value = pageBorder?.[property];
      if (value === undefined) sheet.style.removeProperty(property);
      else sheet.style.setProperty(property, value);
    }
    if (pageBorder) {
      sheet.setAttribute(SECTION_NATIVE_PAGE_BORDER_ATTR, "true");
    } else {
      sheet.removeAttribute(SECTION_NATIVE_PAGE_BORDER_ATTR);
    }
    const unequalTracks = sectionLayoutColumnTracksToken(layout);
    if (unequalTracks) {
      sheet.setAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR, unequalTracks);
      if (layout.columns.separator) {
        sheet.setAttribute(SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR, "true");
      } else {
        sheet.removeAttribute(SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR);
      }
    } else {
      sheet.removeAttribute(SECTION_UNEQUAL_COLUMN_TRACKS_ATTR);
      sheet.removeAttribute(SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR);
    }
    sheet.dataset.sectionLayoutIndex = String(sectionIndex);
    if (breakCounts[index] > 0) {
      sectionIndex += breakCounts[index];
      pageIndexInSection = 0;
    } else {
      pageIndexInSection += 1;
    }
  }
  return true;
}
