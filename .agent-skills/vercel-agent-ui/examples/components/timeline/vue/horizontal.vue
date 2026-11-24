<script setup lang="ts">
import {
  Timeline,
  TimelineConnector,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@ui-sdk/vue/timeline"

const milestones = [
  { title: "Kickoff", dateTime: "2026-01", time: "January" },
  { title: "Design review", dateTime: "2026-03", time: "March" },
  { title: "Beta", dateTime: "2026-06", time: "June" },
  { title: "Launch", dateTime: "2026-09", time: "September" },
]
</script>

<template>
  <Timeline orientation="horizontal" :loop="false" aria-label="Roadmap">
    <TimelineItem v-for="milestone in milestones" :key="milestone.title">
      <TimelineMarker />
      <TimelineConnector />
      <TimelineTitle>{{ milestone.title }}</TimelineTitle>
      <TimelineTime :datetime="milestone.dateTime">
        {{ milestone.time }}
      </TimelineTime>
    </TimelineItem>
  </Timeline>
</template>
