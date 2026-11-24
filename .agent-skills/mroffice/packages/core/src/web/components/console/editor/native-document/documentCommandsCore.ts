/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The document command model's core: the command shapes, the checks a
 * command passes before it is applied, and a spreadsheet page command's
 * application -- everything a workbook needs of `documentCommands`, without
 * the rich-text editor (tiptap), Markdown and the Docs-only appliers that
 * module also holds. A workbook imported all of those just to apply a
 * Copilot command to its cells; it now imports this. `documentCommands`
 * re-exports every name here, so nothing that imports it changes.
 */
import { ptToPx } from "../../../../lib/office-units";
import type { JSONContent } from "@tiptap/core";
import { MRNOTE_DOCUMENT_COMMAND_TYPE, isNativeDocumentCommand } from "./documentCommandShape";
import type { OfficePictureEffects } from "../../../../lib/office-picture-effects";
import { isValidInlineImageSource, recordHasInvalidInlineImageSrc } from "../../../../lib/inline-image-source";
import { coveredCells, normalizeMerges } from "../../../../lib/spreadsheet/merge-cells";
import { hydrateSheetForEditing } from "../../../../lib/spreadsheet/blank-cell-formats";
import { nativeFontSizeAfterPatch } from "../../../../lib/spreadsheet/native-font-size";
import { themeColorsAfterPatch } from "../../../../lib/spreadsheet/theme-colors";
import { withSpreadsheetChartFlatPatch, type SpreadsheetChartLike } from "../../../../lib/spreadsheet/chart-v2-model";
import type { ScriptStep } from "@/lib/copilot-script";
import type { TextRun } from "../../../../lib/presentation-runs";
import type { PresentationConnectorEnd, PresentationConnectorPreset, PresentationConnectorRoute } from "../../../../lib/presentation-shapes";
import type { PresentationCustomPath } from "../../../../lib/presentation-freeform";
import type { PresentationClickAction } from "../../../../lib/presentation-block-fx";
import type { PersistedPresentationMediaPlaybackSettings } from "../../../../lib/presentation-embed";
import { PRESENTATION_GEOMETRY_MAX_EMU } from "../../../../lib/presentation-geometry-limit";

export const MAX_COMMAND_CELL_CHARS = 5_000;
export const MAX_PRESENTATION_TABLE_COMMAND_ROWS = 80;
export const MAX_PRESENTATION_TABLE_COMMAND_COLS = 30;
// Values listed one by one in a command (the server's bound is the same);

// written past row 10,000 like any other).
export const MAX_SPREADSHEET_COMMAND_ROWS = 20_000;
export const MAX_SPREADSHEET_COMMAND_COLS = 16_384;
export const MAX_SPREADSHEET_COMMAND_CELLS = 20_000;
export const MAX_SPREADSHEET_ROWS = 1_048_576;
export const MAX_SPREADSHEET_COLS = 16_384;
// One range write: the worksheet grid (the server's bound is the same).
export const MAX_SPREADSHEET_CELL_ATTR_ROWS = 1_048_576;
export const MAX_SPREADSHEET_CELL_ATTR_COLS = 16_384;
export const MAX_SPREADSHEET_CELL_ATTR_CELLS = 1_048_576;
export const MAX_SPREADSHEET_HYPERLINK_CHARS = 4_096;
export const MAX_CHART_DATA_ROWS = 200;
export const MAX_CHART_DATA_COLS = 20;
export const MAX_TEXT_PATCH_CHARS = 100_000;
// Mirrors notebook_ai MAX_DOCUMENT_COMMAND_OPERATIONS.
export const MAX_DOCUMENT_COMMAND_OPERATIONS = 2_000;
export const MAX_PRESENTATION_GEOMETRY_EMU = PRESENTATION_GEOMETRY_MAX_EMU;
export const MAX_SPREADSHEET_OBJECT_GEOMETRY_EMU = 20_000_000;
export type PresentationTextStyle = {
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /**
   * Horizontal text alignment. `justify` (full-width justification) is the
   * PowerPoint/WPS fourth option alongside left/center/right; resolved at the
   * render edge by `resolveTextAlign` (lib/presentation-text-format).
   */
  align?: "left" | "center" | "right" | "justify" | "distribute";
  /**
   * Optional VERTICAL text anchor within the block box (PowerPoint / WPS "Align
   * Text" → Top / Middle / Bottom parity). Mirrors the spreadsheet cell
   * `verticalAlign` model. Additive — a block without it anchors to the top
   * (the historical render). Resolved at the render edge by
   * `lib/presentation-vertical-anchor`.
   */
  verticalAlign?: "top" | "middle" | "bottom";
  /**
   * Optional line spacing / paragraph spacing (PowerPoint / WPS parity), all
   * additive. `lineSpacing` is a unitless multiple (1.0 / 1.5 / 2.0 …);
   * `spaceBefore` / `spaceAfter` are in POINTS. Normalized + projected to CSS
   * (`lineHeight` + margins) at the render edge by `lib/presentation-line-spacing`.
   * A block without these fields renders byte-for-byte as before.
   */
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /**
   * Optional LETTER (character / tracking) spacing in POINTS and text
   * WRITING-MODE (direction), both additive (PowerPoint / WPS "Character
   * Spacing" + CJK vertical "竖排" parity). `letterSpacing` projects to CSS
   * `letter-spacing`; `writingMode` to CSS `writing-mode` (only `vertical-rl`
   * is persisted). Normalized at the render edge by
   * `lib/presentation-line-spacing`. A block without these renders byte-for-byte
   * as before.
   */
  letterSpacing?: number;
  writingMode?:
    | "horizontal-tb"
    | "vertical-rl"
    | "rot90"
    | "rot270"
    | "stacked";
  /** PPT 段落缩进 (block-level, 0..8 half-inch steps). */
  indentLevel?: number;
};

/**
 * Internal text-frame margins in DrawingML EMU. Keeping the native integer
 * unit avoids conversion drift across canvas rendering and PPTX reopen.
 */
export type PresentationTextInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
/**
 * Block-level effects shared by every presentation block kind: an optional
 * present-mode entrance animation and an optional hyperlink. Both are additive
 * and validated against whitelists in `lib/presentation-block-fx.ts`; they are
 * typed loosely here (string) since the index signature already permits them and
 * the renderer/normalizer re-validate at the edge.
 */
export type PresentationBlockFx = {
  




  textFontSizeUnit?: "point";
  /** Present-mode entrance animation id (none/fade/fly-in/zoom). */
  animation?: string;
  /** Hyperlink opened (safely) when the block is clicked. */
  href?: string;
  /**
   * LOCK (PowerPoint / WPS "Lock" on the Selection pane / right-click): when
   * `true`, the block can't be moved / resized / rotated / deleted by direct
   * manipulation on the canvas (a right-click Unlock clears it). Additive +
   * migration-safe — persisted ONLY when strictly `true`, so an unlocked block
   * carries no `locked` key and serializes byte-for-byte as before. Enforced by
   * `lib/presentation-text-case.isBlockLocked` / `canManipulateBlock`.
   */
  locked?: boolean;
  /** Selection Pane object label; absent keeps the generated object name. */
  name?: string;
  /** Selection Pane visibility. Only `true` is persisted by editor commands. */
  hidden?: boolean;
  /**
   * Native import/patchback authority carried by positioned Office objects.
   * Each block kind validates the record at its own command boundary; keeping
   * the shared field explicit avoids weak-type casts for charts and media.
   */
  source?: Record<string, unknown>;
};
/**
 * An optional bulleted / numbered list paragraph on a text block (PowerPoint /
 * WPS parity). `level` is the 0..4 indent depth; `bullet` selects the marker.
 * When a text block carries no `paragraphs`, it renders as the flat `text`
 * string exactly as before — the array is additive and migration-safe. The
 * structure is normalized/clamped at the render edge by
 * `lib/presentation-paragraphs.ts`.
 */
