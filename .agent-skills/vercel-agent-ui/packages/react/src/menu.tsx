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
import {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "@ui-sdk/core/renderer"
import * as React from "react"
import { hasChild, Placed, usePlaceContent, usePlacedContent } from "./children"
import { MenubarContext } from "./menubar-context"
import {
  Connected,
  renderPopup,
  sheetViewport,
  useOwnContainer,
  usePopupContainer,
  useControllerEntry,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  HandleScope,
  reading,
  renderElement,
  sharesProps,
  useAround,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(menuPrimitive, {
  trigger: "button",
  shortcut: "span",
  separator: "div",
})
// Radio items take their group's name, and read its value as it renders.
sharesProps(menuPrimitive, "radio-group")

// Where root popups render. Set on <Menu> or <MenuContent>.
const ContainerContext = React.createContext<PopupContainer>(undefined)
const GroupContext = React.createContext<string | null>(null)
// The checkbox or radio item an indicator belongs to.
const ItemContext = React.createContext<{
  item: "checkbox-item" | "radio-item"
  itemKey: string
  group?: string
} | null>(null)

function useMenu() {
  return useHandle(menuPrimitive)
}

// The name of the radio group around the part rendering, in this menu.
function useRadioGroup() {
  return useAround(menuPrimitive, "radio-group")?.name as string | undefined
}

// Element props that mean something else on a menu part.
type Clashing =
  "value" | "defaultValue" | "onChange" | "onSelect" | "defaultChecked"

/**
 * The props of `Menu`.
 * @stable
 */
type MenuProps = MenuOptions & {
  children?: React.ReactNode
}

/**
 * A list of actions and options, opened from a button or a right-click. Put its trigger and content inside.
 * @stable
 */
function Menu({ children, items, container, ...options }: MenuProps) {
  const menubar = React.useContext(MenubarContext)
  const menu = usePrimitive(menuPrimitive, {
    items,
    ...options,
    menubar: menubar ? reading(menubar, () => menubar.api) : undefined,
  })
  useControllerEntry(options.controller, menu)
  // A data menu renders its content, unless the app placed a MenuContent: in
  // the markup, or inside a component of its own.
  const found = hasChild(children, MenuContent)
  const [placed, place] = usePlacedContent(!!items && !found)
  const own = placed || found
  return (
    <HandleScope handle={menu}>
      <ContainerContext.Provider value={container}>
        {/* A menu inside this one's content is no item of the menubar. */}
        <MenubarContext.Provider value={null}>
          <Placed value={place}>{children}</Placed>
        </MenubarContext.Provider>
        <Placed value={null}>
          {items && !own && (
            <MenuContent>
              <MenuItems items={items} />
            </MenuContent>
          )}
        </Placed>
      </ContainerContext.Provider>
    </HandleScope>
  )
}

type TriggerProps = MenuTriggerProps

/**
 * The button that opens the menu. A trigger outside the menu connects through `controller`.
 * @stable
 */
function MenuTrigger({
  controller,
  ...props
}: Omit<PartProps<"button", MenuTriggerState>, Clashing> & TriggerProps) {
  const {
    disabled,
    focusableWhenDisabled,
    payload: _,
    shortcut: __,
    render,
    ...rest
  } = props
  // Until the menu it names mounts, a trigger outside the menu is a plain button.
  const unconnected = () =>
    renderElement(
      "button",
      {
        type: "button",
        disabled: disabled && !focusableWhenDisabled,
        "aria-disabled": (disabled && focusableWhenDisabled) || undefined,
        ...rest,
      },
      render,
      {
        open: false,
        disabled: !!disabled,
      }
    )
  return (
    <Connected
      primitive={menuPrimitive}
      controller={controller}
      fallback={unconnected}
    >
      <parts.Trigger {...props} />
    </Connected>
  )
}

/**
 * An area that opens the menu at the pointer on a right-click or a long press, and on Shift+F10.
 * @stable
 */
function MenuContextTrigger({
  controller,
  ...props
}: PartProps<"div", MenuContextTriggerState> & MenuContextTriggerProps) {
  const { disabled, payload: _, render, ...rest } = props
  const unconnected = () =>
    renderElement("div", rest, render, { open: false, disabled: !!disabled })
  return (
    <Connected
      primitive={menuPrimitive}
      controller={controller}
      fallback={unconnected}
    >
      <ContextTriggerPart {...props} />
    </Connected>
  )
}

function ContextTriggerPart({
  disabled,
  payload,
  ...props
}: PartProps<"div", MenuContextTriggerState> & MenuContextTriggerProps) {
  const menu = useMenu()
  menu.instance.use(menuContextTrigger)
  return usePart(
    menu,
    "context-trigger",
    { id: React.useId(), disabled, payload },
    props
  )
}

/**
 * The popup that holds the items, positioned against the trigger that opened it.
 * @stable
 */
function MenuContent<Payload = unknown>({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  finalFocus,
  keepMounted,
  container,
  render,
  ...props
}: PartProps<"div", MenuContentState<Payload>> & MenuContentProps) {
  usePlaceContent()
  const menu = useMenu()
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    finalFocus,
    keepMounted,
  }
  // Submenus render inside their parent's popup.
  const nested = menu.api.root() !== menu.api
  // The payload's type is the app's, from `Payload`; the part hands its state on as it is.
  const partProps = {
    ...props,
    render: nested ? render : sheetViewport(menu, render),
  } as PartProps<"div", MenuContentState>
  const element = usePart(menu, "content", content, partProps)
  return element && (nested ? element : renderPopup(element, target))
}

/**
 * An action. Pressing it runs its `onSelect` and closes the menu, unless `closeOnSelect` is false.
 * @stable
 */
function MenuItem({
  value,
  label,
  disabled,
  shortcut,
  closeOnSelect,
  destructive,
  onSelect,
  render,
  children,
  ...props
}: Omit<PartProps<"div", MenuItemState>, Clashing> & MenuItemProps) {
  const menu = useMenu()
  const id = React.useId()
  const item = {
    id,
    value,
    label,
    disabled,
    shortcut,
    closeOnSelect,
    destructive,
    onSelect,
  }
  const content = (state: MenuItemState) => (
    <>
      {typeof children === "function" ? children(state) : children}
      {shortcut && (
        <MenuShortcut>
          {formatShortcut(shortcut, menu.state.apple)}
        </MenuShortcut>
      )}
    </>
  )
  return usePart(menu, "item", item, { ...props, children: content, render })
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
function MenuCheckboxItem({
  value,
  label,
  disabled,
  checked,
  defaultChecked,
  onCheckedChange,
  closeOnSelect,
  render,
  ...props
}: Omit<PartProps<"div", MenuCheckboxItemState>, Clashing> &
  MenuCheckboxItemProps) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const item = {
    value,
    label,
    disabled,
    checked,
    defaultChecked,
    onCheckedChange,
    closeOnSelect,
  }
  const indicator = React.useMemo(
    () => ({ item: "checkbox-item" as const, itemKey: value }),
    [value]
  )
  return (
    <ItemContext.Provider value={indicator}>
      {usePart(menu, "checkbox-item", item, { ...props, render })}
    </ItemContext.Provider>
  )
}

/**
 * Radio items that share one value. `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function MenuRadioGroup<T extends string = string>({
  name,
  value,
  defaultValue,
  onValueChange,
  render,
  ...props
}: Omit<PartProps<"div", MenuRadioGroupState>, Clashing> &
  MenuRadioGroupProps<T>) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const generated = React.useId()
  const group = name ?? generated
  const part = {
    id: group,
    name: group,
    value,
    defaultValue,
    onValueChange: onValueChange as MenuRadioGroupProps["onValueChange"],
  }
  return usePart(menu, "radio-group", part, { ...props, render })
}

/**
 * An item in a `MenuRadioGroup`. Pressing it checks its value.
 * @stable
 */
function MenuRadioItem({
  value,
  label,
  disabled,
  closeOnSelect,
  render,
  ...props
}: Omit<PartProps<"div", MenuRadioItemState>, Clashing> & MenuRadioItemProps) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const group = useRadioGroup()
  const item = { group: group ?? "", value, label, disabled, closeOnSelect }
  const indicator = React.useMemo(
    () => ({ item: "radio-item" as const, itemKey: value, group: group ?? "" }),
    [value, group]
  )
  if (!group) {
    throw new Error("<MenuRadioItem> must be used inside <MenuRadioGroup>.")
  }
  return (
    <ItemContext.Provider value={indicator}>
      {usePart(menu, "radio-item", item, { ...props, render })}
    </ItemContext.Provider>
  )
}

