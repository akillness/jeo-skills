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

const slides = [1, 2, 3, 4, 5]

function Example() {
  return (
    <Carousel aria-label="Featured">
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