export type PresentationParagraph = {
  text: string;
  level: number;
  bullet: "none" | "bullet" | "number";
  /** Paragraph-local DrawingML alignment; absent inherits the text-box style. */
  align?: "left" | "center" | "right" | "justify" | "distribute";
  /** Paragraph-local line multiple and before/after spacing in points. */
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Imported unsupported spacing slots that must not borrow a block fallback. */
  spacingFallbackBlocked?: Array<"lineSpacing" | "spaceBefore" | "spaceAfter">;
  /**
   * Optional character-level (per-run) inline formatting WITHIN this paragraph.
   * When absent the paragraph renders as flat `text` with the block/paragraph
   * style; when present `text` stays the concatenation of `runs` (the invariant
   * `textFromRuns(runs) === text`). Normalized at the render edge by
   * `lib/presentation-runs.ts`.
   */
  runs?: TextRun[];
};
export type PresentationTextBlock = PresentationBlockFx & {
  /**
   * SmartArt label 3-D (`docs/office-graphics/SMARTART-STYLES.md` §4):
   * `textShape3d` is the text body's own extrusion (style `3d9` only) and
   * `scene3d` the shared diagram camera, so a label tilts with its node.
   */
  textShape3d?: import("@/lib/office-smartart/styles").SmartArtTextShape3d;
  scene3d?: import("@/lib/office-smartart/styles").SmartArtScene3d;
  smartArtStyle?: import("@/lib/office-smartart/styles").SmartArtStyleId;
  id: string;
  type: "text";
  text: string;
  paragraphs?: PresentationParagraph[];
  /**
   * Optional character-level (per-run) inline formatting for the FLAT block text
   * (used when there are no `paragraphs`). Additive + migration-safe; the flat
   * `text` stays in sync as the concatenation of `runs`. See
   * `lib/presentation-runs.ts`.
   */
  runs?: TextRun[];
  /**
   * Optional BLOCK-LEVEL bullet glyph / number format choice (PowerPoint /
   * WPS "Bullets & Numbering" gallery). When set, they override the per-level
   * default glyph / number scheme for every bulleted / numbered paragraph in
   * the block. Additive — absent means the per-level default (byte stable).
   * Normalized at the render edge by `lib/presentation-paragraphs.ts`
   * (`normalizeBulletChar` / `normalizeNumberFormat`).
   */
  bulletChar?: string;
  numberFormat?: string;
  style?: PresentationTextStyle;
  /** Text-to-frame distance (`a:bodyPr@lIns/rIns/tIns/bIns`), in EMU. */
  textInsets?: PresentationTextInsets;
  /**
   * Optional TEXT-BOX FILL + OUTLINE (PowerPoint "Shape Fill / Outline" applied
   * to a text box), all additive. `fill`(+`fillTo`/`gradientAngle`) is a solid
   * or gradient background; `outlineColor`/`outlineWidth`/`outlineStyle` an
   * optional border; `shadow` a soft drop shadow. Resolved at the render +
   * serialize edges by `lib/presentation-text-fill`; absent ⇒ plain text, byte
   * stable.
   */
  fill?: string;
  

  fillTransparency?: number;
  fillTo?: string;
  gradientAngle?: number;
  outlineColor?: string;
  outlineColorTo?: string;
  outlineGradientAngle?: number;
  outlineWidth?: number;
  outlineStyle?: "solid" | "dashed" | "dotted";
  shadow?: boolean;
  /**
   * Format Shape > Effects on the box (a text box is a shape): the shape's
   * one combinable model, which states the shadow too when present
   * (`lib/presentation-shape-effects`).
   */
  shapeEffects?: import("../../../../lib/office-picture-effects").OfficePictureEffects;
  /** Format Shape > 3-D Rotation > Keep text flat (`a:flatTx`), only when checked. */
  keepTextFlat?: true;
  /**
   * Optional TEXT AUTOFIT mode (PowerPoint "Shrink text on overflow" →
   * `<a:normAutofit>`; WPS parity). `shrink` shrinks the body font uniformly so
   * the text fits the box height; absent / `none` renders at the nominal size
   * (byte-stable). Additive — an un-opted block carries no `autofit` key.
   * Resolved at the render edge by `lib/presentation-autofit`.
   */
  autofit?: "none" | "shrink" | "resize-shape";
  /**
   * Optional BODY MULTI-COLUMN count (PowerPoint "Text Options → Columns"; WPS
   * parity). 2 / 3 flow the body text newspaper-style; absent / 1 renders one
   * column (byte-stable). Resolved at the render edge by
   * `lib/presentation-text-columns`.
   */
  columnCount?: number;
  [key: string]: unknown;
};
export type PresentationImageBlock = PresentationBlockFx & {
  id: string;
  type: "image";
  src: string;
  alt?: string;
  caption?: string;
  pictureStylePreset?: string;
  /** Original bitmap locator, not authority to mutate the source picture. */
  pictureOriginalSource?: Record<string, unknown>;
  /**
   * Native Office Graphic identity. SVG graphics deliberately remain a
   * separate contextual surface even though PresentationML carries them in a
   * `p:pic`: `src` is the sanitized vector cache, while `graphicFallbackSrc`
   * is the compatibility PNG paired with `asvg:svgBlip` in the PPTX package.
   */
  officeGraphicKind?: "svg";
  graphicFallbackSrc?: string;
  /**
   * Graphics Format > Graphics Fill / Graphics Outline (PPT-A161): the SVG
   * graphic's one fill and one outline, `#rrggbb` or `"none"`. The server
   * rewrites the SVG part as PowerPoint does; the canvas draws a recoloured
   * copy (`lib/presentation-office-graphic-paint`). A theme swatch keeps its
   * reference in `themeColors.graphicFill` / `themeColors.graphicOutline`.
   */
  graphicFill?: string;
  graphicOutline?: string;
  /** Graphics Outline > Weight, in the SVG's user units (`stroke-width`). */
  graphicOutlineWidth?: number;
  /** Graphics Outline > Dashes, by DrawingML name (`solid`, `sysDot`, ...). */
  graphicOutlineDash?: string;
  /**
   * Picture Format > Artistic Effects: one of Office's `a14:artistic*` effect
   * names (`lib/office-artistic-effects`). `artisticEffectRendered` marks a
   * picture whose `src` IS already the rendered result (read from a file), so
   * the canvas does not draw the effect a second time.
   */
  artisticEffect?: string;
  artisticEffectRendered?: boolean;
  /**
   * Picture Format > Picture Effects other than Shadow: Glow, Reflection,
   * Soft Edges, Bevel and 3-D Rotation (`lib/office-picture-effects`).
   */
  pictureEffects?: OfficePictureEffects;
  width?: number;
  height?: number;
  /**
   * Optional crop rectangle in 0..1 SOURCE-image fractions. Validated/clamped
   * at the render edge by `clampCropRect` (lib/presentation-crop-group); absent
   * means show the whole image.
   */
  cropRect?: { x: number; y: number; w: number; h: number };
  /**
   * Optional image visual effects (PowerPoint parity), all additive. Resolved /
   * bounded at the render + serialize edges by `lib/presentation-image-effects`;
   * absent fields mean "no effect" so an un-styled image stays byte-stable.
   */
  shadow?: boolean;
  borderColor?: string;
  borderWidth?: number;
  cornerRadius?: number;
  /**
   * Optional picture ADJUSTMENTS (PowerPoint "Color" / "Corrections" parity),
   * all additive. `opacity` 0..100 (% visible); `recolor` a tint mode;
   * `brightness` / `contrast` 0..200 (% where 100 = unmodified). Resolved at the
   * render + serialize edges by `lib/presentation-image-effects`; absent ⇒ no
   * adjustment (byte stable).
   */
  opacity?: number;
  recolor?:
    | "none"
    | "grayscale"
    | "sepia"
    | "washout"
    | "invert"
    | "duotone"
    | "vivid";
  brightness?: number;
  contrast?: number;
  /**
   * Optional COMPOSITING mode (PowerPoint "Transparency / blend" parity → CSS
   * `mix-blend-mode`). A whitelisted safe value; absent / `normal` ⇒ ordinary
   * stacking (byte-stable). Resolved at the render + serialize edges by
   * `lib/presentation-image-effects`.
   */
  blendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten";
  [key: string]: unknown;
};
export type PresentationTableCell = {
  text: string;
  colspan?: number;
  rowspan?: number;
  /** Optional per-cell formatting (PowerPoint parity). All additive. */
  fill?: string;
  color?: string;
  bold?: boolean;
  /** `justify` is PowerPoint's Justify on the cell's paragraphs (`algn="just"`,
   * `CELL_ALIGNMENTS`). */
  align?:
    | "left"
    | "center"
    | "right"
    | "justify"
    // Imported only (PowerPoint's Paragraph dialog): `dist`, `thaiDist`, `justLow`.
    | "distributed"
    | "thaiDistributed"
    | "justifyLow";
  /**
   * Optional VERTICAL text alignment within the cell box (PowerPoint / WPS
   * "Align Top / Center / Bottom"). Absent ⇒ the default `top` (byte-stable).
   */
  verticalAlign?: "top" | "middle" | "bottom";
  [key: string]: unknown;
};
export type PresentationTableBlock = PresentationBlockFx & {
  id: string;
  type: "table";
  rows: PresentationTableCell[][];
  caption?: string;
  /** Table-level thin cell borders. */
  borders?: boolean;
  /** Table-level header-row emphasis (bolds + fills the first row). */
  headerRow?: boolean;
  /** Banded (zebra) body rows — PowerPoint/WPS Table Style Option. */
  bandedRows?: boolean;
  /** Emphasised total row (last row): bold + a separating top border. */
  totalRow?: boolean;
  /**
   * `a:tblPr@rtl`: columns laid out right to left (logical column 0 on the
   * right). Cells stay in logical order; only their placement mirrors.
   */
  rightToLeft?: boolean;
  /**
   * Optional per-column widths / per-row heights in CSS px (PowerPoint parity).
   * Each slot is a bounded size or `null`/absent (auto-size to content). Absent
   * arrays ⇒ the whole table auto-sizes exactly as before (byte-stable). Resolved
   * + bounded at the render / serialize edges by `lib/presentation-table-size`.
   */
  colWidths?: Array<number | null>;
  rowHeights?: Array<number | null>;
  /** Table Design > Shading > Table Background (`a:tblPr` solid fill), `#rrggbb`. */
  tableBackground?: string;
  /** Table Design > Effects > Shadow / Reflection on the whole table. */
  tableEffects?: import("../../../../lib/presentation-table-effects").PresentationTableEffects;
  [key: string]: unknown;
};
export type PresentationChartBlock = PresentationBlockFx & {
  id: string;
  type: "chart";
  chartV2?: import("../extensions/chartBlockShared").ChartBlockAttrsV2;
  /** PPT-owned envelope; shared workbook data does not imply a Docs host. */
  chartWorkbook?: import("../extensions/documentChartWorkbook").DocumentChartWorkbook;
  title?: string;
  caption?: string;
  chartType?: string;
  chartStyle?: number;
  axisTitleX?: string;
  axisTitleY?: string;
  showLegend?: boolean;
  legendPosition?: "right" | "left" | "top" | "bottom";
  trendline?: { type: "linear" };
  showAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGridlines?: boolean;
  showDataTable?: boolean;
  /** Exact native c:chartSpace/c:chart/c:plotArea fill + outline paints. */
  chartAreaStyle?: { fill?: string; outline?: string };
  plotAreaStyle?: { fill?: string; outline?: string };
  chartTitleStyle?: { fill?: string; outline?: string };
  legendStyle?: { fill?: string; outline?: string };
  seriesStyles?: Array<{
    seriesIndex: number;
    fill?: string;
    outline?: string;
  }>;
  /** The shared chart axis-line model (`normalizePresentationChartAxisStyles`). */
  axisStyles?: readonly import("../../../../lib/presentation-chart-area-style").PresentationChartAxisStyle[];
  axisTitleStyles?: Array<{
    axis: "category" | "value";
    fill?: string;
    outline?: string;
  }>;
  gridlineStyle?: { outline: string };
  trendlineStyle?: { outline: string };
  dataTableStyle?: { fill?: string; outline?: string };
  dataLabelStyle?: { fill?: string; outline?: string };
  sliceStyles?: Array<{
    pointIndex: number;
    fill?: string;
    outline?: string;
  }>;
  ranges?: string[];
  data?: {
    headers?: string[];
    rows?: string[][];
  };
  /** The picture PowerPoint saved of an imported chart this page cannot plot
   * (its frame's mc:Fallback, a raster data URL): drawn in place of the chart. */
  nativeChartFallbackSrc?: string;
  [key: string]: unknown;
};
/**
 * A free-floating text box, distinct from the slide title and the default body
 * text block. Shares the text styling/geometry surface of {@link
 * PresentationTextBlock} but carries `kind: "textbox"` so the editor can offer a
 * dedicated insert affordance and render it as a positioned box.
 */
export type PresentationTextBoxBlock = PresentationBlockFx & {
  /** SmartArt label 3-D; see {@link PresentationTextBlock}. */
  textShape3d?: import("@/lib/office-smartart/styles").SmartArtTextShape3d;
  scene3d?: import("@/lib/office-smartart/styles").SmartArtScene3d;
  smartArtStyle?: import("@/lib/office-smartart/styles").SmartArtStyleId;
  id: string;
  type: "text";
  kind: "textbox";
  text: string;
  paragraphs?: PresentationParagraph[];
  /** Optional per-run inline formatting for the flat text; see `presentation-runs.ts`. */
  runs?: TextRun[];
  style?: PresentationTextStyle;
  /** Optional text-box fill / outline; see {@link PresentationTextBlock}. */
  fill?: string;
  fillTo?: string;
  gradientAngle?: number;
  outlineColor?: string;
  outlineWidth?: number;
  outlineStyle?: "solid" | "dashed" | "dotted";
  shadow?: boolean;
  [key: string]: unknown;
};
/**
 * A vector shape (rectangle / ellipse / line / arrow) rendered via CSS or SVG.
 * `shape` selects the kind; `fill`/`stroke` are optional six-digit hex colours.
 * Rich styling (PowerPoint parity): `fillTo`+`gradientAngle` turn the fill into
 * a linear gradient; `strokeWidth`/`strokeStyle` control the outline weight and
 * dash pattern; `shadow` draws a soft drop shadow.
 */
