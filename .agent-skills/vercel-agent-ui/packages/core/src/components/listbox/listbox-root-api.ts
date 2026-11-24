// Listbox's state and API: the value and its form, the option that holds the
// tab stop, and the ways a selection changes: choosing one, toggling one,
// replacing the selection, Shift ranges and selecting everything.
import { createClaim } from "../../foundation/focus/roving-focus"
import { dispatchChange, formInternals } from "../../foundation/forms/form"
import { createItemIcons } from "../../foundation/lists/item-icon"
import {
  createListboxEngine,
  highlightable,
  highlightFromCode,
  itemKey,
  revealInList,
  type ListData,
  type ListFiltering,
} from "../../foundation/lists/listbox-engine"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import { isSameKeys } from "../../foundation/selection/listbox-range"
import { createKeySelection } from "../../foundation/selection/selection-model"
import { createListboxKeyboard } from "./listbox-root-keyboard"
import type {
  ListboxChangeOptions,
  ListboxOptions,
  ListboxValueChangeReason,
} from "./listbox-root"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { createValueSelection } from "../../foundation/lists/listbox-value"
import { orientationOf } from "../../foundation/focus/collection"
import { createChange } from "../../foundation/kernel/input-source"
import { keepsValueOnReset } from "../../foundation/forms/value"

type ListboxStore = {
  value: unknown
  // What a form reset returns to.
  initial: unknown
  // The option that has focus. Live, so moving it renders nothing.
  highlighted: string | null
  // The option that holds the list's one tab stop, once the options have bound.
  stop: string | null
  multiple: boolean
  activation: "automatic" | "manual"
  deselectable: boolean
  orientation: "horizontal" | "vertical"
  keepInView: boolean
  // Focus stays on the list, which points at the highlighted option.
  virtualFocus: boolean
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  items: ListData<unknown> | undefined
  // Counts labels learned from items. The selection model keeps it.
  labels: number
  // Counts icons learned from items.
  icons: number
  // The groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
}

type Change = { reason: ListboxValueChangeReason; event?: Event }

function initialListboxStore(options: ListboxOptions<any, any>): ListboxStore {
  const empty = () => (options.multiple ? [] : null)
  return {
    value:
      options.value !== undefined
        ? options.value
        : (options.defaultValue ?? empty()),
    initial: options.defaultValue ?? empty(),
    highlighted: null,
    stop: null,
    labels: 0,
    icons: 0,
    formDisabled: false,
    groupLabels: [],
    ...syncListboxStore(options),
  }
}

function syncListboxStore(options: ListboxOptions<any, any>) {
  return {
    multiple: !!options.multiple,
    // The APG's models: selection follows focus in a single list, and waits for Space with several.
    activation:
      options.activation ?? (options.multiple ? "manual" : "automatic"),
    deselectable: !!options.deselectable,
    orientation: orientationOf(options.orientation, "vertical"),
    keepInView: options.keepInView ?? true,
    virtualFocus: !!options.virtualFocus,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    items: options.items,
    // Like a native select's default, changing it changes what a reset returns to.
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
  } satisfies Partial<ListboxStore>
}

/** For a list nobody types into, like Listbox: every item shows. */
const noFiltering: ListFiltering = { data: (data) => data, matches: () => true }

