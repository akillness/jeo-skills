import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

function Example() {
  const log = useLog()
  return (
    <Carousel
      aria-label="Photos"
      defaultPlaying
      interval={4000}
      onPlayingChange={(playing, details) =>
        log(`${playing ? "Playing" : "Stopped"} (${details.reason})`)
      }
    >
      <div data-slot="controls">
        <CarouselPlayToggle>
          {(state) => (state.playing ? "Pause" : "Play")}
        </CarouselPlayToggle>
      </div>
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </CarouselPrevious>
        <CarouselViewport>
          <CarouselContent>
            <For each={photos}>
              {(photo) => (
                <CarouselItem>
                  <div data-slot="tile">{photo.name}</div>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
        </CarouselViewport>
        <CarouselNext aria-label="Next slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </CarouselNext>
      </div>
    </Carousel>
  )
}

export { Example }
