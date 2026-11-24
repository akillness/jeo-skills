"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

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
          <ChevronLeftIcon />
        </CarouselPrevious>
        <CarouselViewport>
          <CarouselContent>
            {photos.map((photo) => (
              <CarouselItem key={photo.name}>
                <div data-slot="tile">{photo.name}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </CarouselViewport>
        <CarouselNext aria-label="Next slide">
          <ChevronRightIcon />
        </CarouselNext>
      </div>
    </Carousel>
  )
}

export { Example }
