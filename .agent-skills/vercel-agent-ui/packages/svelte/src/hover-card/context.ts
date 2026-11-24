import type { hoverCard } from "@ui-sdk/core/hover-card"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type HoverCardContext = PrimitiveHandle<typeof hoverCard>

// Where the popup renders. Set on <HoverCard> or <HoverCardContent>.
const ContainerKey = Symbol("hover-card-container")

type ContainerContext = () => PopupContainer

export { type ContainerContext, ContainerKey, type HoverCardContext }
