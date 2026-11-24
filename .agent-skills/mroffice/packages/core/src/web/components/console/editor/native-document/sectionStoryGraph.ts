/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  normalizeStrictBandParagraphBorders,
  normalizeBandRichBlocks,
  isBandFieldToken,
  isBandDatePicture,
  isNativeFieldNumberFormat,
} from "./headerFooter";
import {
  commitNativeStory,
  nativeStoryPaintIsMappable,
  normalizeNativeStoryEdits,
  prepareNativeStoryPaint,
  type NativeStoryCommit,
  type NativeStoryEdits,
} from "./nativeStoryEdits";
import type {
  BandRichBlock,
  BandRichParagraph,
  BandRichRun,
  BandRichTabStop,
  BandFieldToken,
  NativeFieldNumberFormat,
} from "./headerFooter";

export const SECTION_STORY_GRAPH_SCHEMA_VERSION = 1 as const;
export const SECTION_STORY_MAX_SECTIONS = 4096;
export const SECTION_STORY_MAX_STORIES = SECTION_STORY_MAX_SECTIONS * 6;

export const WORD_HEADER_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
export const WORD_FOOTER_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";

export const SECTION_STORY_VARIANTS = ["default", "first", "even"] as const;
export type SectionStoryVariant = (typeof SECTION_STORY_VARIANTS)[number];
export type SectionStoryKind = "header" | "footer";

export interface SectionStoryRef {
  relationshipId: string;
  relationshipType: string;
  targetMode: null;
  storyId: string;
}

export interface OpaquePageNumberFieldAuthority {
  token: BandFieldToken;
  form: "simple" | "complex";
  startByte: number;
  endByte: number;
  sha256: string;
}

export interface NativeStoryTextAuthority {
  structureSha256: string;
  runs: { id: string; blockIndex: number; runIndex: number; text: string; sourceXml: string }[];
  /**
   * Paragraph ends Word lets a user type at although no `w:t` of the part
   * reaches them: a line of nothing but a field result or a tab, a blank line.
   * Typing there has the save insert the run Word would insert, formatted like
   * the character before the caret (else the paragraph mark, ECMA-376
   * 17.3.1.29); clearing it takes that run back out. A story can hold carets
   * and no text slot at all, and a receipt written before carets existed holds
   * none.
   */
  caretSlots?: {
    id: string;
    blockIndex: number;
    runIndex: number;
    paragraphIndex: number;
    /** Where in that paragraph the run goes: its place among the children. */
    childIndex: number;
  }[];
}

export type SectionStoryContent =
  | { mode: "editable"; blocks: BandRichBlock[] }
  | {
      mode: "opaque";
      nativeText: NativeStoryTextAuthority;
      textEdits: Record<string, string>;
      /** Word's own part edited in place beyond its text (see
       * `nativeStoryEdits.ts`); absent while there is none. */
      nativeEdits?: NativeStoryEdits;
    }
  | { mode: "opaque" }
  | {
      mode: "opaque";
      pageNumberFields: OpaquePageNumberFieldAuthority[];
      pageNumberEdit: SectionStoryPageNumberEdit;
    }
  | {
      /** Word's own part whose words are typed in place AND whose page
       * numbers can be removed: both native capabilities of one story. */
      mode: "opaque";
      nativeText: NativeStoryTextAuthority;
      textEdits: Record<string, string>;
      nativeEdits?: NativeStoryEdits;
      pageNumberFields: OpaquePageNumberFieldAuthority[];
      pageNumberEdit: SectionStoryPageNumberEdit;
    }
  | { mode: "sourceClone"; sourceStoryId: string };

export interface SectionStory {
  storyId: string;
  kind: SectionStoryKind;
  partPath: string;
  sourceSha256: string;
  content: SectionStoryContent;
}

export interface SectionStorySection {
  titlePage: boolean;
  headerDefault: SectionStoryRef | null;
  headerFirst: SectionStoryRef | null;
  headerEven: SectionStoryRef | null;
  footerDefault: SectionStoryRef | null;
  footerFirst: SectionStoryRef | null;
  footerEven: SectionStoryRef | null;
}

export interface SectionStoryGraph {
  schemaVersion: typeof SECTION_STORY_GRAPH_SCHEMA_VERSION;
  evenAndOddHeaders: boolean;
  sections: SectionStorySection[];
  stories: SectionStory[];
}

export type SectionStorySlot =
  | "headerDefault"
  | "headerFirst"
  | "headerEven"
  | "footerDefault"
  | "footerFirst"
  | "footerEven";

export const SECTION_STORY_SLOTS: readonly SectionStorySlot[] = [
  "headerDefault",
  "headerFirst",
  "headerEven",
  "footerDefault",
  "footerFirst",
  "footerEven",
];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RELATIONSHIP_ID_RE = /^[A-Za-z_][A-Za-z0-9._-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
// A story's part is named by whatever wrote the package; what makes it a header
// or a footer is its relationship (corpus R283-D13: word/cover-header.xml). The
// server's rule, document_section_story_graph._PART_RE.
const PART_PATH_RE = /^word\/[A-Za-z0-9._-]+\.xml$/;
const MAX_EDITABLE_BLOCKS = 20;
const MAX_EDITABLE_RUNS_PER_PARAGRAPH = 256;
const MAX_EDITABLE_TEXT_CHARS = 50_000;
/**
 * A typed header line's own tab stops, as the part writes them: at most 50,
 * strictly ascending twip positions inside the page, Word's four
 * alignments, the three leaders or none. The server twin checks the same.
 */
function editableTabStopsValid(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
  let last = 0;
  for (const raw of value) {
    if (!isRecord(raw) || !hasExactKeys(raw, ["pos", "align", "leader"])) return false;
    if (
      typeof raw.pos !== "number" ||
      !Number.isSafeInteger(raw.pos) ||
      raw.pos <= last ||
      raw.pos > 31_680 ||
      !["left", "center", "right", "decimal"].includes(raw.align as string) ||
      !["none", "dot", "hyphen", "underscore"].includes(raw.leader as string)
    ) {
      return false;
    }
    last = raw.pos;
  }
  return true;
}

/** An indent in points, whole twips (a twentieth of a point), within a page. */
function editableIndentValid(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1584 &&
    Number.isSafeInteger(Math.round(value * 20)) &&
    Math.abs(value * 20 - Math.round(value * 20)) < 1e-9
  );
}

const EDITABLE_COLOR_RE = /^#[0-9a-f]{6}$/;
const MAX_OPAQUE_PAGE_NUMBER_FIELDS = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function expectedKind(slot: SectionStorySlot): SectionStoryKind {
  return slot.startsWith("header") ? "header" : "footer";
}

function relationshipTypeFor(kind: SectionStoryKind): string {
  return kind === "header"
    ? WORD_HEADER_RELATIONSHIP_TYPE
    : WORD_FOOTER_RELATIONSHIP_TYPE;
}

function normalizeRef(
  value: unknown,
  kind: SectionStoryKind,
): SectionStoryRef | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "relationshipId",
      "relationshipType",
      "targetMode",
      "storyId",
    ]) ||
    typeof value.relationshipId !== "string" ||
    !RELATIONSHIP_ID_RE.test(value.relationshipId) ||
    value.relationshipType !== relationshipTypeFor(kind) ||
    value.targetMode !== null ||
    typeof value.storyId !== "string" ||
    !ID_RE.test(value.storyId)
  ) {
    return undefined;
  }
  return {
    relationshipId: value.relationshipId,
    relationshipType: value.relationshipType,
    targetMode: null,
    storyId: value.storyId,
  };
}

