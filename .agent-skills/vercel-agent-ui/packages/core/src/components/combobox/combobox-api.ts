// Combobox's state and API: opening and closing, the text and how it filters,
// choosing and removing items, the create option, and what the form asks of it.
import { afterBind } from "../../foundation/kernel/after-bind"
import { type AsyncOptionsStatus } from "../../foundation/lists/async-options"
import type {
  ComboboxChangeOptions,
  ComboboxContentProps,
  ComboboxCreateProps,
  ComboboxOpenChangeReason,
  ComboboxOptions,
  ComboboxQueryChangeReason,
  ComboboxValueChangeReason,
} from "./combobox"
import { createComboboxKeyboard } from "./combobox-keyboard"
import {
  modalityOf,
  restoreFocus,
  trackModality,
} from "../../foundation/kernel/modality"
import { type FieldName } from "../../foundation/lists/field-name"
import { deriveOpen, type PopupOpener } from "../../foundation/popups/popup"
import {
  createPopup,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { comboboxPreset } from "../../foundation/popups/popup-presets"
import { normalize } from "../../foundation/text/typeahead"
import { dispatchChange, formInternals } from "../../foundation/forms/form"
import {
  createFilteredListbox,
  flattenData,
  highlightedValue,
  highlightFromCode,
  itemKey,
  type ListData,
  type ListEntry,
} from "../../foundation/lists/listbox"
import {
  keepListing,
  noListing,
  type Listing,
} from "../../foundation/lists/listbox-listing"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import {
  announceResults,
  createLoadMore,
  describeList,
  type ListAnnouncement,
  matchMode,
  opensIntoList,
} from "../../foundation/lists/listbox-search"
import { announce } from "../../foundation/platform/announce"
import { isSelectAll, optionId } from "../../foundation/lists/listbox-keys"
import { announcePending, isPromise } from "../../foundation/kernel/action"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { type ItemIcons } from "../../foundation/lists/item-icon"
import {
  createValueSelection,
  listOf,
} from "../../foundation/lists/listbox-value"
import {
  changeSource,
  createChange,
} from "../../foundation/kernel/input-source"
import { createDetails } from "../../foundation/kernel/details"
import { log } from "../../foundation/kernel/change"
import { watchers } from "../../foundation/kernel/watchers"
import { elements } from "../../foundation/kernel/elements"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import { keepsValueOnReset } from "../../foundation/forms/value"

// The create option's key in the highlight. Never a real item's.
const CREATE = "\u0000create"

type ComboboxState = PopupState & {
  value: unknown
  initial: unknown
  highlighted: string | null
  query: string
  // Typed since the last choice, so the list filters. A single combobox shows
  // its value's label without filtering until the user types.
  dirty: boolean
  status: AsyncOptionsStatus
  listed: boolean
  labeled: boolean
  fieldName: FieldName
  // An input sits outside the content, so a trigger beside it can leave the tab order.
  inlineInput: boolean
  multiple: boolean
  maxSelected: number | undefined
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  formDisabled: boolean
  items: ListData<unknown> | undefined
  // A create option's Promise is running, or failed.
  pending: boolean
  error: unknown
  labels: number
  // Counts icons learned from items, so the value's icon shows once its item's icon is known.
  icons: number
  // The page's language, read once the input binds, for a value's labels.
  pageLocale: string | null
  // Counts items mounting, so parts that depend on the list update.
  mounts: number
  // The content has bound and its items have registered, so an empty list is really empty.
  settled: boolean
  // How the list presents while open, decided as it opens.
  presentation: "popover" | "sheet"
  // The list is in the page, hidden, so composed items tell the value its label.
  prepared: boolean
  // Real focus moved into the list for a touch screen reader, instead of aria-activedescendant.
  focusInList: boolean
  // The groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
  // How many chips fit before the rest collapse into an overflow part, or null for all.
  visibleChips: number | null
  // What each item shows from the list as a whole: whether it matches, and
  // whether it's selected or a full selection blocks it.
  listing: Listing
}

// The parts that make up the control around the list. Presses on them don't
// dismiss it, and focus moving among them doesn't close it.
const controlSlots = ["input", "chips", "trigger", "clear", "label"]

// A single combobox's text for its value, on the server too: from `itemToLabel`,
// the items data, the items rendered so far, then the value itself.
function initialQuery(
  options: ComboboxOptions<any, any>,
  value: unknown,
  rendered?: (key: string) => string | undefined
) {
  const first = listOf(value)[0]
  if (first === undefined || options.multiple) {
    return ""
  }
  const toKey = (item: unknown) => itemKey(item, options.itemToValue)
  const key = toKey(first)
  return (
    options.itemToLabel?.(first) ??
    (options.items &&
      flattenData(options.items, toKey).find((entry) => entry.key === key)
        ?.label) ??
    rendered?.(key) ??
    (typeof first === "string" ? first : key)
  )
}

function initialComboboxState(
  options: ComboboxOptions<any, any>
): ComboboxState {
  const empty = () => (options.multiple ? [] : null)
  const value =
    options.value !== undefined
      ? options.value
      : (options.defaultValue ?? empty())
  return {
    open: options.defaultOpen ?? false,
    mounted: options.open ?? options.defaultOpen ?? false,
    value,
    initial: options.defaultValue ?? empty(),
    highlighted: null,
    trigger: null,
    query:
      options.query ?? options.defaultQuery ?? initialQuery(options, value),
    dirty: false,
    status: options.status ?? "idle",
    listed: false,
    labeled: false,
    fieldName: null,
    inlineInput: false,
    multiple: !!options.multiple,
    maxSelected: options.maxSelected,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    formDisabled: false,
    items: options.items,
    pending: false,
    error: undefined,
    labels: 0,
    icons: 0,
    pageLocale: null,
    mounts: 0,
    settled: false,
    presentation: "popover",
    prepared: false,
    focusInList: false,
    groupLabels: [],
    visibleChips: null,
    listing: noListing,
    payload: undefined,
    titled: false,
    described: false,
    modal: false,
  }
}

function syncComboboxState(options: ComboboxOptions<any, any>) {
  return {
    multiple: !!options.multiple,
    maxSelected: options.maxSelected,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    status: options.status ?? "idle",
    items: options.items,
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.open === undefined ? {} : { open: options.open }),
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }
}

