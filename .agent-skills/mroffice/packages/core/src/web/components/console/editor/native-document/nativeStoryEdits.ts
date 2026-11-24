/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's own header/footer part, edited in the story editor.
 *
 * A header or footer part MRAI does not own keeps its bytes: pictures,
 * shapes, text boxes, tables, complex fields, content controls, frames and
 * every run or paragraph property MRAI has no model for. The story editor
 * still opens it as a real editor -- the ribbon aligns its lines, formats its
 * words, types beside Word's fields and adds or removes plain lines -- and a
 * commit turns what the user did into `nativeEdits`: edits the save writes
 * INTO the original part, byte range by byte range
 * (`app/services/document_native_story_edits.py`, the server twin of
 * {@link normalizeNativeStoryEdits}).
 *
 * The painted band says which of Word's paragraphs each line is
 * (`nativeParagraphId`) and what removing it depends on (`nativeRemovable`),
 * which runs are Word's typable text (`nativeTextId`, with the run of the part
 * a slot shares, `nativeRunGroup`, and where that run is wrapped,
 * `nativeWrapped`) and which are Word's content the user moves past but never
 * types into (`nativeAtom`: a field result, a tab, a symbol; `nativeAnchor`
 * names the run of Word's line such content ends when a run may follow it). A
 * commit compares
 * the band the editor opened with the band it holds now. Text that moves
 * keeps the complete run properties of the run it came from (`from`), a line
 * Enter makes starts from the complete properties of its line, and anything
 * the part cannot take exactly is refused by name ({@link NativeStoryRefusal})
 * -- never approximated, never dropped.
 */

import {
  isBandFieldToken,
  isNativeBandAnchorId,
  isNativeBandAtomId,
  isNativeBandFieldId,
  isNativeBandGroupId,
  isNativeBandObjectId,
  isNativeFieldNumberFormat,
  normalizeNativeNewField,
  type NativeFieldNumberFormat,
  type NativeNewField,
  isNativeBandParagraphId,
  isNativeBandTextId,
  normalizeBandRichBlocks,
  normalizeBandRunRevision,
  type BandRunRevision,
  type BandFieldToken,
  type BandRichBlock,
  type BandRichFrame,
  type BandRichImage,
  type BandRichParagraph,
  type BandRichShape,
  type BandRichRun,
  type BandRichTabStop,
  type BandRichTable,
} from "./headerFooter";

export interface NativeParagraphProps {
  align?: "left" | "center" | "right" | "justify" | null;
  tabStops?: BandRichTabStop[] | null;
  indentLeftPt?: number | null;
  indentRightPt?: number | null;
  firstLineIndentPt?: number | null;
  spaceBeforePt?: number | null;
  spaceAfterPt?: number | null;
  docxStyleId?: string | null;
}

export interface NativeRunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sizePt?: number | null;
  color?: string | null;
  font?: { ascii?: string | null; eastAsia?: string | null };
}

/** A run MRAI writes: its text or field, the slot whose complete run
 * properties it starts from (`from`; for text typed after a slot, that slot),
 * and the values it changes on top of them. */
export type NativeRun = (
  | { text: string }
  | { token: BandFieldToken; format?: NativeFieldNumberFormat }
  | { field: NativeNewField & { result?: string } }
) & { from?: string; props?: NativeRunProps; revision?: BandRunRevision };

/** A piece of a slot's text under Track Changes: kept, or Word's tracked
 * insertion or deletion of it (`revision`). */
export interface NativeTrackedSegment {
  text: string;
  revision?: BandRunRevision;
}

/** A picture inserted at the end of one of Word's lines (Word's inline
 * picture; its media part and relationship are written with the part). */
export interface NativeNewPicture {
  src: string;
  widthEmu: number;
  heightEmu: number;
}

/** A line MRAI adds, starting from the complete properties of `from`. */
export interface NativeNewParagraph {
  type: "paragraph";
  from?: string;
  props?: NativeParagraphProps;
  runs: NativeRun[];
}

/** Cumulative edits of one native story, replayed on its ORIGINAL part. */
export interface NativeStoryEdits {
  paragraphs?: Record<string, NativeParagraphProps>;
  runs?: Record<string, NativeRunProps>;
  /** Runs written after a slot's run (a slot id), or after a run of Word's
   * line that is not a slot's -- a tab's run, a field's end run -- (an anchor
   * id, `p{block}:q{paragraph}:r{run}`, see `BandRichRun.nativeAnchor`). */
  insertedRuns?: Record<string, NativeRun[]>;
  paragraphsBefore?: Record<string, NativeNewParagraph[]>;
  paragraphsAfter?: Record<string, NativeNewParagraph[]>;
  deletedParagraphs?: string[];
  /** Fields of Word's lines removed whole (`BandRichRun.nativeField`): the
   * save takes the field's code and result out of the line, as Word's Delete
   * on a selected field does. */
  deletedFields?: string[];
  /** A slot's text as tracked pieces (Track Changes on): the save splits the
   * slot's run into runs of its properties, a tracked piece wrapped in
   * `w:ins` / `w:del` as Word writes it. Replaces the slot's `textEdits`. */
  trackedText?: Record<string, NativeTrackedSegment[]>;
  /** Fields of Word's lines deleted with Track Changes on, by field id: the
   * save wraps the field's runs in a `w:del` with this author and date. */
  trackedDeletedFields?: Record<string, BandRunRevision>;
  /** A page-number field's number format, by its field id (`null`: no
   * switch, Word's default): its `\* <format>` switch. */
  fieldFormats?: Record<string, NativeFieldNumberFormat | null>;
  /** Pictures inserted at the end of Word's lines, by line id. */
  pictures?: Record<string, NativeNewPicture[]>;
  /** Word's pictures, shapes and text boxes resized, or removed (`null`), by
   * object id (`BandRichImage.nativeObject`). */
  objects?: Record<string, { widthEmu: number; heightEmu: number } | null>;
  /** The words of members of Word's own groups, retyped in their own boxes:
   * by group id (`BandRichShape.nativeGroup`), then by the member's place in
   * the group's `groupMembers`. Nothing else of a group is an edit of the
   * story (server: `_member_words_replacements`). */
  memberWords?: Record<string, Record<string, string>>;
  /** Word's Accept All Changes / Reject All Changes reached the story, as
   * they reach every story of the document: the save settles each tracked
   * change Word wrote in the part, the ones the band draws (insertions,
   * deletions) and the ones it does not (formatting, paragraph marks) alike
   * (server: `NATIVE_STORY_REVISIONS`). */
  revisions?: NativeStoryRevisions;
  /** What each edited property was before it was first changed: changing it
   * back removes the edit, so undoing in the editor writes nothing; and
   * (`removedRuns`) the formatting a removed line's words had, which text
   * moved out of them keeps starting from. Never written into the part. */
  originals?: {
    paragraphs?: Record<string, NativeParagraphProps>;
    runs?: Record<string, NativeRunProps>;
    removedRuns?: Record<string, NativeRunProps>;
  };
}

/** Why a native story edit cannot be written into Word's part. */
export type NativeStoryRefusal =
  | "native_story_edit_fields_moved"
  | "native_story_edit_field_deleted"
  | "native_story_edit_table_structure"
  | "native_story_edit_paragraph_reordered"
  | "native_story_edit_paragraph_not_removable"
  | "native_story_edit_split_run"
  | "native_story_edit_wrapped_text"
  | "native_story_edit_unanchored_text"
  | "native_story_edit_unanchored_paragraph"
  | "native_story_edit_objects_changed"
  | "native_story_edit_unsupported_paragraph_property"
  | "native_story_edit_unsupported_run_property"
  | "native_story_edit_unsupported_block"
  | "native_story_edit_list_changed"
  | "native_story_edit_new_field_unsupported"
  | "native_story_edit_revision"
  | "native_story_edit_invalid";

const PARAGRAPH_PROP_KEYS = [
  "align",
  "tabStops",
  "indentLeftPt",
  "indentRightPt",
  "firstLineIndentPt",
  "spaceBeforePt",
  "spaceAfterPt",
  "docxStyleId",
] as const;
type ParagraphKey = (typeof PARAGRAPH_PROP_KEYS)[number];
const RUN_PROP_KEYS = ["bold", "italic", "underline", "sizePt", "color", "font"] as const;
const COLOR_RE = /^#[0-9a-f]{6}$/;
const FONT_NAME_RE = /^[A-Za-z0-9À-ɏ　-ヿ㐀-䶿一-鿿豈-﫿０-９Ａ-Ｚａ-ｚ가-힣 ._+-]{1,64}$/;
// The server twin's _MAX_NEW_PARAGRAPHS / _MAX_NEW_PICTURES
// (document_native_story_edits.py).
const MAX_NEW_PARAGRAPHS = 200;
const MAX_INSERTED_RUNS = 256;
const MAX_NEW_PICTURES = 50;
const MAX_EMU = 100_000_000;
const MAX_FIELD_RESULT = 255;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_TEXT = 50_000;
/** A run of text MRAI writes holds at most this many characters (code
 * points, as the server counts them); longer text is written as more runs. */
const MAX_RUN_TEXT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function wholeTwips(value: unknown, low: number, high: number): boolean {
  return isNumber(value) && value >= low && value <= high && Math.abs(value * 20 - Math.round(value * 20)) < 1e-9;
}

function xmlChar(code: number): boolean {
  return (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function xmlTextOk(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const characters = codePoints(value);
  if (characters.length < 1 || characters.length > MAX_RUN_TEXT) return false;
  // A typed tab is Word's `w:tab`, a line break its `w:br`.
  return characters.every((character) => character === "\t" || character === "\n" || xmlChar(character.codePointAt(0) ?? 0));
}

type GroupMember = NonNullable<BandRichShape["groupMembers"]>[number];

/** A run's formatting as the member writer keeps it: a content control's day
 * and placeholder flag are what typing into it changes, not its format. */
function retypedRunStyle(style: unknown): unknown {
  if (!isRecord(style) || !isRecord(style.contentControl)) return style ?? null;
  const control: Record<string, unknown> = { ...style.contentControl };
  delete control.dateFullDate;
  delete control.placeholder;
  return { ...style, contentControl: control };
}

/** Whether ``now`` is ``shown`` with nothing changed but its words: the same
 * member, runs each formatted as one of its shown runs, paragraphs each
 * laid out as one of its shown paragraphs. */
function memberRetypedOnly(shown: GroupMember, now: GroupMember): boolean {
  const rest = (member: GroupMember) => ({ ...member, text: null, textRuns: null, textBody: null });
  if (!sameValue(rest(shown), rest(now))) return false;
  if (typeof now.text !== "string" || codePoints(now.text).length > NATIVE_MEMBER_WORDS_MAX) return false;
  const shownRuns = shown.textRuns ?? null;
  const nowRuns = now.textRuns ?? null;
  if ((shownRuns === null) !== (nowRuns === null)) return false;
  if (shownRuns && nowRuns) {
    const styles = shownRuns.map((run) => retypedRunStyle(run.style));
    if (!nowRuns.every((run) => styles.some((style) => sameValue(style, retypedRunStyle(run.style))))) return false;
  }
  const shownBody = shown.textBody ?? null;
  const nowBody = now.textBody ?? null;
  if ((shownBody === null) !== (nowBody === null)) return false;
  if (shownBody && nowBody) {
    if (!sameValue({ ...shownBody, paragraphs: null }, { ...nowBody, paragraphs: null })) return false;
    const layouts = (shownBody.paragraphs ?? []).map((paragraph) => ({ ...paragraph, text: null }));
    if (!(nowBody.paragraphs ?? []).every((paragraph) => layouts.some((layout) => sameValue(layout, { ...paragraph, text: null })))) {
      return false;
    }
  }
  return true;
}

/** The longest words of one group member (server `_MAX_MEMBER_WORDS`) and the
 * most members a group's words are addressed in (`_MAX_GROUP_MEMBERS`). */
export const NATIVE_MEMBER_WORDS_MAX = 2_000;
const NATIVE_GROUP_MAX_MEMBERS = 512;

function memberWordsOk(value: string): boolean {
  const characters = codePoints(value);
  if (characters.length < 1 || characters.length > NATIVE_MEMBER_WORDS_MAX) return false;
  return characters.every((character) => character === "\t" || character === "\n" || xmlChar(character.codePointAt(0) ?? 0));
}

function tabStopsOk(value: unknown): value is BandRichTabStop[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
  let last = 0;
  for (const stop of value) {
    if (
      !isRecord(stop) ||
      Object.keys(stop).sort().join(",") !== "align,leader,pos" ||
      typeof stop.pos !== "number" ||
      !Number.isSafeInteger(stop.pos) ||
      stop.pos <= last ||
      stop.pos > 31_680 ||
      !["left", "center", "right", "decimal"].includes(stop.align as string) ||
      !["none", "dot", "hyphen", "underscore"].includes(stop.leader as string)
    ) {
      return false;
    }
    last = stop.pos;
  }
  return true;
}

/** A style id MRAI writes into `w:pStyle`: 1-253 XML characters, none a
 * control character, a lone surrogate or a Unicode noncharacter (the server
 * twin is `style_id_ok`). */
export function styleIdOk(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const characters = codePoints(value);
  if (characters.length < 1 || characters.length > 253) return false;
  return characters.every((character) => {
    const code = character.codePointAt(0) ?? 0;
    return xmlChar(code) && !(code >= 0xfdd0 && code <= 0xfdef) && (code & 0xfffe) !== 0xfffe;
  });
}

function paragraphProps(value: unknown): NativeParagraphProps | null {
  if (!isRecord(value) || !Object.keys(value).length) return null;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(PARAGRAPH_PROP_KEYS as readonly string[]).includes(key)) return null;
    if (raw === null) {
      out[key] = null;
      continue;
    }
    if (key === "align") {
      if (!["left", "center", "right", "justify"].includes(raw as string)) return null;
      out[key] = raw;
    } else if (key === "tabStops") {
      if (!tabStopsOk(raw)) return null;
      out[key] = raw.map((stop) => ({ pos: stop.pos, align: stop.align, leader: stop.leader }));
    } else if (key === "spaceBeforePt" || key === "spaceAfterPt") {
      if (!wholeTwips(raw, 0, 1584)) return null;
      out[key] = raw;
    } else if (key === "docxStyleId") {
      if (!styleIdOk(raw)) return null;
      out[key] = raw;
    } else {
      if (!wholeTwips(raw, -1584, 1584)) return null;
      out[key] = raw;
    }
  }
  return out as NativeParagraphProps;
}

