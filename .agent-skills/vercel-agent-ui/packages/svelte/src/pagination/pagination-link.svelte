<!--
@component
A page. The current one has `aria-current="page"`. Shows its number unless it has content.
@stable
-->
<script lang="ts">
  import type {
    PaginationLinkProps,
    PaginationLinkState,
  } from "@ui-sdk/core/pagination"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePagination } from "./context"

  let {
    page,
    children,
    ...rest
  }: PartProps<"a", PaginationLinkState> & PaginationLinkProps = $props()

  const pagination = usePagination("PaginationLink")
  const link = useHandlePart(pagination, "link", () => ({
    page,
    id: String(page),
  }))
</script>

{#snippet fallback()}{page}{/snippet}

<Part
  tag={pagination.tag()}
  part={link}
  props={{ ...rest, children: children ?? fallback }}
/>
