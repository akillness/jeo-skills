<!--
@component
The button that opens the list: a combobox named by the label. Typing on it selects the item that matches.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectTriggerProps,
    type SelectTriggerState,
  } from "@ui-sdk/core/select"
  import { getContext } from "svelte"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, wrapPart, type PartProps } from "../use-primitive.svelte"
  import type { SelectContext } from "./context"
  import TriggerBinding from "./select-trigger-binding.svelte"

  let {
    disabled,
    controller,
    ...rest
  }: PartProps<"button", SelectTriggerState> & SelectTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<SelectContext | undefined>(selectPrimitive)
  )
  const select = $derived(connected())
  const control = useFieldControl()?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"]
  )
</script>

{#if select}
  <TriggerBinding owner={select} {control} {disabled} {...rest} />
{:else}
  <!-- Until the select it names mounts, a trigger outside the select is a plain button. -->
  <Part
    tag="button"
    part={wrapPart(
      plainPart(
        {
          open: false,
          disabled: !!disabled,
          readOnly: false,
          required: false,
          placeholder: true,
        },
        { type: "button" }
      ),
      control
    )}
    props={rest}
  />
{/if}
