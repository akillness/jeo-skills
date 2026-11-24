// TokenInput's state and API: the value and its changes, undo history, the
// caret, announcements, and the editor adapter a TriggerMenu writes through.
import { announce } from "../../foundation/platform/announce"
import { textDiff } from "../../foundation/text/caret"
import { createUndoStack } from "../../foundation/kernel/undo-stack"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  EditorChange,
  TextEditorAdapter,
  TextRange,
  Token,
  TokenInsert,
} from "../../foundation/text/text-editor"
import type {
  TokenInputChangeOptions,
  TokenInputOptions,
  TokenInputValueChangeReason,
} from "./token-input"
import {
  defaultCodec,
  isToken,
  normalizeValue,
  offsetText,
  removedTokens,
  replaceRange,
  sameValue,
  toLabel,
  toText,
  tokenAt,
  tokensOf,
  valueLength,
  type TokenInputValue,
} from "./token-input-model"
import type { TokenView } from "./token-input-view"
import { createChange } from "../../foundation/kernel/input-source"
import { keepsValueOnReset } from "../../foundation/forms/value"

type TokenInputState = {
  value: TokenInputValue
  initial: TokenInputValue
  // Ids of the tokens in the selection, or selected for removal, space-separated.
  selected: string
  // Counts host changes, so frameworks render into new hosts.
  hosts: number
  // Whether a framework renders each token's content.
  custom: boolean
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
}

// Reasons a person caused, which a trigger menu follows.
const userReasons = new Set<string>(["input-change", "paste", "drop", "cut"])

// A controlled value passed back as the same array keeps its normalized form,
// so tokens keep their ids and hosts.
const normalized = new WeakMap<TokenInputValue, TokenInputValue>()
function normalizedOnce(value: TokenInputValue) {
  let result = normalized.get(value)
  if (!result) {
    normalized.set(value, (result = normalizeValue(value)))
  }
  return result
}

function initialTokenInputState(options: TokenInputOptions) {
  const initial = normalizedOnce(options.defaultValue ?? [])
  return {
    value: options.value ? normalizedOnce(options.value) : initial,
    initial,
    selected: "",
    hosts: 0,
    custom: false,
    disabled: !!options.disabled,
    formDisabled: false,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
  }
}

function syncTokenInputState(options: TokenInputOptions) {
  return {
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    ...(options.value === undefined
      ? {}
      : { value: normalizedOnce(options.value) }),
    ...(options.defaultValue === undefined
      ? {}
      : { initial: normalizedOnce(options.defaultValue) }),
  }
}

// The ids of the tokens a selection covers, space-separated.
function selectedIds(value: TokenInputValue, range: TextRange | null) {
  if (!range || range.start === range.end) {
    return ""
  }
  let at = 0
  const ids: string[] = []
  for (const segment of value) {
    if (isToken(segment) && at >= range.start && at < range.end) {
      ids.push(segment.id!)
    }
    at += isToken(segment) ? 1 : segment.length
  }
  return ids.join(" ")
}

// What a token says to screen readers besides its label.
const defaultDescription = (token: Token) =>
  `${token.type}${token.status === "pending" ? ", loading" : token.status === "unresolved" ? ", unresolved" : ""}`

type Edit = {
  reason: TokenInputValueChangeReason
  event?: Event
  inputType?: string
  // The caret or selection after the edit.
  selection?: TextRange
  // Edits of one group join one undo step, like typing.
  group?: string
  // Undo and redo move through history instead of adding to it.
  record?: boolean
}

// The form a control belongs to, like a native control's `form`: the one
// its `form` attribute names, in its document or shadow root, else the one
// it's in. A `form` naming something else means no form, as natively.
function ownerForm(el: Element | null | undefined, formId: string | undefined) {
  if (!el) {
    return null
  }
  if (formId === undefined) {
    return el.closest("form")
  }
  const root = el.getRootNode() as Document | ShadowRoot
  const named =
    "getElementById" in root
      ? root.getElementById(formId)
      : el.ownerDocument.getElementById(formId)
  return named instanceof HTMLFormElement ? named : null
}

