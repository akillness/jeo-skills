/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode, SVGProps } from "react";

/**
 * Word-style preview glyphs owned by the document Layout ribbon's galleries.
 *
 * Word's Layout galleries preview the RESULT rather than the command: the
 * Margins rows show a sheet whose text block shrinks as the margins grow, the
 * Columns rows show a sheet ruled into 1/2/3 (or narrow+wide) text columns, and
 * the Breaks rows show the break itself — a sheet torn at the page boundary, an
 * arrow hopping into the next column, section rules opening a new sheet.
 *
 * They share the Home ribbon's 24px drawing grid and its two-tone paint classes
 * (`docs-home-icon__paper` for the sheet, `__ink-soft` for body text,
 * `__accent` for the blue emphasis, `__warm` for the orange section rules), so
 * a row drawn here sits in the same optical box as every other Docs glyph and
 * follows the ribbon's hover/active/disabled colours without changing geometry.
 */
export const DOCS_LAYOUT_ICON_NAMES = [
  // Margins gallery (Word: Layout ▸ Margins).
  "marginsNormal",
  "marginsNarrow",
  "marginsWide",
  // Page Size gallery: a bare sheet, stretched to each stock's aspect ratio.
  // Columns gallery (Word: One / Two / Three / Left / Right / More Columns…).
  "columnsOne",
  "columnsTwo",
  "columnsThree",
  "columnsLeft",
  "columnsRight",
  "columnsMore",
  // Breaks gallery ▸ Page Breaks.
  "breakPage",
  "breakColumn",
  "breakTextWrapping",
  // Breaks gallery ▸ Section Breaks.
  "sectionBreakNextPage",
  "sectionBreakContinuous",
  "sectionBreakEvenPage",
  "sectionBreakOddPage",
  // Line Numbers menu (Word: Layout ▸ Line Numbers).
  "lineNumbersNone",
  "lineNumbersContinuous",
  "lineNumbersRestartPage",
  "lineNumbersRestartSection",
  "lineNumbersSuppress",
  "lineNumbersOptions",
] as const;

export type DocsLayoutIconName = (typeof DOCS_LAYOUT_ICON_NAMES)[number];

export const DOCS_LAYOUT_ICON_STROKE_WIDTH = 1;

/** Which preview each Margins gallery row draws, keyed by the margin preset. */
export const DOCS_MARGIN_PRESET_ICON_NAMES = {
  normal: "marginsNormal",
  narrow: "marginsNarrow",
  wide: "marginsWide",
} as const satisfies Record<string, DocsLayoutIconName>;

/** Which preview each Columns gallery row draws, keyed by the gallery row id. */
export const DOCS_COLUMNS_PRESET_ICON_NAMES = {
  "1": "columnsOne",
  "2": "columnsTwo",
  "3": "columnsThree",
  left: "columnsLeft",
  right: "columnsRight",
} as const satisfies Record<string, DocsLayoutIconName>;

/** Which preview each Breaks gallery row draws, keyed by the break kind. */
export const DOCS_BREAK_ICON_NAMES = {
  page: "breakPage",
  column: "breakColumn",
  textWrapping: "breakTextWrapping",
  nextPage: "sectionBreakNextPage",
  continuous: "sectionBreakContinuous",
  evenPage: "sectionBreakEvenPage",
  oddPage: "sectionBreakOddPage",
} as const satisfies Record<string, DocsLayoutIconName>;

interface DocsLayoutIconProps
  extends Omit<SVGProps<SVGSVGElement>, "children" | "name"> {
  name: DocsLayoutIconName;
  size?: number;
}

/** The sheet every Layout glyph is drawn on. */
function Sheet({
  x = 4.4,
  y = 2.5,
  width = 15.2,
  height = 19,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <rect
      className="docs-home-icon__paper"
      x={x}
      y={y}
      width={width}
      height={height}
      rx="0.8"
    />
  );
}

/**
 * Margins preview: the sheet with its text block inset by the preset. The
 * inset is proportional to the preset's real margins (Normal 1in all round,
 * Narrow 0.5in all round, Wide 1in vertical + 2in horizontal), so the three
 * rows read as the measurements listed beside them.
 */
