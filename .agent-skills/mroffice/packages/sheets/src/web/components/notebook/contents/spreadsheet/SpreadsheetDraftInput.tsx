"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useReducer, type ChangeEvent, type CompositionEvent, type CSSProperties, type FocusEvent, type ForwardedRef, type KeyboardEvent, type ComponentPropsWithoutRef } from "react";
import { flushSync } from "react-dom";
import {
  holdOfficeTextBoxForChrome,
  officeBlurKeepsCellEntry,
  officeChromeKeepsCellEntry,
  officeShowMirroredSelection,
} from "@mrnote/core/web/lib/office-inactive-selection.ts";
import { formulaReferenceRuns } from "@mrnote/core/web/lib/spreadsheet/formula-reference-highlight.ts";
import { SPREADSHEET_SCRIPT_FONT_SCALE } from "@mrnote/core/web/lib/spreadsheet/cell-text-effects.ts";
import PresentationCellRichTextEditor, { type PresentationCellTextElement } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";
import {
  normalizeCellRuns,
  runsForEditedText,
  runsFromText,
  textFromRuns,
  type RunStyle as CellRunStyle,
  type TextRun as CellTextRun,
} from "@mrnote/core/web/lib/spreadsheet/cell-rich-text.ts";

/** The text of the cell being edited, shared by the two editors of that cell.
 * Excel shows every keystroke in both the cell and the formula bar while an
 * entry is open, and commits or cancels them together. The input holding the
 * private draft writes it here; any other input bound to the same cell shows it
 * in place of the committed value until the draft is committed or discarded. */
export interface SpreadsheetLiveEdit {
  read(identity: string, reader: object): string | null;
  write(identity: string, writer: object, text: string): void;
  release(writer: object): void;
  subscribe(listener: () => void): () => void;
  /** The characters the entry's editor has selected, for the other editor
   * of the same cell to show (the formula bar shows the cell's selection and
   * the cell the formula bar's, as Excel and WPS do). Null: no selection. */
  readSelection(identity: string, reader: object): SpreadsheetLiveSelection | null;
  writeSelection(identity: string, writer: object, selection: SpreadsheetLiveSelection | null): void;
  /** Lets `input` take over an open entry of the cell `identity`. `source`,
   * when given, is the cell source the entry was typed over; an editor
   * showing a different source refuses it. */
  enroll(
    input: EventTarget,
    identity: string,
    adopt: (text: string, source?: unknown) => boolean,
    /** Give up the open entry this editor holds (no commit): its text,
     * caret and focus, or null when it holds none it can give. */
    surrender?: () => SpreadsheetSurrenderedEntry | null,
    /** The writer this editor writes its entry under. */
    writer?: object,
  ): () => void;
  /** Hands an open entry to `target` when focus moves straight to the other
   * editor of the same cell. False leaves the entry with its editor. */
  handOff(identity: string, target: EventTarget | null, text: string): boolean;
  /** The editor holding an open entry is unmounting while the entry is still
   * open (the virtual grid scrolled its cell away). The entry stays open:
   * the other editor of the cell (the formula bar) takes it over, with the
   * focus when the editor had it, and a remounted editor of the cell takes
   * it back with its caret. */
  park(identity: string, text: string, source: unknown, caret: [number, number] | null, focused: boolean): void;
  /** For an editor of `identity` that just mounted: the parked entry it
   * takes back, or null. */
  claim(identity: string, input: HTMLInputElement, source: unknown): { text: string; caret: [number, number] | null; focus: boolean; holder: HTMLInputElement | HTMLTextAreaElement | null;
    /** Keys pressed in the editor a relocated entry left, before this one
     * took it over: replayed here, in order, once it has the focus. */
    keys?: SpreadsheetForwardedKey[] } | null;
  /** An open entry of `identity` no mounted editor holds. */
  hasParked(identity: string): boolean;
  /** A collaborator's row/column edit moved the cell `from` edits to `to`
   * (`toSource`: the moved cell's source there). The entry leaves its editor
   * uncommitted and the same kind of editor of `to` takes it over, with its
   * caret and the focus. False when no entry of `from` is open. */
  relocate(from: string, to: string, toSource: unknown): boolean;
  /** Drop the open entry of `identity` without committing it (its cell was
   * deleted by a collaborator). False when none is open. */
  surrender(identity: string): boolean;
  /** The identity of the open entry (held by an editor or waiting to be
   * taken over), or null. */
  openIdentity(): string | null;
  /** Typing that reached the editor a relocated entry just left, before the
   * editor it moves to took it over, belongs to the moved entry: `edit`
   * applies it to the entry's text and caret. True when `input` is that
   * editor and the entry was updated. */
  forward(input: EventTarget, edit: (text: string, caret: [number, number] | null) => { text: string; caret: [number, number] }): boolean;
  /** A key that commits, cancels or navigates, pressed in the editor a
   * relocated entry left before the editor it moves to took it over: that
   * editor replays it. False when `input` left no such entry. */
  forwardKey(input: EventTarget, key: SpreadsheetForwardedKey): boolean;
}
export interface SpreadsheetForwardedKey {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}
export interface SpreadsheetSurrenderedEntry {
  text: string;
  caret: [number, number] | null;
  focused: boolean;
  /** The grid cell's editor (true) or the formula bar (false). */
  cell: boolean;
}
export type SpreadsheetLiveSelection = Readonly<{ start: number; end: number }>;
export function createSpreadsheetLiveEdit(): SpreadsheetLiveEdit {
  let entry: { identity: string; writer: object; text: string } | null = null;
  let selection: { identity: string; writer: object; range: SpreadsheetLiveSelection } | null = null;
  // A parked entry: `holder` is the editor that took it over, null while no
  // mounted editor holds it (then `entry.writer` is `orphan`).
  let parked: { identity: string; text: string; source: unknown; caret: [number, number] | null; focused: boolean; holder: HTMLInputElement | HTMLTextAreaElement | null; orphan: object;
    /** A relocated entry: only this kind of editor takes it, and the editor
     * it left may still hold the focus it hands over. */
    relocated?: { cell: boolean; from: EventTarget; keys?: SpreadsheetForwardedKey[] } } | null = null;
  const listeners = new Set<() => void>();
  const editors = new Map<EventTarget, { identity: string; adopt: (text: string, source?: unknown) => boolean; surrender?: () => SpreadsheetSurrenderedEntry | null; writer?: object }>();
  const surrenderFrom = (identity: string): { taken: SpreadsheetSurrenderedEntry; from: EventTarget } | null => {
    for (const [target, editor] of editors) {
      if (!editor.surrender) continue;
      // The editor of `identity`, or the one holding the entry `identity`
      // names: an entry carried into a renewed load generation keeps the
      // identity it was last written under until its next keystroke.
      const holds = entry !== null && entry.identity === identity && editor.writer !== undefined && entry.writer === editor.writer;
      if (editor.identity !== identity && !holds) continue;
      const taken = editor.surrender();
      if (taken) return { taken, from: target };
    }
    return null;
  };
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    read: (identity, reader) => entry !== null && entry.identity === identity && entry.writer !== reader ? entry.text : null,
    write(identity, writer, text) {
      if (entry?.identity === identity && entry.writer === writer && entry.text === text) return;
      if (parked && parked.identity !== identity) parked = null;
      if (selection && (selection.identity !== identity || selection.writer !== writer)) selection = null;
      entry = { identity, writer, text }; notify();
    },
    release(writer) {
      if (selection?.writer === writer) selection = null;
      if (entry?.writer !== writer) return;
      entry = null; parked = null; notify();
    },
    readSelection: (identity, reader) =>
      selection !== null && selection.identity === identity && selection.writer !== reader ? selection.range : null,
    writeSelection(identity, writer, range) {
      const same = (a: SpreadsheetLiveSelection | null, b: SpreadsheetLiveSelection | null) =>
        a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end);
      if (range === null) {
        if (selection === null || selection.writer !== writer) return;
        selection = null; notify();
        return;
      }
      if (selection?.identity === identity && selection.writer === writer && same(selection.range, range)) return;
      selection = { identity, writer, range }; notify();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    enroll(input, identity, adopt, surrender, writer) {
      const editor = { identity, adopt, surrender, writer };
      editors.set(input, editor);
      return () => { if (editors.get(input) === editor) editors.delete(input); };
    },
    handOff(identity, target, text) {
      const editor = target ? editors.get(target) : undefined;
      return editor?.identity === identity && editor.adopt(text);
    },
    park(identity, text, source, caret, focused) {
      const orphan = {};
      const record = { identity, text, source, caret, focused, holder: null as HTMLInputElement | HTMLTextAreaElement | null, orphan };
      parked = record;
      // The entry now belongs to no mounted editor; the leaving editor's own
      // release no longer clears it.
      entry = { identity, writer: orphan, text }; notify();
      // After this commit, when the leaving editor has unenrolled and the
      // other editor shows the cell as it is now, offer it the entry.
      queueMicrotask(() => {
        if (parked !== record || entry?.writer !== orphan) return;
        for (const [target, editor] of editors) {
          if (editor.identity !== identity || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !target.isConnected) continue;
          if (!editor.adopt(text, source)) continue;
          record.holder = target;
          const active = document.activeElement;
          if (focused && (!active || active === document.body)) focusWithCaret(target, caret, text);
          return;
        }
      });
    },
    claim(identity, input, source) {
      const record = parked;
      if (!record || record.identity !== identity || record.holder === input) return null;
      if (record.relocated && record.relocated.cell !== input.hasAttribute("data-editing")) return null;
      parked = null;
      if (record.source !== source) {
        if (entry?.writer === record.orphan) { entry = null; notify(); }
        return null;
      }
      if (record.holder) {
        // Taken over by the other editor: move it back only while that editor
        // still holds the focus it was given.
        const holder = record.holder;
        if (!record.focused || document.activeElement !== holder) return null;
        return { text: holder.value, caret: [holder.selectionStart ?? holder.value.length, holder.selectionEnd ?? holder.value.length], focus: true, holder };
      }
      if (entry?.writer !== record.orphan) return null;
      const active = document.activeElement;
      return { text: record.text, caret: record.caret, holder: null,
        focus: record.focused && (!active || active === document.body || active === record.relocated?.from),
        ...(record.relocated?.keys?.length ? { keys: record.relocated.keys } : {}) };
    },
    hasParked: (identity) => parked !== null && parked.identity === identity && parked.holder === null && entry?.writer === parked.orphan,
    relocate(from, to, toSource) {
      if (parked && parked.identity === from && parked.holder === null && entry?.writer === parked.orphan) {
        // Parked while its cell was scrolled away: it now belongs to `to`.
        parked = { ...parked, identity: to, source: toSource };
        entry = { identity: to, writer: parked.orphan, text: parked.text }; notify();
        return true;
      }
      const surrendered = surrenderFrom(from);
      if (!surrendered) return false;
      const { taken } = surrendered;
      const orphan = {};
      parked = { identity: to, text: taken.text, source: toSource, caret: taken.caret, focused: taken.focused, holder: null, orphan,
        relocated: { cell: taken.cell, from: surrendered.from } };
      entry = { identity: to, writer: orphan, text: taken.text };
      selection = null; notify();
      return true;
    },
    openIdentity: () => entry?.identity ?? null,
    forwardKey(input, key) {
      if (!parked || parked.holder !== null || !parked.relocated || parked.relocated.from !== input || entry?.writer !== parked.orphan) return false;
      parked = { ...parked, relocated: { ...parked.relocated, keys: [...(parked.relocated.keys ?? []), { ...key }] } };
      return true;
    },
    forward(input, edit) {
      if (!parked || parked.holder !== null || parked.relocated?.from !== input || entry?.writer !== parked.orphan) return false;
      const next = edit(parked.text, parked.caret);
      parked = { ...parked, text: next.text, caret: next.caret };
      entry = { identity: parked.identity, writer: parked.orphan, text: next.text }; notify();
      return true;
    },
    surrender(identity) {
      if (parked && parked.identity === identity && parked.holder === null && entry?.writer === parked.orphan) {
        parked = null; entry = null; notify();
        return true;
      }
      if (!surrenderFrom(identity)) return false;
      if (entry?.identity === identity) entry = null;
      selection = null; notify();
      return true;
    },
  };
}
/** Focus `input` and put the caret back where the entry had it, again after
 * the frame in which the host reacts to the focus (starting Edit mode
 * re-renders the input and may move the caret to the end). */
