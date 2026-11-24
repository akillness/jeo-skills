// What every "an input filters a collection" component shares: the listbox
// engine with virtual focus, the text that filters it, where the highlight
// goes as the list changes, arrow keys, and the field, list and option parts.
// Autocomplete adds a popup, forms and inline completion on top, and Command
// adds running commands and pages. Combobox stays apart, since it owns a
// selected value.
import { afterBind } from "../kernel/after-bind"
import { type AsyncOptionsStatus } from "./async-options"
import { pressKeepsFocus } from "../focus/press-keeps-focus"
import { takeTypedText } from "../forms/form"
import { isApple } from "../platform/platform"
import { fuzzyFilter } from "../text/fuzzy"
import {
  createFilteredListbox,
  type ListData,
  type ListFilter,
  type Listbox,
} from "./listbox"
import { listStep } from "./listbox-keyboard"
import { keepListing, type Listing } from "./listbox-listing"
import { bindFieldName, type FieldName } from "./field-name"
import { listStepKeys, positionAttrs, registerItem } from "./listbox-parts"
import {
  announceResults,
  createLoadMore,
  matchMode,
  type ListAnnouncement,
} from "./listbox-search"
import { idPart } from "../kernel/attrs"
import type {
  BaseSlotProps,
  PrimitiveContext,
  RoleFields,
  SlotDefinition,
} from "../kernel/primitive-types"
import { direct, live } from "../kernel/live"
import { elements } from "../kernel/elements"

// What the shared core reads from a component's state.
type AutocompleteCoreState = {
  open: boolean
  highlighted: string | null
  items: ListData<unknown> | undefined
  status: AsyncOptionsStatus
  // Counts items mounting, so parts that depend on the list update.
  mounts: number
  // The list has bound and its items have registered, so an empty list is really empty.
  settled: boolean
  // Real focus moved into the list for a touch screen reader, instead of aria-activedescendant.
  focusInList: boolean
  // The groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
  fieldName: FieldName
  // What each item shows from the list as a whole: whether it matches.
  listing: Listing
}

/**
 * How typing narrows the list: `"contains"` and `"startsWith"` match the text
 * itself, `"fuzzy"` matches its letters in order and ranks the best first, a
 * function returns a score or a boolean, and `false` keeps everything.
 * @stable
 */
type SearchFilter<T = string> = ListFilter<T> | "fuzzy"

// The engine's filter for a search filter. The fuzzy scorer is imported only
// here, so lists that never search pay nothing for it.
const engineFilter = (filter: SearchFilter<unknown>) =>
  filter === "fuzzy" ? fuzzyFilter : filter

/** When the first match is highlighted: always, like a command palette; while typing; or never. */
type AutoHighlight = "always" | "typing" | false

// What moved the highlight, for components that report it: the core itself,
// or the reason a component gave `cause`.
type HighlightCause<Reason extends string = string> = {
  reason:
    Reason | "list-navigation" | "item-hover" | "item-removed" | "imperative"
  event?: Event
}

// The props an item registers with.
type AutocompleteCoreItem = {
  value: string
  label?: string
  keywords?: string[]
  disabled?: boolean
  index?: number
  group?: string
}

function createAutocompleteCore<
  State extends AutocompleteCoreState,
  Reason extends string = string,