function isXml10Text(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d &&
      !(codePoint >= 0x20 && codePoint <= 0xd7ff) &&
      !(codePoint >= 0xe000 && codePoint <= 0xfffd) &&
      !(codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      return false;
    }
  }
  return true;
}

function normalizeEditableBlocks(value: unknown): BandRichBlock[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_EDITABLE_BLOCKS
  ) {
    return null;
  }
  let textCharacters = 0;
  const blocks: BandRichBlock[] = [];
  for (const rawBlock of value) {
    if (
      !isRecord(rawBlock) ||
      rawBlock.type !== "paragraph" ||
      !Object.keys(rawBlock).every((key) =>
        [
          "type",
          "align",
          "runs",
          "paragraphBorders",
          "tabStops",
          "indentLeftPt",
          "indentRightPt",
          "firstLineIndentPt",
          "docxStyleId",
          "pageNumberBlock",
        ].includes(key),
      ) ||
      (rawBlock.pageNumberBlock !== undefined && rawBlock.pageNumberBlock !== true) ||
      (rawBlock.docxStyleId !== undefined &&
        (typeof rawBlock.docxStyleId !== "string" ||
          !/^[A-Za-z0-9_-]{1,64}$/.test(rawBlock.docxStyleId) ||
          rawBlock.docxStyleId === "Normal")) ||
      (rawBlock.align !== undefined &&
        rawBlock.align !== "center" &&
        rawBlock.align !== "right" &&
        rawBlock.align !== "justify") ||
      !editableTabStopsValid(rawBlock.tabStops) ||
      !editableIndentValid(rawBlock.indentLeftPt) ||
      !editableIndentValid(rawBlock.indentRightPt) ||
      !editableIndentValid(rawBlock.firstLineIndentPt) ||
      // A paragraph with no runs is a blank line -- Word's own empty header
      // is one -- and a story may hold as many as the user types.
      !Array.isArray(rawBlock.runs) ||
      rawBlock.runs.length > MAX_EDITABLE_RUNS_PER_PARAGRAPH
    ) {
      return null;
    }
    const runs: BandRichRun[] = [];
    for (const rawRun of rawBlock.runs) {
      if (!isRecord(rawRun)) return null;
      if (Object.prototype.hasOwnProperty.call(rawRun, "token")) {
        // A page number may carry its own number format (Edit Field >
        // Format, written as the field's \* switch; server twin
        // `_page_field_format`).
        const formatted =
          hasExactKeys(rawRun, ["token", "fieldFormat"]) &&
          (rawRun.token === "PAGE" || rawRun.token === "NUMPAGES") &&
          isNativeFieldNumberFormat(rawRun.fieldFormat) &&
          rawRun.fieldFormat !== "Arabic";
        // A date or time may carry its Date and Time format (the field's \\@
        // switch; server twin `_date_field_picture`).
        const dated =
          hasExactKeys(rawRun, ["token", "datePicture"]) &&
          (rawRun.token === "DATE" || rawRun.token === "TIME") &&
          isBandDatePicture(rawRun.datePicture);
        if (
          !(hasExactKeys(rawRun, ["token"]) || formatted || dated) ||
          !isBandFieldToken(rawRun.token)
        ) {
          return null;
        }
        runs.push(
          formatted
            ? { token: rawRun.token, fieldFormat: rawRun.fieldFormat as NativeFieldNumberFormat }
            : dated
              ? { token: rawRun.token, datePicture: rawRun.datePicture as string }
              : { token: rawRun.token },
        );
        continue;
      }
      if (
        !Object.keys(rawRun).every((key) =>
          ["text", "bold", "italic", "underline", "sizePt", "color"].includes(
            key,
          ),
        ) ||
        typeof rawRun.text !== "string" ||
        rawRun.text.length < 1 ||
        Array.from(rawRun.text).length > 500 ||
        !isXml10Text(rawRun.text)
      ) {
        return null;
      }
      const run: BandRichRun = { text: rawRun.text };
      for (const key of ["bold", "italic", "underline"] as const) {
        if (rawRun[key] !== undefined) {
          if (rawRun[key] !== true) return null;
          run[key] = true;
        }
      }
      if (rawRun.sizePt !== undefined) {
        if (
          typeof rawRun.sizePt !== "number" ||
          !Number.isFinite(rawRun.sizePt) ||
          rawRun.sizePt < 4 ||
          rawRun.sizePt > 96 ||
          !Number.isSafeInteger(rawRun.sizePt * 2)
        ) {
          return null;
        }
        run.sizePt = rawRun.sizePt;
      }
      if (rawRun.color !== undefined) {
        if (
          typeof rawRun.color !== "string" ||
          !EDITABLE_COLOR_RE.test(rawRun.color)
        ) {
          return null;
        }
        run.color = rawRun.color;
      }
      textCharacters += Array.from(rawRun.text).length;
      if (textCharacters > MAX_EDITABLE_TEXT_CHARS) return null;
      runs.push(run);
    }
    const paragraph: BandRichParagraph = { type: "paragraph", runs };
    // A page number the editor placed: Remove Page Numbers takes it away.
    // (Right after the runs, where the band normalizer puts it: the page
    // number commands compare the two readings as JSON.)
    if (rawBlock.pageNumberBlock === true) paragraph.pageNumberBlock = true;
    if (rawBlock.paragraphBorders !== undefined) {
      const borders = normalizeStrictBandParagraphBorders(rawBlock.paragraphBorders);
      if (!borders || Object.values(borders).some((line) =>
        (line.sizePt !== undefined && !Number.isInteger(line.sizePt * 8)) ||
        (line.spacePt !== undefined && !Number.isInteger(line.spacePt)))) return null;
      paragraph.paragraphBorders = borders;
    }
    if (rawBlock.align === "center" || rawBlock.align === "right" || rawBlock.align === "justify") {
      paragraph.align = rawBlock.align;
    }
    if (Array.isArray(rawBlock.tabStops) && rawBlock.tabStops.length) {
      paragraph.tabStops = (rawBlock.tabStops as BandRichTabStop[]).map((stop) => ({ ...stop }));
    }
    for (const key of ["indentLeftPt", "indentRightPt", "firstLineIndentPt"] as const) {
      if (typeof rawBlock[key] === "number") paragraph[key] = rawBlock[key] as number;
    }
    if (typeof rawBlock.docxStyleId === "string") paragraph.docxStyleId = rawBlock.docxStyleId;
    blocks.push(paragraph);
  }
  // Blank lines belong to a story with content; a story of nothing but blank
  // lines is no editable content (the server twin refuses it the same way).
  if (blocks.every((block) => block.type === "paragraph" && !block.runs.length && !block.paragraphBorders)) {
    return null;
  }
  return blocks;
}