/**
 * The check or dot inside a checkbox or radio item. Rendered while the item is checked, or always with `keepMounted`.
 * @stable
 */
function MenuItemIndicator({
  keepMounted,
  render,
  ...props
}: PartProps<"span", MenuItemIndicatorState> & MenuItemIndicatorProps) {
  const menu = useMenu()
  menu.instance.use(menuCheckable)
  const id = React.useId()
  const item = React.useContext(ItemContext)
  if (!item) {
    throw new Error(
      "<MenuItemIndicator> must be used inside a checkbox or radio item."
    )
  }
  const indicator = { id, ...item, keepMounted }
  return usePart(
    menu,
    "item-indicator",
    indicator,
    { ...props, render },
    "span"
  )
}

/**
 * An icon inside an item or a submenu trigger. Screen readers and typeahead skip it, and `mirror`
 * flips it in right-to-left text.
 * @stable
 */
function MenuItemIcon({
  mirror,
  render,
  ...props
}: PartProps<"span", MenuItemIconState> & MenuItemIconProps) {
  const menu = useMenu()
  menu.instance.use(menuItemIcons)
  const part = { id: React.useId(), mirror }
  return usePart(menu, "item-icon", part, { ...props, render }, "span")
}

/**
 * A group of items, named by its `MenuGroupLabel`.
 * @stable
 */
