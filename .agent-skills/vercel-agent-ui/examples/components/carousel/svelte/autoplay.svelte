<script lang="ts">
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"
  import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPlayToggle,
    CarouselPrevious,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  const photos = [
    { name: "Dunes" },
    { name: "Forest" },
    { name: "Glacier" },
    { name: "Canyon" },
    { name: "Meadow" },
    { name: "Harbor" },
  ]
</script>

<Carousel
  aria-label="Photos"
  defaultPlaying
  interval={4000}
  onPlayingChange={(playing, details) =>
    log(`${playing ? "Playing" : "Stopped"} (${details.reason})`)}
>
  <div data-slot="controls">
    <CarouselPlayToggle>
      {#snippet children(state)}
        {state.playing ? "Pause" : "Play"}
      {/snippet}
    </CarouselPlayToggle>
  </div>
  <div data-slot="row">
    <CarouselPrevious aria-label="Previous slide">
      <ChevronLeftIcon />
    </CarouselPrevious>
    <CarouselViewport>
      <CarouselContent>
        {#each photos as photo (photo.name)}
          <CarouselItem>
            <div data-slot="tile">{photo.name}</div>
          </CarouselItem>
        {/each}
      </CarouselContent>
    </CarouselViewport>
    <CarouselNext aria-label="Next slide">
      <ChevronRightIcon />
    </CarouselNext>
  </div>
</Carousel>
