<script lang="ts">
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"
  import {
    Carousel,
    CarouselContent,
    CarouselIndicator,
    CarouselIndicatorGroup,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"

  const products = [1, 2, 3, 4, 5, 6, 7, 8]
</script>

<Carousel aria-label="Products" slidesPerPage={3}>
  <div data-slot="row">
    <CarouselPrevious aria-label="Previous page">
      <ChevronLeftIcon />
    </CarouselPrevious>
    <CarouselViewport>
      <CarouselContent>
        {#each products as product (product)}
          <CarouselItem>
            <div data-slot="tile">{product}</div>
          </CarouselItem>
        {/each}
      </CarouselContent>
    </CarouselViewport>
    <CarouselNext aria-label="Next page">
      <ChevronRightIcon />
    </CarouselNext>
  </div>
  <div data-slot="row">
    <CarouselIndicatorGroup aria-label="Choose a page">
      {#snippet children(state)}
        {#each { length: state.pageCount ?? 3 }, index (index)}
          <CarouselIndicator
            page={index + 1}
            aria-label={`Page ${index + 1}`}
          />
        {/each}
      {/snippet}
    </CarouselIndicatorGroup>
  </div>
</Carousel>