export type PresentationShapeBlock = PresentationBlockFx & {
  fillGradient?: import("../../../../lib/office-shape-paint").OfficeShapeGradient;
  shapeShadow?: import("../../../../lib/office-shape-paint").OfficeShapeShadow;
  






  shape3d?: import("@/lib/office-smartart/styles").SmartArtShape3d;
  scene3d?: import("@/lib/office-smartart/styles").SmartArtScene3d;
  smartArtStyle?: import("@/lib/office-smartart/styles").SmartArtStyleId;
  id: string;
  type: "shape";
  shape?: string;
  /** Safe provider-free present-mode navigation carried by Action Buttons. */
  clickAction?: PresentationClickAction;
  /**
   * Optional CENTERED text label inside the shape (PowerPoint / WPS "add text to
   * shape" parity). Additive + migration-safe; absent for a plain shape. May
   * carry per-run `runs` for inline formatting (same model as text blocks); the
   * flat `text` stays the concatenation of `runs`. Normalized at the render +
   * serialize edges by `normalizeShapeText` (lib/presentation-text-format).
   */
  text?: string;
  runs?: TextRun[];
  /** Optional text style for the shape label (reuses the text-block style). */
  style?: PresentationTextStyle;
  fill?: string;
  /**
   * The solid fill's Transparency (Format Shape > Fill > Transparency), a
   * whole percentage 1..100; absent is opaque. PPTX `a:alpha` on the fill's
   * colour (the Semitransparent Shape Styles presets write 50 %). A new Shape
   * Fill colour is opaque again.
   */
  fillTransparency?: number;
  /**
   * The solid line's Transparency (Format Shape > Line > Transparency), a
   * whole percentage 1..100; absent is opaque. PPTX `a:alpha` on the line's
   * colour. A new line colour is opaque again.
   */
  outlineTransparency?: number;
  fillTo?: string;
  gradientAngle?: number;
  /**
   * Optional PICTURE fill (PowerPoint "Picture or texture fill"): an image url +
   * sizing (`cover`/`contain`/`tile`). When present it replaces the colour /
   * gradient fill. Additive + migration-safe; absent ⇒ colour fill, byte-stable.
   * Resolved at the render + serialize edges by `normalizeShapeFillImage`
   * (lib/presentation-shapes); the url reuses the validated inline-image source.
   */
  fillImage?: { url?: string; fit?: string };
  fillPattern?: {
    pattern?: "dots" | "grid" | "diagonal" | "checker";
    color?: string;
    background?: string;
  };
  stroke?: string;
  /** Optional second outline stop; together with stroke makes a linear gradient. */
  strokeTo?: string;
  /** CSS-convention gradient angle for the outline (90 = left to right). */
  strokeGradientAngle?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  /**
   * Shape Outline > Dashes and Format Shape > Line, as Office states them --
   * the SAME fields and values Docs shapes keep: the exact `a:prstDash` when
   * it refines `strokeStyle`'s family (`@/lib/office-stroke-dash`; Round Dot
   * is `sysDot` with a round cap, Square Dot `sysDash`), and the line's
   * compound type, cap, join and miter limit (`@/lib/office-stroke-detail`).
   */
  outlineDash?: import("../../../../lib/office-stroke-dash").OfficeStrokeDash;
  outlineCompound?: import("../../../../lib/office-stroke-detail").OfficeStrokeCompound;
  outlineCap?: import("../../../../lib/office-stroke-detail").OfficeStrokeCap;
  outlineJoin?: import("../../../../lib/office-stroke-detail").OfficeStrokeJoin;
  outlineMiterLimit?: number;
  /** Shape Outline > Sketched (`ask:lineSketchStyleProps`). */
  outlineSketch?: "curved" | "freehand" | "scribble";
  shadow?: boolean;
  /**
   * Shape Format > Shape Effects and Format Shape > Effects, as Office keeps
   * them: shadow, reflection, glow, soft edges, bevel and 3-D rotation, which
   * combine (the SAME model pictures and Docs shapes keep,
   * `lib/office-picture-effects`; PPTX `a:effectLst` / `a:scene3d` /
   * `a:sp3d`). When present it is the whole truth: `shadow`, `shapeShadow`
   * and `effect` below are legacy and are not drawn beside it.
   */
  shapeEffects?: import("../../../../lib/office-picture-effects").OfficePictureEffects;
  /** Format Shape > 3-D Rotation > Keep text flat (PPTX `a:bodyPr/a:flatTx`):
   * the label stays flat on the shape's front instead of turning with its
   * 3-D rotation. Stated only when checked. */
  keepTextFlat?: true;
  /** Shape Format > Shape Effects preset beside `shadow`
   * (`lib/office-shape-effects`; PPTX `a:effectLst` / `a:sp3d`). */
  effect?: "reflection" | "glow" | "softEdge" | "bevel" | "threeD";
  /** Object transparency as a percentage (0–100; 100/absent = fully opaque). */
  opacity?: number;
  /** PowerPoint's Lock aspect ratio (`a:spLocks noChangeAspect`): a resize
   * keeps the shape's proportions; the same flag Docs and the worksheet keep. */
  lockAspectRatio?: boolean;
  /** WordArt paint on the shape's text (the SHARED `OfficeTextPaint` Docs and
   * the worksheet keep): text fill, outline and effects. */
  textPaint?: import("../../../../lib/office-text-paint").OfficeTextPaint;
  /**
   * The dragged adjustment handles (the yellow ones) as `a:prstGeom/a:avLst`
   * holds them: the preset's guide name mapped to its literal value
   * (`{ adj: 40000 }`) -- the same field Docs and the worksheet keep. Absent
   * means the preset's own defaults.
   */
  adjustments?: Readonly<Record<string, number>>;
  /**
   * Optional COMPOSITING mode (PowerPoint "Transparency / blend" parity → CSS
   * `mix-blend-mode`). A whitelisted safe value; absent / `normal` ⇒ ordinary
   * stacking (byte-stable). Resolved at the render + serialize edges by
   * `resolveShapeStyle` / `boxShapeCss` (lib/presentation-shapes).
   */
  blendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten";
  /**
   * Anchored-connector fields (PowerPoint/WPS parity), all optional + additive.
   * On a `line`/`arrow` shape, `startShapeId`/`endShapeId` glue it to two sibling
   * shapes so it follows them on move/resize; the direction they imply is stored
   * in the block's own `flipH`/`flipV`, exactly as DrawingML stores it (set by
   * `recomputeConnectors`).
   *
   * `lineSlope` is LEGACY and read-only: decks saved before the flips named the
   * diagonal with `"tlbr"`/`"trbl"` instead. `"trbl"` is the horizontal mirror of
   * the preset's `(l,t)→(r,b)` route, so the renderer and the exporter fold it
   * into `flipH`; nothing writes it any more.
   */
  startShapeId?: string;
  endShapeId?: string;
  lineSlope?: "tlbr" | "trbl";
  /**
   * Native DrawingML connector identity. `straight` is accepted while reading
   * legacy content but normalized to an absent `route` on persistence. End
   * markers are independent; neither implies the other.
   */
  route?: PresentationConnectorRoute;
  connectorPreset?: PresentationConnectorPreset;
  headEnd?: PresentationConnectorEnd;
  tailEnd?: PresentationConnectorEnd;
  /**
   * ZOOM-tile markers (PowerPoint/WPS "Insert ▸ Zoom" parity), all optional +
   * additive. When present the shape is a labelled navigation tile: `zoomKind`
   * selects its intent (slide | section | summary) and `zoomTargetId` names the
   * target slide (slide zoom) or section (section / summary tile). The tile's
   * `href` is kept in sync (`slide://<resolvedSlideId>`) so present-mode
   * navigation reuses the internal slide-link path. A shape with neither field is
   * a plain shape and serializes byte-for-byte as before. See `lib/presentation-zoom`.
   */
  zoomKind?: "slide" | "section" | "summary";
  zoomTargetId?: string;
  /**
   * Optional CUSTOM polygon outline (PowerPoint "Merge Shapes → Intersect"): the
   * overlap of two merged shapes as an "x,y x,y …" string in the shape's own
   * 0–100 normalized space. When present + valid it overrides the `shape` kind's
   * preset outline (resolved by `resolveShapeStyle`/`normalizeCustomPolygonPoints`
   * in lib/presentation-shapes); a malformed value falls back to the kind so a
   * corrupt field can never erase the shape. Additive + migration-safe; absent on
   * an ordinary shape, which serializes byte-for-byte as before.
   */
  points?: string;
  /** Bounded durable DrawingML custom geometry; never stores source-tool provenance. */
  customPath?: PresentationCustomPath;
  [key: string]: unknown;
};
/**
 * A media / embed block (PowerPoint parity). `kind` selects the renderer:
 * `iframe` (a sandboxed embeddable player — YouTube/Vimeo/generic https),
 * `video` (native `<video controls>`), or `audio` (native `<audio controls>`).
 * `url` is validated through `lib/presentation-embed` (https-only; iframes are
 * always strict-sandboxed) at the schema and the render edge. `title` is an
 * optional accessible label / caption.
 */
export type PresentationEmbedBlock = PresentationBlockFx & {
  id: string;
  type: "embed";
  kind?: "iframe" | "video" | "audio";
  url: string;
  title?: string;
  /** Video Format > Video Effects (a video only; `lib/office-picture-effects`). */
  pictureEffects?: OfficePictureEffects;
  /** Video Format > Video Border (a video only; `lib/presentation-video-format`). */
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  /** Video Format > Corrections / Color / Video Styles / Poster Frame (a video only; PPT-A155). */
  videoCorrections?: { brightness: number; contrast: number };
  videoRecolor?: string;
  videoStyle?: string;
  posterSrc?: string;
  playback?: PersistedPresentationMediaPlaybackSettings;
  [key: string]: unknown;
};
export type PresentationBlock =
  | PresentationTextBlock
  | PresentationTextBoxBlock
  | PresentationImageBlock
  | PresentationTableBlock
  | PresentationChartBlock
  | PresentationShapeBlock
  | PresentationEmbedBlock;

export type SpreadsheetChartData = {
  headers?: string[];
  rows?: string[][];
};
export type SpreadsheetCellStylePatch = {
  /** Stored CSS pixels. Office point sizes are converted without rounding. */
  fontSize?: number | null;
  fontFamily?: string | null;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  strikethrough?: boolean | null;
  textAlign?: "left" | "center" | "right" | null;
  border?: boolean | null;
  color?: string | null;
  backgroundColor?: string | null;
  numberFormat?: string | null;
   
  verticalAlign?: "top" | "middle" | "bottom" | null;
  wrapText?: boolean | null;
  borderTop?: boolean | null;
  borderRight?: boolean | null;
  borderBottom?: boolean | null;
  borderLeft?: boolean | null;
};
export type SpreadsheetCellCommentPatch = {
  text: string;
  author?: string;
};
export type SpreadsheetCellPatch = {
  style?: SpreadsheetCellStylePatch;
  hyperlink?: string | null;
  comment?: SpreadsheetCellCommentPatch | null;
};
export type SpreadsheetObject = {
  id: string;
  type: "image" | "chart" | "shape";
  src?: string;
  alt?: string;
  caption?: string;
  title?: string;
  chartType?: string;
  ranges?: string[];
  data?: SpreadsheetChartData;
  anchor?: Record<string, unknown>;
  /** Position in the sheet-wide paint order shared with native charts
   * (lib/spreadsheet/drawing-stack); absent = array order, under the charts. */
  stackOrder?: number;
  [key: string]: unknown;
};