function normalizeContent(value: unknown): SectionStoryContent | null {
  if (!isRecord(value) || typeof value.mode !== "string") return null;
  if (value.mode === "opaque" && "nativeEdits" in value) {
    // Edits beyond text ride only on a story typed through its receipt, and
    // are never empty: an untouched story carries no key (server twin).
    const rest = normalizeContent(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "nativeEdits")));
    if (!rest || !("nativeText" in rest)) return null;
    const slotIds = new Set([
      ...rest.nativeText.runs.map((run) => run.id),
      ...(rest.nativeText.caretSlots ?? []).map((caret) => caret.id),
    ]);
    const nativeEdits = normalizeNativeStoryEdits(value.nativeEdits, slotIds);
    if (!nativeEdits) return null;
    return { ...rest, nativeEdits };
  }
  if (value.mode === "editable") {
    if (!hasExactKeys(value, ["mode", "blocks"])) return null;
    const blocks = normalizeEditableBlocks(value.blocks);
    if (!blocks) return null;
    return { mode: "editable", blocks };
  }
  if (value.mode === "opaque") {
    if (hasExactKeys(value, ["mode", "nativeText", "textEdits", "pageNumberFields", "pageNumberEdit"])) {
      const text = normalizeContent({ mode: "opaque", nativeText: value.nativeText, textEdits: value.textEdits });
      const fields = normalizeContent({ mode: "opaque", pageNumberFields: value.pageNumberFields, pageNumberEdit: value.pageNumberEdit });
      if (!text || !fields || !("nativeText" in text) || !("pageNumberFields" in fields)) return null;
      return { ...text, pageNumberFields: fields.pageNumberFields, pageNumberEdit: fields.pageNumberEdit };
    }
    if (hasExactKeys(value, ["mode", "nativeText", "textEdits"])) {
      const raw = value.nativeText;
      const withCarets = isRecord(raw) && hasExactKeys(raw, ["structureSha256", "runs", "caretSlots"]);
      const rawCarets = withCarets ? raw.caretSlots : [];
      if (!isRecord(raw) || !(withCarets || hasExactKeys(raw, ["structureSha256", "runs"])) ||
          typeof raw.structureSha256 !== "string" || !SHA256_RE.test(raw.structureSha256) ||
          !Array.isArray(raw.runs) || !Array.isArray(rawCarets) ||
          raw.runs.length + rawCarets.length < 1 || raw.runs.length + rawCarets.length > 5120 ||
          !isRecord(value.textEdits)) return null;
      const runs: NativeStoryTextAuthority["runs"] = [];
      const ids = new Set<string>();
      let previous = -1;
      let characters = 0;
      let sourceBytes = 0;
      const encoder = new TextEncoder();
      const validText = (text: unknown): text is string => typeof text === "string" && Array.from(text).length <= 500 && isXml10Text(text) && !/[\r\n\t]/.test(text);
      for (const run of raw.runs) {
        if (!isRecord(run) || !hasExactKeys(run, ["id", "blockIndex", "runIndex", "text", "sourceXml"]) ||
            typeof run.blockIndex !== "number" || !Number.isInteger(run.blockIndex) || run.blockIndex < 0 || run.blockIndex >= 20 ||
            typeof run.runIndex !== "number" || !Number.isInteger(run.runIndex) || run.runIndex < 0 || run.runIndex >= 256 ||
            run.id !== `p${run.blockIndex}:r${run.runIndex}` || run.blockIndex * 256 + run.runIndex <= previous ||
            !validText(run.text) || typeof run.sourceXml !== "string" || Array.from(run.sourceXml).length > 8192 || !isXml10Text(run.sourceXml)) return null;
        sourceBytes += encoder.encode(run.sourceXml).byteLength;
        if (sourceBytes > 2000000) return null;
        const id = run.id as string;
        previous = run.blockIndex * 256 + run.runIndex;
        ids.add(id);
        characters += Array.from(run.text).length;
        runs.push({ id, blockIndex: run.blockIndex, runIndex: run.runIndex, text: run.text, sourceXml: run.sourceXml });
      }
      const carets: NonNullable<NativeStoryTextAuthority["caretSlots"]> = [];
      for (const caret of rawCarets) {
        if (!isRecord(caret) || !hasExactKeys(caret, ["id", "blockIndex", "runIndex", "paragraphIndex", "childIndex"]) ||
            typeof caret.blockIndex !== "number" || !Number.isInteger(caret.blockIndex) || caret.blockIndex < 0 || caret.blockIndex >= 20 ||
            typeof caret.runIndex !== "number" || !Number.isInteger(caret.runIndex) || caret.runIndex < 0 || caret.runIndex >= 256 ||
            typeof caret.paragraphIndex !== "number" || !Number.isInteger(caret.paragraphIndex) ||
            caret.paragraphIndex < 0 || caret.paragraphIndex >= 256 ||
            typeof caret.childIndex !== "number" || !Number.isInteger(caret.childIndex) ||
            caret.childIndex < 0 || caret.childIndex >= 4096 ||
            caret.id !== `p${caret.blockIndex}:r${caret.runIndex}` || ids.has(caret.id as string)) return null;
        ids.add(caret.id as string);
        carets.push({
          id: caret.id as string, blockIndex: caret.blockIndex, runIndex: caret.runIndex,
          paragraphIndex: caret.paragraphIndex, childIndex: caret.childIndex,
        });
      }
      const textEdits: Record<string, string> = {};
      for (const [id, text] of Object.entries(value.textEdits)) {
        if (!ids.has(id) || !validText(text)) return null;
        textEdits[id] = text;
        characters += Array.from(text).length;
      }
      if (characters > 100000) return null;
      return {
        mode: "opaque",
        nativeText: {
          structureSha256: raw.structureSha256,
          runs,
          ...(withCarets ? { caretSlots: carets } : {}),
        },
        textEdits,
      };
    }
    if (hasExactKeys(value, ["mode"])) return { mode: "opaque" };
    if (
      !hasExactKeys(value, ["mode", "pageNumberFields", "pageNumberEdit"]) ||
      !Array.isArray(value.pageNumberFields) ||
      value.pageNumberFields.length < 1 ||
      value.pageNumberFields.length > MAX_OPAQUE_PAGE_NUMBER_FIELDS ||
      (value.pageNumberEdit !== "preserve" &&
        value.pageNumberEdit !== "remove" &&
        value.pageNumberEdit !== "removeBlocks")
    ) {
      return null;
    }
    const fields: OpaquePageNumberFieldAuthority[] = [];
    let previousEnd = -1;
    for (const rawField of value.pageNumberFields) {
      if (
        !isRecord(rawField) ||
        !hasExactKeys(rawField, [
          "token",
          "form",
          "startByte",
          "endByte",
          "sha256",
        ]) ||
        !isBandFieldToken(rawField.token) ||
        (rawField.form !== "simple" && rawField.form !== "complex") ||
        !Number.isInteger(rawField.startByte) ||
        !Number.isInteger(rawField.endByte) ||
        (rawField.startByte as number) < 0 ||
        (rawField.endByte as number) <= (rawField.startByte as number) ||
        (rawField.endByte as number) > 2_000_000 ||
        (rawField.startByte as number) < previousEnd ||
        typeof rawField.sha256 !== "string" ||
        !SHA256_RE.test(rawField.sha256)
      ) {
        return null;
      }
      const field: OpaquePageNumberFieldAuthority = {
        token: rawField.token,
        form: rawField.form,
        startByte: rawField.startByte as number,
        endByte: rawField.endByte as number,
        sha256: rawField.sha256,
      };
      fields.push(field);
      previousEnd = field.endByte;
    }
    return {
      mode: "opaque",
      pageNumberFields: fields,
      pageNumberEdit: value.pageNumberEdit,
    };
  }
  if (
    value.mode === "sourceClone" &&
    hasExactKeys(value, ["mode", "sourceStoryId"]) &&
    typeof value.sourceStoryId === "string" &&
    ID_RE.test(value.sourceStoryId)
  ) {
    return { mode: "sourceClone", sourceStoryId: value.sourceStoryId };
  }
  return null;
}

function normalizeStory(value: unknown): SectionStory | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "storyId",
      "kind",
      "partPath",
      "sourceSha256",
      "content",
    ]) ||
    typeof value.storyId !== "string" ||
    !ID_RE.test(value.storyId) ||
    (value.kind !== "header" && value.kind !== "footer") ||
    typeof value.partPath !== "string" ||
    !PART_PATH_RE.test(value.partPath) ||
    typeof value.sourceSha256 !== "string" ||
    !SHA256_RE.test(value.sourceSha256)
  ) {
    return null;
  }
  const content = normalizeContent(value.content);
  if (!content) return null;
  return {
    storyId: value.storyId,
    kind: value.kind,
    partPath: value.partPath,
    sourceSha256: value.sourceSha256,
    content,
  };
}

