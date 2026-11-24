<!--
@component
Names the field set. Keep it the set's first child, where a <legend> names it natively.
@stable
-->
<script lang="ts">
  import type { FieldSetState } from "@ui-sdk/core/field"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { FieldSetKey, type FieldSetContext } from "./context"

  let props: PartProps<"legend", FieldSetState> = $props()

  const set = getContext<FieldSetContext | undefined>(FieldSetKey)
  if (!set) {
    throw new Error("FieldLegend must be used inside <FieldSet>.")
  }
  const legend = useHandlePart(set, "legend", () => ({ id: props.id }))
</script>

<Part tag="legend" part={legend} {props} />
