import {
  command as commandPrimitive,
  type CommandData,
  type CommandEmptyState,
  type CommandItemProps,
  type CommandItemState,
  type CommandItemTextState,
  type CommandListState,
  type CommandOptions,
  type CommandPageProps,
  type CommandState,
  type CommandShortcutState,
} from "@ui-sdk/core/command"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createUniqueId,
  For,
  merge,
  omit,
  onCleanup,
  Show,
  useContext,
  type ComponentProps,
} from "solid-js"
import { useControllerEntry } from "./controller-target"
import { markSegments, textToMark } from "./list-text"
import {
  createChildFlag,
  createParts,
  rootScope,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(commandPrimitive, {
  input: "input",
  "item-icon": "span",
  shortcut: "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  empty: "div",
  status: "div",
})

const CommandContext = createContext<PrimitiveHandle<
  typeof commandPrimitive
> | null>(null)
// The page parts sit on: `null` for the first page. Not provided outside any page.
const PageContext = createContext<{ page: string | null } | null>(null)
// Set while rendering data commands, whose shortcuts the root binds.
const DataContext = createContext(false)
// Where a CommandList among the command's children says it's there, so a
// data command renders its own list only when there's none.
const OwnListContext = createContext<((present: boolean) => void) | null>(null)

function useCommand() {
  const context = useContext(CommandContext)
  if (!context) {
    throw new Error("Command parts must be used inside <Command>.")
  }
  return context
}

// Element props that mean something else on a command part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Command`.
 * @stable
 */
type CommandProps = CommandOptions &
  Omit<PartProps<"div", CommandState>, Clashing> & {}

const optionKeys = [
  "value",
  "defaultValue",
  "onValueChange",
  "query",
  "defaultQuery",
  "onQueryChange",
  "pages",
  "defaultPages",
  "onPagesChange",
  "onAction",
  "pendingAnnouncement",
  "items",
  "emptyItems",
  "filter",
  "autoHighlight",
  "loop",
  "status",
  "onLoadMore",
  "announcement",
  "controller",
  "debug",
] as const

/**
 * A search field over an always-open list of commands. Renders a `div` around them.
 * @stable
 */
const Command = /* @__PURE__ */ rootScope(function Command(
  props: CommandProps
) {
  const command = usePrimitive(commandPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    query: props.query,
    defaultQuery: props.defaultQuery,
    onQueryChange: props.onQueryChange,
    pages: props.pages,
    defaultPages: props.defaultPages,
    onPagesChange: props.onPagesChange,
    onAction: props.onAction,
    pendingAnnouncement: props.pendingAnnouncement,
    items: props.items,
    emptyItems: props.emptyItems,
    filter: props.filter,
    autoHighlight: props.autoHighlight,
    loop: props.loop,
    status: props.status,
    onLoadMore: props.onLoadMore,
    announcement: props.announcement,
    controller: props.controller,
    debug: props.debug,
  }))
  useControllerEntry(() => props.controller, command)
  // Written by a CommandList among the children, while the children render.
  const [hasList, setHasList] = createChildFlag()
  const rest = merge(omit(props, ...optionKeys), {
    // The children are read once, inside the list registry, so a CommandList
    // among them finds it. A function of state renders on its own; otherwise
    // a data command renders its list, unless a CommandList is among them.
    // The list it renders itself stays out of the registry. A compiled child
    // is a function too, of no parameters, on the server (a lazy memo) and in
    // a client memo, so the arity tells them apart, as Solid's `Show` does.
    get children() {
      return (state: CommandState) => (
        <OwnListContext value={setHasList}>
          {(() => {
            const children = props.children
            if (typeof children === "function" && children.length > 0) {
              return (children as (state: CommandState) => JSX.Element)(state)
            }
            return (
              <>
                {children}
                <Show when={props.items && !hasList()}>
                  <OwnListContext value={null}>
                    <CommandList />
                  </OwnListContext>
                </Show>
              </>
            )
          })()}
        </OwnListContext>
      )
    },
  })
  return (
    <CommandContext value={command}>
      {usePart(command, "root", undefined, rest, "div")}
    </CommandContext>
  )
})

/**
 * The search field. It keeps focus while arrow keys move the highlight. Name it with `aria-label`.
 * @stable
 */
const CommandInput = parts.Input

/**
 * The listbox. Without children, it renders the command's `items`, ranked as the user types.
 * @stable
 */
