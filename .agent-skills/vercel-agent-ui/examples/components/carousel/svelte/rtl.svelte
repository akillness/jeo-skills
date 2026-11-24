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

  const slides = [1, 2, 3, 4, 5]
</script>

<div dir="rtl">
  <Carousel aria-label="مميز">
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
      <CarouselPrevious aria-label="الشريحة السابقة">
        <ChevronLeftIcon />
      </CarouselPrevious>
      <CarouselIndicatorGroup aria-label="اختر شريحة">
        {#each slides as slide (slide)}
          <CarouselIndicator page={slide} aria-label={`الشريحة ${slide}`} />
        {/each}
      </CarouselIndicatorGroup>
      <CarouselNext aria-label="الشريحة التالية">
        <ChevronRightIcon />
      </CarouselNext>
    </div>
  </Carousel>
</div>