function focusWithCaret(input: HTMLInputElement | HTMLTextAreaElement, caret: [number, number] | null, text?: string) {
  input.focus({ preventScroll: true });
  if (!caret) return;
  const place = () => {
    if (document.activeElement !== input) return;
    // Once the entry holds more than it had (a key typed in the frame since),
    // the caret the typing left is the caret: putting the old one back made
    // the next keys land before that character ("…ni3" + "fb" became
    
    if (text !== undefined && input.value !== text) return;
    try { input.setSelectionRange(Math.min(caret[0], input.value.length), Math.min(caret[1], input.value.length)); } catch { /* not a text input */ }
  };
  place();
  requestAnimationFrame(place);
}

interface TypedEdit { removed: number; inserted: string }
/** What one change did to an element that showed `shown`: characters it
 * removed and the text it inserted in their place. */
function typedEditAgainst(shown: string, now: string): TypedEdit {
  let start = 0;
  while (start < shown.length && start < now.length && shown[start] === now[start]) start += 1;
  let end = 0;
  while (end < shown.length - start && end < now.length - start &&
    shown[shown.length - 1 - end] === now[now.length - 1 - end]) end += 1;
  return { removed: shown.length - start - end, inserted: now.slice(start, now.length - end) };
}
/** The same keystroke at the entry's own caret: typing replaces the
 * selection, a deletion without one removes the characters before it. */
function applyTypedEdit(text: string, caret: [number, number] | null, edit: TypedEdit): { text: string; caret: [number, number] } {
  let start = Math.max(0, Math.min(caret?.[0] ?? text.length, text.length));
  const end = Math.max(start, Math.min(caret?.[1] ?? start, text.length));
  if (start === end && !edit.inserted) start = Math.max(0, start - edit.removed);
  const next = text.slice(0, start) + edit.inserted + text.slice(end);
  const at = start + edit.inserted.length;
  return { text: next, caret: [at, at] };
}

export interface SpreadsheetEditorGrowRoom {
  align: "left" | "right" | "center";
  /** Room before the cell (inline start), px. */
  start: number;
  /** Room after the cell (inline end), px. */
  end: number;
}

export interface SpreadsheetMultilineLayout {
  align: "top" | "middle" | "bottom";
  /** A multiple of the font size, or the font's own line box ("normal"):
   * an imported workbook's native paragraphs are drawn in the font's line
   * box, and an entry edited in 1.15 lines drifted up off them line by line. */
  lineHeight: number | "normal";
  singleLineHeightPx: number;
}

export interface SpreadsheetDraftExitRequest {
  event: KeyboardEvent<HTMLInputElement>;
  value: string;
  draftIdentity: string;
  sourceIdentity: unknown;
}

export type SpreadsheetDraftPublishResult = "accepted" | "rejected" | "discarded";

export interface SpreadsheetDraftPublishRequest {
  input: HTMLInputElement;
  value: string;
  draftIdentity: string;
  sourceIdentity: unknown;
  revision: object;
  signal: AbortSignal;
  trigger: "blur" | "Enter" | "Tab" | "save" | "flush";
  shiftKey: boolean;
  /** Still the same private text/source even if focus moves elsewhere. */
  isCurrent(): boolean;
}

/**
 * Put `text` over [start, end) of a draft editor as a typed edit: through the
 * browser's own insertText, so the edit joins the editor's native undo
 * history and Cmd+Z takes back an Alt+Enter break or a Ctrl+; date like any
 * typed character (B346). Where the browser cannot (no insertText, or it
 * wrote something else), the text is written through the native value setter
 * and an input event, as typing stores it. The caret ends after the text.
 */
export function insertSpreadsheetDraftText(
  editor: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  start: number,
  end: number,
): void {
  const expected = editor.value.slice(0, start) + text + editor.value.slice(end);
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  let inserted = false;
  if (document.activeElement === editor && typeof document.execCommand === "function") {
    editor.setSelectionRange(start, end);
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }
  }
  if (!inserted || editor.value !== expected) {
    const setter = Object.getOwnPropertyDescriptor(
      editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(editor, expected);
    else editor.value = expected;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const caret = start + text.length;
  if (document.activeElement === editor) editor.setSelectionRange(caret, caret);
}

/**
 * Excel formats characters of an entry while it is typed (select "AB" in the
 * cell, Bold). A rich entry keeps its runs here beside its text, by draft
 * identity, until the host's write takes them; they only ever apply to the
 * text they were made for.
 */
const richDraftRuns = new Map<string, { text: string; runs: CellTextRun[] }>();
export function takeSpreadsheetRichDraftRuns(identity: string, value: string): CellTextRun[] | undefined {
  const entry = richDraftRuns.get(identity);
  richDraftRuns.delete(identity);
  return entry && entry.text === value ? entry.runs : undefined;
}

/** A character format the cell editor applies to its selection. */
export type SpreadsheetDraftCharacterFormat = Partial<Pick<CellRunStyle, "bold" | "italic" | "underline" | "strike">>;

/** Every character format a Home font command can put on an entry's selection. */
export type SpreadsheetRichDraftFormat = Partial<
  Pick<
    CellRunStyle,
    "bold" | "italic" | "underline" | "underlineStyle" | "strike" | "fontFamily" | "fontSize" | "color"
  >
>;

/** Where the host asks a plain entry to become a rich one: the selection to
 * keep and, once, the format to put on it. `nonce` names one request. */
export interface SpreadsheetRichDraftIntent {
  nonce: number;
  start: number;
  end: number;
  format?: SpreadsheetRichDraftFormat;
}

/** The character format a shortcut names (Excel: Ctrl+B / I / U, Ctrl+5). */
export function spreadsheetDraftShortcutFormat(
  event: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
): keyof SpreadsheetDraftCharacterFormat | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  const key = event.key.toLowerCase();
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "u") return "underline";
  if (key === "5" || event.code === "Digit5") return "strike";
  return null;
}

// Private draft bridge for explicit save/export/close. No focus change is needed.
const draftFlushers = new WeakMap<HTMLInputElement, { flush(): boolean; dirty(): boolean }>();
export function flushSpreadsheetDraftInput(input: HTMLInputElement): boolean {
  return draftFlushers.get(input)?.flush() ?? true;
}
export function spreadsheetDraftInputIsDirty(input: HTMLInputElement): boolean {
  return draftFlushers.get(input)?.dirty() ?? false;
}

interface DraftRuntime {
  session: { source: unknown; identity: string; draft: string | null; composing: boolean };
  exiting: boolean;
  revision: { valid: boolean; controller: AbortController | null };
  publishing: { revision: object; promise: Promise<SpreadsheetDraftPublishResult> } | null;
  mounted: boolean;
  /** The element is being swapped (input <-> text area) for a committed line
   * break: the removed element's blur is not the user leaving the cell. */
  swapping: boolean;
  /** This editor's entry moved to another cell's editor (a collaborator's
   * row/column edit) and the element still shows `shown`, the text it had:
   * until the editor renders again, what is typed here is the moved
   * entry's. */
  movedAway: { shown: string } | null;
  initialized: boolean;
  pendingBlur: FocusEvent<HTMLInputElement> | null;
  latest: { onChange?: Props["onChange"]; onBlur?: Props["onBlur"]; onKeyDown?: Props["onKeyDown"] };
  boundary: { draftIdentity: string; sourceIdentity: unknown; retainedDraft?: string; readOnly?: boolean; disabled?: boolean; draftCarryKey?: string };
  liveEdit?: SpreadsheetLiveEdit;
  liveIdentity?: string;
  /** A rich entry's runs (null: the stored runs carried through the text) and
   * its own undo history. */
  richRuns: CellTextRun[] | null;
  richHistory: { past: RichDraftState[]; future: RichDraftState[] };
  richIntentNonce: number | null;
}

interface RichDraftState { text: string; runs: CellTextRun[] | null; start: number; end: number }

