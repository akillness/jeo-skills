// Editing a value where it's shown: a cell in a table, a title on a card, a
// file's name in a list. Enter or F2 starts editing and keeps the text, typing
// a character starts over with it, like a spreadsheet; Enter or leaving
// saves, Escape puts the text back, and focus goes back to where editing
// started either way.
import { focusables } from "../focus/tabbable"
import { isComposing } from "../kernel/events"
import type { PrimitiveContext } from "../kernel/primitive-types"

/**
 * Why an edit started or ended.
 * @experimental
 */
type InlineEditReason =
  | "edit-key"
  | "type"
  | "double-click"
  | "enter-key"
  | "escape-key"
  | "focus-out"
  | "tab-key"
  | "imperative"

/**
 * How `createInlineEdit` reads and saves values.
 * @experimental
 */
type InlineEditOptions<State extends object> = {
  /** The state key that holds the id being edited, or `null`. */
  key: keyof State & string
  /** The text an id shows now, put in the input when editing starts. */
  value: (id: string) => string
  /**
   * Saves the text and returns whether it went through. Return `false` to
   * keep editing, like when the text isn't valid.
   */
  commit: (
    id: string,
    text: string,
    details: { reason: InlineEditReason; event?: Event }
  ) => boolean
  /** Whether an id can't be edited. */
  disabled?: (id: string) => boolean
}

/**
 * Lets users edit a value in place. Call it once in `api`, keep it on the
 * api, render an input for the id `editing(state)` returns, and wire it:
 *
 * ```ts
 * cell: slot({ on: { keydown: (event, { api, key }) => api.edit.keydown(event, key) } }),
 * input: slot({
 *   on: { keydown: (event, { api }) => api.edit.inputKeydown(event), focusout: (event, { api }) => api.edit.end("focus-out", event) },
 *   bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
 * })
 * ```
 *
 * Tab saves too and returns `true`, with focus back where editing started,
 * so a grid can move on to the next cell, as a spreadsheet does.
 * @experimental
 */
function createInlineEdit<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store">,
  options: InlineEditOptions<State>
) {
  const { store } = context
  const editing = () => store.get()[options.key] as string | null
  let input: HTMLInputElement | HTMLTextAreaElement | undefined
  // Where focus was when editing started, to go back to, and the text the input starts with.
  let origin: HTMLElement | undefined
  let start: { text: string; typed: boolean } = { text: "", typed: false }
  // The Rename button or menu item that started editing may be gone by the
  // end, so focus can fall back to the focusable element around the input.
  let inputHolder: HTMLElement | null = null
  const set = (id: string | null) =>
    store.set({ [options.key]: id } as Partial<State>)

  function finish(refocus: boolean) {
    set(null)
    const targets = [origin, inputHolder]
    origin = undefined
    inputHolder = null
    input = undefined
    // Only when focus was lost with the input: code that moved it on, like a
    // grid going to the next cell after Tab, keeps its place.
    if (refocus) {
      queueMicrotask(() => {
        const back = targets.find((el) => el?.isConnected)
        const active = back?.ownerDocument.activeElement
        if (
          back &&
          (!active || active === back.ownerDocument.body || !active.isConnected)
        ) {
          back.focus()
        }
      })
    }
  }

  const api = {
    /** The id being edited, or `null`. */
    editing(state: State) {
      return state[options.key] as string | null
    },
    /** Starts editing an id. With `text`, the input starts with it instead of the value, as typing does. */
    start(
      id: string,
      details: { reason: InlineEditReason; event?: Event; text?: string } = {
        reason: "imperative",
      }
    ) {
      if (options.disabled?.(id) || editing() === id) {
        return false
      }
      const active =
        typeof document === "undefined" ? null : document.activeElement
      origin = active instanceof HTMLElement ? active : undefined
      start =
        details.text === undefined
          ? { text: options.value(id), typed: false }
          : { text: details.text, typed: true }
      set(id)
      return true
    },
    /**
     * Handles a key pressed where the value shows and returns whether it
     * started editing: Enter or F2 with the text, a printable character
     * with that character.
     */
    keydown(event: KeyboardEvent, id: string) {
      if (
        event.defaultPrevented ||
        editing() ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return false
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault()
        return api.start(id, { reason: "edit-key", event })
      }
      if (event.key.length === 1 && event.key !== " ") {
        event.preventDefault()
        return api.start(id, { reason: "type", event, text: event.key })
      }
      return false
    },
    /** Starts editing on a double click, as most tables do. */
    dblclick(event: MouseEvent, id: string) {
      return api.start(id, { reason: "double-click", event })
    },
    /** Fills and focuses the input once it renders. Return its cleanup from the input slot's `bind`. */
    bindInput(el: HTMLInputElement | HTMLTextAreaElement) {
      input = el
      inputHolder = el.parentElement?.closest<HTMLElement>(focusables) ?? null
      el.value = start.text
      el.focus()
      // Typing replaces, so the caret goes after the typed character; Enter keeps the text selected.
      if (start.typed) {
        el.setSelectionRange(el.value.length, el.value.length)
      } else {
        el.select()
      }
      return () => {
        if (input === el) {
          input = undefined
        }
      }
    },
    /** Handles a key in the input: Enter and Tab save, Escape puts the text back. Returns whether it handled the key. */
    inputKeydown(event: KeyboardEvent) {
      if (isComposing(event)) {
        return false
      }
      if (
        event.key === "Enter" &&
        !(event.target instanceof HTMLTextAreaElement && event.shiftKey)
      ) {
        event.preventDefault()
        return api.end("enter-key", event)
      }
      if (event.key === "Escape") {
        event.preventDefault()
        // A popup around the grid would close on the same press.
        event.stopPropagation()
        api.cancel()
        return true
      }
      if (event.key === "Tab") {
        event.preventDefault()
        return api.end("tab-key", event)
      }
      return false
    },
    /** Saves what the input holds and stops editing. Returns whether it saved. */
    end(reason: InlineEditReason = "imperative", event?: Event) {
      const id = editing()
      if (!id) {
        return false
      }
      const text = input?.value ?? start.text
      const saved =
        text === options.value(id) ||
        options.commit(id, text, { reason, event })
      if (!saved) {
        if (reason !== "focus-out") {
          input?.focus()
        }
        return false
      }
      finish(reason !== "focus-out")
      return true
    },
    /** Stops editing without saving. */
    cancel() {
      if (editing()) {
        finish(true)
      }
    },
  }
  return api
}

/**
 * What `createInlineEdit` returns.
 * @experimental
 */
type InlineEdit = ReturnType<typeof createInlineEdit>

export {
  createInlineEdit,
  type InlineEdit,
  type InlineEditOptions,
  type InlineEditReason,
}
