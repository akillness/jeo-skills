<script lang="ts">
  import { ArrowLeftIcon, ArrowRightIcon } from "@lucide/svelte"
  import {
    Pagination,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationList,
    PaginationNext,
    PaginationPrevious,
  } from "@ui-sdk/svelte/pagination"
</script>

<Pagination aria-label="Pagination" pageCount={10}>
  <PaginationList>
    {#snippet children(state)}
      <PaginationItem>
        <PaginationPrevious aria-label="Previous page">
          {#snippet render({ props, state: step })}
            <button
              {...props}
              title={step.disabled ? undefined : `Go to page ${step.page}`}
            >
              <ArrowLeftIcon aria-hidden="true" />
              {#if !step.disabled}
                <span aria-hidden="true">{step.page}</span>
              {/if}
            </button>
          {/snippet}
        </PaginationPrevious>
      </PaginationItem>
      {#each state.items as item (item)}
        <PaginationItem>
          {#if typeof item === "number"}
            <PaginationLink page={item}>
              {#snippet children(link)}
                {link.current ? `Page ${link.page}` : link.page}
              {/snippet}
            </PaginationLink>
          {:else}
            <PaginationEllipsis />
          {/if}
        </PaginationItem>
      {/each}
      <PaginationItem>
        <PaginationNext aria-label="Next page">
          {#snippet render({ props, state: step })}
            <button
              {...props}
              title={step.disabled ? undefined : `Go to page ${step.page}`}
            >
              {#if !step.disabled}
                <span aria-hidden="true">{step.page}</span>
              {/if}
              <ArrowRightIcon aria-hidden="true" />
            </button>
          {/snippet}
        </PaginationNext>
      </PaginationItem>
    {/snippet}
  </PaginationList>
</Pagination>
