import type { combobox } from "@ui-sdk/core/combobox"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type ComboboxContext = PrimitiveHandle<typeof combobox>

const ContainerKey = Symbol("combobox-container")
const GroupKey = Symbol("combobox-group")
const ItemKey = Symbol("combobox-item")
const ChipKey = Symbol("combobox-chip")
// Whether a ComboboxContent is among the root's children, so a data combobox
// knows whether to render its own.
const OwnContentKey = Symbol("combobox-own-content")

type ContainerContext = () => PopupContainer
type ItemContext = () => { key: string; label?: string }
type ChipContext = () => unknown

export {
  type ChipContext,
  ChipKey,
  type ComboboxContext,
  type ContainerContext,
  ContainerKey,
  GroupKey,
  type ItemContext,
  ItemKey,
  OwnContentKey,
}
