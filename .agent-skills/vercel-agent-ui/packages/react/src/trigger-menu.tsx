import {
  triggerMenu as triggerMenuPrimitive,
  type TriggerMenuContentProps,
  type TriggerMenuContentState,
  type TriggerMenuData,
  type TriggerMenuEmptyState,
  type TriggerMenuHintState,
  type TriggerMenuItemProps,
  type TriggerMenuItemState,
  type TriggerMenuOptions,
  type TriggerMenuStatusState,
} from "@ui-sdk/core/trigger-menu"
import * as React from "react"
import { hasChild, Placed, usePlaceContent, usePlacedContent } from "./children"
import { EditorContext } from "./editor-context"
import {
  renderPopup,
  useControllerEntry,
  useOwnContainer,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  HandleScope,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(triggerMenuPrimitive, {
  input: "textarea",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

const ContainerContext = React.createContext<PopupContainer>(undefined)

function useTriggerMenu() {
  return useHandle(triggerMenuPrimitive)
}

type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `TriggerMenu`.
 * @stable
 */
type TriggerMenuProps<T = string> = TriggerMenuOptions<T> & {
  children?: React.ReactNode
}

/**
 * Suggestions opened by a trigger like `@` or `/` in text. Inside a TokenInput
 * it uses that editor; otherwise render a TriggerMenuInput, or pass `editor`.
 * @stable
 */
function TriggerMenu<T = string>({
  children,
  container,
  editor,
  ...options
}: TriggerMenuProps<T>) {
  const inherited = React.useContext(EditorContext)
  const menu = usePrimitive(triggerMenuPrimitive, {
    ...(options as TriggerMenuOptions<any>),
    editor: editor ?? inherited,
  })
  useControllerEntry(options.controller, menu)
  // A data menu renders its list, unless the app placed a TriggerMenuContent:
  // in the markup, or inside a component of its own.
  const found = hasChild(children, TriggerMenuContent)
  const [placed, place] = usePlacedContent(!found)
  const own = placed || found
  return (
    <HandleScope handle={menu}>
      <ContainerContext.Provider value={container}>
        <Placed value={place}>{children}</Placed>
        <Placed value={null}>{!own && <TriggerMenuContent />}</Placed>
      </ContainerContext.Provider>
    </HandleScope>
  )
}

/**
 * The text field the menu suggests into: a `<textarea>`, or an `<input>` through `render`.
 * @stable
 */
const TriggerMenuInput = parts.Input

/**
 * The popup that holds the suggestions, anchored at the caret.
 * @stable
 */
function TriggerMenuContent({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  keepMounted,
  container,
  children,
  ...props
}: PartProps<"div", TriggerMenuContentState> & TriggerMenuContentProps) {
  usePlaceContent()
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    keepMounted,
  }
  const body = children ?? <TriggerMenuList />
  const element = usePart(triggerMenuPrimitive, "content", content, {
    ...props,
    children: body,
  })
  return element && renderPopup(element, target)
}

/**
 * The listbox. Without children, it renders the current trigger's items, filtered.
 * @stable
 */
function TriggerMenuList({
  children = listItems,
  ...props
}: PartProps<"div", TriggerMenuContentState>) {
  return usePart(triggerMenuPrimitive, "list", {}, { ...props, children })
}

const listItems = (state: TriggerMenuContentState) => (
  <TriggerMenuItems items={state.items} />
)

/**
 * A suggestion. Choosing it inserts it into the text.
 * @stable
 */
const TriggerMenuItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", TriggerMenuItemState>, Clashing> &
    TriggerMenuItemProps<T>
) => React.ReactNode

/**
 * An icon inside a suggestion. Screen readers, typeahead and filtering skip it, and `mirror` flips
 * it in right-to-left text.
 * @stable
 */
const TriggerMenuItemIcon = parts.ItemIcon

/**
 * A group of items, named by its `TriggerMenuGroupLabel`.
 * @stable
 */
const TriggerMenuGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const TriggerMenuGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const TriggerMenuSeparator = parts.Separator

/**
 * Shown while no item matches. Rendering it keeps the menu open with no matches; without it, the menu closes until something matches.
 * @stable
 */
function TriggerMenuEmpty({
  children,
  ...props
}: PartProps<"div", TriggerMenuEmptyState>) {
  const content = (state: TriggerMenuEmptyState) =>
    typeof children === "function"
      ? children(state)
      : state.empty
        ? children
        : null
  return usePart(
    triggerMenuPrimitive,
    "empty",
    {},
    { ...props, children: content }
  )
}

/**
 * A polite status, outside the popup. Without children, it says the count and the keys once typing pauses.
 * @stable
 */
function TriggerMenuStatus(props: PartProps<"div", TriggerMenuStatusState>) {
  return usePart(
    triggerMenuPrimitive,
    "status",
    { text: props.children === undefined },
    props
  )
}

/**
 * Ghost text at the caret for the arguments still to type, like `<name>`. Without children, the hints.
 * @stable
 */
function TriggerMenuHint(props: PartProps<"span", TriggerMenuHintState>) {
  return usePart(
    triggerMenuPrimitive,
    "hint",
    { text: props.children === undefined },
    props,
    "span"
  )
}

/**
 * Renders data items. Used by data menus, and available for custom layouts.
 * @stable
 */
function TriggerMenuItems({ items }: { items: TriggerMenuData<any> }) {
  const menu = useTriggerMenu()
  return (
    <ListItems
      items={items}
      parts={listParts}
      keyOf={menu.api.internal.keyOf}
    />
  )
}

const listParts: ListParts = {
  Item: TriggerMenuItem,
  Group: TriggerMenuGroup,
  GroupLabel: TriggerMenuGroupLabel,
  Separator: TriggerMenuSeparator,
}

export {
  createTriggerMenuController,
  textFieldAdapter,
} from "@ui-sdk/core/trigger-menu"
export type {
  EditorChange,
  EditorReplaceOptions,
  ListFilter,
  ListItem,
  ListSeparator,
  TextEditorAdapter,
  TextRange,
  TextRect,
  Token,
  TokenInsert,
  TriggerAfter,
  TriggerArgument,
  TriggerBoundary,
  TriggerDefinition,
  TriggerItemsLoader,
  TriggerMatch,
  TriggerMenuApi,
  TriggerMenuChangeOptions,
  TriggerMenuContentProps,
  TriggerMenuContentState,
  TriggerMenuController,
  TriggerMenuData,
  TriggerMenuDataGroup,
  TriggerMenuDataItem,
  TriggerMenuDismissReason,
  TriggerMenuEmptyState,
  TriggerMenuHintState,
  TriggerMenuInputState,
  TriggerMenuItemIconProps,
  TriggerMenuItemIconState,
  TriggerMenuItemProps,
  TriggerMenuItemState,
  TriggerMenuOpenChangeReason,
  TriggerMenuOptions,
  TriggerMenuPrimitive,
  TriggerMenuQueryChangeReason,
  TriggerMenuSelectDetails,
  TriggerMenuStatusState,
  TriggerRule,
} from "@ui-sdk/core/trigger-menu"

export {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuHint,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuItems,
  TriggerMenuList,
  type TriggerMenuProps,
  TriggerMenuSeparator,
  TriggerMenuStatus,
}
