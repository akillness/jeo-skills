// Importing this defines <ui-segmented-control> and its parts. On the server it does nothing.
import { defineSegmentedControlElements } from "../segmented-control"

defineSegmentedControlElements()

export type {
  SegmentedControlApi,
  SegmentedControlChangeOptions,
  SegmentedControlController,
  SegmentedControlDirection,
  SegmentedControlIndicatorState,
  SegmentedControlItemProps,
  SegmentedControlItemState,
  SegmentedControlOptions,
  SegmentedControlOrientation,
  SegmentedControlPrimitive,
  SegmentedControlState,
  SegmentedControlValueChangeReason,
} from "@ui-sdk/core/segmented-control"
export type {
  SegmentedControlEvents,
  UiSegmentedControlElement,
  UiSegmentedControlItemElement,
} from "../events"
export { createSegmentedControlController } from "@ui-sdk/core/segmented-control"
