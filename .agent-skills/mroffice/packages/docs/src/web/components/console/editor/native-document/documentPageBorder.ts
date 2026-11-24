/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Page Border command model (Design > Page Borders / `<w:pgBorders>`).
 *
 * Pure section-layout patch composition, kept out of React so the ribbon menu,
 * the overflow menu and the contract tests all drive the same rules. The stored
 * model is the exact one — `sectionLayouts[i].pageBorders` — because that is
 * what both importers fill and both exporters honour; the legacy document-wide
 * `pageBorder` box attr only ever described a uniform four-sided box and cannot
 * express Word's per-side Custom setting.
 *
 * Nothing here touches ProseMirror: every function returns a value for
 * `SectionLayoutPatch.pageBorders`, which `normalizeSectionLayouts` re-validates
 * before it can reach the document.
 */

import {
  SECTION_BORDER_EDGE_NAMES,
  type SectionBorderEdge,
  type SectionBorderEdgeName,
  type SectionBorderStyle,
  type SectionLayout,
  type SectionLayoutPatch,
} from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";

export type PageBorders = NonNullable<SectionLayout["pageBorders"]>;
export type PageBordersPatch = NonNullable<SectionLayoutPatch["pageBorders"]>;

/**
 * The Width list Word offers, in points (`WdLineWidth`). `w:sz` is in eighths of
 * a point, so these are exactly the values Word writes divided by eight.
 */
export const PAGE_BORDER_WEIGHT_POINTS = [
  0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6,
] as const;

/**
 * The Style list. These are `ST_Border` tokens (ECMA-376 17.3.4) written
 * verbatim into `w:val`, so a chosen style needs no lossy mapping on export.
 * A document may carry any other `ST_Border` line style from its import; the
 * menu then shows no selection and leaves the authored token alone unless the
 * user picks a replacement.
 */
export const PAGE_BORDER_MENU_STYLES = [
  "single",
  "thick",
  "double",
  "triple",
  "dotted",
  "dashed",
  "dotDash",
  "dotDotDash",
  "wave",
  "doubleWave",
  "threeDEmboss",
  "threeDEngrave",
  "outset",
  "inset",
] as const;
export type PageBorderMenuStyle = (typeof PAGE_BORDER_MENU_STYLES)[number];

/**
 * Which drawing the shared `OfficeBorderLinePreview` uses for a Style row. The
 * preview's vocabulary folds weight into the style, so only its line SHAPE is
 * borrowed here — the chosen weight stays a separate `w:sz`.
 */
export const PAGE_BORDER_STYLE_PREVIEW = {
  single: "thin",
  thick: "thick",
  double: "double",
  triple: "double",
  dotted: "dotted",
  dashed: "dashed",
  dotDash: "dashed",
  dotDotDash: "dashed",
  wave: "thin",
  doubleWave: "double",
  threeDEmboss: "medium",
  threeDEngrave: "medium",
  outset: "medium",
  inset: "medium",
} as const satisfies Record<
  PageBorderMenuStyle,
  "thin" | "dashed" | "dotted" | "medium" | "thick" | "double"
>;

/**
 * Word's "Apply to" list. The first entry spans every section; the other three
 * are this section with a `w:display` selecting which of its pages paint.
 */
export const PAGE_BORDER_APPLY_SCOPES = [
  "wholeDocument",
  "thisSection",
  "thisSectionFirstPageOnly",
  "thisSectionAllExceptFirstPage",
] as const;
export type PageBorderApplyScope = (typeof PAGE_BORDER_APPLY_SCOPES)[number];

const SCOPE_DISPLAY: Record<
  PageBorderApplyScope,
  PageBorders["display"]
> = {
  wholeDocument: "allPages",
  thisSection: "allPages",
  thisSectionFirstPageOnly: "firstPage",
  thisSectionAllExceptFirstPage: "notFirstPage",
};

/**
 * The border Word writes for a fresh Box: a hairline solid black line 24 points
 * inside the paper edge. `w:sz="4"` is ½ pt, Word's own default Width.
 */
export const DEFAULT_PAGE_BORDER_EDGE: SectionBorderEdge = {
  style: "single",
  sizeEighths: 4,
  spacePt: 24,
  color: "auto",
};

const DEFAULT_PAGE_BORDERS: PageBorders = {
  offsetFrom: "page",
  display: "allPages",
  zOrder: "front",
  edges: Object.fromEntries(
    SECTION_BORDER_EDGE_NAMES.map((side) => [side, DEFAULT_PAGE_BORDER_EDGE]),
  ),
};