export type SpreadsheetCommandRange = {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

export type SpreadsheetTableCommandModel = {
  id: string;
  name: string;
  range: SpreadsheetCommandRange;
  headerRow: boolean;
  styleId?: string;
  bandedRows?: boolean;
  bandedColumns?: boolean;
  firstColumn?: boolean;
  lastColumn?: boolean;
  totalsRow?: boolean;
  [key: string]: unknown;
};

export type SpreadsheetRuleCommandModel = Record<string, unknown> & {
  id: string;
  range: SpreadsheetCommandRange;
};

export type DocumentTableStructureAction =
  | "add_row_after"
  | "add_row_before"
  | "add_column_after"
  | "add_column_before"
  | "delete_row"
  | "delete_column"
  | "toggle_header_row"
  | "delete_table";

export type DocumentBlockMovePosition =
  | "before"
  | "after"
  | "start"
  | "end"
  | "up"
  | "down";

export type NativeDocumentOperation =
  | {
      op: "insert_node";
      position?: "selection" | "end";
      node: JSONContent;
    }
  | {
      op: "insert_block_after";
      block_id?: string;
      /** One new structure, or `nodes` for several in document order. */
      node?: JSONContent;
      nodes?: JSONContent[];
    }
  | {
      op: "insert_block_before";
      block_id: string;
      node?: JSONContent;
      nodes?: JSONContent[];
    }
  | {
      op: "replace_selection";
      text: string;
      content?: JSONContent | JSONContent[];
    }
  | {
      op: "insert_text";
      position: "selection" | "after_selection" | "start" | "end";
      text: string;
      content?: JSONContent | JSONContent[];
    }
  | {
      op: "insert_document_image";
      src: string;
      alt?: string;
      title?: string;
      position?: "selection" | "after_selection" | "end";
    }
  | {
      op: "replace_document_text";
      query: string;
      replacement: string;
      case_sensitive?: boolean;
      max_replacements?: number;
    }
  | {
      op: "delete_document_block";
      block_id: string;
    }
  | {
      op: "move_document_block";
      block_id: string;
      position: DocumentBlockMovePosition;
      target_block_id?: string;
    }
  | {
      op: "resize_document_image";
      block_id: string;
      scale?: number;
      width?: number;
      height?: number;
      widthEmu?: number;
      heightEmu?: number;
    }
  | {
      op: "format_selection";
      marks?: Partial<
        Record<"bold" | "italic" | "underline" | "strike" | "code", boolean>
      >;
      text_align?: "left" | "center" | "right" | "justify";
      indent?: number;
      block_type?:
        | "paragraph"
        | "heading1"
        | "heading2"
        | "heading3"
        | "blockquote"
        | "code_block";
      list_type?: "bullet" | "ordered" | "task" | null;
      font_size?: string | null;
      text_color?: string | null;
      highlight_color?: string | null;
      link_href?: string | null;
    }
  | {
      op: "update_document_block";
      block_id: string;
      text?: string;
      content?: JSONContent | JSONContent[];
      node?: JSONContent;
      nodes?: JSONContent[];
      attrs?: Record<string, unknown>;
    }
  | {
      op: "update_document_node_attrs";
      block_id: string;
      /** image (default), or a table structure: table, tableCell, tableHeader. */
      /** Any node type the Docs editor declares; the API's vocabulary names them. */
      node_type?: string;
      /** Child indexes from the block down, e.g. [1, 2] = row 2, cell 3. */
      path?: number[];
      patch: Record<string, unknown>;
    }
  | {
      op: "update_document_table_cells";
      block_id: string;
      start_col?: number;
      start_row?: number;
      row_count?: number;
      col_count?: number;
      /** Cell text; may be absent or empty beside a patch or a node. */
      values?: string[][];
      /** Cell formatting for the rectangle: backgroundColor, textAlign, ... */
      patch?: Record<string, unknown>;
      node?: JSONContent;
    }
  | {
      op: "edit_document_table";
      block_id: string;
      action: DocumentTableStructureAction;
      row_index?: number;
      col_index?: number;
      


      values?: string[][];
    }
  | {
      op: "fill_cells";
      sheet_id?: string;
      start_row: number;
      start_col: number;
      values: string[][];
    }
  | {
      op: "insert_sheet_chart";
      sheet_id?: string;
      chart_type: string;
      start_row: number;
      start_col: number;
      row_count: number;
      col_count: number;
      title?: string;
      series_in_columns?: boolean;
    }
  | {
      op: "update_sheet_cells";
      sheet_id?: string;
      start_row: number;
      start_col: number;
      row_count?: number;
      col_count?: number;
      patch: SpreadsheetCellPatch;
    }
  | {
      /** Column widths in CSS px (24..1024); null restores the default width. */
      op: "set_sheet_column_width";
      sheet_id?: string;
      start_col: number;
      col_count?: number;
      width: number | null;
    }
  | {
      /** Row heights in CSS px (18..512); null restores the default height. */
      op: "set_sheet_row_height";
      sheet_id?: string;
      start_row: number;
      row_count?: number;
      height: number | null;
    }
  | {
      /** One merged cell over the range; only one cell's content survives. */
      op: "merge_sheet_cells";
      sheet_id?: string;
      range: { r1: number; c1: number; r2: number; c2: number };
    }
  | {
      op: "unmerge_sheet_cells";
      sheet_id?: string;
      range: { r1: number; c1: number; r2: number; c2: number };
    }
  | {
      /** What the editor's buttons changed on one sheet (Copilot
       * run_editor_commands, pressed on the server): the differing sheet
       * fields, the differing cells (null removes), a new sheet whole, or a
       * removed one. */
      op: "apply_sheet_changes";
      sheet_id: string;
      set?: Record<string, unknown>;
      unset?: string[];
      cells?: Record<string, unknown>;
      new_sheet?: Record<string, unknown>;
      index?: number;
      delete?: boolean;
    }
  | {
      /** One slide as the editor's buttons left it (Copilot
       * run_editor_commands, pressed on the server), a new slide at `index`,
       * or a removed one. */
      op: "apply_slide_changes";
      slide_id: string;
      slide?: Record<string, unknown>;
      index?: number;
      delete?: boolean;
    }
  | {
      /** Deck fields the editor's buttons changed, and the slide order. */
      op: "apply_deck_changes";
      slide_id: string;
      set?: Record<string, unknown>;
      unset?: string[];
      order?: string[];
    }
  | {
      /** Workbook fields the editor's buttons changed, and the sheet order. */
      op: "apply_workbook_changes";
      sheet_id: string;
      set?: Record<string, unknown>;
      unset?: string[];
      order?: string[];
    }
  | {
      /** Frozen panes; 0 clears. Refused while the sheet is split. */
      op: "set_sheet_freeze";
      sheet_id?: string;
      rows?: number;
      cols?: number;
    }
  | {
      op: "insert_sheet_object";
      sheet_id?: string;
      object: SpreadsheetObject;
    }
  | {
      op: "update_sheet_object";
      sheet_id?: string;
      object_id: string;
      patch?: Partial<SpreadsheetObject>;
      object?: SpreadsheetObject;
    }
  | {
      op: "delete_sheet_object";
      sheet_id?: string;
      object_id: string;
    }
  | {
      op: "update_sheet_shape";
      sheet_id?: string;
      shape_ref: string;
      patch: Partial<SpreadsheetObject>;
    }
  | {
      op: "insert_sheet_lines";
      sheet_id: string;
      axis: "row" | "col";
      at: number;
      count: number;
    }
  | {
      op: "mutate_sheet_table";
      sheet_id?: string;
      action: "create" | "update" | "delete";
      table_ref?: string;
      table?: SpreadsheetTableCommandModel;
      patch?: Partial<SpreadsheetTableCommandModel>;
    }
  | {
      op: "mutate_pivot_table";
      sheet_id?: string;
      pivot_ref: string;
      patch: Record<string, unknown>;
    }
  | {
      op: "apply_sheet_rule";
      sheet_id?: string;
      rule_kind: "data_validation" | "conditional_format";
      action: "create" | "update" | "delete";
      rule_ref?: string;
      rule?: SpreadsheetRuleCommandModel;
      patch?: Record<string, unknown>;
    }
  | {
      op: "sort_filter_range";
      sheet_id?: string;
      range: SpreadsheetCommandRange;
      has_header?: boolean;
      sort?: Array<{ column: number; descending?: boolean }>;
      filters?: Array<{ column: number; allowed: string[] }>;
      clear_filters?: boolean;
    }
  | {
      op: "append_slide_block";
      slide_id?: string;
      text?: string;
      block?: Record<string, unknown> & {
        type: PresentationBlock["type"];
        id?: string;
      };
    }
  | {
      op: "update_slide_block";
      slide_id?: string;
      block_id: string;
      patch?:
        | Partial<PresentationTextBlock>
        | Partial<PresentationImageBlock>
        | Partial<PresentationTableBlock>
        | Partial<PresentationChartBlock>;
      block?: PresentationBlock;
    }
  | {
      op: "delete_slide_block";
      slide_id?: string;
      block_id: string;
    }
  | {
      op: "update_slide_smartart_text";
      slide_id?: string;
      block_id: string;
      updates: { point_id: string; text: string }[];
    }
  | {
      op: "update_slide_table_cells";
      slide_id?: string;
      block_id: string;
      start_row?: number;
      start_col?: number;
      values: (string | null)[][];
    }
  | {
      /** Text becomes a table of the given values; a chart becomes a table of its own data. */
      op: "apply_slide_table";
      slide_id?: string;
      target_block_id: string;
      values?: string[][];
      header_row?: boolean;
    }
  | {
      /**
       * Every block of one type on this slide (optionally narrowed by match)
       * gets the same patch; the circle is only the anchor.
       */
      op: "update_slide_blocks_where";
      slide_id?: string;
      /** "slide" (this slide, the default) or "deck" (every slide). */
      scope?: "slide" | "deck";
      block_type: "text" | "shape" | "image" | "table" | "chart";
      match?: { text_contains?: string; name?: string };
      patch: Record<string, unknown>;
    }
  | {
      /**
       * Every node of one type on the page (optionally narrowed by match) gets
       * the same attribute patch and/or text marks; the circle is only the
       * anchor. Positions stay put, so the page's own structure is unchanged.
       */
      op: "update_document_nodes_where";
      node_type: string;
      match?: {
        text_contains?: string;
        level?: number;
        attrs?: Record<string, unknown>;
      };
      patch?: Record<string, unknown>;
      marks?: Record<string, unknown>;
      limit?: number;
    }
  | {
      /** A block keeps its text and becomes another block type. */
      op: "convert_document_block";
      block_id: string;
      to: DocumentConvertibleBlockType;
      level?: number;
    }
  | {
      /**
       * A bounded declarative program: ordered steps, each a closed selector,
       * predicates and transforms, run by the editor over the page projection
       * (lib/copilot-script.ts). The API validated every name and value.
       */
      op: "run_script";
      steps: ScriptStep[];
      slide_id?: string;
      sheet_id?: string;
    }
  | {
      /** A circled slide table becomes a chart of its own text, in its place. */
      op: "apply_slide_chart";
      slide_id?: string;
      target_block_id: string;
      chart_type: string;
      title?: string;
      /** Default true: the header row names the series, the first column the categories. */
      series_in_columns?: boolean;
      /** Table row indexes (0 = header) left out of the chart's data, e.g. a totals row. */
      exclude_rows?: number[];
    }
  | {
      op: "delete_slide";
      slide_id: string;
    }
  | {
      op: "apply_slide_smartart";
      slide_id?: string;
      target_block_id?: string;
      kind:
        | "list"
        | "process"
        | "hierarchy"
        | "cycle"
        | "pyramid"
        | "relationship-venn";
      labels: string[];
      style?: Record<string, unknown>;
    }
  | {
      op: "apply_slide_effect";
      slide_id: string;
      transition?: "none" | "fade" | "push" | "wipe" | "cut" | "morph";
      animations?: Record<string, unknown>[];
    }
  | {
      op: "replace_current_slide";
      slide_id: string;
      patch: Record<string, unknown>;
    }
  | {
      op: "duplicate_slide";
      slide_id: string;
      new_slide_id: string;
      patch: Record<string, unknown>;
    }
  | {
      /**
       * Typed AI/user proposal for PowerPoint Reuse Slides.  The editor resolves
       * the source page under live ACL/version custody and executes it through
       * the same async planner as the dialog; this pure command reducer never
       * copies a foreign package by itself.
       */
      op: "reuse_slides";
      source_page_id: string;
      source_slide_ids: string[];
      theme_policy: "destination" | "source";
      after_slide_id: string;
      source_content_version: number;
    }
  | {
      op: "add_pdf_annotation";
      text: string;
      quote?: string;
      page?: number;
      /** Where the note sits, PDF user space [x1, y1, x2, y2] (a circled
       * ask puts it at the circle). Omitted: the page's default corner. */
      rect?: [number, number, number, number];
    }
  | {
      op: "add_pdf_markup";
      id: string;
      page: number;
      subtype: "Highlight" | "Underline" | "StrikeOut" | "Squiggly";
      text?: string;
      quote: string;
      color: string;
      rect: [number, number, number, number];
      quad_points: number[];
    }
  | {
      op: "update_pdf_form_field";
      field_id: string;
      value: string | boolean | string[];
    }
  | {
      op: "rotate_pdf_page";
      page?: number;
      degrees: 0 | 90 | 180 | 270;
    }
  | {
      op: "delete_pdf_page";
      page?: number;
    }
  | {
      op: "insert_pdf_page";
      after_page?: number;
      width?: number;
      height?: number;
    }
  | {
      op: "move_pdf_page";
      page?: number;
      after_page: number;
      



      page_count?: number;
    }
  | {
      /** The pages on screen in a new order, inserted pages by id: the
       *  originals' moves are rewritten canonically and each inserted page
       *  is anchored after the original before it (user audit PDF 0008). */
      op: "reorder_pdf_pages";
      page_count: number;
      sequence: Array<{ page: number } | { inserted_id: string }>;
    }
  | {
      /** Remove a page inserted into the document (a blank page). */
      op: "delete_pdf_inserted_page";
      id: string;
    }
  | {
      /** Turn an inserted blank page: a quarter turn swaps its size. */
      op: "rotate_pdf_inserted_page";
      id: string;
      degrees: 90 | 180 | 270;
    }
  | {
      op: "set_pdf_text_box";
      id: string;
      page?: number;
      text: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fontSize?: number;
      kind?: "text" | "formula";
      latex?: string;
      color?: string;
      backgroundColor?: string;
      align?: "left" | "center" | "right";
      fontFamily?: string;
      sourceFontName?: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      /** The Office family a text box someone made is set in (its font
       * menu's "more fonts"); null sets it back to a face of its own five. */
      officeFamily?: string | null;
      /** The size in points, as a Copilot's text-format result names it
       * (lib/pdf/copilot-text-font turns it into `fontSize` or a native
       * line format). */
      fontSizePt?: number;
      /** `fontSize` is a size this command sets, not the box's own read
       * back: the Copilot placement keeps it. */
      fontSizeSet?: boolean;
      /** Only the look changes: the box keeps the words it has (the
       * context a model answers from carries a long box's first words). */
      keepText?: boolean;
    }
  | {
      op: "set_pdf_image_overlay";
      id: string;
      page?: number;
      dataItemId?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }
  | {
      op: "add_pdf_ink_stroke";
      id: string;
      page?: number;
      color?: string;
      width?: number;
      points: number[];
    }
  | {
      /** A circled page shape (the PDF's own vector graphic), edited through
       * the catalog's pdf.object.drawn_shape on confirm: one change -- a
       * colour, a new box (page fractions) or a delete. `page` and `bounds`
       * are the circled shape's, bound by the server. */
      op: "edit_pdf_shape";
      shape: string;
      page?: number;
      kind?: string;
      bounds?: { x: number; y: number; width: number; height: number };
      fill?: string;
      stroke?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      delete?: boolean;
    }
  | {
      /** Insert Text / Replace Text (the Comment tab's proofing marks) on
       * the selected text: `text` is what to put in; quote, rect and
       * quad_points are the selection's, bound by the server. */
      op: "add_pdf_proofing";
      id: string;
      page: number;
      kind: "insert" | "replace";
      text: string;
      insert_at?: "after" | "before";
      color?: string;
      quote: string;
      rect: [number, number, number, number];
      quad_points: number[];
    }
  | {
      /** A listed link's new destination, written through the catalog's
       * pdf.annotation.edit_link (a link added here) or edit_original_link
       * (the file's own) on confirm; bound by the server to the link. */
      op: "edit_pdf_link";
      link?: string;
      page: number;
      kind: "added" | "original";
      id?: string;
      annotation?: string;
      bounds: { x: number; y: number; width: number; height: number };
      url?: string;
      go_to_page?: number;
    }
  | {
      /** A placed picture's new box (page fractions), written through the
       * catalog's pdf.object.resize / move on confirm. */
      op: "resize_pdf_picture";
      picture?: string;
      page: number;
      id: string;
      bounds: { x: number; y: number; width: number; height: number };
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      lock_aspect_ratio?: boolean;
    }
  | {
      op: "create_page_from_excerpt";
      title?: string;
      text: string;
    }
  | {
      op: "set_code_content";
      content: string;
      language?: string;
    }
  | {
      op: "append_code_content";
      content: string;
      language?: string;
    }
  | {
      op: "apply_code_edits";
      buffer_id: string;
      language: string;
      source_hash: string;
      authority_generation: number;
      document_generation: string;
      edits: Array<{
        start: number;
        end: number;
        old_text: string;
        new_text: string;
      }>;
    };

export interface NativeDocumentCommand {
  type: typeof MRNOTE_DOCUMENT_COMMAND_TYPE;
  action_type: string;
  action_log_id?: string;
  model_id?: string | null;
  source?: "ai" | "user" | "system";
  command_context?: Record<string, unknown> | null;
  operations: NativeDocumentOperation[];
  /** The Copilot changed words outside the words the person selected (it
   * was asked once to keep them; its second proposal stands, and the
   * person is told). */
  selected_text_exceeded?: boolean;
  /** Lines of the circled text the change leaves out although nobody asked
   * to delete them (a text box turned into a table without them); the
   * person is shown them before the change is applied in place. */
  dropped_text?: string[];
  /** A PDF Copilot 替换 over lines of the page's own printed text: each
   * line's words and its new words, written natively by the server (编辑内容's
   * own text write) before the text-box operations are needed at all. */
  pdf_native_text_edits?: {
    page: number;
    text: string;
    new_text?: string;
    format?: { color?: string; bold?: boolean; italic?: boolean; font?: string; font_size?: number };
    delete?: true;
  }[];
  /** A PDF Copilot 插入下方: the new box as the server's pdf.text.add_box
   * writes it into the file (percent of the page; size in points). */
  pdf_native_text_add?: {
    page: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    font_size?: number;
    color?: string;
    bold?: boolean;
    font?: "helvetica" | "times" | "courier" | "cjkSans" | "cjkSerif";
  };
}

export type NativePageCommandRejectionReason =
  | "invalid_image_source"
  | "invalid_command"
  | "payload_too_large";

export type NativeDocumentCommandRejectionReason =
  | NativePageCommandRejectionReason
  | "invalid_command"
  | "legacy_ai_output"
  | "quality_gate"
  | "operation_failed";

export interface NativePageCommandResult<Content> {
  content: Content;
  appliedOperations: number;
  rejectedOperations?: number;
  rejectionReason?: NativePageCommandRejectionReason;
}

export function validateNativeDocumentCommandForApply(
  command: NativeDocumentCommand,
): { ok: true } | { ok: false; reason: NativeDocumentCommandRejectionReason } {
  if (!isNativeDocumentCommand(command) || command.operations.length === 0) {
    return { ok: false, reason: "invalid_command" };
  }
  if (command.operations.length > MAX_DOCUMENT_COMMAND_OPERATIONS) {
    return { ok: false, reason: "payload_too_large" };
  }
  if (command.operations.some(operationContainsAIOutputContent)) {
    return { ok: false, reason: "legacy_ai_output" };
  }
  if (command.operations.some(operationContainsInvalidInlineImageSource)) {
    return { ok: false, reason: "invalid_image_source" };
  }
  
  // apply. The server is the single quality authority (it repairs markdown
  // leaks and flags-but-passes junk); a client-side quality rejection only
  // ever reproduced the mirror-drift failure mode — a proposal card whose
  // apply button fails with an inscrutable "quality" error. Security gates
  // above (legacy AI output, image sources, payload size) still hard-fail.
  return { ok: true };
}

export function stringMatrixWithinBudget(
  values: unknown,
  limits: {
    maxRows: number;
    maxCols: number;
    maxCells?: number;
    maxCellChars: number;
  },
): values is string[][] {
  if (!Array.isArray(values) || values.length === 0) return false;
  if (values.length > limits.maxRows) return false;
  let cellCount = 0;
  for (const row of values) {
    if (!Array.isArray(row) || row.length > limits.maxCols) return false;
    cellCount += row.length;
    if (limits.maxCells !== undefined && cellCount > limits.maxCells) {
      return false;
    }
    for (const cell of row) {
      if (typeof cell !== "string" || cell.length > limits.maxCellChars) {
        return false;
      }
    }
  }
  return true;
}

export function chartDataWithinBudget(data: unknown): boolean {
  if (data === undefined || data === null) return true;
  if (typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as { headers?: unknown; rows?: unknown };
  if (record.headers !== undefined) {
    if (
      !Array.isArray(record.headers) ||
      record.headers.length > MAX_CHART_DATA_COLS
    ) {
      return false;
    }
    if (
      record.headers.some(
        (value) =>
          typeof value !== "string" || value.length > MAX_COMMAND_CELL_CHARS,
      )
    ) {
      return false;
    }
  }
  if (record.rows !== undefined) {
    if (!Array.isArray(record.rows)) return false;
    if (record.rows.length === 0) return true;
    return stringMatrixWithinBudget(record.rows, {
      maxRows: MAX_CHART_DATA_ROWS,
      maxCols: MAX_CHART_DATA_COLS,
      maxCellChars: MAX_COMMAND_CELL_CHARS,
    });
  }
  return true;
}

export function presentationTableRowsWithinBudget(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  if (rows.length > MAX_PRESENTATION_TABLE_COMMAND_ROWS) return false;
  let cellCount = 0;
  for (const row of rows) {
    if (
      !Array.isArray(row) ||
      row.length > MAX_PRESENTATION_TABLE_COMMAND_COLS
    ) {
      return false;
    }
    cellCount += row.length;
    if (
      cellCount >
      MAX_PRESENTATION_TABLE_COMMAND_ROWS * MAX_PRESENTATION_TABLE_COMMAND_COLS
    ) {
      return false;
    }
    for (const cell of row) {
      if (!cell || typeof cell !== "object" || Array.isArray(cell))
        return false;
      const text = (cell as { text?: unknown }).text;
      if (typeof text !== "string" || text.length > MAX_COMMAND_CELL_CHARS) {
        return false;
      }
    }
  }
  return true;
}

export function numberWithinRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integerOnly = false,
): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (integerOnly && !Number.isInteger(value)) return false;
  return value >= minimum && value <= maximum;
}