function fontOk(value: unknown, nullable: boolean): boolean {
  if (!isRecord(value) || !Object.keys(value).length) return false;
  return Object.entries(value).every(
    ([key, name]) =>
      (key === "ascii" || key === "eastAsia") &&
      ((nullable && name === null) || (typeof name === "string" && name === name.trim() && FONT_NAME_RE.test(name))),
  );
}

function runProps(value: unknown, original = false): NativeRunProps | null {
  if (!isRecord(value) || !Object.keys(value).length) return null;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(RUN_PROP_KEYS as readonly string[]).includes(key)) return null;
    if (key === "bold" || key === "italic" || key === "underline") {
      if (typeof raw !== "boolean") return null;
    } else if (key === "sizePt") {
      if (raw !== null && (!isNumber(raw) || raw < 4 || raw > 96 || raw * 2 !== Math.trunc(raw * 2))) return null;
    } else if (key === "color") {
      if (raw !== null && (typeof raw !== "string" || !COLOR_RE.test(raw))) return null;
    } else if (!fontOk(raw, original)) {
      return null;
    }
    out[key] = key === "font" ? { ...(raw as object) } : raw;
  }
  return out as NativeRunProps;
}

function nativeNewFieldItem(value: unknown): (NativeNewField & { result?: string }) | null {
  if (!isRecord(value)) return null;
  const { result, ...rest } = value;
  const field = normalizeNativeNewField(rest);
  if (!field) return null;
  if (!("result" in value)) return field;
  if (
    typeof result !== "string" ||
    codePoints(result).length > MAX_FIELD_RESULT ||
    !codePoints(result).every((character) => xmlChar(character.codePointAt(0) ?? 0))
  ) {
    return null;
  }
  return { ...field, result };
}

function emu(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_EMU;
}

function nativeNewPicture(value: unknown): NativeNewPicture | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "heightEmu,src,widthEmu") return null;
  // The server also decodes the image (`normalize_new_picture`).
  if (typeof value.src !== "string" || value.src.length > 2_000_000 || !DATA_IMAGE_RE.test(value.src)) return null;
  if (!emu(value.widthEmu) || !emu(value.heightEmu)) return null;
  return { src: value.src, widthEmu: value.widthEmu, heightEmu: value.heightEmu };
}

function nativeRun(value: unknown, slotIds: ReadonlySet<string>): NativeRun | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !["text", "token", "format", "field", "from", "props", "revision"].includes(key))) {
    return null;
  }
  if (["text", "token", "field"].filter((key) => key in value).length !== 1) return null;
  let out: NativeRun;
  if ("token" in value) {
    if (!isBandFieldToken(value.token)) return null;
    out = { token: value.token };
    if ("format" in value) {
      // A page number the story inserted, with its own \* switch.
      if ((value.token !== "PAGE" && value.token !== "NUMPAGES") || !isNativeFieldNumberFormat(value.format)) return null;
      out = { token: value.token, format: value.format };
    }
  } else if ("format" in value) {
    return null;
  } else if ("field" in value) {
    const field = nativeNewFieldItem(value.field);
    if (!field) return null;
    out = { field };
  } else {
    if (!xmlTextOk(value.text)) return null;
    out = { text: value.text };
  }
  if ("from" in value) {
    if (typeof value.from !== "string" || !slotIds.has(value.from)) return null;
    out.from = value.from;
  }
  if ("props" in value) {
    const props = runProps(value.props);
    if (!props) return null;
    out.props = props;
  }
  if ("revision" in value) {
    // Text typed with Track Changes on is Word's tracked insertion.
    const revision = normalizeBandRunRevision(value.revision);
    if (!revision || revision.kind !== "ins") return null;
    out.revision = revision;
  }
  return out;
}

function newParagraph(value: unknown, slotIds: ReadonlySet<string>): NativeNewParagraph | null {
  if (
    !isRecord(value) ||
    value.type !== "paragraph" ||
    Object.keys(value).some((key) => !["type", "from", "props", "runs"].includes(key)) ||
    !Array.isArray(value.runs) ||
    value.runs.length > 256
  ) {
    return null;
  }
  const runs = value.runs.map((run) => nativeRun(run, slotIds));
  if (runs.some((run) => run === null)) return null;
  const out: NativeNewParagraph = { type: "paragraph", runs: runs as NativeRun[] };
  if ("from" in value) {
    if (!isNativeBandParagraphId(value.from)) return null;
    out.from = value.from;
  }
  if ("props" in value) {
    const props = paragraphProps(value.props);
    if (!props) return null;
    out.props = props;
  }
  return out;
}

function paragraphOrder(identity: string): number {
  const [block, ordinal] = identity.slice(1).split(":q").map(Number);
  return block * 256 + ordinal;
}

/** Order of a line's member id (`...:f3`, `...:o1`): its line, then its place. */
function memberOrder(identity: string, separator: string): number {
  const at = identity.lastIndexOf(separator);
  return paragraphOrder(identity.slice(0, at)) * 256 + Number(identity.slice(at + separator.length));
}

/** Text of runs counted as the server counts it (code points). */
function runText(runs: readonly NativeRun[]): number {
  return runs.reduce((total, run) => total + ("text" in run ? codePoints(run.text).length : 0), 0);
}

export type NativeStoryRevisions = "accept" | "reject";

/**
 * The canonical `nativeEdits` of one story, or null when any part is off the
 * closed model (the server twin: `normalize_native_story_edits`).
 * `slotIds` are the story's text and caret slots; typed runs may also follow
 * an anchor, which the server checks against the part itself.
 */
