<!--
@component
The button that opens the dialog. A trigger outside the dialog, like one per table row, connects through
`controller`.
@stable
-->
<script lang="ts">
  import type {
    AlertDialogController,
    DialogController,
    DialogTriggerProps,
    DialogTriggerState,
  } from "@ui-sdk/core/dialog"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import {
    DialogKey,
    TriggerKey,
    type DialogContext,
    type TriggerContext,
  } from "./context"
  import TriggerBinding from "./dialog-trigger-binding.svelte"

  let {
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    controller,
    ...rest
  }: PartProps<"button", DialogTriggerState> &
    Omit<DialogTriggerProps, "controller"> & {
      /** Connects a trigger outside the dialog to the dialog with this controller. */
      controller?: DialogController<any, any> | AlertDialogController<any, any>
    } = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<DialogContext | undefined>(DialogKey)
  )
  const dialog = $derived(connected())
  setContext<TriggerContext>(TriggerKey, {
    shortcut: () => shortcut,
    dialog: () => dialog,
  })
</script>

{#if dialog}
  <TriggerBinding
    owner={dialog}
    {disabled}
    {focusableWhenDisabled}
    {payload}
    {shortcut}
    {...rest}
  />
{:else}
  <!-- Until the dialog it names mounts, a trigger outside the dialog is a plain button. -->
  <Part
    tag="button"
    part={plainPart(
      { open: false, disabled: !!disabled },
      {
        type: "button",
        disabled: disabled && !focusableWhenDisabled,
        "aria-disabled": (disabled && focusableWhenDisabled) || undefined,
      }
    )}
    props={rest}
  />
{/if}
