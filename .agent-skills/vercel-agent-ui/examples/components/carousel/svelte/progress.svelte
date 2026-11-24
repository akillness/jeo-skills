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
</script>

<Carousel
  aria-label="Featured"
  onPageChangeComplete={(page) => log(`Rested on slide ${page}`)}
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
  <div data-slot="row">
    <div data-slot="bar">
      <div></div>
    </div>
  </div>
</Carousel>
