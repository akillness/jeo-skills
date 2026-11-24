<!--
@component
The toast's title. Renders the toast's `title` when it has no children, and nothing when it has neither.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import Content from "./content.svelte"
  import { useToast } from "./context"

  /** The toast's title. Renders the toast's `title` without content of its own, and nothing when it has neither. */
  let { children, ...rest }: PartProps<"div"> = $props()

  const { region, toast } = useToast("ToastTitle")
  const title = useHandlePart(region, "title", () => ({ id: toast().id }))
  const content = $derived(toast().title)
</script>

{#snippet fallback()}<Content content={content!} />{/snippet}

{#if children || content != null}
  <Part
    tag="div"
    part={title}
    props={{ ...rest, children: children ?? fallback }}
  />
{/if}
