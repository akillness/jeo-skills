/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Borders and Shading > Shading (ECMA-376 17.3.5 CT_Shd, 17.18.78
 * ST_Shd; "Add shading to a table", Microsoft Support):
 *
 * - Fill is the background colour (`w:fill`). The editor already keeps a
 *   cell's fill as its `backgroundColor` attr; a table's fill lives in
 *   `tableShading.fill`.
 * - Patterns > Style is `w:val`: Clear (no pattern, the default), Solid (100%),
 *   a percentage of the pattern colour laid over the fill, or a stripe/cross
 *   hatch. Patterns > Color is `w:color` (Automatic = black).
 * - Apply to Cell writes `w:tcPr/w:shd`; Apply to Table writes
 *   `w:tblPr/w:shd`, under every cell that has no shading of its own.
 *
 * Values here are canonical and closed: an unknown style or a colour that is
 * not `#rrggbb` rejects the whole value, and Clear with no fill is `null`.
 */

export const WORD_SHADING_PATTERNS = [
  "clear",
  "solid",
  "pct5",
  "pct10",
  "pct12",
  "pct15",
  "pct20",
  "pct25",
  "pct30",
  "pct35",
  "pct37",
  "pct40",
  "pct45",
  "pct50",
  "pct55",
  "pct60",
  "pct62",
  "pct65",
  "pct70",
  "pct75",
  "pct80",
  "pct85",
  "pct87",
  "pct90",
  "pct95",
  "horzStripe",
  "vertStripe",
  "reverseDiagStripe",
  "diagStripe",
  "horzCross",
  "diagCross",
  "thinHorzStripe",
  "thinVertStripe",
  "thinReverseDiagStripe",
  "thinDiagStripe",
  "thinHorzCross",
  "thinDiagCross",
] as const;
export type WordShadingPattern = (typeof WORD_SHADING_PATTERNS)[number];

/** A cell's pattern layer (its fill stays in `backgroundColor`). */
export interface CellShadingPattern {
  pattern: Exclude<WordShadingPattern, "clear">;
  /** `#rrggbb`, or absent for Word's Automatic (black). */
  color?: string;
}

/** A whole table's shading (`w:tblPr/w:shd`). */
export interface TableShading {
  fill?: string;
  pattern?: Exclude<WordShadingPattern, "clear">;
  color?: string;
}

const HEX_RE = /^#[0-9a-f]{6}$/;

function hex(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  const withHash = lower.startsWith("#") ? lower : `#${lower}`;
  return HEX_RE.test(withHash) ? withHash : null;
}

function pattern(value: unknown): Exclude<WordShadingPattern, "clear"> | null | undefined {
  if (value === undefined || value === null || value === "clear") return undefined;
  return typeof value === "string" &&
    (WORD_SHADING_PATTERNS as readonly string[]).includes(value)
    ? (value as Exclude<WordShadingPattern, "clear">)
    : null;
}

export function normalizeCellShadingPattern(value: unknown): CellShadingPattern | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).every((key) => key === "pattern" || key === "color")) return null;
  const style = pattern(raw.pattern);
  const color = hex(raw.color);
  if (!style || color === null) return null;
  return { pattern: style, ...(color ? { color } : {}) };
}

export function normalizeTableShading(value: unknown): TableShading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).every((key) => key === "fill" || key === "pattern" || key === "color")) {
    return null;
  }
  const fill = hex(raw.fill);
  const style = pattern(raw.pattern);
  const color = hex(raw.color);
  if (fill === null || style === null || color === null) return null;
  if (!fill && !style) return null;
  return {
    ...(fill ? { fill } : {}),
    ...(style ? { pattern: style } : {}),
    ...(style && color ? { color } : {}),
  };
}

/** The share of the pattern colour a percentage style lays over the fill. */
function patternShare(style: WordShadingPattern): number | null {
  if (style === "solid") return 1;
  const match = /^pct(\d+)$/.exec(style);
  return match ? Number(match[1]) / 100 : null;
}

function mix(fill: string, color: string, share: number): string {
  const channel = (value: string, index: number) =>
    Number.parseInt(value.slice(1 + index * 2, 3 + index * 2), 16);
  const parts = [0, 1, 2].map((index) =>
    Math.round(channel(fill, index) * (1 - share) + channel(color, index) * share)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

/**
 * The CSS drawing of a fill plus pattern: a percentage is the blend Word's
 * dither reads as; stripes and crosses are hatches of the pattern colour.
 * Only whitelisted tokens and `#rrggbb` values reach the returned strings.
 */
export function shadingCss(
  fill: string | null | undefined,
  shading: { pattern?: WordShadingPattern; color?: string } | null | undefined,
): { backgroundColor?: string; backgroundImage?: string } {
  const base = fill ?? null;
  const style = shading?.pattern;
  if (!style || style === "clear") return base ? { backgroundColor: base } : {};
  const color = shading?.color ?? "#000000";
  const share = patternShare(style);
  if (share !== null) return { backgroundColor: mix(base ?? "#ffffff", color, share) };
  const thin = style.startsWith("thin");
  const line = thin ? 1 : 2;
  const gap = thin ? 4 : 6;
  const stripe = (angle: number) =>
    `repeating-linear-gradient(${angle}deg, ${color} 0 ${line}px, transparent ${line}px ${gap}px)`;
  const kind = style.replace(/^thin/, "").replace(/^./, (c) => c.toLowerCase());
  const image =
    kind === "horzStripe"
      ? stripe(0)
      : kind === "vertStripe"
        ? stripe(90)
        : kind === "diagStripe"
          ? stripe(45)
          : kind === "reverseDiagStripe"
            ? stripe(135)
            : kind === "horzCross"
              ? `${stripe(0)}, ${stripe(90)}`
              : `${stripe(45)}, ${stripe(135)}`;
  return { ...(base ? { backgroundColor: base } : {}), backgroundImage: image };
}

/**
 * The pattern layer alone, as one `background-image` value drawn over the
 * element's own background colour (a percentage becomes a flat layer of the
 * blended colour). `null` when there is no pattern.
 */
export function shadingPatternImage(
  fill: string | null | undefined,
  shading: { pattern?: WordShadingPattern; color?: string } | null | undefined,
): string | null {
  if (!shading?.pattern || shading.pattern === "clear") return null;
  const css = shadingCss(fill, shading);
  if (css.backgroundImage) return css.backgroundImage;
  return css.backgroundColor
    ? `linear-gradient(${css.backgroundColor}, ${css.backgroundColor})`
    : null;
}
