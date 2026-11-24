import type { PopupContainer } from "../popup.svelte"

const ContainerKey = Symbol("trigger-menu-container")
const GroupKey = Symbol("trigger-menu-group")
// Whether a TriggerMenuContent is among the root's children, so the menu
// knows whether to render its own.
const OwnContentKey = Symbol("trigger-menu-own-content")

type ContainerContext = () => PopupContainer

export { type ContainerContext, ContainerKey, GroupKey, OwnContentKey }
