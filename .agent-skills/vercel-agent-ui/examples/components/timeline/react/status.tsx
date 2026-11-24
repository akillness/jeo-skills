"use client"

import {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
  createTimelineController,
  type TimelineStatus,
} from "@ui-sdk/react/timeline"
import { CheckIcon } from "lucide-react"
import * as React from "react"

const steps: {
  value: string
  title: string
  dateTime: string
  time: string
  description: string
  status: TimelineStatus
}[] = [
  {
    value: "placed",
    title: "Order placed",
    dateTime: "2026-11-01",
    time: "Nov 1",
    description: "We received your order.",
    status: "complete",
  },
  {
    value: "packed",
    title: "Packed",
    dateTime: "2026-11-02",
    time: "Nov 2",
    description: "Your items left the shelf.",
    status: "complete",
  },
  {
    value: "shipped",
    title: "Shipped",
    dateTime: "2026-11-03",
    time: "Nov 3",
    description: "On its way with the carrier.",
    status: "current",
  },
  {
    value: "delivered",
    title: "Delivered",
    dateTime: "2026-11-05",
    time: "Nov 5",
    description: "Expected by Thursday.",
    status: "upcoming",
  },
]

function Example() {
  const [controller] = React.useState(() => createTimelineController())
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button onClick={() => controller.focus("shipped")}>
          Go to Current Step
        </button>
      </div>
      <Timeline aria-label="Order status" controller={controller}>
        {steps.map((step) => (
          <TimelineItem
            key={step.value}
            value={step.value}
            status={step.status}
          >
            <TimelineMarker>
              {step.status === "complete" && <CheckIcon aria-hidden="true" />}
            </TimelineMarker>
            <TimelineConnector />
            <TimelineTitle>{step.title}</TimelineTitle>
            <TimelineTime dateTime={step.dateTime}>{step.time}</TimelineTime>
            <TimelineDescription>{step.description}</TimelineDescription>
          </TimelineItem>
        ))}
      </Timeline>
    </div>
  )
}

export { Example }
