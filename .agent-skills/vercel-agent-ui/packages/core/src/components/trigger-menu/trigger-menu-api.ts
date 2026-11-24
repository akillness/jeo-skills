// TriggerMenu's state and API: what the list shows for the current level,
// when it opens, what screen readers hear, and the editor it follows. The
// match and its levels live in trigger-menu-levels.ts, and choosing in
// trigger-menu-select.ts.
import { isComposing } from "../../foundation/kernel/events"
import {
  createAsyncOptions,
  type AsyncOptionsStatus,
} from "../../foundation/lists/async-options"
import { createDetails } from "../../foundation/kernel/details"
import { changeSource } from "../../foundation/kernel/input-source"
import { announce } from "../../foundation/platform/announce"
import {
  deriveOpen,
  type PopupCloseReason,
  type PopupOpener,
  type PopupResult,
} from "../../foundation/popups/popup"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { unopened } from "../../foundation/popups/popup-steps"
import { triggerMenuPreset } from "../../foundation/popups/popup-presets"
import { matchesShortcut } from "../../foundation/platform/platform"
import {
  createFilteredListbox,
  itemKey,
  type ListData,
} from "../../foundation/lists/listbox"
import {
  keepListing,
  noListing,
  type Listing,
} from "../../foundation/lists/listbox-listing"
import { whenKept } from "../../foundation/kernel/keep"
import { aliasReferences } from "../../foundation/kernel/part"
import { idPart } from "../../foundation/kernel/attrs"
import { applyAttrs, releaseAttrs } from "../../foundation/kernel/live"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  TextEditorAdapter,
  TokenInsert,
} from "../../foundation/text/text-editor"
import type {
  TriggerItemsLoader,
  TriggerMenuChangeOptions,
  TriggerMenuContentProps,
  TriggerMenuItemProps,
  TriggerMenuOpenChangeReason,
  TriggerMenuOptions,
  TriggerMenuQueryChangeReason,
} from "./trigger-menu"
import { createTriggerMenuKeyboard } from "./trigger-menu-keyboard"
import {
  argumentOf,
  createTriggerLevels,
  type TriggerLevel,
} from "./trigger-menu-levels"
import { createTriggerSelect } from "./trigger-menu-select"
import type { TextProps } from "./trigger-menu-parts"
import { announcePending } from "../../foundation/kernel/action"
import { elements } from "../../foundation/kernel/elements"

type TriggerMenuState = PopupState & {
  highlighted: string | null
  // An arrow key moved the highlight since the last edit, so screen readers hear about it.
  navigated: boolean
  query: string
  argument: string | null
  hint: string
  items: ListData<unknown> | undefined
  // A loader's state, unless the `status` option says otherwise.
  loading: AsyncOptionsStatus
  editor: TextEditorAdapter | undefined
  // What kind of field the menu writes ARIA to: an <input> takes the combobox role.
  field: "input" | "multiline"
  listed: boolean
  // Rendering an empty part keeps the menu open with no matches. Remembered
  // once seen, since it only binds inside the open content.
  hasEmpty: boolean
  settled: boolean
  mounts: number
  // The groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
  // What each item shows from the list as a whole: whether it matches.
  listing: Listing
  // `onSelect` Promises that haven't settled.
  pending: number
}

type ItemMeta = TriggerMenuItemProps<unknown> & { group?: string }

function initialTriggerMenuState(
  options: TriggerMenuOptions<any>
): TriggerMenuState {
  return {
    // It opens only once a trigger is typed.
    ...popupState({}),
    highlighted: null,
    navigated: false,
    query: "",
    argument: null,
    hint: "",
    items: undefined,
    loading: "idle",
    editor: options.editor,
    field: "multiline",
    listed: false,
    hasEmpty: false,
    settled: false,
    mounts: 0,
    groupLabels: [],
    listing: noListing,
    pending: 0,
  }
}

