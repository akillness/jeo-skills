import { formatShortcut } from "@ui-sdk/core"
import {
  menu as menuPrimitive,
  type MenuCheckboxItemProps,
  type MenuCheckboxItemState,
  type MenuContentProps,
  type MenuContentState,
  type MenuContextTriggerProps,
  type MenuContextTriggerState,
  type MenuData,
  type MenuDataItem,
  type MenuItemIconProps,
  type MenuItemIconState,
  type MenuItemIndicatorProps,
  type MenuItemIndicatorState,
  type MenuItemProps,
  type MenuItemState,
  type MenuOptions,
  type MenuRadioGroupProps,
  type MenuRadioGroupState,
  type MenuRadioItemProps,
  type MenuRadioItemState,
  type MenuSubTriggerProps,
  type MenuTriggerProps,
  type MenuTriggerState,
} from "@ui-sdk/core/menu"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  merge,
  omit,
  onCleanup,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { MenubarContext } from "./menubar-context"
import {
  renderPopup,
  sheetViewport,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createChildFlag,
  createParts,
  providePrimitive,
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"
import {
  attrs,
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "@ui-sdk/core/renderer"

const parts = createParts(menuPrimitive, { separator: "div", shortcut: "span" })

type MenuContextValue = PrimitiveHandle<typeof menuPrimitive>

const MenuContext = createContext<MenuContextValue | null>(null)
// Where root popups render. Set on <Menu> or <MenuContent>.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// Whether shortcuts show Apple's glyphs, from the root menu.
const AppleContext = createContext<() => boolean>(() => false)
// Where a MenuContent among the menu's children says it's there, so a data
// menu renders its own content only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null
)
const GroupContext = createContext<string | null>(null)
// A radio group's name, and its value for the items that key on it.
const RadioGroupContext = createContext<{
  name: () => string
  value: () => MenuRadioGroupState["value"]
} | null>(null)
// The checkbox or radio item an indicator belongs to.
const ItemContext = createContext<{
  item: "checkbox-item" | "radio-item"
  itemKey: () => string
  group?: () => string
  checked?: () => boolean | undefined
} | null>(null)

function useMenu() {
  const context = useContext(MenuContext)
  if (!context) {
    throw new Error("Menu parts must be used inside <Menu>.")
  }
  return context
}

// Element props that mean something else on a menu part.
type Clashing =
  "value" | "defaultValue" | "onChange" | "onSelect" | "defaultChecked"

/**
 * The props of `Menu`.
 * @stable
 */
type MenuProps = MenuOptions & {
  children?: JSX.Element
}

/**
 * A list of actions and options, opened from a button or a right-click. Put its trigger and content inside.
 * @stable
 */
const Menu = /* @__PURE__ */ rootScope(function Menu(props: MenuProps) {
  const menubar = useContext(MenubarContext)
  const options = omit(props, "children", "container")
  const menu = usePrimitive(menuPrimitive, () => ({
    ...options,
    menubar: menubar ? () => menubar.api : undefined,
  }))
  useControllerEntry(() => props.controller, menu)
  const apple = appleSignal(menu)
  // Written by a MenuContent among the children, while the children render.
  const [hasContent, setHasContent] = createChildFlag()
  return (
    <MenuContext value={menu}>
      <ContainerContext value={() => props.container}>
        <AppleContext value={apple}>
          {providePrimitive(menu, () => (
            <>
              {/* A menu inside this one's content is no item of the menubar. */}
              <MenubarContext value={null}>
                <OwnContentContext value={setHasContent}>
                  {props.children}
                </OwnContentContext>
              </MenubarContext>
              <OwnContentContext value={null}>
                <Show when={props.items && !hasContent()}>
                  <MenuContent>
                    <MenuItems items={props.items ?? []} />
                  </MenuContent>
                </Show>
              </OwnContentContext>
            </>
          ))}
        </AppleContext>
      </ContainerContext>
    </MenuContext>
  )
})

// Children, called with the part's state when they're a function of it.
const withState = (children: unknown, state: unknown) =>
  (typeof children === "function" ? children(state) : children) as JSX.Element

// Shortcut text is neutral until the client binds, so the server and the
// first client render agree, and the platform's glyphs follow a moment later.
// Item state doesn't carry it, so the root menu listens once for every item.
function appleSignal(menu: MenuContextValue) {
  // Written from core's listeners, which can fire inside a disposal, like a
  // `For` removing a row whose trigger names this menu's controller.
  const [apple, setApple] = createSignal(
    untrack(() => menu.state.apple),
    { ownedWrite: true }
  )
  createEffect(
    () => 0,
    () => {
      const sync = () => setApple(menu.state.apple)
      const unsubscribe = menu.instance.subscribe(sync)
      // The client may have bound between the first read and now.
      sync()
      return unsubscribe
    }
  )
  return apple
}

type TriggerProps = MenuTriggerProps

/**
 * The button that opens the menu. A trigger outside the menu connects through `controller`.
 * @stable
 */
function MenuTrigger(
  props: Omit<PartProps<"button", MenuTriggerState>, Clashing> & TriggerProps
) {
  const menu = useControllerTarget(
    () => props.controller,
    useContext(MenuContext)
  )
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller"
  )
  return (
    <Show
      when={menu()}
      keyed
      // Until the menu it names mounts, a trigger outside the menu is a plain button.
      fallback={renderStatic(
        "button",
        () => ({
          attrs: {},
          state: { open: false, disabled: !!props.disabled },
        }),
        merge(rest, {
          type: "button",
          get disabled() {
            return props.disabled && !props.focusableWhenDisabled
          },
          get "aria-disabled"() {
            return (props.disabled && props.focusableWhenDisabled) || undefined
          },
        })
      )}
    >
      {(menu) =>
        triggerPart(
          menu,
          "trigger",
          "button",
          () => ({
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            payload: props.payload,
            shortcut: props.shortcut,
          }),
          rest
        )
      }
    </Show>
  )
}

