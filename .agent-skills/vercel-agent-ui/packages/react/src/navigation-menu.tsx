import {
  navigationMenu,
  type NavigationMenuContentProps,
  type NavigationMenuContentState,
  type NavigationMenuItemProps,
  type NavigationMenuItemState,
  type NavigationMenuOptions,
  type NavigationMenuState,
  type NavigationMenuViewportProps,
  type NavigationMenuViewportState,
} from "@ui-sdk/core/navigation-menu"
import * as React from "react"
import { createPortal } from "react-dom"
import {
  renderPopup,
  useOwnContainer,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  readIn,
  useHandle,
  useNearest,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(navigationMenu, {
  list: "ul",
  trigger: "button",
  link: "a",
  "link-icon": "span",
  indicator: "div",
})

// The item a part is in, by value.
const ItemContext = React.createContext<string | null>(null)
// Where popups render. Set on <NavigationMenu>, or on the part.
const ContainerContext = React.createContext<PopupContainer>(undefined)

function useItem(part: string) {
  const value = React.useContext(ItemContext)
  if (value === null) {
    throw new Error(
      `<NavigationMenu${part}> must be used inside <NavigationMenuItem>.`
    )
  }
  return value
}

// Element props that mean something else on a navigation menu.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `NavigationMenu`.
 * @stable
 */
type NavigationMenuProps<T extends string = string> = NavigationMenuOptions<T> &
  Omit<PartProps<"nav", NavigationMenuState<T>>, Clashing>

/**
 * A <nav> landmark. Inside another menu's content it's a nested menu, which
 * renders a <div> and closes with its parent.
 * @stable
 */
function NavigationMenu<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  onOpenChangeComplete,
  delay,
  closeDelay,
  openOnHover,
  closeOnSelect,
  orientation,
  controller,
  debug,
  container,
  ...props
}: NavigationMenuProps<T>) {
  // Inside another menu's item, it's a nested menu.
  const parentMenu = useNearest(navigationMenu)
  const parentItem = React.useContext(ItemContext)
  const options = {
    value,
    defaultValue,
    onValueChange,
    onOpenChangeComplete,
    delay,
    closeDelay,
    openOnHover,
    closeOnSelect,
    orientation,
    controller,
    debug,
    parent:
      parentMenu && parentItem !== null
        ? { api: parentMenu.api, item: parentItem }
        : undefined,
  } as NavigationMenuOptions
  const menu = usePrimitive(navigationMenu, options)
  const tag = parentMenu && parentItem !== null ? "div" : "nav"
  // The state holds only values of type `T`, which the primitive types as strings.
  const element = usePart(
    menu,
    "root",
    {},
    props as PartProps<"nav", NavigationMenuState>,
    tag
  )
  return (
    <ItemContext.Provider value={null}>
      <ContainerContext.Provider value={container}>
        {element}
      </ContainerContext.Provider>
    </ItemContext.Provider>
  )
}

/**
 * The list of top-level items.
 * @stable
 */
const NavigationMenuList = parts.List

/**
 * One item: a link, or a trigger and the content it opens.
 * @stable
 */
function NavigationMenuItem({
  value,
  ...props
}: Omit<PartProps<"li", NavigationMenuItemState>, Clashing> &
  NavigationMenuItemProps) {
  // Its value reaches a menu nested in it, and its content.
  const generated = React.useId()
  const item = { value: value ?? generated }
  return (
    <ItemContext.Provider value={item.value}>
      {usePart(navigationMenu, "item", item, props, "li")}
    </ItemContext.Provider>
  )
}

/**
 * The button that opens its item's content. Resting the pointer on it opens the content too.
 * @stable
 */
const NavigationMenuTrigger = parts.Trigger

/**
 * Renders into the viewport while its item is open, as its own popup without
 * a viewport, and in place while closed and kept.
 * @stable
 */
function NavigationMenuContent({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  keepMounted,
  hiddenUntilFound,
  container,
  render,
  ...props
}: Omit<PartProps<"div", NavigationMenuContentState>, Clashing> &
  NavigationMenuContentProps) {
  const menu = useHandle(navigationMenu)
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    value: useItem("Content"),
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    keepMounted,
    hiddenUntilFound,
  }
  const element = usePart(menu, "content", content, { ...props, render })
  if (!element) {
    return null
  }
  const viewport = menu.api.internal.viewportElement()
  if (
    viewport &&
    readIn(menu, () => menu.api.internal.inViewport(content.value))
  ) {
    return createPortal(element, viewport)
  }
  // Kept in place next to a viewport, or its own popup without one.
  return menu.state.viewport ? element : renderPopup(element, target)
}

/**
 * A link. Pressing it closes the menu, and `current` marks the current page with `aria-current="page"`.
 * @stable
 */
const NavigationMenuLink = parts.Link

/**
 * An icon inside a link. Screen readers skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const NavigationMenuLinkIcon = parts.LinkIcon

/**
 * The one popup every content renders into. It takes the open content's size
 * as --viewport-width and --viewport-height, and moves to the open trigger.
 * @stable
 */
function NavigationMenuViewport({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  container,
  ...props
}: PartProps<"div", NavigationMenuViewportState> &
  NavigationMenuViewportProps) {
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const viewport = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
  }
  const element = usePart(navigationMenu, "viewport", viewport, props)
  return element && renderPopup(element, target)
}

/**
 * Sits under the open trigger, or under the link with `current` while every panel is closed. Screen readers
 * skip it.
 * @stable
 */
const NavigationMenuIndicator = parts.Indicator

export { createNavigationMenuController } from "@ui-sdk/core/navigation-menu"
export type {
  NavigationMenuApi,
  NavigationMenuChangeOptions,
  NavigationMenuContentProps,
  NavigationMenuContentState,
  NavigationMenuController,
  NavigationMenuIndicatorState,
  NavigationMenuItemProps,
  NavigationMenuItemState,
  NavigationMenuLinkIconProps,
  NavigationMenuLinkIconState,
  NavigationMenuLinkProps,
  NavigationMenuLinkState,
  NavigationMenuListState,
  NavigationMenuMotion,
  NavigationMenuOptions,
  NavigationMenuOrientation,
  NavigationMenuPrimitive,
  NavigationMenuState,
  NavigationMenuTriggerProps,
  NavigationMenuTriggerState,
  NavigationMenuValueChangeReason,
  NavigationMenuViewportProps,
  NavigationMenuViewportState,
} from "@ui-sdk/core/navigation-menu"

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuLinkIcon,
  NavigationMenuList,
  type NavigationMenuProps,
  NavigationMenuTrigger,
  NavigationMenuViewport,
}