export function normalizeNativeStoryEdits(value: unknown, slotIds: ReadonlySet<string>): NativeStoryEdits | null {
  if (!isRecord(value) || !Object.keys(value).length) return null;
  const keys = [
    "paragraphs",
    "runs",
    "insertedRuns",
    "paragraphsBefore",
    "paragraphsAfter",
    "deletedParagraphs",
    "deletedFields",
    "trackedText",
    "trackedDeletedFields",
    "fieldFormats",
    "pictures",
    "objects",
    "memberWords",
    "originals",
    "revisions",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key))) return null;
  const out: NativeStoryEdits = {};
  if ("revisions" in value) {
    if (value.revisions !== "accept" && value.revisions !== "reject") return null;
    out.revisions = value.revisions;
  }
  let text = 0;
  if ("paragraphs" in value) {
    const raw = value.paragraphs;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 512) return null;
    const paragraphs: Record<string, NativeParagraphProps> = {};
    for (const [identity, props] of Object.entries(raw)) {
      const normalized = paragraphProps(props);
      if (!isNativeBandParagraphId(identity) || !normalized) return null;
      paragraphs[identity] = normalized;
    }
    out.paragraphs = paragraphs;
  }
  if ("runs" in value) {
    const raw = value.runs;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 5120) return null;
    const runs: Record<string, NativeRunProps> = {};
    for (const [identity, props] of Object.entries(raw)) {
      const normalized = runProps(props);
      if (!slotIds.has(identity) || !normalized) return null;
      runs[identity] = normalized;
    }
    out.runs = runs;
  }
  if ("insertedRuns" in value) {
    const raw = value.insertedRuns;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 5120) return null;
    const inserted: Record<string, NativeRun[]> = {};
    let count = 0;
    for (const [identity, items] of Object.entries(raw)) {
      const anchored = slotIds.has(identity) || isNativeBandAnchorId(identity);
      if (!anchored || !Array.isArray(items) || items.length < 1 || items.length > 64) return null;
      const normalized = items.map((item) => nativeRun(item, slotIds));
      if (normalized.some((item) => item === null)) return null;
      count += normalized.length;
      text += runText(normalized as NativeRun[]);
      inserted[identity] = normalized as NativeRun[];
    }
    if (count > MAX_INSERTED_RUNS) return null;
    out.insertedRuns = inserted;
  }
  let paragraphsAdded = 0;
  for (const key of ["paragraphsBefore", "paragraphsAfter"] as const) {
    if (!(key in value)) continue;
    const raw = value[key];
    if (!isRecord(raw) || !Object.keys(raw).length) return null;
    const placed: Record<string, NativeNewParagraph[]> = {};
    for (const [identity, items] of Object.entries(raw)) {
      if (!isNativeBandParagraphId(identity) || !Array.isArray(items) || items.length < 1 || items.length > MAX_NEW_PARAGRAPHS) {
        return null;
      }
      const normalized = items.map((item) => newParagraph(item, slotIds));
      if (normalized.some((item) => item === null)) return null;
      paragraphsAdded += normalized.length;
      for (const item of normalized as NativeNewParagraph[]) text += runText(item.runs);
      placed[identity] = normalized as NativeNewParagraph[];
    }
    out[key] = placed;
  }
  if (paragraphsAdded > MAX_NEW_PARAGRAPHS) return null;
  if ("deletedFields" in value) {
    const raw = value.deletedFields;
    if (
      !Array.isArray(raw) ||
      raw.length < 1 ||
      raw.length > 256 ||
      !raw.every((item) => isNativeBandFieldId(item)) ||
      new Set(raw).size !== raw.length
    ) {
      return null;
    }
    out.deletedFields = [...(raw as string[])].sort(
      (a, b) => paragraphOrder(a.slice(0, a.lastIndexOf(":f"))) - paragraphOrder(b.slice(0, b.lastIndexOf(":f"))) || Number(a.slice(a.lastIndexOf(":f") + 2)) - Number(b.slice(b.lastIndexOf(":f") + 2)),
    );
  }
  if ("trackedText" in value) {
    const raw = value.trackedText;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 512) return null;
    const tracked: Record<string, NativeTrackedSegment[]> = {};
    for (const identity of Object.keys(raw).sort((a, b) => memberOrder(a, ":r") - memberOrder(b, ":r"))) {
      const items = raw[identity];
      if (!slotIds.has(identity) || !Array.isArray(items) || items.length < 1 || items.length > 64) return null;
      const segments: NativeTrackedSegment[] = [];
      for (const item of items) {
        if (!isRecord(item) || Object.keys(item).some((key) => key !== "text" && key !== "revision")) return null;
        if (!xmlTextOk(item.text) || !item.text || /[\t\n]/.test(item.text)) return null;
        const segment: NativeTrackedSegment = { text: item.text };
        if ("revision" in item) {
          const revision = normalizeBandRunRevision(item.revision);
          if (!revision) return null;
          segment.revision = revision;
        }
        text += codePoints(item.text).length;
        segments.push(segment);
      }
      if (!segments.some((segment) => segment.revision)) return null;
      tracked[identity] = segments;
    }
    out.trackedText = tracked;
  }
  if ("trackedDeletedFields" in value) {
    const raw = value.trackedDeletedFields;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 256) return null;
    const fields: Record<string, BandRunRevision> = {};
    for (const identity of Object.keys(raw).sort((a, b) => memberOrder(a, ":f") - memberOrder(b, ":f"))) {
      const revision = normalizeBandRunRevision(raw[identity]);
      if (!isNativeBandFieldId(identity) || !revision || revision.kind !== "del") return null;
      fields[identity] = revision;
    }
    out.trackedDeletedFields = fields;
  }
  if ("deletedParagraphs" in value) {
    const raw = value.deletedParagraphs;
    if (
      !Array.isArray(raw) ||
      raw.length < 1 ||
      raw.length > 256 ||
      raw.some((item) => !isNativeBandParagraphId(item)) ||
      new Set(raw).size !== raw.length
    ) {
      return null;
    }
    out.deletedParagraphs = [...(raw as string[])].sort((a, b) => paragraphOrder(a) - paragraphOrder(b));
  }
  if ("fieldFormats" in value) {
    const raw = value.fieldFormats;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 256) return null;
    const formats: Record<string, NativeFieldNumberFormat | null> = {};
    for (const identity of Object.keys(raw).sort((a, b) => memberOrder(a, ":f") - memberOrder(b, ":f"))) {
      const format = raw[identity];
      if (!isNativeBandFieldId(identity) || (format !== null && !isNativeFieldNumberFormat(format))) return null;
      formats[identity] = format;
    }
    out.fieldFormats = formats;
  }
  if ("pictures" in value) {
    const raw = value.pictures;
    if (!isRecord(raw) || !Object.keys(raw).length) return null;
    const pictures: Record<string, NativeNewPicture[]> = {};
    let count = 0;
    if (!Object.keys(raw).every((identity) => isNativeBandParagraphId(identity))) return null;
    for (const identity of Object.keys(raw).sort((a, b) => paragraphOrder(a) - paragraphOrder(b))) {
      const items = raw[identity];
      if (!Array.isArray(items) || items.length < 1 || items.length > MAX_NEW_PICTURES) return null;
      const normalized = items.map(nativeNewPicture);
      if (normalized.some((item) => item === null)) return null;
      count += normalized.length;
      pictures[identity] = normalized as NativeNewPicture[];
    }
    if (count > MAX_NEW_PICTURES) return null;
    out.pictures = pictures;
  }
  if ("objects" in value) {
    const raw = value.objects;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 256) return null;
    if (!Object.keys(raw).every((identity) => isNativeBandObjectId(identity))) return null;
    const changed: Record<string, { widthEmu: number; heightEmu: number } | null> = {};
    for (const identity of Object.keys(raw).sort((a, b) => memberOrder(a, ":o") - memberOrder(b, ":o"))) {
      const size = raw[identity];
      if (size === null) {
        changed[identity] = null;
        continue;
      }
      if (
        !isRecord(size) ||
        Object.keys(size).sort().join(",") !== "heightEmu,widthEmu" ||
        !emu(size.widthEmu) ||
        !emu(size.heightEmu)
      ) {
        return null;
      }
      changed[identity] = { widthEmu: size.widthEmu, heightEmu: size.heightEmu };
    }
    out.objects = changed;
  }
  if ("memberWords" in value) {
    const raw = value.memberWords;
    if (!isRecord(raw) || Object.keys(raw).length < 1 || Object.keys(raw).length > 64) return null;
    if (!Object.keys(raw).every((identity) => isNativeBandGroupId(identity))) return null;
    const groups: Record<string, Record<string, string>> = {};
    let words = 0;
    for (const identity of Object.keys(raw).sort((a, b) => memberOrder(a, ":g") - memberOrder(b, ":g"))) {
      const members = raw[identity];
      if (!isRecord(members) || Object.keys(members).length < 1 || Object.keys(members).length > NATIVE_GROUP_MAX_MEMBERS) {
        return null;
      }
      const typed: Record<string, string> = {};
      for (const index of Object.keys(members).sort((a, b) => Number(a) - Number(b))) {
        const memberWords = members[index];
        if (!/^(?:0|[1-9][0-9]{0,2})$/.test(index) || Number(index) >= NATIVE_GROUP_MAX_MEMBERS) return null;
        if (typeof memberWords !== "string") return null;
        if (memberWords && (!memberWordsOk(memberWords))) return null;
        words += codePoints(memberWords).length;
        typed[index] = memberWords;
      }
      groups[identity] = typed;
    }
    if (words > MAX_TEXT) return null;
    out.memberWords = groups;
  }
  if ("originals" in value) {
    const raw = value.originals;
    if (!isRecord(raw) || !Object.keys(raw).length || Object.keys(raw).some((key) => !["paragraphs", "runs", "removedRuns"].includes(key))) {
      return null;
    }
    const originals: NonNullable<NativeStoryEdits["originals"]> = {};
    if ("paragraphs" in raw) {
      const entries = raw.paragraphs;
      if (!isRecord(entries) || Object.keys(entries).length < 1 || Object.keys(entries).length > 5120) return null;
      const kept: Record<string, NativeParagraphProps> = {};
      for (const [identity, props] of Object.entries(entries)) {
        const normalized = paragraphProps(props);
        if (!isNativeBandParagraphId(identity) || !normalized) return null;
        kept[identity] = normalized;
      }
      originals.paragraphs = kept;
    }
    for (const key of ["runs", "removedRuns"] as const) {
      if (!(key in raw)) continue;
      const entries = raw[key];
      if (!isRecord(entries) || Object.keys(entries).length < 1 || Object.keys(entries).length > 5120) return null;
      const kept: Record<string, NativeRunProps> = {};
      for (const [identity, props] of Object.entries(entries)) {
        const normalized = runProps(props, true);
        if (!slotIds.has(identity) || !normalized) return null;
        kept[identity] = normalized;
      }
      originals[key] = kept;
    }
    out.originals = originals;
  }
  return text > MAX_TEXT ? null : out;
}

// ---------------------------------------------------------------------------
// Opening: the band the editor starts from
// ---------------------------------------------------------------------------

function eachParagraph(
  blocks: readonly BandRichBlock[],
  visit: (paragraph: BandRichParagraph, where: string) => void,
): void {
  blocks.forEach((block, index) => {
    if (block.type === "paragraph") {
      visit(block, "flow");
      return;
    }
    // A cell is named by its place in the table's cell list: the editor
    // renumbers a row's columns around a vertically merged cell.
    block.cells.forEach((cell, cellIndex) => {
      for (const paragraph of cell.paragraphs ?? []) visit(paragraph, `t${index}:c${cellIndex}`);
    });
  });
}

/**
 * Whether the story editor can open this painted native band: every line it
 * draws names its paragraph of Word's part (a line a native edit added is the
 * one exception: it holds none of Word's content), and a table's cells carry
 * their lines as paragraphs. A band read before paragraphs carried ids, or a
 * part the in-place writer cannot read exactly (the server paints no ids for
 * it), opens in the text-slot island instead.
 */
export function nativeStoryPaintIsMappable(
  paint: readonly BandRichBlock[] | null | undefined,
  edited = false,
): boolean {
  if (!paint?.length) return false;
  let mappable = true;
  let named = 0;
  const seen = new Set<string>();
  for (const block of paint) {
    if (block.type === "table" && block.cells.some((cell) => !cell.paragraphs?.length)) return false;
  }
  eachParagraph(paint, (paragraph, where) => {
    const identity = paragraph.nativeParagraphId;
    if (identity === undefined) {
      const holdsWords = paragraph.runs.some((run) => run.nativeTextId !== undefined || run.nativeAtom !== undefined);
      if (!edited || holdsWords || where !== "flow") mappable = false;
      return;
    }
    if (!isNativeBandParagraphId(identity) || seen.has(identity)) mappable = false;
    else {
      seen.add(identity);
      named += 1;
    }
  });
  return mappable && named > 0;
}

/**
 * The painted band with every piece of Word's content that is not a text
 * slot named as an atom. A band painted from the part itself (no native edit
 * yet) names none; one a native commit wrote names its own.
 */
export function prepareNativeStoryPaint(paint: readonly BandRichBlock[], edited: boolean): BandRichBlock[] {
  const prepare = (paragraph: BandRichParagraph): BandRichParagraph => {
    const identity = paragraph.nativeParagraphId;
    if (!identity) return paragraph;
    let atom = 0;
    return {
      ...paragraph,
      runs: paragraph.runs.map((run) => {
        if (run.nativeTextId !== undefined) return run;
        if (run.nativeAtom !== undefined) {
          atom += 1;
          return run;
        }
        if (edited) return run;
        const named = { ...run, nativeAtom: `${identity}:a${atom}` };
        atom += 1;
        return named;
      }),
    };
  };
  return paint.map((block) =>
    block.type === "paragraph"
      ? prepare(block)
      : {
          ...block,
          cells: block.cells.map((cell) =>
            cell.paragraphs?.length ? { ...cell, paragraphs: cell.paragraphs.map(prepare) } : cell,
          ),
        },
  );
}

/** Whether removing lines leaves Word's part well formed: what remains of the
 * blocks a line stands among still holds a paragraph and ends with one (the
 * server twin is `removal_allowed`). */
export function removalAllowed(sequence: string, deleted: ReadonlySet<string>): boolean {
  const remaining = sequence.split(" ").filter((token) => !deleted.has(token));
  return remaining.length > 0 && remaining[remaining.length - 1] !== "T" && remaining.some((token) => token !== "T");
}

// ---------------------------------------------------------------------------
// Committing: what the editor holds, as edits of Word's part
// ---------------------------------------------------------------------------

type RunKey = "bold" | "italic" | "underline" | "sizePt" | "color" | "fontAscii" | "fontEastAsia";
const RUN_KEYS: readonly RunKey[] = ["bold", "italic", "underline", "sizePt", "color", "fontAscii", "fontEastAsia"];
type Format = Record<RunKey, boolean | number | string | null>;

function format(run: BandRichRun): Format {
  return {
    bold: run.bold === true,
    italic: run.italic === true,
    underline: run.underline === true,
    sizePt: run.sizePt ?? null,
    color: run.color ?? null,
    fontAscii: run.font?.ascii ?? null,
    fontEastAsia: run.font?.eastAsia ?? null,
  };
}

function sameFormat(a: BandRichRun, b: BandRichRun): boolean {
  const left = format(a);
  const right = format(b);
  return RUN_KEYS.every((key) => left[key] === right[key]);
}

/** Run props from flattened values (`null` removes; a font name that is
 * removed cannot be written and reports `unwritable`). */
function runPropsOf(values: Partial<Format>): { props: NativeRunProps; unwritable: boolean } {
  const props: NativeRunProps = {};
  let unwritable = false;
  for (const key of ["bold", "italic", "underline"] as const) {
    if (key in values) props[key] = Boolean(values[key]);
  }
  if ("sizePt" in values) props.sizePt = (values.sizePt as number | null) ?? null;
  if ("color" in values) props.color = (values.color as string | null) ?? null;
  const font: { ascii?: string; eastAsia?: string } = {};
  for (const [key, slot] of [["fontAscii", "ascii"], ["fontEastAsia", "eastAsia"]] as const) {
    if (!(key in values)) continue;
    if (values[key] === null) unwritable = true;
    else font[slot] = values[key] as string;
  }
  if (Object.keys(font).length) props.font = font;
  return { props, unwritable };
}