/**
 * Strictly authenticate the persisted section-story identity graph.
 *
 * This function deliberately does not sanitize malformed values. Relationship
 * and part identities are native-package authority; changing one while loading
 * would turn a forged/stale graph into an apparently valid save target.
 */
export function normalizeSectionStoryGraph(
  value: unknown,
  expectedSectionCount?: number,
): SectionStoryGraph | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "evenAndOddHeaders",
      "sections",
      "stories",
    ]) ||
    value.schemaVersion !== SECTION_STORY_GRAPH_SCHEMA_VERSION ||
    typeof value.evenAndOddHeaders !== "boolean" ||
    !Array.isArray(value.sections) ||
    value.sections.length < 1 ||
    value.sections.length > SECTION_STORY_MAX_SECTIONS ||
    (expectedSectionCount !== undefined &&
      value.sections.length !== expectedSectionCount) ||
    !Array.isArray(value.stories) ||
    value.stories.length > SECTION_STORY_MAX_STORIES
  ) {
    return null;
  }

  const stories: SectionStory[] = [];
  const storyById = new Map<string, SectionStory>();
  const storyByPart = new Map<string, SectionStory>();
  for (const raw of value.stories) {
    const story = normalizeStory(raw);
    if (
      !story ||
      storyById.has(story.storyId) ||
      storyByPart.has(story.partPath)
    ) {
      return null;
    }
    stories.push(story);
    storyById.set(story.storyId, story);
    storyByPart.set(story.partPath, story);
  }

  const relationshipTargets = new Map<string, string>();
  const sections: SectionStorySection[] = [];
  for (const raw of value.sections) {
    if (
      !isRecord(raw) ||
      !hasExactKeys(raw, ["titlePage", ...SECTION_STORY_SLOTS]) ||
      typeof raw.titlePage !== "boolean"
    ) {
      return null;
    }
    const section = { titlePage: raw.titlePage } as SectionStorySection;
    for (const slot of SECTION_STORY_SLOTS) {
      const kind = expectedKind(slot);
      const ref = normalizeRef(raw[slot], kind);
      if (ref === undefined) return null;
      if (ref !== null) {
        const story = storyById.get(ref.storyId);
        if (!story || story.kind !== kind) return null;
        const existing = relationshipTargets.get(ref.relationshipId);
        if (existing !== undefined && existing !== ref.storyId) return null;
        relationshipTargets.set(ref.relationshipId, ref.storyId);
      }
      section[slot] = ref;
    }
    sections.push(section);
  }

  for (const story of stories) {
    if (story.content.mode !== "sourceClone") continue;
    const source = storyById.get(story.content.sourceStoryId);
    if (
      !source ||
      source.kind !== story.kind ||
      source.storyId === story.storyId ||
      source.sourceSha256 !== story.sourceSha256
    ) {
      return null;
    }
    const visited = new Set([story.storyId]);
    let cursor: SectionStory = source;
    while (cursor.content.mode === "sourceClone") {
      if (visited.has(cursor.storyId)) return null;
      visited.add(cursor.storyId);
      const next = storyById.get(cursor.content.sourceStoryId);
      if (!next || next.kind !== story.kind) return null;
      cursor = next;
    }
  }

  const reachableStoryIds = new Set<string>();
  const pendingStoryIds = sections.flatMap((section) =>
    SECTION_STORY_SLOTS.flatMap((slot) => {
      const ref = section[slot];
      return ref ? [ref.storyId] : [];
    }),
  );
  while (pendingStoryIds.length > 0) {
    const storyId = pendingStoryIds.pop()!;
    if (reachableStoryIds.has(storyId)) continue;
    const story = storyById.get(storyId);
    if (!story) return null;
    reachableStoryIds.add(storyId);
    if (story.content.mode === "sourceClone") {
      pendingStoryIds.push(story.content.sourceStoryId);
    }
  }
  if (reachableStoryIds.size !== stories.length) return null;

  return {
    schemaVersion: SECTION_STORY_GRAPH_SCHEMA_VERSION,
    evenAndOddHeaders: value.evenAndOddHeaders,
    sections,
    stories,
  };
}

export function sectionStorySlot(
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): SectionStorySlot {
  return `${kind}${variant[0].toUpperCase()}${variant.slice(1)}` as SectionStorySlot;
}

/** Resolve Word's omitted-reference inheritance for one section and variant. */
export function resolveEffectiveSectionStoryRef(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): SectionStoryRef | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    sectionIndex < 0 ||
    sectionIndex >= normalized.sections.length
  ) {
    return null;
  }
  const slot = sectionStorySlot(kind, variant);
  for (let index = sectionIndex; index >= 0; index -= 1) {
    const ref = normalized.sections[index][slot];
    if (ref !== null) return ref;
  }
  return null;
}

/**
 * The band with every native slot's text taken out (collected into `texts`),
 * or null when a slot is named twice or on a field chip. Two bands with the
 * same shape differ only in slot text; a table cell's `text`/`runs` are its
 * paragraphs flattened, so its paragraphs carry the comparison.
 */
function nativeTextSlotShape(blocks: readonly BandRichBlock[], texts: Map<string, string>): string | null {
  let valid = true;
  const strip = (runs: readonly BandRichRun[]) => runs.map((run) => {
    if (run.nativeTextId === undefined) return run;
    if (run.token || typeof run.text !== "string" || texts.has(run.nativeTextId)) valid = false;
    else texts.set(run.nativeTextId, run.text);
    const shape: BandRichRun = { ...run };
    delete shape.text;
    return shape;
  });
  const shape = blocks.map((block) => block.type === "paragraph"
    ? { ...block, runs: strip(block.runs) }
    : {
        ...block,
        cells: block.cells.map((cell) => {
          if (!cell.paragraphs?.length) return cell;
          const rest: Partial<typeof cell> = { ...cell };
          delete rest.text;
          delete rest.runs;
          return { ...rest, paragraphs: cell.paragraphs.map((paragraph) => ({ ...paragraph, runs: strip(paragraph.runs) })) };
        }),
      });
  return valid ? JSON.stringify(shape) : null;
}

/**
 * How the band editor may change one section's header/footer variant:
 * `full` for a story MRAI owns (or none yet: typing creates one), `text` for
 * Word's own part edited through its native text slots only, `none` for a
 * part whose text cannot be addressed. The editor shows `none` read-only
 * before anyone types, so no typing is ever accepted and then dropped.
 */
export type SectionStoryBandEditMode = "full" | "text" | "none";

export function sectionStoryBandEditMode(
  graph: unknown,
  sectionCount: number | undefined,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  /** The band the canvas draws for this slot (see `isBlankNativeStory`). */
  paint?: readonly BandRichBlock[] | null,
): SectionStoryBandEditMode {
  if (graph === null || graph === undefined) return "full";
  const normalized = normalizeSectionStoryGraph(graph, sectionCount);
  if (!normalized || sectionIndex < 0 || sectionIndex >= normalized.sections.length) return "none";
  const ref = resolveEffectiveSectionStoryRef(normalized, sectionIndex, kind, variant);
  if (!ref) return "full";
  const story = normalized.stories.find((candidate) => candidate.storyId === ref.storyId);
  if (!story) return "none";
  if (story.content.mode !== "opaque") return "full";
  if (isBlankNativeStory(story, paint)) return "full";
  if (!("nativeText" in story.content)) return "none";
  // Word's own part opens in the story editor when every line the band draws
  // names its paragraph of the part; otherwise its words are typed in place.
  return nativeStoryPaintIsMappable(paint, Boolean(story.content.nativeEdits)) && !pageNumbersRemoved(story.content)
    ? "full"
    : "text";
}