function syncTriggerMenuState(options: TriggerMenuOptions<any>) {
  return {
    editor: options.editor,
    ...(options.open === undefined ? {} : { open: options.open }),
  }
}

const isLoader = (items: unknown): items is TriggerItemsLoader<unknown> =>
  typeof items === "function"

// The arguments' hints still to type, like "<name> <effort>".
function hintFor(level: TriggerLevel, query: string) {
  const list = level.item?.arguments
  if (!list) {
    return ""
  }
  const index = level.starts.length - 1
  return list
    .slice(query ? index + 1 : index)
    .map((argument) => argument.hint ?? `<${argument.name}>`)
    .join(" ")
}

const sameLevel = (a: TriggerLevel | null, b: TriggerLevel) =>
  !!a &&
  a.rule === b.rule &&
  a.item === b.item &&
  a.starts.length === b.starts.length &&
  a.queryStart === b.queryStart

function triggerMenuApiBody(
  context: PrimitiveContext<TriggerMenuOptions<any>, TriggerMenuState, string>
) {
  const { id, store, options, element } = context
  // A controlled close clears the highlight in the same pass.
  deriveOpen(context, ["highlighted", "navigated"], (open) =>
    open ? undefined : { highlighted: null, navigated: false }
  )
  // The editor a TriggerMenuInput built. It wins over the `editor` option.
  let ownEditor: TextEditorAdapter | undefined
  // Whether the framework keeps the instance, which is while it follows its editor.
  let kept = false
  let connected: { editor: TextEditorAdapter; cleanup: () => void } | undefined
  let mountsQueued = false
  // The query a loader is loading for, so results for anything else never land.
  let requested: string | null = null
  // The level shown last, to tell a new level from a new query.
  let shown: TriggerLevel | null = null

  const toKey = (value: unknown) => itemKey(value)
  const editor = () => ownEditor ?? store.get().editor
  const rules = () => options().triggers ?? []
  const loadingStatus = () => options().status ?? store.get().loading
  // What the current level lists: an argument's items, else the trigger's.
  const levelItems = () => {
    const level = levels.current()
    return level?.item
      ? argumentOf(level)?.items
      : level
        ? rules()[level.rule]?.items
        : undefined
  }
  // A free-text argument shows no list.
  const isFreeText = () => {
    const level = levels.current()
    return !!level?.item && !argumentOf(level)?.items
  }

  const listbox = createFilteredListbox({
    store,
    focus: "virtual",
    items: () => store.get().items,
    toKey,
    filter: () => {
      const level = levels.current()
      return isLoader(levelItems())
        ? false
        : ((level && rules()[level.rule]?.filter) ?? "contains")
    },
    query: () => store.get().query,
    loop: () => options().loop ?? true,
    active: () => store.get().open,
    container: () => element("list") ?? popup.element() ?? element("content"),
    scrollRoot: () => popup.element() ?? element("content"),
    onRegister() {
      if (mountsQueued) {
        return
      }
      mountsQueued = true
      queueMicrotask(() => {
        mountsQueued = false
        store.set({ mounts: store.get().mounts + 1 })
      })
    },
  })
  keepListing(store, listbox)

  const loader = createAsyncOptions<unknown>(
    async (query, loadContext) => {
      const items = levelItems()
      return isLoader(items)
        ? ((await items(query, loadContext)) as unknown[])
        : []
    },
    { debounce: 150 }
  )
  loader.subscribe(() => {
    const state = loader.getState()
    // Results for a level or query that's gone never land.
    if (
      !levels.current() ||
      state.query !== requested ||
      state.status === "loading"
    ) {
      return
    }
    store.set({
      items: state.items as ListData<unknown>,
      loading: state.status,
    })
    settle("input-change")
  })

  const { control, popup, contentProps } = createPopup(context, {
    preset: triggerMenuPreset,
    rules: () => ({
      trigger: () => editor()?.element,
      // The editor isn't outside: a press in it moves the caret, which decides.
      contains: (target) => !!editor()?.element?.contains(target),
      // Without a sheet or a close watcher, it never closes for a swipe or Back.
      dismiss(reason, { event }) {
        levels.end(
          reason as Exclude<PopupCloseReason, "swipe" | "back">,
          event,
          {
            dismiss: reason === "escape-key",
          }
        )
      },
      // Focus stays in the editor.
      returnFocus: false,
      details: () => ({ trigger: store.get().trigger }),
      onOpenChange(open) {
        if (!open) {
          store.set({ highlighted: null, navigated: false })
        }
      },
    }),
  }).internal
  context.onDestroy(() => loader.cancel())

  // The controller's writes reach the popup through the match levels, so they read the outcome here.
  let moved = false

  function show(
    reason: TriggerMenuOpenChangeReason,
    event?: Event,
    by: PopupOpener = "keyboard"
  ) {
    if (!store.get().open) {
      moved = control.attempt({ reason, event, by }).opened
    }
  }

  function hide(reason: TriggerMenuOpenChangeReason, event?: Event) {
    moved = control.hide({ reason, event })
  }

  function moving(write: () => unknown) {
    moved = false
    write()
    return moved
  }

  function setQuery(
    query: string,
    reason: TriggerMenuQueryChangeReason,
    event?: Event
  ) {
    if (store.get().query === query) {
      return
    }
    store.set({ query })
    const level = levels.current()
    if (level) {
      options().onQueryChange?.(
        query,
        createDetails(
          {
            reason,
            event,
            trigger: level.match.trigger,
            argument: argumentOf(level)?.name,
          },
          changeSource(reason, event)
        )
      )
    }
  }

  // What a level lists. Data shows at once; a loader starts loading, keeping
  // the previous items within the same level.
  function loadLevel(query: string, levelChanged: boolean) {
    const items = levelItems()
    if (!isLoader(items)) {
      loader.cancel()
      requested = null
      return store.set({
        items: isFreeText() ? [] : (items as ListData<unknown> | undefined),
        loading: "idle",
      })
    }
    if (levelChanged) {
      loader.cancel()
      store.set({ items: [] })
    }
    requested = query
    store.set({ loading: "loading" })
    loader.setQuery(query)
  }

  const levels = createTriggerLevels({
    editor,
    rules,
    isWriting: () => select.isWriting(),
    apply(level, query, reason, open, event) {
      const levelChanged = !sameLevel(shown, level)
      shown = level
      store.set({
        trigger: level.match.trigger,
        argument: argumentOf(level)?.name ?? null,
        hint: hintFor(level, query),
        navigated: false,
      })
      setQuery(query, reason, event)
      if (levelChanged || isLoader(levelItems())) {
        loadLevel(query, levelChanged)
      }
      settle(open, event)
    },
    close(reason, event) {
      shown = null
      requested = null
      loader.cancel()
      hide(reason, event)
      // The query empties without `onQueryChange`, which reports only while a
      // level is current, and the level has ended.
      store.set({
        trigger: null,
        argument: null,
        hint: "",
        navigated: false,
        loading: "idle",
        query: "",
      })
      announceState()
    },
  })

  const select = createTriggerSelect({
    levels,
    editor,
    options,
    items: () => store.get().items,
    find: (key) => listbox.find(key),
    highlighted: () => (store.get().open ? store.get().highlighted : null),
    itemProps: (key) => context.props<ItemMeta>("item", key),
    toKey,
    waiting(promise) {
      store.set({ pending: store.get().pending + 1 })
      const settled = () => store.set({ pending: store.get().pending - 1 })
      promise.then(settled, settled)
    },
  })
  announcePending(context, () => store.get().pending > 0)

  // Whether the list has anything to show. Composed items that never mounted
  // are unknown, so they count as there.
  function hasEntries() {
    const state = store.get()
    if (!state.items && !listbox.entries().length && !state.settled) {
      return true
    }
    return listbox.entries().length > 0
  }

  // Counted when they bind, so an Empty that rebinds, or mounts as the last
  // row unmounts, never reads as gone within the commit.
  let empties = 0

  // The list for the current level shows while items match, while they
  // load, or while an empty part can say there are none.
  const visible = () =>
    !!levels.current() &&
    !isFreeText() &&
    (hasEntries() || loadingStatus() === "loading" || empties > 0)

  function settle(reason: TriggerMenuOpenChangeReason, event?: Event) {
    if (visible()) {
      show(reason, event)
    } else {
      hide(reason, event)
    }
    settleHighlight()
    announceState()
  }

  // The first match is highlighted with `autoHighlight`, and a highlight whose item left goes.
  function settleHighlight() {
    const list = listbox.entries()
    const current = store.get().highlighted
    const present =
      current !== null && list.some((entry) => entry.key === current)
    if ((options().autoHighlight ?? true) && list.length) {
      if (present && store.get().navigated) {
        return
      }
      const first = list.find((entry) => !listbox.disabled(entry)) ?? list[0]
      if (first.key !== current) {
        listbox.highlight(first.key)
      }
      return
    }
    if (current !== null && !present) {
      listbox.highlight(null)
    }
  }

  // What screen readers hear now: the count and the keys, loading, nothing
  // matching, or the argument being typed.
  function statusMessage() {
    const state = store.get()
    if (!state.open && !levels.current()) {
      return ""
    }
    if (loadingStatus() === "loading") {
      return "Loading"
    }
    if (!state.open) {
      return state.argument ? `${state.argument}. ${state.hint}`.trim() : ""
    }
    const count = listbox.entries().length
    if (!count) {
      return "No matches"
    }
    const next = levels.current()?.item ? ", Tab for the next" : ""
    return `${count} ${count === 1 ? "suggestion" : "suggestions"}. Up and Down to choose, Enter to insert${next}`
  }

  // Says the status through a status part without content of its own, once
  // typing pauses, or else through the page's shared announcer.
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  context.onDestroy(() => clearTimeout(statusTimer))
  function announceState() {
    const message = statusMessage()
    const region = element("status")
    if (!region) {
      return announce(message)
    }
    if (
      !(
        elements<TextProps>(context, "status")[0]?.props ??
        context.props<TextProps>("status")
      )?.text
    ) {
      return
    }
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => {
      // The same message again is changed a little, so it's said again.
      region.textContent =
        message && region.textContent === message ? `${message}\u00a0` : message
    }, 350)
  }

  const keyboard = createTriggerMenuKeyboard({
    store,
    listbox,
    active: () => !!levels.current(),
    inArguments: () => !!levels.current()?.item,
    choose: select.choose,
    accept: select.accept,
    dismiss: (event) => levels.end("escape-key", event, { dismiss: true }),
    caretMove: (event) => levels.end("caret-move", event),
  })

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || isComposing(event)) {
      return
    }
    const shortcut = options().shortcut ?? "ctrl+space"
    if (shortcut && matchesShortcut(event, shortcut)) {
      if (levels.reopen("shortcut", event)) {
        event.preventDefault()
      }
      return
    }
    keyboard.onKeyDown(event)
  }

  function disconnect() {
    connected?.cleanup()
    connected = undefined
  }

  // Follows an editor: its edits and caret moves, and for editors without a
  // part of their own, its keys and ARIA.
  function connect(
    next: TextEditorAdapter | undefined,
    { ownKeys = false } = {}
  ) {
    if (connected?.editor === next) {
      return
    }
    disconnect()
    if (!next) {
      return
    }
    const cleanups = [next.subscribe(levels.onEditorChange)]
    if (!ownKeys && typeof document !== "undefined") {
      // In the capture phase, so an open menu's keys win over the editor's
      // own, like Enter submitting a prompt.
      const onKey = (event: KeyboardEvent) => {
        const target = event.target as Node | null
        if (target && next.element?.contains(target)) {
          onKeyDown(event)
        }
      }
      document.addEventListener("keydown", onKey, true)
      cleanups.push(() => document.removeEventListener("keydown", onKey, true))
      // On a channel of its own, so the editor's own attributes stay.
      let field: HTMLElement | undefined
      const writeAttrs = () => {
        field = next.element ?? field
        if (next.element) {
          applyAttrs(
            next.element,
            aliasReferences(context, fieldAttrs(store.get(), "multiline")),
            "trigger-menu"
          )
        }
      }
      writeAttrs()
      cleanups.push(
        store.subscribe(writeAttrs),
        next.subscribe(writeAttrs),
        () => field && releaseAttrs(field, "trigger-menu")
      )
    }
    connected = {
      editor: next,
      cleanup: () => cleanups.forEach((cleanup) => cleanup()),
    }
  }

  // The editor a TriggerMenuInput built, else the `editor` option. Followed
  // while the framework keeps the instance, so one React makes and throws
  // away, or hides, never listens to the editor.
  const follow = () => {
    if (kept) {
      connect(editor(), { ownKeys: !!ownEditor })
    }
  }
  whenKept(() => {
    kept = true
    follow()
    return () => {
      kept = false
      disconnect()
    }
  })
  let lastEditor = store.get().editor
  store.subscribe(() => {
    const { editor: option } = store.get()
    if (option === lastEditor) {
      return
    }
    lastEditor = option
    follow()
  })

  // Keeps the highlight valid as items mount and load.
  let lastMounts = store.get().mounts
  let lastItems = store.get().items
  store.subscribe(() => {
    const { mounts, items } = store.get()
    if (mounts === lastMounts && items === lastItems) {
      return
    }
    lastMounts = mounts
    lastItems = items
    // Rows can unmount after the input that filtered them, like React's children.
    if (store.get().open && !visible()) {
      return settle("input-change")
    }
    settleHighlight()
  })

  // The id the field's aria-activedescendant points at, after an arrow key.
  function activeDescendant(state: TriggerMenuState) {
    const { highlighted } = state
    if (!state.open || !state.navigated || highlighted === null) {
      return undefined
    }
    if (!listbox.element(highlighted)?.isConnected) {
      return undefined
    }
    return `${id}-option-${idPart(highlighted)}`
  }

  // The field's ARIA. An <input> is a combobox; a <textarea> or contenteditable
  // stays a textbox, which ARIA forbids `aria-expanded` on.
  function fieldAttrs(state: TriggerMenuState, field: "input" | "multiline") {
    return {
      "aria-expanded": field === "input" ? String(state.open) : undefined,
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      "aria-controls": state.open
        ? `${id}-${state.listed ? "list" : "content"}`
        : undefined,
      "aria-activedescendant": activeDescendant(state),
    }
  }

  return {
    id,
    isOpen: () => store.get().open,
    setOpen(
      open: boolean,
      {
        reason = "imperative",
        event,
      }: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason> = {}
    ) {
      if (!open) {
        return moving(() => levels.end(reason, event))
      }
      // A match that close() ended is still in the text, so it opens again.
      return moving(() =>
        levels.current()
          ? show(reason, event, "imperative")
          : levels.reopen(reason, event)
      )
    },
    open({
      trigger,
      reason = "imperative",
      event,
      signal,
    }: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason> & {
      trigger?: string
      signal?: AbortSignal
    } = {}) {
      const target = editor()
      const char = trigger ?? rules()[0]?.char
      if (signal?.aborted || !target || !char) {
        return unopened<TriggerMenuOpenChangeReason, never>(reason, event)
      }
      if (levels.caret() === null) {
        target.element?.focus()
      }
      // Types the trigger at the caret, unless a match for it is there already.
      if (levels.matchAtCaret()?.match.trigger !== char) {
        const at = levels.caret()
        if (at === null) {
          return unopened<TriggerMenuOpenChangeReason, never>(reason, event)
        }
        select.write({ start: at, end: at }, char)
      }
      if (!levels.reopen(reason, event)) {
        return unopened<TriggerMenuOpenChangeReason, never>(reason, event)
      }
      return control.result(signal) as Promise<
        PopupResult<TriggerMenuOpenChangeReason, never>
      >
    },
    close: ({
      reason = "imperative",
      event,
    }: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason> = {}) =>
      moving(() => levels.end(reason, event)),
    getQuery: () => store.get().query,
    getMatch() {
      const level = levels.current()
      return level
        ? {
            ...level.match,
            end: levels.caret() ?? level.match.end,
            query: store.get().query,
          }
        : null
    },
    insert(content: string | TokenInsert) {
      const at = levels.caret()
      if (at === null) {
        return
      }
      const level = levels.current()
      select.write({ start: level ? level.match.start : at, end: at }, content)
      if (level) {
        levels.end("item-press")
      }
    },
    focus: () => editor()?.element?.focus(),
    // Internal. Used by slots and adapters.
    internal: {
      options,
      listbox,
      popup,
      choose: select.choose,
      onKeyDown,
      fieldAttrs,
      itemCount: () => listbox.entries().length,
      announceState,
      settle: () => settle("input-change"),
      // The list is named like the field: by its labels, or its own aria-label.
      // Not by the field itself, whose name as a reference would be its text.
      listLabel() {
        const el = editor()?.element
        if (!el) {
          return {}
        }
        const labelledBy = el.getAttribute("aria-labelledby")
        if (labelledBy) {
          return { "aria-labelledby": labelledBy }
        }
        const labels = Array.from((el as HTMLTextAreaElement).labels ?? [])
        if (labels.length) {
          return {
            "aria-labelledby": labels
              .map((label, index) => (label.id ||= `${id}-label-${index}`))
              .join(" "),
          }
        }
        const label = el.getAttribute("aria-label")
        return label ? { "aria-label": label } : {}
      },
      // The list opens at the trigger, or at an argument's start, and stays there as the query grows.
      anchorRect() {
        const level = levels.current()
        if (!level) {
          return null
        }
        return (
          editor()?.rectAt(
            level.item || level.continued ? level.queryStart : level.match.start
          ) ?? null
        )
      },
      caretRect() {
        const at = levels.caret()
        return at === null ? null : (editor()?.rectAt(at) ?? null)
      },
      // TriggerMenuInput builds the editor for its field.
      setOwnEditor(
        next: TextEditorAdapter | undefined,
        field: "input" | "multiline" = "multiline"
      ) {
        ownEditor = next
        store.set({ field })
        follow()
      },
      keyOf: toKey,
      // While an empty part is rendered, no matches keeps the menu open.
      countEmptyPart(delta: 1 | -1) {
        empties += delta
        queueMicrotask(() => {
          const hasEmpty = empties > 0
          if (store.get().hasEmpty === hasEmpty) {
            return
          }
          store.set({ hasEmpty })
          if (!hasEmpty && store.get().open) {
            settle("input-change")
          }
        })
      },
      isEmpty: (state: TriggerMenuState) =>
        (options().status ?? state.loading) !== "loading" &&
        (!!state.items || state.settled) &&
        !listbox.entries().length,
      itemProps: (key: string) => context.props<ItemMeta>("item", key),
      contentProps: (key?: string) =>
        contentProps(key) as TriggerMenuContentProps,
    },
  }
}

const triggerMenuApi: (
  ...args: Parameters<typeof triggerMenuApiBody>
) => TriggerMenuApi = triggerMenuApiBody

/**
 * `triggerMenu`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface TriggerMenuApi extends ReturnType<typeof triggerMenuApiBody> {}

export {
  initialTriggerMenuState,
  syncTriggerMenuState,
  type TriggerMenuApi,
  triggerMenuApi,
  type TriggerMenuState,
}
