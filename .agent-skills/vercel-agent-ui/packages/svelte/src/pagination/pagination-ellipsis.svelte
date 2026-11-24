<!--
@component
A gap in the range. Hidden from screen readers, since the links around it
say which pages there are. Shows "…" unless it has content.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let { children, ...rest }: PartProps<"span", {}> = $props()

  const ellipsis = useHandlePart(
    usePagination("PaginationEllipsis"),
    "ellipsis"
  )
</script>

{#snippet fallback()}…{/snippet}

<Part
  tag="span"
  part={ellipsis}
  props={{ ...rest, children: children ?? fallback }}
/>
