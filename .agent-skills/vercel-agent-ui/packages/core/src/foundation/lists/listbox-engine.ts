// The collection and highlight engine behind Listbox, Select, Combobox,
// Autocomplete, Command and TriggerMenu. It knows items from data or from the
// parts that registered, in order, keeps every label it has seen, finds items
// by typing, and moves the highlight with real focus or with
// `aria-activedescendant`. It works on indexes over the data, so a virtualized
// list never needs its items mounted. Filtering plugs in from listbox.ts, so
// a list nobody types into, like Listbox, doesn't ship it.
import { dev, warn } from "#dev"
import { moveIndex, scrollToShow } from "../focus/collection"
import { createOrder, isAfter } from "../kernel/order"
import { createTypeahead, labelOf } from "../text/typeahead"
import type { Store } from "../kernel/store"

/**
 * An item in a select or combobox, as data.
 * @stable
 */
type ListItem<T = string> = {
  /** Identifies the item, and is what choosing it reports. A string, or any value with `itemToValue`. */
  value: T
  /** The text shown and matched by typeahead and filtering. A select's trigger shows it once chosen. */
  label: string
  /** More words filtering matches, like `["team"]` for a plan called Pro. */
  keywords?: string[]
  /** Keeps the item from being chosen. The keyboard skips it, like in a native select. */
  disabled?: boolean
}

/**
 * A labelled group of items, as data. `Item` is a component's own item type, like `CommandDataItem`.
 * @stable
 */
type ListGroup<T = string, Item extends ListItem<T> = ListItem<T>> = {
  type: "group"
  /** The group's heading, which names it. */
  label?: string
  items: (Item | (T & string))[]
}

/**
 * A line between items, as data.
 * @stable
 */
type ListSeparator = { type: "separator" }

/**
 * A list as data: items, plain strings, groups and separators. The same shape renders in every framework.
 * `Item` is a component's own item type, like `CommandDataItem`.
 * @stable
 */
type ListData<T = string, Item extends ListItem<T> = ListItem<T>> = (
  Item | ListGroup<T, Item> | ListSeparator | (T & string)
)[]

/**
 * How typing narrows the list. `"contains"` keeps items whose label or keywords
 * contain the text, and `"startsWith"` those that start with it, ignoring case
 * and accents. A function decides for itself: `true` or `false`, or a score
 * above 0 that ranks the item, and 0 to hide it. `false` keeps every item, for
 * results a server already filtered.
 * @stable
 */
type ListFilter<T = string> =
  | "contains"
  | "startsWith"
  | false
  | ((item: ListItem<T>, query: string) => boolean | number)

// An item the engine can navigate, from data or from a mounted part.
type ListEntry = {
  key: string
  value: unknown
  label: string
  keywords?: string[]
  disabled: boolean
  // The key of the group it's in.
  group?: string
  // Never filtered and never counted as a result, like a create or select-all option.
  pinned?: boolean
}

// A string for any value: ids, form values and lookups use it. Strings pass
// through, objects use their `value` or `id`, unless `itemToValue` says otherwise.
function itemKey(value: unknown, itemToValue?: (value: unknown) => string) {
  if (value === null || value === undefined) {
    return ""
  }
  if (itemToValue) {
    return itemToValue(value)
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "object") {
    const own =
      (value as { value?: unknown; id?: unknown }).value ??
      (value as { id?: unknown }).id
    if (own !== undefined && own !== null && typeof own !== "object") {
      return String(own)
    }
  }
  return String(value)
}

// An item as data, from a plain string or an item object.
function toListItem<T>(entry: ListItem<T> | (T & string)) {
  return typeof entry === "string"
    ? ({ value: entry, label: entry } as ListItem<T>)
    : entry
}

const isGroup = <T>(entry: ListData<T>[number]): entry is ListGroup<T> =>
  typeof entry === "object" && "type" in entry && entry.type === "group"
const isSeparator = <T>(entry: ListData<T>[number]): entry is ListSeparator =>
  typeof entry === "object" && "type" in entry && entry.type === "separator"

// Every item in data, in order, with the group it's in.
function flattenData<T>(data: ListData<T>, toKey: (value: unknown) => string) {
  const entries: ListEntry[] = []
  data.forEach((entry, index) => {
    if (isSeparator(entry)) {
      return
    }
    if (isGroup(entry)) {
      for (const child of entry.items) {
        entries.push(entryOf(toListItem(child), toKey, `group-${index}`))
      }
      return
    }
    entries.push(entryOf(toListItem(entry), toKey))
  })
  return entries
}

