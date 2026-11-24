"use client";
































/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import PresentationCellRichTextEditor, {
  type PresentationCellParagraphStyle,
  type PresentationCellTextElement,
} from "../notebook/contents/PresentationCellRichTextEditor";
import {
  fitOfficeInlineTextEditor,
  moveOfficeInlineTextCaretHomeEnd,
  placeOfficeInlineTextCaret,
  typeOfficeInlineTextTab,
} from "../../lib/office-inline-text-editor";
import type { RunStyle, TextRun } from "../../lib/presentation-runs";
import { officeTextPaintCss, type OfficeTextPaint } from "../../lib/office-text-paint";

/** On the field: the caret and selection guarantee below keys on it. */
export const OFFICE_SHAPE_TEXT_FIELD_ATTRIBUTE = "data-office-shape-text-field";

const OFFICE_SHAPE_TEXT_FIELD_STYLE_ID = "office-shape-text-field-style";

/**
 * The field's runs take the field's own caret colour, and its selected words
 * are highlighted. `!important` because the rules it answers sit in the
 * enclosing editor's stylesheet, are more specific than any rule the field
 * could own, and match the runs directly (an inherited value never beats a
 * rule that matches). The field itself keeps the colour stated on it (an
 * inline style), so a host that wants no caret still says so there.
 */
export const OFFICE_SHAPE_TEXT_FIELD_CSS = [
  `[${OFFICE_SHAPE_TEXT_FIELD_ATTRIBUTE}] * { caret-color: inherit !important; }`,
  `[${OFFICE_SHAPE_TEXT_FIELD_ATTRIBUTE}]::selection, [${OFFICE_SHAPE_TEXT_FIELD_ATTRIBUTE}] ::selection { background-color: Highlight !important; }`,
].join("\n");

/** Put the guarantee in the field's document once (it holds in every editor). */
export function ensureOfficeShapeTextFieldStyle(root: Document): void {
  if (root.getElementById(OFFICE_SHAPE_TEXT_FIELD_STYLE_ID)) return;
  const style = root.createElement("style");
  style.id = OFFICE_SHAPE_TEXT_FIELD_STYLE_ID;
  style.textContent = OFFICE_SHAPE_TEXT_FIELD_CSS;
  (root.head ?? root.documentElement).append(style);
}

export type OfficeShapeTextFieldElement = PresentationCellTextElement & {
  /** `value =` replaces the words (a programmatic edit), as on a textarea. */
  value: string;
};

/**
 * The words' own Undo and Redo while they are typed, on the field: Office
 * takes back what was typed in a shape with Ctrl+Z without leaving it. The
 * field writes every edit itself, so the browser's own undo has nothing.
 */
export interface OfficeShapeTextHistory {
  officeTextUndo(): boolean;
  officeTextRedo(): boolean;
  officeTextCanUndo(): boolean;
  officeTextCanRedo(): boolean;
}

/** Raised (bubbling) on the field whenever its own history changes, so a
 * host's Undo / Redo buttons can follow it. */
export const OFFICE_SHAPE_TEXT_HISTORY_EVENT = "office-shape-text-history";

/** The field's own history, when `field` is a shared shape text field. */
export function officeShapeTextHistory(field: unknown): OfficeShapeTextHistory | null {
  const candidate = field as Partial<OfficeShapeTextHistory> | null;
  return candidate && typeof candidate.officeTextUndo === "function"
    ? (candidate as OfficeShapeTextHistory)
    : null;
}

interface OfficeShapeTextHistoryEntry {
  text: string;
  runs: TextRun[] | undefined;
  start: number;
  end: number;
}

/** Typing within this long of the last keystroke is one Undo step, as Word
 * takes back a typed run at once. */
const OFFICE_SHAPE_TEXT_UNDO_GROUP_MS = 1000;

export interface OfficeShapeTextFieldContent {
  readonly text: string;
  readonly runs: readonly TextRun[] | undefined;
  /** The shape's own character format: what an unformatted run draws as. */
  readonly inherited: RunStyle;
  /** The label's type (font, size, weight, colour, alignment) and the box's
   * place in the shape. A caret colour the host does not state is the
   * words' own colour. */
  readonly style: CSSProperties;
  /** The words' paragraphs as the shape draws them (an imported Word
   * shape's `w:txbxContent`): each is typed in its own size, alignment and
   * spacing. Absent: one flow in the label's type. */
  readonly paragraphs?: readonly PresentationCellParagraphStyle[];
  /** The WordArt the shape's words wear: Font Color on them is its fill
   * (`patchCellCharacterStyle`), not a colour it draws over. */
  readonly paint?: OfficeTextPaint | null;
}

