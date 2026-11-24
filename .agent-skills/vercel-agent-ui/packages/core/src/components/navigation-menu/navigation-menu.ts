import { triggerKeydown } from "../../foundation/disclosure/disclosure"
import {
  ownsEvent,
  registerPopupElement,
} from "../../foundation/popups/popup-elements"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import {
  itemIconPart,
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import { motionOf, type NavigationMenuMotion } from "./navigation-menu-keyboard"
import {
  isShown,
  navigationMenuApi,
  type NavigationMenuApi,
  type NavigationMenuInternalOptions,
  type NavigationMenuStoreState,
} from "./navigation-menu-api"
import type { NavigationMenuGeneric } from "./navigation-menu-generic"
import { idPart, openAttrs } from "../../foundation/kernel/attrs"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import { orientationOf } from "../../foundation/focus/collection"

/**
 * Why the open item changed.
 * @stable
 */
type NavigationMenuValueChangeReason =
  | "trigger-hover"
  | "trigger-press"
  | "escape-key"
  | "close-press"
  | "outside-press"
  | "focus-out"
  | "link-press"
  | "find-in-page"
  | "parent-close"
  | "imperative"

/**
 * Options every write method on a navigation menu controller takes.
 * @stable
 */
type NavigationMenuChangeOptions =
  ChangeOptions<NavigationMenuValueChangeReason>

/**
 * Opens, closes and inspects a navigation menu from outside it, like a button
 * that opens the "Products" panel. Pass it as the `controller` option.
 * @stable
 */
function createNavigationMenuController<T extends string = string>() {
  return createController<{
    /** The open item's value, or null when every panel is closed. */
    getValue: () => T | null
    /** Opens an item's panel, or closes the open one with `null`. Returns false when canceled. */
    setValue: (
      value: T | null,
      options?: NavigationMenuChangeOptions
    ) => boolean
    /** Whether a panel is open. */
    isOpen: () => boolean
    /** Closes the open panel. Returns false when canceled or already closed. */
    close: (options?: NavigationMenuChangeOptions) => boolean
    /** Moves focus to an item's trigger: the open one, or the first one, without a value. */
    focus: (value?: T) => void
  }>()
}

/**
 * A controller from `createNavigationMenuController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type NavigationMenuController<T extends string = string> = ReturnType<
  typeof createNavigationMenuController<T>
>

/**
 * Which arrow keys move between the top-level items, and where panels open.
 * @stable
 */
type NavigationMenuOrientation = "horizontal" | "vertical"

/**
 * The options `navigationMenu` takes. A component takes them as props on its
 * root.
 * @stable
 */
type NavigationMenuOptions<T extends string = string> = PortalProps & {
  /** The open item's value. Pass it to control the menu. `null` closes every panel. */
  value?: T | null
  /**
   * The item open at first, when uncontrolled.
   * @defaultValue null
   */
  defaultValue?: T | null
  /** Runs when an item wants to open or the open one to close. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T | null,
    details: ChangeDetails<NavigationMenuValueChangeReason>
  ) => void
  /** Runs once the menu has finished opening or closing, after any animation. Switching items doesn't count. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Milliseconds the pointer rests on a trigger before its panel opens. Moving to another trigger while one is open switches at once.
   * @defaultValue 50
   */
  delay?: number
  /**
   * Milliseconds before the open panel closes once the pointer leaves its trigger and the panel.
   * @defaultValue 50
   */
  closeDelay?: number
  /**
   * Whether resting the pointer on a trigger opens its panel. Pressing a trigger always does, so `false` makes a click-only menu.
   * @defaultValue true
   */
  openOnHover?: boolean
  /**
   * Whether pressing a link closes the menu, like after a client-side route change. A link's own `closeOnSelect` wins. A press with a modifier key, which opens a new tab, never closes it.
   * @defaultValue true
   */
  closeOnSelect?: boolean
  /**
   * Which arrow keys move between the top-level items, and the side panels open on: below a horizontal menu, beside a vertical one.
   * @defaultValue "horizontal"
   */
  orientation?: NavigationMenuOrientation
  /** Opens and closes panels from anywhere. Create one with `createNavigationMenuController()`. */
  controller?: NavigationMenuController<T>
} & PrimitiveOptions

type ItemProps = {
  /** Identifies the item, for `value` and `onValueChange`. Generated when left out. */
  value?: string
}

type TriggerProps = {
  /** The item the trigger opens. Inferred from the item it's in. */
  value?: string
  /**
   * Stops the trigger from opening its panel. A native button can't be focused or pressed.
   * @defaultValue false
   */
  disabled?: boolean
}

type PlacementProps = PositionProps & {
  /**
   * Which side of the trigger it opens on: below a horizontal menu, at the inline end of a vertical one.
   * @defaultValue "bottom"
   */
  side?: PositionProps["side"]
  /**
   * How it lines up with the trigger along that side.
   * @defaultValue "start"
   */
  align?: PositionProps["align"]
  /**
   * Gap between the trigger and it, in pixels.
   * @defaultValue 4
   */
  sideOffset?: number
  /**
   * Shift along the trigger, in pixels.
   * @defaultValue 0
   */
  alignOffset?: number
}

type ContentProps = PlacementProps &
  PortalProps & {
    /** The item the content belongs to. Inferred from the item it's in. */
    value?: string
    /**
     * Whether the content stays in the page, hidden, while its item is closed, so crawlers and the server's HTML have it. Closed content stays in its item; it moves into the viewport when it opens.
     * @defaultValue false
     */
    keepMounted?: boolean
    /**
     * Whether closed content stays findable with `hidden="until-found"`, so find in page opens its item. Implies `keepMounted`.
     * @defaultValue false
     */
    hiddenUntilFound?: boolean
  }

type LinkProps = {
  /**
   * Whether the link is the current page. Sets `aria-current="page"` and `data-current`.
   * @defaultValue false
   */
  current?: boolean
  /** Whether pressing the link closes the menu. Overrides the menu's `closeOnSelect`. */
  closeOnSelect?: boolean
}

type ViewportProps = PlacementProps & PortalProps

/**
 * The props the `item` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuItemProps = ItemProps
/**
 * The props the `trigger` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuTriggerProps = Omit<TriggerProps, "value">
/**
 * The props the `content` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuContentProps = Omit<ContentProps, "value">
/**
 * The props the `link` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuLinkProps = LinkProps
/**
 * The props the `viewport` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuViewportProps = ViewportProps

/**
 * The state the `root` slot of `navigationMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type NavigationMenuState<T extends string = string> = {
  /** The open item's value, or null. */
  value: T | null
  /** Whether a panel is open. */
  open: boolean
  /** The menu's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: NavigationMenuOrientation
  /** Whether the menu sits inside another one's content. */
  nested: boolean
}
/**
 * The state the `list` slot of `navigationMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type NavigationMenuListState = {
  /** Whether a panel is open. */
  open: boolean
  /** The menu's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: NavigationMenuOrientation
}
/**
 * The state the `item` slot of `navigationMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type NavigationMenuItemState = {
  /** Whether this item's panel is open. */
  open: boolean
}
/**
 * The state the `trigger` slot of `navigationMenu` hands `render` functions
 * and state-based class names.
 * @stable
 */
