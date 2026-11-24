<script lang="ts">
  import {
    Carousel,
    CarouselContent,
    CarouselIndicator,
    CarouselIndicatorGroup,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
  } from "../../src/carousel"
</script>

<Carousel aria-label="Featured" defaultPage={2}>
  <CarouselViewport>
    <CarouselContent>
      <CarouselItem>One</CarouselItem>
      <CarouselItem>Two</CarouselItem>
    </CarouselContent>
  </CarouselViewport>
  <CarouselPrevious>Previous</CarouselPrevious>
  <CarouselNext>Next</CarouselNext>
  <CarouselIndicatorGroup aria-label="Choose a slide">
    <CarouselIndicator page={1}>1</CarouselIndicator>
    <CarouselIndicator page={2}>2</CarouselIndicator>
  </CarouselIndicatorGroup>
</Carousel>
