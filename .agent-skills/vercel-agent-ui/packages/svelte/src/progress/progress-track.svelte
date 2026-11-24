<!--
@component
The rail the indicator fills.
@stable
-->
<script lang="ts">
  import { progress, type ProgressState } from "@ui-sdk/core/progress"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ProgressState> = $props()

  const track = usePart(progress, "track")
</script>

<Part tag="div" part={track} {props} />