function pageNumbersRemoved(content: SectionStoryContent): boolean {
  return "pageNumberEdit" in content && content.pageNumberEdit !== "preserve";
}

function effectiveStory(
  graph: unknown,
  sectionCount: number | undefined,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): { normalized: SectionStoryGraph; story: SectionStory } | null {
  if (graph === null || graph === undefined) return null;
  const normalized = normalizeSectionStoryGraph(graph, sectionCount);
  if (!normalized || sectionIndex < 0 || sectionIndex >= normalized.sections.length) return null;
  const ref = resolveEffectiveSectionStoryRef(normalized, sectionIndex, kind, variant);
  const story = ref ? normalized.stories.find((candidate) => candidate.storyId === ref.storyId) : undefined;
  return story ? { normalized, story } : null;
}

/** Word's own story the story editor opens in place (not a blank part). */
function isNativeEditableStory(story: SectionStory, paint: readonly BandRichBlock[] | null | undefined): boolean {
  return (
    story.content.mode === "opaque" &&
    "nativeText" in story.content &&
    !pageNumbersRemoved(story.content) &&
    !isBlankNativeStory(story, paint) &&
    nativeStoryPaintIsMappable(paint, Boolean(story.content.nativeEdits))
  );
}

/**
 * What committing `blocks` to a native story opened in place would write:
 * its new text and native edits and the band to paint, or the reason the
 * part cannot be edited that way. Null when the slot is not such a story.
 */
export function sectionStoryNativeCommit(
  graph: unknown,
  sectionCount: number | undefined,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  blocks: readonly BandRichBlock[],
  previousBlocks: readonly BandRichBlock[] | null | undefined,
): NativeStoryCommit | null {
  const found = effectiveStory(graph, sectionCount, sectionIndex, kind, variant);
  // A story of an imported package is written back as a part of its own,
  // whose list items would have to point into the package's numbering
  // definitions: a list made in one is said by name instead of the save
  // dropping it (Word's own part keeps the lists it has, below).
  const listed = blocks.some((block) =>
    block.type === "paragraph"
      ? block.list !== undefined
      : block.cells.some((cell) => cell.paragraphs?.some((paragraph) => paragraph.list !== undefined)),
  );
  // SECTIONPAGES, STYLEREF and DOCPROPERTY are written into Word's own part
  // only; a band MRAI writes from lines holds the band's own fields.
  const newField = blocks.some((block) =>
    block.type === "paragraph"
      ? block.runs.some((run) => run.nativeNewField !== undefined)
      : block.cells.some((cell) => cell.paragraphs?.some((paragraph) => paragraph.runs.some((run) => run.nativeNewField !== undefined))),
  );
  if (!found) {
    if (newField) return { ok: false, refusal: "native_story_edit_new_field_unsupported" };
    return listed && normalizeSectionStoryGraph(graph, sectionCount)
      ? { ok: false, refusal: "native_story_edit_list_changed" }
      : null;
  }
  if (!previousBlocks) return null;
  if (found.story.content.mode === "editable" || isBlankNativeStory(found.story, previousBlocks)) {
    if (listed) return { ok: false, refusal: "native_story_edit_list_changed" };
    if (newField) return { ok: false, refusal: "native_story_edit_new_field_unsupported" };
    // Word's part written back from lines: it holds no spacing of its own
    // (the paragraph's style gives it), so a changed line spacing or space
    // before/after cannot be saved into it. Said by name instead of the edit
    // being dropped whole.
    const saved = withoutStoryStyleDisplay(blocks, previousBlocks);
    if (normalizeEditableBlocks(saved) !== null) return null;
    const withoutSpacing = saved.map((block) => {
      if (block.type !== "paragraph") return block;
      const out: Record<string, unknown> = { ...block };
      for (const key of STYLE_DISPLAY_KEYS) delete out[key];
      return out as unknown as BandRichParagraph;
    });
    return normalizeEditableBlocks(withoutSpacing) !== null
      ? { ok: false, refusal: "native_story_edit_unsupported_paragraph_property" }
      : null;
  }
  if (!isNativeEditableStory(found.story, previousBlocks)) return null;
  const content = found.story.content as Extract<SectionStoryContent, { nativeText: NativeStoryTextAuthority }>;
  return commitNativeStory(content.nativeText, content.textEdits, content.nativeEdits ?? null, previousBlocks, blocks);
}

/**
 * A Word part with nothing in it -- the empty header or footer Word writes for
 * every section -- read through its text slots: no text slot, no page-number
 * field, and a band that draws nothing but the empty lines a caret can stand
 * on. Typing into it is Word rewriting the part, so it opens in the full story
 * editor and its first commit replaces it with editable content. The server
 * checks the part's own bytes before it allows that.
 */
export function isBlankNativeStory(
  story: SectionStory,
  paint: readonly BandRichBlock[] | null | undefined,
): boolean {
  const content = story.content;
  if (content.mode !== "opaque" || !("nativeText" in content) || "pageNumberFields" in content) return false;
  if (content.nativeText.runs.length || Object.keys(content.textEdits).length) return false;
  const shown = paint?.length ? paint : blankStoryCaretPaint(story);
  if (!shown?.length) return false;
  return shown.every(
    (block) =>
      block.type === "paragraph" &&
      !block.images?.length &&
      !block.paragraphBorders &&
      !block.frames?.length &&
      !block.shapes?.length &&
      !block.wordArt?.length &&
      block.runs.every((run) => !run.token && !run.text && run.nativeTextId !== undefined),
  );
}










export function blankStoryCaretPaint(story: SectionStory): BandRichBlock[] | null {
  const content = story.content;
  if (content.mode !== "opaque" || !("nativeText" in content) || "pageNumberFields" in content) return null;
  if (content.nativeText.runs.length || Object.keys(content.textEdits).length) return null;
  const carets = content.nativeText.caretSlots ?? [];
  if (!carets.length) return null;
  const lines = new Map<number, BandRichBlock>();
  for (const caret of carets) {
    if (lines.has(caret.paragraphIndex)) continue;
    lines.set(caret.paragraphIndex, { type: "paragraph", runs: [{ text: "", nativeTextId: caret.id }] });
  }
  return [...lines.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
}

/**
 * What the painted band of a Word header reads from the paragraph's style and
 * an editable story's save leaves to that style (its part writes no spacing
 * or line of its own): the spacing around the line and Word's line inputs.
 */
const STYLE_DISPLAY_KEYS = [
  "spaceBeforePt",
  "spaceAfterPt",
  "contextualSpacing",
  "lineHeight",
  "lineHeightPt",
  "lineHeightRule",
  "lineSizePt",
  "lineFont",
] as const;

/** The style values the paint shows for a line of this paragraph style. */
function paintStyleDisplay(
  paint: readonly BandRichBlock[] | null | undefined,
  styleId: string | undefined,
): Partial<BandRichParagraph> {
  const source = paint?.find(
    (block): block is BandRichParagraph =>
      block.type === "paragraph" && (block.docxStyleId ?? null) === (styleId ?? null),
  );
  const out: Partial<BandRichParagraph> = {};
  if (!source) return out;
  for (const key of STYLE_DISPLAY_KEYS) {
    if (source[key] !== undefined) (out as Record<string, unknown>)[key] = source[key];
  }
  return out;
}

/**
 * An editable story's lines as the page draws them: each line takes the
 * spacing and line its style gives it in the painted band, so the header or
 * footer opens where it is drawn instead of moving by that spacing. The save
 * leaves them to the style again (`withoutStoryStyleDisplay`).
 */
function withStoryStyleDisplay(
  blocks: readonly BandRichBlock[],
  paint: readonly BandRichBlock[] | null | undefined,
): BandRichBlock[] {
  return blocks.map((block) => {
    if (block.type !== "paragraph") return block;
    const display = paintStyleDisplay(paint, block.docxStyleId);
    const out: Record<string, unknown> = { ...block };
    for (const [key, value] of Object.entries(display)) {
      if (out[key] === undefined) out[key] = value;
    }
    return out as unknown as BandRichParagraph;
  });
}

/** The inverse of {@link withStoryStyleDisplay}: a value that is still the
 * style's goes back to the style. A changed one stays, and the editable
 * story's save refuses it as before. */
function withoutStoryStyleDisplay(
  blocks: readonly BandRichBlock[],
  paint: readonly BandRichBlock[] | null | undefined,
): BandRichBlock[] {
  return blocks.map((block) => {
    if (block.type !== "paragraph") return block;
    const display = paintStyleDisplay(paint, block.docxStyleId) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...block };
    for (const key of STYLE_DISPLAY_KEYS) {
      if (out[key] !== undefined && JSON.stringify(out[key]) === JSON.stringify(display[key])) delete out[key];
    }
    return out as unknown as BandRichParagraph;
  });
}

