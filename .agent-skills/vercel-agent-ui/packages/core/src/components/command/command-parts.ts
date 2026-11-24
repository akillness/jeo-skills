// Command's parts and the attributes they carry.
import { dev } from "#dev"
import type {
  CommandData,
  CommandInputState,
  CommandItemState,
  CommandItemTextState,
  CommandListState,
  CommandPageProps,
  CommandState,
  CommandShortcutProps,
  CommandShortcutState,
} from "./command"
import { fieldPart, optionPart } from "../../foundation/lists/autocomplete-core"
import {
  currentPage,
  type CommandApi,
  type CommandItemMeta,
  type CommandStore,
} from "./command-api"
import {
  ariaKeyshortcuts,
  formatShortcut,
} from "../../foundation/platform/platform"
import { pressKeepsFocus } from "../../foundation/focus/press-keeps-focus"
import {
  emptyPart,
  groupLabelPart,
  optionGroupPart,
  optionSeparatorPart,
  statusPart,
  warnIfUnnamed,
} from "../../foundation/lists/listbox-parts"
import { itemIconPart, optionIcon } from "../../foundation/lists/item-icon"
import { listName } from "../../foundation/lists/field-name"
import {
  itemTextPart,
  type ListItemTextProps,
} from "../../foundation/lists/listbox-search"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import { selects } from "../../foundation/kernel/selects"
import { onProps } from "../../foundation/kernel/part"

// The data list a part shows while there are none, one array so its identity never changes.
const noCommands: CommandData = []

function itemState(state: CommandStore, key: string, props: CommandItemMeta) {
  return {
    highlighted: state.highlighted === key,
    disabled: !!props.disabled,
    pending: state.pending.includes(key),
    error: state.error?.key === key ? state.error.reason : undefined,
  }
}

// A command shows the highlight, whether it's running or failed, the page it's
// on, the platform's shortcut names, and its own entry in the listing, which
// covers the query. Every other key is named here, so a key the state gains
// later is a type error until someone decides whether commands read it.
const unreadByItems = {
  open: [],
  value: [],
  query: [],
  queries: [],
  items: [],
  status: [],
  mounts: [],
  settled: [],
  groupLabels: [],
  fieldName: [],
} satisfies Record<
  Exclude<
    keyof CommandStore,
    | "highlighted"
    | "listing"
    | "pending"
    | "error"
    | "pages"
    | "apple"
    | "focusInList"
  >,
  readonly never[]
>

const field = fieldPart<CommandStore, CommandApi>()
const option = optionPart<CommandStore, CommandApi>()

