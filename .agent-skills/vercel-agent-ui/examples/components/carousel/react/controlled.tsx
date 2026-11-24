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
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const slides = [1, 2, 3, 4, 5]

function Example() {
  const [page, setPage] = React.useState(1)
  const log = useLog()
  return (
    <Carousel
      aria-label="Featured"
      page={page}
      onPageChange={(next, details) => {
        setPage(next)
        log(`Page ${next} (${details.reason})`)
      }}
    >
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous slide">
          <ChevronLeftIcon />
        </CarouselPrevious>
        <CarouselViewport>
          <CarouselContent>
            {slides.map((slide) => (
              <CarouselItem key={slide}>
                <div data-slot="tile">{slide}</div>
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