/** A blank native story as the island opens it: its empty lines, each keeping
 * the paragraph style and alignment Word gave it, with no caret slots. */
export function blankNativeStoryBlocks(paint: readonly BandRichBlock[]): BandRichBlock[] {
  return paint.map((block) => {
    const paragraph = block as BandRichParagraph;
    return {
      type: "paragraph",
      runs: [],
      ...(paragraph.docxStyleId ? { docxStyleId: paragraph.docxStyleId } : {}),
      ...(paragraph.align ? { align: paragraph.align } : {}),
    };
  });
}

/**
 * The blocks an editable native story holds -- what a save writes into its
 * part -- following a clone to the story it copies. The painted band of an
 * imported document is a reading of the part for display (a server upload
 * draws a tab as a space and a non-page field as its cached text), so an
 * editor opens an editable story from these blocks, never from the paint.
 * Null for an opaque story or when the slot has no story.
 */
export function sectionStoryEditableBlocks(
  graph: unknown,
  sectionCount: number | undefined,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  paint?: readonly BandRichBlock[] | null,
): BandRichBlock[] | null {
  if (graph === null || graph === undefined) return null;
  const normalized = normalizeSectionStoryGraph(graph, sectionCount);
  if (!normalized || sectionIndex < 0 || sectionIndex >= normalized.sections.length) return null;
  const ref = resolveEffectiveSectionStoryRef(normalized, sectionIndex, kind, variant);
  if (!ref) return null;
  const stories = new Map(normalized.stories.map((story) => [story.storyId, story]));
  const seen = new Set<string>();
  let story = stories.get(ref.storyId);
  while (story?.content.mode === "sourceClone") {
    if (seen.has(story.storyId)) return null;
    seen.add(story.storyId);
    story = stories.get(story.content.sourceStoryId);
  }
  const blankPaint = story && !paint?.length ? blankStoryCaretPaint(story) : null;
  if (story && blankPaint && isBlankNativeStory(story, blankPaint)) {
    return withStoryStyleDisplay(blankNativeStoryBlocks(blankPaint), blankPaint);
  }
  if (story && paint && isBlankNativeStory(story, paint)) {
    return withStoryStyleDisplay(blankNativeStoryBlocks(paint), paint);
  }
  if (story && paint && isNativeEditableStory(story, paint)) {
    // Word's own part opens as the band it paints, with each piece of Word's
    // content that is not typable text named, so the editor keeps it as is.
    return prepareNativeStoryPaint(paint, "nativeEdits" in story.content && Boolean(story.content.nativeEdits));
  }
  return story?.content.mode === "editable" ? withStoryStyleDisplay(story.content.blocks, paint) : null;
}

/**
 * Replace one authenticated native story's bounded editable content.
 *
 * A linked section resolves to the same native part as its predecessor, so an
 * edit updates that shared story without forging a new relationship. Breaking
 * inheritance remains the explicit Link to Previous command. Opaque stories
 * and variants without an authenticated effective reference fail closed.
 */
export function setSectionStoryEditableContent(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  blocks: BandRichBlock[],
  previousBlocks?: BandRichBlock[],
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= normalized.sections.length ||
    (kind !== "header" && kind !== "footer") ||
    !SECTION_STORY_VARIANTS.includes(variant)
  ) {
    return null;
  }
  const normalizedBlocks = normalizeEditableBlocks(withoutStoryStyleDisplay(blocks, previousBlocks));
  const ref = resolveEffectiveSectionStoryRef(
    normalized,
    sectionIndex,
    kind,
    variant,
  );
  if (!ref) return null;
  const story = normalized.stories.find(
    (candidate) => candidate.storyId === ref.storyId,
  );
  if (!story) return null;
  if (normalizedBlocks && isBlankNativeStory(story, previousBlocks)) {
    // Word's empty part, typed into: it becomes the typed story (the server
    // allows this only for a part whose own bytes are blank).
    return normalizeSectionStoryGraph({
      ...normalized,
      stories: normalized.stories.map((candidate) =>
        candidate.storyId === story.storyId
          ? { ...candidate, content: { mode: "editable", blocks: normalizedBlocks } }
          : candidate,
      ),
    });
  }
  if (previousBlocks && isNativeEditableStory(story, previousBlocks)) {
    // Word's own part edited in the story editor: what changed becomes edits
    // written into the part (or the commit is refused, and nothing changes).
    const content = story.content as Extract<SectionStoryContent, { nativeText: NativeStoryTextAuthority }>;
    const committed = commitNativeStory(
      content.nativeText, content.textEdits, content.nativeEdits ?? null, previousBlocks, blocks,
    );
    if (!committed.ok) return null;
    const next: Record<string, unknown> = { ...content, textEdits: committed.textEdits };
    delete next.nativeEdits;
    if (committed.nativeEdits) next.nativeEdits = committed.nativeEdits;
    return normalizeSectionStoryGraph({
      ...normalized,
      stories: normalized.stories.map((candidate) =>
        candidate.storyId === story.storyId ? { ...candidate, content: next } : candidate),
    });
  }
  if (story.content.mode === "opaque" && "nativeText" in story.content) {
    // Word's own part, typed in place: the typed story must be the shown story
    // with only slot text changed (paragraph runs, table-cell paragraphs and
    // text-box runs alike), and every other byte stays Word's.
    const rich = normalizeBandRichBlocks(blocks);
    const before = normalizeBandRichBlocks(previousBlocks);
    if (!rich || !before) return null;
    const requested = new Map<string, string>();
    const shown = new Map<string, string>();
    const typedShape = nativeTextSlotShape(rich, requested);
    if (typedShape === null || typedShape !== nativeTextSlotShape(before, shown)) return null;
    // A caret slot holds no text yet: the band draws it as an empty run, and
    // typing into it has the save insert the run Word would insert.
    const slots = new Map<string, { id: string; text: string }>([
      ...story.content.nativeText.runs.map((slot) => [slot.id, slot] as const),
      ...(story.content.nativeText.caretSlots ?? []).map((slot) => [slot.id, { id: slot.id, text: "" }] as const),
    ]);
    const current = story.content.textEdits;
    const textEdits: Record<string, string> = { ...current };
    for (const [id, text] of requested) {
      const slot = slots.get(id);
      if (!slot || shown.get(id) !== (current[id] ?? slot.text)) return null;
      if (text === slot.text) delete textEdits[id];
      else textEdits[id] = text;
    }
    return normalizeSectionStoryGraph({ ...normalized, stories: normalized.stories.map((candidate) =>
      candidate.storyId === story.storyId ? { ...candidate, content: { ...story.content, textEdits } } : candidate),
    });
  }
  if (!normalizedBlocks || story.content.mode === "opaque") return null;
  const result: SectionStoryGraph = {
    ...normalized,
    stories: normalized.stories.map((candidate) =>
      candidate.storyId === ref.storyId
        ? {
            ...candidate,
            content: { mode: "editable", blocks: normalizedBlocks },
          }
        : candidate,
    ),
  };
  return normalizeSectionStoryGraph(result);
}

