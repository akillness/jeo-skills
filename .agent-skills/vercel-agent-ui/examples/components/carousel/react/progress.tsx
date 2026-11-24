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
import { useLog } from "../../../shared/react/log"

const slides = [1, 2, 3, 4, 5]

function Example() {
  const log = useLog()
  return (
    <Carousel
      aria-label="Featured"
      onPageChangeComplete={(page) => log(`Rested on slide ${page}`)}
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
      <div data-slot="row">
        <div data-slot="bar">
          <div />
        </div>
      </div>
    </Carousel>
  )
}

export { Example }
