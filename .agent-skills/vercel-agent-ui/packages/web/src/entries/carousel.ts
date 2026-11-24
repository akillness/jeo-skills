// Importing this defines <ui-carousel> and its parts. On the server it does nothing.
import { defineCarouselElements } from "../carousel"

defineCarouselElements()

export type {
  CarouselAlign,
  CarouselApi,
  CarouselContentState,
  CarouselControlProps,
  CarouselController,
  CarouselIndicatorGroupState,
  CarouselIndicatorProps,
  CarouselIndicatorState,
  CarouselItemState,
  CarouselNextState,
  CarouselOptions,
  CarouselOrientation,
  CarouselPageChangeReason,
  CarouselPageOptions,
  CarouselPlayToggleState,
  CarouselPlayingChangeReason,
  CarouselPlayingOptions,
  CarouselPreviousState,
  CarouselPrimitive,
  CarouselSlidesPerPage,
  CarouselState,
  CarouselStepState,
  CarouselViewportState,
} from "@ui-sdk/core/carousel"
export type { CarouselEvents, UiCarouselElement } from "../events"
export { createCarouselController } from "@ui-sdk/core/carousel"
