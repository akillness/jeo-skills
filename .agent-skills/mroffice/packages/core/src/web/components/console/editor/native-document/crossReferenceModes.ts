/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export type CrossRefKindTargetType =
  | "heading"
  | "figure"
  | "table"
  | "equation"
  | "bookmark"
  | "footnote"
  | "endnote";

export const CROSS_REF_REFERENCE_TO = [
  "text",
  "page",
  "number",
  "numberNoContext",
  "numberFullContext",
  "aboveBelow",
  "labelNumber",
  "captionText",
  "noteNumber",
  "noteNumberFormatted",
] as const;
export type CrossRefReferenceTo = (typeof CROSS_REF_REFERENCE_TO)[number];

const TEXT_TARGET_OPTIONS: readonly CrossRefReferenceTo[] = [
  "text",
  "page",
  "number",
  "numberNoContext",
  "numberFullContext",
  "aboveBelow",
];
/**
 * Word's "Insert reference to" list for a Numbered item, in its order. The
 * reference itself is a bookmark reference (Word bookmarks the paragraph).
 */
export const NUMBERED_ITEM_REFERENCE_OPTIONS: readonly CrossRefReferenceTo[] = [
  "page",
  "number",
  "numberNoContext",
  "numberFullContext",
  "text",
  "aboveBelow",
];
const CAPTION_TARGET_OPTIONS: readonly CrossRefReferenceTo[] = [
  "text",
  "labelNumber",
  "captionText",
  "page",
  "aboveBelow",
];
const NOTE_TARGET_OPTIONS: readonly CrossRefReferenceTo[] = [
  "noteNumber",
  "page",
  "aboveBelow",
  "noteNumberFormatted",
];

export function isCaptionCrossRefTarget(
  targetType: CrossRefKindTargetType,
): targetType is "figure" | "table" | "equation" {
  return (
    targetType === "figure" ||
    targetType === "table" ||
    targetType === "equation"
  );
}

function isNoteTarget(
  targetType: CrossRefKindTargetType,
): targetType is "footnote" | "endnote" {
  return targetType === "footnote" || targetType === "endnote";
}

/** Word's "Insert reference to" list for one reference type, in its order. */
export function crossRefReferenceOptions(
  targetType: CrossRefKindTargetType,
): readonly CrossRefReferenceTo[] {
  if (isCaptionCrossRefTarget(targetType)) return CAPTION_TARGET_OPTIONS;
  if (isNoteTarget(targetType)) return NOTE_TARGET_OPTIONS;
  return TEXT_TARGET_OPTIONS;
}

/** The first entry Word selects for a reference type. */
export function defaultCrossRefReferenceTo(
  targetType: CrossRefKindTargetType,
): CrossRefReferenceTo {
  return crossRefReferenceOptions(targetType)[0];
}

/**
 * Closed normalizer: a value outside the type's list reads as the type's
 * default, so an old node (no attr) keeps its original meaning.
 */
export function normalizeCrossRefReferenceTo(
  value: unknown,
  targetType: CrossRefKindTargetType,
): CrossRefReferenceTo {
  const options = crossRefReferenceOptions(targetType);
  return typeof value === "string" &&
    (options as readonly string[]).includes(value)
    ? (value as CrossRefReferenceTo)
    : options[0];
}

/** Whether Word enables "Include above/below" for this choice. */
export function crossRefAllowsIncludePosition(
  referenceTo: CrossRefReferenceTo,
): boolean {
  return (
    referenceTo === "page" ||
    referenceTo === "number" ||
    referenceTo === "numberNoContext" ||
    referenceTo === "numberFullContext" ||
    referenceTo === "noteNumber" ||
    referenceTo === "noteNumberFormatted"
  );
}

export function normalizeCrossRefIncludePosition(
  value: unknown,
  referenceTo: CrossRefReferenceTo,
): boolean {
  return value === true && crossRefAllowsIncludePosition(referenceTo);
}

/** Which caption bookmark a REF addresses. */
export type CrossRefCaptionPart = "whole" | "label" | "text";

