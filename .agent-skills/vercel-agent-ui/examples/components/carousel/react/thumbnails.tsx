"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import * as React from "react"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

function Example() {
  const [page, setPage] = React.useState(1)
  const strip = React.useRef<HTMLDivElement>(null)
  const show = (next: number) => {
    setPage(next)
    strip.current
      ?.querySelectorAll("button")
      [next - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  return (
    <div data-slot="stack">
      <Carousel aria-label="Photos" page={page} onPageChange={show}>
        <CarouselViewport>
          <CarouselContent>
            {photos.map((photo) => (
              <CarouselItem key={photo.name}>
                <div data-slot="tile">{photo.name}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
      <Carousel
        ref={strip}
        aria-label="Thumbnails"
        dragFree
        slidesPerPage="auto"
      >
        <CarouselViewport>
          <CarouselContent>
            {photos.map((photo, index) => (
              <CarouselItem key={photo.name} aria-label={photo.name}>
                <button
                  type="button"
                  aria-pressed={page === index + 1}
                  onClick={() => setPage(index + 1)}
                >
                  {photo.name}
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
    </div>
  )
}

export { Example }
