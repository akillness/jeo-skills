// What a suggestion menu needs from the field it suggests into: TriggerMenu
// reads and writes text through this, so one engine works for an <input>, a
// <textarea>, a TokenInput and any editor a recipe wraps. Types only: every
// adapter brings its own code.

/**
 * An atomic token in a TokenInput: a mention, a file, a command.
 * @stable
 */
type Token = {
  /** Kind, like `"mention"`, `"file"` or `"skill"`. */
  type: string
  /** The id it stands for. */
  value: string
  /** The text it shows, reads as and falls back to. */
  label: string
  /** Stable identity, generated when missing. */
  id?: string
  /** `"pending"` while it loads, `"unresolved"` when it needs the user, like an ambiguous mention. */
  status?: "pending" | "unresolved"
  /** What the chip renders from, like an icon or a run state. Never serialized. */
  data?: Record<string, unknown>
}

/**
 * A token to insert. The same shape as a token; its `id` is generated when missing.
 * @stable
 */
type TokenInsert = Token

/**
 * A range of text offsets, start inclusive and end exclusive. A token counts as one offset.
 * @stable
 */
type TextRange = { start: number; end: number }

/**
 * A rectangle in viewport coordinates.
 * @stable
 */
type TextRect = { x: number; y: number; width: number; height: number }

/**
 * Something that happened in an editor.
 * @stable
 */
type EditorChange =
  | {
      type: "input"
      /** The text the edit put in, where `range` was. */
      inserted: string
      /** The range the edit replaced, in offsets from before the edit. */
      range: TextRange
      /** Whether a person typed, pasted or dictated it. A collaborator's or a program's edit is `false`, and never opens a menu. */
      user: boolean
    }
  | { type: "selection" | "compositionstart" | "compositionend" }

/**
 * Options for `replace`.
 * @stable
 */
type EditorReplaceOptions = {
  /** Inserts a token as pending until this settles: updated with what it resolves to, removed if it rejects. */
  pending?: PromiseLike<void | Partial<TokenInsert>>
}

/**
 * The editor a TriggerMenu reads and writes. TriggerMenuInput and TokenInput
 * provide one. Write one for any other editor, like Tiptap or CodeMirror.
 * @stable
 */
type TextEditorAdapter = {
  /** The focused element that gets keys and the menu's ARIA. Undefined until it's in the page. */
  readonly element: HTMLElement | undefined
  /** Up to `length` characters before the caret, and the offset they start at. A token reads as U+FFFC. */
  textBefore: (length: number) => { text: string; offset: number } | null
  /** The selection as text offsets, or null while unfocused. */
  selection: () => TextRange | null
  /** The rectangle at a text offset, for anchoring. */
  rectAt: (offset: number) => TextRect | null
  /** Replaces a range with text or a token as one undoable step, and puts the caret after it. */
  replace: (
    range: TextRange,
    content: string | TokenInsert,
    options?: EditorReplaceOptions
  ) => void
  /** Calls `listener` for text edits, caret moves and composition. Returns a cleanup. */
  subscribe: (listener: (change: EditorChange) => void) => () => void
  /** Whether an input method is composing. */
  composing: () => boolean
  /** Whether `replace` accepts tokens. */
  tokens?: boolean
  /** Sends what's typed, like a form submit, for items that end with `after: "submit"`. */
  submit?: (event?: Event) => void
}

export {
  type EditorChange,
  type EditorReplaceOptions,
  type TextEditorAdapter,
  type TextRange,
  type TextRect,
  type Token,
  type TokenInsert,
}
