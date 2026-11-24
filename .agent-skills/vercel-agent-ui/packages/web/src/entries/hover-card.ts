// Importing this defines <ui-hover-card> and its parts. On the server it does nothing.
import { defineHoverCardElements } from "../hover-card"

defineHoverCardElements()

export type {
  HoverCardApi,
  HoverCardArrowState,
  HoverCardContentProps,
  HoverCardContentState,
  HoverCardController,
  HoverCardOpenChangeReason,
  HoverCardOptions,
  HoverCardPayloadChangeReason,
  HoverCardPrimitive,
  HoverCardTriggerProps,
  HoverCardTriggerState,
} from "@ui-sdk/core/hover-card"
export type { HoverCardEvents, UiHoverCardElement } from "../events"
export { createHoverCardController } from "@ui-sdk/core/hover-card"
