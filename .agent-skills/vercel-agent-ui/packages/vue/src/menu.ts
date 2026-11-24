import {
  formatShortcut,
  type Anchor,
  type ChangeDetails,
  type DismissAttemptDetails,
} from "@ui-sdk/core"
import {
  menu as menuPrimitive,
  type MenuActionDetails,
  type MenuCheckedChangeDetails,
  type MenuCheckedChangeReason,
  type MenuContentProps,
  type MenuController,
  type MenuData,
  type MenuDataItem,
  type MenuDismissReason,
  type MenuOpenChangeReason,
  type MenuPayloadChangeReason,
  type MenuValueChangeDetails,
  type MenuValueChangeReason,
} from "@ui-sdk/core/menu"
import type { Side } from "@ui-sdk/core"
import {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
  type Feature,
} from "@ui-sdk/core/renderer"
import {
  defineComponent,
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
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { defineItemIcon } from "./item-icon"
import { MenubarKey } from "./menubar-context"
import {
  containerProp,
  type PopupContainer,
  renderPopup,
  renderUnbound,
  sheetViewport,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  withPayload,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
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

// Where root popups render. Set on <Menu> or <MenuContent>.
const ContainerKey: InjectionKey<() => PopupContainer> =
  Symbol("menu-container")
// The checkbox or radio item an indicator belongs to.
const ItemKey: InjectionKey<
  () => {
    item: "checkbox-item" | "radio-item"
    itemKey: string
    group?: string
  }
> = Symbol("menu-item")

type OpenDetails = ChangeDetails<MenuOpenChangeReason>
type PayloadDetails = ChangeDetails<MenuPayloadChangeReason>

const useMenu = () => useHandle(menuPrimitive)

// The id of the group a label names: its radio group's name, or its group's id.
const useGroup = () => {
  const around = useScope(menuPrimitive)?.around
  return (around?.["radio-group"]?.().name ?? around?.group?.().id) as
    string | undefined
}

const parts = createParts(menuPrimitive, { shortcut: "span", separator: "div" })

/**
 * A list of actions and options, opened from a button or a right-click. Put its trigger and content inside.
 * @stable
 */
const Menu = /* @__PURE__ */ renderless(
  defineComponent({
    name: "Menu",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      items: Array as PropType<MenuData>,
      itemShortcuts: optionalBoolean,
      loop: optionalBoolean,
      delay: Number,
      presentation: String as PropType<"auto" | "popover" | "sheet">,
      modal: {
        type: [Boolean, String] as PropType<boolean | "pointer">,
        default: undefined,
      },
      controller: Object as PropType<MenuController<any>>,
      dismissible: optionalBoolean,
      pendingAnnouncement: String,
      debug: optionalBoolean,
      container: containerProp,
      // A function prop beside the emits, so a returned Promise marks the item pending.
      onAction: Function as PropType<
        (value: string, details: MenuActionDetails) => unknown
      >,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (_details: DismissAttemptDetails<MenuDismissReason>) =>
        true,
      payloadChange: (_payload: unknown, _details: PayloadDetails) => true,
      checkedChange: (_checked: boolean, _details: MenuCheckedChangeDetails) =>
        true,
      valueChange: (_value: string, _details: MenuValueChangeDetails) => true,
    },
    setup(props, { slots, emit }) {
      provide(ContainerKey, () => props.container)
      const menubar = inject(MenubarKey, null)
      // A menu inside this one's content is no item of the menubar.
      provide(MenubarKey, null)
      const menu = usePrimitive(menuPrimitive, () => ({
        ...props,
        open: orModel(props.open, props.modelValue),
        container: undefined,
        menubar: menubar ? () => menubar.api : undefined,
        onOpenChange: (open: boolean, details: OpenDetails) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("openChange", open, details)
          if (details.canceled) {
            return
          }
          emit("update:open", open)
          emit("update:modelValue", open)
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
        onDismissAttempt: (details: DismissAttemptDetails<MenuDismissReason>) =>
          emit("dismissAttempt", details),
        onPayloadChange: (payload: unknown, details: PayloadDetails) =>
          emit("payloadChange", payload, details),
        onCheckedChange: (
          checked: boolean,
          details: MenuCheckedChangeDetails
        ) => emit("checkedChange", checked, details),
        onValueChange: (value: string, details: MenuValueChangeDetails) =>
          emit("valueChange", value, details),
      }))
      useControllerEntry(() => props.controller, menu)
      const placed = usePlacedContent()
      return () => {
        const children = slots.default?.() ?? []
        // A data menu renders its content, unless the app placed a MenuContent:
        // in the markup, or inside a component of its own.
        const own = !props.items || placed() || hasChild(children, MenuContent)
        return [
          children,
          props.items &&
            !own &&
            h(NotPlaced, () =>
              h(MenuContent, null, () => h(MenuItems, { items: props.items! }))
            ),
        ]
      }
    },
  })
)

// A trigger, inside the menu or anywhere a controller connects it.
function triggerPart<
  S extends "trigger" | "context-trigger",
  Tag extends string,
>(name: string, slot: S, tag: Tag, feature?: Feature) {
  return withElement(
    tag,
    defineComponent({
      name,
      inheritAttrs: false,
      props: {
        disabled: optionalBoolean,
        focusableWhenDisabled: optionalBoolean,
        payload: null as unknown as PropType<unknown>,
        // A keyboard shortcut that opens the menu, like "mod+j". Root triggers only.
        shortcut: String,
        // Connects a trigger outside the menu to the menu with this controller.
        controller: Object as PropType<MenuController<any>>,
      },
      slots: Object as PartSlots<typeof menuPrimitive, S>,
      setup(props, { slots, attrs }) {
        const connected = useControllerTarget(
          menuPrimitive,
          () => props.controller
        )
        const id = useId()
        const part = () => ({
          id,
          disabled: props.disabled,
          focusableWhenDisabled: props.focusableWhenDisabled,
          payload: props.payload,
          shortcut: props.shortcut,
        })
        return useConnectedPart(
          connected,
          (menu) => {
            if (feature) {
              menu.instance.use(feature)
            }
            return usePart(menu, slot as "trigger", part, undefined, tag)
          },
          // Until the menu it names mounts, a trigger outside the menu is a plain element.
          () =>
            renderUnbound(
              tag,
              {
                ...(tag === "button" && {
                  type: "button",
                  disabled: props.disabled && !props.focusableWhenDisabled,
                  "aria-disabled":
                    (props.disabled && props.focusableWhenDisabled) ||
                    undefined,
                }),
                ...attrs,
              },
              { slots, state: { open: false, disabled: !!props.disabled } }
            )
        )
      },
    })
  )
}

/**
 * The button that opens the menu. A trigger outside the menu connects through `controller`.
 * @stable
 */
const MenuTrigger = triggerPart("MenuTrigger", "trigger", "button")
/**
 * An area that opens the menu at the pointer on a right-click or a long press, and on Shift+F10.
 * @stable
 */
const MenuContextTrigger = /* @__PURE__ */ triggerPart(
  "MenuContextTrigger",
  "context-trigger",
  "div",
  menuContextTrigger
)

/**
 * The popup that holds the items, positioned against the trigger that opened it.
 * @stable
 */
const MenuContent = withPayload(
  withElement(
    "div",
    defineComponent({
      name: "MenuContent",
      inheritAttrs: false,
      props: {
        side: String as PropType<Side>,
        align: String as PropType<"start" | "center" | "end">,
        sideOffset: Number,
        alignOffset: Number,
        collisionPadding: Number,
        arrowPadding: Number,
        anchor: [Object, String] as PropType<Anchor | string | null>,
        finalFocus: [String, Object, Function] as PropType<
          MenuContentProps["finalFocus"]
        >,
        keepMounted: optionalBoolean,
        // Renders the popup into this element instead of in place. Submenus stay
        // inside their parent's popup.
        container: containerProp,
      },
      slots: Object as PartSlots<typeof menuPrimitive, "content">,
      setup(props) {
        usePlaceContent()
        const menu = useMenu()
        const fromRoot = inject(ContainerKey, () => undefined)
        const target = usePopupContainer(() => props.container ?? fromRoot())
        const position = () => {
          const { container, ...position } = props
          return position
        }
        const part = usePart(menu, "content", position)
        return () => {
          const element = part()
          if (!element) {
            return null
          }
          // Submenus render inside their parent's popup.
          return menu.api.root() !== menu.api
            ? element
            : renderPopup(sheetViewport(menu, element), target())
        }
      },
    })
  )
)

/**
 * Shows the keys of an item's shortcut, like `⌘S`, inside the item. Hidden from screen readers.
 * @stable
 */
const MenuShortcut = parts.Shortcut

/**
 * An action. Pressing it runs `@select` and closes the menu, unless `closeOnSelect` is false.
 * A Promise from `@select` keeps it pending, and the menu open, until it settles.
 * @stable
 */
const MenuItem = withElement(
  "div",
  defineComponent({
    name: "MenuItem",
    inheritAttrs: false,
    props: {
      value: String,
      label: String,
      disabled: optionalBoolean,
      shortcut: String,
      closeOnSelect: optionalBoolean,
      destructive: optionalBoolean,
      // A function prop beside the emit, so a returned Promise marks the item pending.
      onSelect: Function as PropType<(event: Event) => unknown>,
    },
    slots: Object as PartSlots<typeof menuPrimitive, "item">,
    setup(props, { slots }) {
      const menu = useMenu()
      const id = useId()
      const item = () => ({ ...props, id })
      return usePart(menu, "item", item, undefined, {
        tag: "div",
        children: (state) => [
          slots.default?.({ state }),
          props.shortcut &&
            h(MenuShortcut, null, () =>
              formatShortcut(props.shortcut!, menu.state.apple)
            ),
        ],
      })
    },
  })
)

/**
 * An item that checks and unchecks an option.
 * @stable
 */
const MenuCheckboxItem = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "MenuCheckboxItem",
    inheritAttrs: false,
    props: {
      value: { type: String, required: true },
      label: String,
      disabled: optionalBoolean,
      checked: optionalBoolean,
      modelValue: optionalBoolean,
      defaultChecked: optionalBoolean,
      closeOnSelect: optionalBoolean,
    },
    emits: {
      "update:checked": (_checked: boolean) => true,
      "update:modelValue": (_checked: boolean) => true,
      checkedChange: (
        _checked: boolean,
        _details: ChangeDetails<MenuCheckedChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof menuPrimitive, "checkbox-item">,
    setup(props, { emit }) {
      const menu = useMenu()
      menu.instance.use(menuCheckable)
      provide(ItemKey, () => ({ item: "checkbox-item", itemKey: props.value }))
      const item = () => ({
        ...props,
        checked: orModel(props.checked, props.modelValue),
        onCheckedChange: (
          checked: boolean,
          details: ChangeDetails<MenuCheckedChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("checkedChange", checked, details)
          if (details.canceled) {
            return
          }
          emit("update:checked", checked)
          emit("update:modelValue", checked)
        },
      })
      return usePart(menu, "checkbox-item", item)
    },
  })
)