export function spreadsheetAnchorPointWithinBudget(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as {
    row?: unknown;
    column?: unknown;
    col?: unknown;
    rowOffset?: unknown;
    columnOffset?: unknown;
    colOffset?: unknown;
  };
  if (!numberWithinRange(point.row, 0, MAX_SPREADSHEET_ROWS, true))
    return false;
  if (
    point.column !== undefined &&
    !numberWithinRange(point.column, 0, MAX_SPREADSHEET_COLS, true)
  ) {
    return false;
  }
  if (
    point.col !== undefined &&
    !numberWithinRange(point.col, 0, MAX_SPREADSHEET_COLS, true)
  ) {
    return false;
  }
  if (point.column === undefined && point.col === undefined) return false;
  for (const key of ["rowOffset", "columnOffset", "colOffset"] as const) {
    const offset = point[key];
    if (offset === undefined || offset === null) continue;
    if (!numberWithinRange(offset, 0, MAX_SPREADSHEET_OBJECT_GEOMETRY_EMU)) {
      return false;
    }
  }
  return true;
}

export function spreadsheetObjectAnchorWithinBudget(anchor: unknown): boolean {
  if (anchor === undefined || anchor === null) return true;
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor))
    return false;
  const record = anchor as {
    kind?: unknown;
    from?: unknown;
    to?: unknown;
    xEmu?: unknown;
    yEmu?: unknown;
    widthEmu?: unknown;
    heightEmu?: unknown;
  };
  if (
    record.kind !== undefined &&
    record.kind !== "oneCell" &&
    record.kind !== "twoCell" &&
    record.kind !== "absolute"
  ) {
    return false;
  }
  if (
    record.from !== undefined &&
    !spreadsheetAnchorPointWithinBudget(record.from)
  ) {
    return false;
  }
  if (
    record.to !== undefined &&
    !spreadsheetAnchorPointWithinBudget(record.to)
  ) {
    return false;
  }
  for (const key of ["xEmu", "yEmu"] as const) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (!numberWithinRange(value, 0, MAX_SPREADSHEET_OBJECT_GEOMETRY_EMU)) {
      return false;
    }
  }
  for (const key of ["widthEmu", "heightEmu"] as const) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (!numberWithinRange(value, 1, MAX_SPREADSHEET_OBJECT_GEOMETRY_EMU)) {
      return false;
    }
  }
  if (
    !record.from &&
    !record.to &&
    record.xEmu === undefined &&
    record.yEmu === undefined
  ) {
    return record.widthEmu !== undefined || record.heightEmu !== undefined;
  }
  return true;
}