type NavigationMenuTriggerState = {
  /** Whether this trigger's panel is open. */
  open: boolean
  /** Set by the trigger's `disabled` prop, which stops it opening its panel. */
  disabled: boolean
}
/**
 * The state the `content` slot of `navigationMenu` hands `render` functions
 * and state-based class names.
 * @stable
 */
type NavigationMenuContentState = {
  /** Whether this content's item is open. False while it animates out. */
  open: boolean
  /** Which way it moves when another item takes over or gives way, or null when the menu opened or closed as a whole. */
  motion: NavigationMenuMotion | null
  /** The menu's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: NavigationMenuOrientation
}
/**
 * The state the `link` slot of `navigationMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type NavigationMenuLinkState = {
  /** Whether the link is the current page. */
  current: boolean
}
/**
 * The props the `link-icon` slot of `navigationMenu` takes.
 * @stable
 */
type NavigationMenuLinkIconProps = ItemIconProps
/**
 * The state the `link-icon` slot of `navigationMenu` hands `render` functions
 * and state-based class names.
 * @stable
 */
type NavigationMenuLinkIconState = ItemIconState
/**
 * The state the `viewport` slot of `navigationMenu` hands `render` functions
 * and state-based class names.
 * @stable
 */
type NavigationMenuViewportState = {
  /** Whether a panel is open. False while it animates out. */
  open: boolean
  /** The menu's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: NavigationMenuOrientation
}
/**
 * The state the `indicator` slot of `navigationMenu` hands `render` functions
 * and state-based class names.
 * @stable
 */
type NavigationMenuIndicatorState = {
  /** Whether a panel is open. */
  open: boolean
  /** The menu's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: NavigationMenuOrientation
}

const contentId = (id: string, key: string) => `${id}-content-${idPart(key)}`

const navigationMenuPrimitive = /* @__PURE__ */ definePrimitive({
  name: "navigation-menu",
  options: {
    container: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onOpenChangeComplete: "callback",
    delay: "number",
    closeDelay: "number",
    openOnHover: "boolean",
    closeOnSelect: "boolean",
    orientation: "string",
    controller: "value",
    // Internal: passed by renderers.
    parent: "value",
  },
  state: (
    options: NavigationMenuOptions & NavigationMenuInternalOptions
  ): NavigationMenuStoreState => {
    const value = options.value ?? options.defaultValue ?? null
    return {
      value,
      orientation: orientationOf(options.orientation, "horizontal"),
      mounted: value !== null,
      active: value,
      previous: null,
      forward: null,
      exiting: [],
      contents: value === null ? [] : [value],
      viewport: false,
      nested: !!options.parent,
    }
  },
  sync: (options) => ({
    orientation: orientationOf(options.orientation, "horizontal"),
    ...(options.value !== undefined && { value: options.value }),
  }),
  api: navigationMenuApi,
  slots: (slot) => ({
    // A <nav> landmark, or a plain element when nested inside another menu's content.
    root: slot<{}, NavigationMenuState>({
      state: (state) => ({
        value: state.value,
        open: state.value !== null,
        orientation: state.orientation,
        nested: state.nested,
      }),
      attrs: (state) => ({
        "data-orientation": state.orientation,
        "data-nested": state.nested ? "" : undefined,
      }),
      on: { keydown: (event, { api }) => api.internal.rootKeydown(event) },
    }),

    list: slot<{}, NavigationMenuListState>({
      state: (state) => ({
        open: state.value !== null,
        orientation: state.orientation,
      }),
      attrs: (state) => ({ "data-orientation": state.orientation }),
      on: {
        keydown: (event, { api, el }) => api.internal.listKeydown(event, el!),
      },
    }),

    item: slot<ItemProps, NavigationMenuItemState>({
      props: { value: "id" },
      state: (state, { key }) => ({ open: state.value === key }),
      attrs: (state, { key }) => openAttrs(state.value === key),
      bind: (el, { api, key }) => api.internal.ensureSurface(key),
    }),

    // A button that opens and closes its item's panel, like a disclosure.
    trigger: slot<TriggerProps, NavigationMenuTriggerState>({
      props: { value: { kind: "string", from: "item" }, disabled: "boolean" },
      state: (state, { key, props }) => ({
        open: state.value === key,
        disabled: !!props.disabled,
      }),
      attrs: (state, { id, key, props }) => ({
        id: `${id}-trigger-${idPart(key)}`,
        type: "button",
        "aria-expanded": String(state.value === key),
        "aria-controls": isShown(state, key) ? contentId(id, key) : undefined,
        disabled: props.disabled ? "" : undefined,
        "data-disabled": props.disabled ? "" : undefined,
        ...openAttrs(state.value === key),
      }),
      on: {
        pointerenter: (event, { api, key, props }) =>
          api.internal.hoverEnter(event, key, props.disabled),
        pointermove: (event, { api, key, props }) =>
          api.internal.hoverMove(event, key, props.disabled),
        pointerleave: (event, { api, key }) =>
          api.internal.leaveTrigger(event, key),
        keydown(event, { api, el, key, store }) {
          triggerKeydown(event, el)
          // Tab from the open trigger moves into its panel, wherever it renders.
          if (store.get().value === key) {
            api.internal.surface().triggerKeydown(event)
          }
        },
      },
      press(context, event) {
        if (!context.props.disabled) {
          context.api.internal.triggerPress(context.key, context.el, event)
        }
      },
      bind: (el, { api, key }) => api.internal.ensureSurface(key),
    }),

    content: slot<ContentProps, NavigationMenuContentState>({
      props: {
        side: "string",
        align: "string",
        sideOffset: "number",
        alignOffset: "number",
        collisionPadding: "number",
        arrowPadding: "number",
        anchor: "string",
        container: "value",
        value: { kind: "string", from: "item" },
        keepMounted: "boolean",
        hiddenUntilFound: "boolean",
      },
      connect: registerPopupElement,
      state: (state, { key }) => ({
        open: state.value === key,
        motion: motionOf(key, state) ?? null,
        orientation: state.orientation,
      }),
      present: (state, { key, props }) =>
        isShown(state, key) || !!props.keepMounted || !!props.hiddenUntilFound,
      attrs: (state, { id, key, props }) => {
        const shown = isShown(state, key)
        return {
          id: contentId(id, key),
          // Without a viewport, the content is a popup that touch can focus.
          tabindex: state.viewport ? undefined : "-1",
          hidden: shown
            ? undefined
            : props.hiddenUntilFound
              ? "until-found"
              : "",
          "data-motion": motionOf(key, state),
          "data-orientation": state.orientation,
          ...openAttrs(state.value === key),
        }
      },
      on: {
        keydown(event, { api, el, store }) {
          api.internal.panelKeydown(event, el!)
          // Without a viewport, Tab flows out of the content back to the page after its trigger.
          if (ownsEvent(el!, event) && !store.get().viewport) {
            api.internal.surface().keydown(event)
          }
        },
        pointerenter(event, { api, store }) {
          if (!store.get().viewport) {
            api.internal.enterPanel(event)
          }
        },
        pointerleave(event, { api, store }) {
          if (!store.get().viewport) {
            api.internal.leavePanel(event)
          }
        },
      },
      bind: (el, part) =>
        part.api.internal.bindContent(el, part.key, part.props, part),
    }),

    link: slot<LinkProps, NavigationMenuLinkState>({
      props: { id: "id", current: "boolean", closeOnSelect: "boolean" },
      state: (_, { props }) => ({ current: !!props.current }),
      attrs: (_, { props }) => ({
        "aria-current": props.current ? "page" : undefined,
        "data-current": props.current ? "" : undefined,
      }),
      bind: (el, { api, key }) => api.internal.bindLink(el, key),
    }),

    "link-icon": slot(
      itemIconPart<NavigationMenuStoreState, NavigationMenuApi>({
        component: "navigation-menu",
        item: '[data-slot="navigation-menu-link"]',
        list: '[data-slot="navigation-menu-content"], [data-slot="navigation-menu-list"]',
      })
    ),

    // The one popup every content renders into, sized to the open one.
    viewport: slot<ViewportProps, NavigationMenuViewportState>({
      props: {
        side: "string",
        align: "string",
        sideOffset: "number",
        alignOffset: "number",
        collisionPadding: "number",
        arrowPadding: "number",
        anchor: "string",
        container: "value",
      },
      state: (state) => ({
        open: state.value !== null,
        orientation: state.orientation,
      }),
      attrs: (state, { id }) => ({
        id: `${id}-viewport`,
        tabindex: "-1",
        hidden: state.mounted ? undefined : "",
        "data-orientation": state.orientation,
        ...openAttrs(state.value !== null),
      }),
      bind: (el, part) => part.api.internal.bindViewport(el, part),
    }),

    // Covers the open trigger, or the current page's link while closed.
    indicator: slot<{}, NavigationMenuIndicatorState>({
      state: (state) => ({
        open: state.value !== null,
        orientation: state.orientation,
      }),
      attrs: (state) => ({
        "aria-hidden": "true",
        "data-orientation": state.orientation,
        ...openAttrs(state.value !== null),
      }),
      bind: (el, { api }) => api.internal.bindIndicator(el),
    }),
  }),
  agent: { actions: ["setValue", "close"], reveals: true },
})
/**
 * The type of `navigationMenu`.
 * @stable
 */
interface NavigationMenuPrimitive extends WithGeneric<
  typeof navigationMenuPrimitive,
  NavigationMenuGeneric
> {}

/**
 * The navigation menu primitive, with the slots `root`, `list`, `item`,
 * `trigger`, `content`, `link`, `link-icon`, `viewport`, `indicator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const navigationMenu = navigationMenuPrimitive as NavigationMenuPrimitive

export {
  createNavigationMenuController,
  navigationMenu,
  type NavigationMenuChangeOptions,
  type NavigationMenuContentProps,
  type NavigationMenuContentState,
  type NavigationMenuController,
  type NavigationMenuIndicatorState,
  type NavigationMenuItemProps,
  type NavigationMenuItemState,
  type NavigationMenuLinkIconProps,
  type NavigationMenuLinkIconState,
  type NavigationMenuLinkProps,
  type NavigationMenuLinkState,
  type NavigationMenuListState,
  type NavigationMenuOptions,
  type NavigationMenuOrientation,
  type NavigationMenuPrimitive,
  type NavigationMenuState,
  type NavigationMenuTriggerProps,
  type NavigationMenuTriggerState,
  type NavigationMenuValueChangeReason,
  type NavigationMenuViewportProps,
  type NavigationMenuViewportState,
}
export type { NavigationMenuMotion } from "./navigation-menu-keyboard"
export type { NavigationMenuApi } from "./navigation-menu-api"