function marginsPreview(preset: "normal" | "narrow" | "wide"): ReactNode {
  const block =
    preset === "narrow"
      ? { x: 6, y: 4.2, width: 12, height: 15.6 }
      : preset === "wide"
        ? { x: 9, y: 5.6, width: 6, height: 12.8 }
        : { x: 7.5, y: 5.6, width: 9, height: 12.8 };
  return (
    <>
      <Sheet x="4.5" y="2.5" width="15" height="19" />
      <rect
        className="docs-home-icon__muted"
        x={block.x}
        y={block.y}
        width={block.width}
        height={block.height}
        rx="0.45"
      />
    </>
  );
}

/** Body-text rules for one text column, as a single path. */
function columnRules(
  left: number,
  width: number,
  rows: readonly number[],
): string {
  return rows
    .map((y) => `M${left.toFixed(2)} ${y.toFixed(2)}h${width.toFixed(2)}`)
    .join("");
}

const COLUMN_TEXT_ROWS = [5.9, 8.1, 10.3, 12.5, 14.7, 16.9, 19.1] as const;

const COLUMN_TEXT_LEFT = 6.4;
const COLUMN_TEXT_RIGHT = 17.6;

/**
 * Columns preview: the sheet ruled into equal text columns with Word's gutter
 * between them (One / Two / Three).
 */
function columnsPreview(count: number): ReactNode {
  const gap = 1.3;
  const usable = COLUMN_TEXT_RIGHT - COLUMN_TEXT_LEFT - gap * (count - 1);
  const width = usable / count;
  const segments: string[] = [];
  for (let index = 0; index < count; index += 1) {
    segments.push(
      columnRules(
        COLUMN_TEXT_LEFT + index * (width + gap),
        width,
        COLUMN_TEXT_ROWS,
      ),
    );
  }
  return (
    <>
      <Sheet />
      <path className="docs-home-icon__ink-soft" d={segments.join("")} />
    </>
  );
}

/**
 * Word's Left / Right preview: two columns of UNEQUAL width, where the narrow
 * one is a third of the text width (the same third `unequalTwoColumnPreset`
 * writes) and the rest goes to the wide one.
 *
 * Two things make the asymmetry survive a 36px — and an 18px — row. The gutter
 * is widened well past the equal-column one, so the split never reads as a
 * two-column page; and the NARROW column is ruled in the accent blue while the
 * wide one stays body-text grey, so the eye lands on the small side instead of
 * having to measure two grey blocks against each other.
 */
function unequalColumnsPreview(narrowSide: "left" | "right"): ReactNode {
  const gap = 2;
  const usable = COLUMN_TEXT_RIGHT - COLUMN_TEXT_LEFT - gap;
  const narrow = usable / 3;
  const wide = usable - narrow;
  const narrowLeft =
    narrowSide === "left" ? COLUMN_TEXT_LEFT : COLUMN_TEXT_RIGHT - narrow;
  const wideLeft =
    narrowSide === "left" ? COLUMN_TEXT_RIGHT - wide : COLUMN_TEXT_LEFT;
  return (
    <>
      <Sheet />
      <path
        className="docs-home-icon__ink-soft"
        d={columnRules(wideLeft, wide, COLUMN_TEXT_ROWS)}
      />
      <path
        className="docs-home-icon__accent"
        d={columnRules(narrowLeft, narrow, COLUMN_TEXT_ROWS)}
      />
    </>
  );
}

/** A margin line number: a small figure in the gutter beside a text line. */
function Num({ x, y, value, muted = false }: { x: number; y: number; value: string; muted?: boolean }) {
  return (
    <text
      className={muted ? "docs-home-icon__type-text" : "docs-home-icon__accent-text"}
      x={x}
      y={y}
      fontSize="4.6"
      fontWeight="700"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      {value}
    </text>
  );
}

/** A sheet whose text lines carry the given gutter numbers (null: none). */
function numberedSheet(
  x: number,
  width: number,
  numbers: readonly (string | null)[],
  top = 6.8,
  pitch = 4.2,
) {
  return (
    <>
      <Sheet x={x} y="2.5" width={width} height="19" />
      {numbers.map((value, row) => {
        const y = top + row * pitch;
        return (
          <g key={row}>
            <path className="docs-home-icon__ink-soft" d={`M${x + 4.6} ${y - 1.4}h${width - 6.2}`} />
            {value ? <Num x={x + 2.3} y={y} value={value} /> : null}
          </g>
        );
      })}
    </>
  );
}