export function crossRefCaptionPart(
  referenceTo: CrossRefReferenceTo,
): CrossRefCaptionPart {
  if (referenceTo === "labelNumber") return "label";
  if (referenceTo === "captionText") return "text";
  return "whole";
}

/** The bookmark name of one caption part (`<anchor>`, `-label`, `-text`). */
export function captionPartBookmarkName(
  anchor: string,
  part: CrossRefCaptionPart,
): string {
  return part === "whole" ? anchor : `${anchor}-${part}`;
}

export interface CrossRefFieldCode {
  instruction: "REF" | "PAGEREF" | "NOTEREF";
  switches: string[];
}

/** The native field Word writes for one cross-reference (see the table). */
export function crossRefFieldCode(
  targetType: CrossRefKindTargetType,
  referenceTo: CrossRefReferenceTo,
  includePosition: boolean,
  hyperlink: boolean,
): CrossRefFieldCode {
  const switches: string[] = [];
  let instruction: CrossRefFieldCode["instruction"] = isNoteTarget(targetType)
    ? "NOTEREF"
    : "REF";
  switch (referenceTo) {
    case "page":
      instruction = "PAGEREF";
      break;
    case "number":
      switches.push("\\r");
      break;
    case "numberNoContext":
      switches.push("\\n");
      break;
    case "numberFullContext":
      switches.push("\\w");
      break;
    case "noteNumberFormatted":
      switches.push("\\f");
      break;
    case "aboveBelow":
      instruction = "REF";
      switches.push("\\p");
      break;
    default:
      break;
  }
  if (
    includePosition &&
    referenceTo !== "aboveBelow" &&
    crossRefAllowsIncludePosition(referenceTo)
  ) {
    switches.push("\\p");
  }
  if (hyperlink) switches.push("\\h");
  return { instruction, switches };
}

/** ` REF name \r \h ` — the instruction text with Word's spacing. */
export function crossRefInstructionText(
  code: CrossRefFieldCode,
  bookmarkName: string,
): string {
  return ` ${[code.instruction, bookmarkName, ...code.switches].join(" ")} `;
}

export interface ParsedCrossRefField {
  instruction: "REF" | "PAGEREF" | "NOTEREF";
  target: string;
  referenceTo: CrossRefReferenceTo;
  includePosition: boolean;
  hyperlink: boolean;
}

/**
 * Read a REF / PAGEREF / NOTEREF instruction back into the dialog model.
 * The target type is not known here (the caller resolves the bookmark), so
 * `referenceTo` is expressed in the vocabulary of the instruction and
 * {@link crossRefReferenceToForTarget} maps it onto the resolved type.
 */
export function parseCrossRefField(instr: string): ParsedCrossRefField | null {
  const tokens = instr.trim().match(/"[^"]*"|\S+/g);
  if (!tokens || tokens.length < 2) return null;
  const head = tokens[0].toUpperCase();
  if (head !== "REF" && head !== "PAGEREF" && head !== "NOTEREF") return null;
  let target = "";
  const flags = new Set<string>();
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith("\\")) {
      flags.add(token.toLowerCase());
      // `\*` / `\#` / `\@` take an argument (e.g. `\* MERGEFORMAT`).
      if (token === "\\*" || token === "\\#" || token === "\\@") index += 1;
      continue;
    }
    if (!target) {
      target =
        token.startsWith('"') && token.endsWith('"')
          ? token.slice(1, -1)
          : token;
    }
  }
  if (!target) return null;
  const position = flags.has("\\p");
  let referenceTo: CrossRefReferenceTo;
  let includePosition = false;
  if (head === "PAGEREF") {
    referenceTo = "page";
    includePosition = position;
  } else if (flags.has("\\r") || flags.has("\\n") || flags.has("\\w")) {
    referenceTo = flags.has("\\w")
      ? "numberFullContext"
      : flags.has("\\n")
        ? "numberNoContext"
        : "number";
    includePosition = position;
  } else if (head === "NOTEREF") {
    referenceTo = flags.has("\\f") ? "noteNumberFormatted" : "noteNumber";
    includePosition = position;
  } else {
    referenceTo = position ? "aboveBelow" : "text";
  }
  return {
    instruction: head,
    target,
    referenceTo,
    includePosition,
    hyperlink: flags.has("\\h"),
  };
}

