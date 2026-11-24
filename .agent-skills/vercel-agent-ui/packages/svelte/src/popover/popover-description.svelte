<!--
@component
Describes the popover while it's rendered. A paragraph by default.
@stable
-->
<script lang="ts">
  import { popover } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"p"> = $props()

  const description = usePart(popover, "description")
</script>

<Part tag="p" part={description} {props} />
