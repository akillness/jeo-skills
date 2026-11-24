// Select's state and API: opening and closing, choosing items, the value and
// its labels, and what the form asks of it.
import { afterBind } from "../../foundation/kernel/after-bind"
import { type AsyncOptionsStatus } from "../../foundation/lists/async-options"
import { modalityOf, trackModality } from "../../foundation/kernel/modality"
import {
  deriveOpen,
  openerOf,
  type PopupOpener,
} from "../../foundation/popups/popup"
import {
  createPopup,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { selectPreset } from "../../foundation/popups/popup-presets"
import { dispatchChange, formInternals } from "../../foundation/forms/form"
import {
  createFilteredListbox,
  itemKey,
  revealInList,
  type ListData,
} from "../../foundation/lists/listbox"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import {
  keepListing,
  noListing,
  type Listing,
} from "../../foundation/lists/listbox-listing"
import {
  announceResults,
  createLoadMore,
  matchMode,
  opensIntoList,
} from "../../foundation/lists/listbox-search"
import { isSelectAll, optionId } from "../../foundation/lists/listbox-keys"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  SelectChangeOptions,
  SelectContentProps,
  SelectOpenChangeReason,
  SelectOptions,
  SelectQueryChangeReason,
  SelectValueChangeReason,
} from "./select"
import { createSelectKeyboard } from "./select-keyboard"
import { type ItemIcons } from "../../foundation/lists/item-icon"
import { createValueSelection } from "../../foundation/lists/listbox-value"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import { keepsValueOnReset } from "../../foundation/forms/value"

type SelectState = PopupState & {
  value: unknown
  // What a form reset returns to.
  initial: unknown
  highlighted: string | null
  // The list is in the page, hidden, so its items register for typing on the closed trigger.
  prepared: boolean
  // A List part holds the items, so the content isn't the listbox itself.
  listed: boolean
  // A SelectLabel is bound. Null until the trigger binds, so the server's HTML names the trigger after it.
  labeled: boolean | null
  multiple: boolean
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  autoComplete: string | undefined
  formDisabled: boolean
  placeholder: string | undefined
  items: ListData<unknown> | undefined
  // Counts labels learned from items, so the value re-renders when its label arrives.
  labels: number
  // Counts icons learned from items, so the value's icon shows once its item's icon is known.
  icons: number
  // The page's language, read once the trigger binds, for a value's labels.
  pageLocale: string | null
  // The text in the search field, which filters the list while it's open.
  query: string
  // A search field is in the list, so typing filters and focus stays in the field.
  searchable: boolean
  // Real focus moved into the list for a touch screen reader, instead of staying in the search field.
  focusInList: boolean
  // Focus stays on the trigger while the list is open, which points at the highlighted item.
  virtualFocus: boolean
  status: AsyncOptionsStatus
  // Counts items mounting, so parts that depend on the list update.
  mounts: number
  // The content has bound and its items have registered, so an empty list is really empty.
  settled: boolean
  // How the list presents while open, decided as it opens.
  presentation: "popover" | "sheet"
  // The groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
  // What each item shows from the list as a whole: whether it matches and whether it's selected.
  listing: Listing
}

// Which item takes the highlight once the list opens.
type InitialHighlight = "selected" | "first" | "last"

type Show = {
  event?: Event
  by?: PopupOpener
  reason?: SelectOpenChangeReason
  focus?: InitialHighlight
  signal?: AbortSignal
}

// Focus stays outside the list, in the search field or on the trigger, while
// arrows move the highlight. A touch screen reader gets real focus in the list.
const virtual = (state: SelectState) =>
  (state.searchable || state.virtualFocus) && !state.focusInList

function initialSelectState(options: SelectOptions<any, any>): SelectState {
  const empty = () => (options.multiple ? [] : null)
  return {
    open: options.defaultOpen ?? false,
    mounted: options.open ?? options.defaultOpen ?? false,
    payload: undefined,
    titled: false,
    described: false,
    modal: false,
    value:
      options.value !== undefined
        ? options.value
        : (options.defaultValue ?? empty()),
    initial: options.defaultValue ?? empty(),
    highlighted: null,
    trigger: null,
    prepared: false,
    listed: false,
    labeled: null,
    multiple: !!options.multiple,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    autoComplete: options.autoComplete,
    formDisabled: false,
    placeholder: options.placeholder,
    items: options.items,
    labels: 0,
    icons: 0,
    pageLocale: null,
    query: options.query ?? options.defaultQuery ?? "",
    searchable: false,
    focusInList: false,
    virtualFocus: !!options.virtualFocus,
    status: options.status ?? "idle",
    mounts: 0,
    settled: false,
    presentation: "popover",
    groupLabels: [],
    listing: noListing,
  }
}