export function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mergeSpreadsheetObjectUpdate(
  object: SpreadsheetObject,
  update: Partial<SpreadsheetObject> | SpreadsheetObject,
): SpreadsheetObject {
  // A chart on the one chart model takes the patch on its model too: the
  // save writes a chart from its model alone.
  const merged =
    object.type === "chart" && object.chartV2
      ? withSpreadsheetChartFlatPatch(
          object as unknown as SpreadsheetChartLike,
          update as Record<string, unknown>,
        )
      : { ...object, ...update };
  const next = {
    ...(merged as SpreadsheetObject),
    id: update.id || object.id,
    type: update.type || object.type,
  };
  const previousAnchor = recordObject(object.anchor);
  const nextAnchor = recordObject(update.anchor);
  if (previousAnchor && nextAnchor) {
    next.anchor = {
      ...previousAnchor,
      ...nextAnchor,
    };
  }
  return next;
}

export function objectPatchWithinCommandBudget(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const record = value as {
    anchor?: unknown;
    data?: unknown;
    rows?: unknown;
    text?: unknown;
    title?: unknown;
    caption?: unknown;
    left?: unknown;
    top?: unknown;
    width?: unknown;
    height?: unknown;
    rotation?: unknown;
    sourceOrder?: unknown;
    zIndex?: unknown;
  };
  if (
    record.rows !== undefined &&
    !presentationTableRowsWithinBudget(record.rows)
  ) {
    return false;
  }
  if (!spreadsheetObjectAnchorWithinBudget(record.anchor)) return false;
  if (!chartDataWithinBudget(record.data)) return false;
  for (const textValue of [record.text, record.title, record.caption]) {
    if (
      typeof textValue === "string" &&
      textValue.length > MAX_TEXT_PATCH_CHARS
    ) {
      return false;
    }
  }
  for (const key of ["left", "top", "width", "height"] as const) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    const minimum =
      key === "width" || key === "height" ? 1 : -MAX_PRESENTATION_GEOMETRY_EMU;
    if (value < minimum || value > MAX_PRESENTATION_GEOMETRY_EMU) return false;
  }
  if (
    record.rotation !== undefined &&
    record.rotation !== null &&
    (typeof record.rotation !== "number" ||
      !Number.isFinite(record.rotation) ||
      record.rotation < -360 ||
      record.rotation > 360)
  ) {
    return false;
  }
  for (const key of ["sourceOrder", "zIndex"] as const) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_PRESENTATION_GEOMETRY_EMU
    ) {
      return false;
    }
  }
  return true;
}

export function spreadsheetFillWithinCommandBudget(
  operation: Extract<NativeDocumentOperation, { op: "fill_cells" }>,
): boolean {
  if (
    !Number.isInteger(operation.start_row) ||
    !Number.isInteger(operation.start_col) ||
    operation.start_row < 0 ||
    operation.start_col < 0 ||
    operation.start_row >= MAX_SPREADSHEET_ROWS ||
    operation.start_col >= MAX_SPREADSHEET_COLS
  ) {
    return false;
  }
  if (
    !stringMatrixWithinBudget(operation.values, {
      maxRows: MAX_SPREADSHEET_COMMAND_ROWS,
      maxCols: MAX_SPREADSHEET_COMMAND_COLS,
      maxCells: MAX_SPREADSHEET_COMMAND_CELLS,
      maxCellChars: MAX_COMMAND_CELL_CHARS,
    })
  ) {
    return false;
  }
  const rowCount = operation.values.length;
  const colCount = Math.max(...operation.values.map((row) => row.length), 0);
  return (
    operation.start_row + rowCount <= MAX_SPREADSHEET_ROWS &&
    operation.start_col + colCount <= MAX_SPREADSHEET_COLS
  );
}

export function safeSpreadsheetHyperlink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SPREADSHEET_HYPERLINK_CHARS) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

export function spreadsheetCellAttrsWithinCommandBudget(
  operation: Extract<NativeDocumentOperation, { op: "update_sheet_cells" }>,
): boolean {
  if (
    !numberWithinRange(operation.start_row, 0, MAX_SPREADSHEET_ROWS, true) ||
    !numberWithinRange(operation.start_col, 0, MAX_SPREADSHEET_COLS, true)
  ) {
    return false;
  }
  const rowCount = operation.row_count ?? 1;
  const colCount = operation.col_count ?? 1;
  if (
    !numberWithinRange(rowCount, 1, MAX_SPREADSHEET_CELL_ATTR_ROWS, true) ||
    !numberWithinRange(colCount, 1, MAX_SPREADSHEET_CELL_ATTR_COLS, true) ||
    rowCount * colCount > MAX_SPREADSHEET_CELL_ATTR_CELLS ||
    operation.start_row + rowCount > MAX_SPREADSHEET_ROWS ||
    operation.start_col + colCount > MAX_SPREADSHEET_COLS
  ) {
    return false;
  }
  const patch = operation.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const hasStyle = patch.style !== undefined;
  const hasHyperlink = patch.hyperlink !== undefined;
  const hasComment = patch.comment !== undefined;
  if (!hasStyle && !hasHyperlink && !hasComment) return false;
  if (hasStyle) {
    if (
      !patch.style ||
      typeof patch.style !== "object" ||
      Array.isArray(patch.style)
    ) {
      return false;
    }
    for (const [key, value] of Object.entries(patch.style)) {
      if (key === "fontSize") {
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > ptToPx(409))) return false;
        continue;
      }
      if (key === "fontFamily") {
        if (value !== null && (typeof value !== "string" || value.length > 200 || value !== value.trim() || /[\u0000-\u001f\u007f<>;{}\\"'():/,]/u.test(value))) return false;
        continue;
      }
      if (key === "textAlign") {
        if (value !== null && !["left", "center", "right"].includes(String(value))) return false;
        continue;
      }
      if (
        [
          "bold",
          "italic",
          "underline",
          "strikethrough",
          "border",
          // The sheet schema's own keys, which the route also accepts: the
          // model writes them for a row it styles like its neighbours, and a
          // client that refused them left the whole command unpreviewable
          
          "borderTop",
          "borderRight",
          "borderBottom",
          "borderLeft",
          "wrapText",
        ].includes(key)
      ) {
        if (typeof value !== "boolean" && value !== null) return false;
        continue;
      }
      if (key === "verticalAlign") {
        if (value !== null && !["top", "middle", "bottom"].includes(String(value))) return false;
        continue;
      }
      if (key === "color" || key === "backgroundColor") {
        if (
          value !== null &&
          (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))
        ) {
          return false;
        }
        continue;
      }
      if (key === "numberFormat") {
        if (
          value !== null &&
          (typeof value !== "string" || value.length > 200)
        ) {
          return false;
        }
        continue;
      }
      return false;
    }
  }
  if (hasHyperlink) {
    if (patch.hyperlink !== null && typeof patch.hyperlink !== "string")
      return false;
    if (
      typeof patch.hyperlink === "string" &&
      !safeSpreadsheetHyperlink(patch.hyperlink)
    ) {
      return false;
    }
  }
  if (hasComment && patch.comment !== null) {
    if (
      !patch.comment ||
      typeof patch.comment !== "object" ||
      Array.isArray(patch.comment)
    ) {
      return false;
    }
    if (
      typeof patch.comment.text !== "string" ||
      patch.comment.text.length > 2_000
    ) {
      return false;
    }
    if (
      patch.comment.author !== undefined &&
      (typeof patch.comment.author !== "string" ||
        patch.comment.author.length > 200)
    ) {
      return false;
    }
  }
  return true;
}

export function textLooksLikeImageSource(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:image/")) {
    return isValidInlineImageSource(trimmed);
  }
  return lower.startsWith("https://") || lower.startsWith("http://");
}

export function safeDocumentImageSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return textLooksLikeImageSource(trimmed) ? trimmed : null;
}

export function isAIOutputNodeType(nodeType: unknown): boolean {
  return nodeType === "ai_output" || nodeType === "aiOutput";
}

export function documentContentContainsAIOutputNode(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => documentContentContainsAIOutputNode(item));
  }
  if (!value || typeof value !== "object") return false;
  const node = value as { type?: unknown; content?: unknown };
  if (isAIOutputNodeType(node.type)) return true;
  return documentContentContainsAIOutputNode(node.content);
}

export function documentContentContainsInvalidInlineImageSource(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) =>
      documentContentContainsInvalidInlineImageSource(item),
    );
  }
  if (!value || typeof value !== "object") return false;
  const node = value as {
    attrs?: unknown;
    content?: unknown;
    src?: unknown;
  };
  if (recordHasInvalidInlineImageSrc(node)) return true;
  if (recordHasInvalidInlineImageSrc(node.attrs)) return true;
  return documentContentContainsInvalidInlineImageSource(node.content);
}

