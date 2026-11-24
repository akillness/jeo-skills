import type { Anchor, ChangeDetails, Side } from "@ui-sdk/core"
import {
  navigationMenu as navigationMenuPrimitive,
  type NavigationMenuController,
  type NavigationMenuValueChangeReason,
} from "@ui-sdk/core/navigation-menu"
import {
  Teleport,
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import {
  containerProp,
  renderPopup,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

type Details = ChangeDetails<NavigationMenuValueChangeReason>

// Where popups render. Set on <NavigationMenu>, or on the part.
const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
  "navigation-menu-container"
)

const useNavigationMenu = () => useHandle(navigationMenuPrimitive)

// The value of the item a part is in, read when needed so parts follow a new
// `value`. Undefined inside a nested menu's root until its own items, whose
// scope starts empty.
const useItemValue = () => {
  const item = useScope(navigationMenuPrimitive)?.around.item
  return () => item?.().value as string | undefined
}

function useItem(part: string) {
  const value = useItemValue()
  if (value() == null) {
    throw new Error(
      `<NavigationMenu${part}> must be used inside <NavigationMenuItem>.`
    )
  }
  return value as () => string
}

const parts = createParts(navigationMenuPrimitive, {
  list: "ul",
  item: "li",
  trigger: "button",
  link: "a",
  "link-icon": "span",
  indicator: "div",
})

const placementProps = {
  side: String as PropType<Side>,
  align: String as PropType<"start" | "center" | "end">,
  sideOffset: Number,
  alignOffset: Number,
  collisionPadding: Number,
  arrowPadding: Number,
  anchor: [Object, String] as PropType<Anchor | string | null>,
  // Renders the popup into this element instead of in place.
  container: containerProp,
}

/**
 * A <nav> landmark. Inside another menu's content it's a nested menu, which
 * renders a <div> and closes with its parent.
 * @stable
 */
const NavigationMenu = withElement(
  "nav",
  defineComponent({
    name: "NavigationMenu",
    inheritAttrs: false,
    props: {
      value: { type: String as PropType<string | null>, default: undefined },
      modelValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      defaultValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      delay: Number,
      closeDelay: Number,
      openOnHover: optionalBoolean,
      closeOnSelect: optionalBoolean,
      orientation: String as PropType<"horizontal" | "vertical">,
      controller: Object as PropType<NavigationMenuController>,
      debug: optionalBoolean,
      container: containerProp,
    },
    emits: {
      "update:value": (_value: string | null) => true,
      "update:modelValue": (_value: string | null) => true,
      valueChange: (_value: string | null, _details: Details) => true,
      openChangeComplete: (_open: boolean) => true,
    },
    slots: Object as PartSlots<typeof navigationMenuPrimitive, "root">,
    setup(props, { emit }) {
      const parentMenu = useScope(navigationMenuPrimitive)?.handle
      const parentItem = useItemValue()() ?? null
      const parent =
        parentMenu && parentItem !== null
          ? { api: parentMenu.api, item: parentItem }
          : undefined
      const menu = usePrimitive(navigationMenuPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        delay: props.delay,
        closeDelay: props.closeDelay,
        openOnHover: props.openOnHover,
        closeOnSelect: props.closeOnSelect,
        orientation: props.orientation,
        controller: props.controller,
        debug: props.debug,
        parent,
        onValueChange: (value: string | null, details: Details) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
      }))
      provide(ContainerKey, () => props.container)
      return usePart(menu, "root", undefined, undefined, parent ? "div" : "nav")
    },
  })
)

/**
 * The list of top-level items.
 * @stable
 */
const NavigationMenuList = parts.List

/**
 * One item: a link, or a trigger and the content it opens.
 * @stable
 */
const NavigationMenuItem = parts.Item

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
const NavigationMenuContent = withElement(
  "div",
  defineComponent({
    name: "NavigationMenuContent",
    inheritAttrs: false,
    props: {
      ...placementProps,
      keepMounted: optionalBoolean,
      hiddenUntilFound: optionalBoolean,
    },
    slots: Object as PartSlots<typeof navigationMenuPrimitive, "content">,
    setup(props) {
      const menu = useNavigationMenu()
      const value = useItem("Content")
      const fromRoot = inject(ContainerKey, () => undefined)
      const target = usePopupContainer(() => props.container ?? fromRoot())
      const content = () => {
        const { container, ...rest } = props
        return { ...rest, value: value() }
      }
      const part = usePart(menu, "content", content)
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        const viewport = menu.api.internal.viewportElement()
        // A Teleport and an element are different nodes, so moving between them
        // mounts the content again, and it binds for where it is.
        if (viewport && menu.api.internal.inViewport(value())) {
          return h(Teleport, { to: viewport }, [element])
        }
        return menu.state.viewport ? element : renderPopup(element, target())
      }
    },
  })
)

/**
 * A link. Pressing it closes the menu, and `current` marks the current page with `aria-current="page"`.
 * @stable
 */
const NavigationMenuLink = parts.Link

/**
 * An icon inside a link. Screen readers skip it, and `mirror` flips it in
 * right-to-left text.
 * @stable
 */
const NavigationMenuLinkIcon = parts.LinkIcon

/**
 * The one popup every content renders into. It takes the open content's size
 * as --viewport-width and --viewport-height, and moves to the open trigger.
 * @stable
 */
const NavigationMenuViewport = withElement(
  "div",
  defineComponent({
    name: "NavigationMenuViewport",
    inheritAttrs: false,
    props: { ...placementProps },
    slots: Object as PartSlots<typeof navigationMenuPrimitive, "viewport">,
    setup(props) {
      const fromRoot = inject(ContainerKey, () => undefined)
      const target = usePopupContainer(() => props.container ?? fromRoot())
      const viewport = () => {
        const { container, ...rest } = props
        return rest
      }
      const part = usePart(navigationMenuPrimitive, "viewport", viewport)
      // The viewport is always present, so the part always renders.
      return () => renderPopup(part()!, target())
    },
  })
)

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
  NavigationMenuTrigger,
  NavigationMenuViewport,
}