function glyph(name: DocsLayoutIconName): ReactNode {
  switch (name) {
    case "marginsNormal":
      return marginsPreview("normal");
    case "marginsNarrow":
      return marginsPreview("narrow");
    case "marginsWide":
      return marginsPreview("wide");
    case "columnsOne":
      return columnsPreview(1);
    case "columnsTwo":
      return columnsPreview(2);
    case "columnsThree":
      return columnsPreview(3);
    case "columnsLeft":
      // Word's Left: the NARROW column on the left, the wide one on the right.
      return unequalColumnsPreview("left");
    case "columnsRight":
      return unequalColumnsPreview("right");
    case "columnsMore":
      // The "More Columns…" launcher: a ruled sheet with the width handles
      // Word's dialog exposes.
      return (
        <>
          <Sheet x="4.4" y="3.6" width="15.2" height="14.6" />
          <path
            className="docs-home-icon__ink-soft"
            d={columnRules(6.4, 4.4, [6.4, 8.6, 10.8, 13]) +
              columnRules(13.2, 4.4, [6.4, 8.6, 10.8, 13])}
          />
          <path
            className="docs-home-icon__accent"
            d="M4.8 20.6h14.4M6.2 19.3v2.6M17.8 19.3v2.6"
          />
        </>
      );
    case "breakPage":
      // Word's Page break: the sheet torn where the page ends, with the flow
      // arrow crossing the tear into the next page.
      return (
        <>
          <Sheet />
          <path
            className="docs-home-icon__ink-soft"
            d="M6.6 6.2h10.8M6.6 8.6h10.8M6.6 11h7.4"
          />
          <path
            className="docs-home-icon__accent"
            strokeDasharray="2 1.6"
            d="M4.4 14.1h15.2"
          />
          <path
            className="docs-home-icon__accent"
            d="M12 16.1v3.4M10.2 17.9 12 19.7l1.8-1.8"
          />
        </>
      );
    case "breakTextWrapping":
      // Text Wrapping: a picture with two short text rules beside it, the
      // line ended early and the flow arrow returning below the picture.
      return (
        <>
          <Sheet />
          <rect
            className="docs-home-icon__muted"
            x="6.4"
            y="5.4"
            width="5"
            height="5"
            rx="0.45"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M12.8 6.2h4.6M12.8 8.6h2.6M6.6 16.6h10.8M6.6 19h7.4"
          />
          <path
            className="docs-home-icon__accent"
            d="M16.6 8.6v4.2H8M9.6 11.2 8 12.8l1.6 1.6"
          />
        </>
      );
    case "breakColumn":
      // Word's Column break: two text columns, the left one cut short and the
      // flow arrow hopping into the top of the right column.
      return (
        <>
          <Sheet />
          <path
            className="docs-home-icon__ink-soft"
            d={columnRules(6.4, 4.4, [6.2, 8.4, 10.6]) +
              columnRules(13.2, 4.4, [13.4, 15.6, 17.8])}
          />
          <path
            className="docs-home-icon__accent"
            strokeDasharray="1.8 1.5"
            d="M11 5.6v12.8"
          />
          <path
            className="docs-home-icon__accent"
            d="M6.6 12.9h6.8M11.9 11.3l1.7 1.6-1.7 1.7"
          />
        </>
      );
    case "sectionBreakNextPage":
      // A new section that opens on a new sheet: the section rules sit at the
      // top of the second sheet.
      return (
        <>
          <Sheet x="3" y="2.6" width="11.4" height="14.6" />
          <path
            className="docs-home-icon__ink-soft"
            d="M5.2 5.8h7M5.2 8h7M5.2 10.2h4.6"
          />
          <Sheet x="9.6" y="6.8" width="11.4" height="14.6" />
          <path className="docs-home-icon__warm" d="M10.4 9.6h9.8M10.4 11h9.8" />
          <path
            className="docs-home-icon__ink-soft"
            d="M11.8 13.8h7M11.8 16h7M11.8 18.2h4.6"
          />
        </>
      );
    case "sectionBreakContinuous":
      // A new section on the SAME sheet: the rules cut across mid-page with
      // body text continuing above and below them.
      return (
        <>
          <Sheet />
          <path
            className="docs-home-icon__ink-soft"
            d="M6.6 6h10.8M6.6 8.2h10.8"
          />
          <path
            className="docs-home-icon__warm"
            d="M4.4 10.8h15.2M4.4 12.4h15.2"
          />
          <path
            className="docs-home-icon__ink-soft"
            d="M6.6 15.2h10.8M6.6 17.4h10.8M6.6 19.6h7.4"
          />
        </>
      );
    case "sectionBreakEvenPage":
    case "sectionBreakOddPage": {
      const [first, second] =
        name === "sectionBreakEvenPage" ? ["2", "4"] : ["1", "3"];
      return (
        <>
          <Sheet x="3" y="4" width="8.6" height="16" />
          <path className="docs-home-icon__warm" d="M3.8 6.6h7M3.8 8h7" />
          <text
            className="docs-home-icon__type-text"
            x="7.3"
            y="17.4"
            fontSize="7"
            fontWeight="600"
            textAnchor="middle"
          >
            {first}
          </text>
          <Sheet x="12.4" y="4" width="8.6" height="16" />
          <path className="docs-home-icon__warm" d="M13.2 6.6h7M13.2 8h7" />
          <text
            className="docs-home-icon__type-text"
            x="16.7"
            y="17.4"
            fontSize="7"
            fontWeight="600"
            textAnchor="middle"
          >
            {second}
          </text>
        </>
      );
    }
  }

  switch (name) {
    case "lineNumbersNone":
      // No numbers: the text lines with an empty gutter, struck through.
      return (
        <>
          {numberedSheet(4.4, 15.2, [null, null, null, null])}
          <path className="docs-home-icon__danger" d="M5.4 20.2 9 3.8" />
        </>
      );
    case "lineNumbersContinuous":
      // One count running on across the page break: 1 2 | 3 4.
      return (
        <>
          {numberedSheet(1.6, 10, ["1", "2", null, null])}
          {numberedSheet(12.4, 10, ["3", "4", null, null])}
          <path className="docs-home-icon__accent" d="M9.6 15.6c1.4 1.8 3.6 1.8 5 0M13.4 14.6l1.2 1-1.4.6" />
        </>
      );
    case "lineNumbersRestartPage":
      // Each page starts again at 1: 1 2 | 1 2.
      return (
        <>
          {numberedSheet(1.6, 10, ["1", "2", null, null])}
          {numberedSheet(12.4, 10, ["1", "2", null, null])}
        </>
      );
    case "lineNumbersRestartSection":
      // The count starts again after the section break on the same page.
      return (
        <>
          <Sheet x="4.4" y="2.5" width="15.2" height="19" />
          <path className="docs-home-icon__ink-soft" d="M9 5.4h9M9 9h9M9 15.8h9M9 19.4h7" />
          <Num x={6.7} y={6.8} value="1" />
          <Num x={6.7} y={10.4} value="2" />
          <path className="docs-home-icon__warm" d="M4.8 12.1h14.4M4.8 13.3h14.4" />
          <Num x={6.7} y={17.2} value="1" />
          <Num x={6.7} y={20.8} value="2" />
        </>
      );
    case "lineNumbersSuppress":
      // The current paragraph (shaded) keeps no number; the count skips it.
      return (
        <>
          <Sheet x="4.4" y="2.5" width="15.2" height="19" />
          <rect className="docs-home-icon__accent-soft-fill" x="8.2" y="9.6" width="10.4" height="6" rx="0.6" />
          <path className="docs-home-icon__ink-soft" d="M9 5.4h9M9 11.4h8.6M9 14h7M9 19.4h7" />
          <Num x={6.7} y={6.8} value="1" />
          <path className="docs-home-icon__danger" d="M5.6 11.2l2.2 2.6M7.8 11.2l-2.2 2.6" />
          <Num x={6.7} y={20.8} value="2" />
        </>
      );
    case "lineNumbersOptions":
      // The options launcher: numbered lines and the dialog's settings.
      return (
        <>
          {numberedSheet(2.4, 13.6, ["1", "2", "3", null])}
          <circle className="docs-home-icon__paper" cx="17.6" cy="17.4" r="4.2" />
          <path className="docs-home-icon__accent" d="M15.4 16.2h4.4M15.4 18.6h4.4" />
          <circle className="docs-home-icon__accent-fill" cx="16.6" cy="16.2" r="0.9" />
          <circle className="docs-home-icon__accent-fill" cx="18.6" cy="18.6" r="0.9" />
        </>
      );
  }

  const exhaustiveName: never = name;
  return exhaustiveName;
}