/** Which of the four sides this border paints. */
export function pageBorderSides(
  borders: PageBorders | null | undefined,
): readonly SectionBorderEdgeName[] {
  if (!borders) return [];
  return SECTION_BORDER_EDGE_NAMES.filter(
    (side) => borders.edges[side] !== undefined,
  );
}

/** The pen a new side inherits: an existing side, else Word's default box. */
function pageBorderPen(borders: PageBorders | null | undefined): SectionBorderEdge {
  const existing = pageBorderSides(borders)[0];
  return existing && borders
    ? { ...borders.edges[existing]! }
    : { ...DEFAULT_PAGE_BORDER_EDGE };
}

/**
 * Toggle one side. Clearing the last remaining side removes the whole element,
 * because a `<w:pgBorders>` with no edge is not a border Word can express.
 */
export function pageBorderSideTogglePatch(
  borders: PageBorders | null | undefined,
  side: SectionBorderEdgeName,
): PageBordersPatch | null {
  const sides = pageBorderSides(borders);
  if (!sides.includes(side)) {
    const pen = pageBorderPen(borders);
    return borders
      ? { edges: { [side]: pen } }
      : { ...DEFAULT_PAGE_BORDERS, edges: { [side]: pen } };
  }
  if (sides.length === 1) return null;
  return { edges: { [side]: null } };
}

/**
 * The all-four-sides toggle. Off when every side already paints (Word's None),
 * otherwise it completes the box with the current pen.
 */
export function pageBorderAllEdgesTogglePatch(
  borders: PageBorders | null | undefined,
): PageBordersPatch | null {
  const sides = pageBorderSides(borders);
  if (sides.length === SECTION_BORDER_EDGE_NAMES.length) return null;
  const pen = pageBorderPen(borders);
  const edges = Object.fromEntries(
    SECTION_BORDER_EDGE_NAMES.map((side) => [side, { ...pen }]),
  );
  return borders ? { edges } : { ...DEFAULT_PAGE_BORDERS, edges };
}

/** Whether the all-four-sides toggle reads as on, off, or partly on. */
export function pageBorderAllEdgesState(
  borders: PageBorders | null | undefined,
): boolean | "indeterminate" {
  const count = pageBorderSides(borders).length;
  if (count === SECTION_BORDER_EDGE_NAMES.length) return true;
  return count === 0 ? false : "indeterminate";
}

/**
 * Apply a pen change (Weight / Style / Colour) to every side that paints — the
 * three controls describe one pen, not four.
 *
 * On a section with NO border the pen still applies, and it brings the border
 * with it: Word's object model has no on/off flag separate from the line style,
 * and assigning one to a section IS the act that creates the page border
 * (`Border.LineStyle`: setting it for a section applies a page border around
 * that section's pages). `Borders.Enable = True` is documented to take the
 * default line style and width and to apply to every border of the object, so
 * the properties the user did not choose take Word's defaults and all four
 * sides come up together — one patch, so one undo takes it all back.
 */
export function pageBorderPenPatch(
  borders: PageBorders | null | undefined,
  pen: {
    [K in keyof SectionBorderEdge]?: SectionBorderEdge[K] | null;
  },
): PageBordersPatch | null {
  const sides = pageBorderSides(borders);
  if (sides.length > 0) {
    return { edges: Object.fromEntries(sides.map((side) => [side, pen])) };
  }
  return {
    ...DEFAULT_PAGE_BORDERS,
    edges: Object.fromEntries(
      SECTION_BORDER_EDGE_NAMES.map((side) => [
        side,
        { ...DEFAULT_PAGE_BORDER_EDGE, ...pen },
      ]),
    ),
  };
}

/**
 * Word's Options… "Margin" value in points (`w:space`), or `null` when the sides
 * disagree. Word exposes one field per side; MRAI keeps the four in step, which
 * is what its own dialog produces for every Setting except Custom.
 */
export function pageBorderSpacePt(
  borders: PageBorders | null | undefined,
): number | null {
  const sides = pageBorderSides(borders);
  if (sides.length === 0 || !borders) return null;
  const values = new Set(sides.map((side) => borders.edges[side]?.spacePt ?? 0));
  return values.size === 1 ? [...values][0] : null;
}

/** The Weight row's value in points, or `null` when the sides disagree. */
export function pageBorderWeightPt(
  borders: PageBorders | null | undefined,
): number | null {
  const sides = pageBorderSides(borders);
  if (sides.length === 0 || !borders) return null;
  const values = new Set(
    sides.map((side) => borders.edges[side]?.sizeEighths ?? 0),
  );
  if (values.size !== 1) return null;
  const eighths = [...values][0];
  return eighths > 0 ? eighths / 8 : null;
}