type Props = ComponentPropsWithoutRef<"input"> & {
  draftIdentity: string;
  /** The cell this entry belongs to apart from the host's load generation.
   * An identity change that keeps it, with the cell's source unchanged, is
   * the same entry: a collaborator's row or column edit elsewhere renews the
   * generation while a member is typing here, and must not drop what they
   * typed so far. */
  draftCarryKey?: string;
  retainedDraft?: string;
  onDraftDiscard?: (input: HTMLInputElement) => void;
  /** The entry became read-only (the cell was locked) while text typed in
   * it was not entered yet: that text, which the entry no longer holds. */
  onDraftLockedOut?: (text: string) => void;
  onDraftPublish?: (request: SpreadsheetDraftPublishRequest) => Promise<SpreadsheetDraftPublishResult> | undefined;
  /** Optional host transaction for ordinary Enter/Tab. Other commits still
   * publish synchronously before callbacks with refreshed props. */
  onDraftExit?: (request: SpreadsheetDraftExitRequest) => "accepted" | "rejected" | "fallback";
  /** Canonical cell object/revision, separate from its formatted display value. */
  sourceIdentity?: unknown;
  /** Let existing editor suggestions/commands consume a key before commit/cancel. */
  onDraftKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => boolean;
  onDraftChange?: (event: ChangeEvent<HTMLInputElement>, previousValue: string, composing: boolean) => void;
  /** Shares this input's draft with the other editor of the same cell and
   * shows that editor's draft while this one holds none. */
  liveEdit?: SpreadsheetLiveEdit;
  /** The cell edited, when it is not this input's own draftIdentity. */
  liveEditIdentity?: string;
  /** The entry holds manual line breaks (Alt+Enter) or its cell wraps: it is
   * edited in a text area, since a single-line input silently drops every
   * line break and shows one line. */
  multiline?: boolean;
  /** How the cell draws the lines of a multi-line entry, for the open entry
   * to stand on the same pixels: the line height (a multiple of the font
   * size) its wrapped lines take, the single-line cell's line box, and the
   * cell's vertical alignment. */
  multilineLayout?: SpreadsheetMultilineLayout;
  /** The entry is open for editing: a formula's references are drawn in
   * their range-finder colours (Excel colours each reference of the formula
   * being edited, in the cell and in the formula bar). */
  referenceColors?: boolean;
  /** The empty neighbours an open one-line entry may run over, px on each
   * side of the cell, and the side its text runs to (its alignment). */
  growRoom?: SpreadsheetEditorGrowRoom;
  /** The entry carries character formatting: it is edited in a rich text
   * editor that shows and changes the format of the characters selected. */
  rich?: boolean;
  /** The cell's stored runs, the rich editor's starting format. */
  richRuns?: unknown;
  /** Where the host's write finds this entry's runs (the cell's address on
   * its sheet); the draft identity otherwise. */
  richDraftKey?: string;
  /** The cell's own font, which a character without a format of its own shows. */
  richInheritedStyle?: CellRunStyle;
  /** Turns the open entry rich at a selection, once per nonce. */
  richIntent?: SpreadsheetRichDraftIntent;
  /** A plain entry got a character-format shortcut over a selection: the
   * host makes it rich (and passes the request back as `richIntent`). */
  onRequestRich?: (intent: Omit<SpreadsheetRichDraftIntent, "nonce">) => void;
  /** The rich editor's selection or format changed (the mini toolbar reads it). */
  onRichSelectionUpdate?: () => void;
  /** A grid cell that is neither the active nor the edited cell: it holds no
   * entry, no live edit and no rich text, so while it stays that way it is
   * drawn as the plain input it is, without the entry's runtime (the effects,
   * the live-edit subscription and the measuring every editing cell needs).
   * It is the same element either way: a cell that becomes active or receives
   * a keystroke keeps its node, its focus and its handlers, and the runtime
   * mounts beside it. Its handlers must be shared, not made per cell. */
  inert?: boolean;
};

interface LineBox { lineHeight: number | "normal"; paddingTop: number; paddingBottom: number }

/** One mounted editor. What used to be its hooks' state lives here, so the
 * component keeps a single hook whether or not the entry runtime is mounted
 * (a hook list cannot change between renders of one element, and the input
 * must stay the same element when an inert cell becomes the active one). */
interface DraftInstance {
  /** The props of the last render; the shared handlers read them. */
  p: Props;
  forwardedRef: ForwardedRef<HTMLInputElement>;
  runtime: { current: DraftRuntime };
  inputRef: { current: HTMLInputElement | null };
  colorLayerRef: { current: HTMLDivElement | null };
  /** The editor element's ref: records it and finds the instance from it. */
  attach: (element: HTMLInputElement | null) => void;
  draft: string | null;
  lineBox: LineBox | null;
  grow: { start: number; end: number } | null;
  liveIdentity: string;
  /** The other editor's draft and selection as last rendered. */
  mirrored: string | null;
  mirroredSelection: SpreadsheetLiveSelection | null;
  previousMultiline: boolean | undefined;
  previousRich: boolean | undefined;
  swapFocus: boolean;
  references: { text: string; colors: boolean; rich: boolean; runs: ReturnType<typeof formulaReferenceRuns> | null } | null;
  /** The last render left the runtime unmounted (an inert cell at rest). */
  quiet: boolean;
  /** The last render drew the cell at rest as a resting element, not an input. */
  previousResting: boolean;
  /** The input taking over from a focused resting element is being given
   * the focus: the cell is the active cell already, so that focus is no
   * new activation (it would reset the selection the jump or drag made). */
  restingHandoff: boolean;
  handingOff: boolean;
  /** Text typed at the focused resting element before its input took over
   * (a key between a move's focus and its render): typed into the input as
   * soon as it has the focus, as the input would have taken it. */
  pendingText: string | null;
  /** The element last detached, and whether it had the focus then. */
  detached: { element: HTMLInputElement; focused: boolean } | null;
  rerender: () => void;
}

const draftInstances = new WeakMap<object, DraftInstance>();
/** The props that are the editor's own, not the element's. */
const draftOnlyProps = new Set(["value", "draftIdentity", "draftCarryKey", "retainedDraft", "sourceIdentity", "onChange", "onDraftChange", "onDraftKeyDown", "onDraftExit",
  "onDraftPublish", "onDraftDiscard", "onDraftLockedOut", "onBlur", "onKeyDown", "onCompositionStart", "onCompositionEnd", "liveEdit", "liveEditIdentity", "multiline",
  "multilineLayout", "growRoom", "referenceColors", "rich", "richRuns", "richDraftKey", "richInheritedStyle", "richIntent", "onRequestRich",
  "onRichSelectionUpdate", "inert"]);
function editorElementProps(props: Props): ComponentPropsWithoutRef<"input"> {
  const element: Record<string, unknown> = {};
  for (const key in props) if (!draftOnlyProps.has(key)) element[key] = (props as Record<string, unknown>)[key];
  return element as ComponentPropsWithoutRef<"input">;
}
const draftInstanceOf = (target: EventTarget | null) => (target ? draftInstances.get(target) : undefined);

/**
 * A resting cell reads back as its input would: its value is the cell's
 * value, it is read-only as the cell is, and selecting its text is a no-op
 * (the input that takes over selects it). Code that reaches a cell by its
 * `data-cell` keeps working whether the cell is at rest or not.
 */
function restingNoop() {}
const restingSurface: PropertyDescriptorMap = {
  value: {
    configurable: true,
    get(this: HTMLElement) {
      const inst = draftInstanceOf(this);
      return inst?.pendingText ?? String(inst?.p.value ?? "");
    },
    set(this: HTMLElement, text: unknown) {
      const inst = draftInstanceOf(this);
      if (inst && typeof document !== "undefined" && document.activeElement === this) inst.pendingText = String(text);
    },
  },
  readOnly: {
    configurable: true,
    get(this: HTMLElement) { const p = draftInstanceOf(this)?.p; return Boolean(p?.readOnly || p?.disabled); },
  },
  selectionStart: { configurable: true, get() { return 0; } },
  selectionEnd: { configurable: true, get() { return 0; } },
  // Writable: a rich cell's editor is a <div> too, and React keeps the
  // resting node for it, so the editor's own setSelectionRange is assigned
  // onto this node; a read-only no-op threw there and took the whole
  // workbook down when F2 opened a cell with coloured characters (live
  // audit S-184).
  select: { configurable: true, writable: true, value: restingNoop },
  setSelectionRange: { configurable: true, writable: true, value: restingNoop },
};
/**
 * A cell's node is replaced when the cell takes or leaves the rest (its
 * resting element, its input, its text area). Whatever kept the node it saw
 * (a dialog returning the focus, a deferred focus after a jump) still means
 * the cell: focusing a node that has left the document focuses the cell's
 * node now.
 */
const nativeFocus = typeof HTMLElement === "undefined" ? null : HTMLElement.prototype.focus;
function installCellFocusForwarding(element: HTMLElement) {
  if (!nativeFocus || Object.prototype.hasOwnProperty.call(element, "focus")) return;
  Object.defineProperty(element, "focus", {
    configurable: true,
    value(this: HTMLElement, options?: FocusOptions) {
      if (!this.isConnected) {
        const current = draftInstanceOf(this)?.inputRef.current as HTMLElement | null | undefined;
        if (current && current !== this && current.isConnected) {
          current.focus(options);
          return;
        }
      }
      nativeFocus.call(this, options);
    },
  });
}
function installRestingSurface(element: HTMLElement) {
  if (Object.prototype.hasOwnProperty.call(element, "setSelectionRange")) return;
  Object.defineProperties(element, restingSurface);
}

function createDraftInstance(props: Props): { inst: DraftInstance } {
  const sourceIdentity = props.sourceIdentity === undefined ? props.value : props.sourceIdentity;
  const inst = {
    p: props,
    forwardedRef: null,
    runtime: {
      current: {
        session: { source: sourceIdentity, identity: props.draftIdentity, draft: props.retainedDraft ?? null, composing: false },
        exiting: false,
        revision: { valid: true, controller: null },
        publishing: null,
        mounted: true,
        swapping: false,
        movedAway: null,
        initialized: false,
        pendingBlur: null,
        latest: { onChange: props.onChange, onBlur: props.onBlur, onKeyDown: props.onKeyDown },
        boundary: { draftIdentity: props.draftIdentity, sourceIdentity, retainedDraft: props.retainedDraft, readOnly: props.readOnly, disabled: props.disabled },
        richRuns: null,
        richHistory: { past: [], future: [] },
        richIntentNonce: null,
      },
    },
    inputRef: { current: null },
    colorLayerRef: { current: null },
    attach: null as unknown as DraftInstance["attach"],
    draft: props.retainedDraft ?? null,
    lineBox: null,
    grow: null,
    liveIdentity: props.liveEditIdentity ?? props.draftIdentity,
    mirrored: null,
    mirroredSelection: null,
    previousMultiline: props.multiline,
    previousRich: props.rich,
    swapFocus: false,
    references: null,
    quiet: false,
    previousResting: false,
    restingHandoff: false,
    handingOff: false,
    pendingText: null,
    detached: null,
    rerender: () => {},
  } satisfies DraftInstance as DraftInstance;
  inst.attach = (element) => {
    const previous = inst.inputRef.current;
    // Detached first, removed after: whether the element had the focus is
    // read here, while it is still in the document, for the runtime's
    // unmount (which may run once the element is gone) to park the entry.
    if (!element && previous) inst.detached = { element: previous, focused: typeof document !== "undefined" && document.activeElement === previous };
    inst.inputRef.current = element;
    if (element) {
      draftInstances.set(element, inst);
      installCellFocusForwarding(element);
      if (element.tagName !== "INPUT" && element.tagName !== "TEXTAREA") installRestingSurface(element);
    }
  };
  return { inst };
}
const bumpDraftInstance = (box: { inst: DraftInstance }) => ({ inst: box.inst });

