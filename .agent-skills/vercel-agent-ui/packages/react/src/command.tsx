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
  type CommandShortcutProps,
  type CommandShortcutState,
} from "@ui-sdk/core/command"
import * as React from "react"
import { hasChild, Placed, usePlaceContent, usePlacedContent } from "./children"
import { useControllerEntry } from "./controller-target"
import { markSegments, textToMark } from "./list-text"
import {
  createParts,
  useAround,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(commandPrimitive, {
  input: "input",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
})

// The page parts sit on: `null` for the first page, undefined outside any page.
const PageContext = React.createContext<string | null | undefined>(undefined)
// Set while rendering data commands, whose shortcuts the root binds.
const DataContext = React.createContext(false)

function useCommand() {
  return useHandle(commandPrimitive)
}

type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Command`.
 * @stable
 */
type CommandProps = CommandOptions &
  Omit<PartProps<"div", CommandState>, Clashing>

/**
 * A search field over an always-open list of commands. Renders a `div` around them.
 * @stable
 */
function Command({
  value,
  defaultValue,
  onValueChange,
  query,
  defaultQuery,
  onQueryChange,
  pages,
  defaultPages,
  onPagesChange,
  onAction,
  pendingAnnouncement,
  items,
  emptyItems,
  filter,
  autoHighlight,
  loop,
  status,
  onLoadMore,
  announcement,
  controller,
  debug,
  children,
  ...props
}: CommandProps) {
  const command = usePrimitive(commandPrimitive, {
    value,
    defaultValue,
    onValueChange,
    query,
    defaultQuery,
    onQueryChange,
    pages,
    defaultPages,
    onPagesChange,
    onAction,
    pendingAnnouncement,
    items,
    emptyItems,
    filter,
    autoHighlight,
    loop,
    status,
    onLoadMore,
    announcement,
    controller,
    debug,
  })
  useControllerEntry(controller, command)
  // A data command renders its list, unless the app placed a CommandList: in
  // the markup, or inside a component of its own.
  const found =
    typeof children !== "function" && hasChild(children, CommandList)
  const [placed, place] = usePlacedContent(
    typeof children !== "function" && !!items && !found
  )
  const own = placed || found
  const content = (state: CommandState) =>
    typeof children === "function" ? (
      <Placed value={place}>{children(state)}</Placed>
    ) : (
      <>
        <Placed value={place}>{children}</Placed>
        <Placed value={null}>{items && !own && <CommandList />}</Placed>
      </>
    )
  return usePart(command, "root", {}, { ...props, children: content })
}

/**
 * The search field. It keeps focus while arrow keys move the highlight. Name it with `aria-label`.
 * @stable
 */
const CommandInput = parts.Input

/**
 * The listbox. Without children, it renders the command's `items`, ranked as the user types.
 * @stable
 */
function CommandList({
  children,
  ...props
}: PartProps<"div", CommandListState>) {
  usePlaceContent()
  const command = useCommand()
  const content = (state: CommandListState) =>
    typeof children === "function"
      ? children(state)
      : (children ??
        (command.state.items ? <CommandItems items={state.items} /> : null))
  return usePart(command, "list", {}, { ...props, children: content })
}

/**
 * A command. Pressing it, or Enter while it's highlighted, runs it, with its `value` passed to the command's
 * `onAction`.
 * @stable
 */
function CommandItem({
  value,
  label,
  keywords,
  disabled,
  shortcut,
  page,
  index,
  onSelect,
  render,
  ...props
}: Omit<PartProps<"div", CommandItemState>, Clashing> & CommandItemProps) {
  const command = useCommand()
  const generated = React.useId()
  const group = useAround(commandPrimitive, "group")?.id as string | undefined
  const inPage = React.useContext(PageContext)
  const data = React.useContext(DataContext)
  const key = value ?? generated
  const item = {
    id: key,
    value: key,
    label,
    keywords,
    disabled,
    shortcut,
    page,
    index,
    onSelect,
    group,
    inPage,
    data,
  }
  // The parts inside read its key, label and shortcut.
  return usePart(command, "item", item, { ...props, render })
}

/**
 * The command's text, with the part the search matched in `<mark>`. Without string content, it shows the command's label.
 * @stable
 */
function CommandItemText({
  children,
  ...props
}: PartProps<"span", CommandItemTextState>) {
  const item = useAround(commandPrimitive, "item")
  if (!item) {
    throw new Error("<CommandItemText> must be used inside <CommandItem>.")
  }
  const label = (item.label as string | undefined) ?? (item.value as string)
  const part = { id: item.value as string, text: textToMark(children, label) }
  const content =
    typeof children === "function"
      ? children
      : (state: CommandItemTextState) => markSegments(state.segments)
  return usePart(
    commandPrimitive,
    "item-text",
    part,
    { ...props, children: content },
    "span"
  )
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
function CommandShortcut({
  shortcut,
  children = text,
  ...props
}: PartProps<"span", CommandShortcutState> & CommandShortcutProps) {
  const inherited = useAround(commandPrimitive, "item")?.shortcut as
    string | undefined
  return usePart(
    commandPrimitive,
    "shortcut",
    { shortcut: shortcut ?? inherited },
    { ...props, children },
    "span"
  )
}

const text = (state: CommandShortcutState) => state.text

/**
 * Commands shown while this page is on top. Without `value`, it's the first page. Renders no element.
 * @stable
 */
function CommandPage({
  value,
  children,
}: CommandPageProps & { children?: React.ReactNode }) {
  // Its presence, without an element.
  const page = () => (
    <PageContext.Provider value={value ?? null}>
      {children}
    </PageContext.Provider>
  )
  return usePart(commandPrimitive, "page", { value }, { render: page })
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
function CommandEmpty({
  children,
  ...props
}: PartProps<"div", CommandEmptyState>) {
  const content = (state: CommandEmptyState) =>
    typeof children === "function"
      ? children(state)
      : state.empty
        ? children
        : null
  return usePart(commandPrimitive, "empty", {}, { ...props, children: content })
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
function CommandItems({ items }: { items: CommandData }) {
  return (
    <DataContext.Provider value={true}>
      {items.map((entry, index) => {
        if (typeof entry === "string") {
          return (
            <CommandItem key={entry} value={entry}>
              {entry}
            </CommandItem>
          )
        }
        if ("type" in entry && entry.type === "separator") {
          return <CommandSeparator key={`separator-${index}`} />
        }
        if ("type" in entry && entry.type === "group") {
          return (
            <CommandGroup key={`group-${entry.label ?? index}`}>
              {entry.label && (
                <CommandGroupLabel>{entry.label}</CommandGroupLabel>
              )}
              <CommandItems items={entry.items} />
            </CommandGroup>
          )
        }
        return (
          <CommandItem
            key={entry.value}
            value={entry.value}
            label={entry.label}
            keywords={entry.keywords}
            disabled={entry.disabled}
            shortcut={entry.shortcut}
          >
            {entry.label}
          </CommandItem>
        )
      })}
    </DataContext.Provider>
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
