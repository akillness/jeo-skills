import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"

const slides = [1, 2, 3, 4, 5]

function Example() {
  return (
    <div dir="rtl">
      <Carousel aria-label="مميز">
        <CarouselViewport>
          <CarouselContent>
            <For each={slides}>
              {(slide) => (
                <CarouselItem>
                  <div data-slot="tile">{slide}</div>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
        </CarouselViewport>
        <div data-slot="row">
          <CarouselPrevious aria-label="الشريحة السابقة">
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
          <CarouselIndicatorGroup aria-label="اختر شريحة">
            <For each={slides}>
              {(slide) => (
                <CarouselIndicator
                  page={slide}
                  aria-label={`الشريحة ${slide}`}
                />
              )}
            </For>
          </CarouselIndicatorGroup>
          <CarouselNext aria-label="الشريحة التالية">
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
    </div>
  )
}

export { Example }
