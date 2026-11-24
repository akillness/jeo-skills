// TokenInput: a text field with atomic tokens, like mentions, files and
// commands in an AI prompt. The value is text and tokens in memory, and one
// codec turns it into text at every boundary: the clipboard, forms and drafts.
// This module is the public API and assembles the primitive. The model is in
// token-input-model.ts, the DOM in token-input-view.ts, editing in
// token-input-editing.ts, state and the API in token-input-api.ts, and parts
// in token-input-parts.ts.
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import type { UndoStackOptions } from "../../foundation/kernel/undo-stack"
import type {
  TextEditorAdapter,
  TextRange,
  Token,
  TokenInsert,
} from "../../foundation/text/text-editor"
import {
  fromText,
  type TokenCodec,
  type TokenInputValue,
} from "./token-input-model"
import { tokenInputSlots } from "./token-input-parts"
import {
  initialTokenInputState,
  syncTokenInputState,
  tokenInputApi,
} from "./token-input-api"

/**
 * Why a token input's value wants to change.
 * @stable
 */
type TokenInputValueChangeReason =
  | "input-change"
  | "paste"
  | "drop"
  | "cut"
  | "undo"
  | "redo"
  | "remove-press"
  | "item-press"
  | "reset"
  | "restore"
  | "imperative"

/**
 * What `onSubmit` receives besides the value.
 * @stable
 */
type TokenInputSubmitDetails = {
  /** The key press, or the trigger menu item's choice, that submitted. */
  event?: Event
}

/**
 * What `onValueChange` receives besides the value.
 * @stable
 */
type TokenInputValueChangeDetails =
  ChangeDetails<TokenInputValueChangeReason> & {
    /** The browser's input type for typing, like `"insertText"` or `"deleteContentBackward"`. */
    inputType?: string
    /** The tokens the old value held and the new one doesn't, matched by id. */
    removed: Token[]
  }

/**
 * How Backspace and Delete treat a token next to the caret.
 * @stable
 */
type TokenDeletion = "whole" | "select" | "revert"

/**
 * Options for every write method on a token input controller.
 * @stable
 */
type TokenInputChangeOptions = ChangeOptions<TokenInputValueChangeReason>

/**
 * Reads, edits and focuses a token input from outside it. Pass it as the `controller` option.
 * @stable
 */
function createTokenInputController() {
  return createController<{
    /** The value: text and tokens. */
    getValue: () => TokenInputValue
    /**
     * Replaces the value as one undoable step.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: TokenInputValue,
      options?: TokenInputChangeOptions
    ) => boolean
    /** The value as codec text, like `Ask [@Ada](mention:ada)`. */
    getText: (codec?: TokenCodec) => string
    /** The value as people read it, with each token's label. */
    getLabel: () => string
    /**
     * Inserts text, a token or a value at the caret, the end or a range, as one undoable step. With
     * `resolve`, a token is pending until it settles: updated with what it resolves to, removed if it rejects.
     * Returns false when the change was canceled.
     */
    insert: (
      content: string | TokenInsert | TokenInputValue,
      options?: TokenInputChangeOptions & {
        /** Where it goes. @defaultValue "caret" */
        at?: "caret" | "end" | TextRange
        /** Keeps a token pending until this settles. */
        resolve?: PromiseLike<void | Partial<TokenInsert>>
      }
    ) => boolean
    /**
     * Changes a token's status, data or label without an undo step or a caret move.
     * Returns false when there's no such token or nothing changed.
     */
    updateToken: (id: string, patch: Partial<Omit<Token, "id">>) => boolean
    /**
     * Removes a token as one undoable step.
     * Returns false when the change was canceled or nothing changed.
     */
    removeToken: (id: string, options?: TokenInputChangeOptions) => boolean
    /** Undoes the last step. Returns false when there was none or the change was canceled. */
    undo: () => boolean
    /** Redoes the last undone step. Returns false when there was none or the change was canceled. */
    redo: () => boolean
    /** Whether there's a step to undo. */
    canUndo: () => boolean
    /** Whether there's a step to redo. */
    canRedo: () => boolean
    /**
     * Empties the input as one undoable step.
     * Returns false when the change was canceled or nothing changed.
     */
    clear: (options?: TokenInputChangeOptions) => boolean
    /** Focuses the editor, with the caret at its start or end. */
    focus: (options?: { at?: "start" | "end" }) => void
    /** The editor a TriggerMenu outside the token input reads and writes. A menu inside it finds it on its own. */
    editor: TextEditorAdapter
  }>()
}

/**
 * A controller from `createTokenInputController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type TokenInputController = ReturnType<typeof createTokenInputController>

/**
 * The options `tokenInput` takes. A component takes them as props on its root.
 * @stable
 */
