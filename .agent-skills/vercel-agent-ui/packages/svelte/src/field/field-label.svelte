<!--
@component
The field's label, which names its control. Outside a Field it's a plain
<label>, which labels the control inside it, like a card around a whole Field.
@stable
-->
<script lang="ts">
  import type { FieldState } from "@ui-sdk/core/field"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { outsidePart, useField } from "./context"

  let props: PartProps<"label", FieldState> = $props()

  const field = useField()
  const label = field
    ? useHandlePart(field, "label", () => ({ id: props.id }))
    : outsidePart("label")
</script>

<Part tag="label" part={label} {props} />