/**
 * How a story's page numbers are taken away: `remove` every authenticated
 * page-number field (the reading before Word's blocks were known),
 * `removeBlocks` Word's Remove Page Numbers -- only the page-number building
 * blocks (the "Page Numbers" gallery's content controls), whole; a PAGE
 * field outside one, or a framed legacy number, stays.
 */
export type SectionStoryPageNumberEdit = "preserve" | "remove" | "removeBlocks";

/** Request an authenticated raw-field removal without flattening opaque XML. */
export function removeOpaqueSectionStoryPageNumbers(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  edit: Exclude<SectionStoryPageNumberEdit, "preserve"> = "remove",
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  const ref = normalized
    ? resolveEffectiveSectionStoryRef(normalized, sectionIndex, kind, variant)
    : null;
  if (!normalized || !ref) return null;
  const target = normalized.stories.find(
    (story) => story.storyId === ref.storyId,
  );
  if (
    !target ||
    target.content.mode !== "opaque" ||
    !("pageNumberFields" in target.content) ||
    target.content.pageNumberEdit !== "preserve" ||
    // A part already edited in place keeps its fields: removing them is a
    // second rewrite of the same bytes the save does not combine.
    ("nativeEdits" in target.content && target.content.nativeEdits)
  ) {
    return null;
  }
  return normalizeSectionStoryGraph({
    ...normalized,
    stories: normalized.stories.map((story) =>
      story.storyId === target.storyId
        ? {
            ...story,
            content: {
              ...target.content,
              pageNumberEdit: edit,
            },
          }
        : story,
    ),
  });
}

function cloneSectionStoryRef(
  normalized: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  sourceRef: SectionStoryRef,
): SectionStoryGraph | null {
  const source = normalized.stories.find(
    (story) => story.storyId === sourceRef.storyId,
  );
  if (!source || source.kind !== kind) return null;
  const { storyId, partPath, relationshipId } = firstFreeStoryIdentity(
    normalized,
    stableToken(`${source.storyId}:${sectionIndex}:${kind}:${variant}`),
    kind,
  );

  const slot = sectionStorySlot(kind, variant);
  return normalizeSectionStoryGraph({
    ...normalized,
    sections: normalized.sections.map((section, index) =>
      index === sectionIndex
        ? {
            ...section,
            [slot]: {
              relationshipId,
              relationshipType: relationshipTypeFor(kind),
              targetMode: null,
              storyId,
            },
          }
        : section,
    ),
    stories: [
      ...normalized.stories,
      {
        storyId,
        kind,
        partPath,
        sourceSha256: source.sourceSha256,
        content: { mode: "sourceClone", sourceStoryId: source.storyId },
      },
    ],
  });
}

/**
 * A story the document never had (a header on a footer-only file, any band on
 * a file without one) has no source part to clone. It is born as its own
 * editable part under an identity derived from the slot alone; this constant
 * stands in for the source hash the schema requires. The server authorises
 * exactly this identity (`FRESH_STORY_SOURCE_SHA256` in
 * document_section_story_graph.py).
 */
export const FRESH_STORY_SOURCE_SHA256: Record<SectionStoryKind, string> = {
  header: "73aaefaf2fa6cded6b74697e943db46ffd929e393e6f8e75b6780945bb2955b2",
  footer: "91657ec77829c8f14afd17c0740ccb86d140a6f64917ff34dbeb38e81cdf2a9f",
};

/**
 * Materialize a missing native slot as an independent deterministic clone.
 *
 * An omitted first/even ref is not the default story. The default ref is only
 * an authenticated custody seed when no same-variant predecessor exists; the
 * new slot always receives its own part/ref before the caller edits it.
 *
 * When nothing of the kind exists to clone, `freshBlocks` (non-empty) lets the
 * slot be born as a fresh editable story instead; without them the graph is
 * left untouched and null is returned.
 */
export function materializeSectionStoryRef(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  freshBlocks?: readonly BandRichBlock[] | null,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= normalized.sections.length ||
    (kind !== "header" && kind !== "footer") ||
    !SECTION_STORY_VARIANTS.includes(variant)
  ) {
    return null;
  }
  const slot = sectionStorySlot(kind, variant);
  if (normalized.sections[sectionIndex][slot] !== null) return normalized;
  const inherited =
    sectionIndex > 0
      ? resolveEffectiveSectionStoryRef(
          normalized,
          sectionIndex - 1,
          kind,
          variant,
        )
      : null;
  const custodySeed =
    inherited ??
    (variant === "default"
      ? null
      : resolveEffectiveSectionStoryRef(
          normalized,
          sectionIndex,
          kind,
          "default",
        ));
  if (custodySeed) {
    return cloneSectionStoryRef(normalized, sectionIndex, kind, variant, custodySeed);
  }
  const blocks = normalizeEditableBlocks(freshBlocks ?? null);
  if (!blocks?.length) return null;
  const identity = firstFreeStoryIdentity(
    normalized,
    stableToken(`fresh:${sectionIndex}:${kind}:${variant}`),
    kind,
  );
  return normalizeSectionStoryGraph({
    ...normalized,
    sections: normalized.sections.map((section, index) =>
      index === sectionIndex
        ? {
            ...section,
            [slot]: {
              relationshipId: identity.relationshipId,
              relationshipType: relationshipTypeFor(kind),
              targetMode: null,
              storyId: identity.storyId,
            },
          }
        : section,
    ),
    stories: [
      ...normalized.stories,
      {
        storyId: identity.storyId,
        kind,
        partPath: identity.partPath,
        sourceSha256: FRESH_STORY_SOURCE_SHA256[kind],
        content: { mode: "editable", blocks },
      },
    ],
  });
}

/** The first story/part/relationship identity for `base` the graph does not
 * hold yet — the same walk the server repeats to authorise a new story. */
function firstFreeStoryIdentity(
  normalized: SectionStoryGraph,
  base: string,
  kind: SectionStoryKind,
): { storyId: string; partPath: string; relationshipId: string } {
  const occupiedIds = new Set(normalized.stories.map((story) => story.storyId));
  const occupiedParts = new Set(
    normalized.stories.map((story) => story.partPath),
  );
  const occupiedRels = new Set(
    normalized.sections.flatMap((section) =>
      SECTION_STORY_SLOTS.flatMap((key) => {
        const ref = section[key];
        return ref ? [ref.relationshipId] : [];
      }),
    ),
  );
  let suffix = 0;
  let storyId = "";
  let partPath = "";
  let relationshipId = "";
  do {
    const discriminator = suffix === 0 ? base : `${base}-${suffix}`;
    storyId = `mrai-${kind}-${discriminator}`;
    partPath = `word/${kind}-mrai-${discriminator}.xml`;
    relationshipId = `rIdMrai${kind === "header" ? "H" : "F"}${discriminator.replace(/-/g, "")}`;
    suffix += 1;
  } while (
    occupiedIds.has(storyId) ||
    occupiedParts.has(partPath) ||
    occupiedRels.has(relationshipId)
  );
  return { storyId, partPath, relationshipId };
}

/**
 * Clear an authenticated story without encoding fake whitespace as content.
 *
 * Removing the owned ref/part is Word's native empty-story state. It is safe
 * only when no sourceClone depends on the part and removing it cannot reveal a
 * different inherited story. Otherwise the edit fails closed.
 */
