<!--
@component
The toast's description. Renders the toast's `description` when it has no children, and nothing when it has
neither.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import Content from "./content.svelte"
  import { useToast } from "./context"

  /** The toast's description. Renders the toast's `description` without content of its own, and nothing when it has neither. */
  let { children, ...rest }: PartProps<"div"> = $props()

  const { region, toast } = useToast("ToastDescription")
  const description = useHandlePart(region, "description", () => ({
    id: toast().id,
  }))
  const content = $derived(toast().description)
</script>

{#snippet fallback()}<Content content={content!} />{/snippet}

{#if children || content != null}
  <Part
    tag="div"
    part={description}
    props={{ ...rest, children: children ?? fallback }}
  />
{/if}