function flattenRunProps(props: NativeRunProps | undefined): Partial<Format> {
  const out: Partial<Format> = {};
  if (!props) return out;
  for (const key of ["bold", "italic", "underline", "sizePt", "color"] as const) {
    if (key in props) out[key] = props[key] as boolean | number | string | null;
  }
  if (props.font) {
    if ("ascii" in props.font) out.fontAscii = props.font.ascii ?? null;
    if ("eastAsia" in props.font) out.fontEastAsia = props.font.eastAsia ?? null;
  }
  return out;
}

/** What `to` changes of `from`, as run props. */
function formatDiff(from: BandRichRun | null, to: BandRichRun): { props: NativeRunProps; unwritable: boolean } {
  const a = from ? format(from) : format({});
  const b = format(to);
  const changed: Partial<Format> = {};
  for (const key of RUN_KEYS) if (a[key] !== b[key]) changed[key] = b[key];
  return runPropsOf(changed);
}

function paragraphValue(paragraph: BandRichParagraph, key: ParagraphKey): unknown {
  if (key === "align") return paragraph.align ?? "left";
  if (key === "docxStyleId") return paragraph.docxStyleId ?? null;
  const value = paragraph[key];
  if (value === undefined) return null;
  // The stops a line shows: none is a line without any.
  if (key === "tabStops") return (value as BandRichTabStop[]).length ? value : null;
  return twips(value as number);
}

/** A value kept as what a property was before it was edited: only one the
 * model can hold (a value it cannot, say a size below 4pt, is not kept, and
 * changing the property back then writes it explicitly). */
function originalParagraphValue(key: ParagraphKey, value: unknown): boolean {
  return value === null || paragraphProps({ [key]: value }) !== null;
}

function originalRunValue(key: RunKey, value: unknown): boolean {
  if (value === null) return key !== "bold" && key !== "italic" && key !== "underline";
  if (key === "fontAscii") return runProps({ font: { ascii: value } }, true) !== null;
  if (key === "fontEastAsia") return runProps({ font: { eastAsia: value } }, true) !== null;
  return runProps({ [key]: value }, true) !== null;
}

/** Deep equality of edit values, whatever order their keys were written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Display-only or unmodelled paragraph state that must come through as is. */
const FIXED_PARAGRAPH_KEYS = ["contextualSpacing", "paragraphBorders", "lineHeight", "lineHeightPt", "lineHeightRule"] as const;
const OBJECT_KEYS = ["images", "frames", "wordArt", "shapes", "charts"] as const;