function setDraftOf(inst: DraftInstance, text: string | null) {
  if (inst.draft === text) return;
  inst.draft = text;
  inst.rerender();
}
function shareDraftOf(inst: DraftInstance, text: string) {
  inst.p.liveEdit?.write(inst.liveIdentity, inst.runtime.current, text);
}
function releaseDraftOf(inst: DraftInstance) {
  const current = inst.runtime.current;
  current.liveEdit?.release(current);
}
function publishDraft(inst: DraftInstance, input: HTMLInputElement, trigger: SpreadsheetDraftPublishRequest["trigger"], shiftKey = false) {
  const runtime = inst.runtime, { onDraftPublish, readOnly, disabled } = inst.p;
  const pending = runtime.current.session.draft;
  if (pending === null || !onDraftPublish || runtime.current.session.composing || readOnly || disabled) return false;
  const revision = runtime.current.revision;
  if (runtime.current.publishing?.revision === revision) return true;
  const source = runtime.current.session.source, identity = runtime.current.session.identity;
  // Most mounted cells never publish a draft. Allocate native cancellation
  // state only for a request, rather than for every grid render.
  const controller = revision.controller ??= new AbortController();
  const promise = onDraftPublish({ input, value: pending, draftIdentity: identity, sourceIdentity: source,
    revision, signal: controller.signal, trigger, shiftKey,
    isCurrent: () => revision.valid,
  });
  if (!promise) return false;
  const record = { revision, promise };
  runtime.current.publishing = record;
  void promise.catch(() => "rejected" as const).then(result => {
    if (runtime.current.publishing === record) runtime.current.publishing = null;
    if (runtime.current.revision !== revision || result === "rejected" && revision.valid) return;
    runtime.current.session.draft = null;
    releaseDraftOf(inst);
    resetRichOf(inst);
    if (runtime.current.mounted) setDraftOf(inst, null);
  });
  return true;
}
function commitDraft(inst: DraftInstance, input: HTMLInputElement) {
  const runtime = inst.runtime, { readOnly, disabled, rich } = inst.p;
  const pending = runtime.current.session.draft;
  if (pending === null || runtime.current.session.composing || readOnly || disabled) return;
  runtime.current.session.draft = null;
  if (!rich) input.value = pending;
  flushSync(() => {
    runtime.current.latest.onChange?.({ target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>);
    setDraftOf(inst, null);
    releaseDraftOf(inst);
  });
  resetRichOf(inst);
}
function handOffDraft(inst: DraftInstance, target: EventTarget | null) {
  const current = inst.runtime.current, text = current.session.draft;
  if (text === null || current.publishing || !inst.p.liveEdit?.handOff(inst.liveIdentity, target, text)) return false;
  current.revision.valid = false; current.revision.controller?.abort();
  current.revision = { valid: true, controller: null };
  current.session.draft = null;
  setDraftOf(inst, null);
  return true;
}
// ---- A rich entry (Excel's character formatting typed in the cell) ----
// The entry's text and runs as shown: its own runs while they still spell
// the text, else the stored runs carried through the edit as Excel's cell
// editor carries them (kept characters keep their format).
function shownTextOf(inst: DraftInstance) {
  return inst.draft ?? inst.mirrored ?? String(inst.p.value ?? "");
}
function runsForText(inst: DraftInstance, text: string): CellTextRun[] {
  const own = inst.runtime.current.richRuns;
  if (own && textFromRuns(own) === text) return own;
  return runsForEditedText(normalizeCellRuns(inst.p.richRuns, String(inst.p.value ?? "")), text) ?? runsFromText(text);
}
function resetRichOf(inst: DraftInstance) {
  const current = inst.runtime.current;
  current.richRuns = null;
  current.richHistory = { past: [], future: [] };
  richDraftRuns.delete(inst.p.richDraftKey ?? current.session.identity);
}
function applyRichState(inst: DraftInstance, host: PresentationCellTextElement, text: string, runs: CellTextRun[]) {
  const current = inst.runtime.current;
  const previous = current.session.draft ?? inst.mirrored ?? String(inst.p.value ?? "");
  inst.p.onDraftChange?.({ target: host, currentTarget: host } as unknown as ChangeEvent<HTMLInputElement>, previous, false);
  current.revision.valid = false; current.revision.controller?.abort();
  current.revision = { valid: true, controller: null };
  current.session.draft = text;
  current.richRuns = runs;
  richDraftRuns.set(inst.p.richDraftKey ?? current.session.identity, { text, runs });
  // A format that leaves the text as it is (Italic on the selected words of
  // an entry typed so far) changes the runs alone: the editor is drawn again
  // for them, or it kept showing the characters as they were while the
  // format was already recorded, and only Enter revealed it.
  if (inst.draft === text) inst.rerender();
  else setDraftOf(inst, text);
  shareDraftOf(inst, text);
  inst.p.onRichSelectionUpdate?.();
}
function acceptRichChange(inst: DraftInstance, host: PresentationCellTextElement, text: string, runs: CellTextRun[]) {
  const current = inst.runtime.current;
  const before = current.session.draft ?? inst.mirrored ?? String(inst.p.value ?? "");
  const history = current.richHistory;
  history.past.push({ text: before, runs: runsForText(inst, before), start: host.selectionStart, end: host.selectionEnd });
  if (history.past.length > 200) history.past.shift();
  history.future = [];
  applyRichState(inst, host, text, runs);
}
// The rich editor writes its own characters, so the browser's undo has
// nothing of them: the entry keeps its own history, as a draft (Esc still
// drops all of it, and nothing reaches the workbook's undo before Enter).
function richStep(inst: DraftInstance, host: PresentationCellTextElement, redo: boolean) {
  const history = inst.runtime.current.richHistory;
  const state = (redo ? history.future : history.past).pop();
  if (!state) return;
  const text = inst.runtime.current.session.draft ?? shownTextOf(inst);
  (redo ? history.past : history.future).push({ text, runs: runsForText(inst, text), start: host.selectionStart, end: host.selectionEnd });
  flushSync(() => applyRichState(inst, host, state.text, state.runs ?? runsFromText(state.text)));
  host.setSelectionRange(state.start, state.end);
}
/** The keys a rich entry, or a plain one turning rich, handles itself. */
function handleRichKey(inst: DraftInstance, event: KeyboardEvent<HTMLInputElement>): boolean {
  const { rich, onRequestRich, richInheritedStyle } = inst.p;
  const element = event.currentTarget as unknown as HTMLInputElement & Partial<PresentationCellTextElement>;
  const format = spreadsheetDraftShortcutFormat(event);
  if (format) {
    if (rich && typeof element.formatCharacters === "function" && typeof element.characterState === "function") {
      event.preventDefault();
      event.stopPropagation();
      const state = element.characterState(format);
      element.formatCharacters({ [format]: !(state.value === true && !state.mixed) });
      return true;
    }
    const start = element.selectionStart ?? 0, end = element.selectionEnd ?? 0;
    if (!rich && onRequestRich && end > start && !String(element.value ?? "").trim().startsWith("=")) {
      event.preventDefault();
      event.stopPropagation();
      onRequestRich({ start, end, format: { [format]: richInheritedStyle?.[format] !== true } });
      return true;
    }
    return false;
  }
  // Alt+Enter is a manual line break in the entry, typed where the caret is
  // (the rich editor writes it, so it is undone like any character).
  if (rich && event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    if (!document.execCommand?.("insertText", false, "\n")) {
      const host = element as unknown as PresentationCellTextElement;
      const start = host.selectionStart, end = host.selectionEnd;
      const text = String(host.value ?? "");
      const runs = runsForText(inst, text);
      acceptRichChange(inst, host, text.slice(0, start) + "\n" + text.slice(end), runsForEditedText(runs, text.slice(0, start) + "\n" + text.slice(end)) ?? runsFromText(text.slice(0, start) + "\n" + text.slice(end)));
      requestAnimationFrame(() => host.setSelectionRange(start + 1, start + 1));
    }
    return true;
  }
  if (rich && (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    event.stopPropagation();
    richStep(inst, element as unknown as PresentationCellTextElement, event.key.toLowerCase() === "y" || event.shiftKey);
    return true;
  }
  return false;
}
// The editor's own handlers are shared by every editor and find theirs from
// the element, so a grid of inert cells carries no closure per cell.
function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (!inst) return;
  const runtime = inst.runtime, { onDraftKeyDown, onDraftExit, onDraftDiscard, rich, value } = inst.p;
  // The entry just moved to another cell: a key that would commit, leave or
  // navigate is not handled at this cell's address but by the moved cell's
  // editor once it has the entry (an Enter here is the entry's Enter there;
  // characters and deletions are carried over by handleDraftChange).
  if (runtime.current.movedAway && runtime.current.session.draft === null &&
      (event.ctrlKey || event.metaKey || event.altKey || (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Delete")) &&
      !["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
    inst.p.liveEdit?.forwardKey(event.currentTarget, {
      key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
    });
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (runtime.current.session.composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
  if (onDraftKeyDown?.(event)) return;
  if (handleRichKey(inst, event)) return;
  if (runtime.current.session.draft !== null && (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
    // The browser owns undo/redo of the uncommitted text. Do not undo a
    // previous workbook transaction while the user is still composing a draft.
    event.stopPropagation();
    return;
  }
  if (((event.key === "Enter" || event.key === "Tab") && !event.ctrlKey && !event.metaKey && !event.altKey ||
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") &&
      publishDraft(inst, event.currentTarget, event.key === "Enter" || event.key === "Tab" ? event.key : "save", event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (runtime.current.session.draft !== null && onDraftExit &&
      (event.key === "Enter" || event.key === "Tab") &&
      !event.ctrlKey && !event.metaKey && !event.altKey) {
    let result: "accepted" | "rejected" | "fallback";
    runtime.current.exiting = true;
    try {
      result = onDraftExit({ event, value: runtime.current.session.draft,
        draftIdentity: runtime.current.session.identity, sourceIdentity: runtime.current.session.source });
    } finally { runtime.current.exiting = false; }
    if (result !== "fallback") {
      event.preventDefault();
      // Rejection invalidates this attempt as well; a later blur cannot
      // replay a stale or unauthorized value through the default path.
      runtime.current.session.draft = null;
      releaseDraftOf(inst);
      setDraftOf(inst, null);
      return;
    }
  }
  if (event.key === "Escape") {
    onDraftDiscard?.(event.currentTarget);
    runtime.current.revision.valid = false; runtime.current.revision.controller?.abort();
    runtime.current.revision = { valid: true, controller: null as AbortController | null };
    runtime.current.session.draft = null;
    releaseDraftOf(inst);
    // Escape discards the cell's entry wherever it is: an editor of this cell
    // that unmounted during the entry (as a validation alert's No re-opens
    // it) parked a copy, and the formula bar took it over and kept showing
    // it after the cell went back to its value (S-119).
    inst.p.liveEdit?.surrender(inst.liveIdentity);
    setDraftOf(inst, null);
    if (!rich) {
      const input = event.currentTarget;
      input.value = String(value ?? "");
      // Escape puts the cell back in Ready mode: its whole value selected,
      // as a click leaves it, so a typed key replaces the value (Excel), not
      // the caret the reset leaves at its end, which appended "12" to "2"
      // as "212" (live audit S-188).
      try { input.setSelectionRange(0, input.value.length, "backward"); } catch { /* a host without a text selection */ }
    }
    resetRichOf(inst);
  } else if (event.key === "Enter" || event.key === "Tab" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")) {
    commitDraft(inst, event.currentTarget);
  }
  runtime.current.latest.onKeyDown?.(event);
}
/** A key at a focused resting element: a character typed before the
 * cell's input took over is kept for it (see pendingText); every other key
 * goes to the cell's handlers, as the input's would. */
function handleRestingKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (inst && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.nativeEvent.isComposing && !inst.p.readOnly && !inst.p.disabled) {
    event.preventDefault();
    inst.pendingText = (inst.pendingText ?? "") + event.key;
    return;
  }
  inst?.p.onKeyDown?.(event);
}
function handleDraftFocus(event: FocusEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  // The focus handed over from the cell's resting element: the cell is
  // active already (see restingHandoff).
  if (inst?.handingOff) return;
  inst?.p.onFocus?.(event);
}
function handleDraftBlur(event: FocusEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (!inst) return;
  const runtime = inst.runtime;
  // The editor is being replaced (an input becomes a text area for a
  // manual line break) or unmounted while focused: the browser's blur on
  // the removed element is not the user leaving the cell, and its stale
  // text is never committed over the entry. The unmount effect has
  // already parked the entry for the editor that takes over.
  if (!runtime.current.mounted || runtime.current.swapping || event.currentTarget !== inst.inputRef.current) return;
  if (runtime.current.session.composing) {
    // React clears currentTarget after dispatch, so retain a stable snapshot.
    runtime.current.pendingBlur = { ...event, currentTarget: event.currentTarget, target: event.target };
    return;
  }
  // Excel keeps the entry open when the click goes from the cell to the
  // formula bar or back: nothing is committed and edit mode continues.
  if (handOffDraft(inst, event.relatedTarget)) return;
  // And while the Font controls (name, size, colour, Bold...) are used on
  // the characters selected in it, or a ribbon tab is switched: the entry
  // stays open (Excel keeps edit mode across the ribbon), its selection
  // drawn, and is committed once the user presses any other command,
  // anywhere else, or Escape.
  if (holdForCharacterFormat(inst, event)) return;
  leaveCell(inst, event.currentTarget, event);
}
function leaveCell(inst: DraftInstance, box: HTMLInputElement, event: FocusEvent<HTMLInputElement>) {
  if (publishDraft(inst, box, "blur")) return;
  // The host exit may focus another cell synchronously; its receipt owns
  // this nested blur. Never publish the same local draft a second time.
  if (!inst.runtime.current.exiting) commitDraft(inst, box);
  inst.runtime.current.latest.onBlur?.(event);
}
function holdForCharacterFormat(inst: DraftInstance, event: FocusEvent<HTMLInputElement>): boolean {
  // Only a cell entry (the formula bar has no characters to format).
  if (!inst.p.onRequestRich && !inst.p.rich) return false;
  const box = event.currentTarget;
  if (String(box.value ?? "").trimStart().startsWith("=")) return false;
  if (!officeBlurKeepsCellEntry(event.relatedTarget)) return false;
  return holdOfficeTextBoxForChrome(
    box as HTMLElement,
    event.relatedTarget,
    () => {
      const current = inst.runtime.current;
      if (!current.mounted || current.swapping || box !== inst.inputRef.current) return;
      leaveCell(inst, box, { ...event, currentTarget: box, target: box, relatedTarget: null } as FocusEvent<HTMLInputElement>);
    },
    { keepFor: officeChromeKeepsCellEntry },
  );
}
function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (!inst) return;
  const runtime = inst.runtime;
  // This editor's entry was just moved to another cell's editor, which has
  // not taken it over yet: the key belongs to the moved entry, at its caret.
  // React puts this element's value back to the text it last rendered after
  // every change, so each key is read against that text.
  const movedAway = runtime.current.movedAway;
  if (movedAway && runtime.current.session.draft === null && inst.p.liveEdit) {
    const edit = typedEditAgainst(movedAway.shown, event.currentTarget.value);
    if (inst.p.liveEdit.forward(event.currentTarget, (text, caret) => applyTypedEdit(text, caret, edit))) return;
  }
  const previous = runtime.current.session.draft ?? inst.mirrored ?? String(inst.p.value ?? "");
  inst.p.onDraftChange?.(event, previous, runtime.current.session.composing);
  runtime.current.revision.valid = false; runtime.current.revision.controller?.abort();
  runtime.current.revision = { valid: true, controller: null as AbortController | null };
  runtime.current.session.draft = event.currentTarget.value;
  setDraftOf(inst, event.currentTarget.value);
  // An IME candidate is not text yet; it is shared once composition ends.
  if (!runtime.current.session.composing && !(event.nativeEvent as InputEvent | undefined)?.isComposing) shareDraftOf(inst, event.currentTarget.value);
}
function handleDraftCompositionStart(event: CompositionEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (!inst) return;
  inst.runtime.current.session.composing = true;
  inst.p.onCompositionStart?.(event);
}
function handleDraftCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
  const inst = draftInstanceOf(event.currentTarget);
  if (!inst) return;
  const runtime = inst.runtime;
  runtime.current.session.composing = false;
  if (runtime.current.session.draft !== null) shareDraftOf(inst, event.currentTarget.value);
  const blur = runtime.current.pendingBlur;
  runtime.current.pendingBlur = null;
  inst.p.onCompositionEnd?.(event);
  if (blur || document.activeElement !== event.currentTarget) {
    // Some browsers blur before compositionend. Publish the accepted text
    // before the host validates and exits edit mode, never an IME candidate.
    if (runtime.current.session.draft !== null) runtime.current.session.draft = event.currentTarget.value;
    if (!publishDraft(inst, event.currentTarget, "blur")) {
      commitDraft(inst, event.currentTarget);
      if (blur) runtime.current.latest.onBlur?.(blur);
    }
  }
}
function multilineStyleFor(style: CSSProperties | undefined) {
  // The lines an entry is edited in: its line breaks kept and long words
  // broken as the wrapped-text layer breaks them, the rest of the text inside
  // the editor. A wrapped cell's own style collapses white space and lets its
  // text overflow (the cell shows its lines through another layer), which in
  // the editor joined an Alt+Enter break onto the line before it. Formula
  // source keeps its single line.
  return {
    whiteSpace: style?.whiteSpace === "nowrap" ? ("nowrap" as const) : ("pre-wrap" as const),
    overflow: "hidden" as const, overflowWrap: "anywhere" as const, wordBreak: "break-word" as const,
  };
}

/* eslint-disable react-hooks/immutability -- the instance is this editor's own
   mutable state (what its hooks used to hold); it is written while rendering
   and handling events exactly as those hooks' refs were. */
/** Keep keystrokes and IME candidates in this small editor. Publish a single
 * accepted edit before navigation/blur; external replacement cancels the draft. */
const SpreadsheetDraftInputEditor = forwardRef<HTMLInputElement, Props>(function SpreadsheetDraftInput(allProps, ref) {
  // The only hook: the instance, and a way to render it again.
  const [{ inst }, rerender] = useReducer(bumpDraftInstance, allProps, createDraftInstance);
  inst.rerender = rerender as () => void;
  inst.p = allProps;
  inst.forwardedRef = ref;
  const { value, draftIdentity, retainedDraft, sourceIdentity: givenSource, onChange, onBlur, onKeyDown, liveEdit, liveEditIdentity, multiline, multilineLayout, growRoom, referenceColors, rich, richInheritedStyle, richIntent, onRichSelectionUpdate, inert } = allProps;
  const props = editorElementProps(allProps);
  const sourceIdentity = givenSource === undefined ? value : givenSource;
  const runtime = inst.runtime;
  const current = runtime.current;
  const liveIdentity = liveEditIdentity ?? draftIdentity;
  inst.liveIdentity = liveIdentity;
  // An inert cell at rest: no entry of its own, none mirrored, nothing being
  // published or composed. Anything else mounts the entry runtime.
  const quiet = inert === true && !liveEdit && !rich && retainedDraft === undefined && inst.draft === null &&
    current.session.draft === null && !current.session.composing && current.publishing === null && current.richRuns === null;
  inst.quiet = quiet;
  if (quiet) {
    // Without an entry to keep, the session simply follows the cell (what the
    // runtime's boundary does for a cell with no draft), so the runtime that
    // mounts when the cell becomes active starts from the cell it shows.
    if (current.session.identity !== draftIdentity || current.session.source !== sourceIdentity) {
      if (current.session.identity === draftIdentity || props.readOnly || props.disabled) {
        current.revision.valid = false; current.revision.controller?.abort();
      }
      current.session = { source: sourceIdentity, identity: draftIdentity, draft: null, composing: false };
      current.revision = { valid: true, controller: null };
    }
    const boundary = current.boundary;
    const draftCarryKey = allProps.draftCarryKey;
    if (boundary.draftIdentity !== draftIdentity || boundary.sourceIdentity !== sourceIdentity || boundary.retainedDraft !== retainedDraft ||
        boundary.readOnly !== props.readOnly || boundary.disabled !== props.disabled || boundary.draftCarryKey !== draftCarryKey) {
      current.boundary = { draftIdentity, sourceIdentity, retainedDraft, readOnly: props.readOnly, disabled: props.disabled, draftCarryKey };
    }
    // The boundary is this render's: an entry typed here before the runtime
    // mounts (the keyboard moved to this cell with a collaborator's row or
    // column edit that has not rendered yet) is carried into the renewed
    // load generation as an editor's own would be.
    current.initialized = true;
    const latest = current.latest;
    if (latest.onChange !== onChange || latest.onBlur !== onBlur || latest.onKeyDown !== onKeyDown) current.latest = { onChange, onBlur, onKeyDown };
    inst.previousMultiline = multiline;
    inst.previousRich = rich;
    inst.mirrored = null;
    inst.mirroredSelection = null;
    // A cell at rest whose text the display layer draws (its own glyphs are
    // transparent) or that holds none is drawn as a resting element: no
    // input, no input box to lay out or style. It keeps the cell's
    // attributes and handlers and takes the focus, and the input takes over
    // (with the focus) the moment the cell becomes active or edited.
    if (!multiline && (String(value ?? "") === "" || props.style?.color === "transparent")) {
      inst.previousResting = true;
      if (inst.pendingText !== null && (typeof document === "undefined" || document.activeElement !== inst.inputRef.current)) inst.pendingText = null;
      const { readOnly, disabled, type: _type, inputMode: _inputMode, enterKeyHint: _enterKeyHint, autoFocus: _autoFocus,
        spellCheck: _spellCheck, placeholder: _placeholder, maxLength: _maxLength, ...element } = props;
      // The same slots as the input's render below, so the input takes the
      // span's place and nothing around it remounts.
      return <><span
        {...(element as ComponentPropsWithoutRef<"span">)}
        ref={inst.attach as unknown as React.Ref<HTMLSpanElement>}
        tabIndex={props.tabIndex ?? -1}
        // What the input was to assistive tech: the cell's text box.
        role="textbox"
        aria-readonly={readOnly || disabled ? true : undefined}
        data-spreadsheet-resting-cell=""
        onKeyDown={handleRestingKeyDown as unknown as React.KeyboardEventHandler<HTMLSpanElement>}
        onBlur={handleDraftBlur as unknown as React.FocusEventHandler<HTMLSpanElement>} />
      {null}
      {null}
      </>;
    }
    inst.previousResting = false;
    const Editor = (multiline ? "textarea" : "input") as "input";
    const editorProps = multiline
      ? { ...props, rows: 1, style: { resize: "none" as const, ...props.style, ...multilineStyleFor(props.style) } }
      : props;
    return <>
    <Editor autoComplete="off" autoCorrect="off" autoCapitalize="off" {...editorProps} ref={inst.attach} value={value}
      onChange={handleDraftChange}
      onCompositionStart={handleDraftCompositionStart}
      onCompositionEnd={handleDraftCompositionEnd}
      onKeyDown={handleDraftKeyDown}
      onBlur={handleDraftBlur}
      onFocus={handleDraftFocus} />
    {null}
    {null}
    </>;
  }
  // The other editor's draft for this cell. Only the editor with focus writes,
  // so an input never receives a new controlled value while it is composing.
  const mirrored = liveEdit ? liveEdit.read(liveIdentity, current) : null;
  // The other editor's selection of this entry (the cell's for the formula
  // bar, the formula bar's for the cell), shown here as a mirrored range
  // while this editor does not have the focus.
  const mirroredSelection = liveEdit ? liveEdit.readSelection(liveIdentity, current) : null;
  inst.mirrored = mirrored;
  inst.mirroredSelection = mirroredSelection;
  // A multi-line entry is a text area that behaves as the input does: every
  // Enter is handled (committed or a manual break) before the browser could
  // insert one, and the element reads back through the same input surface.
  // The swap happens when the host flags the open entry multi-line (Alt+Enter
  // puts a manual break into the entry, which stays a draft until it is
  // entered) or when the cell's value gains or loses a break. The entry typed
  // so far stays with the editor, and the blur of the element being removed
  // is ignored.
  // The keyboard moves along to the new element: a cell given Wrap Text
  // while it has the focus (the Format Painter's click, a Wrap Text key)
  // left the focus on the page, where Esc and the arrows reached nothing
  // (S-069).
  const focusedNow = () => typeof document !== "undefined" && document.activeElement === inst.inputRef.current;
  if (inst.previousMultiline !== multiline) {
    current.swapping = true;
    inst.swapFocus = inst.swapFocus || focusedNow();
    inst.previousMultiline = multiline;
  }
  // A cell at rest becoming the active or edited cell: its resting element
  // gives way to the input, and the focus it holds (a click, a key, a
  // programmatic focus on the cell) moves along.
  if (inst.previousResting) {
    current.swapping = true;
    if (focusedNow()) {
      inst.swapFocus = true;
      inst.restingHandoff = true;
    }
    inst.previousResting = false;
  }
  // Turning rich (or back) swaps the element like a line break does; the
  // removed element's blur is no exit, and the focus moves along.
  if (inst.previousRich !== rich) {
    current.swapping = true;
    inst.swapFocus = inst.swapFocus || focusedNow();
    inst.previousRich = rich;
  }
  const draft = inst.draft;
  const shownText = draft ?? mirrored ?? String(value ?? "");
  const shownRuns = rich ? runsForText(inst, shownText) : undefined;
  const lineBox = inst.lineBox;
  const lineBoxStyle = multiline && multilineLayout && lineBox
    ? { lineHeight: lineBox.lineHeight === "normal" ? "normal" : `${lineBox.lineHeight}px`, paddingTop: lineBox.paddingTop, paddingBottom: lineBox.paddingBottom }
    : undefined;
  const multilineStyle = multiline ? multilineStyleFor(props.style) : undefined;
  // An open one-line entry wider than its cell runs over the empty
  // neighbours, as the cell draws it once entered: the editor widens by what
  // the text overflows (a caret's breadth more), into the room on the side
  // its alignment runs to, half on each side when centred. Past the room it
  // scrolls as before.
  const grow = inst.grow;
  const growStyle = grow && growRoom && !multiline
    ? { position: "relative" as const, zIndex: 1, marginInlineStart: -grow.start, width: `calc(100% + ${grow.start + grow.end}px)` }
    : undefined;
  // A formula's references in their colours. An input cannot colour part of
  // its text, so the entry is drawn again by a layer laid exactly over the
  // editor (its box, font, insets, alignment and scroll position), and the
  // editor's own glyphs go transparent under it; the caret and the selection
  // stay the editor's.
  const plainText = String(draft ?? mirrored ?? value ?? "");
  const cached = inst.references;
  const referenceRuns = cached && cached.text === plainText && cached.colors === Boolean(referenceColors) && cached.rich === Boolean(rich)
    ? cached.runs
    : (() => {
        let runs: ReturnType<typeof formulaReferenceRuns> | null = null;
        if (referenceColors && !rich && plainText.startsWith("=")) {
          const found = formulaReferenceRuns(plainText);
          runs = found.some((run) => run.color) ? found : null;
        }
        inst.references = { text: plainText, colors: Boolean(referenceColors), rich: Boolean(rich), runs };
        return runs;
      })();
  const referenceEditorStyle = referenceRuns
    ? { color: "transparent", caretColor: (props.style?.color as string | undefined) ?? "var(--console-text-primary, #183c38)" }
    : undefined;
  const referenceLayer = referenceRuns ? (
    <div
      ref={inst.colorLayerRef}
      aria-hidden="true"
      data-testid="spreadsheet-formula-reference-text"
      style={{
        position: "absolute",
        boxSizing: "border-box",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 2,
        whiteSpace: multiline ? "pre-wrap" : "pre",
        overflowWrap: multiline ? "anywhere" : undefined,
        wordBreak: multiline ? "break-word" : undefined,
      }}
    >
      <div>
        {referenceRuns.map((run, index) =>
          run.color ? <span key={index} style={{ color: run.color }}>{run.text}</span> : run.text,
        )}
        {/* A trailing line break has no box of its own without this. */}
        {multiline && plainText.endsWith("\n") ? "​" : null}
      </div>
    </div>
  ) : null;
  const effects = (
    <SpreadsheetDraftInputRuntime
      inst={inst}
      s={{
        forwardedRef: ref, liveEdit, liveIdentity, mirrored, mirroredSelection, draft, rich, richIntent,
        onChange, onBlur, onKeyDown, draftIdentity, draftCarryKey: allProps.draftCarryKey, sourceIdentity, retainedDraft,
        readOnly: props.readOnly, disabled: props.disabled, multiline, multilineLayout, growRoom, referenceRuns, shownText,
      }}
    />
  );
  if (rich) {
    // Input-only attributes have no meaning on the rich host, and its own
    // clipboard handling keeps the characters' format.
    const { readOnly, disabled } = props;
    const richProps: Record<string, unknown> = { ...props };
    for (const key of ["type", "readOnly", "disabled", "inputMode", "enterKeyHint", "onPaste", "onCopy", "onCut", "onChange"]) {
      delete richProps[key];
    }
    return <>
      <PresentationCellRichTextEditor
        {...richProps}
        ref={inst.attach as unknown as React.Ref<PresentationCellTextElement>}
        value={shownText}
        runs={shownRuns}
        readOnly={Boolean(readOnly || disabled)}
        inheritedStyle={richInheritedStyle}
        // A raised or lowered run at the size the cell draws it.
        scriptScale={SPREADSHEET_SCRIPT_FONT_SCALE}
        // A one-line entry stays on its line and scrolls, as the input does;
        // it wrapped inside the cell, and what passed the cell's edge went
        // onto lines out of sight.
        style={{ ...props.style, ...(multilineStyle ?? { whiteSpace: "pre" as const, overflow: "hidden" as const }), ...lineBoxStyle, ...growStyle }}
        onChange={({ target }) => {
          const host = inst.inputRef.current as unknown as PresentationCellTextElement | null;
          if (host) acceptRichChange(inst, host, target.value, target.runs as CellTextRun[]);
        }}
        onSelectionUpdate={() => onRichSelectionUpdate?.()}
        onKeyDown={handleDraftKeyDown as unknown as React.KeyboardEventHandler<PresentationCellTextElement>}
        onBlur={handleDraftBlur as unknown as React.FocusEventHandler<PresentationCellTextElement>}
      />
      {null}
      {effects}
    </>;
  }
  const Editor = (multiline ? "textarea" : "input") as "input";
  const editorProps = multiline
    ? { ...props, rows: 1, style: { resize: "none" as const, ...props.style, ...multilineStyle, ...lineBoxStyle } }
    : growStyle ? { ...props, style: { ...props.style, ...growStyle } } : props;
  return <>
  <Editor autoComplete="off" autoCorrect="off" autoCapitalize="off" {...editorProps} ref={inst.attach} value={draft ?? mirrored ?? value}
    {...(referenceEditorStyle ? { style: { ...editorProps.style, ...referenceEditorStyle } } : {})}
    onChange={handleDraftChange}
    onCompositionStart={handleDraftCompositionStart}
    onCompositionEnd={handleDraftCompositionEnd}
    onKeyDown={handleDraftKeyDown}
    onBlur={handleDraftBlur}
    onFocus={handleDraftFocus} />
  {referenceLayer}
  {effects}
  </>;
});

interface DraftRuntimeSnapshot {
  forwardedRef: ForwardedRef<HTMLInputElement>;
  liveEdit?: SpreadsheetLiveEdit;
  liveIdentity: string;
  mirrored: string | null;
  mirroredSelection: SpreadsheetLiveSelection | null;
  draft: string | null;
  rich?: boolean;
  richIntent?: SpreadsheetRichDraftIntent;
  onChange?: Props["onChange"];
  onBlur?: Props["onBlur"];
  onKeyDown?: Props["onKeyDown"];
  draftIdentity: string;
  draftCarryKey?: string;
  sourceIdentity: unknown;
  retainedDraft?: string;
  readOnly?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  multilineLayout?: SpreadsheetMultilineLayout;
  growRoom?: SpreadsheetEditorGrowRoom;
  referenceRuns: ReturnType<typeof formulaReferenceRuns> | null;
  shownText: string;
}

/* eslint-enable react-hooks/immutability */

/** The entry runtime of an editor that holds, or may take, an entry: rendered
 * beside the editor element, never around it, so mounting it keeps the
 * element. Its effects are the editor's, in the editor's order. */
function SpreadsheetDraftInputRuntime({ inst, s }: { inst: DraftInstance; s: DraftRuntimeSnapshot }) {
  const runtime = inst.runtime, inputRef = inst.inputRef;
  // Set once, to the element the editor mounted with, as it always was.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(s.forwardedRef, () => inputRef.current!, []);
  // A cell in Ready mode has its whole text selected, so a typed key replaces
  // it. A new value under the keyboard (a calculation answering just after Tab
  // moved here) leaves the caret at its end, and the key was added to the
  
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || s.draft !== null || s.rich || s.mirrored !== null) return;
    if (input.ownerDocument.activeElement !== input || input.getAttribute("data-editing") !== "false") return;
    if (typeof input.setSelectionRange !== "function") return;
    try { input.setSelectionRange(0, input.value.length, "backward"); } catch { /* a host without a text selection */ }
    input.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.shownText]);
  // The other editor's draft and selection: rendered again when either
  // changes from what was shown (a store subscription, as the editor had).
  useLayoutEffect(() => {
    const liveEdit = s.liveEdit;
    if (!liveEdit) return;
    const current = runtime.current, identity = s.liveIdentity;
    const check = () => {
      if (liveEdit.read(identity, current) !== inst.mirrored || liveEdit.readSelection(identity, current) !== inst.mirroredSelection) inst.rerender();
    };
    const unsubscribe = liveEdit.subscribe(check);
    check();
    return unsubscribe;
  }, [s.liveEdit, s.liveIdentity, inst, runtime]);
  useEffect(() => {
    const host = inputRef.current as HTMLElement | null;
    if (!host || !s.mirroredSelection || typeof document === "undefined") return;
    if (document.activeElement === host) return;
    // Only an editor showing the same words takes the other one's range. A
    // cell in Ready mode shows its value (CHF3,555.00) in a layer over a
    // transparent input while the formula bar holds =SUM(C2:C12): the
    // formula bar's characters 1-11 were marked on the hidden input's text,
    // in the input's own line box, so a band sat above the amount and over
    // the wrong characters (video audit H01). It also moved the cell's Ready
    // selection, which must stay on its whole value.
    if (host.getAttribute("data-editing") === "false") return;
    const shown = (host as { value?: unknown }).value;
    if (typeof shown === "string" && typeof s.mirrored === "string" && shown !== s.mirrored) return;
    const remove = officeShowMirroredSelection(host, s.mirroredSelection.start, s.mirroredSelection.end);
    return () => { remove?.(); };
  }, [s.mirroredSelection, s.mirrored, s.draft, s.rich, inputRef]);
  // While this editor has the focus, its selection is the entry's: published
  // on every selection change so the other editor can show it.
  useEffect(() => {
    const liveEdit = s.liveEdit, liveIdentity = s.liveIdentity;
    if (!liveEdit || typeof document === "undefined") return;
    const current = runtime.current;
    const publish = () => {
      const host = inputRef.current as (HTMLElement & { selectionStart?: number | null; selectionEnd?: number | null }) | null;
      if (!host || document.activeElement !== host) return;
      // A cell in Ready mode keeps its whole text selected behind its text
      // layer (the next character replaces the value); that is not an
      // entry's selection and shows nowhere else. The grid marks the cell's
      // input with the entry state; the formula bar carries no mark.
      const ready = host.getAttribute("data-editing") === "false" || (host as { readOnly?: boolean }).readOnly === true;
      const start = host.selectionStart ?? null;
      const end = host.selectionEnd ?? null;
      liveEdit.writeSelection(liveIdentity, current, ready || start === null || end === null || start === end ? null : { start, end });
    };
    const clear = () => liveEdit.writeSelection(liveIdentity, current, null);
    document.addEventListener("selectionchange", publish);
    const host = inputRef.current;
    host?.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("selectionchange", publish);
      host?.removeEventListener("blur", clear);
      clear();
    };
  }, [s.liveEdit, s.liveIdentity, s.rich, inputRef, runtime]);
  // Unmount only (declared first, so it runs before the release below): an
  // open entry whose cell the virtual grid scrolled away is not discarded.
  // It is parked with the other editor of the cell and taken back, with its
  // caret, when the cell is rendered again. An entry the host is already
  // publishing is the host's; a read-only editor has none to keep.
  useLayoutEffect(() => {
    const current = runtime.current, input = inputRef.current;
    return () => {
      const edit = current.liveEdit, text = current.session.draft;
      if (!edit || current.liveIdentity === undefined || text === null || current.publishing || current.boundary.readOnly || current.boundary.disabled || !input) return;
      const caret: [number, number] = [input.selectionStart ?? text.length, input.selectionEnd ?? text.length];
      // The element may already be out of the document (it is removed before
      // this runtime beside it unmounts); its focus was read as it detached.
      const detached = inst.detached;
      const focused = !input.isConnected && detached?.element === input ? detached.focused : document.activeElement === input;
      edit.park(current.liveIdentity, text, current.session.source, caret, focused);
    };
  }, [inst, inputRef, runtime]);
  useLayoutEffect(() => {
    const current = runtime.current, liveEdit = s.liveEdit;
    current.liveEdit = liveEdit;
    // An editor that unmounts or stops editing this cell takes its text along.
    return () => { liveEdit?.release(current); current.liveEdit = undefined; };
  }, [s.liveEdit, runtime]);
  useLayoutEffect(() => {
    const current = runtime.current, input = inputRef.current, liveEdit = s.liveEdit, liveIdentity = s.liveIdentity;
    if (!liveEdit || !input) return;
    current.liveIdentity = liveIdentity;
    // Focus arriving here straight from the other editor of this cell brings
    // its open entry along; this input then holds the draft and shares it.
    const unenroll = liveEdit.enroll(input, liveIdentity, (text, source) => {
      if (current.session.composing || current.publishing || current.boundary.readOnly || current.boundary.disabled) return false;
      if (source !== undefined && source !== current.boundary.sourceIdentity) return false;
      current.revision.valid = false; current.revision.controller?.abort();
      current.revision = { valid: true, controller: null };
      current.session.draft = text;
      setDraftOf(inst, text);
      liveEdit.write(liveIdentity, current, text);
      return true;
    }, () => {
      // The entry moves to another editor (or goes with a deleted cell):
      // it leaves this one uncommitted, so its blur commits nothing.
      const text = current.session.draft;
      if (text === null || current.session.composing || current.publishing) return null;
      const caret: [number, number] | null = typeof input.selectionStart === "number" && typeof input.selectionEnd === "number"
        ? [input.selectionStart, input.selectionEnd] : null;
      const focused = typeof document !== "undefined" && document.activeElement === input;
      current.revision.valid = false; current.revision.controller?.abort();
      current.revision = { valid: true, controller: null };
      current.session.draft = null;
      current.pendingBlur = null;
      current.movedAway = { shown: input.value };
      setDraftOf(inst, null);
      liveEdit.release(current);
      return { text, caret, focused, cell: input.hasAttribute("data-editing") };
    }, current);
    // This cell's entry was parked while it was scrolled away, or moved here
    // by a collaborator's row/column edit: take it. This render's source is
    // the cell's (the committed boundary may still describe the cell as it
    // was while this editor rested), and the entry becomes this identity's,
    // so the boundary effect below keeps it.
    const props = inst.p;
    const renderedSource = props.sourceIdentity === undefined ? props.value : props.sourceIdentity;
    const claimed = liveEdit.claim(liveIdentity, input, renderedSource);
    if (claimed) {
      if (!claimed.holder && !current.boundary.readOnly && !current.boundary.disabled) {
        current.session.identity = props.draftIdentity;
        current.session.source = renderedSource;
        current.session.draft = claimed.text;
        setDraftOf(inst, claimed.text);
        liveEdit.write(liveIdentity, current, claimed.text);
      }
      if (claimed.focus) {
        const caret = claimed.caret;
        const text = claimed.holder ? undefined : claimed.text;
        const keys = claimed.keys ?? [];
        queueMicrotask(() => {
          if (!input.isConnected) return;
          
          focusWithCaret(input, caret, text);
          for (const key of keys) {
            if (!input.isConnected || document.activeElement !== input) break;
            input.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }));
          }
        });
      }
    }
    return () => { unenroll(); current.liveIdentity = undefined; };
  }, [s.liveEdit, s.liveIdentity, inst, inputRef, runtime]);
  // One commit subscription owns the cell runtime. Unedited cells need no
  // separate effect/ref chains for publication, blur and cancellation state.
  // Every render, as the handlers it publishes are.
  useLayoutEffect(() => {
    const current = runtime.current;
    const { draftIdentity, sourceIdentity, retainedDraft, readOnly, disabled, draftCarryKey } = s;
    current.mounted = true;
    current.latest = { onChange: s.onChange, onBlur: s.onBlur, onKeyDown: s.onKeyDown };
    const previous = current.boundary;
    const boundaryChanged = !current.initialized || previous.draftIdentity !== draftIdentity || previous.sourceIdentity !== sourceIdentity ||
      previous.retainedDraft !== retainedDraft || previous.readOnly !== readOnly || previous.disabled !== disabled;
    // The same cell under a renewed load generation: the entry moves with
    // its identity instead of being dropped.
    const sameCell = current.initialized && draftCarryKey !== undefined && previous.draftCarryKey === draftCarryKey &&
      current.session.identity === previous.draftIdentity && !readOnly && !disabled;
    const carried = sameCell && current.session.identity !== draftIdentity && current.session.source === sourceIdentity;
    // A collaborator wrote the cell this entry is open in: the entry keeps
    // what was typed (committing it writes it over theirs, as the last change
    // saved does in Excel co-authoring) instead of taking their value as its
    // text -- the typed "c" was lost and the next keys appended to the
    
    // an entry being published, composed or not typed yet follows the cell.
    const keptOverRemote = sameCell && current.session.source !== sourceIdentity &&
      current.session.draft !== null && !current.session.composing && current.publishing === null;
    current.initialized = true;
    current.boundary = { draftIdentity, sourceIdentity, retainedDraft, readOnly, disabled, draftCarryKey };
    if (carried || keptOverRemote) current.session.identity = draftIdentity;
    if (keptOverRemote) current.session.source = sourceIdentity;
    if (boundaryChanged) {
      // Locked under an entry being typed (a collaborator protected the
      // sheet): the entry goes back to the cell, and the host hears what was
      // typed so it is not lost without a word (S-199).
      if ((readOnly || disabled) && !previous.readOnly && !previous.disabled &&
          current.session.draft !== null && !current.session.composing && current.publishing === null) {
        inst.p.onDraftLockedOut?.(current.session.draft);
      }
      if (current.session.identity !== draftIdentity || current.session.source !== sourceIdentity || readOnly || disabled) {
        // Identity moves preserve an already published original-cell request;
        // source replacement or lost authority cancels that request.
        if (current.session.identity === draftIdentity || readOnly || disabled) {
          current.revision.valid = false; current.revision.controller?.abort();
        }
        current.session = { source: sourceIdentity, identity: draftIdentity, draft: retainedDraft ?? null, composing: false };
        current.pendingBlur = null;
        current.revision = { valid: true, controller: null };
        current.publishing = null;
        current.liveEdit?.release(current);
        setDraftOf(inst, retainedDraft ?? null);
      } else if (current.session.draft === null && retainedDraft !== undefined) {
        current.session.draft = retainedDraft; setDraftOf(inst, retainedDraft);
      }
    }
    const input = inputRef.current;
    if (input) draftFlushers.set(input, {
      dirty: () => current.session.composing || current.session.draft !== null,
      flush: () => {
        if (current.session.composing) return false;
        if (!publishDraft(inst, input, "flush")) commitDraft(inst, input);
        return true;
      },
    });
    // An editor going back to rest keeps its element; only an unmount ends it.
    return () => { current.mounted = inst.quiet; if (input) draftFlushers.delete(input); };
  });
  useLayoutEffect(() => {
    // Rendered again: the element no longer shows a moved entry's text.
    runtime.current.movedAway = null;
    if (!runtime.current.swapping) return;
    runtime.current.swapping = false;
  });
  useLayoutEffect(() => {
    const host = inputRef.current as unknown as (HTMLElement & Partial<PresentationCellTextElement> & { select?: () => void }) | null;
    if (!host) return;
    // The host reads back as the input does, select() included (the grid
    // selects a cell's text when it gives the cell the keyboard back).
    if (s.rich && (typeof host.select !== "function" || host.select === restingNoop) && typeof host.setSelectionRange === "function") {
      host.select = () => host.setSelectionRange?.(0, String(host.value ?? "").length);
    }
    const richIntent = s.richIntent;
    if (s.rich && richIntent && runtime.current.richIntentNonce !== richIntent.nonce) {
      runtime.current.richIntentNonce = richIntent.nonce;
      inst.swapFocus = false;
      host.focus({ preventScroll: true });
      host.setSelectionRange?.(richIntent.start, richIntent.end);
      if (richIntent.format && typeof host.formatCharacters === "function") host.formatCharacters(richIntent.format);
      return;
    }
    if (inst.swapFocus) {
      inst.swapFocus = false;
      const handoff = inst.restingHandoff;
      inst.restingHandoff = false;
      if (host.isConnected && document.activeElement !== host) {
        inst.handingOff = handoff;
        try { host.focus({ preventScroll: true }); } finally { inst.handingOff = false; }
        // What the resting element's focus would have done to an input: in
        // Ready mode the whole value is selected (a typed key replaces it),
        // in an entry the caret goes to the end.
        const pending = inst.pendingText;
        inst.pendingText = null;
        if (handoff && pending !== null && host.tagName === "INPUT") {
          // Typed as the input takes a key: Ready mode replaces the value.
          const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setValue?.call(host, pending);
          host.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (handoff && typeof host.setSelectionRange === "function") {
          const length = String(host.value ?? "").length;
          try {
            if (host.getAttribute("data-editing") === "true") host.setSelectionRange(length, length);
            else (host as unknown as HTMLInputElement).setSelectionRange(0, length, "backward");
          } catch { /* a host without a text selection */ }
        }
      }
    }
  }, [s.rich, s.richIntent, s.multiline, inst, inputRef, runtime]);
  // An open multi-line entry stands where the cell draws its lines: in the
  // wrapped-text layer's line box, the block of lines at the cell's vertical
  // alignment. A text area has no vertical alignment, so the room its lines
  // leave is measured and padded above (bottom) or around (middle) them. One
  // line keeps the single-line cell's line box, as the cell draws a line
  // that does not wrap.
  // Every render: the lines follow the text typed, the font and the cell's
  // size, and an unchanged box is no update.
  useLayoutEffect(() => {
    const area = inputRef.current as unknown as HTMLElement | null;
    const multilineLayout = s.multilineLayout;
    if (!multilineLayout || !s.multiline || !area || (!s.rich && area.tagName !== "TEXTAREA")) return;
    const fontSize = Number.parseFloat(getComputedStyle(area).fontSize);
    // The font's own line box: the lines are as tall as the font draws them
    // (a run in a bigger size makes its line taller, as the cell draws it),
    // so the block's height is measured rather than counted.
    const normal = multilineLayout.lineHeight === "normal";
    const linePx = normal ? 0 : fontSize * (multilineLayout.lineHeight as number);
    if (!normal && !(linePx > 0)) return;
    const style = area.style;
    const saved = [style.lineHeight, style.paddingTop, style.paddingBottom, style.height] as const;
    style.lineHeight = normal ? "normal" : `${linePx}px`;
    style.paddingTop = "0px";
    style.paddingBottom = "0px";
    style.height = "0px";
    const contentPx = area.scrollHeight;
    const lines = normal ? 0 : Math.max(1, Math.round(contentPx / linePx));
    [style.lineHeight, style.paddingTop, style.paddingBottom, style.height] = saved;
    const single = lines === 1 && multilineLayout.singleLineHeightPx > 0;
    const lineHeight: number | "normal" = normal ? "normal" : single ? multilineLayout.singleLineHeightPx : linePx;
    const spare = Math.max(0, area.clientHeight - (normal ? contentPx : single ? multilineLayout.singleLineHeightPx : lines * linePx));
    const paddingTop = multilineLayout.align === "bottom" ? spare : multilineLayout.align === "middle" ? spare / 2 : 0;
    const next = { lineHeight, paddingTop, paddingBottom: spare - paddingTop };
    // As the grow box below: the only writer, so an unchanged box is no update.
    const lineBox = inst.lineBox;
    if (!(lineBox && lineBox.lineHeight === next.lineHeight && lineBox.paddingTop === next.paddingTop &&
      lineBox.paddingBottom === next.paddingBottom)) {
      inst.lineBox = next;
      inst.rerender();
    }
  });
  // Every render: the width follows the text typed.
  useLayoutEffect(() => {
    const editor = inputRef.current as unknown as HTMLElement | null;
    const growRoom = s.growRoom;
    const next = (() => {
      if (!growRoom || s.multiline || !editor) return null;
      const style = editor.style;
      const saved = [style.width, style.marginInlineStart] as const;
      style.width = "";
      style.marginInlineStart = "";
      const overflow = editor.scrollWidth - editor.clientWidth;
      [style.width, style.marginInlineStart] = saved;
      if (overflow <= 0) return null;
      const need = overflow + 2;
      const start = growRoom.align === "right" ? Math.min(growRoom.start, need)
        : growRoom.align === "center" ? Math.min(growRoom.start, Math.ceil(need / 2)) : 0;
      const end = growRoom.align === "left" ? Math.min(growRoom.end, need)
        : growRoom.align === "center" ? Math.min(growRoom.end, Math.ceil(need / 2)) : 0;
      return start > 0 || end > 0 ? { start, end } : null;
    })();
    // Only a real change is an update. A functional update that hands back
    // the same box is not free: right after a render React cannot drop it
    // early, so every cell editor the grid had just re-rendered (a row an
    // arrow key left, a whole band) rendered a second time for nothing. This
    // effect is the only writer and runs after its render's commit, so the
    // box that render saw is the current one.
    const grow = inst.grow;
    if (!(grow === next || (grow && next && grow.start === next.start && grow.end === next.end))) {
      inst.grow = next;
      inst.rerender();
    }
  });
  // Every render: the layer follows the editor's box as the entry grows.
  useLayoutEffect(() => {
    const editor = inputRef.current as unknown as HTMLElement | null;
    const layer = inst.colorLayerRef.current;
    if (!editor || !layer || !s.referenceRuns) return;
    const computed = getComputedStyle(editor);
    const place = () => {
      // Laid over the editor's measured box, then corrected by what is left
      // between the two: offsetLeft/Top round to whole pixels, and the
      // editor may sit on a half pixel or under a hairline border, which
      // moved the text as it coloured.
      Object.assign(layer.style, {
        left: `${editor.offsetLeft}px`,
        top: `${editor.offsetTop}px`,
        width: `${editor.offsetWidth}px`,
        height: `${editor.offsetHeight}px`,
      });
      const box = editor.getBoundingClientRect();
      const own = layer.getBoundingClientRect();
      const scale = editor.offsetWidth > 0 ? box.width / editor.offsetWidth : 1;
      if (Math.abs(own.left - box.left) > 0.01 || Math.abs(own.top - box.top) > 0.01) {
        layer.style.left = `${editor.offsetLeft + (box.left - own.left) / scale}px`;
        layer.style.top = `${editor.offsetTop + (box.top - own.top) / scale}px`;
      }
      const inner = layer.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    };
    Object.assign(layer.style, {
      font: computed.font,
      letterSpacing: computed.letterSpacing,
      lineHeight: computed.lineHeight,
      textAlign: computed.textAlign,
      direction: computed.direction,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      borderTop: `${computed.borderTopWidth} solid transparent`,
      borderRight: `${computed.borderRightWidth} solid transparent`,
      borderBottom: `${computed.borderBottomWidth} solid transparent`,
      borderLeft: `${computed.borderLeftWidth} solid transparent`,
      // The entry's own colour, which the editor's glyphs gave up.
      color: computed.caretColor,
    });
    place();
    editor.addEventListener("scroll", place, { passive: true });
    return () => editor.removeEventListener("scroll", place);
  });
  return null;
}

/** A style built afresh by every row render that says what the last one said. */
function sameStyle(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key as keyof CSSProperties], b[key as keyof CSSProperties])) return false;
  }
  return true;
}
/**
 * A cell at rest before and after (inert, the quiet branch: it renders from
 * its props and its own instance alone) whose props say the same thing is
 * left as it is: a row drawn again for an edit elsewhere (every row of a
 * sheet with a table, a rule or a validation is) no longer writes every
 * visible cell's input back into the DOM. Its own entry still re-renders it
 * through its reducer; an active or edited cell always renders.
 */
function sameRestingCell(previous: Props, next: Props): boolean {
  if (previous.inert !== true || next.inert !== true) return false;
  const keys = Object.keys(next) as (keyof Props)[];
  if (keys.length !== Object.keys(previous).length) return false;
  for (const key of keys) {
    if (key === "style") { if (!sameStyle(previous.style, next.style)) return false; continue; }
    if (!Object.prototype.hasOwnProperty.call(previous, key) || !Object.is(previous[key], next[key])) return false;
  }
  return true;
}
export const SpreadsheetDraftInput = memo(SpreadsheetDraftInputEditor, sameRestingCell);