/**
 * Radio items that share one value.
 * @stable
 */
const MenuRadioGroup = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "MenuRadioGroup",
    inheritAttrs: false,
    props: {
      // Identifies the group in the menu's `valueChange`. Defaults to a generated id.
      name: String,
      value: { type: String as PropType<string | null>, default: undefined },
      modelValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      defaultValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
    },
    emits: {
      "update:value": (_value: string) => true,
      "update:modelValue": (_value: string) => true,
      valueChange: (
        _value: string,
        _details: ChangeDetails<MenuValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof menuPrimitive, "radio-group">,
    setup(props, { emit }) {
      const menu = useMenu()
      menu.instance.use(menuCheckable)
      const generated = useId()
      const name = props.name ?? generated
      // Its items and label take its `name`.
      provideProps(menuPrimitive, "radio-group", () => ({ name }))
      const group = () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        id: name,
        name,
        onValueChange: (
          value: string,
          details: ChangeDetails<MenuValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
      })
      return usePart(menu, "radio-group", group)
    },
  })
)

/**
 * An item in a `MenuRadioGroup`. Pressing it checks its value.
 * @stable
 */
const MenuRadioItem = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "MenuRadioItem",
    inheritAttrs: false,
    props: {
      value: { type: String, required: true },
      label: String,
      disabled: optionalBoolean,
      closeOnSelect: optionalBoolean,
    },
    slots: Object as PartSlots<typeof menuPrimitive, "radio-item">,
    setup(props) {
      const menu = useMenu()
      menu.instance.use(menuCheckable)
      const group = useScope(menuPrimitive)?.around["radio-group"]?.().name as
        string | undefined
      if (!group) {
        throw new Error("<MenuRadioItem> must be used inside <MenuRadioGroup>.")
      }
      provide(ItemKey, () => ({
        item: "radio-item",
        itemKey: props.value,
        group,
      }))
      const item = () => ({ ...props, group })
      return usePart(menu, "radio-item", item)
    },
  })
)