>(
  context: PrimitiveContext<
    {
      loop?: boolean
      onLoadMore?: () => void
      announcement?: (change: ListAnnouncement) => string | null | undefined
    },
    State,
    string
  >,
  config: {
    // The text that filters the list.
    query: () => string
    // The items as data, or undefined for composed items.
    items: () => ListData<unknown> | undefined
    // Items shown instead while the text is empty, like recent searches.
    emptyItems: () => ListData<unknown> | undefined
    filter: () => SearchFilter<unknown>
    autoHighlight: () => AutoHighlight
    // Moves the highlight. `cause` is null for a default the component picks, which reports nothing.
    highlight: (
      key: string | null,
      cause: HighlightCause<Reason> | null
    ) => void
    // The highlight typing prefers over the first match, like an inline completion's item.
    preferred?: (listbox: Listbox) => string | undefined
    // Opens a closed list from an arrow key, highlighting its first or last item once it mounts.
    open?: (event: KeyboardEvent, edge: "first" | "last") => void
    // Notifies a virtualizer which index to reveal.
    onHighlight?: (key: string | null, index: number, event?: Event) => void
    container: () => HTMLElement | undefined
    scrollRoot?: () => HTMLElement | undefined
    // Whether the component settles the highlight itself once the items mount,
    // like a command page that just opened, with its own reason.
    settlesMount?: () => boolean
  }
) {
  const { id, store, options } = context
  let mountsQueued = false
  // What changes the text next, so the highlight that follows reports it.
  let cause: HighlightCause<Reason> | null = null
  // Text that was asked for and hasn't arrived, while `settleFor` reads the list.
  let asked: string | undefined
  const query = () => asked ?? config.query()
  // The text held when `settleFor` ran, until the options that answer it arrive.
  let heldQuery: string | undefined

  const loadMore = createLoadMore({
    count: () => listbox.count(),
    status: () => store.get().status,
    onLoadMore: () => options().onLoadMore,
  })

  const listbox = createFilteredListbox({
    store,
    focus: () => (store.get().focusInList ? "real" : "virtual"),
    items: config.items,
    emptyItems: config.emptyItems,
    toKey: (value) => String(value ?? ""),
    filter: () => engineFilter(config.filter()),
    // Scores rank data items. Composed ones keep their order, since frameworks own theirs.
    rank: () =>
      config.filter() === "fuzzy" || typeof config.filter() === "function",
    query,
    loop: () => options().loop ?? true,
    skipDisabled: true,
    active: () => store.get().open,
    onHighlight: config.onHighlight,
    onLastReached: loadMore.reached,
    container: config.container,
    scrollRoot: config.scrollRoot,
    onRegister() {
      if (mountsQueued) {
        return
      }
      mountsQueued = true
      afterBind(() => {
        mountsQueued = false
        store.set({ mounts: store.get().mounts + 1 } as Partial<State>)
      })
    },
  })
  keepListing(store, listbox)

  const itemProps = (key: string) =>
    context.props<AutocompleteCoreItem>("item", key)

  // Where the highlight belongs after the list changed. New text highlights
  // its best match; otherwise the same item stays while it's still there,
  // like when async results arrive, and one that left goes. It writes
  // nothing, so a component can work it out in the same pass as the options
  // that carry new data (`deriveFromOptions`).
  function settledHighlight(fresh: boolean) {
    const { highlighted, settled } = store.get()
    // Composed items aren't known until the list binds.
    if (!config.items() && !settled) {
      return highlighted
    }
    const mode = config.autoHighlight()
    const auto = mode === "always" || (mode === "typing" && query() !== "")
    const kept =
      highlighted !== null &&
      listbox.entries().some((entry) => entry.key === highlighted)
    const best = auto
      ? (config.preferred?.(listbox) ?? listbox.firstEnabled() ?? null)
      : null
    return fresh && auto ? best : kept ? highlighted : best
  }

  // Puts the highlight where it belongs after the list changed.
  function settle(fresh: boolean, why: HighlightCause<Reason> | null) {
    const target = settledHighlight(fresh)
    if (target !== store.get().highlighted) {
      config.highlight(target, why)
    }
  }

  // Moves the highlight by the step a key takes (`listStep`), skipping
  // disabled items. Returns whether the key moved.
  function navigate(event: KeyboardEvent) {
    const step = listStep(event, { apple: isApple() })
    if (step === undefined || (event.altKey && event.key === "ArrowUp")) {
      return false
    }
    if (!store.get().open) {
      // Only a step to the next or previous item opens the list.
      if (!config.open || (step !== 1 && step !== -1)) {
        return false
      }
      event.preventDefault()
      config.open(event, step === -1 ? "last" : "first")
      return true
    }
    event.preventDefault()
    const key = listbox.stepKey(step)
    if (key !== undefined) {
      config.highlight(key, { reason: "list-navigation", event })
    }
    return true
  }

  // New text settles the highlight on its best match. Items mounting, data
  // arriving and the list binding keep it where it is if they can.
  let previousQuery = config.query()
  let previous = store.get()
  store.subscribe(() => {
    const state = store.get()
    const before = previous
    previous = state
    const query = config.query()
    if (query !== previousQuery) {
      previousQuery = query
      const why = cause ?? { reason: "imperative" }
      cause = null
      settle(true, why)
    } else if (
      (state.mounts !== before.mounts && !config.settlesMount?.()) ||
      state.items !== before.items ||
      state.settled !== before.settled
    ) {
      const why: HighlightCause<Reason> | null =
        before.highlighted === null ? null : { reason: "item-removed" }
      // Data that settled the highlight in the same pass moved it already,
      // so this only reports where it went.
      if (state.highlighted !== before.highlighted) {
        config.highlight(state.highlighted, why)
      } else {
        settle(false, why)
      }
    }
  })

  // An app that kept its text, like one that strips digits from it, was asked
  // for a highlight that fits text it never took, so it's asked again.
  context.onOptions(() => {
    if (heldQuery === undefined) {
      return
    }
    const held = heldQuery
    const why = cause
    heldQuery = undefined
    queueMicrotask(() => {
      if (config.query() === held) {
        settle(true, why)
      }
    })
  })

  // Turned on, the highlight goes to the best match if nothing has it, once
  // the options are handed over. Turned off, it stays where it is.
  let autoMode = config.autoHighlight()
  context.onOptions(() => {
    const mode = config.autoHighlight()
    if (mode === autoMode) {
      return
    }
    autoMode = mode
    queueMicrotask(() => settle(false, { reason: "imperative" }))
  })

  announceResults({
    store,
    query: config.query,
    count: () => listbox.count(),
    loading: () => store.get().status === "loading",
    shown: () => store.get().open,
    silent: () => elements(context, "status").length > 0,
    announcement: () => options().announcement,
  })

  return {
    listbox,
    itemProps,
    settledHighlight,
    settle,
    navigate,
    loadMore,
    matchQuery: config.query,
    matchMode: () => matchMode(config.filter()),
    // Says what changes the text next, before it changes.
    cause(reason: HighlightCause<Reason>["reason"], event?: Event) {
      cause = { reason, event }
    },
    // Settles the highlight for text a controlled query was asked to become,
    // so a controlled highlight is asked for with the text, not a render later.
    settleFor(next: string) {
      heldQuery = config.query()
      asked = next
      try {
        settle(true, cause)
      } finally {
        asked = undefined
      }
    },
    // The pointer highlights what it moves onto. Touch never does, since a
    // finger scrolling past isn't choosing.
    hover(key: string, event: PointerEvent) {
      if (
        event.pointerType === "touch" ||
        !store.get().open ||
        itemProps(key)?.disabled
      ) {
        return
      }
      if (store.get().highlighted !== key) {
        config.highlight(key, { reason: "item-hover", event })
      }
    },
    // Whether nothing matches. Composed items register once the list binds, so until then it's not known.
    isEmpty: (state: State) =>
      (!!config.items() || state.settled) && listbox.count() === 0,
    itemCount: () => listbox.count(),
    filterQuery: config.query,
    // The id aria-activedescendant points at, once that element is in the page.
    activeDescendant(state: State) {
      const { highlighted } = state
      if (!state.open || state.focusInList || highlighted === null) {
        return undefined
      }
      if (!listbox.element(highlighted)?.isConnected) {
        return undefined
      }
      return `${id}-option-${idPart(highlighted)}`
    },
  }
}

