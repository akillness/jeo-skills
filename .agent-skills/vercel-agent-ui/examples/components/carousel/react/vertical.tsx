"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

const slides = [1, 2, 3, 4, 5]

function Example() {
  return (
    <Carousel aria-label="Featured" orientation="vertical">
      <CarouselViewport>
        <CarouselContent>
          {slides.map((slide) => (
            <CarouselItem key={slide}>
              <div data-slot="tile">{slide}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </CarouselViewport>
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous slide">
          <ChevronUpIcon />
        </CarouselPrevious>
        <CarouselNext aria-label="Next slide">
          <ChevronDownIcon />
        </CarouselNext>
      </div>
    </Carousel>
  )
}

export { Example }