const commandSlots = (slot: SlotFactory<CommandStore, CommandApi>) => ({
  // The element around the field and the list.
  root: slot<{}, CommandState>({
    state: (state) => ({
      page: currentPage(state),
      loading: state.status === "loading",
    }),
    attrs: (state) => ({
      "data-loading": state.status === "loading" ? "" : undefined,
    }),
    bind(el, { api }) {
      api.internal.syncPlatform()
      return api.internal.bindDataShortcuts(el)
    },
  }),

  // The search field. It keeps focus while arrow keys move the highlight.
  input: slot<{}, CommandInputState>({
    ...field,
    keys: [...field.keys, "Enter", "Escape", "Backspace"],
    state: (state) => ({ page: currentPage(state) }),
    attrs: (state, context) => ({
      ...field.attrs(state, context),
      type: "text",
      "aria-autocomplete": "list",
      "aria-controls": `${context.id}-list`,
    }),
    bind(el, context) {
      if (dev) {
        warnIfUnnamed(
          el,
          "The search field has no accessible name. Add an aria-label or a label.",
          {
            component: "command",
            id: context.id,
          }
        )
      }
      return field.bind(el, context)
    },
  }),

  list: slot<{}, CommandListState>({
    role: "listbox",
    keys: {
      none: "The search field handles them, and keeps focus while they move the highlight.",
    },
    state: (state, { api }) => ({
      status: state.status,
      items:
        (api.internal.listbox.visibleData()?.list as CommandData | undefined) ??
        noCommands,
    }),
    attrs: (state, { id }) => ({
      id: `${id}-list`,
      ...listName(state, id),
      "aria-busy": state.status === "loading" ? "true" : undefined,
    }),
    on: pressKeepsFocus,
    bind(el, { api, store }) {
      // Commands bind in the same commit as the list. A microtask later, an empty list is really empty.
      let active = true
      queueMicrotask(() => active && store.set({ settled: true }))
      api.internal.syncPlatform()
      const unloading = api.internal.loadMore.bind(el)
      return () => {
        active = false
        unloading()
        store.set({ settled: false })
      }
    },
  }),

  item: slot<CommandItemMeta, CommandItemState>({
    ...option,
    // A command without a value gets one made. `onSelect`'s Promise makes it pending.
    props: {
      value: "id",
      label: "string",
      keywords: "list",
      disabled: "boolean",
      shortcut: "string",
      page: "string",
      index: "number",
      onSelect: "action",
      // Internal: passed by renderers, from the group and page it's inside, and whether data rendered it.
      group: { kind: "string", from: "group.id" },
      inPage: { kind: "string", from: "page.value" },
      data: "boolean",
    },
    selects: selects({
      highlighted: ({ key }) => [key],
      listing: ({ key }) => [key],
      pending: ({ key }) => [key],
      ...unreadByItems,
    }),
    present: (state, { props, api }) =>
      api.internal.onCurrentPage(state, props.inPage),
    state: (state, { key, props }) => itemState(state, key, props),
    attrs: (state, context) => {
      const { key, props } = context
      const pending = state.pending.includes(key)
      const attrs = option.attrs(state, context)
      return {
        ...attrs,
        "aria-disabled": pending ? "true" : attrs["aria-disabled"],
        "aria-busy": pending ? "true" : undefined,
        "aria-keyshortcuts": props.shortcut
          ? ariaKeyshortcuts(props.shortcut, state.apple)
          : undefined,
        "data-pending": pending ? "" : undefined,
      }
    },
    bind(el, context) {
      const unregister = option.bind(el, context)
      const unbindShortcut = context.api.internal.bindItemShortcut(
        el,
        context.key,
        (listener) => onProps(context, listener)
      )
      return () => {
        unregister()
        unbindShortcut()
      }
    },
  }),

  // The command's text, with what the search matched in `<mark>`.
  "item-text": slot<ListItemTextProps, CommandItemTextState>(
    itemTextPart<CommandStore, CommandApi>()
  ),

  // An icon inside a command.
  "item-icon": slot(
    itemIconPart<CommandStore, CommandApi>({
      component: "command",
      ...optionIcon,
    })
  ),

  group: slot(optionGroupPart<CommandStore, CommandApi>()),

  "group-label": slot(groupLabelPart<CommandStore, CommandApi>()),

  separator: slot(optionSeparatorPart<CommandStore, CommandApi>()),

  empty: slot(emptyPart<CommandStore, CommandApi>()),

  status: slot(statusPart<CommandStore, CommandApi>()),

  // A page of commands, shown while it's on top of the stack. It renders no
  // element of its own, except on web components, where it wraps its commands.
  page: slot<CommandPageProps>({
    props: { value: "string" },
    present: (state, { props }) => (props.value ?? null) === currentPage(state),
    role: "none",
  }),

  // The keys of a command's shortcut, for people to see. Screen readers hear aria-keyshortcuts instead.
  shortcut: slot<CommandShortcutProps, CommandShortcutState>({
    // Inside a command, its shortcut.
    props: { shortcut: { kind: "string", from: "item" } },
    state: (state, { props }) => ({
      text: props.shortcut ? formatShortcut(props.shortcut, state.apple) : "",
    }),
    attrs: () => ({ "aria-hidden": "true", translate: "no" }),
    bind(el, { store, api, props }) {
      // An empty element shows the keys itself, like a web component without children.
      if (el.childNodes.length) {
        return
      }
      const write = () => {
        const shortcut = props.shortcut ?? api.internal.shortcutOf(el)
        el.textContent = shortcut
          ? formatShortcut(shortcut, store.get().apple)
          : ""
      }
      write()
      const off = store.subscribe(write)
      return () => {
        off()
        el.textContent = ""
      }
    },
  }),
})

export { commandSlots }
