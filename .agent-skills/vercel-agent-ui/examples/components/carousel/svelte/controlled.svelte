<script lang="ts">
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"
  import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  const slides = [1, 2, 3, 4, 5]

  let page = $state(1)
</script>

<Carousel
  bind:page
  aria-label="Featured"
  onPageChange={(next, details) => log(`Page ${next} (${details.reason})`)}
>
  <div data-slot="row">
    <CarouselPrevious aria-label="Previous slide">
      <ChevronLeftIcon />
    </CarouselPrevious>
    <CarouselViewport>
      <CarouselContent>
        {#each slides as slide (slide)}
          <CarouselItem>
            <div data-slot="tile">{slide}</div>
          </CarouselItem>
        {/each}
      </CarouselContent>
    </CarouselViewport>
    <CarouselNext aria-label="Next slide">
      <ChevronRightIcon />
    </CarouselNext>
  </div>
</Carousel>
