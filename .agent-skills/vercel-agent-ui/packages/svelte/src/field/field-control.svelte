<!--
@component
A native control: an <input> by default, or anything through `render`.
@stable
-->
<script lang="ts">
  import type { FieldState } from "@ui-sdk/core/field"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { outsidePart, useField } from "./context"

  let props: PartProps<"input", FieldState> = $props()

  const field = useField()
  const control = field
    ? useHandlePart(field, "control", () => ({
        id: props.id,
        describedBy: props["aria-describedby"] ?? undefined,
      }))
    : outsidePart("control")
</script>

<Part tag="input" part={control} props={{ name: field?.name(), ...props }} />