/**
 * Map a parsed field onto a resolved target type. A number choice on a
 * caption (Word has none) falls back to the entire caption; a text REF to a
 * note marker is its number.
 */
export function crossRefReferenceToForTarget(
  parsed: Pick<ParsedCrossRefField, "referenceTo" | "includePosition">,
  targetType: CrossRefKindTargetType,
  captionPart: CrossRefCaptionPart = "whole",
): { referenceTo: CrossRefReferenceTo; includePosition: boolean } {
  let referenceTo = parsed.referenceTo;
  if (isCaptionCrossRefTarget(targetType) && referenceTo === "text") {
    referenceTo =
      captionPart === "label"
        ? "labelNumber"
        : captionPart === "text"
          ? "captionText"
          : "text";
  }
  if (isNoteTarget(targetType) && referenceTo === "text") {
    referenceTo = "noteNumber";
  }
  const normalized = normalizeCrossRefReferenceTo(referenceTo, targetType);
  return {
    referenceTo: normalized,
    includePosition: normalizeCrossRefIncludePosition(
      parsed.includePosition,
      normalized,
    ),
  };
}

/** Word's own words for a relative position ("above" / "below"). */
export interface CrossRefPositionWords {
  above: string;
  below: string;
  /** "on page {page}". */
  onPage: (page: number | string) => string;
}

export const ENGLISH_CROSS_REF_POSITION_WORDS: CrossRefPositionWords = {
  above: "above",
  below: "below",
  onPage: (page) => `on page ${page}`,
};

/** Everything the renderer needs about the target, already resolved. */
export interface CrossRefTargetFacts {
  /** Heading text / bookmark text / entire caption / note mark. */
  text: string;
  /** Caption "Figure 1" (label and number). */
  labelNumber?: string;
  /** Caption prose after the separator. */
  captionText?: string;
  /** Paragraph number (dotted) or "" when the paragraph is not numbered. */
  number?: string;
  /** The number with every level above it ("1.b"); `number` when absent. */
  numberFullContext?: string;
  /** Structural 1-based page. */
  pageNumber: number;
  /**
   * The page number as the document prints it (its start value and number
   * format, PAGEREF's result); the structural page when absent.
   */
  pageLabel?: string;
  /** Document position of the target. */
  targetPos: number;
}

/**
 * The text a field shows for one choice — Word's field result, computed from
 * the live document. `referencePos`/`referencePage` locate the reference
 * itself (for "above"/"below" and PAGEREF `\p`).
 */
export function crossRefResultText(
  referenceTo: CrossRefReferenceTo,
  includePosition: boolean,
  facts: CrossRefTargetFacts,
  reference: { pos: number; pageNumber: number },
  words: CrossRefPositionWords = ENGLISH_CROSS_REF_POSITION_WORDS,
): string {
  const relative =
    reference.pos < facts.targetPos ? words.below : words.above;
  switch (referenceTo) {
    case "page": {
      // PAGEREF shows the page as the document numbers it (start value,
      
      const page = facts.pageLabel ?? String(facts.pageNumber);
      if (!includePosition) return page;
      return reference.pageNumber === facts.pageNumber
        ? relative
        : words.onPage(page);
    }
    case "number":
    case "numberNoContext":
    case "numberFullContext": {
      // Word shows 0 for a paragraph with no number.
      const number =
        (referenceTo === "numberFullContext" && facts.numberFullContext) ||
        facts.number ||
        "0";
      return includePosition ? `${number} ${relative}` : number;
    }
    case "noteNumber":
    case "noteNumberFormatted":
      return includePosition ? `${facts.text} ${relative}` : facts.text;
    case "aboveBelow":
      return relative;
    case "labelNumber":
      return facts.labelNumber ?? facts.text;
    case "captionText":
      return facts.captionText ?? facts.text;
    case "text":
    default:
      return facts.text;
  }
}