function MenuGroup(props: PartProps<"div">) {
  const id = React.useId()
  // It's named by its label once the label is in the page.
  return (
    <GroupContext.Provider value={id}>
      {usePart(useMenu(), "group", { id }, props)}
    </GroupContext.Provider>
  )
}

/**
 * The group's heading, which names the group.
 * @stable
 */
function MenuGroupLabel({ render, ...props }: PartProps<"div">) {
  const menu = useMenu()
  const radioGroup = useRadioGroup()
  const plainGroup = React.useContext(GroupContext)
  const group = radioGroup ?? plainGroup
  if (!group) {
    throw new Error(
      "<MenuGroupLabel> must be used inside <MenuGroup> or <MenuRadioGroup>."
    )
  }
  return usePart(
    menu,
    "group-label",
    { id: group, group },
    { ...props, render },
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
> & { children?: React.ReactNode }

/**
 * A submenu. Put its `MenuSubTrigger` and `MenuSubContent` inside, in a menu's content.
 * @stable
 */
function MenuSub({ children, ...options }: MenuSubProps) {
  const parent = useMenu()
  const menu = usePrimitive(menuPrimitive, { ...options, parent: parent.api })
  return <HandleScope handle={menu}>{children}</HandleScope>
}

/**
 * The item that opens its submenu.
 * @stable
 */
function MenuSubTrigger({
  disabled,
  ...props
}: Omit<PartProps<"div", MenuTriggerState>, Clashing> & MenuSubTriggerProps) {
  return usePart(useMenu(), "trigger", { disabled }, props)
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
function MenuItems({ items }: { items: MenuData }) {
  return items.map((entry, index) => {
    const item: MenuDataItem =
      typeof entry === "string" ? { value: entry, label: entry } : entry
    switch (item.type) {
      case undefined:
      case "item":
        return (
          <MenuItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            shortcut={item.shortcut}
            closeOnSelect={item.closeOnSelect}
            destructive={item.destructive}
          >
            {item.label}
          </MenuItem>
        )
      case "separator":
        return <MenuSeparator key={`separator-${index}`} />
      case "group":
        return (
          <MenuGroup key={`group-${index}`}>
            {item.label && <MenuGroupLabel>{item.label}</MenuGroupLabel>}
            <MenuItems items={item.items} />
          </MenuGroup>
        )
      case "checkbox":
        return (
          <MenuCheckboxItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            checked={item.checked}
            defaultChecked={item.defaultChecked}
            closeOnSelect={item.closeOnSelect}
          >
            {item.label}
          </MenuCheckboxItem>
        )
      case "radio-group":
        return (
          <MenuRadioGroup
            key={item.name}
            name={item.name}
            value={item.value}
            defaultValue={item.defaultValue}
          >
            {item.label && <MenuGroupLabel>{item.label}</MenuGroupLabel>}
            {item.items.map((radio) => (
              <MenuRadioItem
                key={radio.value}
                value={radio.value}
                disabled={radio.disabled}
              >
                {radio.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )
      case "submenu":
        return (
          <MenuSub key={`submenu-${index}`}>
            <MenuSubTrigger disabled={item.disabled}>
              {item.label}
            </MenuSubTrigger>
            <MenuSubContent>
              <MenuItems items={item.items} />
            </MenuSubContent>
          </MenuSub>
        )
    }
  })
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
