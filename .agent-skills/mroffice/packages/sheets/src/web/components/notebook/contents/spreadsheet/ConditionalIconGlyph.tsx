/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { cloneElement, type ReactElement, type ReactNode } from "react";

/**
 * Conditional-format icon-set glyphs, drawn as inline SVG in Excel's look
 * (XLS-A044/A045/A046, measured against Excel's own cells): ~16 px icons,
 * block arrows with a darker outline, lit traffic lights, the black-framed
 * 3 Traffic Lights (Rimmed), and Excel's per-family colours — not a generic
 * red→green ramp. `index` is the resolved slot, 0 = the lowest bucket (after
 * any Reverse Icon Order); `count` is the family size.
 *
 * Every colour is a literal of this renderer (never persisted), so there is no
 * CSS-injection surface.
 */

const ICON_SIZE = 15;

const GREEN = { fill: "#63b04f", stroke: "#2f7a22" };
const YELLOW = { fill: "#fcc12d", stroke: "#c68a00" };
const RED = { fill: "#e8564d", stroke: "#a3201a" };
const GRAY = { fill: "#8c8c8c", stroke: "#4d4d4d" };
// The Arrows families in Windows Excel's own prints (R12-X02's 5 Arrows,
// R121-X05's 3 Arrows): a muted teal green, a sand yellow and a brick red,
// not the traffic lights' colours.
const ARROW_GREEN = { fill: "#68a490", stroke: "#3d7a66" };
const ARROW_YELLOW = { fill: "#eac282", stroke: "#ac8735" };
const ARROW_RED = { fill: "#d65532", stroke: "#a93e20" };
const BLACK = "#111111";

type Paint = { fill: string; stroke: string };

/** Excel's colours, lowest bucket first, for the coloured families. */
function familyPaints(family: string, count: number): Paint[] {
  if (family === "arrows") {
    if (count === 4) return [ARROW_RED, ARROW_YELLOW, ARROW_YELLOW, ARROW_GREEN];
    if (count === 5) return [ARROW_RED, ARROW_YELLOW, ARROW_YELLOW, ARROW_YELLOW, ARROW_GREEN];
    return [ARROW_RED, ARROW_YELLOW, ARROW_GREEN];
  }
  return count === 4 ? [{ fill: BLACK, stroke: BLACK }, RED, YELLOW, GREEN] : [RED, YELLOW, GREEN];
}

/** Windows Excel's arrow (its 24 px icon traced, R12-X02's 5 Arrows): a
 * head as wide as the icon whose barbs hang straight down at its sides and
 * sweep back into a stem a quarter of the icon wide, not a block arrow's
 * flat-backed head. Drawn up; a heading turns it. */
const ARROW_PATH = "M8 0.6 14.1 6.7V11.5H13L10.4 7.8 9.9 8.1V15.4H6.1V8.1L5.6 7.8 3 11.5H1.9V6.7Z";

/** Excel's diagonal arrows stand their head in the icon's corner: the turned
 * arrow moved half a unit out toward it. */
function arrowNudge(heading: number): string {
  if (heading === 45) return "translate(0.4 -0.5) ";
  if (heading === 135) return "translate(0.4 0.5) ";
  return "";
}

/** Arrow headings, lowest bucket first: 0 = up, 90 = right, 180 = down. */
function arrowHeadings(count: number): number[] {
  if (count === 4) return [180, 135, 45, 0];
  if (count === 5) return [180, 135, 90, 45, 0];
  return [180, 90, 0];
}