function entryOf<T>(
  item: ListItem<T>,
  toKey: (value: unknown) => string,
  group?: string
) {
  return {
    key: toKey(item.value),
    value: item.value,
    label: item.label,
    keywords: item.keywords,
    disabled: !!item.disabled,
    group,
  }
}

// Scrolls a child into view in its scrolling ancestor, honoring its
// scroll-padding, without scrolling the page the way scrollIntoView would.
// `stop` is the last ancestor to check.
function revealInList(el: HTMLElement, stop: HTMLElement | undefined) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      const top =
        el.getBoundingClientRect().top -
        node.getBoundingClientRect().top -
        node.clientTop +
        node.scrollTop
      const before = parseFloat(style.scrollPaddingTop) || 0
      const after = parseFloat(style.scrollPaddingBottom) || 0
      const shown = scrollToShow(
        node.scrollTop,
        node.clientHeight,
        top,
        el.offsetHeight,
        before,
        after
      )
      // The last option's padding asks past the end, which would write on every move.
      const scrollTop = Math.min(shown, node.scrollHeight - node.clientHeight)
      if (scrollTop !== node.scrollTop) {
        node.scrollTop = scrollTop
      }
      return
    }
    if (node === stop) {
      return
    }
  }
}

// What a mounted item says about itself, read live, so a changed label or
// disabled state applies at once. A pinned entry, like a combobox's create
// option, is never filtered, and comes after data items.
type ItemMeta = {
  value: unknown
  label?: string
  keywords?: string[]
  disabled?: boolean
  group?: string
  pinned?: boolean
  // Its place among all items, in a virtualized list.
  index?: number
}

type Registered = { key: string; el: HTMLElement; meta: () => ItemMeta }

// A label the engine remembers, after its item unmounts too.
type KnownItem = {
  label: string
  value: unknown
  keywords?: string[]
  group?: string
}

/** What the empty part of a filtered list receives: whether it shows, and why. */
type ListEmptyState = {
  /** Whether results are loading. */
  loading: boolean
  /** Whether no item matches. */
  empty: boolean
  /** The text the list is filtered by. */
  query: string
}

/** What the status part of a filtered list receives, for loading and result counts. */
type ListStatusState = {
  /** Whether results are loading or failed. */
  status: "idle" | "loading" | "error"
  /** Whether results are loading. */
  loading: boolean
  /** How many items are visible. */
  count: number
}

/**
 * What `onHighlight` receives besides the value: where the item is.
 * @stable
 */
type ListHighlightDetails = {
  /** The item's index among the visible items, for a virtualizer to scroll to. -1 when nothing is highlighted. */
  index: number
  /** The event behind it, if any. */
  event?: Event
}

/** How a list narrows its items: by a query with listbox.ts, or never with `noFiltering`. */
type ListFiltering = {
  // The data that shows for a query.
  data: (
    data: ListData<unknown>,
    query: string,
    filter: ListFilter<unknown> | undefined,
    options: { rank: boolean }
  ) => ListData<unknown>
  // Whether an item shows for a query.
  matches: (
    item: ListItem<unknown>,
    query: string,
    filter: ListFilter<unknown> | undefined
  ) => boolean
}

