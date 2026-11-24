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
import type { JSX } from "@solidjs/web"
import {
  createContext,
  merge,
  omit,
  onCleanup,
  Show,
  useContext,
} from "solid-js"
import { EditorContext } from "./editor-context"
import {
  renderPopup,
  useControllerEntry,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  ownChildren,
  providePrimitive,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type TriggerMenuContextValue = PrimitiveHandle<typeof triggerMenuPrimitive>

const parts = createParts(triggerMenuPrimitive, {
  input: "textarea",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

const TriggerMenuContext = createContext<TriggerMenuContextValue | null>(null)
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// Where a TriggerMenuContent among the menu's children says it's there, so
// the menu renders its own content only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null
)

function useTriggerMenu() {
  const context = useContext(TriggerMenuContext)
  if (!context) {
    throw new Error("TriggerMenu parts must be used inside <TriggerMenu>.")
  }
  return context
}

// Element props that mean something else on a trigger menu part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `TriggerMenu`.
 * @stable
 */
type TriggerMenuProps<T = string> = TriggerMenuOptions<T> & {
  children?: JSX.Element
}

/**
 * Suggestions opened by a trigger like `@` or `/` in text. Inside a TokenInput
 * it uses that editor; otherwise render a TriggerMenuInput, or pass `editor`.
 * @stable
 */
const TriggerMenu = /* @__PURE__ */ rootScope(function TriggerMenu<T = string>(
  props: TriggerMenuProps<T>
) {
  const inherited = useContext(EditorContext)
  const options = omit(props, "children", "container", "editor")
  const menu = usePrimitive(triggerMenuPrimitive, () => ({
    ...(options as TriggerMenuOptions<any>),
    editor: props.editor ?? inherited(),
  }))
  useControllerEntry(() => props.controller, menu)
  return (
    <TriggerMenuContext value={menu}>
      <ContainerContext value={() => props.container}>
        {providePrimitive(menu, () => {
          const [own, hasContent] = ownChildren((register) => (
            <OwnContentContext value={register}>
              {props.children}
            </OwnContentContext>
          ))
          return (
            <>
              {own()}
              <Show when={!hasContent()}>
                <TriggerMenuContent />
              </Show>
            </>
          )
        })}
      </ContainerContext>
    </TriggerMenuContext>
  )
})

/**
 * The text field the menu suggests into: a `<textarea>`, or an `<input>` from `render`.
 * @stable
 */
const TriggerMenuInput = parts.Input

/**
 * The popup that holds the suggestions, anchored at the caret.
 * @stable
 */
function TriggerMenuContent(
  props: PartProps<"div", TriggerMenuContentState> & TriggerMenuContentProps
) {
  const menu = useTriggerMenu()
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const register = useContext(OwnContentContext)
  register?.(true)
  onCleanup(() => register?.(false))
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    keepMounted: props.keepMounted,
  })
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "keepMounted",
    "container"
  )
  const withList = merge(rest, {
    get children() {
      return rest.children ?? <TriggerMenuList />
    },
  })
  return (
    <Show when={menu.present("content", content)}>
      {renderPopup(
        () => usePart(menu, "content", content, withList, "div"),
        target
      )}
    </Show>
  )
}

/**
 * The listbox. Without children, it renders the current trigger's items, filtered.
 * @stable
 */
function TriggerMenuList(props: PartProps<"div", TriggerMenuContentState>) {
  const withItems = merge(props, {
    get children() {
      return (
        props.children ??
        ((state: TriggerMenuContentState) => (
          <TriggerMenuItems items={state.items} />
        ))
      )
    },
  })
  return usePart(useTriggerMenu(), "list", undefined, withItems, "div")
}

/**
 * A suggestion. Choosing it inserts it into the text.
 * @stable
 */
const TriggerMenuItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", TriggerMenuItemState>, Clashing> &
    TriggerMenuItemProps<T>
) => JSX.Element

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
function TriggerMenuEmpty(props: PartProps<"div", TriggerMenuEmptyState>) {
  const whileEmpty = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: TriggerMenuEmptyState) => (state.empty ? children : null)
    },
  })
  return usePart(useTriggerMenu(), "empty", undefined, whileEmpty, "div")
}

// Whether a part was given content. Checked without reading `children`,
// which would create its elements only to throw them away.
const hasChildren = (props: object) => "children" in props

/**
 * A polite status, outside the popup. Without children, it says the count and the keys once typing pauses.
 * @stable
 */
function TriggerMenuStatus(props: PartProps<"div", TriggerMenuStatusState>) {
  return usePart(
    useTriggerMenu(),
    "status",
    () => ({ text: !hasChildren(props) }),
    props,
    "div"
  )
}

/**
 * Ghost text at the caret for the arguments still to type, like `<name>`. Without children, the hints.
 * @stable
 */
function TriggerMenuHint(props: PartProps<"span", TriggerMenuHintState>) {
  return usePart(
    useTriggerMenu(),
    "hint",
    () => ({ text: !hasChildren(props) }),
    props,
    "span"
  )
}

/**
 * Renders data items. Used by data menus, and available for custom layouts.
 * @stable
 */
function TriggerMenuItems(props: { items: TriggerMenuData<any> }) {
  return <ListItems items={props.items} parts={listParts} />
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
