// Command is Autocomplete's core rendered inline: always open, with no popup,
// where the search text is the `query` and the highlight is the `value`. On
// top it runs commands, with a pending state and shortcuts, and keeps a stack
// of pages, each with the search text typed on it.
import type {
  CommandChangeOptions,
  CommandData,
  CommandItemProps,
  CommandOptions,
  CommandPagesChangeReason,
  CommandQueryChangeReason,
  CommandValueChangeReason,
} from "./command"
import {
  createAutocompleteCore,
  type AutocompleteCoreState,
  type HighlightCause,
  type SearchFilter,
} from "../../foundation/lists/autocomplete-core"
import { commandShortcuts, findCommand, pageItems } from "./command-data"
import { initialApple } from "../../foundation/platform/platform"
import { noListing } from "../../foundation/lists/listbox-listing"
import { announcePending, isPromise } from "../../foundation/kernel/action"
import { isComposing, selectEvent } from "../../foundation/kernel/events"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import {
  adoptPlatform,
  bindPartShortcut,
  shortcutOf,
} from "../../foundation/shortcuts/shortcut-slot"
import { shortcuts } from "../../foundation/shortcuts/shortcuts"
import { createChange } from "../../foundation/kernel/input-source"
import { deriveFromOptions } from "../../foundation/kernel/derive"

type CommandStore = Omit<AutocompleteCoreState, "items"> & {
  items: CommandData | undefined
  // The highlighted command's value, which is its key. The highlight follows it.
  value: string | null
  query: string
  pages: string[]
  // The search text of each page below the current one, put back on the way back.
  queries: string[]
  // The commands whose action's Promise is running, and the last one that failed.
  pending: readonly string[]
  error: { key: string; reason: unknown } | null
  // Apple keyboard conventions for shortcut names. Neutral until the client binds.
  apple: boolean
}

// What a command part registers with: its props, the group it's in, and the page it's on.
type CommandItemMeta = CommandItemProps & {
  value: string
  group?: string
  // The page it's on: `null` for the first page, undefined outside any page.
  inPage?: string | null
  // Rendered from data, whose shortcuts the root binds.
  data?: boolean
}

function initialCommandState(options: CommandOptions): CommandStore {
  return {
    // Inline, so always open.
    open: true,
    value:
      options.value !== undefined
        ? options.value
        : (options.defaultValue ?? null),
    highlighted: null,
    query: options.query ?? options.defaultQuery ?? "",
    pages: options.pages ?? options.defaultPages ?? [],
    queries: [],
    items: options.items,
    status: options.status ?? "idle",
    pending: [],
    error: null,
    apple: initialApple(),
    mounts: 0,
    settled: false,
    // Inline, so focus never has to move into the list.
    focusInList: false,
    groupLabels: [],
    fieldName: null,
    listing: noListing,
  }
}

function syncCommandState(options: CommandOptions) {
  return {
    items: options.items,
    status: options.status ?? "idle",
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.query === undefined ? {} : { query: options.query }),
    ...(options.pages === undefined ? {} : { pages: options.pages }),
  }
}

// The page on top of the stack, or `null` on the first page.
const currentPage = (state: { pages: string[] }) => state.pages.at(-1) ?? null