/**
 * The check or dot inside a checkbox or radio item. Rendered while the item is
 * checked, or always with `keepMounted`.
 * @stable
 */
const MenuItemIndicator = /* @__PURE__ */ withElement(
  "span",
  /* @__PURE__ */ defineComponent({
    name: "MenuItemIndicator",
    inheritAttrs: false,
    props: { keepMounted: optionalBoolean },
    slots: Object as PartSlots<typeof menuPrimitive, "item-indicator">,
    setup(props) {
      const menu = useMenu()
      menu.instance.use(menuCheckable)
      const id = useId()
      const item = inject(ItemKey, null)
      if (!item) {
        throw new Error(
          "<MenuItemIndicator> must be used inside a checkbox or radio item."
        )
      }
      const indicator = () => ({
        id,
        ...item(),
        keepMounted: props.keepMounted,
      })
      return usePart(menu, "item-indicator", indicator, undefined, "span")
    },
  })
)

/**
 * An icon inside an item or a submenu trigger. Screen readers and typeahead
 * skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const MenuItemIcon = /* @__PURE__ */ defineItemIcon(
  "MenuItemIcon",
  menuPrimitive,
  "item-icon",
  menuItemIcons
)

/**
 * A group of items, named by its `MenuGroupLabel`.
 * @stable
 */