export interface OfficeShapeTextFieldContentHandle {
  set(content: OfficeShapeTextFieldContent): void;
  get(): { text: string; runs: TextRun[] | undefined };
}

export interface OfficeShapeTextFieldProps {
  /** The words the field opens with; what is typed after is the field's. */
  readonly initial: OfficeShapeTextFieldContent;
  readonly ariaLabel: string;
  readonly testId: string;
  readonly maxLength: number;
  /** The size a superscript / subscript run is drawn at, as a multiple of
   * its own (Docs' 0.65, the sheet's 0.75). */
  readonly scriptScale?: number;
  /** Open with the keyboard in the words, the caret at `caret` (a press's
   * place in them) or after them (Enter, F2, a typed key). */
  readonly autoFocus?: boolean;
  readonly caret?: number | null;
  /** Fit the box to its words on every edit (a box hung from the middle). */
  readonly fit?: boolean;
  /**
   * The words' paragraphs as the shape draws them FOR the words as typed (a
   * worksheet shape's list: each paragraph's bullet or number, margin and
   * alignment follow the paragraphs typed). Wins over `initial.paragraphs`.
   */
  readonly paragraphsFor?: (text: string) => readonly PresentationCellParagraphStyle[] | undefined;
  readonly onInput?: () => void;
  /** The selection in the words moved (Home shows what it holds). */
  readonly onSelectionUpdate?: () => void;
  readonly onElement?: (element: OfficeShapeTextFieldElement | null) => void;
  readonly onBlur?: FocusEventHandler<HTMLDivElement>;
  readonly onFocus?: FocusEventHandler<HTMLDivElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  readonly onClick?: MouseEventHandler<HTMLDivElement>;
  readonly onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  readonly onPointerDown?: PointerEventHandler<HTMLDivElement>;
}

/** The first `max` characters of `runs`. */
function clipRuns(runs: readonly TextRun[], max: number): TextRun[] {
  const out: TextRun[] = [];
  let left = max;
  for (const run of runs) {
    if (left <= 0) break;
    const text = run.text.slice(0, left);
    left -= text.length;
    out.push(run.style ? { text, style: run.style } : { text });
  }
  return out;
}








export function officeShapeTextFieldPaintStyle(paint: OfficeTextPaint | null | undefined): CSSProperties {
  if (!paint) return {};
  let css: CSSProperties;
  try {
    css = officeTextPaintCss(paint);
  } catch {
    return {};
  }
  // The caret is not the paint's: the shared WordArt caret draws over
  // painted words in one colour (`office-painted-caret.ts`, owner,
  
  return css;
}

/** A field's `style`: the words' colour is the caret's unless one is stated. */
function fieldStyle(style: CSSProperties): CSSProperties {
  return style.caretColor === undefined ? { ...style, caretColor: "currentColor" } : style;
}

/**
 * The shared text box. Uncontrolled: it opens with `initial` and then holds
 * what is typed; `ref` sets new content (Docs re-opens one mounted field on
 * each edit) and reads the words and runs as typed.
 */
export const OfficeShapeTextField = forwardRef<
  OfficeShapeTextFieldContentHandle,
  OfficeShapeTextFieldProps