function createListboxEngine(
  config: {
    store: Pick<Store<{ highlighted: string | null }>, "get" | "set">
    // "real" moves DOM focus to items. "virtual" leaves it where it is, and the
    // owner points aria-activedescendant at the highlighted item. A function
    // decides per open, like real focus for a touch screen reader.
    focus: "real" | "virtual" | (() => "real" | "virtual")
    items: () => ListData<unknown> | undefined
    // Data shown instead of `items` while the query is empty, like recent searches.
    emptyItems?: () => ListData<unknown> | undefined
    // Whether `emptyItems` show now. By default, while the query is empty.
    showEmpty?: () => boolean
    toKey: (value: unknown) => string
    // How `filtering` narrows the list.
    filter: () => ListFilter<unknown> | undefined
    // The text to filter by. Empty shows everything.
    query: () => string
    // Whether data items are sorted by how well they match, best first.
    rank?: () => boolean
    loop: () => boolean
    // Whether keys pass over disabled items, like a native select.
    skipDisabled?: boolean
    // Whether highlighting may move focus now, like while the popup is open.
    active: () => boolean
    // An item can't be chosen for a reason beyond its own, like a full multiple selection.
    blocked?: (entry: ListEntry) => boolean
    // Tells a virtualizer which index to reveal.
    onHighlight?: (key: string | null, index: number, event?: Event) => void
    // The list, which takes focus back when its focused item leaves.
    container?: () => HTMLElement | undefined
    // The outermost element that may scroll to reveal an item, like the popup
    // content around the list, so the page never scrolls. Defaults to `container`.
    scrollRoot?: () => HTMLElement | undefined
    // Whether highlighting scrolls the item into view. Defaults to true.
    keepInView?: () => boolean
    // Runs when an item mounts or unmounts, like a highlighted one a virtualizer
    // just rendered, so parts that depend on the list can update.
    onRegister?: (key: string) => void
    // Runs when the highlight reaches the last item, so the next page can load.
    onLastReached?: () => void
  },
  filtering: ListFiltering
) {
  const { store } = config
  const focusMode =
    typeof config.focus === "function"
      ? config.focus
      : () => config.focus as "real" | "virtual"
  // Mounted items by key, in document order.
  const registry = createOrder<Registered>()
  // Every label seen, kept after its item unmounts, so a chosen item's label
  // survives a list that no longer has it, like a new page of async results.
  const known = new Map<string, KnownItem>()
  const typeahead = createTypeahead()
  // Keys of entries that are never filtered, like a create option.
  const pinned = new Set<string>()
  type DataMemo = {
    data: ListData<unknown>
    flat: ListEntry[]
    byKey: Map<string, ListEntry>
  }
  let dataMemo: DataMemo | undefined
  let emptyMemo: DataMemo | undefined
  let visibleMemo:
    | {
        data: ListData<unknown>
        query: string
        filter: unknown
        rank: boolean
        list: ListData<unknown>
        flat: ListEntry[]
      }
    | undefined
  let composedMemo:
    | {
        order: unknown
        query: string
        filter: unknown
        version: number
        list: ListEntry[]
      }
    | undefined
  let labelsVersion = 0
  // Counts items mounting and leaving, so the listing knows when to look again.
  let mountsVersion = 0

  const memoOf = (items: ListData<unknown>, memo: DataMemo | undefined) => {
    if (memo?.data === items) {
      return memo
    }
    const flat = flattenData(items, config.toKey)
    return {
      data: items,
      flat,
      byKey: new Map(flat.map((entry) => [entry.key, entry])),
    }
  }

  function data() {
    const items = config.items()
    if (!items) {
      return undefined
    }
    return (dataMemo = memoOf(items, dataMemo))
  }

  function emptySource() {
    const items = config.emptyItems?.()
    return items && (emptyMemo = memoOf(items, emptyMemo))
  }

  // The data shown while the query is empty, when there's any. It needs `items` too.
  function emptyData() {
    if (!config.items() || !(config.showEmpty?.() ?? !config.query().trim())) {
      return undefined
    }
    return emptySource()
  }

  // A data item by key, among the items and the ones shown while the query is empty.
  function dataEntry(key: string) {
    return data()?.byKey.get(key) ?? emptySource()?.byKey.get(key)
  }

  // The data to render: the items that match the current query, or the ones
  // shown while it's empty.
  function visibleData() {
    const source = emptyData() ?? data()
    if (!source) {
      return undefined
    }
    const query = config.query()
    const filter = config.filter()
    const rank = config.rank?.() ?? false
    if (
      visibleMemo?.data !== source.data ||
      visibleMemo.query !== query ||
      visibleMemo.filter !== filter ||
      visibleMemo.rank !== rank
    ) {
      const list = filtering.data(source.data, query, filter, { rank })
      visibleMemo = {
        data: source.data,
        query,
        filter,
        rank,
        list,
        flat: flattenData(list, config.toKey),
      }
    }
    return visibleMemo
  }

  // Items are keyed by value, so two with one value are one item to the list:
  // arrow keys skip one, and Enter or a press can reach the other.
  function warnIfShared(key: string, el: HTMLElement) {
    const other = registry.get(key)?.el
    if (!other || other === el || !other.isConnected) {
      return
    }
    const slot = el.getAttribute("data-slot") ?? ""
    warn(
      `Two items have the value "${key}". Give each item its own value, or arrow keys skip one and choosing it picks the other.`,
      { component: slot.replace(/-item$/, "") || "listbox" }
    )
  }

  // A mounted item's label: its own, or its text now, since parts inside it,
  // like an indicator, may hide themselves after it mounts.
  function liveLabel(key: string, registered: Registered) {
    const meta = registered.meta()
    const label = meta.label ?? labelOf(registered.el)
    // Pinned entries, like a create option, aren't items to remember.
    if (meta.pinned) {
      return label
    }
    const previous = known.get(key)
    if (previous?.label !== label) {
      known.set(key, { ...previous, label, value: meta.value })
      labelsVersion++
    }
    return label
  }

  // check-code: allow return-type the live disabled getter would add a second entry shape beside ListEntry to every list API.
  function registeredEntry(key: string, registered: Registered): ListEntry {
    const meta = registered.meta()
    return {
      key,
      value: meta.value,
      label: liveLabel(key, registered),
      keywords: meta.keywords,
      // Read live, since the list is cached while an item's props change.
      get disabled() {
        return !!registered.meta().disabled
      },
      group: meta.group,
      pinned: meta.pinned,
    }
  }

  // Items that asked whether they match, with the props they asked with. An
  // item asks as it renders, before it mounts, so the listing has its entry
  // even before then.
  const asked = new Map<string, ItemMeta>()

  // Whether an item shows for the current query. Data items that don't aren't rendered.
  const shows = (key: string, meta: ItemMeta) =>
    !!data() || composedMatches(key, meta)

  function matches(key: string, meta: ItemMeta) {
    asked.set(key, meta)
    return shows(key, meta)
  }

  // Whether a composed item matches the query. Its label comes from its props
  // or from its text when it last rendered.
  function composedMatches(key: string, meta: ItemMeta) {
    const registered = registry.get(key)
    const label =
      meta.label ??
      (registered ? liveLabel(key, registered) : known.get(key)?.label) ??
      (typeof meta.value === "string" ? meta.value : "")
    return filtering.matches(
      { value: meta.value, label, keywords: meta.keywords },
      config.query(),
      config.filter()
    )
  }

  // Data items that match, with pinned entries that are in the page where
  // they sit: before the items, like a select-all option, or after them, like
  // a create option.
  function dataEntries(flat: ListEntry[]) {
    if (!pinned.size) {
      return flat
    }
    const first = flat.length ? registry.get(flat[0].key)?.el : undefined
    const before: ListEntry[] = []
    const after: ListEntry[] = []
    for (const key of pinned) {
      const registered = registry.get(key)
      if (!registered?.el.isConnected) {
        continue
      }
      const precedes = !!first?.isConnected && isAfter(registered.el, first)
      ;(precedes ? before : after).push(registeredEntry(key, registered))
    }
    return before.length || after.length ? [...before, ...flat, ...after] : flat
  }

  // Mounted items that match, cached until the items, the query or a label change.
  function composedEntries() {
    const list = registry.list()
    const query = config.query()
    const filter = config.filter()
    if (
      composedMemo?.order === list &&
      composedMemo.query === query &&
      composedMemo.filter === filter &&
      composedMemo.version === labelsVersion
    ) {
      return composedMemo.list
    }
    const result = list
      .map((registered) => registeredEntry(registered.key, registered))
      .filter(
        (entry, index) =>
          list[index].meta().pinned || composedMatches(entry.key, entry)
      )
    composedMemo = {
      order: list,
      query,
      filter,
      version: labelsVersion,
      list: result,
    }
    return result
  }

  // The items a user can move through, in order: data items that match, or
  // mounted items that match.
  function entries() {
    const visible = visibleData()
    if (visible) {
      return dataEntries(visible.flat)
    }
    return composedEntries()
  }

  const disabled = (entry: ListEntry) =>
    entry.disabled || !!config.blocked?.(entry)

  // An item by key: from data, a mounted item, or one whose label was remembered,
  // like a chosen item that left the list.
  function find(key: string | null) {
    if (key === null) {
      return undefined
    }
    const fromData = dataEntry(key)
    if (fromData) {
      return fromData
    }
    const registered = registry.get(key)
    if (registered) {
      return registeredEntry(key, registered)
    }
    const remembered = known.get(key)
    if (remembered) {
      return {
        key,
        value: remembered.value,
        label: remembered.label,
        disabled: false,
      }
    }
  }

  // Focuses a mounted item, or only scrolls it into view with virtual focus.
  function reveal(el: HTMLElement, focus: boolean) {
    if (focusMode() === "real" && focus && config.active()) {
      el.focus({ preventScroll: true })
    }
    if (config.keepInView?.() !== false) {
      revealInList(el, (config.scrollRoot ?? config.container)?.())
    }
  }

  function highlight(
    key: string | null,
    { focus = true, event }: { focus?: boolean; event?: Event } = {}
  ) {
    store.set({ highlighted: key })
    const list = entries()
    const index =
      key === null ? -1 : list.findIndex((entry) => entry.key === key)
    config.onHighlight?.(key, index, event)
    // Skipped items at the end can't be reached, so the last one left counts.
    let last = list.length - 1
    if (config.skipDisabled) {
      while (last > 0 && list[last].disabled) {
        last--
      }
    }
    if (index !== -1 && index === last) {
      config.onLastReached?.()
    }
    if (key === null) {
      return
    }
    const el = registry.get(key)?.el
    if (el?.isConnected) {
      reveal(el, focus)
    }
  }

  // The key a step from the highlight lands on, or the first or last item's,
  // without moving there. Undefined for an empty list, or one where every
  // item is disabled while it skips them.
  function stepKey(
    step: number | "first" | "last",
    // A page stops at the ends, as the APG asks, though the arrows wrap.
    { loop = config.loop() && Math.abs(Number(step)) === 1 } = {}
  ) {
    const all = entries()
    const list = config.skipDisabled
      ? all.filter((entry) => !entry.disabled)
      : all
    if (!list.length) {
      return undefined
    }
    const current = store.get().highlighted
    const index = list.findIndex((entry) => entry.key === current)
    if (index !== -1 || typeof step !== "number") {
      return list[moveIndex(index, step, list.length, loop)].key
    }
    // From a skipped item, like one a press focused, a step counts from where it sits.
    const skipped = all.findIndex((entry) => entry.key === current)
    if (skipped !== -1) {
      const before = all
        .slice(0, skipped)
        .filter((entry) => !entry.disabled).length
      return list[
        moveIndex(step > 0 ? before - 1 : before, step, list.length, loop)
      ].key
    }
    // From no highlight, a step forward lands on the first item and a step back on the last.
    return list[step > 0 ? 0 : list.length - 1].key
  }

  function move(step: number | "first" | "last", event?: Event) {
    const key = stepKey(step)
    if (key !== undefined) {
      highlight(key, { event })
    }
  }

  // The next enabled item whose label starts with what the user typed, after `from`.
  function search(char: string, from: string | null) {
    const list = entries().filter((entry) => !entry.pinned)
    const found = typeahead(
      char,
      list.map((entry) => (disabled(entry) ? "" : entry.label)),
      list.findIndex((entry) => entry.key === from)
    )
    return found === -1 ? undefined : list[found]
  }

  // Whether focus fell to the page, like when its item left or moved.
  function focusLost(el: HTMLElement) {
    const doc = el.ownerDocument
    return !doc.activeElement || doc.activeElement === doc.body
  }

  // Items an app reorders move without mounting again, and the highlighted
  // item, which lost focus on the way, takes it back. The registry drops its
  // order itself. Watched from the moment items are in the page, since data
  // lists never read the registry's order.
  const moves =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(moved)

  function moved() {
    const key = store.get().highlighted
    const el = key === null ? undefined : registry.get(key)?.el
    if (el?.isConnected && focusLost(el)) {
      reveal(el, true)
    }
  }

  // A highlighted item that mounts late, like in a virtualized list, takes focus.
  function focusWhenMounted(key: string, el: HTMLElement) {
    const shouldFocus = () => store.get().highlighted === key && config.active()
    if (
      focusMode() !== "real" ||
      !shouldFocus() ||
      el.ownerDocument.activeElement === el
    ) {
      return
    }
    queueMicrotask(() => {
      if (shouldFocus() && el.isConnected) {
        reveal(el, true)
      }
    })
  }

  function register(key: string, el: HTMLElement, meta: () => ItemMeta) {
    mountsVersion++
    if (dev) {
      warnIfShared(key, el)
    }
    const entry = { key, el, meta }
    const remove = registry.add(entry)
    const current = meta()
    if (current.pinned) {
      pinned.add(key)
    } else {
      // A label the item gives itself is known at once.
      const previous = known.get(key)
      if (current.label !== undefined && previous?.label !== current.label) {
        labelsVersion++
      }
      known.set(key, {
        ...previous,
        label: current.label ?? previous?.label ?? "",
        value: current.value,
        keywords: current.keywords,
        group: current.group,
      })
    }
    // The text is read once the item's own parts have bound, like an indicator that hides itself.
    queueMicrotask(() => {
      if (registry.get(key) !== entry || !entry.el.isConnected) {
        return
      }
      liveLabel(key, entry)
      // Watched once it's in the page: Vue registers items before it inserts them.
      if (entry.el.parentNode) {
        moves?.observe(entry.el.parentNode, { childList: true })
      }
    })
    config.onRegister?.(key)
    focusWhenMounted(key, el)
    return () => {
      if (registry.get(key) !== entry) {
        return
      }
      remove()
      mountsVersion++
      pinned.delete(key)
      if (!registry.size()) {
        moves?.disconnect()
      }
      config.onRegister?.(key)
      queueMicrotask(() => left(key, el))
    }
  }

  // An item that left the list for good, like one its new items dropped while
  // open, takes the highlight with it. Focus that went with it returns to the
  // list, so the keys keep working and the list stays open. An item still in
  // the data only scrolled out of a virtualized list, and stays highlighted.
  function left(key: string, el: HTMLElement) {
    if (
      registry.get(key) ||
      dataEntry(key) ||
      store.get().highlighted !== key
    ) {
      return
    }
    store.set({ highlighted: null })
    config.onHighlight?.(null, -1)
    if (focusMode() === "real" && config.active() && focusLost(el)) {
      config.container?.()?.focus({ preventScroll: true })
    }
  }

  return {
    entries,
    visibleData,
    // Every data item, whatever the query. Undefined for composed items.
    dataItems: () => data()?.flat,
    find,
    disabled,
    // Whether an item is disabled by itself, which keys and the pointer pass
    // over. A `blocked` item can't be chosen but stays reachable.
    isItemDisabled: (key: string) => !!find(key)?.disabled,
    highlight,
    move,
    stepKey,
    // The first item that can be chosen, for highlighting the best match.
    firstEnabled: () =>
      entries().find((entry) => !entry.pinned && !disabled(entry))?.key,
    search,
    register,
    typing: () => typeahead.active(),
    resetTyping: () => typeahead.reset(),
    // The label of an item, from data, a mounted item, or one that was mounted before.
    labelOf(key: string) {
      const fromData = dataEntry(key)
      if (fromData) {
        return fromData.label
      }
      const registered = registry.get(key)
      if (registered) {
        return liveLabel(key, registered)
      }
      return known.get(key)?.label
    },
    valueOf(key: string) {
      const fromData = dataEntry(key)
      if (fromData) {
        return fromData.value
      }
      return registry.get(key)?.meta().value ?? known.get(key)?.value
    },
    matches,
    // What each item shows from the list as a whole, by key, as a short
    // string: "-" while the query hides it, then the list's size for an item
    // placed by `index`, then what `more` adds, like "s" while it's selected.
    // Every item that rendered, mounted or was remembered, and every data
    // item, has an entry. See listbox-listing.ts.
    listing(more?: (key: string, value: unknown) => string) {
      const listing: Record<string, string> = {}
      let size: number | undefined
      // Without a query every item shows. With one, the list already filtered
      // the items in the page for the highlight, so only items that aren't,
      // like one that rendered and hasn't mounted, need checking.
      const filtering = !data() && !!config.query().trim()
      const shown = filtering
        ? new Set(composedEntries().map((entry) => entry.key))
        : undefined
      // `latest` says `item` holds the props the item last rendered with, so
      // its registration needn't be asked for them again.
      const add = (key: string, item: ItemMeta, latest: boolean) => {
        // Entries are strings, unlike inherited properties named like `constructor`.
        if (typeof listing[key] === "string") {
          return
        }
        const registered = registry.get(key)
        const meta = latest ? item : (registered?.meta() ?? item)
        const matched =
          !shown ||
          shown.has(key) ||
          (!registered?.el.isConnected && composedMatches(key, meta))
        let entry = matched ? "" : "-"
        if (meta.index !== undefined) {
          entry += size ??= entries().length
        }
        if (more) {
          entry += more(key, meta.value)
        }
        listing[key] = entry
      }
      for (const [key, item] of asked) {
        add(key, item, true)
      }
      for (const [key, item] of known) {
        add(key, item, false)
      }
      for (const entry of data()?.flat ?? []) {
        add(entry.key, entry, false)
      }
      for (const entry of emptySource()?.flat ?? []) {
        add(entry.key, entry, false)
      }
      return listing
    },
    // Everything the listing depends on besides a component's own state, like
    // the selected value. The listing changes only when one of these does. A
    // data list's entries don't depend on which items are mounted or on their
    // labels, only on its pinned items, which count toward its size. So rows
    // scrolling into a virtualized list don't make it list every item again.
    listingInputs: () => [
      config.items() ? pinned.size : mountsVersion,
      config.items() ? 0 : labelsVersion,
      config.query(),
      config.filter(),
      config.items(),
      config.emptyItems?.(),
      config.showEmpty?.(),
      config.rank?.(),
    ],
    // The keys of the items that match and can be chosen, in one group or in
    // all, leaving out pinned entries. For selecting all of them at once.
    selectable(group?: string) {
      const keys: string[] = []
      for (const entry of entries()) {
        // Its own disabled state, not a full selection, which choosing all would exceed anyway.
        if (entry.pinned || entry.disabled) {
          continue
        }
        if (
          group !== undefined &&
          (registry.get(entry.key)?.meta().group ?? entry.group) !== group
        ) {
          continue
        }
        keys.push(entry.key)
      }
      return keys
    },
    // How many items match, leaving out pinned entries like a create option.
    count() {
      let count = 0
      for (const entry of entries()) {
        if (!entry.pinned) {
          count++
        }
      }
      return count
    },
    // Whether any item of a composed group matches.
    groupMatches(group: string) {
      if (data() || !config.query().trim()) {
        return true
      }
      return registry
        .list()
        .some(
          (registered) =>
            registered.meta().group === group &&
            composedMatches(registered.key, registered.meta())
        )
    },
    element: (key: string) => registry.get(key)?.el,
    // Counts every label change, so a part showing a label can re-render.
    labelsVersion: () => labelsVersion,
    // Remembers a label, like the one an item had when it was chosen.
    remember(key: string, label: string, value: unknown, keywords?: string[]) {
      const current = known.get(key)
      const words = current?.keywords
      const sameText =
        current?.label === label &&
        (!keywords ||
          (words?.length === keywords.length &&
            keywords.every((word, index) => word === words[index])))
      // A new value under the same key and text, like an object made again, still replaces the old one.
      if (current && sameText) {
        if (current.value !== value) {
          known.set(key, { ...current, value })
        }
        return
      }
      known.set(key, {
        ...current,
        label,
        value,
        ...(keywords && { keywords }),
      })
      labelsVersion++
    },
  }
}

