// Importing this defines <ui-rating> and its parts. On the server it does nothing.
import { defineRatingElements } from "../rating"

defineRatingElements()

export type {
  RatingApi,
  RatingChangeOptions,
  RatingController,
  RatingItemProps,
  RatingItemState,
  RatingOptions,
  RatingPrimitive,
  RatingState,
  RatingValueChangeReason,
} from "@ui-sdk/core/rating"
export type { RatingEvents, UiRatingElement } from "../events"
export { createRatingController, ratingItemValues } from "@ui-sdk/core/rating"