>(function OfficeShapeTextField(props, ref) {
  const [content, setContent] = useState<OfficeShapeTextFieldContent>(props.initial);
  // Read synchronously by a host between an edit and its render.
  const latest = useRef<{ text: string; runs: TextRun[] | undefined }>({
    text: props.initial.text,
    runs: props.initial.runs ? [...props.initial.runs] : undefined,
  });
  const contentRef = useRef(content);
  const hostRef = useRef<OfficeShapeTextFieldElement | null>(null);
  const propsRef = useRef(props);
  // Read by the `value` setter and the opening below, outside a render.
  useLayoutEffect(() => {
    contentRef.current = content;
    propsRef.current = props;
  });
  // The words' own Undo / Redo: each edit the field commits is a step (a
  // typed run within a second of its last key is one), and a step restores
  // the words, their runs and the caret it had.
  const history = useRef({
    past: [] as OfficeShapeTextHistoryEntry[],
    future: [] as OfficeShapeTextHistoryEntry[],
    current: {
      text: props.initial.text,
      runs: props.initial.runs ? [...props.initial.runs] : undefined,
      start: props.initial.text.length,
      end: props.initial.text.length,
    } as OfficeShapeTextHistoryEntry,
    lastAt: 0,
    lastKind: null as "insert" | "delete" | null,
  });
  const announceHistory = () => {
    hostRef.current?.dispatchEvent(new Event(OFFICE_SHAPE_TEXT_HISTORY_EVENT, { bubbles: true }));
  };
  const resetHistory = (text: string, runs: TextRun[] | undefined) => {
    announceHistory();
    history.current = {
      past: [],
      future: [],
      current: { text, runs, start: text.length, end: text.length },
      lastAt: 0,
      lastKind: null,
    };
  };
  const recordEdit = (text: string, runs: TextRun[] | undefined) => {
    const state = history.current;
    const previous = state.current;
    if (previous.text === text && JSON.stringify(previous.runs) === JSON.stringify(runs)) return;
    const kind = text.length > previous.text.length ? "insert" : text.length < previous.text.length ? "delete" : null;
    const now = Date.now();
    const grouped =
      kind !== null &&
      kind === state.lastKind &&
      now - state.lastAt < OFFICE_SHAPE_TEXT_UNDO_GROUP_MS &&
      state.past.length > 0;
    if (!grouped) state.past.push(previous);
    state.future = [];
    // Until the field has drawn the edit, the caret is taken to follow the
    // typed (or removed) characters; it is read back once drawn.
    const caret = Math.max(0, Math.min(text.length, previous.start + Math.max(0, text.length - previous.text.length)));
    const entry: OfficeShapeTextHistoryEntry = { text, runs, start: caret, end: caret };
    state.current = entry;
    state.lastAt = now;
    state.lastKind = kind;
    announceHistory();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        const host = hostRef.current;
        if (!host?.isConnected || history.current.current !== entry) return;
        entry.start = host.selectionStart;
        entry.end = host.selectionEnd;
      });
    }
  };
  const set = (next: OfficeShapeTextFieldContent) => {
    latest.current = { text: next.text, runs: next.runs ? [...next.runs] : undefined };
    resetHistory(next.text, latest.current.runs);
    setContent(next);
  };
  useImperativeHandle(ref, () => ({ set, get: () => latest.current }), []);
  // The words are the field's once typed, but their FORMAT is the host's: a
  // ribbon command that restyles the shape while its words are open (colour,
  // size, weight, underline) shows on them at once. The field had kept the
  // format it opened with until the edit ended, so a SmartArt shape's new
  // colour appeared only after a click outside (video audit A01). The words,
  // their runs, the caret, the selection and an IME composition are kept.
  const formatKey = JSON.stringify([
    props.initial.style,
    props.initial.inherited,
    props.initial.paragraphs ?? null,
  ]);
  const shownFormatKey = useRef(formatKey);
  useLayoutEffect(() => {
    if (shownFormatKey.current === formatKey) return;
    shownFormatKey.current = formatKey;
    const { style, inherited, paragraphs } = propsRef.current.initial;
    setContent((current) => ({
      ...current,
      style,
      inherited,
      ...(paragraphs !== undefined ? { paragraphs } : {}),
    }));
  }, [formatKey]);
  // After the field's own layout effects, which define its read-only `value`:
  // `value =` replaces the words, as it did on the textarea the shared box
  // replaced (a host's programmatic edit, a test's change event).
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    ensureOfficeShapeTextFieldStyle(host.ownerDocument);
    const read = Object.getOwnPropertyDescriptor(host, "value")?.get;
    Object.defineProperty(host, "value", {
      configurable: true,
      get: () => (read ? read.call(host) : host.textContent ?? ""),
      set: (next: string) => {
        const text = String(next).slice(0, propsRef.current.maxLength);
        const before = latest.current.text;
        flushSync(() =>
          set({ ...contentRef.current, text, runs: undefined, paragraphs: undefined }),
        );
        if (before !== text) propsRef.current.onInput?.();
      },
    });
    const restoreEntry = (entry: OfficeShapeTextHistoryEntry) => {
      latest.current = { text: entry.text, runs: entry.runs ? [...entry.runs] : undefined };
      flushSync(() => setContent((current) => ({ ...current, text: entry.text, runs: entry.runs })));
      const caret = Math.min(entry.text.length, entry.start);
      host.setSelectionRange(caret, Math.min(entry.text.length, Math.max(caret, entry.end)));
      if (propsRef.current.fit) fitOfficeInlineTextEditor(host as unknown as HTMLTextAreaElement);
      propsRef.current.onInput?.();
    };
    // An edit the field made without telling (none today) is a step first.
    const syncHistory = () => {
      const live = latest.current;
      recordEdit(live.text, live.runs);
    };
    const step = (from: "past" | "future") => {
      syncHistory();
      const state = history.current;
      const entry = state[from].pop();
      if (!entry) return false;
      (from === "past" ? state.future : state.past).push(state.current);
      state.current = { ...entry };
      state.lastKind = null;
      restoreEntry(entry);
      announceHistory();
      return true;
    };
    Object.defineProperties(host, {
      officeTextUndo: { configurable: true, value: () => step("past") },
      officeTextRedo: { configurable: true, value: () => step("future") },
      officeTextCanUndo: {
        configurable: true,
        value: () => {
          syncHistory();
          return history.current.past.length > 0;
        },
      },
      officeTextCanRedo: { configurable: true, value: () => history.current.future.length > 0 },
    });
    if (propsRef.current.fit) fitOfficeInlineTextEditor(host as unknown as HTMLTextAreaElement);
    if (propsRef.current.autoFocus) {
      openOfficeShapeTextField(host, propsRef.current.caret);
    }
  }, []);
  return (
    <PresentationCellRichTextEditor
      ref={(element) => {
        hostRef.current = element as OfficeShapeTextFieldElement | null;
        props.onElement?.(hostRef.current);
      }}
      {...{ [OFFICE_SHAPE_TEXT_FIELD_ATTRIBUTE]: "true" }}
      value={content.text}
      runs={content.runs}
      inheritedStyle={content.inherited}
      containerPaint={content.paint}
      style={fieldStyle(content.style)}
      paragraphStyles={props.paragraphsFor ? props.paragraphsFor(content.text) : content.paragraphs}
      scriptScale={props.scriptScale}
      // A shape's words are lines of paragraphs in every host: Shift+Enter
      // breaks the line, where a table cell's soft break was dropped.
      lineBreak={"\n"}
      // A caret formats no existing word: the format is held for what is
      
      aria-label={props.ariaLabel}
      data-testid={props.testId}
      onSelectionUpdate={() => {
        // The caret the words have now is the one their Undo step returns
        // to; a caret moved elsewhere starts a new typed run.
        const host = hostRef.current;
        if (host) {
          const state = history.current;
          state.current = { ...state.current, start: host.selectionStart, end: host.selectionEnd };
          state.lastKind = null;
        }
        props.onSelectionUpdate?.();
      }}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onPointerDown={props.onPointerDown}
      onChange={({ target }) => {
        const clipped = target.value.length > props.maxLength;
        const runs = clipped ? clipRuns(target.runs, props.maxLength) : target.runs;
        const text = clipped ? target.value.slice(0, props.maxLength) : target.value;
        recordEdit(text, runs);
        latest.current = { text, runs };
        setContent((current) => ({ ...current, text, runs }));
        if (props.fit && hostRef.current) {
          fitOfficeInlineTextEditor(hostRef.current as unknown as HTMLTextAreaElement);
        }
        props.onInput?.();
      }}
    />
  );
});