/** Two-tone SVGs owned by the Docs Layout ribbon's galleries. */
export function DocsLayoutIcon({
  name,
  size = 24,
  className,
  ...props
}: DocsLayoutIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={["docs-home-icon", "docs-layout-icon", className]
        .filter(Boolean)
        .join(" ")}
      data-docs-layout-icon={name}
      width={size}
      height={size}
      viewBox={props.viewBox ?? "0 0 24 24"}
      fill="none"
      /* Safety net for a glyph element that carries no `docs-home-icon__*`
         paint class: without a root stroke it would render invisibly. Any
         paint class still wins (a class selector beats a presentation
         attribute), so the ribbon's two-tone language is untouched. */
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={DOCS_LAYOUT_ICON_STROKE_WIDTH}
      focusable="false"
    >
      {glyph(name)}
    </svg>
  );
}

/** A page's margins in twips, for {@link DocsMarginsPreview}. */
export interface DocsMarginsPreviewMargins {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** Letter paper at 4 drawing units per inch. */
const PREVIEW_SHEET = { width: 34, height: 44, unitsPerInch: 4 } as const;

function marginGuides(
  x: number,
  margins: DocsMarginsPreviewMargins,
  flip: boolean,
): ReactNode {
  const unit = (twips: number) =>
    Math.min(PREVIEW_SHEET.width / 2 - 2, (twips / 1440) * PREVIEW_SHEET.unitsPerInch);
  const left = unit(flip ? margins.right : margins.left);
  const right = unit(flip ? margins.left : margins.right);
  const top = unit(margins.top);
  const bottom = unit(margins.bottom);
  const { width, height } = PREVIEW_SHEET;
  const gx = (value: number) => (x + value).toFixed(2);
  return (
    <>
      <rect
        className="docs-margin-preview__sheet"
        x={x + 0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
      />
      <rect
        className="docs-margin-preview__text"
        x={x + left}
        y={top}
        width={Math.max(1, width - left - right)}
        height={Math.max(1, height - top - bottom)}
      />
      <path
        className="docs-margin-preview__guide"
        d={`M${gx(left)} 0.5V${height - 0.5}M${gx(width - right)} 0.5V${height - 0.5}M${gx(0.5)} ${top}H${gx(width - 0.5)}M${gx(0.5)} ${height - bottom}H${gx(width - 0.5)}`}
      />
    </>
  );
}

/**
 * The Margins gallery's preview, as Word draws it: the sheet to scale with a
 * blue guide at each margin running edge to edge. Mirrored draws the facing
 * pair, the wider inside margins meeting at the spine; Last Custom Setting
 * carries Word's star.
 */
export function DocsMarginsPreview({
  margins,
  mirrored = false,
  star = false,
  className,
}: {
  margins: DocsMarginsPreviewMargins;
  mirrored?: boolean;
  star?: boolean;
  className?: string;
}) {
  const gap = 3;
  const width = mirrored ? PREVIEW_SHEET.width * 2 + gap : PREVIEW_SHEET.width;
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-margins-preview={mirrored ? "mirrored" : star ? "last-custom" : "single"}
      viewBox={`0 0 ${width} ${PREVIEW_SHEET.height}`}
      width={width}
      height={PREVIEW_SHEET.height}
    >
      {mirrored ? (
        <>
          {/* The left page's inside margin is its right one. */}
          {marginGuides(0, margins, true)}
          {marginGuides(PREVIEW_SHEET.width + gap, margins, false)}
        </>
      ) : (
        marginGuides(0, margins, false)
      )}
      {star ? (
        <path
          className="docs-margin-preview__star"
          d="M17 13.4l2.47 5.01 5.53.8-4 3.9.94 5.51L17 26.02l-4.94 2.6.94-5.51-4-3.9 5.53-.8z"
        />
      ) : null}
    </svg>
  );
}