export function operationContainsAIOutputContent(
  operation: NativeDocumentOperation,
): boolean {
  if (operation.op === "insert_node") {
    return documentContentContainsAIOutputNode(operation.node);
  }
  if (
    operation.op === "insert_block_after" ||
    operation.op === "insert_block_before"
  ) {
    return (
      documentContentContainsAIOutputNode(operation.node) ||
      documentContentContainsAIOutputNode(operation.nodes)
    );
  }
  if (operation.op === "replace_selection" || operation.op === "insert_text") {
    return operation.content
      ? documentContentContainsAIOutputNode(operation.content)
      : false;
  }
  if (operation.op === "update_document_block") {
    return (
      documentContentContainsAIOutputNode(operation.node) ||
      documentContentContainsAIOutputNode(operation.nodes) ||
      documentContentContainsAIOutputNode(operation.content)
    );
  }
  if (operation.op === "update_document_table_cells") {
    return documentContentContainsAIOutputNode(operation.node);
  }
  return false;
}

export function operationContainsInvalidInlineImageSource(
  operation: NativeDocumentOperation,
): boolean {
  if (operation.op === "insert_document_image") {
    return safeDocumentImageSource(operation.src) === null;
  }
  if (operation.op === "insert_node") {
    return documentContentContainsInvalidInlineImageSource(operation.node);
  }
  if (
    operation.op === "insert_block_after" ||
    operation.op === "insert_block_before"
  ) {
    return (
      documentContentContainsInvalidInlineImageSource(operation.node) ||
      documentContentContainsInvalidInlineImageSource(operation.nodes)
    );
  }
  if (operation.op === "replace_selection" || operation.op === "insert_text") {
    return operation.content
      ? documentContentContainsInvalidInlineImageSource(operation.content)
      : false;
  }
  if (operation.op === "update_document_block") {
    return (
      recordHasInvalidInlineImageSrc(operation.attrs) ||
      documentContentContainsInvalidInlineImageSource(operation.node) ||
      documentContentContainsInvalidInlineImageSource(operation.nodes) ||
      documentContentContainsInvalidInlineImageSource(operation.content)
    );
  }
  if (operation.op === "update_document_table_cells") {
    return documentContentContainsInvalidInlineImageSource(operation.node);
  }
  return (
    operation.op === "update_document_node_attrs" &&
    recordHasInvalidInlineImageSrc(operation.patch)
  );
}

export type DocumentConvertibleBlockType =
  | "paragraph"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock";

export type SpreadsheetCell = {
  value: string;
  kind?: "text" | "number";
  formula?: string;
  hyperlink?: string;
  style?: Record<string, unknown>;
  comment?: Record<string, unknown>;
  [key: string]: unknown;
};
export type SpreadsheetSheet = {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: Record<string, SpreadsheetCell>;
  objects?: SpreadsheetObject[];
  dataTables?: SpreadsheetTableCommandModel[];
  validations?: SpreadsheetRuleCommandModel[];
  conditionalFormats?: SpreadsheetRuleCommandModel[];
  pivot?: Record<string, unknown>;
  filters?: Record<string, string[]>;
  sortState?: Record<string, unknown>;
  [key: string]: unknown;
};
export type SpreadsheetContent = {
  type: "mrnote.spreadsheet.v1";
  sheets: SpreadsheetSheet[];
};
export function cellKind(value: string): "text" | "number" {
  return value.trim() !== "" && Number.isFinite(Number(value))
    ? "number"
    : "text";
}

export function validSpreadsheetCommandRange(
  range: SpreadsheetCommandRange | undefined,
): range is SpreadsheetCommandRange {
  return Boolean(
    range &&
    [range.r1, range.c1, range.r2, range.c2].every(
      (value) => Number.isInteger(value) && value >= 0,
    ) &&
    range.r2 >= range.r1 &&
    range.c2 >= range.c1 &&
    range.r2 < 1_048_576 &&
    range.c2 < 16_384 &&
    (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) <= 20_000,
  );
}

export function spreadsheetRangesOverlap(
  left: SpreadsheetCommandRange,
  right: SpreadsheetCommandRange,
): boolean {
  return !(
    left.r2 < right.r1 ||
    right.r2 < left.r1 ||
    left.c2 < right.c1 ||
    right.c2 < left.c1
  );
}

export function spreadsheetColumnName(column: number): string {
  let value = column + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export function spreadsheetRangeA1(range: SpreadsheetCommandRange): string {
  return `${spreadsheetColumnName(range.c1)}${range.r1 + 1}:${spreadsheetColumnName(range.c2)}${range.r2 + 1}`;
}

export function spreadsheetCellSortValue(
  cell: SpreadsheetCell | undefined,
): number | string {
  const raw = String(cell?.formula || cell?.value || "");
  const number = Number(raw);
  return raw.trim() && Number.isFinite(number)
    ? number
    : raw.toLocaleLowerCase();
}

export function compareSpreadsheetSortValues(
  left: number | string,
  right: number | string,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function applySpreadsheetCellPatch(
  cell: SpreadsheetCell | undefined,
  patch: SpreadsheetCellPatch,
): SpreadsheetCell {
  const nextCell: SpreadsheetCell = cell
    ? { ...cell }
    : { value: "", kind: "text" };
  if (patch.style !== undefined) {
    const previousStyle = nextCell.style && typeof nextCell.style === "object" ? nextCell.style : {};
    const nextStyle = {
      ...(nextCell.style && typeof nextCell.style === "object"
        ? nextCell.style
        : {}),
    } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch.style || {})) {
      if (value === null || value === "" || value === false) {
        delete nextStyle[key];
      } else {
        nextStyle[key] = value;
      }
    }
    if (Object.hasOwn(patch.style, "fontSize")) {
      const sourceSize = nativeFontSizeAfterPatch(previousStyle.nativeFontSize, patch.style);
      if (sourceSize === undefined) delete nextStyle.nativeFontSize;
      else nextStyle.nativeFontSize = sourceSize;
    }
    if (Object.hasOwn(patch.style, "fontFamily")) delete nextStyle.themeFontRole;
    if (Object.hasOwn(patch.style, "color") || Object.hasOwn(patch.style, "backgroundColor")) {
      const colors = themeColorsAfterPatch(previousStyle, patch.style);
      if (colors) nextStyle.themeColors = colors; else delete nextStyle.themeColors;
    }
    if (Object.keys(nextStyle).length > 0) {
      nextCell.style = nextStyle;
    } else {
      delete nextCell.style;
    }
  }
  if (patch.hyperlink !== undefined) {
    const href =
      typeof patch.hyperlink === "string"
        ? safeSpreadsheetHyperlink(patch.hyperlink)
        : null;
    if (href) {
      nextCell.hyperlink = href;
    } else {
      delete nextCell.hyperlink;
    }
  }
  if (patch.comment !== undefined) {
    if (patch.comment && patch.comment.text.trim()) {
      nextCell.comment = {
        ...patch.comment,
        text: patch.comment.text.slice(0, 2_000),
        author: patch.comment.author?.slice(0, 200) || "AI",
      };
    } else {
      delete nextCell.comment;
    }
  }
  return nextCell;
}