function listboxApiBody(
  context: PrimitiveContext<ListboxOptions<any, any>, ListboxStore, string>
) {
  const { id, store, options, element } = context
  const change = createChange(context)
  const toKey = (value: unknown) => itemKey(value, options().itemToValue)
  const rootElement = () => element("root")

  // Whether focus is in the list. It stays true while a focused option leaves
  // the page, so focus can come back to the list.
  let focusInside = false
  // The option focused last, which keeps the tab stop while it's in the list.
  let remembered: string | null = null
  // The keys the list last asked for, so a controlled value coming back is
  // known as the list's own change, which keeps the anchor.
  let requested: string[] | null = null
  let checkQueued = false
  // Whether the selected option has been scrolled into view, once.
  let revealed = false

  // Nobody types into a listbox, so it ships no filtering.
  const listbox = createListboxEngine(
    {
      store,
      focus: () => (store.get().virtualFocus ? "virtual" : "real"),
      items: () => store.get().items,
      toKey,
      filter: () => undefined,
      query: () => "",
      loop: () => options().loop ?? true,
      skipDisabled: true,
      active: () => focusInside,
      container: rootElement,
      keepInView: () => store.get().keepInView,
      onHighlight: (key, index, event) =>
        options().onHighlight?.(
          key === null ? null : (listbox.valueOf(key) ?? null),
          { index, event }
        ),
      onRegister: () => queueCheck(),
    },
    noFiltering
  )
  const selection = createValueSelection({
    store,
    options,
    listbox,
    toKey,
    onDestroy: context.onDestroy,
  })
  const icons = createItemIcons(store)

  const order = () => listbox.entries().map((entry) => entry.key)
  const selectable = (key: string) => {
    const entry = listbox.find(key)
    return !!entry && !listbox.disabled(entry)
  }

  // The option that holds the tab stop: the one focused last, the first
  // selected, the first enabled, or the first, as the APG's listbox asks. A
  // disabled selected option doesn't hold it, since keys skip disabled ones.
  function stopKey() {
    const list = listbox.entries()
    if (remembered !== null && list.some((entry) => entry.key === remembered)) {
      return remembered
    }
    // An option whose value changed while it had focus fires no focus event,
    // so it's found by its element.
    const active =
      remembered === null ? null : rootElement()?.ownerDocument.activeElement
    const held =
      active && list.find((entry) => element("item", entry.key) === active)
    if (held) {
      if (store.get().highlighted === remembered) {
        store.set({ highlighted: held.key })
      }
      return (remembered = held.key)
    }
    const enabled = list.filter((entry) => !entry.disabled)
    const selected = enabled.find((entry) =>
      selection.isSelected(entry.key, entry.value)
    )
    return (selected ?? enabled[0] ?? list[0])?.key ?? null
  }

  function check() {
    checkQueued = false
    const stop = stopKey()
    if (stop !== store.get().stop) {
      store.set({ stop })
    }
    if (!revealed) {
      revealed = revealSelected(stop)
    }
  }

  // Once the options are in place, the selected one scrolls into view without
  // taking focus, like in a native list. Returns whether they were.
  function revealSelected(key: string | null) {
    const el = key === null ? undefined : listbox.element(key)
    const root = rootElement()
    if (!el?.isConnected || !root) {
      return false
    }
    if (selection.keys().length && store.get().keepInView) {
      revealInList(el, root)
    }
    return true
  }

  // Batched, since a long list registers all at once.
  function queueCheck() {
    if (checkQueued) {
      return
    }
    checkQueued = true
    queueMicrotask(check)
  }

  // The element that takes part in the form: the custom element, or the hidden input.
  const formElement = () => {
    const root = rootElement()
    return formInternals(root) ? root : element("form-input")
  }

  function setValue(value: unknown, { reason, event }: Change) {
    const state = store.get()
    if (reason !== "reset" && (isDisabled(state) || state.readOnly)) {
      return false
    }
    selection.stopRestoring()
    const done = change("value", value, { reason, event })
    if (done && reason !== "reset" && reason !== "restore") {
      dispatchChange(formElement())
    }
    return done
  }

  // Selects these keys, keeping the values already selected as they are, so object values keep their identity.
  function setKeys(keys: string[], why: Change) {
    const current = new Map(
      selection.keys().map((key, index) => [key, selection.values()[index]])
    )
    const value = keys.map((key) =>
      current.has(key) ? current.get(key) : listbox.valueOf(key)
    )
    requested = keys
    const done = setValue(value, why)
    // A refused change, like on a read-only list, has nothing to recognize later.
    if (!done) {
      requested = null
    }
    return done
  }

  // Chooses an option of a single listbox. Choosing the selected one again
  // keeps it, or unselects it with `deselectable`.
  function choose(key: string, why: Change) {
    const entry = listbox.find(key)
    if (!entry || listbox.disabled(entry)) {
      return
    }
    if (selection.isSelected(key, entry.value)) {
      if (store.get().deselectable && why.reason === "item-press") {
        setValue(null, why)
      }
      return
    }
    setValue(entry.value, why)
  }

  // Toggling, replacing, Shift ranges from the anchor and select all, on keys.
  const keySelection = createKeySelection({
    keys: selection.keys,
    set: setKeys,
    order,
    selectable,
  })
  const { toggle, replace, extend } = keySelection

  function toggleAll(why: Change) {
    if (store.get().multiple) {
      keySelection.toggleAll(why)
    }
  }

  // Focus landed on an option, from a key, a press or Tab.
  function focused(key: string) {
    focusInside = true
    remembered = key
    store.set({ highlighted: key, stop: key })
  }

  // The list itself got focus, like from a press on its padding, a Field
  // label, or an option that left the page. It hands focus to the tab stop,
  // or with `virtualFocus` keeps it and highlights the tab stop.
  function focusStop() {
    focusInside = true
    const { stop, virtualFocus, highlighted } = store.get()
    const key = stop ?? stopKey()
    if (virtualFocus) {
      const root = rootElement()
      if (root && root.ownerDocument.activeElement !== root) {
        root.focus({ preventScroll: true })
      }
      if (key !== null && highlighted === null) {
        focused(key)
      }
      return
    }
    const el = key === null ? undefined : listbox.element(key)
    if (el?.isConnected) {
      el.focus({ preventScroll: true })
    }
  }

  // A press or the pointer moves the highlight while focus stays on the list.
  function highlightVirtually(key: string, event?: Event) {
    const entry = listbox.find(key)
    if (entry && !listbox.disabled(entry)) {
      focusInside = true
      listbox.highlight(key, { event })
    }
  }

  // With `virtualFocus`, the option highlighted last holds the tab stop, as
  // the one focused last does without it.
  store.subscribe(() => {
    const { virtualFocus, highlighted, stop } = store.get()
    if (!virtualFocus || highlighted === null || highlighted === remembered) {
      return
    }
    remembered = highlighted
    if (stop !== highlighted) {
      store.set({ stop: highlighted })
    }
  })

  // Focus left the list. An option that left the page, or moved within it,
  // takes focus with it, which isn't leaving: the engine gives focus back once
  // it sees the move, so this waits until after that.
  function blurred(event: FocusEvent) {
    const target = event.target as Node
    const settle = () => {
      if (!target.isConnected) {
        return
      }
      if (
        rootElement()?.contains(target.ownerDocument?.activeElement ?? null)
      ) {
        return
      }
      focusInside = false
      store.set({ highlighted: null })
    }
    queueMicrotask(() => queueMicrotask(settle))
  }

  const keyboard = createListboxKeyboard({
    store,
    listbox,
    choose,
    toggle,
    replace,
    extend,
    toggleAll,
    anchorKey: keySelection.anchor,
  })

  // A value from outside the list, like a controller, a controlled prop or a
  // reset, starts ranges and the tab stop over. An empty selection drops the anchor.
  let previousValue = store.get().value
  store.subscribe(() => {
    const { value } = store.get()
    if (value === previousValue) {
      return
    }
    previousValue = value
    const keys = selection.keys()
    const own = requested !== null && isSameKeys(requested, keys)
    requested = null
    if (!own || !keys.length) {
      keySelection.resetAnchor()
    }
    if (!own && !focusInside) {
      remembered = null
    }
    queueCheck()
  })

  const api = {
    id,
    getValue: () => store.get().value,
    setValue: (
      value: unknown,
      { reason = "imperative", event }: ListboxChangeOptions = {}
    ) => setValue(value, { reason, event }),
    clear: ({ reason = "imperative", event }: ListboxChangeOptions = {}) =>
      setValue(selection.empty(), { reason, event }),
    selectAll({ reason = "imperative", event }: ListboxChangeOptions = {}) {
      if (!store.get().multiple) {
        return false
      }
      const missing = order().filter(
        (key) => selectable(key) && !selection.isSelected(key)
      )
      return (
        missing.length > 0 &&
        setKeys([...selection.keys(), ...missing], { reason, event })
      )
    },
    getHighlighted() {
      const { highlighted } = store.get()
      return highlighted === null
        ? null
        : (listbox.valueOf(highlighted) ?? null)
    },
    highlight(value: unknown) {
      const key = value === null ? null : toKey(value)
      const root = rootElement()
      if (root?.contains(root.ownerDocument.activeElement)) {
        return highlightFromCode(listbox, key, store.get().highlighted)
      }
      const entry = key === null ? undefined : highlightable(listbox, key)
      if (!entry) {
        return false
      }
      remembered = entry.key
      store.set({ stop: entry.key })
      return true
    },
    focus: focusStop,
    // Internal. Used by slots and adapters.
    internal: {
      options,
      listbox,
      selection,
      icons,
      keyOf: toKey,
      claim: createClaim(),
      focused,
      focusStop,
      highlightVirtually,
      blurred,
      onKeyDown: keyboard.onKeyDown,
      press: keyboard.press,
      controlElement: rootElement,
      formElement,
      serialized: selection.keys,
      // The props an item last rendered with, read live by its registration.
      itemProps: (key: string) => context.props<ListboxItemMeta>("item", key),
      // Web components read `default-value` as keys when items come later. Once
      // they arrive, a value that still names them takes their values, with no
      // change: it's still the default.
      adoptValue: (value: unknown) => store.set({ value }),
      reset() {
        if (keepsValueOnReset(options().value, options().defaultValue)) {
          return
        }
        setValue(store.get().initial, { reason: "reset" })
      },
      // The browser restores a disabled or read-only control too, as a native one.
      restore(saved: string) {
        selection.restore(saved, (value) =>
          change("value", value, { reason: "restore" })
        )
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      // Picks the item a browser's autofill wrote, by its value or its label.
      autofill(text: string) {
        const lower = text.toLowerCase()
        const entry = listbox
          .entries()
          .find(
            (entry) =>
              entry.key.toLowerCase() === lower ||
              entry.label.toLowerCase() === lower
          )
        if (entry && !store.get().multiple) {
          setValue(entry.value, { reason: "item-press" })
        }
      },
    },
  }

  // Data items are known at once, so their stop is too, on the server as well.
  if (store.get().items) {
    check()
  }
  return api
}

const listboxApi: (...args: Parameters<typeof listboxApiBody>) => ListboxApi =
  listboxApiBody

// What an item part registers with: its props, and the group it's in.
type ListboxItemMeta = {
  value: unknown
  label?: string
  disabled?: boolean
  group?: string
}

/**
 * `listbox`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface ListboxApi extends ReturnType<typeof listboxApiBody> {}

export {
  initialListboxStore,
  type ListboxApi,
  listboxApi,
  type ListboxStore,
  syncListboxStore,
}
