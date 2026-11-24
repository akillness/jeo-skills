"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

const nextFocused = () =>
  typeof document !== "undefined" &&
  document.activeElement?.getAttribute("data-slot") === "carousel-next"

function Example() {
  return (
    <Carousel aria-label="Photos">
      <CarouselViewport>
        <CarouselContent>
          {photos.map((photo) => (
            <CarouselItem key={photo.name}>
              {(state) => (
                <div data-slot="tile">
                  {photo.name}
                  <span data-slot="hint">
                    {state.index + 1} / {photos.length}
                    {state.active && " · showing"}
                  </span>
                </div>
              )}
            </CarouselItem>
          ))}
        </CarouselContent>
      </CarouselViewport>
      <div data-slot="row">
        <CarouselPrevious>
          <ChevronLeftIcon />
          Previous
        </CarouselPrevious>
        <CarouselNext
          render={(props, state) =>
            state.disabled ? (
              <a
                href="https://example.com/gallery"
                ref={nextFocused() ? (link) => link?.focus() : undefined}
              >
                See all photos
              </a>
            ) : (
              <button {...props}>
                Next
                <ChevronRightIcon />
              </button>
            )
          }
        />
      </div>
    </Carousel>
  )
}

export { Example }
