<script lang="ts">
  import {
    Carousel,
    CarouselContent,
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

  let page = $state(1)
  let block: HTMLElement | undefined = $state()
  const follow = (next: number) =>
    block
      ?.querySelectorAll("button")
      [next - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" })
</script>

<div data-slot="stack" bind:this={block}>
  <Carousel bind:page aria-label="Photos" onPageChange={follow}>
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
  </Carousel>
  <Carousel aria-label="Thumbnails" dragFree slidesPerPage="auto">
    <CarouselViewport>
      <CarouselContent>
        {#each photos as photo, index (photo.name)}
          <CarouselItem aria-label={photo.name}>
            <button
              type="button"
              aria-pressed={page === index + 1}
              onclick={() => (page = index + 1)}
            >
              {photo.name}
            </button>
          </CarouselItem>
        {/each}
      </CarouselContent>
    </CarouselViewport>
  </Carousel>
</div>