/** The Style row's value, or `null` when the sides disagree. */
export function pageBorderStyle(
  borders: PageBorders | null | undefined,
): SectionBorderStyle | null {
  const sides = pageBorderSides(borders);
  if (sides.length === 0 || !borders) return null;
  const values = new Set(sides.map((side) => borders.edges[side]!.style));
  return values.size === 1 ? ([...values][0] as SectionBorderStyle) : null;
}

/**
 * The Colour row's value as the shared palette spells it (`#RRGGBB`). Word's
 * `w:color="auto"` paints black, and a theme-coloured border carries the
 * resolved literal colour alongside `w:themeColor`.
 */
export function pageBorderColorHex(
  borders: PageBorders | null | undefined,
): string | null {
  const sides = pageBorderSides(borders);
  if (sides.length === 0 || !borders) return null;
  const values = new Set(
    sides.map((side) => borders.edges[side]?.color ?? "auto"),
  );
  if (values.size !== 1) return null;
  const value = [...values][0];
  if (value === "auto") return "#000000";
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

/** Whether every painting side is on Word's Automatic colour. */
export function pageBorderColorIsAutomatic(
  borders: PageBorders | null | undefined,
): boolean {
  const sides = pageBorderSides(borders);
  if (sides.length === 0 || !borders) return false;
  return sides.every((side) => (borders.edges[side]?.color ?? "auto") === "auto");
}

/**
 * The pen change one colour pick makes. Picking a literal colour must also drop
 * any imported `w:themeColor`/tint/shade, or Word would keep resolving the
 * border against the theme and ignore the new value.
 */
export function pageBorderColorPen(color: string | null): {
  [K in keyof SectionBorderEdge]?: SectionBorderEdge[K] | null;
} {
  const hex = typeof color === "string" ? color.trim().replace(/^#/, "") : "";
  return {
    color: /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : "auto",
    themeColor: null,
    themeTint: null,
    themeShade: null,
  };
}

/** Which "Apply to" entry the stored `w:display` reads as, within one section. */
export function pageBorderApplyScope(
  borders: PageBorders | null | undefined,
): PageBorderApplyScope {
  switch (borders?.display) {
    case "firstPage":
      return "thisSectionFirstPageOnly";
    case "notFirstPage":
      return "thisSectionAllExceptFirstPage";
    default:
      return "thisSection";
  }
}

/**
 * What an "Apply to" choice writes.
 *
 * The three section-local entries only move `w:display`. "Whole document" sends
 * the WHOLE border to every section — Word copies the border out, it does not
 * just widen the page selector — so the patch is the complete element and
 * `everySection` tells the caller to repeat it across the chain. On a section
 * with no border every entry creates Word's default box in the chosen scope.
 */
export function pageBorderApplyToPatch(
  borders: PageBorders | null | undefined,
  scope: PageBorderApplyScope,
): {
  readonly patch: PageBordersPatch;
  readonly everySection: boolean;
} | null {
  // Choosing a scope on a section with no border creates Word's default box in
  // that scope. This menu commits on click and has no OK button, so "apply to
  // X" can only mean the border the dialog would have applied on OK; the
  // alternative is an enabled row that silently does nothing.
  const base = borders && pageBorderSides(borders).length > 0 ? borders : null;
  if (!base) {
    const edges = Object.fromEntries(
      SECTION_BORDER_EDGE_NAMES.map((side) => [
        side,
        { ...DEFAULT_PAGE_BORDER_EDGE },
      ]),
    );
    return scope === "wholeDocument"
      ? { patch: { ...DEFAULT_PAGE_BORDERS, edges }, everySection: true }
      : {
          patch: { ...DEFAULT_PAGE_BORDERS, display: SCOPE_DISPLAY[scope], edges },
          everySection: false,
        };
  }
  if (scope === "wholeDocument") {
    // Every side is stated, absent ones as `null`: the edge patch MERGES, so a
    // section that already carried more sides would otherwise keep them.
    return {
      patch: {
        offsetFrom: base.offsetFrom,
        display: "allPages",
        zOrder: base.zOrder,
        edges: Object.fromEntries(
          SECTION_BORDER_EDGE_NAMES.map((side) => [
            side,
            base.edges[side] ? { ...base.edges[side]! } : null,
          ]),
        ),
      },
      everySection: true,
    };
  }
  return { patch: { display: SCOPE_DISPLAY[scope] }, everySection: false };
}