function syncSelectState(options: SelectOptions<any, any>) {
  return {
    multiple: !!options.multiple,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    virtualFocus: !!options.virtualFocus,
    name: options.name,
    form: options.form,
    autoComplete: options.autoComplete,
    placeholder: options.placeholder,
    items: options.items,
    status: options.status ?? "idle",
    // Like a native select's default, changing it changes what a reset returns to.
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.open === undefined ? {} : { open: options.open }),
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }
}

function selectApiBody(
  context: PrimitiveContext<SelectOptions<any, any>, SelectState, string>
) {
  const { id, store, options, element } = context
  // A controlled close clears the highlight in the same pass, and keeps the
  // list in the page hidden, which focus returning to the trigger would ask
  // for while the options are still being handed over.
  deriveOpen(context, ["highlighted", "prepared"], (open) =>
    open ? undefined : { highlighted: null, prepared: true }
  )
  const change = createChange(context)
  let pendingFocus: InitialHighlight = "selected"
  let alignOffset: number | undefined
  // How the list last opened, for data-modality.
  let openedBy: PopupOpener = "imperative"
  let mountsQueued = false

  const toKey = (value: unknown) => itemKey(value, options().itemToValue)
  const triggerElement = () => element("trigger")
  const focusTrigger = (options?: FocusOptions) =>
    triggerElement()?.focus(options)
  const contentElement = () => popup.element() ?? element("content")
  const searchElement = () => element("input") as HTMLInputElement | undefined
  // Focus stays in the search field while there is one, or on the trigger with
  // `virtualFocus`, unless a touch screen reader opened the list.
  const searching = () => virtual(store.get())
  // The text the list is filtered by: the search field's, while the list is in the page.
  const filterQuery = () => {
    const { searchable, mounted, query } = store.get()
    return searchable && mounted ? query : ""
  }

  const loadMore = createLoadMore({
    count: () => listbox.count(),
    status: () => store.get().status,
    onLoadMore: () => options().onLoadMore,
  })

  const listbox = createFilteredListbox({
    store,
    focus: () => (searching() ? "virtual" : "real"),
    items: () => store.get().items,
    emptyItems: () => options().emptyItems,
    // Typing on the closed trigger searches every item, so they show only while searching.
    showEmpty: () =>
      store.get().searchable &&
      store.get().mounted &&
      !store.get().query.trim(),
    toKey,
    filter: () =>
      store.get().searchable ? (options().filter ?? "contains") : undefined,
    rank: () => typeof options().filter === "function",
    query: filterQuery,
    loop: () => options().loop ?? true,
    skipDisabled: true,
    active: () => store.get().open,
    onHighlight: (key, index, event) =>
      options().onHighlight?.(
        key === null || isSelectAll(key)
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
    // Parts that depend on the list, like the empty message and groups, update once per batch of items mounting.
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
    entry: (key, value) => (selection.isSelected(key, value) ? "s" : ""),
    inputs: () => [store.get().value],
  })
  // What the features the parts register add, like select-all to choosing.
  // Item icons are one: their part creates the icons when it first renders.
  const hooks: {
    choose?: (key: string, event?: Event) => void
    icons?: ItemIcons
  } = {}

  const kit = createPopup(context, {
    preset: selectPreset,
    rules: () => ({
      dismiss(reason, { event, focus }) {
        // Tab: focus moves on from the trigger, like from a native select.
        if (reason === "focus-out") {
          triggerElement()?.focus({ preventScroll: true })
          return hide({ reason, event, focus: false })
        }
        hide({ reason, event, focus })
      },
      onOpenChange(open) {
        if (open) {
          return
        }
        alignOffset = undefined
        listbox.resetTyping()
        store.set({ highlighted: null })
      },
      onOpenChangeComplete(open, closed) {
        // The search empties once the list has left, so it doesn't jump while it animates out.
        if (!closed) {
          return
        }
        store.set({ focusInList: false })
        if (store.get().query) {
          setQuery("", closed.reason as SelectQueryChangeReason)
        }
      },
      onShow() {
        // A sheet starts with the selected item in view, whatever opened it,
        // like a native select's, since a tap focuses the sheet rather than the
        // item. Items bind in the same commit as the content.
        if (store.get().presentation === "sheet") {
          queueMicrotask(revealSelected)
        }
        const el = element("content")
        if (el) {
          // With `virtualFocus`, the list's keys reach the trigger.
          return trackModality(el, modalityOf(openedBy), () =>
            store.get().virtualFocus ? [triggerElement()] : []
          )
        }
      },
      open(request, open) {
        const { event, by } = request
        if (isDisabled(store.get())) {
          return
        }
        pendingFocus =
          (request.focus as InitialHighlight | undefined) ?? "selected"
        // A touch screen reader gets real focus in the list, since it ignores
        // aria-activedescendant, as a key would, rather than the popup a tap focuses.
        const intoList = opensIntoList(event)
        store.set({ focusInList: intoList })
        openedBy = intoList ? "keyboard" : (by ?? openerOf(event))
        open(openedBy)
      },
    }),
  })
  const { control, popup } = kit.internal
  const presentation = kit.internal.presentation
  const { show, hide } = control

  function revealSelected() {
    const selected = listbox
      .entries()
      .find((entry) => selection.isSelected(entry.key, entry.value))
    const el = selected && listbox.element(selected.key)
    if (el) {
      revealInList(el, contentElement())
    }
  }

  // Where focus goes once the list opens: the selected item, or the first or
  // last that can be chosen. With a search field, focus goes there and the
  // item is only highlighted.
  function initialFocus() {
    const list = listbox
      .entries()
      .filter((entry) => !entry.pinned && !listbox.disabled(entry))
    const selected = list.find((entry) =>
      selection.isSelected(entry.key, entry.value)
    )
    const target =
      pendingFocus === "last"
        ? list.at(-1)
        : pendingFocus === "first"
          ? list[0]
          : (selected ?? list[0])
    pendingFocus = "selected"
    if (target) {
      listbox.highlight(target.key, { focus: false })
    }
    if (searching()) {
      return (
        searchElement() ??
        (store.get().virtualFocus ? triggerElement() : undefined) ??
        contentElement()
      )
    }
    if (!target) {
      return contentElement()
    }
    return listbox.element(target.key) ?? contentElement()
  }

  // The search field's text changed: the list filters, and the best match is highlighted.
  function setQuery(
    query: string,
    reason: SelectQueryChangeReason,
    event?: Event
  ) {
    if (!change("query", query, { reason, event })) {
      return false
    }
    if (!store.get().open) {
      return true
    }
    const first = listbox.firstEnabled() ?? null
    if (store.get().highlighted !== first) {
      listbox.highlight(first, { focus: false, event })
    }
    return true
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
    }: { reason?: SelectValueChangeReason; event?: Event } = {}
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

  // Chooses an item: selects it and closes, or toggles it with `multiple`.
  // A select-all option toggles every item it covers.
  function choose(key: string, event?: Event) {
    const state = store.get()
    if (isSelectAll(key)) {
      if (!isDisabled(state) && !state.readOnly) {
        hooks.choose?.(key, event)
      }
      return
    }
    const entry = listbox.find(key)
    if (
      !entry ||
      listbox.disabled(entry) ||
      isDisabled(state) ||
      state.readOnly
    ) {
      return
    }
    listbox.remember(key, entry.label, entry.value)
    if (state.multiple) {
      setValue(selection.toggled(key, entry.value), {
        reason: "item-press",
        event,
      })
      return
    }
    setValue(entry.value, { reason: "item-press", event })
    hide({ reason: "item-press", event })
  }

  // The labels exist only for items that registered: show the list hidden so they do.
  function prepare() {
    if (!store.get().prepared) {
      store.set({ prepared: true })
    }
  }

  const keyboard = createSelectKeyboard({
    store,
    listbox,
    selection,
    show,
    hide,
    choose,
    setValue,
    prepare,
    searchElement,
    popupKeyDown: (event) => popup.keydown(event),
  })

  announceResults({
    store,
    query: filterQuery,
    count: () => listbox.count(),
    loading: () => store.get().status === "loading",
    shown: () => store.get().open && store.get().searchable,
    silent: () => elements(context, "status").length > 0,
    announcement: () => options().announcement,
  })

  // The anchor that puts the selected item over the trigger, or null when it doesn't fit.
  function alignedAnchor(content: HTMLElement) {
    const trigger = triggerElement()
    if (!trigger || popup.opener() === "touch") {
      return null
    }
    const selected = listbox
      .entries()
      .find((entry) => selection.isSelected(entry.key, entry.value))
    const item = selected && listbox.element(selected.key)
    if (!item) {
      return null
    }
    const triggerRect = trigger.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    // Measured once per open, so scrolling the list doesn't move it.
    alignOffset ??= itemRect.top - contentRect.top + itemRect.height / 2
    const top = triggerRect.top + triggerRect.height / 2 - alignOffset
    const view = content.ownerDocument.documentElement
    if (top < 8 || top + contentRect.height > view.clientHeight - 8) {
      return null
    }
    return {
      getBoundingClientRect: () => ({
        x: triggerRect.x,
        y: top,
        width: triggerRect.width,
        height: 0,
      }),
    }
  }

  // Values whose items never mounted, like from a controller: mount the list hidden so they say their labels.
  let previousValue = store.get().value
  store.subscribe(() => {
    const { value, items, prepared } = store.get()
    if (value === previousValue) {
      return
    }
    previousValue = value
    if (prepared || items || options().itemToLabel) {
      return
    }
    if (selection.needsItems(false)) {
      store.set({ prepared: true })
    }
  })

  const api = {
    id,
    ...kit,
    getValue: () => store.get().value,
    setValue: (
      value: unknown,
      { reason, event }: SelectChangeOptions<SelectValueChangeReason> = {}
    ) => setValue(value, { reason, event }),
    clear: ({
      reason,
      event,
    }: SelectChangeOptions<SelectValueChangeReason> = {}) =>
      setValue(selection.empty(), { reason, event }),
    getQuery: () => store.get().query,
    setQuery: (
      query: string,
      {
        reason = "imperative",
        event,
      }: SelectChangeOptions<SelectQueryChangeReason> = {}
    ) => setQuery(query, reason, event),
    focus: () => focusTrigger(),
    // Internal. Used by slots and adapters.
    internal: {
      focusTrigger,
      options,
      listbox,
      selection,
      hooks,
      store,
      // The icons of items, once an item icon part registers them.
      get icons() {
        return hooks.icons!
      },
      changeValue: setValue,
      popup,
      presentation,
      show,
      hide,
      choose,
      // Whether a value icon rendered, which copies the selected item's icon.
      hasValueIcon: () => context.props("value-icon") !== undefined,
      prepare,
      initialFocus,
      loadMore,
      searchElement,
      filterQuery,
      matchQuery: filterQuery,
      matchMode: () => matchMode(options().filter ?? "contains"),
      typed: (event: Event) =>
        setQuery(
          (event.target as HTMLInputElement).value,
          "input-change",
          event
        ),
      // The pointer highlights what it moves onto, focusing it unless focus stays in the search field.
      hover(key: string, event: PointerEvent) {
        const { open, highlighted } = store.get()
        if (
          event.pointerType === "touch" ||
          !open ||
          listbox.isItemDisabled(key)
        ) {
          return
        }
        const el = listbox.element(key)
        const focused = searching() || el?.ownerDocument.activeElement === el
        if (highlighted !== key || !focused) {
          listbox.highlight(key, { event })
        }
      },
      // Whether no item matches. Composed items register once the content binds.
      isEmpty: (state: SelectState) =>
        (!!state.items || state.settled) && listbox.count() === 0,
      itemCount: () => listbox.count(),
      // The id aria-activedescendant points at while focus stays in the search field or on the trigger.
      activeDescendant(state: SelectState) {
        const { highlighted } = state
        if (!state.open || state.focusInList || highlighted === null) {
          return undefined
        }
        if (!listbox.element(highlighted)?.isConnected) {
          return undefined
        }
        return optionId(id, highlighted)
      },
      alignedAnchor,
      triggerElement,
      controlElement: triggerElement,
      formElement,
      onContentKeyDown: keyboard.onContentKeyDown,
      onTriggerKeyDown: keyboard.onTriggerKeyDown,
      pointerPress: keyboard.pointerPress,
      consumePressClick: keyboard.consumePressClick,
      keyOf: toKey,
      isSelected: selection.isSelected,
      labels: selection.labels,
      queueLabels: selection.queueLabels,
      // Before the items mount, like on the server, the adapter finds the value's labels among its children.
      learnLabels: selection.learn,
      serialized: selection.keys,
      arrowElement: () => element("arrow"),
      // The props an item last rendered with, read live by its registration.
      itemProps: (key: string) => context.props<SelectItemMeta>("item", key),
      contentProps: (key?: string) =>
        kit.internal.contentProps(key) as SelectContentProps,
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
      // The browser restores a disabled or read-only control too, as a native one.
      restore(saved: string) {
        selection.restore(saved, (value) =>
          change("value", value, { reason: "restore" })
        )
      },
    },
  }
  return api
}

const selectApi: (...args: Parameters<typeof selectApiBody>) => SelectApi =
  selectApiBody

// What an item part registers with: its props, and the group it's in.
type SelectItemMeta = {
  value: unknown
  label?: string
  disabled?: boolean
  group?: string
  index?: number
}

/**
 * `select`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface SelectApi extends ReturnType<typeof selectApiBody> {}

export {
  type InitialHighlight,
  initialSelectState,
  type SelectApi,
  selectApi,
  type SelectState,
  type Show,
  syncSelectState,
  virtual,
}