/**
 * Put the keyboard in the words: a caret, not a selection -- at `caret` (a
 * press's place in the words) or after them (Enter, F2, a typed key that
 * replaced them), as Office opens a shape's text.
 */
export function openOfficeShapeTextField(
  field: PresentationCellTextElement | HTMLTextAreaElement,
  caret?: number | null,
): void {
  field.focus({ preventScroll: true });
  // The field keeps a textarea's `value` and `setSelectionRange`.
  placeOfficeInlineTextCaret(field as HTMLTextAreaElement, caret);
}

export interface OfficeShapeTextKeyHandlers {
  /** Enter: the words are done (a SmartArt shape's: Enter ends the edit and
   * Shift+Enter is a line break). Absent: Enter is the field's own new
   * paragraph (a shape's words). */
  readonly commit?: () => void;
  /** Esc: leave the words as typed and select the shape again (Office). */
  readonly leave: () => void;
}

type ShapeTextKeyEvent = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
  keyCode?: number;
};

/**
 * The shared keyboard of the shape text box, as Office's text in a shape
 * (Microsoft Support, "Keyboard shortcuts for SmartArt graphics"): Esc leaves
 * the words, Enter ends a SmartArt shape's words, Tab types a tab, Home / End
 * move the caret to the line's start / end and Ctrl+Home / Ctrl+End to the
 * words' (the browser scrolled instead on macOS), Ctrl/Cmd+A selects the
 * words, not the page. Arrows are the field's own. True when the key was
 * the box's; the host stops it from reaching the page either way. Keys that
 * belong to an IME composition are never taken.
 */
