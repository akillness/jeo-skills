import { timeline } from "@ui-sdk/core/timeline"
import { createParts } from "./use-primitive"

const parts = createParts(timeline, {
  root: "div",
  item: "div",
  marker: "div",
  connector: "div",
  time: "time",
  title: "div",
  description: "div",
})

/**
 * A list of dated events, like an activity feed or an order's history, with
 * one tab stop and arrow keys between events. `feed` makes it a feed of
 * articles that loads more as people scroll.
 * @experimental
 */
const Timeline = parts.Root

/**
 * One event. Arrow keys move between events, and links and buttons inside
 * stay in the tab order.
 * @experimental
 */
const TimelineItem = parts.Item

/**
 * The dot or icon that marks its event on the line. Hidden from assistive
 * technology.
 * @experimental
 */
const TimelineMarker = parts.Marker

/**
 * The line between its event's marker and the next one. Hidden from assistive
 * technology.
 * @experimental
 */
const TimelineConnector = parts.Connector

/**
 * When its event happened, as a `<time>`. Pass `datetime` so machines can read
 * it. It describes the event.
 * @experimental
 */
const TimelineTime = parts.Time

/**
 * What happened. It names its event.
 * @experimental
 */
const TimelineTitle = parts.Title

/**
 * More about its event. It describes the event.
 * @experimental
 */
const TimelineDescription = parts.Description

export { createTimelineController } from "@ui-sdk/core/timeline"
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

export {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
}
