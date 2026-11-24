<!--
@component
The popover's title, which names it. A level 2 heading by default.
@stable
-->
<script lang="ts">
  import { popover } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"h2"> = $props()

  const title = usePart(popover, "title")
</script>

<Part tag="h2" part={title} {props} />