function Svg({ children, size = ICON_SIZE }: { children: ReactNode; size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** A lit disc: the colour, a darker rim and a soft highlight at the top. */
function LitDisc({ paint, r = 6.3 }: { paint: Paint; r?: number }): ReactElement {
  return (
    <>
      <circle cx="8" cy="8" r={r} fill={paint.fill} stroke={paint.stroke} strokeWidth="0.9" />
      <ellipse cx="8" cy={8 - r * 0.45} rx={r * 0.62} ry={r * 0.36} fill="#ffffff" opacity="0.38" />
    </>
  );
}

function Star({ fill, stroke }: { fill: string; stroke: string }): ReactElement {
  return (
    <path
      d="M8 1.6l1.9 4.1 4.5.5-3.4 3.1.9 4.5L8 11.5l-3.9 2.3.9-4.5L1.6 6.2l4.5-.5z"
      fill={fill}
      stroke={stroke}
      strokeWidth="0.9"
      strokeLinejoin="round"
    />
  );
}

export function ConditionalIconGlyph({
  iconSet,
  index,
  count = 3,
  size,
}: {
  iconSet: string;
  index: number;
  count?: number;
  /** The icon's side in px (the grid's 15 px when unstated): a printed page
   * at a scale draws it at that scale. */
  size?: number;
}): ReactElement {
  const glyph = conditionalIconGlyph(iconSet, index, count);
  return size !== undefined && Number.isFinite(size) && size > 0 ? cloneElement(glyph as ReactElement<{ size?: number }>, { size }) : glyph;
}

function conditionalIconGlyph(iconSet: string, index: number, count: number): ReactElement {
  const slots = Math.max(2, count);
  const slot = Math.max(0, Math.min(slots - 1, index));
  const family = iconSet.replace(/^[0-9]+-/, "");

  // Block arrows (Excel 3/4/5 Arrows, coloured or gray).
  if (family === "arrows" || family === "arrows-gray") {
    const paint = family === "arrows-gray" ? GRAY : familyPaints("arrows", slots)[slot];
    const heading = arrowHeadings(slots)[slot] ?? 0;
    return (
      <Svg>
        <path
          d={ARROW_PATH}
          fill={paint.fill}
          stroke={paint.stroke}
          strokeWidth="0.7"
          strokeLinejoin="miter"
          transform={`${arrowNudge(heading)}rotate(${heading} 8 8)`}
        />
      </Svg>
    );
  }

  // 3 Triangles: red down, yellow dash, green up.
  if (family === "triangles") {
    const paint = [RED, YELLOW, GREEN][slot] ?? YELLOW;
    if (slot === 0) return <Svg><path d="M2 4.5h12L8 13z" fill={paint.fill} stroke={paint.stroke} strokeWidth="0.8" /></Svg>;
    if (slot === slots - 1) return <Svg><path d="M8 3l6 8.5H2z" fill={paint.fill} stroke={paint.stroke} strokeWidth="0.8" /></Svg>;
    return <Svg><rect x="3" y="6.5" width="10" height="3" fill={paint.fill} stroke={paint.stroke} strokeWidth="0.8" /></Svg>;
  }

  // 4 Red To Black: black, gray, pink, red from the lowest bucket up (Excel).
  if (family === "red-to-black") {
    const paints: Paint[] = [
      { fill: BLACK, stroke: "#000000" },
      { fill: "#c3c3c3", stroke: "#9a9a9a" },
      { fill: "#f2a29c", stroke: "#d8766f" },
      { fill: "#e53a2e", stroke: "#b0231a" },
    ];
    return <Svg><LitDisc paint={paints[slot] ?? paints[0]} /></Svg>;
  }

  // 3 Signs: red diamond, yellow triangle, green circle.
  if (family === "signs") {
    if (slot === 0) return <Svg><path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill={RED.fill} stroke={RED.stroke} strokeWidth="0.9" /></Svg>;
    if (slot === slots - 1) return <Svg><LitDisc paint={GREEN} /></Svg>;
    return <Svg><path d="M8 2 14.5 13.5h-13z" fill={YELLOW.fill} stroke={YELLOW.stroke} strokeWidth="0.9" strokeLinejoin="round" /></Svg>;
  }

  // 3 Symbols (circled): ✗ / ! / ✓ in white on a red / yellow / green disc;
  // 3 Symbols (uncircled): the marks themselves, bold, in those colours.
  if (family === "symbols" || family === "symbols-circled") {
    const paint = [RED, YELLOW, GREEN][slot] ?? YELLOW;
    const circled = family === "symbols-circled";
    const ink = circled ? "#ffffff" : paint.fill;
    const width = circled ? 1.8 : 2.6;
    const mark =
      slot === 0 ? (
        <path d="M5 5l6 6M11 5l-6 6" stroke={ink} strokeWidth={width} strokeLinecap="round" fill="none" />
      ) : slot === slots - 1 ? (
        <path d="M4.2 8.4l2.6 2.6 5-5.6" stroke={ink} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <path d="M8 3.8v5M8 11.6v.4" stroke={ink} strokeWidth={width} strokeLinecap="round" fill="none" />
      );
    return <Svg>{circled ? <><LitDisc paint={paint} />{mark}</> : mark}</Svg>;
  }

  // 3 Flags: red, yellow, green pennants on a gray pole.
  if (family === "flags") {
    const paint = [RED, YELLOW, GREEN][slot] ?? YELLOW;
    return (
      <Svg>
        <rect x="3" y="1.5" width="1.3" height="13" fill="#7f7f7f" />
        <path d="M4.3 2h9l-2.2 3.2 2.2 3.2h-9z" fill={paint.fill} stroke={paint.stroke} strokeWidth="0.7" strokeLinejoin="round" />
      </Svg>
    );
  }

  // 3 Stars: empty, half, full.
  if (family === "stars") {
    const gold = { fill: "#ffc000", stroke: "#bf8f00" };
    if (slot === 0) return <Svg><Star fill="#ffffff" stroke="#a6a6a6" /></Svg>;
    if (slot === slots - 1) return <Svg><Star fill={gold.fill} stroke={gold.stroke} /></Svg>;
    return (
      <Svg>
        <Star fill="#ffffff" stroke={gold.stroke} />
        <clipPath id="cf-halfstar16">
          <rect x="0" y="0" width="8" height="16" />
        </clipPath>
        <g clipPath="url(#cf-halfstar16)">
          <Star fill={gold.fill} stroke={gold.stroke} />
        </g>
      </Svg>
    );
  }

  // 4 / 5 Ratings: four rising signal bars in navy; 4 Ratings fills 1-4 of
  // them, 5 Ratings 0-4 (its lowest icon is all gray).
  if (family === "ratings") {
    const filled = slots === 5 ? slot : slot + 1;
    return (
      <Svg>
        {[0, 1, 2, 3].map((i) => {
          const h = 4 + i * 3.2;
          return (
            <rect key={i} x={1.5 + i * 3.4} y={14.5 - h} width="2.6" height={h} fill={i < filled ? "#1f3f78" : "#c8c8c8"} />
          );
        })}
      </Svg>
    );
  }

  // 5 Quarters: a disc filled 0/4 … 4/4, clockwise from 12 o'clock.
  if (family === "quarters") {
    const pt = (deg: number) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return `${(8 + 6 * Math.cos(a)).toFixed(2)} ${(8 + 6 * Math.sin(a)).toFixed(2)}`;
    };
    const wedges = Array.from({ length: Math.min(4, slot) }, (_, q) => (
      <path key={q} d={`M8 8 L ${pt(q * 90)} A 6 6 0 0 1 ${pt((q + 1) * 90)} Z`} fill={BLACK} />
    ));
    return (
      <Svg>
        <circle cx="8" cy="8" r="6.3" fill="#ffffff" stroke={BLACK} strokeWidth="0.9" />
        {wedges}
      </Svg>
    );
  }

  // 5 Boxes: a 2×2 grid filling one quadrant at a time.
  if (family === "boxes") {
    const quadrants = [[1.5, 1.5], [8.5, 1.5], [1.5, 8.5], [8.5, 8.5]] as const;
    return (
      <Svg>
        {quadrants.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="6" height="6" fill={i < slot ? BLACK : "#ffffff"} stroke={BLACK} strokeWidth="0.7" />
        ))}
      </Svg>
    );
  }

  // Traffic lights: 3 = red / yellow / green, 4 = black / red / yellow /
  // green; Rimmed sits each light in a black rounded frame.
  const paint = familyPaints("traffic-lights", slots)[slot] ?? YELLOW;
  if (family.startsWith("traffic-lights-rimmed")) {
    return (
      <Svg>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="#1a1a1a" />
        <LitDisc paint={paint} r={4.6} />
      </Svg>
    );
  }
  return <Svg><LitDisc paint={paint} /></Svg>;
}