/**
 * An area that opens the menu at the pointer on a right-click or a long press, and on Shift+F10.
 * @stable
 */
function MenuContextTrigger(
  props: PartProps<"div", MenuContextTriggerState> & MenuContextTriggerProps
) {
  const menu = useControllerTarget(
    () => props.controller,
    useContext(MenuContext)
  )
  const rest = omit(props, "disabled", "payload", "controller")
  return (
    <Show
      when={menu()}
      keyed
      fallback={renderStatic(
        "div",
        () => ({
          attrs: {},
          state: { open: false, disabled: !!props.disabled },
        }),
        rest
      )}
    >
      {(menu) => (
        menu.instance.use(menuContextTrigger),
        triggerPart(
          menu,
          "context-trigger",
          "div",
          () => ({ disabled: props.disabled, payload: props.payload }),
          rest
        )
      )}
    </Show>
  )
}

// The bound part of a trigger or context area, once its menu is known.
function triggerPart(
  menu: MenuContextValue,
  slot: "trigger" | "context-trigger",
  tag: keyof JSX.IntrinsicElements,
  trigger: () => MenuTriggerProps | MenuContextTriggerProps,
  props: Record<string, any>
) {
  const id = createUniqueId()
  return usePart(menu, slot, () => ({ id, ...trigger() }), props, tag)
}

/**
 * The popup that holds the items, positioned against the trigger that opened it.
 * @stable
 */
function MenuContent<Payload = unknown>(
  props: PartProps<"div", MenuContentState<Payload>> & MenuContentProps
) {
  const menu = useMenu()
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    finalFocus: props.finalFocus,
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
    "finalFocus",
    "keepMounted",
    "container"
  )
  const element = () => usePart(menu, "content", content, rest, "div")
  // Submenus render inside their parent's popup.
  const nested = menu.api.root() !== menu.api
  // A root content tells its menu it's there. A submenu's content is no menu's own content.
  const register = nested ? null : useContext(OwnContentContext)
  register?.(true)
  onCleanup(() => register?.(false))
  return (
    <Show when={menu.present("content", content)}>
      {nested
        ? element()
        : renderPopup(() => sheetViewport(menu, element), target)}
    </Show>
  )
}

