// Importing this defines <ui-navigation-menu> and its parts. On the server it does nothing.
import { defineNavigationMenuElements } from "../navigation-menu"

defineNavigationMenuElements()

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
export type { NavigationMenuEvents, UiNavigationMenuElement } from "../events"
export { createNavigationMenuController } from "@ui-sdk/core/navigation-menu"
