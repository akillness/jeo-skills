"use client"

import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselViewport,
} from "@ui-sdk/react/carousel"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

function Example() {
  return (
    <Carousel aria-label="Photos">
      <CarouselViewport>
        <CarouselContent>
          {photos.map((photo) => (
            <CarouselItem key={photo.name}>
              <div data-slot="tile">{photo.name}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </CarouselViewport>
      <CarouselIndicatorGroup aria-label="Choose a photo">
        {photos.map((photo, index) => (
          <CarouselIndicator
            key={photo.name}
            page={index + 1}
            aria-label={photo.name}
          />
        ))}
      </CarouselIndicatorGroup>
    </Carousel>
  )
}

export { Example }