const MenuGroup = withElement(
  "div",
  defineComponent({
    name: "MenuGroup",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof menuPrimitive, "group">,
    setup() {
      const id = useId()
      // Its label takes its `id`.
      provideProps(menuPrimitive, "group", () => ({ id }))
      return usePart(menuPrimitive, "group", () => ({ id }))
    },
  })
)

/**
 * The group's heading, which names the group.
 * @stable
 */
const MenuGroupLabel = withElement(
  "div",
  defineComponent({
    name: "MenuGroupLabel",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof menuPrimitive, "group-label">,
    setup() {
      const group = useGroup()
      if (!group) {
        throw new Error(
          "<MenuGroupLabel> must be used inside <MenuGroup> or <MenuRadioGroup>."
        )
      }
      // Keyed by its group, so each group's label is a part of its own.
      return usePart(menuPrimitive, "group-label", () => ({ id: group, group }))
    },
  })
)

/**
 * A line between items or groups.
 * @stable
 */
const MenuSeparator = parts.Separator

/**
 * A submenu. Put its `MenuSubTrigger` and `MenuSubContent` inside, in a menu's content.
 * @stable
 */
const MenuSub = /* @__PURE__ */ renderless(
  defineComponent({
    name: "MenuSub",
    props: {
      open: optionalBoolean,
      modelValue: optionalBoolean,
      defaultOpen: optionalBoolean,
      delay: Number,
      loop: optionalBoolean,
      controller: Object as PropType<MenuController<any>>,
      debug: optionalBoolean,
    },
    emits: {
      "update:open": (_open: boolean) => true,
      "update:modelValue": (_open: boolean) => true,
      openChange: (_open: boolean, _details: OpenDetails) => true,
      openChangeComplete: (_open: boolean) => true,
    },
    setup(props, { slots, emit }) {
      const parent = useMenu()
      // Its parts inside use this instance, the nearest.
      usePrimitive(menuPrimitive, () => ({
        ...props,
        open: orModel(props.open, props.modelValue),
        parent: parent.api,
        onOpenChange: (open: boolean, details: OpenDetails) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("openChange", open, details)
          if (details.canceled) {
            return
          }
          emit("update:open", open)
          emit("update:modelValue", open)
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
      }))
      return () => slots.default?.()
    },
  })
)

