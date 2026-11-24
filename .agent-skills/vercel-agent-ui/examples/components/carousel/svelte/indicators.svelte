<script lang="ts">
  import {
    Carousel,
    CarouselContent,
    CarouselIndicator,
    CarouselIndicatorGroup,
    CarouselItem,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"

  const photos = [
    { name: "Dunes" },
    { name: "Forest" },
    { name: "Glacier" },
    { name: "Canyon" },
    { name: "Meadow" },
    { name: "Harbor" },
  ]
</script>

<Carousel aria-label="Photos">
  <CarouselViewport>
    <CarouselContent>
      {#each photos as photo (photo.name)}
        <CarouselItem>
          <div data-slot="tile">
            {photo.name}
          </div>
        </CarouselItem>
      {/each}
    </CarouselContent>
  </CarouselViewport>
  <CarouselIndicatorGroup aria-label="Choose a photo">
    {#each photos as photo, index (photo.name)}
      <CarouselIndicator page={index + 1} aria-label={photo.name} />
    {/each}
  </CarouselIndicatorGroup>
</Carousel>
