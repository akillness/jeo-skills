import {
  navigationMenu as navigationMenuPrimitive,
  type NavigationMenuContentProps,
  type NavigationMenuContentState,
  type NavigationMenuItemProps,
  type NavigationMenuItemState,
  type NavigationMenuLinkIconProps,
  type NavigationMenuLinkIconState,
  type NavigationMenuOptions,
  type NavigationMenuState,
  type NavigationMenuViewportProps,
  type NavigationMenuViewportState,
} from "@ui-sdk/core/navigation-menu"
import { Portal } from "@solidjs/web"
import {
  createContext,
  createMemo,
  createUniqueId,
  omit,
  Show,
  useContext,
} from "solid-js"
import { renderPopup, usePopupContainer, type PopupContainer } from "./popup"
import {
  createParts,
  renderAs,
  useHandle,
  useNearest,
  usePart,
  type PartProps,
} from "./use-primitive"

const parts = createParts(navigationMenuPrimitive, {
  root: "nav",
  list: "ul",
  trigger: "button",
  link: "a",
  indicator: "div",
})

// The item a part is in, by value.
const ItemContext = createContext<(() => string) | null>(null)
// Where popups render. Set on <NavigationMenu>, or on the part.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)

function useItem(part: string) {
  const value = useContext(ItemContext)
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
function NavigationMenu<T extends string = string>(
  props: NavigationMenuProps<T>
) {
  const parentMenu = useNearest(navigationMenuPrimitive)
  const parentItem = useContext(ItemContext)
  const nested = !!parentMenu && parentItem !== null
  return (
    <ItemContext value={null}>
      <ContainerContext value={() => props.container}>
        <parts.Root<T>
          {...props}
          render={props.render ?? renderAs(() => (nested ? "div" : "nav"))}
          parent={
            nested ? { api: parentMenu.api, item: parentItem() } : undefined
          }
        />
      </ContainerContext>
    </ItemContext>
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
function NavigationMenuItem(
  props: Omit<PartProps<"li", NavigationMenuItemState>, Clashing> &
    NavigationMenuItemProps
) {
  const menu = useHandle(navigationMenuPrimitive)
  const generated = createUniqueId()
  const value = () => props.value ?? generated
  return (
    <ItemContext value={value}>
      {usePart(
        menu,
        "item",
        () => ({ value: value() }),
        omit(props, "value"),
        "li"
      )}
    </ItemContext>
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
function NavigationMenuContent(
  props: Omit<PartProps<"div", NavigationMenuContentState>, Clashing> &
    NavigationMenuContentProps
) {
  const menu = useHandle(navigationMenuPrimitive)
  const value = useItem("Content")
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const content = () => ({
    value: value(),
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    keepMounted: props.keepMounted,
    hiddenUntilFound: props.hiddenUntilFound,
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
    "hiddenUntilFound",
    "container"
  )
  // Where the content renders, or nothing while it isn't present. The
  // viewport binding and the item opening change both, and the part hears
  // them through `present`. A move remounts the content, so it binds for where it is.
  const placement = createMemo(() => {
    if (!menu.present("content", content)) {
      return null
    }
    const viewport = menu.api.internal.viewportElement()
    if (viewport && menu.api.internal.inViewport(value())) {
      return viewport
    }
    return menu.state.viewport ? "in-place" : "popup"
  })
  const element = () => usePart(menu, "content", content, rest, "div")
  return (
    <Show when={placement()} keyed>
      {(where) =>
        typeof where !== "string" ? (
          <Portal mount={where}>{element()}</Portal>
        ) : where === "in-place" ? (
          element()
        ) : (
          renderPopup(element, target)
        )
      }
    </Show>
  )
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
function NavigationMenuLinkIcon(
  props: PartProps<"span", NavigationMenuLinkIconState> &
    NavigationMenuLinkIconProps
) {
  const menu = useHandle(navigationMenuPrimitive)
  const id = createUniqueId()
  // Keyed by its own id, so several icons stay apart.
  return usePart(
    menu,
    "link-icon",
    () => ({ id, mirror: props.mirror }),
    omit(props, "mirror"),
    "span"
  )
}

/**
 * The one popup every content renders into. It takes the open content's size
 * as --viewport-width and --viewport-height, and moves to the open trigger.
 * @stable
 */
function NavigationMenuViewport(
  props: PartProps<"div", NavigationMenuViewportState> &
    NavigationMenuViewportProps
) {
  const menu = useHandle(navigationMenuPrimitive)
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const viewport = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
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
    "container"
  )
  return renderPopup(
    () => usePart(menu, "viewport", viewport, rest, "div"),
    target
  )
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