function twips(value: number): number {
  return Math.round(value * 20) / 20;
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/**
 * One property's cumulative edit: `shown` is what the band opened with,
 * `now` what the editor holds. The first change of a property records the
 * value it had; changing it back to that value removes the edit.
 */
function mergeEdit(
  previous: Record<string, unknown> | undefined,
  originals: Record<string, unknown> | undefined,
  key: string,
  shown: unknown,
  now: unknown,
  representable: (value: unknown) => boolean,
): { edit?: unknown; original?: unknown; keep: boolean } {
  const hadEdit = previous !== undefined && key in previous;
  const knowsOriginal = originals !== undefined && key in originals;
  if (!hadEdit) {
    if (sameValue(shown, now)) return { keep: false };
    return representable(shown) ? { edit: now, original: shown, keep: true } : { edit: now, keep: true };
  }
  if (knowsOriginal) {
    if (sameValue(originals[key], now)) return { keep: false };
    return { edit: now, original: originals[key], keep: true };
  }
  // An edit made before originals were kept: its first value is unknown.
  return { edit: sameValue(shown, now) ? previous[key] : now, keep: true };
}

interface ShownParagraph {
  identity: string;
  where: string;
  order: number;
  paragraph: BandRichParagraph;
  atoms: string[];
  /** Each atom's anchor (the run of Word's line it ends, when a run may
   * follow it): where text typed in the gap after it is written. */
  anchors: (string | undefined)[];
  /** slot ids of each gap between atoms, in document order */
  gaps: string[][];
  removal?: string;
}

interface Classified {
  kind: "slot" | "atom" | "free";
  run: BandRichRun;
  id?: string;
  /** A slot's text as tracked pieces (Track Changes on), kept and tracked in
   * order; `run.text` is then all of them. */
  segments?: NativeTrackedSegment[];
  /** The slot a free run's text came from (whose run properties it keeps). */
  origin?: string;
}

export type NativeStoryCommit =
  | {
      ok: true;
      textEdits: Record<string, string>;
      nativeEdits: NativeStoryEdits | null;
      paint: BandRichBlock[];
    }
  | { ok: false; refusal: NativeStoryRefusal };

function refuse(refusal: NativeStoryRefusal): NativeStoryCommit {
  return { ok: false, refusal };
}

class Refused extends Error {
  constructor(readonly refusal: NativeStoryRefusal) {
    super(refusal);
  }
}

/** Text as runs the writer accepts: at most {@link MAX_RUN_TEXT} characters each. */
function chunks(text: string): string[] {
  const characters = codePoints(text);
  const out: string[] = [];
  for (let index = 0; index < characters.length; index += MAX_RUN_TEXT) {
    out.push(characters.slice(index, index + MAX_RUN_TEXT).join(""));
  }
  return out.length ? out : [text];
}

/**
 * The story's cumulative edits after the editor went from `shownBlocks` (the
 * band it opened) to `editedBlocks`, and the band to paint for them.
 */
export function commitNativeStory(
  authority: { runs: { id: string; text: string }[]; caretSlots?: { id: string }[] },
  textEdits: Record<string, string>,
  previous: NativeStoryEdits | null,
  shownBlocks: readonly BandRichBlock[],
  editedBlocks: readonly BandRichBlock[],
): NativeStoryCommit {
  try {
    return commit(authority, textEdits, previous, shownBlocks, editedBlocks);
  } catch (error) {
    if (error instanceof Refused) return refuse(error.refusal);
    throw error;
  }
}

function commit(
  authority: { runs: { id: string; text: string }[]; caretSlots?: { id: string }[] },
  textEdits: Record<string, string>,
  previous: NativeStoryEdits | null,
  shownBlocks: readonly BandRichBlock[],
  editedBlocks: readonly BandRichBlock[],
): NativeStoryCommit {
  const prepared = prepareNativeStoryPaint(shownBlocks, previous !== null);
  // A field of Word's line the editor no longer shows (Backspace on the
  // selected field) is removed from the part: the line is read as if the
  // field were not there, and the save takes it out (`deletedFields`).
  const editedAtoms = new Set<string>();
  eachParagraph(editedBlocks, (paragraph) => {
    for (const run of paragraph.runs) if (run.nativeAtom !== undefined) editedAtoms.add(run.nativeAtom);
  });
  const deletedFields = new Set(previous?.deletedFields ?? []);
  const withoutDeletedFields = (paragraph: BandRichParagraph): BandRichParagraph => {
    if (!paragraph.nativeParagraphId) return paragraph;
    const runs = paragraph.runs.filter((run) => {
      if (run.nativeAtom === undefined || run.nativeField === undefined || editedAtoms.has(run.nativeAtom)) return true;
      deletedFields.add(run.nativeField);
      return false;
    });
    return runs.length === paragraph.runs.length ? paragraph : { ...paragraph, runs };
  };
  // A text box of Word's line the editor no longer shows (Delete on the
  // selected box) is removed from the part whole, its words with it (Word's
  // Delete on a selected text box): the line is read as if the box and the
  // runs it draws were not there, and the save takes out its drawing run.
  const editedBoxes = new Set<string>();
  eachParagraph(editedBlocks, (paragraph) => {
    for (const frame of paragraph.frames ?? []) if (frame.nativeObject !== undefined) editedBoxes.add(frame.nativeObject);
  });
  const deletedBoxes = new Set<string>();
  const boxSlots = new Set<string>();
  const withoutDeletedBoxes = (paragraph: BandRichParagraph): BandRichParagraph => {
    const gone = (paragraph.frames ?? []).filter(
      (frame) => frame.nativeObject !== undefined && !editedBoxes.has(frame.nativeObject),
    );
    if (!paragraph.nativeParagraphId || !gone.length) return paragraph;
    const indexes = new Set(gone.map((frame) => frame.index));
    for (const frame of gone) deletedBoxes.add(frame.nativeObject!);
    const runs = paragraph.runs.filter((run) => {
      if (run.frame === undefined || !indexes.has(run.frame)) return true;
      // Nothing of Word's but the box's own words is drawn in a box.
      if (run.nativeAtom !== undefined) throw new Refused("native_story_edit_objects_changed");
      if (run.nativeTextId !== undefined) boxSlots.add(run.nativeTextId);
      return false;
    });
    const frames = (paragraph.frames ?? []).filter((frame) => !indexes.has(frame.index));
    const out: BandRichParagraph = { ...paragraph, runs };
    if (frames.length) out.frames = frames;
    else delete out.frames;
    return out;
  };
  const withoutDeleted = (paragraph: BandRichParagraph) => withoutDeletedBoxes(withoutDeletedFields(paragraph));
  const shown = prepared.map((block) =>
    block.type === "paragraph"
      ? withoutDeleted(block)
      : {
          ...block,
          cells: block.cells.map((cell) =>
            cell.paragraphs?.length ? { ...cell, paragraphs: cell.paragraphs.map(withoutDeleted) } : cell,
          ),
        },
  );
  const originalText = new Map<string, string>([
    ...authority.runs.map((run) => [run.id, run.text] as const),
    ...(authority.caretSlots ?? []).map((caret) => [caret.id, ""] as const),
  ]);
  const slotOrder = (identity: string) => Number(identity.split(":r")[1]);

  // -- the band as opened ------------------------------------------------
  const paragraphs = new Map<string, ShownParagraph>();
  const slotHome = new Map<string, { paragraph: string; gap: number; run: BandRichRun }>();
  const atomHome = new Map<string, string>();
  /** Each anchor's atom as shown: the formatting of the run it names. */
  const anchorHome = new Map<string, BandRichRun>();
  let order = 0;
  eachParagraph(shown, (paragraph, where) => {
    const identity = paragraph.nativeParagraphId;
    if (!identity) return;
    const record: ShownParagraph = {
      identity,
      where,
      order: order++,
      paragraph,
      atoms: [],
      anchors: [],
      gaps: [[]],
      removal: paragraph.nativeRemovable,
    };
    for (const run of paragraph.runs) {
      if (run.nativeAtom !== undefined) {
        record.atoms.push(run.nativeAtom);
        atomHome.set(run.nativeAtom, identity);
        // An anchor names a run of this very line, once.
        const anchor =
          isNativeBandAnchorId(run.nativeAnchor) &&
          run.nativeAnchor.startsWith(`${identity}:`) &&
          !anchorHome.has(run.nativeAnchor)
            ? run.nativeAnchor
            : undefined;
        record.anchors.push(anchor);
        if (anchor) anchorHome.set(anchor, run);
        record.gaps.push([]);
      } else if (run.nativeTextId !== undefined && originalText.has(run.nativeTextId)) {
        // A slot shown in tracked pieces is one slot, at its first piece.
        if (slotHome.has(run.nativeTextId)) continue;
        record.gaps[record.gaps.length - 1].push(run.nativeTextId);
        const home: BandRichRun = { ...run };
        delete home.revision;
        slotHome.set(run.nativeTextId, { paragraph: identity, gap: record.gaps.length - 1, run: home });
      }
    }
    for (const gap of record.gaps) gap.sort((a, b) => slotOrder(a) - slotOrder(b));
    paragraphs.set(identity, record);
  });

  // -- tables keep their grid ---------------------------------------------
  const shownTables = shown.filter((block): block is BandRichTable => block.type === "table");
  const editedTables = editedBlocks.filter((block): block is BandRichTable => block.type === "table");
  const grid = (table: BandRichTable) =>
    JSON.stringify([
      table.rows,
      table.cols,
      table.cells.map((cell) => [cell.colspan ?? 1, cell.rowspan ?? 1, cell.paragraphs?.length ?? 1]),
    ]);
  if (
    shownTables.length !== editedTables.length ||
    shownTables.some((table, index) => grid(table) !== grid(editedTables[index]))
  ) {
    return refuse("native_story_edit_table_structure");
  }

  // -- which edited line is which of Word's paragraphs ----------------------
  interface EditedParagraph {
    paragraph: BandRichParagraph;
    where: string;
    claimed?: string;
  }
  const edited: EditedParagraph[] = [];
  let tableIndex = -1;
  editedBlocks.forEach((block) => {
    if (block.type === "paragraph") {
      edited.push({ paragraph: block, where: "flow" });
      return;
    }
    tableIndex += 1;
    const shownIndex = shown.indexOf(shownTables[tableIndex]);
    block.cells.forEach((cell, cellIndex) => {
      for (const paragraph of cell.paragraphs ?? []) {
        edited.push({ paragraph, where: `t${shownIndex}:c${cellIndex}` });
      }
    });
  });
  const claimed = new Map<string, EditedParagraph>();
  const claim = (entry: EditedParagraph, identity: string): boolean => {
    if (claimed.has(identity) || entry.claimed) return false;
    claimed.set(identity, entry);
    entry.claimed = identity;
    return true;
  };
  for (const entry of edited) {
    const homes = new Set(
      entry.paragraph.runs.flatMap((run) => (run.nativeAtom !== undefined ? [atomHome.get(run.nativeAtom) ?? "?"] : [])),
    );
    if (!homes.size) continue;
    const [home] = homes;
    if (homes.size !== 1 || home === "?" || !claim(entry, home)) return refuse("native_story_edit_fields_moved");
  }
  for (const entry of edited) {
    if (entry.claimed) continue;
    const slot = entry.paragraph.runs.find((run) => run.nativeTextId !== undefined && slotHome.has(run.nativeTextId));
    if (slot) claim(entry, slotHome.get(slot.nativeTextId!)!.paragraph);
  }
  for (const entry of edited) {
    const identity = entry.paragraph.nativeParagraphId;
    if (!entry.claimed && identity && paragraphs.has(identity)) claim(entry, identity);
  }
  let lastOrder = -1;
  for (const entry of edited) {
    if (!entry.claimed) {
      if (entry.where !== "flow") return refuse("native_story_edit_table_structure");
      continue;
    }
    const record = paragraphs.get(entry.claimed)!;
    if (record.where !== entry.where) {
      return refuse(record.where === "flow" ? "native_story_edit_paragraph_reordered" : "native_story_edit_table_structure");
    }
    if (record.order < lastOrder) return refuse("native_story_edit_paragraph_reordered");
    lastOrder = record.order;
  }

  const nextText: Record<string, string> = { ...textEdits };
  // Tracked pieces of slots and tracked field deletions are cumulative, as
  // `textEdits` are: a slot or field this commit does not reach keeps them.
  const tracked: Record<string, NativeTrackedSegment[]> = { ...(previous?.trackedText ?? {}) };
  const trackedFields: Record<string, BandRunRevision> = { ...(previous?.trackedDeletedFields ?? {}) };
  // The words of a deleted text box go with its drawing run: no edit of
  // their own is written into it.
  for (const slot of boxSlots) delete nextText[slot];
  const setText = (identity: string, text: string) => {
    if (codePoints(text).length > MAX_RUN_TEXT) throw new Refused("native_story_edit_invalid");
    if (text === originalText.get(identity)) delete nextText[identity];
    else nextText[identity] = text;
  };
  const paragraphEdits: Record<string, NativeParagraphProps> = {};
  const paragraphOriginals: Record<string, NativeParagraphProps> = {};
  const runEdits: Record<string, NativeRunProps> = {};
  const runOriginals: Record<string, NativeRunProps> = {};
  const inserted: Record<string, NativeRun[]> = {};
  const before: Record<string, NativeNewParagraph[]> = {};
  const after: Record<string, NativeNewParagraph[]> = {};
  const deleted = new Set(previous?.deletedParagraphs ?? []);
  const newlyDeleted: ShownParagraph[] = [];
  // Field formats, pictures and object sizes are cumulative: what earlier
  // commits wrote stays unless this one changes it.
  const fieldFormats: Record<string, NativeFieldNumberFormat | null> = { ...(previous?.fieldFormats ?? {}) };
  const objects: Record<string, { widthEmu: number; heightEmu: number } | null> = { ...(previous?.objects ?? {}) };
  for (const box of deletedBoxes) objects[box] = null;
  const pictures: Record<string, NativeNewPicture[]> = { ...(previous?.pictures ?? {}) };
  const memberWords: Record<string, Record<string, string>> = Object.fromEntries(
    Object.entries(previous?.memberWords ?? {}).map(([group, members]) => [group, { ...members }]),
  );
  /**
   * A line's shapes with each of Word's own groups (`nativeGroup`) whose
   * members changed nothing but their words put back as it was shown, those
   * words recorded (`memberWords`). The save writes words alone, into the
   * member's own paragraphs (server `_member_words_replacements`), so a
   * member counts as retyped only when its runs and paragraphs are formatted
   * as some of its shown ones were; any other change of a group is left for
   * the drawing rule below, which refuses it.
   */
  const withMemberWords = (shown: readonly BandRichShape[], now: readonly BandRichShape[]): BandRichShape[] =>
    now.map((item) => {
      if (item.nativeGroup === undefined) return item;
      const was = shown.find((candidate) => candidate.nativeGroup === item.nativeGroup);
      const wasMembers = was?.groupMembers ?? [];
      const nowMembers = item.groupMembers ?? [];
      if (!was || wasMembers.length !== nowMembers.length) return item;
      if (!sameValue({ ...was, groupMembers: null }, { ...item, groupMembers: null })) return item;
      const typed: Record<string, string> = {};
      for (const [index, member] of nowMembers.entries()) {
        const shownMember = wasMembers[index];
        if (sameValue(shownMember, member)) continue;
        if (!memberRetypedOnly(shownMember, member)) return item;
        typed[String(index)] = member.text ?? "";
      }
      if (Object.keys(typed).length) {
        memberWords[item.nativeGroup] = { ...(memberWords[item.nativeGroup] ?? {}), ...typed };
      }
      return was;
    });
  /**
   * pictures (`nativeObject`) keep their order and may be resized or
   * deleted; pictures inserted here stand after them, at the end of the line
   * (where they are written). A line showing a picture of Word's the story
   * cannot name keeps its pictures as they are.
   */
  const recordImageEdits = (identity: string, shownAll: readonly BandRichImage[], nowAll: readonly BandRichImage[]) => {
    // An anchored picture (`floatAnchor`) is placed by its anchor and is no
    // object the story sizes or removes: it rides along unchanged, and a
    // line whose anchored pictures changed is not one the story can write.
    if (!sameValue(shownAll.filter((image) => image.floatAnchor), nowAll.filter((image) => image.floatAnchor))) {
      throw new Refused("native_story_edit_objects_changed");
    }
    const shown = shownAll.filter((image) => !image.floatAnchor);
    const now = nowAll.filter((image) => !image.floatAnchor);
    const inserted = shown.filter((image) => image.nativeObject === undefined);
    if (inserted.length !== (previous?.pictures?.[identity]?.length ?? 0)) {
      throw new Refused("native_story_edit_objects_changed");
    }
    const shownIds = shown.flatMap((image) => (image.nativeObject !== undefined ? [image.nativeObject] : []));
    const byId = new Map(shown.filter((image) => image.nativeObject !== undefined).map((image) => [image.nativeObject!, image]));
    let lastWord = -1;
    let cursor = 0;
    now.forEach((image, index) => {
      if (image.nativeObject === undefined) return;
      const at = shownIds.indexOf(image.nativeObject, cursor);
      if (at < 0) throw new Refused("native_story_edit_objects_changed");
      cursor = at + 1;
      lastWord = index;
    });
    const kept = new Set(now.flatMap((image) => (image.nativeObject !== undefined ? [image.nativeObject] : [])));
    for (const id of shownIds) {
      if (!kept.has(id)) {
        objects[id] = null;
        continue;
      }
      const was = byId.get(id)!;
      const image = now.find((candidate) => candidate.nativeObject === id)!;
      if (image.widthEmu === undefined || image.heightEmu === undefined) {
        if (image.widthEmu !== was.widthEmu || image.heightEmu !== was.heightEmu) {
          throw new Refused("native_story_edit_objects_changed");
        }
        continue;
      }
      if (image.widthEmu !== was.widthEmu || image.heightEmu !== was.heightEmu) {
        objects[id] = { widthEmu: image.widthEmu, heightEmu: image.heightEmu };
      }
    }
    const added: NativeNewPicture[] = [];
    now.forEach((image, index) => {
      if (image.nativeObject !== undefined) return;
      const picture = nativeNewPicture({ src: image.src, widthEmu: image.widthEmu, heightEmu: image.heightEmu });
      if (index < lastWord || !picture) throw new Refused("native_story_edit_objects_changed");
      added.push(picture);
    });
    if (added.length) pictures[identity] = added;
    else delete pictures[identity];
  };

  /**
   * A line's shapes or text boxes from what it showed to what it holds now.
   * Word's own (`nativeObject`) keep their order and may be resized (any
   * other change of one is not written) or, for a shape, deleted (a deleted
   * text box was taken out of the line above, with its words); anything
   * else about the line's drawings stays as it is.
   */
  const recordDrawingEdits = <T extends BandRichShape | BandRichFrame>(
    shown: readonly T[],
    now: readonly T[],
    deletable: boolean,
  ) => {
    const without = (list: readonly T[]) => list.filter((item) => item.nativeObject === undefined);
    if (!sameValue(without(shown), without(now))) throw new Refused("native_story_edit_objects_changed");
    const shownIds = shown.flatMap((item) => (item.nativeObject !== undefined ? [item.nativeObject] : []));
    const nowIds = now.flatMap((item) => (item.nativeObject !== undefined ? [item.nativeObject] : []));
    let cursor = 0;
    for (const id of nowIds) {
      const at = shownIds.indexOf(id, cursor);
      if (at < 0) throw new Refused("native_story_edit_objects_changed");
      cursor = at + 1;
    }
    for (const was of shown) {
      if (was.nativeObject === undefined) continue;
      const item = now.find((candidate) => candidate.nativeObject === was.nativeObject);
      if (!item) {
        if (!deletable) throw new Refused("native_story_edit_objects_changed");
        objects[was.nativeObject] = null;
        continue;
      }
      const rest = (value: T) => ({ ...value, widthEmu: 0, heightEmu: 0 });
      if (!sameValue(rest(was), rest(item))) throw new Refused("native_story_edit_objects_changed");
      if (item.widthEmu !== was.widthEmu || item.heightEmu !== was.heightEmu) {
        objects[was.nativeObject] = { widthEmu: item.widthEmu, heightEmu: item.heightEmu };
      }
    }
  };

  /** A paragraph's modelled values as the editor holds them now. */
  const paragraphNow = (paragraph: BandRichParagraph): Record<ParagraphKey, unknown> =>
    Object.fromEntries(PARAGRAPH_PROP_KEYS.map((key) => [key, paragraphValue(paragraph, key)])) as Record<ParagraphKey, unknown>;

  /** A slot's cumulative run edit from what was shown to what it is now. */
  const recordedRuns = new Set<string>();
  const recordRunEdit = (identity: string, shownRun: BandRichRun, now: BandRichRun) => {
    recordedRuns.add(identity);
    const prior = flattenRunProps(previous?.runs?.[identity]);
    const priorOriginals = flattenRunProps(previous?.originals?.runs?.[identity]);
    const shownFormat = format(shownRun);
    const nowFormat = format(now);
    const editValues: Partial<Format> = {};
    const originalValues: Partial<Format> = {};
    for (const key of RUN_KEYS) {
      const merged = mergeEdit(
        previous?.runs?.[identity] ? (prior as Record<string, unknown>) : undefined,
        previous?.originals?.runs?.[identity] ? (priorOriginals as Record<string, unknown>) : undefined,
        key,
        shownFormat[key],
        nowFormat[key],
        (value) => originalRunValue(key, value),
      );
      if (!merged.keep) continue;
      editValues[key] = merged.edit as Format[RunKey];
      if ("original" in merged) originalValues[key] = merged.original as Format[RunKey];
    }
    const edit = runPropsOf(editValues);
    if (edit.unwritable) throw new Refused("native_story_edit_unsupported_run_property");
    if (Object.keys(edit.props).length) runEdits[identity] = edit.props;
    if (Object.keys(originalValues).length) {
      const originalProps: NativeRunProps = {};
      for (const key of ["bold", "italic", "underline"] as const) {
        if (key in originalValues) originalProps[key] = Boolean(originalValues[key]);
      }
      if ("sizePt" in originalValues) originalProps.sizePt = (originalValues.sizePt as number | null) ?? null;
      if ("color" in originalValues) originalProps.color = (originalValues.color as string | null) ?? null;
      if ("fontAscii" in originalValues || "fontEastAsia" in originalValues) {
        originalProps.font = {};
        if ("fontAscii" in originalValues) originalProps.font.ascii = (originalValues.fontAscii as string | null) ?? null;
        if ("fontEastAsia" in originalValues) {
          originalProps.font.eastAsia = (originalValues.fontEastAsia as string | null) ?? null;
        }
      }
      runOriginals[identity] = originalProps;
    }
  };

  // -- removed lines --------------------------------------------------------
  for (const record of paragraphs.values()) {
    if (claimed.has(record.identity)) continue;
    if (record.where !== "flow") return refuse("native_story_edit_table_structure");
    if (record.atoms.length) return refuse("native_story_edit_field_deleted");
    if (OBJECT_KEYS.some((key) => record.paragraph[key] !== undefined)) return refuse("native_story_edit_objects_changed");
    if (!record.removal) return refuse("native_story_edit_paragraph_not_removable");
    deleted.add(record.identity);
    newlyDeleted.push(record);
  }
  for (const record of newlyDeleted) {
    if (!removalAllowed(record.removal!, deleted)) return refuse("native_story_edit_paragraph_not_removable");
  }
  // The text of a removed line is gone with it (text moved out of it is
  // written where it went, with its run's properties). What its words looked
  // like is kept: moved text goes on starting from it in later edits, when
  // the line is no longer shown.
  const removedFormats = new Map<string, BandRichRun>(
    Object.entries(previous?.originals?.removedRuns ?? {}).map(([slot, props]) => [slot, runOfProps(props)]),
  );
  for (const record of newlyDeleted) {
    for (const slot of record.gaps.flat()) {
      delete nextText[slot];
      removedFormats.set(slot, slotHome.get(slot)!.run);
    }
  }

  /** Each counted slot's formatting as the editor holds it now. */
  const slotFormatNow = new Map<string, BandRichRun>();
  const group = (identity: string | undefined) =>
    identity === undefined ? undefined : (slotHome.get(identity)?.run.nativeRunGroup ?? identity);
  /**
   * Whether text from `origin` (undefined: typed) may be written after the
   * run of slot `anchor`. Text of a hyperlink, a content control or a text
   * box keeps its place there (it may only stay after its own run); what is
   * written after a hyperlink's run would become part of the link, so only
   * the link's own text goes there.
   */
  const assertPlacement = (origin: string | undefined, anchor: string | undefined) => {
    if (origin !== undefined && slotHome.get(origin)?.run.nativeWrapped && group(anchor) !== group(origin)) {
      throw new Refused("native_story_edit_wrapped_text");
    }
    if (anchor !== undefined && slotHome.get(anchor)?.run.nativeWrapped === "link" && group(anchor) !== group(origin)) {
      throw new Refused("native_story_edit_wrapped_text");
    }
  };

  /** The formatting text written from slot `identity` starts from: the
   * slot's as the editor holds it now (as it was shown, for a slot the
   * editor no longer shows). */
  const baseFormat = (identity: string | undefined): BandRichRun | null =>
    identity === undefined
      ? null
      : (slotFormatNow.get(identity) ??
        slotHome.get(identity)?.run ??
        removedFormats.get(identity) ??
        anchorHome.get(identity) ??
        null);
  /** A slot as painted: the editor's text and formatting, Word's facts. */
  const slotPaint = (identity: string, run: BandRichRun): BandRichRun => {
    const home = slotHome.get(identity)!;
    const out: BandRichRun = { ...run, nativeTextId: identity };
    delete out.nativeFrom;
    for (const key of ["nativeRunGroup", "nativeWrapped", "frame"] as const) {
      if (home.run[key] !== undefined) (out as Record<string, unknown>)[key] = home.run[key];
      else delete (out as Record<string, unknown>)[key];
    }
    return out;
  };

  // -- each of Word's lines -------------------------------------------------
  const paintRuns = new Map<EditedParagraph, BandRichRun[]>();
  for (const entry of edited) {
    if (!entry.claimed) continue;
    const record = paragraphs.get(entry.claimed)!;
    const shownParagraph = record.paragraph;
    const now = entry.paragraph;
    for (const key of FIXED_PARAGRAPH_KEYS) {
      if (!sameValue(shownParagraph[key], now[key])) return refuse("native_story_edit_unsupported_paragraph_property");
    }
    // A line's list is its `w:numPr`, pointing into the package's numbering:
    // the lines of Word's part keep the list they have (typing in them, and
    // Enter making the next item, still act), and a change of list is said by
    // name rather than written into a definition the part does not own.
    if (!sameValue(shownParagraph.list, now.list)) return refuse("native_story_edit_list_changed");
    if (!sameValue(shownParagraph.wordArt, now.wordArt)) return refuse("native_story_edit_objects_changed");
    if (!sameValue(shownParagraph.shapes, now.shapes)) {
      const nowShapes = withMemberWords(shownParagraph.shapes ?? [], now.shapes ?? []);
      if (!sameValue(shownParagraph.shapes ?? [], nowShapes)) {
        recordDrawingEdits(shownParagraph.shapes ?? [], nowShapes, true);
      }
    }
    if (!sameValue(shownParagraph.frames, now.frames)) {
      recordDrawingEdits(shownParagraph.frames ?? [], now.frames ?? [], false);
      // A run drawn in a box the line no longer holds has nowhere to go.
      const boxes = new Set((now.frames ?? []).map((frame) => frame.index));
      if (now.runs.some((run) => run.frame !== undefined && !boxes.has(run.frame))) {
        return refuse("native_story_edit_objects_changed");
      }
    }
    if (!sameValue(shownParagraph.images, now.images)) {
      recordImageEdits(record.identity, shownParagraph.images ?? [], now.images ?? []);
    }
    const shownValues = paragraphNow(shownParagraph);
    const nowValues = paragraphNow(now);
    const edit: Record<string, unknown> = {};
    const originals: Record<string, unknown> = {};
    for (const key of PARAGRAPH_PROP_KEYS) {
      const merged = mergeEdit(
        previous?.paragraphs?.[record.identity] as Record<string, unknown> | undefined,
        previous?.originals?.paragraphs?.[record.identity] as Record<string, unknown> | undefined,
        key,
        shownValues[key],
        nowValues[key],
        (value) => originalParagraphValue(key, value),
      );
      if (!merged.keep) continue;
      edit[key] = merged.edit;
      if ("original" in merged) originals[key] = merged.original;
    }
    // A line given another style keeps the stops it shows: its own stops
    // are written against the new style's.
    if ("docxStyleId" in edit && !("tabStops" in edit)) {
      edit.tabStops = nowValues.tabStops;
      const priorEdit = previous?.paragraphs?.[record.identity];
      const priorOriginal = previous?.originals?.paragraphs?.[record.identity];
      if (priorEdit && "tabStops" in priorEdit) {
        if (priorOriginal && "tabStops" in priorOriginal) originals.tabStops = priorOriginal.tabStops;
      } else if (originalParagraphValue("tabStops", shownValues.tabStops)) {
        originals.tabStops = shownValues.tabStops;
      }
    }
    if (Object.keys(edit).length) paragraphEdits[record.identity] = edit as NativeParagraphProps;
    if (Object.keys(originals).length) paragraphOriginals[record.identity] = originals as NativeParagraphProps;

    // Items in order; atoms must be exactly the paragraph's own, in order.
    const items: Classified[] = [];
    const atoms: string[] = [];
    const counted = new Set<string>();
    let gap = 0;
    let lastSlot = -1;
    for (const run of now.runs) {
      if (run.nativeAtom !== undefined) {
        atoms.push(run.nativeAtom);
        items.push({ kind: "atom", run });
        gap += 1;
        lastSlot = -1;
        continue;
      }
      const identity = run.nativeTextId;
      const home = identity !== undefined ? slotHome.get(identity) : undefined;
      // The rest of a slot whose text Track Changes split (a deleted piece
      // kept beside the text around it, a tracked insertion inside it): one
      // slot, in pieces.
      const last = items[items.length - 1];
      if (
        identity !== undefined &&
        last?.kind === "slot" &&
        last.id === identity &&
        sameFormat(last.run, run) &&
        (run.revision || last.run.revision || last.segments)
      ) {
        last.segments = appendSegment(last.segments ?? segmentsOf(last.run), run);
        last.run = { ...last.run, text: (last.run.text ?? "") + (run.text ?? "") };
        delete last.run.revision;
        continue;
      }
      if (
        identity !== undefined &&
        home &&
        home.paragraph === record.identity &&
        home.gap === gap &&
        !counted.has(identity) &&
        slotOrder(identity) > lastSlot
      ) {
        counted.add(identity);
        lastSlot = slotOrder(identity);
        if (run.revision) {
          const plain: BandRichRun = { ...run };
          delete plain.revision;
          items.push({ kind: "slot", run: plain, id: identity, segments: segmentsOf(run) });
        } else {
          items.push({ kind: "slot", run, id: identity });
        }
        continue;
      }
      const free: BandRichRun = { ...run };
      delete free.nativeTextId;
      delete free.nativeFrom;
      delete free.nativeRunGroup;
      delete free.nativeWrapped;
      const origin = identity !== undefined && originalText.has(identity) ? identity : run.nativeFrom;
      items.push({ kind: "free", run: free, origin });
    }
    if (atoms.join("|") !== record.atoms.join("|")) return refuse("native_story_edit_fields_moved");
    const atomShown = new Map(shownParagraph.runs.filter((run) => run.nativeAtom).map((run) => [run.nativeAtom!, run]));
    for (const item of items) {
      if (item.kind !== "atom") continue;
      const was = atomShown.get(item.run.nativeAtom!)!;
      if ((was.text ?? null) !== (item.run.text ?? null) || (was.token ?? null) !== (item.run.token ?? null)) {
        return refuse("native_story_edit_fields_moved");
      }
      // Deleted with Track Changes on: a field of the line Word lets the
      // story remove is written as Word's tracked deletion of it.
      const wasRevision = JSON.stringify(was.revision ?? null);
      const nowRevision = item.run.revision ?? null;
      if (JSON.stringify(nowRevision) !== wasRevision) {
        if (was.revision !== undefined || nowRevision?.kind !== "del" || was.nativeField === undefined) {
          return refuse("native_story_edit_revision");
        }
        trackedFields[was.nativeField] = nowRevision;
        item.run = { ...was, revision: nowRevision };
        continue;
      }
      if (was.nativeField !== undefined && was.revision === undefined) delete trackedFields[was.nativeField];
      // An atom is Word's content: whatever marks the editor put on it,
      // it is painted (and written) as Word has it -- except a page-number
      // field's number format, which is written into its instruction.
      const nowFormat = item.run.nativeFieldFormat;
      if (
        was.nativeField !== undefined &&
        was.nativeFieldFormat !== undefined &&
        nowFormat !== undefined &&
        nowFormat !== was.nativeFieldFormat
      ) {
        fieldFormats[was.nativeField] = nowFormat === "none" ? null : nowFormat;
        item.run = { ...was, nativeFieldFormat: nowFormat };
      } else {
        item.run = was;
      }
    }
    // A slot is Word's `w:t`: a tab or a line break typed into it is Word's
    // own element after it, and past the length one run holds the text goes
    // on in a run of its own -- both keep the slot's run properties.
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind !== "slot") continue;
      if (item.segments) {
        // A tracked piece is one run of the slot's: no tab or line break of
        // Word's own goes inside one.
        if (/[\t\n]/.test(item.run.text ?? "")) return refuse("native_story_edit_revision");
        continue;
      }
      const characters = codePoints(item.run.text ?? "");
      let cut = characters.findIndex((character) => character === "\t" || character === "\n");
      if (cut < 0 && characters.length > MAX_RUN_TEXT) cut = MAX_RUN_TEXT;
      if (cut < 0) continue;
      const rest: BandRichRun = { ...item.run, text: characters.slice(cut).join("") };
      delete rest.nativeTextId;
      delete rest.nativeRunGroup;
      delete rest.nativeWrapped;
      item.run = { ...item.run, text: characters.slice(0, cut).join("") };
      items.splice(index + 1, 0, { kind: "free", run: rest, origin: item.id });
    }
    // Text typed right after a slot in the slot's own formatting is that
    // slot's text (Word extends the run the caret is in); text typed at the
    // front of a line joins its first slot the same way. Text that MOVED
    // keeps its own run unless that run is this very slot's.
    for (let merged = true; merged; ) {
      merged = false;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item.kind !== "free" || item.run.token || item.run.nativeNewField || /[\t\n]/.test(item.run.text ?? "")) continue;
        const previousItem = items[index - 1];
        const nextItem = items[index + 1];
        const joinsAfter =
          previousItem?.kind === "slot" &&
          (item.origin === undefined || item.origin === previousItem.id) &&
          sameFormat(previousItem.run, item.run) &&
          codePoints((previousItem.run.text ?? "") + (item.run.text ?? "")).length <= MAX_RUN_TEXT;
        const joinsBefore =
          !joinsAfter &&
          item.origin === undefined &&
          (previousItem === undefined || previousItem.kind === "atom") &&
          nextItem?.kind === "slot" &&
          sameFormat(nextItem.run, item.run) &&
          codePoints((item.run.text ?? "") + (nextItem.run.text ?? "")).length <= MAX_RUN_TEXT;
        if (joinsAfter && (item.run.revision || previousItem.segments)) {
          // Typed with Track Changes on: a tracked piece of the slot.
          previousItem.segments = appendSegment(previousItem.segments ?? segmentsOf(previousItem.run), item.run);
          previousItem.run = { ...previousItem.run, text: (previousItem.run.text ?? "") + (item.run.text ?? "") };
        } else if (joinsBefore && (item.run.revision || nextItem.segments)) {
          nextItem.segments = [...segmentsOf(item.run), ...(nextItem.segments ?? segmentsOf(nextItem.run))];
          nextItem.run = { ...nextItem.run, text: (item.run.text ?? "") + (nextItem.run.text ?? "") };
        } else if (joinsAfter) {
          previousItem.run = { ...previousItem.run, text: (previousItem.run.text ?? "") + (item.run.text ?? "") };
        } else if (joinsBefore) {
          nextItem.run = { ...nextItem.run, text: (item.run.text ?? "") + (nextItem.run.text ?? "") };
        } else {
          continue;
        }
        items.splice(index, 1);
        merged = true;
        break;
      }
    }
    // Every counted slot's text and formatting.
    for (const item of items) {
      if (item.kind !== "slot") continue;
      const home = slotHome.get(item.id!)!;
      const pieces = item.segments ? joinSegments(item.segments) : null;
      if (pieces?.some((piece) => piece.revision)) {
        if (codePoints(item.run.text ?? "").length > MAX_RUN_TEXT * 4) throw new Refused("native_story_edit_invalid");
        tracked[item.id!] = pieces;
        delete nextText[item.id!];
      } else {
        delete tracked[item.id!];
        setText(item.id!, item.run.text ?? "");
      }
      recordRunEdit(item.id!, home.run, item.run);
      slotFormatNow.set(item.id!, item.run);
    }
    // Every other run goes after the slot before it, starting from the run
    // properties of the slot it came from (text typed there: of the text
    // before it); runs in front of a gap's first slot take a slot the gap
    // left empty.
    const runsOut: BandRichRun[] = [];
    let gapIndex = 0;
    let gapStart = 0;
    let anchor: string | undefined;
    let lastOrigin: string | undefined;
    let leading: Classified[] = [];
    const place = (at: string, item: Classified, from: string | undefined): BandRichRun => {
      assertPlacement(item.origin, at);
      const base = baseFormat(from ?? at);
      const diff = formatDiff(base, item.run);
      if (diff.unwritable) throw new Refused("native_story_edit_unsupported_run_property");
      for (const piece of item.run.token || item.run.nativeNewField ? [null] : chunks(item.run.text ?? "")) {
        const written: NativeRun = writtenContent(item.run, piece);
        if (from !== undefined && from !== at) written.from = from;
        if (item.run.revision) {
          // Only typing is tracked where no slot of Word's stood.
          if (item.run.revision.kind !== "ins") throw new Refused("native_story_edit_revision");
          written.revision = item.run.revision;
        }
        if (Object.keys(diff.props).length) written.props = diff.props;
        (inserted[at] ??= []).push(written);
      }
      // Drawn where it is written: in the anchor's text box, if it has one.
      const run: BandRichRun = { ...item.run };
      const frame = (slotHome.get(at)?.run ?? anchorHome.get(at))?.frame;
      if (frame !== undefined) run.frame = frame;
      else delete run.frame;
      // It keeps the run it was written from through later edits.
      if (from !== undefined) run.nativeFrom = from;
      return run;
    };
    const flushGap = () => {
      const slots = record.gaps[gapIndex] ?? [];
      const firstCounted = slots.find((slot) => counted.has(slot));
      const empty = leading.length
        ? slots.find((slot) => !counted.has(slot) && (firstCounted === undefined || slotOrder(slot) < slotOrder(firstCounted)))
        : undefined;
      // No slot of the gap is left empty for them: what leads the gap goes
      // right after the run of Word's that the atom before it ends -- after
      // the tab, after the whole field -- as Word types there, in that run's
      // properties. Where no such run may be followed (inside a field, a
      // link, a content control), it cannot be written.
      const after = gapIndex > 0 ? record.anchors[gapIndex - 1] : undefined;
      if (leading.length && !empty) {
        if (!after) throw new Refused("native_story_edit_unanchored_text");
        let previousOrigin: string | undefined;
        for (const item of leading) {
          const from: string | undefined = item.origin ?? previousOrigin;
          runsOut[runsOut.indexOf(item.run)] = place(after, item, from);
          previousOrigin = from;
        }
        leading = [];
      }
      if (leading.length && empty) {
        const home = slotHome.get(empty)!;
        const [first] = leading;
        const firstIndex = runsOut.indexOf(first.run);
        counted.add(empty);
        let rest = leading;
        let previousOrigin: string | undefined = empty;
        if (
          first.origin === undefined &&
          !first.run.token &&
          !first.run.nativeNewField &&
          !/[\t\n]/.test(first.run.text ?? "") &&
          codePoints(first.run.text ?? "").length <= MAX_RUN_TEXT
        ) {
          // Typed where the line leaves an empty slot: that slot's text, in
          // the formatting Word gives typing there.
          setText(empty, first.run.text ?? "");
          recordRunEdit(empty, home.run, first.run);
          slotFormatNow.set(empty, first.run);
          runsOut[firstIndex] = slotPaint(empty, first.run);
          rest = leading.slice(1);
        } else {
          // Anything else goes right after the slot, which stays empty.
          setText(empty, "");
          runsOut.splice(firstIndex, 0, { ...home.run, text: "" });
        }
        for (const item of rest) {
          const from: string | undefined = item.origin ?? previousOrigin;
          runsOut[runsOut.indexOf(item.run)] = place(empty, item, from);
          previousOrigin = from;
        }
      }
      // A slot of this gap the line no longer shows is emptied, and drawn
      // as an empty run where it was, so a later edit still finds it.
      for (const slot of slots) {
        if (counted.has(slot)) continue;
        const home = slotHome.get(slot)!;
        setText(slot, "");
        const placeholder: BandRichRun = { ...home.run, text: "" };
        const nextCounted = runsOut.findIndex(
          (run, index) =>
            index >= gapStart &&
            run.nativeTextId !== undefined &&
            counted.has(run.nativeTextId) &&
            slotOrder(run.nativeTextId) > slotOrder(slot),
        );
        runsOut.splice(nextCounted < 0 ? runsOut.length : nextCounted, 0, placeholder);
      }
      leading = [];
      anchor = undefined;
      lastOrigin = undefined;
    };
    for (const item of items) {
      if (item.kind === "atom") {
        flushGap();
        runsOut.push(item.run);
        gapIndex += 1;
        gapStart = runsOut.length;
        continue;
      }
      if (item.kind === "slot") {
        anchor = item.id;
        lastOrigin = item.id;
        const pieces = item.segments ? joinSegments(item.segments) : null;
        if (pieces?.some((piece) => piece.revision)) {
          for (const piece of pieces) {
            const run = slotPaint(item.id!, { ...item.run, text: piece.text });
            runsOut.push(piece.revision ? { ...run, revision: piece.revision } : run);
          }
        } else {
          runsOut.push(slotPaint(item.id!, item.run));
        }
        continue;
      }
      if (anchor === undefined) {
        leading.push(item);
        runsOut.push(item.run);
        continue;
      }
      const from: string | undefined = item.origin ?? lastOrigin;
      runsOut.push(place(anchor, item, from));
      lastOrigin = from;
    }
    flushGap();
    paintRuns.set(entry, runsOut);
  }

  // -- new lines ------------------------------------------------------------
  const flow = editedBlocks.map((block) =>
    block.type === "paragraph" ? (edited.find((entry) => entry.paragraph === block) ?? null) : null,
  );
  const newParagraphPaint = new Map<BandRichParagraph, { runs: BandRichRun[]; from: string }>();
  for (let index = 0; index < flow.length; index += 1) {
    const entry = flow[index];
    if (!entry || entry.claimed) continue;
    let end = index;
    while (end + 1 < flow.length && flow[end + 1] && !flow[end + 1]!.claimed) end += 1;
    const group = flow.slice(index, end + 1) as EditedParagraph[];
    const previousEntry = flow[index - 1];
    const nextEntry = flow[end + 1];
    const anchorEntry = previousEntry?.claimed ? previousEntry : nextEntry?.claimed ? nextEntry : null;
    if (!anchorEntry) return refuse("native_story_edit_unanchored_paragraph");
    const created: NativeNewParagraph[] = [];
    for (const item of group) {
      const paragraph = item.paragraph;
      if (OBJECT_KEYS.some((key) => (paragraph[key]?.length ?? 0) > 0)) return refuse("native_story_edit_objects_changed");
      // Enter copies the paragraph properties of the line it split (the
      // editor keeps that line's id on the part that is new, except at its
      // end; a line added before keeps the one it was made from), as Word
      // does; the line next to it otherwise.
      const own = paragraph.nativeParagraphId ?? paragraph.nativeFrom;
      const sourceEntry = own !== undefined && claimed.has(own) ? claimed.get(own)! : anchorEntry;
      const source = sourceEntry.claimed!;
      const sourceNow = sourceEntry.paragraph;
      // What the band shows of the copied properties must be what it shows
      // of that line.
      for (const key of FIXED_PARAGRAPH_KEYS) {
        if (!sameValue(sourceNow[key], paragraph[key])) return refuse("native_story_edit_unsupported_paragraph_property");
      }
      // Enter in a list item makes the next item: the new line's properties
      // are its line's, numbering included, as Word copies them.
      if (!sameValue(sourceNow.list, paragraph.list)) return refuse("native_story_edit_list_changed");
      const sourceValues = paragraphNow(sourceNow);
      const values = paragraphNow(paragraph);
      const props: Record<string, unknown> = {};
      for (const key of PARAGRAPH_PROP_KEYS) {
        if (!sameValue(sourceValues[key], values[key])) props[key] = values[key];
      }
      if ("docxStyleId" in props && !("tabStops" in props)) props.tabStops = values.tabStops;
      // Typing on the new line starts from the formatting where Enter was
      // pressed: the end of the line it follows, the start of one it precedes
      // -- never from a link's or a text box's run, which the line is not in.
      const sourceSlots = (paintRuns.get(sourceEntry) ?? []).filter(
        (run) => run.nativeTextId !== undefined && !slotHome.get(run.nativeTextId)?.run.nativeWrapped,
      );
      let lastOrigin =
        edited.indexOf(sourceEntry) < edited.indexOf(item)
          ? sourceSlots[sourceSlots.length - 1]?.nativeTextId
          : sourceSlots[0]?.nativeTextId;
      const runs: NativeRun[] = [];
      const painted: BandRichRun[] = [];
      for (const run of paragraph.runs) {
        if (run.nativeAtom !== undefined) return refuse("native_story_edit_fields_moved");
        if (!run.token && !run.text && !run.nativeNewField) continue;
        const moved =
          run.nativeTextId !== undefined && originalText.has(run.nativeTextId) ? run.nativeTextId : run.nativeFrom;
        // Text of a hyperlink, a content control or a text box keeps its place.
        if (moved !== undefined && slotHome.get(moved)?.run.nativeWrapped) {
          return refuse("native_story_edit_wrapped_text");
        }
        const from = moved ?? lastOrigin;
        const diff = formatDiff(baseFormat(from), run);
        if (diff.unwritable) return refuse("native_story_edit_unsupported_run_property");
        for (const piece of run.token || run.nativeNewField ? [null] : chunks(run.text ?? "")) {
          const written: NativeRun = writtenContent(run, piece);
          if (from !== undefined) written.from = from;
          if (Object.keys(diff.props).length) written.props = diff.props;
          runs.push(written);
        }
        const paintedRun: BandRichRun = { ...run };
        delete paintedRun.nativeTextId;
        delete paintedRun.nativeAtom;
        delete paintedRun.nativeRunGroup;
        delete paintedRun.nativeWrapped;
        delete paintedRun.nativeFrom;
        if (from !== undefined) paintedRun.nativeFrom = from;
        painted.push(paintedRun);
        lastOrigin = from;
      }
      newParagraphPaint.set(paragraph, { runs: painted, from: source });
      const made: NativeNewParagraph = { type: "paragraph", from: source, runs: joinRuns(runs) };
      if (Object.keys(props).length) made.props = props as NativeParagraphProps;
      created.push(made);
    }
    const anchor = anchorEntry.claimed!;
    if (anchorEntry === previousEntry) after[anchor] = created;
    else before[anchor] = created;
    index = end;
  }

  // -- runs of Word's that share one run must keep one formatting -------------
  const groups = new Map<string, string[]>();
  for (const [identity, home] of slotHome) {
    const group = home.run.nativeRunGroup;
    if (group !== undefined) groups.set(group, [...(groups.get(group) ?? []), identity]);
  }
  // A slot this commit did not reformat keeps its edit (and what it was
  // before it): an emptied slot, or one of a removed line whose moved text
  // starts from its formatting.
  for (const [identity, props] of Object.entries(previous?.runs ?? {})) {
    if (recordedRuns.has(identity) || !originalText.has(identity) || boxSlots.has(identity)) continue;
    runEdits[identity] = props;
    const original = previous?.originals?.runs?.[identity];
    if (original) runOriginals[identity] = original;
  }
  for (const members of groups.values()) {
    const first = canonical(runEdits[members[0]] ?? {});
    if (members.some((identity) => canonical(runEdits[identity] ?? {}) !== first)) {
      return refuse("native_story_edit_split_run");
    }
  }

  // Consecutive text from the same run in the same formatting is one run.
  for (const [anchorId, list] of Object.entries(inserted)) inserted[anchorId] = joinRuns(list);
  const nativeEdits: NativeStoryEdits = {};
  // A story whose tracked changes were accepted or rejected stays so: an
  // edit after it is the edit of the settled story.
  if (previous?.revisions) nativeEdits.revisions = previous.revisions;
  if (Object.keys(paragraphEdits).length) nativeEdits.paragraphs = paragraphEdits;
  if (Object.keys(runEdits).length) nativeEdits.runs = runEdits;
  if (Object.keys(inserted).length) nativeEdits.insertedRuns = inserted;
  if (Object.keys(before).length) nativeEdits.paragraphsBefore = before;
  if (Object.keys(after).length) nativeEdits.paragraphsAfter = after;
  if (deleted.size) nativeEdits.deletedParagraphs = [...deleted];
  if (deletedFields.size) nativeEdits.deletedFields = [...deletedFields];
  for (const slot of boxSlots) delete tracked[slot];
  if (Object.keys(tracked).length) nativeEdits.trackedText = tracked;
  for (const field of deletedFields) delete trackedFields[field];
  if (Object.keys(trackedFields).length) nativeEdits.trackedDeletedFields = trackedFields;
  for (const field of deletedFields) delete fieldFormats[field];
  if (Object.keys(fieldFormats).length) nativeEdits.fieldFormats = fieldFormats;
  for (const line of deleted) delete pictures[line];
  if (Object.keys(pictures).length) nativeEdits.pictures = pictures;
  if (Object.keys(objects).length) nativeEdits.objects = objects;
  if (Object.keys(memberWords).length) nativeEdits.memberWords = memberWords;
  const originalsOut: NonNullable<NativeStoryEdits["originals"]> = {};
  if (Object.keys(paragraphOriginals).length) originalsOut.paragraphs = paragraphOriginals;
  if (Object.keys(runOriginals).length) originalsOut.runs = runOriginals;
  const movedFrom = new Set(
    [...Object.values(inserted).flat(), ...[...Object.values(before), ...Object.values(after)].flat().flatMap((line) => line.runs)]
      .flatMap((run) => (run.from !== undefined ? [run.from] : [])),
  );
  const removedRuns: Record<string, NativeRunProps> = {};
  for (const [slot, run] of removedFormats) if (movedFrom.has(slot)) removedRuns[slot] = propsOfRun(run);
  if (Object.keys(removedRuns).length) originalsOut.removedRuns = removedRuns;
  const substantive = Object.keys(nativeEdits).length > 0;
  if (substantive && Object.keys(originalsOut).length) nativeEdits.originals = originalsOut;
  const slotIds = new Set(originalText.keys());
  const normalized = substantive ? normalizeNativeStoryEdits(nativeEdits, slotIds) : null;
  if (substantive && !normalized) return refuse("native_story_edit_invalid");

  // -- the band to paint --------------------------------------------------
  const paintParagraph = (paragraph: BandRichParagraph): BandRichParagraph => {
    const entry = edited.find((item) => item.paragraph === paragraph);
    const out: BandRichParagraph = { ...paragraph };
    delete out.nativeParagraphId;
    delete out.nativeRemovable;
    delete out.nativeFrom;
    if (entry?.claimed) {
      out.nativeParagraphId = entry.claimed;
      const removal = paragraphs.get(entry.claimed)?.removal;
      if (removal) out.nativeRemovable = removal;
      out.runs = paintRuns.get(entry) ?? paragraph.runs;
    } else {
      const made = newParagraphPaint.get(paragraph);
      out.runs = made?.runs ?? paragraph.runs;
      if (made) out.nativeFrom = made.from;
    }
    return out;
  };
  let paintTable = -1;
  const paint = normalizeBandRichBlocks(
    editedBlocks.map((block) => {
      if (block.type === "paragraph") return paintParagraph(block);
      paintTable += 1;
      // The grid is Word's: each cell keeps the row and column it was drawn at.
      const shownCells = shownTables[paintTable].cells;
      return {
        ...block,
        cells: block.cells.map((cell, cellIndex) => ({
          ...cell,
          row: shownCells[cellIndex].row,
          col: shownCells[cellIndex].col,
          ...(cell.paragraphs?.length ? { paragraphs: cell.paragraphs.map(paintParagraph) } : {}),
        })),
      };
    }),
    true,
  );
  if (!paint) return refuse("native_story_edit_invalid");
  return { ok: true, textEdits: nextText, nativeEdits: normalized, paint };
}