export function applySpreadsheetPageCommandWithResult(
  content: SpreadsheetContent,
  command: NativeDocumentCommand,
): NativePageCommandResult<SpreadsheetContent> {
  const next: SpreadsheetContent = {
    ...content,
    sheets: content.sheets.map((sheet) => ({
      ...sheet,
      cells: { ...sheet.cells },
      objects: sheet.objects?.map((object) => ({ ...object })),
      dataTables: sheet.dataTables?.map((table) => ({
        ...table,
        range: { ...table.range },
      })),
      validations: sheet.validations?.map((rule) => ({
        ...rule,
        range: { ...rule.range },
      })),
      conditionalFormats: sheet.conditionalFormats?.map((rule) => ({
        ...rule,
        range: { ...rule.range },
      })),
      pivot: sheet.pivot ? { ...sheet.pivot } : undefined,
      filters: sheet.filters
        ? Object.fromEntries(
            Object.entries(sheet.filters).map(([key, values]) => [
              key,
              [...values],
            ]),
          )
        : undefined,
      sortState: sheet.sortState ? { ...sheet.sortState } : undefined,
    })),
  };
  let appliedOperations = 0;
  let rejectedOperations = 0;
  let rejectionReason: NativePageCommandRejectionReason | undefined;
  // Formatted blanks stored as ranges become ordinary cells for the duration
  // of the command, so a written cell keeps its format (as in Excel) and a
  // sort moves formats with their rows; they are folded back before returning.
  const blankCellRestorers = new Map<SpreadsheetSheet, () => void>();
  const editBlankCells = (sheet: SpreadsheetSheet) => {
    if (!blankCellRestorers.has(sheet)) {
      blankCellRestorers.set(sheet, hydrateSheetForEditing(sheet));
    }
  };

  for (const operation of command.operations) {
    if (operation.op === "mutate_sheet_table") {
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (!sheet) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const tables = sheet.dataTables || [];
      if (operation.action === "create") {
        const table = operation.table;
        if (
          !table ||
          !table.id ||
          !table.name.trim() ||
          !validSpreadsheetCommandRange(table.range) ||
          tables.some(
            (candidate) =>
              candidate.id === table.id ||
              candidate.name.toLocaleLowerCase() ===
                table.name.toLocaleLowerCase() ||
              spreadsheetRangesOverlap(candidate.range, table.range),
          )
        ) {
          rejectedOperations += 1;
          rejectionReason ||= "invalid_command";
          continue;
        }
        sheet.dataTables = [...tables, { ...table, range: { ...table.range } }];
        appliedOperations += 1;
        continue;
      }
      const tableRef = operation.table_ref;
      const tableIndex = tables.findIndex((table) => table.id === tableRef);
      if (!tableRef || tableIndex < 0) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (operation.action === "delete") {
        sheet.dataTables = tables.filter((table) => table.id !== tableRef);
        appliedOperations += 1;
        continue;
      }
      const patch = operation.patch || {};
      const current = tables[tableIndex];
      const nextRange = patch.range || current.range;
      if (
        !validSpreadsheetCommandRange(nextRange) ||
        tables.some(
          (candidate, index) =>
            index !== tableIndex &&
            spreadsheetRangesOverlap(candidate.range, nextRange),
        )
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      sheet.dataTables = tables.map((table, index) =>
        index === tableIndex
          ? {
              ...table,
              ...patch,
              id: table.id,
              range: { ...nextRange },
            }
          : table,
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "mutate_pivot_table") {
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (
        !sheet?.pivot ||
        operation.pivot_ref !== `pivot:${sheet.id}` ||
        !objectPatchWithinCommandBudget(operation.patch)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      sheet.pivot = { ...sheet.pivot, ...operation.patch };
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "apply_sheet_rule") {
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (!sheet) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const field =
        operation.rule_kind === "data_validation"
          ? "validations"
          : "conditionalFormats";
      const rules = sheet[field] || [];
      if (operation.action === "create") {
        const rule = operation.rule;
        if (
          !rule ||
          !rule.id ||
          !validSpreadsheetCommandRange(rule.range) ||
          rules.some((candidate) => candidate.id === rule.id) ||
          !objectPatchWithinCommandBudget(rule)
        ) {
          rejectedOperations += 1;
          rejectionReason ||= "invalid_command";
          continue;
        }
        sheet[field] = [...rules, { ...rule, range: { ...rule.range } }];
        appliedOperations += 1;
        continue;
      }
      const ruleIndex = rules.findIndex(
        (rule) => rule.id === operation.rule_ref,
      );
      if (!operation.rule_ref || ruleIndex < 0) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (operation.action === "delete") {
        sheet[field] = rules.filter((rule) => rule.id !== operation.rule_ref);
        appliedOperations += 1;
        continue;
      }
      const patch = operation.patch || {};
      const current = rules[ruleIndex];
      const nextRange =
        (patch.range as SpreadsheetCommandRange | undefined) || current.range;
      if (
        !validSpreadsheetCommandRange(nextRange) ||
        !objectPatchWithinCommandBudget(patch)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      sheet[field] = rules.map((rule, index) =>
        index === ruleIndex
          ? { ...rule, ...patch, id: rule.id, range: { ...nextRange } }
          : rule,
      );
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "sort_filter_range") {
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (!sheet || !validSpreadsheetCommandRange(operation.range)) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const { range } = operation;
      const sort = operation.sort || [];
      const filters = operation.filters || [];
      if (
        sort.some(
          (condition) =>
            !Number.isInteger(condition.column) ||
            condition.column < range.c1 ||
            condition.column > range.c2,
        ) ||
        filters.some(
          (filter) =>
            !Number.isInteger(filter.column) ||
            filter.column < range.c1 ||
            filter.column > range.c2 ||
            !Array.isArray(filter.allowed),
        )
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (operation.clear_filters && (sheet.dataTables ?? []).some(table => spreadsheetRangesOverlap(table.range, range))) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (sort.length > 0) editBlankCells(sheet);
      const firstDataRow =
        operation.has_header === false ? range.r1 : range.r1 + 1;
      const rows = Array.from(
        { length: Math.max(0, range.r2 - firstDataRow + 1) },
        (_, offset) => firstDataRow + offset,
      );
      const hasFormula = rows.some((row) =>
        Array.from(
          { length: range.c2 - range.c1 + 1 },
          (_, offset) => sheet.cells[`${row}:${range.c1 + offset}`],
        ).some((cell) => Boolean(cell?.formula)),
      );
      if (hasFormula && sort.length > 0) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      if (sort.length > 0) {
        const sourceRows = rows.map((row) => ({
          row,
          cells: Array.from(
            { length: range.c2 - range.c1 + 1 },
            (_, offset) => sheet.cells[`${row}:${range.c1 + offset}`],
          ),
        }));
        sourceRows.sort((left, right) => {
          for (const condition of sort) {
            const offset = condition.column - range.c1;
            const comparison = compareSpreadsheetSortValues(
              spreadsheetCellSortValue(left.cells[offset]),
              spreadsheetCellSortValue(right.cells[offset]),
            );
            if (comparison !== 0) {
              return condition.descending ? -comparison : comparison;
            }
          }
          return left.row - right.row;
        });
        rows.forEach((targetRow, rowIndex) => {
          sourceRows[rowIndex].cells.forEach((cell, colOffset) => {
            const key = `${targetRow}:${range.c1 + colOffset}`;
            if (cell) sheet.cells[key] = { ...cell };
            else delete sheet.cells[key];
          });
        });
        sheet.sortState = {
          ref: spreadsheetRangeA1(range),
          conditions: sort.map((condition) => ({
            ref: spreadsheetColumnName(condition.column),
            descending: Boolean(condition.descending),
          })),
        };
      }
      if (operation.clear_filters) {
        // This legacy projector does not own table-column filter identities;
        // the canonical Copilot native planner handles that separate case.
        for (const field of ["filters", "conditionFilters", "colorFilters"] as const) {
          const values = sheet[field];
          if (values && typeof values === "object") sheet[field] = Object.fromEntries(Object.entries(values).filter(([key])=>Number(key)<range.c1||Number(key)>range.c2));
        }
      }
      if (filters.length > 0) {
        sheet.filters = {
          ...(sheet.filters || {}),
          ...Object.fromEntries(
            filters.map((filter) => [
              String(filter.column),
              filter.allowed.slice(0, 1_000),
            ]),
          ),
        };
        sheet.autoFilterRef = spreadsheetRangeA1(range);
      }
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_sheet_shape") {
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets.find((candidate) =>
            candidate.objects?.some(
              (object) =>
                object.id === operation.shape_ref && object.type === "shape",
            ),
          );
      if (
        !sheet ||
        !objectPatchWithinCommandBudget(operation.patch) ||
        recordHasInvalidInlineImageSrc(operation.patch)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      let didApply = false;
      sheet.objects = (sheet.objects || []).map((object) => {
        if (object.id !== operation.shape_ref || object.type !== "shape") {
          return object;
        }
        didApply = true;
        return mergeSpreadsheetObjectUpdate(object, operation.patch);
      });
      if (!didApply) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "insert_sheet_object") {
      if (
        recordHasInvalidInlineImageSrc(operation.object) ||
        !objectPatchWithinCommandBudget(operation.object)
      ) {
        rejectedOperations += 1;
        rejectionReason ||= recordHasInvalidInlineImageSrc(operation.object)
          ? "invalid_image_source"
          : "payload_too_large";
        continue;
      }
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (
        !sheet ||
        !operation.object.id ||
        (sheet.objects || []).some(
          (object) => object.id === operation.object.id,
        )
      ) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      sheet.objects = [...(sheet.objects || []), { ...operation.object }];
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "delete_sheet_object") {
      if (!operation.object_id) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const sheet =
        (operation.sheet_id
          ? next.sheets.find(
              (item) =>
                item.id === operation.sheet_id &&
                (item.objects || []).some(
                  (object) => object.id === operation.object_id,
                ),
            )
          : undefined) ||
        next.sheets.find((item) =>
          (item.objects || []).some(
            (object) => object.id === operation.object_id,
          ),
        );
      if (!sheet) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      const beforeCount = (sheet.objects || []).length;
      sheet.objects = (sheet.objects || []).filter(
        (object) => object.id !== operation.object_id,
      );
      if (sheet.objects.length === beforeCount) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_sheet_object") {
      const patch = operation.object || operation.patch;
      if (recordHasInvalidInlineImageSrc(patch)) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_image_source";
        continue;
      }
      if (!objectPatchWithinCommandBudget(patch)) {
        rejectedOperations += 1;
        rejectionReason ||= "payload_too_large";
        continue;
      }
      const sheet =
        next.sheets.find((item) => item.id === operation.sheet_id) ||
        next.sheets.find((item) =>
          (item.objects || []).some(
            (object) => object.id === operation.object_id,
          ),
        ) ||
        next.sheets[0];
      if (!sheet) continue;
      let didApply = false;
      sheet.objects = (sheet.objects || []).map((object) => {
        if (object.id !== operation.object_id) return object;
        didApply = true;
        if (operation.object) {
          return mergeSpreadsheetObjectUpdate(object, operation.object);
        }
        return mergeSpreadsheetObjectUpdate(object, operation.patch || {});
      });
      if (didApply) appliedOperations += 1;
      continue;
    }
    if (operation.op === "update_sheet_cells") {
      if (!spreadsheetCellAttrsWithinCommandBudget(operation)) {
        rejectedOperations += 1;
        rejectionReason ||= "payload_too_large";
        continue;
      }
      // Resolve the target sheet. A non-empty sheet_id that matches nothing must
      // be REJECTED, not silently redirected to the first sheet: the id is baked
      // at proposal time, so if the addressed sheet was deleted/renamed before
      // confirm, falling back to sheets[0] would clobber an UNRELATED sheet's
      // data while reporting success. Only use sheets[0] when no sheet_id is set.
      const sheet = operation.sheet_id
        ? next.sheets.find((item) => item.id === operation.sheet_id)
        : next.sheets[0];
      if (!sheet) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
        continue;
      }
      // A write to a merge-COVERED (non-anchor) cell is dropped by the
      // normalizer that keeps cells+merges consistent, so it would vanish from
      // both the grid and disk while being reported as a successful edit. Skip
      // covered cells here and surface them as rejected instead of silently
      // losing the value.
      const covered = coveredCells(normalizeMerges(sheet.merges));
      editBlankCells(sheet);
      const rowCount = operation.row_count ?? 1;
      const colCount = operation.col_count ?? 1;
      let wroteCells = 0;
      let skippedCovered = 0;
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        for (let colOffset = 0; colOffset < colCount; colOffset += 1) {
          const row = operation.start_row + rowOffset;
          const col = operation.start_col + colOffset;
          const key = `${row}:${col}`;
          if (covered.has(key)) {
            skippedCovered += 1;
            continue;
          }
          sheet.rowCount = Math.max(sheet.rowCount, row + 1);
          sheet.columnCount = Math.max(sheet.columnCount, col + 1);
          sheet.cells[key] = applySpreadsheetCellPatch(
            sheet.cells[key],
            operation.patch,
          );
          wroteCells += 1;
        }
      }
      if (wroteCells > 0) {
        appliedOperations += 1;
      }
      // Any skipped merge-covered cell is a rejected portion (surfaced to the
      // user), whether the op was fully or partially swallowed.
      if (skippedCovered > 0) {
        rejectedOperations += 1;
        rejectionReason ||= "invalid_command";
      }
      continue;
    }
    if (operation.op !== "fill_cells") continue;
    if (!spreadsheetFillWithinCommandBudget(operation)) {
      rejectedOperations += 1;
      rejectionReason ||= "payload_too_large";
      continue;
    }
    // See update_sheet_cells: an unknown non-empty sheet_id is rejected rather
    // than redirected to the first sheet (which would clobber unrelated data).
    const sheet = operation.sheet_id
      ? next.sheets.find((item) => item.id === operation.sheet_id)
      : next.sheets[0];
    if (!sheet) {
      rejectedOperations += 1;
      rejectionReason ||= "invalid_command";
      continue;
    }
    // Skip merge-covered cells (see update_sheet_cells): a value written to a
    // covered cell is dropped by the normalizer and would be lost silently.
    const fillCovered = coveredCells(normalizeMerges(sheet.merges));
    editBlankCells(sheet);
    let fillWrote = 0;
    let fillSkipped = 0;
    operation.values.forEach((rowValues, rowOffset) => {
      rowValues.forEach((value, colOffset) => {
        const row = operation.start_row + rowOffset;
        const col = operation.start_col + colOffset;
        const key = `${row}:${col}`;
        if (fillCovered.has(key)) {
          fillSkipped += 1;
          return;
        }
        sheet.rowCount = Math.max(sheet.rowCount, row + 1);
        sheet.columnCount = Math.max(sheet.columnCount, col + 1);
        const nextCell: SpreadsheetCell = {
          ...(sheet.cells[key] || {}),
          value,
          kind: cellKind(value),
        };
        if (value.trim().startsWith("=")) {
          nextCell.formula = value.trim();
        } else {
          delete nextCell.formula;
        }
        sheet.cells[key] = nextCell;
        fillWrote += 1;
      });
    });
    if (fillWrote > 0) {
      appliedOperations += 1;
    }
    if (fillSkipped > 0) {
      rejectedOperations += 1;
      rejectionReason ||= "invalid_command";
    }
  }
  for (const restore of blankCellRestorers.values()) restore();

  return {
    content: next,
    appliedOperations,
    rejectedOperations,
    rejectionReason,
  };
}