type TokenInputOptions = {
  /** The value. Pass it to control the input. */
  value?: TokenInputValue
  /** The value at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: TokenInputValue
  /** Runs when typing, pasting, a menu, undo or a controller wants to change the value. `details.reason` says why, `details.removed` lists removed tokens, and `details.cancel()` stops it. */
  onValueChange?: (
    value: TokenInputValue,
    details: TokenInputValueChangeDetails
  ) => void
  /**
   * Runs on the submit shortcut, unless an input method is composing or a trigger menu is open. Without it, the shortcut submits the form the input is in. With neither, the key is left alone, so Enter starts a new line.
   */
  onSubmit?: (value: TokenInputValue, details: TokenInputSubmitDetails) => void
  /**
   * Which keys submit: `"enter"`, with Shift+Enter for a new line, or `"mod+enter"`, with Enter for a new line, which many Japanese and Chinese writers prefer.
   * @defaultValue "enter"
   */
  submitShortcut?: "enter" | "mod+enter"
  /**
   * How Backspace and Delete treat a token next to the caret. `"whole"` removes it in one press,
   * `"select"` selects it first and removes it on the second, and `"revert"` turns it back into its
   * text, so a trigger menu opens on it again.
   * @defaultValue "whole"
   */
  tokenDeletion?: TokenDeletion
  /**
   * What copying writes as plain text: `"codec"` keeps tokens through any app that pastes text, `"label"` writes what people read.
   * @defaultValue "codec"
   */
  copy?: "codec" | "label"
  /**
   * How tokens become text and back, for the clipboard and forms.
   * @defaultValue `[@label](type:value)`
   */
  codec?: TokenCodec
  /**
   * What a token says to screen readers besides its label, like its kind and status.
   * @defaultValue the type, and "loading" while pending
   */
  getTokenDescription?: (token: Token) => string
  /** Undo history: how many steps it keeps, and how long a typing pause starts a new step. */
  history?: UndoStackOptions
  /** Disables the input: it can't be focused or changed, and isn't submitted. */
  disabled?: boolean
  /** Keeps the input focusable and submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission while the input is empty. */
  required?: boolean
  /** The name the codec text submits under. Without one, the input submits nothing. */
  name?: string
  /** The id of a form to belong to, when the input isn't inside it. */
  form?: string
  /** Reads, edits and focuses the input from anywhere. Create one with `createTokenInputController()`. */
  controller?: TokenInputController
} & PrimitiveOptions

/**
 * The state the `editor` slot of `tokenInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TokenInputEditorState = {
  /** Whether the input holds nothing. */
  empty: boolean
  /** Whether the input is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the input is read-only: it stays focusable, but typing, pastes and drops don't change it. */
  readOnly: boolean
}
/**
 * The state the `token` slot of `tokenInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TokenInputTokenState = {
  /** The token this part shows: the one the token input renders its content for. */
  token: Token
  /** Whether the token is in the selection, or selected for removal. */
  selected: boolean
  /** Whether the token is loading. */
  pending: boolean
  /** Whether the token needs the user, like an ambiguous mention. */
  unresolved: boolean
  /** Whether the input is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the input is read-only, so the token's remove button does nothing. */
  readOnly: boolean
}

/**
 * Props of the editor, in every framework.
 * @stable
 */
type TokenInputEditorProps = {
  /** Text shown while the input is empty, through `aria-placeholder`. Show it with `data-empty:before:content-[attr(aria-placeholder)]`. */
  placeholder?: string
}

/**
 * Props of a token's parts, in every framework.
 * @stable
 */
type TokenInputTokenProps = {
  /** The id of the token it shows. Adapters pass it for you. */
  token: string
}

// Reads a custom element's `value` attribute: codec text, like `Ask [@Ada](mention:ada)`.
const valueAttribute = (attribute: string | null) =>
  attribute === null ? undefined : fromText(attribute)

const tokenInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "token-input",
  options: {
    value: valueAttribute,
    defaultValue: "value",
    onValueChange: "callback",
    onSubmit: "callback",
    submitShortcut: "string",
    tokenDeletion: "string",
    copy: "string",
    codec: "value",
    getTokenDescription: "value",
    history: "value",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
  },
  state: initialTokenInputState,
  live: ["selected"],
  sync: syncTokenInputState,
  api: tokenInputApi,
  slots: (slot) => tokenInputSlots(slot),
  agent: { actions: ["setValue", "insert", "removeToken", "clear"] },
})

/**
 * The type of `tokenInput`.
 * @stable
 */
interface TokenInputPrimitive extends Named<typeof tokenInputPrimitive> {}

/**
 * The token input primitive, with the slots `root`, `editor`, `token`,
 * `token-remove`, `form-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const tokenInput: TokenInputPrimitive = tokenInputPrimitive

export {
  createTokenInputController,
  type TokenDeletion,
  tokenInput,
  type TokenInputChangeOptions,
  type TokenInputController,
  type TokenInputEditorProps,
  type TokenInputEditorState,
  type TokenInputOptions,
  type TokenInputPrimitive,
  type TokenInputTokenProps,
  type TokenInputTokenState,
  type TokenInputSubmitDetails,
  type TokenInputValueChangeDetails,
  type TokenInputValueChangeReason,
}
export type { TokenInputApi } from "./token-input-api"
export type { UndoStackOptions } from "../../foundation/kernel/undo-stack"
export type {
  TextEditorAdapter,
  TextRange,
  Token,
  TokenInsert,
} from "../../foundation/text/text-editor"
export type { TokenCodec, TokenInputValue } from "./token-input-model"
export { defaultCodec, fromText, toLabel, toText } from "./token-input-model"
