<script lang="ts">
  import {
    Pagination,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationList,
    PaginationNext,
  } from "../../src/pagination"

  let { getHref }: { getHref?: (page: number) => string } = $props()
</script>

<Pagination aria-label="Pages" pageCount={10} defaultPage={5} {getHref}>
  <PaginationList>
    {#snippet children(state)}
      {#each state.items as item (item)}
        <PaginationItem>
          {#if typeof item === "number"}
            <PaginationLink page={item} />
          {:else}
            <PaginationEllipsis />
          {/if}
        </PaginationItem>
      {/each}
      <PaginationItem><PaginationNext>Next</PaginationNext></PaginationItem>
    {/snippet}
  </PaginationList>
</Pagination>
