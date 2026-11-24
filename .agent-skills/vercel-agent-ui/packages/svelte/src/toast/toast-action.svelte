<!--
@component
The toast's action, like Undo. Renders the toast's `action` label when it has no children, as a link when
the action has an `href`. A Promise from its handler keeps the toast open and the button pending.
@stable
-->
<script lang="ts">
  import type { ToastActionProps, ToastButtonState } from "@ui-sdk/core/toast"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import Content from "./content.svelte"
  import { useToast } from "./context"

  /**
   * The toast's action, like Undo. Renders the toast's `action` label without
   * content of its own, as a link when the action has an `href`. A Promise from
   * its handler keeps the toast open and the button pending.
   */
  let {
    onAction,
    dismiss,
    children,
    ...rest
  }: PartProps<"button", ToastButtonState> & ToastActionProps = $props()

  const { region, toast } = useToast("ToastAction")
  const id = $props.id()
  const part = useHandlePart(region, "action", () => ({
    id,
    toast: toast().id,
    onAction,
    dismiss,
  }))
  const action = $derived(toast().action)
  const href = $derived(action?.href)
</script>

{#snippet fallback()}{#if action}<Content
      content={action.label}
    />{/if}{/snippet}

{#if action || onAction}
  <Part
    tag={href ? "a" : "button"}
    {part}
    props={{
      ...(href ? { href } : { type: "button" }),
      ...rest,
      children: children ?? fallback,
    }}
  />
{/if}