// Says that a value was removed, like a chip, which leaves the screen with no other trace.
function announceRemoved(
  label: string,
  announcement:
    ((change: ListAnnouncement) => string | null | undefined) | undefined
) {
  const message = (announcement ?? describeList)({ type: "removed", label })
  if (message) {
    announce(message)
  }
}

function comboboxApiBody(
  context: PrimitiveContext<ComboboxOptions<any, any>, ComboboxState, string>
) {
  const { id, store, options, element } = context
  announcePending(context, () => store.get().pending)
  // A controlled close clears the highlight in the same pass.
  deriveOpen(context, ["highlighted", "focusInList"], (open) =>
    open ? undefined : { highlighted: null, focusInList: false }
  )
  // A value from options shows its label in the same pass, and items that
  // load after the value, like from a request, put its label in place of the
  // raw value the input showed.
  deriveFromOptions(context, ["query"], (synced, state, next) => {
    if (
      state.dirty ||
      next.multiple ||
      next.query !== undefined ||
      committing
    ) {
      return
    }
    if ("value" in synced && synced.value !== state.value) {
      // Items that arrive with the value name it, not the ones they replace.
      const label = initialQuery(next, synced.value, listbox.labelOf)
      if (label === state.query) {
        return
      }
      shownQuery = { from: state.query, to: label }
      return { query: label }
    }
    if (synced.items === state.items) {
      return
    }
    const first = listOf(state.value)[0]
    if (
      first === undefined ||
      state.query !== itemKey(first, next.itemToValue)
    ) {
      return
    }
    return { query: initialQuery(next, first) }
  })
  const change = createChange(context)
  let mountsQueued = false
  let openedBy: PopupOpener = "imperative"
  // A choice is setting the value, and sets the text itself with its own reason.
  let committing = false
  // The highlight to place once the list has mounted, after an arrow key opened it.
  let pendingHighlight: "first" | "last" | null = null
  // The highlight `autoHighlight` placed last, until anything else moves it.
  let placed: string | null = null
  let settling = false
  let shownQuery: { from: string; to: string } | null = null
  // Counts closes, so an onCreate Promise that settles after the list closed
  // doesn't close it again once it's reopened.
  let session = 0
  // The value deleting the text emptied while the list is open, which Escape brings back.
  let clearedValue: { value: unknown } | null = null

  const toKey = (value: unknown) => itemKey(value, options().itemToValue)
  const inputElement = () => element("input")
  const anchorElement = () => element("chips") ?? element("input")
  const contentElement = () => popup.element() ?? element("content")
  const editable = () => {
    const state = store.get()
    return !isDisabled(state) && !state.readOnly
  }

  const maxReached = () => {
    const { multiple, maxSelected } = store.get()
    return (
      multiple &&
      maxSelected !== undefined &&
      selection.values().length >= maxSelected
    )
  }

  // The text the list filters by. A single combobox showing its value's label
  // shows every item until the user types.
  const filterQuery = () => {
    const { query, dirty, multiple } = store.get()
    return multiple || dirty ? query : ""
  }

  const loadMore = createLoadMore({
    count: () => listbox.count(),
    status: () => store.get().status,
    onLoadMore: () => options().onLoadMore,
  })

  const listbox = createFilteredListbox({
    store,
    focus: () => (store.get().focusInList ? "real" : "virtual"),
    items: () => store.get().items,
    emptyItems: () => options().emptyItems,
    // While the input is empty, not while it shows the value's label.
    showEmpty: () => !store.get().query.trim(),
    toKey,
    filter: () => options().filter ?? "contains",
    rank: () => typeof options().filter === "function",
    query: filterQuery,
    loop: () => options().loop ?? true,
    skipDisabled: true,
    active: () => store.get().open,
    blocked: (entry) =>
      !entry.pinned &&
      maxReached() &&
      !selection.isSelected(entry.key, entry.value),
    onHighlight: (key, index, event) =>
      options().onHighlight?.(
        key === null || key.startsWith("\u0000")
          ? null
          : (listbox.valueOf(key) ?? null),
        {
          index,
          event,
        }
      ),
    onLastReached: loadMore.reached,
    container: () => element("list") ?? contentElement(),
    scrollRoot: contentElement,
    // Parts that depend on the list, like the empty message, groups and
    // aria-activedescendant, update once per batch of items mounting.
    onRegister() {
      if (mountsQueued) {
        return
      }
      mountsQueued = true
      afterBind(() => {
        mountsQueued = false
        store.set({ mounts: store.get().mounts + 1 })
      })
    },
  })
  const selection = createValueSelection({
    store,
    options,
    listbox,
    toKey,
    onDestroy: context.onDestroy,
  })
  keepListing(store, listbox, {
    entry: (key, value) =>
      selection.isSelected(key, value) ? "s" : maxReached() ? "f" : "",
    inputs: () => [
      store.get().value,
      store.get().multiple,
      store.get().maxSelected,
    ],
  })
  // What the features the parts register add, like select-all to choosing.
  // Item icons are one: their part creates the icons when it first renders.
  const hooks: {
    choose?: (key: string, event?: Event) => void
    icons?: ItemIcons
  } = {}

  function ownsElement(target: Node) {
    return controlSlots.some((slot) =>
      elements(context, slot).some(({ el }) => el.contains(target))
    )
  }

  const kit = createPopup(context, {
    preset: comboboxPreset,
    rules: () => ({
      trigger: anchorElement,
      // Focus is in the input already.
      returnFocus: false,
      contains: (target) => ownsElement(target),
      onOpenChange(open, closed) {
        if (open) {
          return
        }
        session++
        pendingHighlight = placed = null
        store.set({ highlighted: null, focusInList: false })
        if (closed) {
          revertQuery(closed.reason as ComboboxOpenChangeReason)
        }
      },
      onShow() {
        const el = element("content")
        if (el) {
          return trackModality(el, modalityOf(openedBy), () => [inputElement()])
        }
      },
      open({ event, by }, open) {
        if (!editable()) {
          return
        }
        // A touch open never focuses the popup, so the on-screen keyboard stays,
        // unless it opens a sheet, which takes focus so the keyboard stays closed.
        openedBy =
          by === "touch" && presentation.resolve() !== "sheet"
            ? "pointer"
            : (by ?? "imperative")
        // A touch screen reader's tap on a trigger moves real focus into the list,
        // since it ignores aria-activedescendant. A tap on the input is for typing.
        store.set({
          focusInList: opensIntoList(event) && event?.target !== inputElement(),
        })
        open(openedBy)
      },
      // Unless it left, or a screen reader moved it into the list, which hands it back to the input.
      close(_, close) {
        const inList =
          store.get().focusInList &&
          !!contentElement()?.contains(document.activeElement)
        close()
        const input = inputElement()
        if (inList && input && !store.get().open) {
          restoreFocus(input)
        }
      },
    }),
  })
  const { control, popup } = kit.internal
  const presentation = kit.internal.presentation
  const { show, hide } = control

  function setQuery(
    query: string,
    {
      reason = "imperative",
      event,
      dirty = false,
    }: {
      reason?: ComboboxQueryChangeReason
      event?: Event
      dirty?: boolean
    } = {}
  ) {
    store.set({ dirty })
    return change("query", query, { reason, event })
  }

  // A label a value from options showed in its own pass is past refusing, so
  // `onQueryChange` hears it, and canceling keeps the text.
  function reportQuery({ from, to }: { from: string; to: string }) {
    const details = createDetails(
      { reason: "imperative" as const },
      changeSource("imperative")
    )
    log(context, "query", to, details)
    options().onQueryChange?.(to, details)
    watchers.change?.(id, "query", to, details, from)
  }

  // Sets the value for a choice. The caller sets the text, so the value
  // subscriber below doesn't put the label in with `imperative`.
  function commit(
    value: unknown,
    reason: ComboboxValueChangeReason,
    event?: Event
  ) {
    committing = true
    try {
      return setValue(value, { reason, event })
    } finally {
      committing = false
    }
  }

  function selectedLabel() {
    const value = selection.values()[0]
    return value === undefined ? "" : selection.labelOf(value)
  }

  // Text nobody chose becomes the value, with `allowCustomValue`.
  function commitCustom(reason: ComboboxQueryChangeReason, event?: Event) {
    const query = store.get().query.trim()
    if (!query) {
      return false
    }
    listbox.remember(toKey(query), query, query)
    if (store.get().multiple) {
      if (!selection.isSelected(toKey(query), query) && !maxReached()) {
        setValue([...selection.values(), query], {
          reason: "input-change",
          event,
        })
      }
      if (!options().keepQuery) {
        setQuery("", { reason, event })
      }
      return true
    }
    if (commit(query, "input-change", event)) {
      store.set({ dirty: false })
    } else {
      setQuery(selectedLabel(), { reason, event })
    }
    return true
  }

  // Closing with text nobody chose puts the input back: the value's label, or
  // nothing. With `allowCustomValue`, a single combobox keeps the text as its value.
  function revertQuery(reason: ComboboxOpenChangeReason) {
    const cleared = clearedValue
    clearedValue = null
    const { dirty, multiple } = store.get()
    if (
      !multiple &&
      dirty &&
      options().allowCustomValue &&
      commitCustom(reason)
    ) {
      return
    }
    if (multiple) {
      if (!options().keepQuery && store.get().query) {
        setQuery("", { reason })
      }
      return
    }
    if (!dirty) {
      return
    }
    if (cleared && reason === "escape-key" && !selection.values().length) {
      commit(cleared.value, "escape-key")
    }
    setQuery(selectedLabel(), { reason })
  }

  // The element that takes part in the form: the custom element, or the hidden input.
  const formElement = () => {
    const root = element("root")
    if (formInternals(root)) {
      return root
    }
    return element("form-input")
  }

  function setValue(
    value: unknown,
    {
      reason = "imperative",
      event,
    }: { reason?: ComboboxValueChangeReason; event?: Event } = {}
  ) {
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

  // What `autoHighlight` highlights: the first match while there's text, an
  // item over a create option, and without text the selected item, or with
  // "always" the first. Undefined when it highlights nothing of its own.
  function autoTarget() {
    const mode = options().autoHighlight
    const list = listbox
      .entries()
      .filter((entry) => !isSelectAll(entry.key) && !entry.disabled)
    const items = list.filter((entry) => !entry.pinned)
    if (filterQuery()) {
      return mode ? ((items[0] ?? list[0])?.key ?? null) : undefined
    }
    if (mode !== "always" && mode !== "selected") {
      return undefined
    }
    const selected = items.find((entry) =>
      selection.isSelected(entry.key, entry.value)
    )
    if (mode === "selected") {
      return selected?.key
    }
    return (selected ?? items[0])?.key ?? null
  }

  // After the text or the list changed. A highlight the user moved stays while
  // its item is there, like through more items loading at the end, and one
  // `autoHighlight` placed follows the list, like async results arriving.
  function settleHighlight(fresh = true) {
    const current = store.get().highlighted
    const kept =
      current !== null &&
      listbox.entries().some((entry) => entry.key === current)
    const target = autoTarget()
    const follows =
      target !== undefined && (fresh || !kept || current === placed)
    const next = follows ? target : kept ? current : null
    settling = true
    try {
      if (next !== current) {
        listbox.highlight(next)
      }
    } finally {
      settling = false
    }
    if (follows) {
      placed = target
    }
  }

  function choose(key: string, event?: Event) {
    if (key === CREATE) {
      return create(event)
    }
    if (isSelectAll(key)) {
      if (editable()) {
        hooks.choose?.(key, event)
      }
      return
    }
    const entry = listbox.find(key)
    const state = store.get()
    if (!entry || listbox.disabled(entry) || !editable()) {
      return
    }
    listbox.remember(key, entry.label, entry.value)
    if (state.multiple) {
      // A canceled choice leaves the text, which is what the user is filtering with.
      if (
        !setValue(selection.toggled(key, entry.value), {
          reason: "item-press",
          event,
        })
      ) {
        return
      }
      if (!options().keepQuery && state.query) {
        setQuery("", { reason: "item-press", event })
      } else {
        store.set({ dirty: false })
      }
      return
    }
    const chosen = commit(entry.value, "item-press", event)
    setQuery(chosen ? entry.label : selectedLabel(), {
      reason: "item-press",
      event,
    })
    hide({ reason: "item-press", event })
  }

  function remove(value: unknown, event?: Event) {
    if (!editable()) {
      return
    }
    // A chip leaves no trace on screen, so screen readers hear it went.
    if (
      setValue(selection.without(toKey(value)), {
        reason: "remove-press",
        event,
      })
    ) {
      announceRemoved(selection.labelOf(value), options().announcement)
    }
  }

  // The item among `candidates` whose label is the text, ignoring case and accents.
  function itemLabelled(query: string, candidates: ListEntry[]) {
    const needle = normalize(query)
    return candidates.find(
      (entry) => !entry.pinned && normalize(entry.label) === needle
    )
  }

  function createProps() {
    return (
      elements<ComboboxCreateProps>(context, "create")[0]?.props ??
      context.props<ComboboxCreateProps>("create") ??
      {}
    )
  }

  // Whether the create option shows: there's text enough, the user typed it,
  // and no item's label is exactly it, among all data items or the composed ones that match.
  function createShown(state: ComboboxState, props: ComboboxCreateProps) {
    const query = state.query.trim()
    if (isDisabled(state) || state.readOnly) {
      return false
    }
    if (query.length < Math.max(1, props.minLength ?? 1)) {
      return false
    }
    if (!state.multiple && !state.dirty) {
      return false
    }
    return !itemLabelled(query, listbox.dataItems() ?? listbox.entries())
  }

  function create(event?: Event) {
    const state = store.get()
    if (state.pending) {
      return
    }
    const props = createProps()
    if (!createShown(state, props)) {
      return
    }
    const started = session
    const result = props.onCreate?.(state.query.trim())
    const done = () => {
      if (!store.get().multiple) {
        if (started === session) {
          hide({ reason: "item-press", event })
        }
      } else if (!options().keepQuery && store.get().query === state.query) {
        setQuery("", { reason: "item-press", event })
      }
    }
    if (!isPromise(result)) {
      store.set({ error: undefined })
      return done()
    }
    store.set({ pending: true, error: undefined })
    result.then(
      () => {
        store.set({ pending: false })
        done()
      },
      (error) => store.set({ pending: false, error })
    )
  }

  // The user typed: the text filters, the list opens, and an emptied single combobox selects nothing.
  // Text typed before the script ran, in an input that already lost focus,
  // settles as a blur would instead of opening the list.
  function typed(text: string, event?: Event, focused = true) {
    const state = store.get()
    if (!editable()) {
      return
    }
    const input = inputElement() as HTMLInputElement | undefined
    if (
      !setQuery(text, { reason: "input-change", event, dirty: true }) &&
      input &&
      input.value !== store.get().query
    ) {
      // Canceled: the input shows the text it had.
      input.value = store.get().query
    }
    const selected = selection.values()[0]
    if (
      !state.multiple &&
      text === "" &&
      selected !== undefined &&
      setValue(null, { reason: "input-change", event })
    ) {
      clearedValue = { value: selected }
    }
    if (!focused) {
      revertQuery("focus-out")
    } else if (!store.get().open) {
      // Items that mount with the list get the first highlight once they have.
      if (options().autoHighlight && text) {
        pendingHighlight = "first"
      }
      show({ event, by: "keyboard", reason: "input-change" })
    }
    settleHighlight()
  }

  const keyboard = createComboboxKeyboard({
    store,
    listbox,
    selection,
    show,
    hide,
    choose,
    create,
    remove,
    itemLabelled,
    commitCustom,
    hasCreate: () => elements(context, "create").length > 0,
    focusInput: () => {
      store.set({ focusInList: false })
      inputElement()?.focus({ preventScroll: true })
    },
    allowCustomValue: () => !!options().allowCustomValue,
    // Chips collapsed into an overflow part can't be reached.
    chips: () =>
      elements(context, "chip").flatMap(({ el }) => (el.hidden ? [] : [el])),
    inputElement,
    highlightOnOpen: (target) => (pendingHighlight = target),
  })

  announceResults({
    store,
    query: filterQuery,
    count: () => listbox.count(),
    loading: () => store.get().status === "loading",
    shown: () => store.get().open,
    silent: () => elements(context, "status").length > 0,
    announcement: () => options().announcement,
  })

  const api = {
    id,
    ...kit,
    getValue: () => store.get().value,
    setValue: (
      value: unknown,
      { reason, event }: ComboboxChangeOptions<ComboboxValueChangeReason> = {}
    ) => setValue(value, { reason, event }),
    clear: ({
      reason = "imperative",
      event,
    }: ComboboxChangeOptions<ComboboxValueChangeReason> = {}) => {
      if (!editable()) {
        return false
      }
      const selected = listOf(store.get().value).length > 0
      // A canceled change keeps the value, and the input keeps its label.
      if (selected && !setValue(selection.empty(), { reason, event })) {
        return false
      }
      clearedValue = null
      const emptied = setQuery("", {
        reason: reason === "clear-press" ? "clear-press" : "imperative",
        event,
      })
      return selected || emptied
    },
    getQuery: () => store.get().query,
    setQuery: (
      query: string,
      {
        reason = "imperative",
        event,
      }: ComboboxChangeOptions<ComboboxQueryChangeReason> = {}
    ) => {
      const changed = setQuery(query, { reason, event, dirty: true })
      settleHighlight()
      return changed
    },
    getHighlighted: () => highlightedValue(listbox, store.get().highlighted),
    highlight: (value: unknown) =>
      store.get().open &&
      highlightFromCode(
        listbox,
        value === null ? null : toKey(value),
        store.get().highlighted
      ),
    focus: () => inputElement()?.focus(),
    // Internal. Used by slots and adapters.
    internal: {
      options,
      // Read by the agent bridge, which takes text that isn't an item only with it.
      allowCustomValue: () => !!options().allowCustomValue,
      listbox,
      selection,
      hooks,
      store,
      // The icons of items, once an item icon part registers them.
      get icons() {
        return hooks.icons!
      },
      changeValue: setValue,
      presentation,
      contentElement,
      // Whether a value icon rendered, which copies the selected item's icon.
      hasValueIcon: () => context.props("value-icon") !== undefined,
      // Renders the items hidden once, so a value learns its label and icon from its item.
      prepare: () => store.get().prepared || store.set({ prepared: true }),
      popup,
      show,
      hide,
      choose,
      remove,
      create,
      createShown: (state: ComboboxState) => createShown(state, createProps()),
      maxReached,
      typed,
      onInput: (event: Event) =>
        typed((event.target as HTMLInputElement).value, event),
      onInputKeyDown: keyboard.onInputKeyDown,
      onListKeyDown: keyboard.onListKeyDown,
      onChipKeyDown: keyboard.onChipKeyDown,
      onTriggerKeyDown: keyboard.onTriggerKeyDown,
      loadMore,
      limit: () => (store.get().multiple ? store.get().maxSelected : undefined),
      matchQuery: filterQuery,
      matchMode: () => matchMode(options().filter ?? "contains"),
      // The pointer highlights what it moves onto. Touch never does, since a finger scrolling past isn't choosing.
      hover(key: string, event: PointerEvent) {
        if (
          event.pointerType === "touch" ||
          !store.get().open ||
          listbox.isItemDisabled(key)
        ) {
          return
        }
        if (store.get().highlighted !== key) {
          listbox.highlight(key, { event })
        }
      },
      chipsElement: () => element("chips"),
      // The chips in the page, in order.
      chipElements: () => elements(context, "chip").map(({ el }) => el),
      setVisibleChips: (visibleChips: number | null) =>
        store.get().visibleChips !== visibleChips &&
        store.set({ visibleChips }),
      ownsElement,
      inputElement,
      controlElement: inputElement,
      anchorElement,
      arrowElement: () => element("arrow"),
      filterQuery,
      keyOf: toKey,
      isSelected: selection.isSelected,
      labelOf: selection.labelOf,
      labels: selection.labels,
      queueLabels: selection.queueLabels,
      // Before the items mount, like on the server, the adapter finds the
      // value's labels among its children, and the input shows the label.
      learnLabels(find: Parameters<typeof selection.learn>[0]) {
        if (selection.learn(find)) {
          showArrivedLabel()
        }
      },
      serialized: selection.keys,
      // Where focus goes once the list opens: it stays in the input, unless a
      // screen reader's tap moved it into the list, to the selected item or the first.
      initialFocus() {
        const target = pendingHighlight
        pendingHighlight = null
        if (!store.get().focusInList) {
          const mode = options().autoHighlight
          if (
            mode === "always" ||
            (mode === "selected" && autoTarget() !== undefined)
          ) {
            settleHighlight(false)
          } else if (
            target === "first" &&
            options().autoHighlight &&
            filterQuery()
          ) {
            settleHighlight()
          } else if (target) {
            listbox.move(target)
          }
          // In a sheet the input moved into its header, and loses focus on
          // the way if the sheet showed later. It takes focus back here.
          return store.get().presentation === "sheet"
            ? inputElement()
            : undefined
        }
        const list = listbox
          .entries()
          .filter((entry) => !entry.pinned && !entry.disabled)
        const item =
          list.find((entry) => selection.isSelected(entry.key, entry.value)) ??
          list[0]
        if (!item) {
          return contentElement()
        }
        listbox.highlight(item.key, { focus: false })
        return listbox.element(item.key) ?? contentElement()
      },
      // Whether no item matches. Composed items register once the content binds, so until then it's not known.
      isEmpty: (state: ComboboxState) =>
        (!!state.items || state.settled) && listbox.count() === 0,
      // How many items match, leaving out the create and select-all options.
      itemCount: () => listbox.count(),
      itemProps: (key: string) => context.props<ComboboxItemMeta>("item", key),
      contentProps: (key?: string) =>
        kit.internal.contentProps(key) as ComboboxContentProps,
      // The id aria-activedescendant points at, once that element is in the page.
      // None while real focus is in the list.
      activeDescendant(state: ComboboxState) {
        const { highlighted } = state
        if (!state.open || state.focusInList || highlighted === null) {
          return undefined
        }
        if (!listbox.element(highlighted)?.isConnected) {
          return undefined
        }
        return optionId(id, highlighted)
      },
      // Web components read `default-value` as keys when items come later. Once
      // they arrive, a value that still names them takes their values, with no
      // change: it's still the default.
      adoptValue: (value: unknown) => store.set({ value }),
      reset() {
        if (keepsValueOnReset(options().value, options().defaultValue)) {
          return
        }
        const initial = store.get().initial
        setValue(initial, { reason: "reset" })
        const first = listOf(initial)[0]
        setQuery(
          store.get().multiple || first === undefined
            ? ""
            : selection.labelOf(first),
          {
            reason: "reset",
          }
        )
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      // The browser restores a disabled or read-only control too, as a native one.
      restore(saved: string) {
        selection.restore(saved, (value) =>
          change("value", value, { reason: "restore" })
        )
      },
    },
  }

  // A label that arrives after the value, like from items that mount later,
  // replaces the raw value an uncontrolled input showed.
  function showArrivedLabel() {
    const { value, multiple, dirty, query } = store.get()
    const first = listOf(value)[0]
    if (
      multiple ||
      dirty ||
      first === undefined ||
      options().query !== undefined
    ) {
      return
    }
    const label = selection.labelOf(first)
    if (query === toKey(first) && label !== query) {
      store.set({ query: label })
    }
  }

  let highlighted = store.get().highlighted
  store.subscribe(() => {
    if (store.get().highlighted === highlighted) {
      return
    }
    highlighted = store.get().highlighted
    if (!settling) {
      placed = null
    }
  })

  // Turned on after typing, `autoHighlight` highlights the best match once
  // the options are handed over.
  let autoMode = options().autoHighlight
  context.onOptions((next) => {
    if (next.autoHighlight === autoMode) {
      return
    }
    autoMode = next.autoHighlight
    queueMicrotask(() => {
      if (store.get().open) {
        settleHighlight(false)
      }
    })
  })

  let listed = {
    items: store.get().items,
    mounts: store.get().mounts,
    query: store.get().query,
  }
  store.subscribe(() => {
    const { items, mounts, query } = store.get()
    if (
      items === listed.items &&
      mounts === listed.mounts &&
      query === listed.query
    ) {
      return
    }
    listed = { items, mounts, query }
    // After the options that brought the items or a controlled query are
    // handed over, so the highlight isn't written beside them.
    queueMicrotask(() => {
      if (store.get().open) {
        settleHighlight(false)
      }
    })
  })

  // A value set from outside, like a controller or a controlled prop, shows
  // its label in a single combobox's input, unless the user is typing.
  let previousValue = store.get().value
  let previousLabels = store.get().labels
  store.subscribe(() => {
    const { value, multiple, dirty, labels } = store.get()
    if (labels !== previousLabels) {
      previousLabels = labels
      showArrivedLabel()
    }
    if (value === previousValue) {
      return
    }
    previousValue = value
    // Values whose items never mounted, like from a controller: mount them hidden so they say their labels.
    if (
      selection.needsItems(false) &&
      !store.get().items &&
      !options().itemToLabel &&
      !store.get().prepared
    ) {
      store.set({ prepared: true })
    }
    const shown = shownQuery
    shownQuery = null
    if (shown && store.get().query === shown.to) {
      return reportQuery(shown)
    }
    if (multiple || dirty || committing) {
      return
    }
    const first = listOf(value)[0]
    const label = first === undefined ? "" : selection.labelOf(first)
    if (store.get().query === label) {
      return
    }
    // A restore's late items show their label as quietly as the restore itself.
    if (selection.isFilling() && options().query === undefined) {
      store.set({ query: label, dirty: false })
    } else {
      setQuery(label, { reason: "imperative" })
    }
  })

  return api
}

const comboboxApi: (
  ...args: Parameters<typeof comboboxApiBody>
) => ComboboxApi = comboboxApiBody

// What an item part registers with: its props, and the group it's in.
type ComboboxItemMeta = {
  value: unknown
  label?: string
  keywords?: string[]
  disabled?: boolean
  group?: string
  index?: number
}

/**
 * `combobox`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface ComboboxApi extends ReturnType<typeof comboboxApiBody> {}

export {
  type ComboboxApi,
  comboboxApi,
  type ComboboxState,
  CREATE,
  initialComboboxState,
  syncComboboxState,
}
