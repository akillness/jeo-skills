<script lang="ts">
  import { Timeline, TimelineItem, TimelineTitle } from "../../src/timeline"

  let { feed }: { feed: boolean } = $props()
</script>

<Timeline aria-label="Updates" {feed}>
  <TimelineItem value="a"><TimelineTitle>A</TimelineTitle></TimelineItem>
  <TimelineItem value="b"><TimelineTitle>B</TimelineTitle></TimelineItem>
</Timeline>