export function clearSectionStoryEditableContent(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  const targetRef = normalized
    ? resolveEffectiveSectionStoryRef(normalized, sectionIndex, kind, variant)
    : null;
  if (!normalized || !targetRef) return null;
  const targetStory = normalized.stories.find(
    (story) => story.storyId === targetRef.storyId,
  );
  if (
    !targetStory ||
    targetStory.content.mode === "opaque" ||
    normalized.stories.some(
      (story) =>
        story.content.mode === "sourceClone" &&
        story.content.sourceStoryId === targetStory.storyId,
    )
  ) {
    return null;
  }

  const affected: Array<{
    sectionIndex: number;
    kind: SectionStoryKind;
    variant: SectionStoryVariant;
  }> = [];
  for (let index = 0; index < normalized.sections.length; index += 1) {
    for (const candidateKind of ["header", "footer"] as const) {
      for (const candidateVariant of SECTION_STORY_VARIANTS) {
        if (
          resolveEffectiveSectionStoryRef(
            normalized,
            index,
            candidateKind,
            candidateVariant,
          )?.storyId === targetStory.storyId
        ) {
          affected.push({
            sectionIndex: index,
            kind: candidateKind,
            variant: candidateVariant,
          });
        }
      }
    }
  }

  const candidate = normalizeSectionStoryGraph({
    ...normalized,
    sections: normalized.sections.map((section) => {
      const next = { ...section };
      for (const slot of SECTION_STORY_SLOTS) {
        if (next[slot]?.storyId === targetStory.storyId) next[slot] = null;
      }
      return next;
    }),
    stories: normalized.stories.filter(
      (story) => story.storyId !== targetStory.storyId,
    ),
  });
  if (!candidate) return null;
  if (
    affected.some(
      (entry) =>
        resolveEffectiveSectionStoryRef(
          candidate,
          entry.sectionIndex,
          entry.kind,
          entry.variant,
        ) !== null,
    )
  ) {
    return null;
  }
  return candidate;
}

/** Resolve the story rendered on a page using section-local, not document, parity. */
export function resolveSectionPageStory(
  graph: SectionStoryGraph,
  sectionIndex: number,
  pageIndexWithinSection: number,
  kind: SectionStoryKind,
): SectionStory | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    sectionIndex < 0 ||
    sectionIndex >= normalized.sections.length ||
    !Number.isInteger(pageIndexWithinSection) ||
    pageIndexWithinSection < 0
  ) {
    return null;
  }
  const section = normalized.sections[sectionIndex];
  const variant: SectionStoryVariant =
    section.titlePage && pageIndexWithinSection === 0
      ? "first"
      : normalized.evenAndOddHeaders && pageIndexWithinSection % 2 === 1
        ? "even"
        : "default";
  const ref = resolveEffectiveSectionStoryRef(
    normalized,
    sectionIndex,
    kind,
    variant,
  );
  return ref
    ? (normalized.stories.find((story) => story.storyId === ref.storyId) ??
        null)
    : null;
}

function stableToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Pure future-command primitive: break inheritance by cloning exact provenance once. */
export function unlinkSectionStory(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    sectionIndex <= 0 ||
    sectionIndex >= normalized.sections.length
  ) {
    return null;
  }
  const slot = sectionStorySlot(kind, variant);
  if (normalized.sections[sectionIndex][slot] !== null) return normalized;
  const inherited = resolveEffectiveSectionStoryRef(
    normalized,
    sectionIndex - 1,
    kind,
    variant,
  );
  if (!inherited) return null;
  const source = normalized.stories.find(
    (story) => story.storyId === inherited.storyId,
  );
  if (!source) return null;
  return cloneSectionStoryRef(
    normalized,
    sectionIndex,
    kind,
    variant,
    inherited,
  );
}

/** Pure future-command primitive: restore native inheritance and drop only its clone. */
export function relinkSectionStory(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    sectionIndex <= 0 ||
    sectionIndex >= normalized.sections.length
  ) {
    return null;
  }
  const slot = sectionStorySlot(kind, variant);
  const local = normalized.sections[sectionIndex][slot];
  if (local === null) return normalized;
  const sections = normalized.sections.map((section, index) =>
    index === sectionIndex ? { ...section, [slot]: null } : section,
  );
  return withSectionStorySections(normalized, sections);
}

/**
 * The graph with a new section list, dropping only the stories no section
 * reaches any more (directly or through a source clone). Null when a
 * reference names a story the graph does not have.
 */
export function withSectionStorySections(
  graph: SectionStoryGraph,
  sections: readonly SectionStorySection[],
): SectionStoryGraph | null {
  const storyById = new Map(
    graph.stories.map((story) => [story.storyId, story]),
  );
  const reachableStoryIds = new Set<string>();
  const pendingStoryIds = sections.flatMap((section) =>
    SECTION_STORY_SLOTS.flatMap((key) => {
      const ref = section[key];
      return ref ? [ref.storyId] : [];
    }),
  );
  while (pendingStoryIds.length > 0) {
    const storyId = pendingStoryIds.pop()!;
    if (reachableStoryIds.has(storyId)) continue;
    const story = storyById.get(storyId);
    if (!story) return null;
    reachableStoryIds.add(storyId);
    if (story.content.mode === "sourceClone") {
      pendingStoryIds.push(story.content.sourceStoryId);
    }
  }
  const result: SectionStoryGraph = {
    ...graph,
    sections: [...sections],
    stories: graph.stories.filter((story) =>
      reachableStoryIds.has(story.storyId),
    ),
  };
  return normalizeSectionStoryGraph(result);
}

/** Update one section's native `w:titlePg` state without touching its stories. */
export function setSectionStoryTitlePage(
  graph: SectionStoryGraph,
  sectionIndex: number,
  enabled: boolean,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= normalized.sections.length ||
    typeof enabled !== "boolean"
  ) {
    return null;
  }
  if (normalized.sections[sectionIndex].titlePage === enabled) {
    return normalized;
  }
  return {
    ...normalized,
    sections: normalized.sections.map((section, index) =>
      index === sectionIndex ? { ...section, titlePage: enabled } : section,
    ),
  };
}

/** Update Word's document-wide `w:evenAndOddHeaders` switch. */
export function setSectionStoryEvenAndOddHeaders(
  graph: SectionStoryGraph,
  enabled: boolean,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (!normalized || typeof enabled !== "boolean") return null;
  return normalized.evenAndOddHeaders === enabled
    ? normalized
    : { ...normalized, evenAndOddHeaders: enabled };
}

/**
 * Change one native story's inheritance state.  `linked=true` removes the
 * section-local reference; `linked=false` creates the authenticated
 * sourceClone used by original-package patchback.
 */
export function setSectionStoryLinkedToPrevious(
  graph: SectionStoryGraph,
  sectionIndex: number,
  kind: SectionStoryKind,
  variant: SectionStoryVariant,
  linked: boolean,
): SectionStoryGraph | null {
  const normalized = normalizeSectionStoryGraph(graph);
  if (
    !normalized ||
    !Number.isInteger(sectionIndex) ||
    sectionIndex <= 0 ||
    sectionIndex >= normalized.sections.length ||
    (kind !== "header" && kind !== "footer") ||
    !SECTION_STORY_VARIANTS.includes(variant) ||
    typeof linked !== "boolean"
  ) {
    return null;
  }
  const slot = sectionStorySlot(kind, variant);
  const currentlyLinked = normalized.sections[sectionIndex][slot] === null;
  if (currentlyLinked === linked) return normalized;
  return linked
    ? relinkSectionStory(normalized, sectionIndex, kind, variant)
    : unlinkSectionStory(normalized, sectionIndex, kind, variant);
}