/**
 * An action. Pressing it runs its `onSelect` and closes the menu, unless `closeOnSelect` is false.
 * @stable
 */
function MenuItem(
  props: Omit<PartProps<"div", MenuItemState>, Clashing> & MenuItemProps
) {
  const menu = useMenu()
  const apple = useContext(AppleContext)
  const id = createUniqueId()
  const item = () => ({
    id,
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    shortcut: props.shortcut,
    closeOnSelect: props.closeOnSelect,
    destructive: props.destructive,
    onSelect: props.onSelect,
  })
  const rest = omit(
    props,
    "value",
    "label",
    "disabled",
    "shortcut",
    "closeOnSelect",
    "destructive",
    "onSelect"
  )
  const withShortcut = merge(rest, {
    get children() {
      return (state: MenuItemState) => (
        <>
          {withState(rest.children, state)}
          <Show when={props.shortcut}>
            {(shortcut) => (
              <MenuShortcut>{formatShortcut(shortcut(), apple())}</MenuShortcut>
            )}
          </Show>
        </>
      )
    },
  })
  return usePart(menu, "item", item, withShortcut, "div")
}

/**
 * Shows the keys of an item's shortcut, like `⌘S`, inside the item. Hidden from screen readers.
 * @stable
 */
const MenuShortcut = parts.Shortcut

/**
 * An item that checks and unchecks an option.
 * @stable
 */
function MenuCheckboxItem(
  props: Omit<PartProps<"div", MenuCheckboxItemState>, Clashing> &
    MenuCheckboxItemProps
) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const item = () => ({
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    checked: props.checked,
    defaultChecked: props.defaultChecked,
    onCheckedChange: props.onCheckedChange,
    closeOnSelect: props.closeOnSelect,
  })
  const rest = omit(
    props,
    "value",
    "label",
    "disabled",
    "checked",
    "defaultChecked",
    "onCheckedChange",
    "closeOnSelect"
  )
  // A controlled item changes `checked` without writing the store its
  // indicator selects, so the indicator follows the prop here.
  const indicator = {
    item: "checkbox-item" as const,
    itemKey: () => props.value,
    checked: () => props.checked,
  }
  return (
    <ItemContext value={indicator}>
      {usePart(menu, "checkbox-item", item, rest, "div")}
    </ItemContext>
  )
}

/**
 * Radio items that share one value. `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function MenuRadioGroup<T extends string = string>(
  props: Omit<PartProps<"div", MenuRadioGroupState>, Clashing> &
    MenuRadioGroupProps<T>
) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const generated = createUniqueId()
  const group = () => props.name ?? generated
  const part = () => ({
    id: group(),
    name: group(),
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange as MenuRadioGroupProps["onValueChange"],
  })
  const rest = omit(props, "name", "value", "defaultValue", "onValueChange")
  // Core answers the items' checked state from the props the group last
  // recorded, which nothing records again when only a controlled `value`
  // changes. Items read the value through this memo, so the record is fresh
  // before core reads it for them.
  const recorded = createMemo(() => {
    const current = part()
    attrs(menu.instance.part("radio-group", current))
    return current.value
  })
  // The context goes inside the group's element, where its state is.
  const withContext = merge(rest, {
    // Read inside the provider, so the items render inside it.
    get children() {
      return (state: MenuRadioGroupState) => (
        <RadioGroupContext
          value={{ name: group, value: () => (recorded(), state.value) }}
        >
          {withState(rest.children, state)}
        </RadioGroupContext>
      )
    },
  })
  return usePart(menu, "radio-group", part, withContext, "div")
}

/**
 * An item in a `MenuRadioGroup`. Pressing it checks its value.
 * @stable
 */
