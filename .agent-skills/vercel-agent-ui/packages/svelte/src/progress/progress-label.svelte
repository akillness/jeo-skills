<!--
@component
Names the progress bar.
@stable
-->
<script lang="ts">
  import { progress, type ProgressState } from "@ui-sdk/core/progress"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span", ProgressState> = $props()

  const label = usePart(progress, "label")
</script>

<Part tag="span" part={label} {props} />
