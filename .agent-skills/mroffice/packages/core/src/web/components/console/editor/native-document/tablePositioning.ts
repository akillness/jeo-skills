/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Strict Word `w:tblpPr` floating-table positioning authority. */

export const TABLE_POSITION_SCHEMA_VERSION = 1 as const;
export const TABLE_POSITION_MAX_TWIPS = 32_767;

export const TABLE_HORIZONTAL_ANCHORS = ["page", "margin", "column"] as const;
export const TABLE_VERTICAL_ANCHORS = ["page", "margin", "text"] as const;
export const TABLE_HORIZONTAL_ALIGNMENTS = [
  "left",
  "center",
  "right",
  "inside",
  "outside",
] as const;
export const TABLE_VERTICAL_ALIGNMENTS = [
  "inline",
  "top",
  "center",
  "bottom",
  "inside",
  "outside",
] as const;

export type TableHorizontalAnchor = (typeof TABLE_HORIZONTAL_ANCHORS)[number];
export type TableVerticalAnchor = (typeof TABLE_VERTICAL_ANCHORS)[number];
export type TableHorizontalAlignment =
  (typeof TABLE_HORIZONTAL_ALIGNMENTS)[number];
export type TableVerticalAlignment = (typeof TABLE_VERTICAL_ALIGNMENTS)[number];

export type TableHorizontalPosition =
  | { mode: "align"; value: TableHorizontalAlignment }
  | { mode: "offset"; twips: number };
export type TableVerticalPosition =
  | { mode: "align"; value: TableVerticalAlignment }
  | { mode: "offset"; twips: number };

export interface TablePositioning {
  readonly schemaVersion: 1;
  readonly horizontalAnchor: TableHorizontalAnchor;
  readonly verticalAnchor: TableVerticalAnchor;
  readonly horizontal: TableHorizontalPosition;
  readonly vertical: TableVerticalPosition;
  readonly distanceFromText: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /**
   * Table Positioning > "Allow overlap" as the Word table states it
   * (`w:tblOverlap`); absent when it states none. Carried so both writers
   * state it again.
   */
  readonly overlap?: "never" | "overlap";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function boundedTwips(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= TABLE_POSITION_MAX_TWIPS
    ? numeric
    : null;
}

/**
 * `w:tblpX` / `w:tblpY` are `ST_SignedTwipsMeasure` (ECMA-376 17.4.63 and
 * 17.4.65): a table nudged left of or above its anchor carries a negative
 * offset, which Word writes routinely. The four `*FromText` distances are the
 * unsigned `ST_TwipsMeasure` and keep {@link boundedTwips}.
 */
function signedTwips(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) &&
    numeric >= -TABLE_POSITION_MAX_TWIPS &&
    numeric <= TABLE_POSITION_MAX_TWIPS
    ? numeric
    : null;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value : null;
}

function horizontalPosition(value: unknown): TableHorizontalPosition | null {
  const source = record(value);
  if (!source || typeof source.mode !== "string") return null;
  if (source.mode === "align" && exactKeys(source, ["mode", "value"])) {
    const alignment = enumValue(source.value, TABLE_HORIZONTAL_ALIGNMENTS);
    return alignment ? { mode: "align", value: alignment } : null;
  }
  if (source.mode === "offset" && exactKeys(source, ["mode", "twips"])) {
    const twips = signedTwips(source.twips);
    return twips === null ? null : { mode: "offset", twips };
  }
  return null;
}

function verticalPosition(value: unknown): TableVerticalPosition | null {
  const source = record(value);
  if (!source || typeof source.mode !== "string") return null;
  if (source.mode === "align" && exactKeys(source, ["mode", "value"])) {
    const alignment = enumValue(source.value, TABLE_VERTICAL_ALIGNMENTS);
    return alignment ? { mode: "align", value: alignment } : null;
  }
  if (source.mode === "offset" && exactKeys(source, ["mode", "twips"])) {
    const twips = signedTwips(source.twips);
    return twips === null ? null : { mode: "offset", twips };
  }
  return null;
}

export function normalizeTablePositioning(
  value: unknown,
): TablePositioning | null {
  const source = record(value);
  const overlap =
    source && "overlap" in source ? source.overlap : undefined;
  if (
    !source ||
    !exactKeys(source, [
      "schemaVersion",
      "horizontalAnchor",
      "verticalAnchor",
      "horizontal",
      "vertical",
      "distanceFromText",
      ...(overlap === undefined ? [] : ["overlap"]),
    ]) ||
    (overlap !== undefined && overlap !== "never" && overlap !== "overlap") ||
    source.schemaVersion !== TABLE_POSITION_SCHEMA_VERSION
  ) {
    return null;
  }
  const horizontalAnchor = enumValue(
    source.horizontalAnchor,
    TABLE_HORIZONTAL_ANCHORS,
  );
  const verticalAnchor = enumValue(
    source.verticalAnchor,
    TABLE_VERTICAL_ANCHORS,
  );
  const horizontal = horizontalPosition(source.horizontal);
  const vertical = verticalPosition(source.vertical);
  const distance = record(source.distanceFromText);
  if (
    !horizontalAnchor ||
    !verticalAnchor ||
    !horizontal ||
    !vertical ||
    !distance ||
    !exactKeys(distance, ["top", "right", "bottom", "left"])
  ) {
    return null;
  }
  const top = boundedTwips(distance.top);
  const right = boundedTwips(distance.right);
  const bottom = boundedTwips(distance.bottom);
  const left = boundedTwips(distance.left);
  if (top === null || right === null || bottom === null || left === null) {
    return null;
  }
  return {
    schemaVersion: 1,
    horizontalAnchor,
    verticalAnchor,
    horizontal,
    vertical,
    distanceFromText: { top, right, bottom, left },
    ...(overlap === "never" || overlap === "overlap" ? { overlap } : {}),
  };
}