function MenuRadioItem(
  props: Omit<PartProps<"div", MenuRadioItemState>, Clashing> &
    MenuRadioItemProps
) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const radioGroup = useContext(RadioGroupContext)
  if (!radioGroup) {
    throw new Error("<MenuRadioItem> must be used inside <MenuRadioGroup>.")
  }
  // The group's value decides whether the item is checked, and a controlled
  // group changes it without touching the item, so the item follows it here.
  const group = () => (radioGroup.value(), radioGroup.name())
  const item = () => ({
    group: group(),
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    closeOnSelect: props.closeOnSelect,
  })
  const rest = omit(props, "value", "label", "disabled", "closeOnSelect")
  const indicator = {
    item: "radio-item" as const,
    itemKey: () => props.value,
    group,
  }
  return (
    <ItemContext value={indicator}>
      {usePart(menu, "radio-item", item, rest, "div")}
    </ItemContext>
  )
}

/**
 * The check or dot inside a checkbox or radio item. Rendered while the item is checked, or always with `keepMounted`.
 * @stable
 */
function MenuItemIndicator(
  props: PartProps<"span", MenuItemIndicatorState> & MenuItemIndicatorProps
) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const id = createUniqueId()
  const item = useContext(ItemContext)
  if (!item) {
    throw new Error(
      "<MenuItemIndicator> must be used inside a checkbox or radio item."
    )
  }
  const indicator = () => (
    item.checked?.(),
    {
      id,
      item: item.item,
      itemKey: item.itemKey(),
      group: item.group?.(),
      keepMounted: props.keepMounted,
    }
  )
  return usePart(
    menu,
    "item-indicator",
    indicator,
    omit(props, "keepMounted"),
    "span"
  )
}

/**
 * An icon inside an item or a submenu trigger. Screen readers and typeahead skip it, and `mirror`
 * flips it in right-to-left text.
 * @stable
 */
function MenuItemIcon(
  props: PartProps<"span", MenuItemIconState> & MenuItemIconProps
) {
  const menu = useMenu()
  menu.instance.use(menuItemIcons)
  const id = createUniqueId()
  return usePart(
    menu,
    "item-icon",
    () => ({ id, mirror: props.mirror }),
    omit(props, "mirror"),
    "span"
  )
}

/**
 * A group of items, named by its `MenuGroupLabel`.
 * @stable
 */
function MenuGroup(props: PartProps<"div">) {
  const menu = useMenu()
  const id = createUniqueId()
  // It's named by its label once the label is in the page.
  return (
    <GroupContext value={id}>
      {usePart(menu, "group", () => ({ id }), props, "div")}
    </GroupContext>
  )
}

/**
 * The group's heading, which names the group.
 * @stable
 */
function MenuGroupLabel(props: PartProps<"div">) {
  const menu = useMenu()
  const radioGroup = useContext(RadioGroupContext)
  const plainGroup = useContext(GroupContext)
  if (!radioGroup && !plainGroup) {
    throw new Error(
      "<MenuGroupLabel> must be used inside <MenuGroup> or <MenuRadioGroup>."
    )
  }
  const group = () => radioGroup?.name() ?? plainGroup ?? ""
  return usePart(
    menu,
    "group-label",
    () => ({ id: group(), group: group() }),
    props,
    "div"
  )
}

/**
 * A line between items or groups.
 * @stable
 */
const MenuSeparator = parts.Separator

/**
 * The props of `MenuSub`.
 * @stable
 */
type MenuSubProps = Pick<
  MenuOptions,
  | "open"
  | "defaultOpen"
  | "onOpenChange"
  | "onOpenChangeComplete"
  | "loop"
  | "delay"
  | "controller"
  | "debug"
> & { children?: JSX.Element }

/**
 * A submenu. Put its `MenuSubTrigger` and `MenuSubContent` inside, in a menu's content.
 * @stable
 */
const MenuSub = /* @__PURE__ */ rootScope(function MenuSub(
  props: MenuSubProps
) {
  const parent = useMenu()
  const options = omit(props, "children")
  const menu = usePrimitive(menuPrimitive, () => ({
    ...options,
    parent: parent.api,
  }))
  return (
    <MenuContext value={menu}>
      {providePrimitive(menu, () => props.children)}
    </MenuContext>
  )
})