type AutocompleteCore = ReturnType<typeof createAutocompleteCore>

// What the shared parts need from a component's api: some of the core's
// functions, and the component's own.
type CoreApi = {
  internal: Pick<AutocompleteCore, "listbox" | "itemProps" | "hover"> & {
    activeDescendant: (state: never) => string | undefined
    // The text the field shows.
    text: (state: never) => string
    typed: (el: HTMLInputElement, event?: Event) => void
    onInputKeyDown: (event: KeyboardEvent) => void
    press: (key: string, event?: Event) => void
  }
}

// The text field: a combobox whose focus stays put while aria-activedescendant
// points at the highlighted option. Components add their own attributes, and
// to `keys` the ones their `onInputKeyDown` takes past the core's steps.
function fieldPart<State extends AutocompleteCoreState, Api extends CoreApi>() {
  const text = (api: Api, state: State) =>
    (api.internal.text as (state: State) => string)(state)
  return {
    role: "combobox",
    focus: "native",
    keys: listStepKeys,
    attrs: (state, { id, api }) => ({
      id: `${id}-input`,
      value: text(api, state),
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      "aria-expanded": String(state.open),
    }),
    live: live((state, { api }) => ({
      "aria-activedescendant": (
        api.internal.activeDescendant as (state: State) => string | undefined
      )(state),
    })),
    on: {
      input: (event, { api, el }) =>
        api.internal.typed(el as HTMLInputElement, event),
      keydown: (event, { api }) => api.internal.onInputKeyDown(event),
    },
    bind(el, { api, id, store }) {
      bindFieldName(el, store, id)
      // The DOM property, since an input's value attribute stops applying once someone types.
      // Only new text is written: typing stores the query before the text, and
      // a write in between would put the old text back with the caret at the end.
      const input = el as HTMLInputElement
      let shown: string | undefined
      const write = () => {
        const value = text(api, store.get())
        if (value === shown) {
          return
        }
        shown = value
        if (input.value !== value) {
          input.value = value
        }
      }
      takeTypedText(
        input,
        () => [text(api, store.get())],
        () => api.internal.typed(input)
      )
      write()
      return store.subscribe(write)
    },
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}> &
    RoleFields<State, Api, BaseSlotProps>
}

