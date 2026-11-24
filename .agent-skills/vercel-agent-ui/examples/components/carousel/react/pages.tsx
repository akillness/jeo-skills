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

const products = [1, 2, 3, 4, 5, 6, 7, 8]

function Example() {
  return (
    <Carousel aria-label="Products" slidesPerPage={3}>
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous page">
          <ChevronLeftIcon />
        </CarouselPrevious>
        <CarouselViewport>
          <CarouselContent>
            {products.map((product) => (
              <CarouselItem key={product}>
                <div data-slot="tile">{product}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </CarouselViewport>
        <CarouselNext aria-label="Next page">
          <ChevronRightIcon />
        </CarouselNext>
      </div>
      <div data-slot="row">
        <CarouselIndicatorGroup aria-label="Choose a page">
          {(state) =>
            Array.from({ length: state.pageCount ?? 3 }, (_, index) => (
              <CarouselIndicator
                key={index}
                page={index + 1}
                aria-label={`Page ${index + 1}`}
              />
            ))
          }
        </CarouselIndicatorGroup>
      </div>
    </Carousel>
  )
}

export { Example }
