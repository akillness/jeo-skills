<script lang="ts">
  import { ChevronDownIcon, ChevronUpIcon } from "@lucide/svelte"
  import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"

  const slides = [1, 2, 3, 4, 5]
</script>

<Carousel aria-label="Featured" orientation="vertical">
  <CarouselViewport>
    <CarouselContent>
      {#each slides as slide (slide)}
        <CarouselItem>
          <div data-slot="tile">
            {slide}
          </div>
        </CarouselItem>
      {/each}
    </CarouselContent>
  </CarouselViewport>
  <div data-slot="row">
    <CarouselPrevious aria-label="Previous slide">
      <ChevronUpIcon />
    </CarouselPrevious>
    <CarouselNext aria-label="Next slide">
      <ChevronDownIcon />
    </CarouselNext>
  </div>
</Carousel>