// An option. Nothing is selected in these lists: the highlighted option is
// the one Enter picks, so it's the selected one, as the APG's list
// autocomplete marks it.
function optionPart<
  State extends AutocompleteCoreState,
  Api extends CoreApi,
>() {
  return {
    props: {
      value: "string",
      label: "string",
      keywords: "list",
      disabled: "boolean",
      index: "number",
      group: { kind: "string", from: "group.id" },
    },
    role: "option",
    focus: "active-descendant",
    attrs: (state, { id, key, props, api }) => ({
      id: `${id}-option-${idPart(key)}`,
      // Real focus reaches options only after a screen reader's tap moved it into the list.
      tabindex: state.focusInList ? "-1" : undefined,
      "aria-disabled": props.disabled ? "true" : undefined,
      // Written by `live`, so moving the highlight doesn't render every option.
      "aria-selected": undefined,
      ...positionAttrs(props.index, api.internal.listbox),
      hidden: api.internal.listbox.matches(key, props) ? undefined : "",
      "data-disabled": props.disabled ? "" : undefined,
    }),
    // Typing hides options without rendering them.
    direct: direct(["hidden"]),
    live: live((state, { key }) => ({
      "aria-selected": state.highlighted === key ? "true" : "false",
      "data-highlighted": state.highlighted === key ? "" : undefined,
    })),
    on: {
      ...pressKeepsFocus,
      pointermove: (event, { api, key }) => api.internal.hover(key, event),
    },
    press: ({ api, key }, event) => api.internal.press(key, event),
    bind(el, { api, key, props }) {
      const unregister = registerItem(el, { api, key, props })
      return () => {
        unregister()
        // Web components keep an option that leaves, like on another page, so it drops its highlight.
        el.removeAttribute("data-highlighted")
        el.setAttribute("aria-selected", "false")
      }
    },
  } satisfies SlotDefinition<
    State,
    Api,
    AutocompleteCoreItem & BaseSlotProps,
    {}
  > &
    RoleFields<State, Api, AutocompleteCoreItem & BaseSlotProps>
}

export {
  type AutocompleteCore,
  type AutocompleteCoreItem,
  type AutocompleteCoreState,
  type AutoHighlight,
  createAutocompleteCore,
  fieldPart,
  type HighlightCause,
  optionPart,
  type SearchFilter,
}