export function handleOfficeShapeTextKey(
  event: ShapeTextKeyEvent,
  field: PresentationCellTextElement | HTMLTextAreaElement,
  handlers: OfficeShapeTextKeyHandlers,
): boolean {
  if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return false;
  const words = field as unknown as HTMLTextAreaElement;
  // Ctrl/Cmd+Z takes back what was typed in the words, Ctrl+Y and
  // Shift+Cmd+Z put it back, without leaving them (Office). A textarea keeps
  // the browser's own undo, which records its typing.
  const history = officeShapeTextHistory(field);
  if (history && (event.metaKey || event.ctrlKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
    if (undo || redo) {
      event.preventDefault();
      if (undo) history.officeTextUndo();
      else history.officeTextRedo();
      return true;
    }
  }
  if (event.key === "Escape") {
    event.preventDefault();
    handlers.leave();
    return true;
  }
  if (
    event.key === "Enter" &&
    handlers.commit &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();
    handlers.commit();
    return true;
  }
  if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (field instanceof HTMLTextAreaElement) return typeOfficeInlineTextTab(event, field);
    event.preventDefault();
    // Typed as a key is (the field reads the browser's own edit), so it is
    // one undo step and replaces a selection.
    const doc = field.ownerDocument;
    if (!event.shiftKey && field.isContentEditable && typeof doc.execCommand === "function") {
      doc.execCommand("insertText", false, "\t");
    }
    return true;
  }
  if ((event.key === "Home" || event.key === "End") && !event.altKey) {
    if (field instanceof HTMLTextAreaElement) return moveOfficeInlineTextCaretHomeEnd(event, field);
    event.preventDefault();
    const length = words.value.length;
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+Home / Ctrl+End: the start / end of the words.
      const start = words.selectionStart ?? 0;
      const end = words.selectionEnd ?? start;
      if (event.key === "Home") words.setSelectionRange(0, event.shiftKey ? end : 0);
      else words.setSelectionRange(event.shiftKey ? start : length, length);
      return true;
    }
    // The line as it is drawn (a wrapped line's own start / end), which the
    // field's words can tell and a textarea could not.
    const selection = field.ownerDocument.getSelection() as
      | (Selection & { modify?: (alter: string, direction: string, granularity: string) => void })
      | null;
    if (selection?.modify) {
      selection.modify(
        event.shiftKey ? "extend" : "move",
        event.key === "Home" ? "backward" : "forward",
        "lineboundary",
      );
    } else {
      moveOfficeInlineTextCaretHomeEnd(event, words);
    }
    return true;
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a"
  ) {
    event.preventDefault();
    words.setSelectionRange(0, words.value.length);
    return true;
  }
  return false;
}

/** The shared box in a host that builds its DOM by hand (Docs' node views). */
export interface MountedOfficeShapeTextField {
  /** The field (`value`, `selectionStart`, `formatCharacters`, …). */
  element(): OfficeShapeTextFieldElement | null;
  setContent(content: OfficeShapeTextFieldContent): void;
  /** The words and their runs as typed. */
  content(): { text: string; runs: TextRun[] | undefined };
  destroy(): void;
}

/**
 * Mount the shared box into `container` (on first use, never while the
 * host's own editor renders). Its content is set on each opening.
 */
export function mountOfficeShapeTextField(
  container: HTMLElement,
  options: Pick<
    OfficeShapeTextFieldProps,
    "ariaLabel" | "testId" | "maxLength" | "scriptScale" | "onInput" | "onSelectionUpdate"
  >,
): MountedOfficeShapeTextField {
  let root: Root | null = createRoot(container);
  let handle: OfficeShapeTextFieldContentHandle | null = null;
  let element: OfficeShapeTextFieldElement | null = null;
  flushSync(() => {
    root!.render(
      <OfficeShapeTextField
        ref={(value) => {
          handle = value;
        }}
        initial={{ text: "", runs: undefined, inherited: {}, style: {} }}
        {...options}
        onElement={(value) => {
          element = value;
        }}
      />,
    );
  });
  return {
    element: () => element,
    setContent(content) {
      flushSync(() => handle?.set(content));
    },
    content: () => handle?.get() ?? { text: "", runs: undefined },
    destroy() {
      const current = root;
      root = null;
      // Never unmount inside the host editor's own render.
      queueMicrotask(() => current?.unmount());
    },
  };
}