type Listbox = ReturnType<typeof createListboxEngine>

// An item a controller can highlight: enabled, and shown for the query.
const highlightable = (listbox: Listbox, key: string) =>
  listbox
    .entries()
    .find(
      (entry) => entry.key === key && !entry.pinned && !listbox.disabled(entry)
    )

// A controller's highlight: onto an item it can highlight, or off with null.
// Returns whether it moved.
function highlightFromCode(
  listbox: Listbox,
  key: string | null,
  current: string | null
) {
  if (key === current || (key !== null && !highlightable(listbox, key))) {
    return false
  }
  listbox.highlight(key)
  return true
}

// The highlighted item's value for a controller. Null for an action like
// Create or Select All.
function highlightedValue(listbox: Listbox, key: string | null) {
  const entry = listbox.find(key)
  return entry && !entry.pinned ? (entry.value ?? null) : null
}

export {
  createListboxEngine,
  highlightable,
  highlightedValue,
  highlightFromCode,
  flattenData,
  isGroup,
  isSeparator,
  itemKey,
  type Listbox,
  type ListData,
  type ListEmptyState,
  type ListEntry,
  type ListFilter,
  type ListFiltering,
  type ListGroup,
  type ListHighlightDetails,
  type ListItem,
  type ListSeparator,
  type ListStatusState,
  revealInList,
  toListItem,
}
