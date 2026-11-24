import type { menu } from "@ui-sdk/core/menu"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type MenuContext = PrimitiveHandle<typeof menu>

const GroupKey = Symbol("menu-group")
const RadioGroupKey = Symbol("menu-radio-group")
// Where root popups render. Set on <Menu> or <MenuContent>.
const ContainerKey = Symbol("menu-container")
// The checkbox or radio item an indicator belongs to.
const ItemKey = Symbol("menu-item")
// Whether a MenuContent is among the root's children, so a data menu knows
// whether to render its own.
const OwnContentKey = Symbol("menu-own-content")

type ContainerContext = () => PopupContainer
// A group's name, and its controlled value as a getter: the core reads a
// controlled value from what the group last rendered, not from state it
// notifies, so the items read it too and render again when it changes.
type RadioGroupContext = {
  name: string
  value: () => string | null | undefined
}
type ItemContext = () => {
  item: "checkbox-item" | "radio-item"
  itemKey: string
  group?: string
}

export {
  type ContainerContext,
  ContainerKey,
  GroupKey,
  type ItemContext,
  ItemKey,
  type MenuContext,
  OwnContentKey,
  type RadioGroupContext,
  RadioGroupKey,
}