function tokenInputApiBody(
  context: PrimitiveContext<TokenInputOptions, TokenInputState, string>
) {
  const { id, store, options, element } = context
  const change = createChange(context)
  let view: TokenView | undefined
  let selection: TextRange | null = null
  let focused = false
  let composing = false
  // The selection to restore once the DOM shows the next value.
  let pendingSelection: TextRange | undefined
  // The value this instance committed last. Edits build on it, since a
  // controlled value comes back only once the owner renders. It also tells
  // this instance's own changes from a value set from outside.
  let committed = store.get().value
  const listeners = new Set<(change: EditorChange) => void>()
  const history = createUndoStack<{
    value: TokenInputValue
    selection: TextRange | null
  }>({ value: store.get().value, selection: null }, () => options().history)
  let messages: string[] = []

  const codec = () => options().codec ?? defaultCodec
  const describe = (token: Token) =>
    options().getTokenDescription?.(token) ?? defaultDescription(token)
  const editable = () => {
    const state = store.get()
    return !isDisabled(state) && !state.readOnly
  }
  const emit = (change: EditorChange) =>
    listeners.forEach((listener) => listener(change))

  // Says what happened to tokens, a moment later and joined, so several changes at once are one message.
  function say(message: string) {
    messages.push(message)
    announce(messages.join(". "))
    queueMicrotask(() => (messages = []))
  }

  function caretAt(offset: number) {
    return { start: offset, end: offset }
  }

  function commit(
    next: TokenInputValue,
    { reason, event, inputType, selection: after, group, record = true }: Edit
  ) {
    const before = committed
    const value = normalizeValue(next)
    // A controlled owner passes this array back as it is.
    normalized.set(value, value)
    if (sameValue(before, value)) {
      if (after) {
        setSelection(after)
      }
      return false
    }
    const removed = removedTokens(before, value)
    pendingSelection = after
    if (after) {
      selection = after
    }
    committed = value
    const accepted = change("value", value, {
      reason,
      event,
      inputType,
      removed,
    } as never)
    if (!accepted) {
      // A canceled edit the browser already made comes out of the DOM.
      committed = before
      pendingSelection = undefined
      render()
      return false
    }
    if (record) {
      history.record({ value, selection: after ?? null }, { group })
    }
    emit({
      type: "input",
      ...textDiff(offsetText(before), offsetText(value)),
      user: userReasons.has(reason),
    })
    for (const token of removed) {
      say(`Removed ${describe(token)} ${token.label}`)
    }
    // A controlled input whose owner didn't take the value shows what it holds,
    // once the owner has had its turn to render.
    if (options().value !== undefined) {
      setTimeout(() => {
        if (committed !== value || store.get().value === value) {
          return
        }
        committed = store.get().value
        render()
      })
    }
    return true
  }

  // Shows the current value, and the selection an edit left.
  function render() {
    if (!view) {
      return
    }
    view.render(store.get().value)
    const length = valueLength(store.get().value)
    const target = pendingSelection ?? (focused ? selection : null)
    pendingSelection = undefined
    if (target && focused) {
      view.select({
        start: Math.min(target.start, length),
        end: Math.min(target.end, length),
      })
    }
  }

  let shown = store.get().value
  store.subscribe(() => {
    const { value } = store.get()
    if (value === shown) {
      return
    }
    shown = value
    // A value from outside, like a controlled reset after sending, is its own
    // undo step. The value this instance sent, passed back, isn't.
    if (value !== committed) {
      if (!sameValue(value, committed)) {
        history.record({ value, selection: null })
      }
      committed = value
    }
    render()
  })

  function setSelection(next: TextRange | null) {
    selection = next
    if (next && view && focused) {
      view.select(next)
    }
  }

  // Inserts at a range: text, a token followed by a space unless one follows, or a value.
  function insertAt(
    range: TextRange,
    content: string | TokenInsert | TokenInputValue,
    {
      reason,
      event,
      pending,
    }: {
      reason: TokenInputValueChangeReason
      event?: Event
      pending?: PromiseLike<void | Partial<TokenInsert>>
    }
  ) {
    const value = committed
    const inserted: TokenInputValue = Array.isArray(content)
      ? normalizeValue(content)
      : typeof content === "string"
        ? [content]
        : normalizeValue([
            { ...content, ...(pending ? { status: "pending" as const } : {}) },
          ])
    const token =
      inserted.length === 1 && isToken(inserted[0]) ? inserted[0] : undefined
    const following = offsetText(value)[range.end]
    if (token && (following === undefined || !/\s/.test(following))) {
      inserted.push(" ")
    }
    const end = range.start + valueLength(inserted)
    const next = replaceRange(value, range, inserted)
    if (!commit(next, { reason, event, selection: caretAt(end) })) {
      return false
    }
    if (token) {
      say(`Inserted ${describe(token)} ${token.label}`)
    }
    if (!token || !pending) {
      return true
    }
    // An id the value already had is given to its first token, so read the one it ended up with.
    const tokenId = tokenAt(next, range.start)!.id!
    pending.then(
      (patch) =>
        updateToken(tokenId, { ...(patch ?? {}), status: patch?.status }),
      () => {
        say(`Couldn't add ${token.label}`)
        removeToken(tokenId, { reason: "imperative", record: false })
      }
    )
    return true
  }

  // Rewrites one token everywhere, history included, without an undo step or a caret move.
  function updateToken(tokenId: string, patch: Partial<Omit<Token, "id">>) {
    const update = (value: TokenInputValue) =>
      value.map((segment) =>
        isToken(segment) && segment.id === tokenId
          ? { ...segment, ...patch }
          : segment
      )
    // History first: a token removed while it loads comes back settled on undo.
    history.map((entry) => ({ ...entry, value: update(entry.value) }))
    const before = tokensOf(committed).find((token) => token.id === tokenId)
    if (!before) {
      return false
    }
    const changed = commit(update(committed), {
      reason: "imperative",
      record: false,
    })
    if (before.status === "pending" && !patch.status) {
      say(`${patch.label ?? before.label} ready`)
    }
    return changed
  }

  function removeToken(
    tokenId: string,
    {
      reason = "imperative",
      record = true,
      event,
    }: {
      reason?: TokenInputValueChangeReason
      record?: boolean
      event?: Event
    } = {}
  ) {
    const remove = (value: TokenInputValue) =>
      value.filter((segment) => !(isToken(segment) && segment.id === tokenId))
    if (!record) {
      history.map((entry) => ({ ...entry, value: remove(entry.value) }))
    }
    return commit(remove(committed), { reason, event, record })
  }

  function undo(event?: Event) {
    const entry = history.undo()
    return (
      !!entry &&
      commit(entry.value, {
        reason: "undo",
        event,
        selection: entry.selection ?? undefined,
        record: false,
      })
    )
  }

  function redo(event?: Event) {
    const entry = history.redo()
    return (
      !!entry &&
      commit(entry.value, {
        reason: "redo",
        event,
        selection: entry.selection ?? undefined,
        record: false,
      })
    )
  }

  // The submit shortcut: `onSubmit`, else its form, which `form` can name
  // from outside it, like a native control's.
  function submit(event?: Event) {
    const onSubmit = options().onSubmit
    if (onSubmit) {
      return onSubmit(store.get().value, { event })
    }
    ownerForm(element("editor"), store.get().form)?.requestSubmit()
  }

  const canSubmit = () =>
    !!options().onSubmit || !!ownerForm(element("editor"), store.get().form)

  const editor: TextEditorAdapter = {
    get element() {
      return element("editor")
    },
    textBefore(length) {
      if (!focused || !selection) {
        return null
      }
      const caret = selection.end
      const offset = Math.max(0, caret - length)
      return { text: offsetText(committed).slice(offset, caret), offset }
    },
    selection: () => (focused ? selection : null),
    rectAt: (offset) => view?.rectAt(offset) ?? null,
    replace: (range, content, replaceOptions) =>
      insertAt(range, content, {
        reason: "item-press",
        pending: replaceOptions?.pending,
      }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    composing: () => composing,
    tokens: true,
    submit,
  }

  const api = {
    id,
    editor,
    getValue: () => store.get().value,
    setValue: (
      value: TokenInputValue,
      { reason = "imperative", event }: TokenInputChangeOptions = {}
    ) =>
      commit(value, {
        reason,
        event,
        selection: caretAt(valueLength(normalizeValue(value))),
      }),
    getText: (custom?: Parameters<typeof toText>[1]) =>
      toText(store.get().value, custom ?? codec()),
    getLabel: () => toLabel(store.get().value),
    insert(
      content: string | TokenInsert | TokenInputValue,
      {
        at = "caret",
        resolve,
        reason = "imperative",
        event,
      }: TokenInputChangeOptions & {
        at?: "caret" | "end" | TextRange
        resolve?: PromiseLike<void | Partial<TokenInsert>>
      } = {}
    ) {
      const length = valueLength(committed)
      const range =
        typeof at === "object"
          ? at
          : at === "end" || !selection
            ? caretAt(length)
            : selection
      return insertAt(range, content, { reason, event, pending: resolve })
    },
    updateToken,
    removeToken: (
      tokenId: string,
      { reason, event }: TokenInputChangeOptions = {}
    ) => removeToken(tokenId, { reason, event }),
    undo: () => undo(),
    redo: () => redo(),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    clear: ({ reason = "imperative", event }: TokenInputChangeOptions = {}) =>
      commit([], { reason, event, selection: caretAt(0) }),
    focus({ at = "end" }: { at?: "start" | "end" } = {}) {
      const el = element("editor")
      if (!el) {
        return
      }
      el.focus({ preventScroll: true })
      setSelection(caretAt(at === "start" ? 0 : valueLength(store.get().value)))
    },
    // Internal. Used by slots, the editing module and adapters.
    internal: {
      options,
      editable,
      codec,
      describe,
      commit,
      undo,
      redo,
      submit,
      canSubmit,
      say,
      seal: history.seal,
      // The latest value, which a controlled owner may not have passed back yet.
      latest: () => committed,
      removeToken,
      caretAt,
      setView(next: TokenView | undefined) {
        view = next
        if (next) {
          render()
        }
      },
      view: () => view,
      setSelection(next: TextRange | null) {
        selection = next
        store.set({ selected: selectedIds(store.get().value, next) })
        emit({ type: "selection" })
      },
      selection: () => selection,
      setFocused(next: boolean) {
        focused = next
        if (!next) {
          emit({ type: "selection" })
        }
      },
      setComposing(next: boolean) {
        composing = next
        emit({ type: next ? "compositionstart" : "compositionend" })
      },
      composing: () => composing,
      // Frameworks render each token's content into its host.
      hosts: () => view?.hosts() ?? [],
      setCustom: (custom: boolean) => store.set({ custom }),
      text: () => toText(store.get().value, codec()),
      reset() {
        if (!keepsValueOnReset(options().value, options().defaultValue)) {
          commit(store.get().initial, {
            reason: "reset",
            selection: caretAt(0),
          })
        }
      },
      setFormDisabled: (formDisabled: boolean) => store.set({ formDisabled }),
      restore: (saved: string) =>
        commit(codec().parse(saved), { reason: "restore" }),
    },
  }

  return api
}

const tokenInputApi: (
  ...args: Parameters<typeof tokenInputApiBody>
) => TokenInputApi = tokenInputApiBody

/**
 * `tokenInput`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface TokenInputApi extends ReturnType<typeof tokenInputApiBody> {}

export {
  initialTokenInputState,
  syncTokenInputState,
  type TokenInputApi,
  tokenInputApi,
  type TokenInputState,
}