function CommandList(props: PartProps<"div", CommandListState>) {
  const command = useCommand()
  const register = useContext(OwnListContext)
  register?.(true)
  onCleanup(() => register?.(false))
  const rest = merge(props, {
    get children() {
      return (
        props.children ??
        ((state: CommandListState) =>
          command.state.items ? <CommandItems items={state.items} /> : null)
      )
    },
  })
  return usePart(command, "list", undefined, rest, "div")
}

/**
 * A command. Pressing it, or Enter while it's highlighted, runs it, with its `value` passed to the command's
 * `onAction`.
 * @stable
 */
function CommandItem(
  props: Omit<PartProps<"div", CommandItemState>, Clashing> & CommandItemProps
) {
  const generated = createUniqueId()
  const group = useAround(commandPrimitive, "group")
  const inPage = useContext(PageContext)
  const data = useContext(DataContext)
  const key = () => props.value ?? generated
  const item = () => ({
    value: key(),
    label: props.label,
    keywords: props.keywords,
    disabled: props.disabled,
    shortcut: props.shortcut,
    page: props.page,
    index: props.index,
    onSelect: props.onSelect,
    group: group?.().id as string | undefined,
    inPage: inPage?.page,
    data,
  })
  const rest = omit(
    props,
    "value",
    "label",
    "keywords",
    "disabled",
    "shortcut",
    "page",
    "index",
    "onSelect"
  )
  return usePart(useCommand(), "item", item, rest, "div")
}

/**
 * The command's text, with the part the search matched in `<mark>`. Without string content, it shows the command's label.
 * @stable
 */
function CommandItemText(props: PartProps<"span", CommandItemTextState>) {
  const item = useAround(commandPrimitive, "item")
  if (!item) {
    throw new Error("<CommandItemText> must be used inside <CommandItem>.")
  }
  const key = () => item().value as string
  const part = () => ({
    id: key(),
    text: textToMark(props.children, (item().label as string) ?? key()),
  })
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: CommandItemTextState) => markSegments(state.segments)
    },
  })
  return usePart(useCommand(), "item-text", part, rest, "span")
}

/**
 * An icon inside a command. Screen readers, typeahead and filtering skip it, and `mirror` flips it
 * in right-to-left text.
 * @stable
 */
const CommandItemIcon = parts.ItemIcon

/**
 * The keys of a command's shortcut, formatted for the platform. Inside a command, its `shortcut`.
 * @stable
 */
function CommandShortcut(props: ComponentProps<typeof parts.Shortcut>) {
  return (
    <parts.Shortcut {...props}>
      {props.children ?? ((state: CommandShortcutState) => state.text)}
    </parts.Shortcut>
  )
}

/**
 * Commands shown while this page is on top. Without `value`, it's the first page. Renders no element.
 * @stable
 */
function CommandPage(props: CommandPageProps & { children?: JSX.Element }) {
  const command = useCommand()
  return (
    <Show when={command.present("page", () => ({ value: props.value }))}>
      <PageContext value={{ page: props.value ?? null }}>
        {props.children}
      </PageContext>
    </Show>
  )
}

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
function CommandEmpty(props: ComponentProps<typeof parts.Empty>) {
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: CommandEmptyState) => (state.empty ? children : null)
    },
  })
  return <parts.Empty {...rest} />
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const CommandStatus = parts.Status

/**
 * Renders data commands. Used by data command lists, and available for custom layouts.
 * @stable
 */
function CommandItems(props: { items: CommandData }) {
  return (
    <DataContext value={true}>
      <For each={props.items}>
        {(entry) => {
          if (typeof entry === "string") {
            return <CommandItem value={entry}>{entry}</CommandItem>
          }
          if ("type" in entry && entry.type === "separator") {
            return <CommandSeparator />
          }
          if ("type" in entry && entry.type === "group") {
            return (
              <CommandGroup>
                {entry.label && (
                  <CommandGroupLabel>{entry.label}</CommandGroupLabel>
                )}
                <CommandItems items={entry.items} />
              </CommandGroup>
            )
          }
          return (
            <CommandItem
              value={entry.value}
              label={entry.label}
              keywords={entry.keywords}
              disabled={entry.disabled}
              shortcut={entry.shortcut}
            >
              {entry.label}
            </CommandItem>
          )
        }}
      </For>
    </DataContext>
  )
}

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
  type CommandProps,
  CommandSeparator,
  CommandShortcut,
  CommandStatus,
}
