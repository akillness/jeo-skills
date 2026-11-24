import type { select } from "@ui-sdk/core/select"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type SelectContext = PrimitiveHandle<typeof select>

const ContainerKey = Symbol("select-container")
const GroupKey = Symbol("select-group")
const ItemKey = Symbol("select-item")
// Whether a SelectContent is among the root's children, so a data select
// knows whether to render its own.
const OwnContentKey = Symbol("select-own-content")

type ContainerContext = () => PopupContainer
type ItemContext = () => { key: string; label?: string }

export {
  type ContainerContext,
  ContainerKey,
  GroupKey,
  type ItemContext,
  ItemKey,
  OwnContentKey,
  type SelectContext,
}
