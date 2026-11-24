// Importing this defines <ui-timeline> and its parts. On the server it does nothing.
import { defineTimelineElements } from "../timeline"

defineTimelineElements()

export type {
  TimelineApi,
  TimelineConnectorState,
  TimelineController,
  TimelineDescriptionState,
  TimelineItemProps,
  TimelineItemState,
  TimelineMarkerState,
  TimelineOptions,
  TimelineOrientation,
  TimelinePrimitive,
  TimelineState,
  TimelineStatus,
  TimelineTimeState,
  TimelineTitleState,
} from "@ui-sdk/core/timeline"
export type { UiTimelineElement } from "../events"
export { createTimelineController } from "@ui-sdk/core/timeline"