/** A run's text as one tracked piece (its revision, if any). */
function segmentsOf(run: BandRichRun): NativeTrackedSegment[] {
  const text = run.text ?? "";
  if (!text) return [];
  return [run.revision ? { text, revision: run.revision } : { text }];
}

function appendSegment(segments: NativeTrackedSegment[], run: BandRichRun): NativeTrackedSegment[] {
  return [...segments, ...segmentsOf(run)];
}

/** Pieces in order, alike neighbours (same revision) joined, empty ones out. */
function joinSegments(segments: readonly NativeTrackedSegment[]): NativeTrackedSegment[] {
  const out: NativeTrackedSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = out[out.length - 1];
    if (last && JSON.stringify(last.revision ?? null) === JSON.stringify(segment.revision ?? null)) {
      out[out.length - 1] = { ...last, text: last.text + segment.text };
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

/** What a band run writes: its field, a new field with the result it shows,
 * or a piece of its text. */
function writtenContent(run: BandRichRun, piece: string | null): NativeRun {
  if (run.token) return run.fieldFormat ? { token: run.token, format: run.fieldFormat } : { token: run.token };
  if (run.nativeNewField) {
    const result = run.text ?? "";
    return { field: { ...run.nativeNewField, ...(result ? { result } : {}) } };
  }
  return { text: piece ?? "" };
}

/** A slot's formatting as the model keeps it (what it was when its line was
 * removed); a value the model cannot hold is left out. */
function propsOfRun(run: BandRichRun): NativeRunProps {
  const values = format(run);
  const out: NativeRunProps = {};
  for (const key of ["bold", "italic", "underline"] as const) out[key] = values[key] as boolean;
  if (originalRunValue("sizePt", values.sizePt)) out.sizePt = values.sizePt as number | null;
  if (originalRunValue("color", values.color)) out.color = values.color as string | null;
  const font: { ascii?: string | null; eastAsia?: string | null } = {};
  if (originalRunValue("fontAscii", values.fontAscii)) font.ascii = values.fontAscii as string | null;
  if (originalRunValue("fontEastAsia", values.fontEastAsia)) font.eastAsia = values.fontEastAsia as string | null;
  if (Object.keys(font).length) out.font = font;
  return out;
}

function runOfProps(props: NativeRunProps): BandRichRun {
  const run: BandRichRun = {};
  if (props.bold) run.bold = true;
  if (props.italic) run.italic = true;
  if (props.underline) run.underline = true;
  if (typeof props.sizePt === "number") run.sizePt = props.sizePt;
  if (typeof props.color === "string") run.color = props.color;
  const font = { ...(props.font?.ascii ? { ascii: props.font.ascii } : {}), ...(props.font?.eastAsia ? { eastAsia: props.font.eastAsia } : {}) };
  if (Object.keys(font).length) run.font = font;
  return run;
}

/** Consecutive runs of text that start from the same run with the same
 * changes are one run, as the editor holds them. */
function joinRuns(runs: NativeRun[]): NativeRun[] {
  const out: NativeRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (
      last &&
      "text" in last &&
      "text" in run &&
      last.from === run.from &&
      JSON.stringify(last.props ?? {}) === JSON.stringify(run.props ?? {}) &&
      JSON.stringify(last.revision ?? null) === JSON.stringify(run.revision ?? null) &&
      codePoints(last.text + run.text).length <= MAX_RUN_TEXT
    ) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
      continue;
    }
    out.push(run);
  }
  return out;
}

/** True for a band run the story editor treats as Word's own, not typed. */
export function isNativeAtomRun(run: BandRichRun): boolean {
  return isNativeBandAtomId(run.nativeAtom);
}

/** True for a band run that is one of Word's typable text slots. */
export function isNativeSlotRun(run: BandRichRun): boolean {
  return isNativeBandTextId(run.nativeTextId);
}