function commandApiBody(
  context: PrimitiveContext<CommandOptions, CommandStore, string>
) {
  const { id, store, options, element } = context
  announcePending(context, () => store.get().pending.length > 0)
  const change = createChange(context)
  const itemProps = (key: string) => context.props<CommandItemMeta>("item", key)
  // The current page's data commands, or undefined for a page only parts compose.
  const items = () => pageItems(store.get().items, store.get().pages)
  const indexOf = (key: string | null) =>
    key === null
      ? -1
      : core.listbox.entries().findIndex((entry) => entry.key === key)

  // The highlight is the value, through `onValueChange`, so a controlled one waits for it to come back.
  function highlight(
    key: string | null,
    why: HighlightCause<CommandValueChangeReason> | null
  ) {
    if (key === store.get().value) {
      return false
    }
    if (why) {
      return change("value", key, {
        reason: why.reason,
        event: why.event,
        index: indexOf(key),
      })
    }
    // A highlight the component picks with nothing before it is a default, not a change.
    if (options().value === undefined) {
      store.set({ value: key })
    }
    return false
  }

  // The cause of a composed page change, until its commands mount.
  let awaiting: HighlightCause<CommandValueChangeReason> | null = null

  // Commands shown on the first page while the search is empty.
  const emptyItems = () =>
    store.get().pages.length ? undefined : options().emptyItems

  const core = createAutocompleteCore(context, {
    query: () => store.get().query,
    items,
    emptyItems,
    // Commands are strings, so a filter for them reads every item the engine passes.
    filter: () => (options().filter ?? "fuzzy") as SearchFilter<unknown>,
    autoHighlight: () => (options().autoHighlight === false ? false : "always"),
    highlight,
    container: () => element("list"),
    scrollRoot: () => element("root"),
    // A composed page that just changed highlights its best match once its
    // commands mount, for the page change's reason, not for the commands that left.
    settlesMount: () => awaiting !== null,
  })

  function setQuery(
    query: string,
    reason: CommandQueryChangeReason,
    event?: Event
  ) {
    core.cause(reason, event)
    return change("query", query, { reason, event })
  }

  // The text changing on its own, not with a page. An app that holds the text
  // and the value hears both in one event, so it renders them together. With
  // `filter: false` the app's next items decide the highlight, so it waits.
  function search(
    query: string,
    reason: CommandQueryChangeReason,
    event?: Event
  ) {
    const changed = setQuery(query, reason, event)
    if (
      changed &&
      options().query !== undefined &&
      options().value !== undefined &&
      options().filter !== false
    ) {
      core.settleFor(query)
    }
    return changed
  }

  // The cause of the next page change, for the highlight that follows it.
  let pageCause: HighlightCause<CommandValueChangeReason> | null = null

  function push(page: string, reason: CommandPagesChangeReason, event?: Event) {
    const { pages, query, queries } = store.get()
    pageCause = { reason, event }
    if (!change("pages", [...pages, page], { reason, event })) {
      return false
    }
    store.set({ queries: [...queries.slice(0, pages.length), query] })
    setQuery("", reason, event)
    return true
  }

  function pop(reason: CommandPagesChangeReason, event?: Event) {
    const { pages, queries } = store.get()
    if (!pages.length) {
      return false
    }
    pageCause = { reason, event }
    if (!change("pages", pages.slice(0, -1), { reason, event })) {
      return false
    }
    store.set({ queries: queries.slice(0, pages.length - 1) })
    setQuery(queries[pages.length - 1] ?? "", reason, event)
    return true
  }

  // Runs a command, as Enter, a click or its shortcut would: its `onSelect`,
  // then its page or `onAction`. A returned Promise marks it pending.
  function run(
    key: string,
    {
      event,
      reason = "item-press",
    }: { event?: Event; reason?: "item-press" | "shortcut" }
  ) {
    const props = itemProps(key)
    // A command from the data, whether the list renders it or you do.
    const data =
      findCommand(store.get().items, key) ??
      findCommand(options().emptyItems, key)
    if (!props && !data) {
      return
    }
    if (
      props?.disabled ||
      data?.disabled ||
      store.get().pending.includes(key)
    ) {
      // A command rendered as a link would still follow its href.
      if (event?.type === "click") {
        event.preventDefault()
      }
      return
    }
    if (store.get().error?.key === key) {
      store.set({ error: null })
    }
    // A shortcut's key press is already handled, so `onSelect` gets a fresh event to cancel.
    const selection = event && !event.defaultPrevented ? event : selectEvent()
    const results = [props?.onSelect?.(selection)]
    const page = props?.page ?? (data?.items ? data.value : undefined)
    if (!selection.defaultPrevented) {
      if (page !== undefined) {
        push(page, reason, event)
      } else {
        results.push(options().onAction?.(key, { event }))
      }
    }
    const pending = results.filter(isPromise)
    if (!pending.length) {
      return
    }
    // Each command is pending on its own, so others that started meanwhile stay pending.
    store.set({ pending: [...store.get().pending, key] })
    const settled = () => store.get().pending.filter((other) => other !== key)
    Promise.all(pending).then(
      () => store.set({ pending: settled() }),
      (failure) =>
        store.set({ pending: settled(), error: { key, reason: failure } })
    )
  }

  function onInputKeyDown(event: KeyboardEvent) {
    if (core.navigate(event)) {
      return
    }
    const { value, query, pages } = store.get()
    switch (event.key) {
      case "Enter": {
        if (value === null) {
          // The search isn't form data, so Enter never submits a form around it.
          if (!isComposing(event)) {
            event.preventDefault()
          }
          return
        }
        const el = core.listbox.element(value)
        // Links follow themselves, so routers and modifier keys work.
        if (el?.matches("a[href]")) {
          el.click()
        } else {
          run(value, { event })
        }
        event.preventDefault()
        return
      }
      // Escape steps back one thing at a time: the search text, then a page.
      // With neither, it's left to a dialog around the list.
      case "Escape":
        if (!query && !pages.length) {
          return
        }
        event.preventDefault()
        if (query) {
          search("", "escape-key", event)
        } else {
          pop("escape-key", event)
        }
        return
      case "Backspace":
        // Backspace in an empty field goes back a page.
        if (!(event.target as HTMLInputElement).value && pages.length) {
          event.preventDefault()
          pop("back", event)
        }
    }
  }

  // A value from options is highlighted in the same pass; the reveal follows it.
  deriveFromOptions(context, ["highlighted"], (synced, state) =>
    "value" in synced && synced.value !== state.highlighted
      ? { highlighted: synced.value }
      : undefined
  )
  // The highlight follows the value, from a choice, a controller or a
  // controlled prop. A new page highlights its best match: at once for data,
  // and once its commands mount for a composed page.
  let previousValue = store.get().value
  let previousPages = store.get().pages
  let previousMounts = store.get().mounts
  store.subscribe(() => {
    const state = store.get()
    if (state.value !== state.highlighted || state.value !== previousValue) {
      previousValue = state.value
      core.listbox.highlight(state.value)
    }
    if (state.pages !== previousPages) {
      previousPages = state.pages
      const why = pageCause ?? { reason: "imperative" }
      pageCause = null
      if (items()) {
        core.settle(true, why)
      } else {
        awaiting = why
      }
    } else if (awaiting && state.mounts !== previousMounts) {
      const why = awaiting
      awaiting = null
      core.settle(true, why)
    }
    previousMounts = state.mounts
  })

  // Data commands' shortcuts run from anywhere the list is, whatever page or
  // filter hides them. Composed commands bind their own as they mount.
  function bindDataShortcuts(el: HTMLElement) {
    let bound: CommandData | undefined
    let offs: (() => void)[] = []
    const sync = () => {
      const { items } = store.get()
      if (items === bound) {
        return
      }
      bound = items
      offs.forEach((off) => off())
      offs = commandShortcuts(items).map(({ value, shortcut }) =>
        shortcuts.register(
          shortcut,
          (event) => run(value, { event, reason: "shortcut" }),
          { layer: el }
        )
      )
    }
    sync()
    const unsubscribe = store.subscribe(sync)
    return () => {
      unsubscribe()
      offs.forEach((off) => off())
    }
  }

  // A composed command's shortcut, registered while its props name one. The
  // root already binds the shortcuts of commands from the data.
  function bindItemShortcut(
    el: HTMLElement,
    key: string,
    onProps: (listener: () => void) => () => void
  ) {
    return bindPartShortcut(
      () => {
        const props = itemProps(key)
        return props?.data || findCommand(store.get().items, key)?.shortcut
          ? undefined
          : props?.shortcut
      },
      (event) => run(key, { event, reason: "shortcut" }),
      { layer: el },
      onProps
    )
  }

  const api = {
    id,
    getValue: () => store.get().value,
    setValue: (
      value: string | null,
      {
        reason = "imperative",
        event,
      }: CommandChangeOptions<CommandValueChangeReason> = {}
    ) => highlight(value, { reason, event }),
    getQuery: () => store.get().query,
    setQuery: (
      query: string,
      {
        reason = "imperative",
        event,
      }: CommandChangeOptions<CommandQueryChangeReason> = {}
    ) => search(query, reason, event),
    getPages: () => store.get().pages,
    setPages(
      pages: string[],
      {
        reason = "imperative",
        event,
      }: CommandChangeOptions<CommandPagesChangeReason> = {}
    ) {
      pageCause = { reason, event }
      return change("pages", pages, { reason, event })
    },
    push: (
      page: string,
      {
        reason = "imperative",
        event,
      }: CommandChangeOptions<CommandPagesChangeReason> = {}
    ) => push(page, reason, event),
    pop: ({
      reason = "imperative",
      event,
    }: CommandChangeOptions<CommandPagesChangeReason> = {}) =>
      pop(reason, event),
    run(value?: string) {
      const key = value ?? store.get().value
      if (key !== null) {
        run(key, {})
      }
    },
    focus: () => element("input")?.focus(),
    // Internal. Used by slots and adapters.
    internal: {
      ...core,
      options,
      itemProps,
      run,
      press: (key: string, event?: Event) => run(key, { event }),
      text: (state: CommandStore) => state.query,
      typed: (el: HTMLInputElement, event?: Event) =>
        search(el.value, "input-change", event),
      onInputKeyDown,
      // Whether a command is on the page shown: outside any page, or on the current one.
      onCurrentPage: (state: CommandStore, page: string | null | undefined) =>
        page === undefined || page === currentPage(state),
      // The shortcut of the command an element sits in.
      shortcutOf: (el: HTMLElement) => shortcutOf(context, "item", el),
      bindDataShortcuts,
      bindItemShortcut,
      // The client knows its platform now.
      syncPlatform: () => adoptPlatform(store),
    },
  }

  // The value it starts with is highlighted, and data commands are known at
  // once, so without one the first is, before anything mounts.
  if (store.get().value !== null) {
    core.listbox.highlight(store.get().value)
  }
  core.settle(false, null)
  return api
}

const commandApi: (...args: Parameters<typeof commandApiBody>) => CommandApi =
  commandApiBody

/**
 * `command`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface CommandApi extends ReturnType<typeof commandApiBody> {}

export {
  type CommandApi,
  type CommandItemMeta,
  commandApi,
  type CommandStore,
  currentPage,
  initialCommandState,
  syncCommandState,
}