/**
 * The item that opens its submenu.
 * @stable
 */
function MenuSubTrigger(
  props: Omit<PartProps<"div", MenuTriggerState>, Clashing> &
    MenuSubTriggerProps
) {
  const menu = useMenu()
  return usePart(
    menu,
    "trigger",
    () => ({ disabled: props.disabled }),
    omit(props, "disabled"),
    "div"
  )
}

/**
 * The submenu's popup, positioned beside its trigger.
 * @stable
 */
const MenuSubContent = MenuContent

/**
 * Renders a data menu's items as bare parts. Used by `<Menu items>` when you place no `MenuContent`
 * of your own, and available for custom layouts.
 * @stable
 */
function MenuItems(props: { items: MenuData }) {
  // Keyed as React keys them: items and checkboxes by value, radio groups by
  // name, the rest by position, so a rebuilt list keeps its rows.
  const entries = createMemo(() =>
    props.items.map((entry, index) => {
      const item: MenuDataItem =
        typeof entry === "string" ? { value: entry, label: entry } : entry
      return { key: entryKey(item, index), item }
    })
  )
  return (
    <For each={entries()} keyed={(entry) => entry.key}>
      {(entry) => <MenuEntry item={entry().item} />}
    </For>
  )
}

function entryKey(item: MenuDataItem, index: number) {
  switch (item.type) {
    case undefined:
    case "item":
    case "checkbox":
      return `${item.type ?? "item"}:${item.value}`
    case "radio-group":
      return `radio-group:${item.name}`
    default:
      return `${item.type}:${index}`
  }
}

type Entry<Type extends MenuDataItem["type"]> = Extract<
  MenuDataItem,
  { type?: Type }
>

// One row of a data menu. Its key fixes its type, so the type is read once
// and the fields follow the entry as it changes.
function MenuEntry(props: { item: MenuDataItem }) {
  // Narrowed by the key, which `entryKey` builds from the type.
  const entry = <Type extends MenuDataItem["type"]>() =>
    props.item as Entry<Type>
  switch (untrack(() => props.item.type)) {
    case undefined:
    case "item": {
      const item = entry<"item">
      return (
        <MenuItem
          value={item().value}
          disabled={item().disabled}
          shortcut={item().shortcut}
          closeOnSelect={item().closeOnSelect}
          destructive={item().destructive}
        >
          {item().label}
        </MenuItem>
      )
    }
    case "separator":
      return <MenuSeparator />
    case "group": {
      const group = entry<"group">
      return (
        <MenuGroup>
          <Show when={group().label}>
            <MenuGroupLabel>{group().label}</MenuGroupLabel>
          </Show>
          <MenuItems items={group().items} />
        </MenuGroup>
      )
    }
    case "checkbox": {
      const item = entry<"checkbox">
      return (
        <MenuCheckboxItem
          value={item().value}
          disabled={item().disabled}
          checked={item().checked}
          defaultChecked={item().defaultChecked}
          closeOnSelect={item().closeOnSelect}
        >
          {item().label}
        </MenuCheckboxItem>
      )
    }
    case "radio-group": {
      const group = entry<"radio-group">
      return (
        <MenuRadioGroup
          name={group().name}
          value={group().value}
          defaultValue={group().defaultValue}
        >
          <Show when={group().label}>
            <MenuGroupLabel>{group().label}</MenuGroupLabel>
          </Show>
          <For each={group().items} keyed={(radio) => radio.value}>
            {(radio) => (
              <MenuRadioItem value={radio().value} disabled={radio().disabled}>
                {radio().label}
              </MenuRadioItem>
            )}
          </For>
        </MenuRadioGroup>
      )
    }
    case "submenu": {
      const submenu = entry<"submenu">
      return (
        <MenuSub>
          <MenuSubTrigger disabled={submenu().disabled}>
            {submenu().label}
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItems items={submenu().items} />
          </MenuSubContent>
        </MenuSub>
      )
    }
  }
}

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
  type MenuProps,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  type MenuSubProps,
  MenuSubTrigger,
  MenuTrigger,
}