export function serializeTablePositioning(value: unknown): string | null {
  const normalized = normalizeTablePositioning(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export type TablePositioningWordAttributes = Readonly<
  Partial<
    Record<
      | "leftFromText"
      | "rightFromText"
      | "topFromText"
      | "bottomFromText"
      | "vertAnchor"
      | "horzAnchor"
      | "tblpXSpec"
      | "tblpX"
      | "tblpYSpec"
      | "tblpY",
      string
    >
  >
>;

export function tablePositioningWordAttributes(
  value: unknown,
): TablePositioningWordAttributes | null {
  const position = normalizeTablePositioning(value);
  if (!position) return null;
  return {
    leftFromText: String(position.distanceFromText.left),
    rightFromText: String(position.distanceFromText.right),
    topFromText: String(position.distanceFromText.top),
    bottomFromText: String(position.distanceFromText.bottom),
    vertAnchor: position.verticalAnchor,
    // ST_HAnchor (ECMA-376 17.18.35) is text | margin | page: the text
    // column this model calls "column" is spelled "text" in the package.
    horzAnchor: position.horizontalAnchor === "column" ? "text" : position.horizontalAnchor,
    ...(position.horizontal.mode === "align"
      ? { tblpXSpec: position.horizontal.value }
      : { tblpX: String(position.horizontal.twips) }),
    ...(position.vertical.mode === "align"
      ? { tblpYSpec: position.vertical.value }
      : { tblpY: String(position.vertical.twips) }),
  };
}

export function tablePositioningFromWordAttributes(
  value: TablePositioningWordAttributes,
): TablePositioning | null {
  if (value.tblpXSpec !== undefined && value.tblpX !== undefined) return null;
  if (value.tblpYSpec !== undefined && value.tblpY !== undefined) return null;
  const horizontal =
    value.tblpXSpec !== undefined
      ? { mode: "align" as const, value: value.tblpXSpec }
      : { mode: "offset" as const, twips: value.tblpX ?? "0" };
  const vertical =
    value.tblpYSpec !== undefined
      ? { mode: "align" as const, value: value.tblpYSpec }
      : { mode: "offset" as const, twips: value.tblpY ?? "0" };
  return normalizeTablePositioning({
    schemaVersion: 1,
    // Word reads an absent horzAnchor as text ([MS-OI29500] 17.4.57 c).
    horizontalAnchor:
      (value.horzAnchor ?? "text") === "text" ? "column" : value.horzAnchor,
    verticalAnchor: value.vertAnchor ?? "margin",
    horizontal,
    vertical,
    distanceFromText: {
      top: value.topFromText ?? "0",
      right: value.rightFromText ?? "0",
      bottom: value.bottomFromText ?? "0",
      left: value.leftFromText ?? "0",
    },
  });
}

export function tablePositioningInlineFloat(
  value: unknown,
): "left" | "right" | null {
  const normalized = normalizeTablePositioning(value);
  if (
    !normalized ||
    normalized.horizontal.mode !== "align" ||
    !["left", "right"].includes(normalized.horizontal.value) ||
    normalized.vertical.mode !== "align" ||
    normalized.vertical.value !== "inline"
  ) {
    return null;
  }
  return normalized.horizontal.value as "left" | "right";
}

/**
 * Whether Word lays the table out in the flow although it carries `w:tblpPr`
 * ([MS-OI29500] 17.4.57 b): `w:tblpX` and `w:tblpY` both 0, the horizontal
 * anchor the text column and the vertical anchor not the text. The receipt
 * is kept for the save; only the layout treats the table as in-line.
 */
export function tablePositioningIgnoredByWord(value: unknown): boolean {
  const normalized = normalizeTablePositioning(value);
  return Boolean(
    normalized &&
      normalized.horizontalAnchor === "column" &&
      normalized.verticalAnchor !== "text" &&
      normalized.horizontal.mode === "offset" &&
      normalized.horizontal.twips === 0 &&
      normalized.vertical.mode === "offset" &&
      normalized.vertical.twips === 0,
  );
}

/**
 * The distance, in px, that a floating table's own `w:tblpX` puts between its
 * anchor's start edge and the table (ECMA-376 17.4.58 / 17.4.63).
 *
 * `null` for an alignment preset (`w:tblpXSpec`, which needs the anchor's whole
 * box) and for the page anchor, which no in-flow box can state. The `margin`
 * and `column` anchors share their start edge with the flow the table sits in,
 * so the offset can be stated as a margin on the table's own box — with one
 * known limitation: in a multi-column section the `margin` anchor is the PAGE
 * margin, and this states it against the column the anchor paragraph is in,
 * which is the same edge only for the first column.
 */
export function tablePositioningAnchorOffsetPx(value: unknown): number | null {
  const normalized = normalizeTablePositioning(value);
  if (
    !normalized ||
    normalized.horizontal.mode !== "offset" ||
    normalized.horizontalAnchor === "page"
  ) {
    return null;
  }
  return normalized.horizontal.twips / 15;
}

/** CSS projection is truthful only for left/right flow-relative presets. */
export function tablePositioningCss(value: unknown): string | null {
  const normalized = normalizeTablePositioning(value);
  const inlineFloat = tablePositioningInlineFloat(normalized);
  if (!normalized || !inlineFloat) return null;
  const distance = normalized.distanceFromText;
  return [
    `float: ${inlineFloat}`,
    "width: fit-content",
    "max-width: 100%",
    `margin: ${distance.top / 15}px ${distance.right / 15}px ${distance.bottom / 15}px ${distance.left / 15}px`,
  ].join("; ");
}
