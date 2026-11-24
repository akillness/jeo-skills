<!--
@component
A visible label for the field.
@stable
-->
<script lang="ts">
  import { autocomplete } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"label"> = $props()

  const label = usePart(autocomplete, "label")
</script>

<Part tag="label" part={label} {props} />
