"use client"

import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const slides = [1, 2, 3, 4, 5]

function Example() {
  return (
    <div dir="rtl">
      <Carousel aria-label="مميز">
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
          <CarouselPrevious aria-label="الشريحة السابقة">
            <ChevronLeftIcon />
          </CarouselPrevious>
          <CarouselIndicatorGroup aria-label="اختر شريحة">
            {slides.map((slide) => (
              <CarouselIndicator
                key={slide}
                page={slide}
                aria-label={`الشريحة ${slide}`}
              />
            ))}
          </CarouselIndicatorGroup>
          <CarouselNext aria-label="الشريحة التالية">
            <ChevronRightIcon />
          </CarouselNext>
        </div>
      </Carousel>
    </div>
  )
}

export { Example }
