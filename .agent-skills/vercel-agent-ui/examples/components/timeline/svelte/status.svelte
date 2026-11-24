<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
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
  } from "@ui-sdk/svelte/timeline"

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

  const controller = createTimelineController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => controller.focus("shipped")}>
      Go to Current Step
    </button>
  </div>
  <Timeline aria-label="Order status" {controller}>
    {#each steps as step (step.value)}
      <TimelineItem value={step.value} status={step.status}>
        <TimelineMarker>
          {#if step.status === "complete"}
            <CheckIcon aria-hidden="true" />
          {/if}
        </TimelineMarker>
        <TimelineConnector />
        <TimelineTitle>{step.title}</TimelineTitle>
        <TimelineTime datetime={step.dateTime}>{step.time}</TimelineTime>
        <TimelineDescription>{step.description}</TimelineDescription>
      </TimelineItem>
    {/each}
  </Timeline>
</div>
