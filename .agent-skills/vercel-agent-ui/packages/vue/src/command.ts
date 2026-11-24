import type { ChangeDetails } from "@ui-sdk/core"
import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
import {
  command as commandPrimitive,
  type CommandActionDetails,
  type CommandController,
  type CommandData,
  type CommandPagesChangeReason,
  type CommandQueryChangeReason,
  type CommandValueChangeDetails,
  type ListAnnouncement,
  type SearchFilter,
} from "@ui-sdk/core/command"
import {
  defineComponent,
  Fragment,
  h,
  inject,
  provide,
  useId,
  type InjectionKey,
  type PropType,
  type VNode,
} from "vue"
import {
  hasChild,
  NotPlaced,
  slotContent,
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { useControllerEntry } from "./controller-target"
import { markSegments, slotText } from "./list-text"
import { createParts, withElement } from "./create-parts"
import {
  defaultSlot,
  optionalBoolean,
  orModel,
  provideProps,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"

// The page parts sit on: `null` for the first page. Not provided outside any page.
const PageKey: InjectionKey<string | null> = Symbol("command-page")
// Provided while rendering data commands, whose shortcuts the root binds.
const DataKey: InjectionKey<boolean> = Symbol("command-data")

type QueryDetails = ChangeDetails<CommandQueryChangeReason>
type PagesDetails = ChangeDetails<CommandPagesChangeReason>

const useCommand = () => useHandle(commandPrimitive)

// The command a part is inside: its key, label and shortcut.
const useItem = () =>
  useScope(commandPrimitive)?.around.item as
    (() => { value: string; label?: string; shortcut?: string }) | undefined

const parts = createParts(commandPrimitive, {
  input: "input",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
})

/**
 * A search field over an always-open list of commands. Renders a `div` around them.
 * @stable
 */
const Command = withElement(
  "div",
  defineComponent({
    name: "Command",
    inheritAttrs: false,
    props: {
      value: {
        type: null as unknown as PropType<string | null>,
        default: undefined,
      },
      modelValue: {
        type: null as unknown as PropType<string | null>,
        default: undefined,
      },
      defaultValue: {
        type: null as unknown as PropType<string | null>,
        default: undefined,
      },
      query: { type: String, default: undefined },
      defaultQuery: { type: String, default: undefined },
      pages: { type: Array as PropType<string[]>, default: undefined },
      defaultPages: { type: Array as PropType<string[]>, default: undefined },
      pendingAnnouncement: String,
      // A function prop beside the emit, so a returned Promise marks the command pending.
      onAction: Function as PropType<
        (value: string, details: CommandActionDetails) => unknown
      >,
      items: Array as PropType<CommandData>,
      emptyItems: Array as PropType<CommandData>,
      filter: {
        type: [String, Boolean, Function] as PropType<SearchFilter<string>>,
        default: undefined,
      },
      announcement: Function as PropType<
        (change: ListAnnouncement) => string | null | undefined
      >,
      autoHighlight: optionalBoolean,
      loop: optionalBoolean,
      status: String as PropType<AsyncOptionsStatus>,
      controller: Object as PropType<CommandController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string | null) => true,
      "update:modelValue": (_value: string | null) => true,
      valueChange: (
        _value: string | null,
        _details: CommandValueChangeDetails
      ) => true,
      "update:query": (_query: string) => true,
      queryChange: (_query: string, _details: QueryDetails) => true,
      "update:pages": (_pages: string[]) => true,
      pagesChange: (_pages: string[], _details: PagesDetails) => true,
      loadMore: () => true,
    },
    slots: Object as PartSlots<typeof commandPrimitive, "root">,
    setup(props, { slots, emit }) {
      const command = usePrimitive(commandPrimitive, () => ({
        ...props,
        value: orModel(props.value, props.modelValue),
        onValueChange: (
          value: string | null,
          details: CommandValueChangeDetails
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onQueryChange: (query: string, details: QueryDetails) => {
          emit("queryChange", query, details)
          if (!details.canceled) {
            emit("update:query", query)
          }
        },
        onPagesChange: (pages: string[], details: PagesDetails) => {
          emit("pagesChange", pages, details)
          if (!details.canceled) {
            emit("update:pages", pages)
          }
        },
        onLoadMore: () => emit("loadMore"),
      }))
      useControllerEntry(() => props.controller, command)
      const placed = usePlacedContent()
      return usePart(command, "root", undefined, undefined, {
        tag: "div",
        children: (state) => {
          const children = slots.default?.({ state }) ?? []
          // A data command renders its list, unless the app placed a CommandList:
          // in the markup, or inside a component of its own.
          // Only a data one asks, so a composed one never renders again when its content mounts.
          const own =
            !props.items || placed() || hasChild(children, CommandList)
          return [
            children,
            props.items && !own && h(NotPlaced, () => h(CommandList)),
          ]
        },
      })
    },
  })
)

/**
 * The search field. It keeps focus while arrow keys move the highlight. Name it with `aria-label`.
 * @stable
 */
const CommandInput = parts.Input

/**
 * The listbox. Without content, it renders the command's `items`, ranked as the user types.
 * @stable
 */
const CommandList = withElement(
  "div",
  defineComponent({
    name: "CommandList",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof commandPrimitive, "list">,
    setup(_, { slots }) {
      usePlaceContent()
      const command = useCommand()
      return usePart(command, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          defaultSlot(
            slots,
            state,
            () => command.state.items && h(CommandItems, { items: state.items })
          ),
      })
    },
  })
)

/**
 * A command. Pressing it, or Enter while it's highlighted, runs it, with its `value` passed to the command's
 * `@action`.
 * @stable
 */
const CommandItem = withElement(
  "div",
  defineComponent({
    name: "CommandItem",
    inheritAttrs: false,
    props: {
      value: String,
      label: String,
      keywords: Array as PropType<string[]>,
      disabled: optionalBoolean,
      shortcut: String,
      page: String,
      index: Number,
      // A function prop beside the emit, so a returned Promise marks the command pending.
      onSelect: Function as PropType<(event: Event) => unknown>,
    },
    slots: Object as PartSlots<typeof commandPrimitive, "item">,
    setup(props) {
      const generated = useId()
      const group = useScope(commandPrimitive)?.around.group?.().id as
        string | undefined
      const inPage = inject(PageKey, undefined)
      const data = inject(DataKey, false)
      provideProps(commandPrimitive, "item", () => ({
        value: props.value ?? generated,
        label: props.label ?? props.value,
        shortcut: props.shortcut,
      }))
      const item = () => {
        const key = props.value ?? generated
        return {
          id: key,
          value: key,
          label: props.label,
          keywords: props.keywords,
          disabled: props.disabled,
          shortcut: props.shortcut,
          page: props.page,
          index: props.index,
          onSelect: props.onSelect,
          group,
          inPage,
          data,
        }
      }
      return usePart(commandPrimitive, "item", item)
    },
  })
)

/**
 * The command's text, with the part the search matched in `<mark>`. Without text content, it shows the command's label.
 * @stable
 */
const CommandItemText = withElement(
  "span",
  defineComponent({
    name: "CommandItemText",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof commandPrimitive, "item-text">,
    setup(_, { slots }) {
      const item = useItem()
      if (!item) {
        throw new Error("<CommandItemText> must be used inside <CommandItem>.")
      }
      // The text it marks, read from its content as it renders.
      let text = ""
      let own: VNode[] | undefined
      let ownText: string | undefined
      const part = usePart(
        commandPrimitive,
        "item-text",
        () => ({ id: item().value, text }),
        undefined,
        {
          tag: "span",
          children: (state) =>
            own && ownText === undefined ? own : markSegments(state.segments),
        }
      )
      return () => {
        own = slotContent(slots.default, { state: part.state })
        ownText = slotText(own)
        text = ownText ?? item().label ?? ""
        return part()
      }
    },
  })
)

/**
 * The keys of a command's shortcut, formatted for the platform. Inside a command, its `shortcut`.
 * @stable
 */
const CommandShortcut = withElement(
  "span",
  defineComponent({
    name: "CommandShortcut",
    inheritAttrs: false,
    props: { shortcut: String },
    slots: Object as PartSlots<typeof commandPrimitive, "shortcut">,
    setup(props, { slots }) {
      const item = useItem()
      const part = () => ({ shortcut: props.shortcut ?? item?.().shortcut })
      return usePart(commandPrimitive, "shortcut", part, undefined, {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.text,
      })
    },
  })
)

/**
 * Commands shown while this page is on top. Without `value`, it's the first page. Renders no element.
 * @stable
 */
const CommandPage = /* @__PURE__ */ renderless(
  defineComponent({
    name: "CommandPage",
    props: { value: String },
    setup(props, { slots }) {
      const command = useCommand()
      provide(PageKey, props.value ?? null)
      return () =>
        command.present("page", { value: props.value })
          ? slots.default?.()
          : null
    },
  })
)

/**
 * An icon inside a command. Screen readers, typeahead and filtering
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const CommandItemIcon = parts.ItemIcon

/**
 * A group of commands. It hides while none of its commands matches the search.
 * @stable
 */
const CommandGroup = parts.Group

/**
 * A group's heading, which names it.
 * @stable
 */
const CommandGroupLabel = parts.GroupLabel

/**
 * A line between groups. Composed separators hide while the list is filtered.
 * @stable
 */
const CommandSeparator = parts.Separator

/**
 * Shown while no command matches. Its message is announced when it appears. Place it outside the list.
 * @stable
 */
const CommandEmpty = withElement(
  "div",
  defineComponent({
    name: "CommandEmpty",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof commandPrimitive, "empty">,
    setup(_, { slots }) {
      return usePart(commandPrimitive, "empty", undefined, undefined, {
        tag: "div",
        children: (state) => (state.empty ? slots.default?.({ state }) : null),
      })
    },
  })
)

/**
 * A polite live region for loading and result counts. Its content is yours, from the default slot's state.
 * @stable
 */
const CommandStatus = parts.Status

/**
 * Renders data commands. Used by data command lists, and available for custom layouts.
 * @stable
 */
const CommandItems = /* @__PURE__ */ renderless(
  defineComponent({
    name: "CommandItems",
    props: {
      items: { type: Array as PropType<CommandData>, required: true },
    },
    setup(props) {
      provide(DataKey, true)
      // check-code: allow return-type recursive, so TypeScript cannot infer it.
      const render = (items: CommandData): VNode[] =>
        items.map((entry, index) => {
          if (typeof entry === "string") {
            return h(CommandItem, { key: entry, value: entry }, () => entry)
          }
          if ("type" in entry && entry.type === "separator") {
            return h(CommandSeparator, { key: `separator-${index}` })
          }
          if ("type" in entry && entry.type === "group") {
            return h(
              CommandGroup,
              { key: `group-${entry.label ?? index}` },
              () => [
                entry.label && h(CommandGroupLabel, null, () => entry.label),
                ...render(entry.items),
              ]
            )
          }
          return h(
            CommandItem,
            {
              key: entry.value,
              value: entry.value,
              label: entry.label,
              keywords: entry.keywords,
              disabled: entry.disabled,
              shortcut: entry.shortcut,
            },
            () => entry.label
          )
        })
      return () => h(Fragment, render(props.items))
    },
  })
)

export { createCommandController } from "@ui-sdk/core/command"
export type {
  CommandActionDetails,
  CommandApi,
  CommandChangeOptions,
  CommandController,
  CommandData,
  CommandDataGroup,
  CommandDataItem,
  CommandEmptyState,
  CommandInputState,
  CommandItemIconProps,
  CommandItemIconState,
  CommandItemProps,
  CommandItemState,
  CommandItemTextState,
  CommandListState,
  CommandOptions,
  CommandPageProps,
  CommandPagesChangeReason,
  CommandPrimitive,
  CommandQueryChangeReason,
  CommandState,
  CommandShortcutProps,
  CommandShortcutState,
  CommandStatusState,
  CommandValueChangeDetails,
  CommandValueChangeReason,
  ListAnnouncement,
  ListFilter,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/command"

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandItems,
  CommandItemText,
  CommandList,
  CommandPage,
  CommandSeparator,
  CommandShortcut,
  CommandStatus,
}
