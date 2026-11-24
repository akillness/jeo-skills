<script lang="ts">
  import {
    Timeline,
    TimelineConnector,
    TimelineItem,
    TimelineMarker,
    TimelineTime,
    TimelineTitle,
  } from "@ui-sdk/svelte/timeline"

  const milestones = [
    { title: "Kickoff", dateTime: "2026-01", time: "January" },
    { title: "Design review", dateTime: "2026-03", time: "March" },
    { title: "Beta", dateTime: "2026-06", time: "June" },
    { title: "Launch", dateTime: "2026-09", time: "September" },
  ]
</script>

<Timeline orientation="horizontal" loop={false} aria-label="Roadmap">
  {#each milestones as milestone (milestone.title)}
    <TimelineItem>
      <TimelineMarker />
      <TimelineConnector />
      <TimelineTitle>{milestone.title}</TimelineTitle>
      <TimelineTime datetime={milestone.dateTime}>
        {milestone.time}
      </TimelineTime>
    </TimelineItem>
  {/each}
</Timeline>