/**
 * The item that opens its submenu.
 * @stable
 */
const MenuSubTrigger = withElement(
  "div",
  defineComponent({
    name: "MenuSubTrigger",
    inheritAttrs: false,
    props: { disabled: optionalBoolean },
    slots: Object as PartSlots<typeof menuPrimitive, "trigger">,
    setup(props) {
      return usePart(menuPrimitive, "trigger", () => ({
        disabled: props.disabled,
      }))
    },
  })
)

/**
 * The submenu's popup, positioned beside its trigger.
 * @stable
 */
const MenuSubContent = MenuContent

/**
 * Renders a data menu's items as bare parts. Used by a Menu with `items` when you place no `MenuContent`
 * of your own, and available for custom layouts.
 * @stable
 */
const MenuItems = /* @__PURE__ */ renderless(
  defineComponent({
    name: "MenuItems",
    props: {
      items: { type: Array as PropType<MenuData>, required: true },
    },
    setup(props) {
      // check-code: allow return-type recursive, so TypeScript cannot infer it.
      const render = (items: MenuData): VNode[] =>
        items.map((entry, index) => {
          const item: MenuDataItem =
            typeof entry === "string" ? { value: entry, label: entry } : entry
          switch (item.type) {
            case undefined:
            case "item":
              return h(
                MenuItem,
                {
                  key: item.value,
                  value: item.value,
                  disabled: item.disabled,
                  shortcut: item.shortcut,
                  closeOnSelect: item.closeOnSelect,
                  destructive: item.destructive,
                },
                () => item.label
              )
            case "separator":
              return h(MenuSeparator, { key: `separator-${index}` })
            case "group":
              return h(MenuGroup, { key: `group-${index}` }, () => [
                item.label && h(MenuGroupLabel, null, () => item.label),
                ...render(item.items),
              ])
            case "checkbox":
              return h(
                MenuCheckboxItem,
                {
                  key: item.value,
                  value: item.value,
                  disabled: item.disabled,
                  checked: item.checked,
                  defaultChecked: item.defaultChecked,
                  closeOnSelect: item.closeOnSelect,
                },
                () => item.label
              )
            case "radio-group":
              return h(
                MenuRadioGroup,
                {
                  key: item.name,
                  name: item.name,
                  value: item.value,
                  defaultValue: item.defaultValue,
                },
                () => [
                  item.label && h(MenuGroupLabel, null, () => item.label),
                  ...item.items.map((radio) =>
                    h(
                      MenuRadioItem,
                      {
                        key: radio.value,
                        value: radio.value,
                        disabled: radio.disabled,
                      },
                      () => radio.label
                    )
                  ),
                ]
              )
            case "submenu":
              return h(MenuSub, { key: `submenu-${index}` }, () => [
                h(
                  MenuSubTrigger,
                  { disabled: item.disabled },
                  () => item.label
                ),
                h(MenuSubContent, null, () => render(item.items)),
              ])
          }
        })
      return () => render(props.items)
    },
  })
)

export { createMenuController } from "@ui-sdk/core/menu"
export type {
  MenuApi,
  MenuCheckboxItemProps,
  MenuCheckboxItemState,
  MenuActionDetails,
  MenuCheckedChangeDetails,
  MenuCheckedChangeReason,
  MenuContentProps,
  MenuContentState,
  MenuContextTriggerProps,
  MenuContextTriggerState,
  MenuController,
  MenuData,
  MenuDataItem,
  MenuDismissReason,
  MenuFinalFocus,
  MenuItemIconProps,
  MenuItemIconState,
  MenuItemIndicatorProps,
  MenuItemIndicatorState,
  MenuItemProps,
  MenuItemState,
  MenuOpenChangeReason,
  MenuOpenOptions,
  MenuOptions,
  MenuPayloadChangeReason,
  MenuPrimitive,
  MenuRadioGroupProps,
  MenuRadioGroupState,
  MenuRadioItemProps,
  MenuRadioItemState,
  MenuSubTriggerProps,
  MenuTriggerProps,
  MenuTriggerState,
  MenuValueChangeDetails,
  MenuValueChangeReason,
} from "@ui-sdk/core/menu"

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuContextTrigger,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuItemIndicator,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
}
