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

  const photos = [
    { name: "Dunes" },
    { name: "Forest" },
    { name: "Glacier" },
    { name: "Canyon" },
    { name: "Meadow" },
    { name: "Harbor" },
  ]

  let nextFocused = false
  const rememberFocus = () => {
    nextFocused =
      typeof document !== "undefined" &&
      document.activeElement?.getAttribute("data-slot") === "carousel-next"
  }
  const focusIf = (link: HTMLElement) => {
    if (nextFocused) {
      link.focus()
    }
  }
</script>

<Carousel aria-label="Photos" onPageChange={rememberFocus}>
  <CarouselViewport>
    <CarouselContent>
      {#each photos as photo (photo.name)}
        <CarouselItem>
          {#snippet children(state)}
            <div data-slot="tile">
              {photo.name}
              <span data-slot="hint">
                {state.index + 1} / {photos.length}{state.active
                  ? " · showing"
                  : ""}
              </span>
            </div>
          {/snippet}
        </CarouselItem>
      {/each}
    </CarouselContent>
  </CarouselViewport>
  <div data-slot="row">
    <CarouselPrevious>
      <ChevronLeftIcon />
      Previous
    </CarouselPrevious>
    <CarouselNext>
      {#snippet render({ props, state })}
        {#if state.disabled}
          <a use:focusIf href="https://example.com/gallery">See all photos</a>
        {:else}
          <button {...props}>
            Next
            <ChevronRightIcon />
          </button>
        {/if}
      {/snippet}
    </CarouselNext>
  </div>
</Carousel>
