<!--
@component
Opens the file picker. Inside a Field, the field's label names it with the
button's own text. Outside the file input, it connects through `controller`.
@stable
-->
<script lang="ts">
  import {
    fileInput as fileInputPrimitive,
    type FileInputState,
    type FileInputTriggerProps,
  } from "@ui-sdk/core/file-input"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import type { FileInputContext } from "./context"
  import TriggerBinding from "./file-input-trigger-binding.svelte"

  let {
    controller,
    ...rest
  }: PartProps<"button", FileInputState> & FileInputTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<FileInputContext | undefined>(fileInputPrimitive)
  )
  const fileInput = $derived(connected())
</script>

{#if fileInput}
  <TriggerBinding owner={fileInput} {...rest} />
{:else}
  <!-- Until the file input it names mounts, a trigger outside it is a plain button. -->
  <Part
    tag="button"
    part={plainPart(
      { value: [], disabled: false, required: false, dragging: false },
      { type: "button" }
    )}
    props={rest}
  />
{/if}
