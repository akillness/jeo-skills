// Importing this defines <ui-scroll-area> and its parts. On the server it does nothing.
import { defineScrollAreaElements } from "../scroll-area"

defineScrollAreaElements()

export type {
  ScrollAreaController,
  ScrollAreaOptions,
  ScrollAreaPrimitive,
  ScrollAreaScrollOptions,
  ScrollAreaScrollToEndState,
  ScrollAreaScrollbarProps,
  ScrollAreaScrollbarState,
  ScrollAreaState,
  ScrollAreaThumbState,
  ScrollAreaType,
} from "@ui-sdk/core/scroll-area"
export type { UiScrollAreaElement } from "../events"
export { createScrollAreaController } from "@ui-sdk/core/scroll-area"
