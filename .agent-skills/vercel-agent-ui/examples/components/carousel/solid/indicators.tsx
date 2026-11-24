import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"

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
          <For each={photos}>
            {(photo) => (
              <CarouselItem>
                <div data-slot="tile">{photo.name}</div>
              </CarouselItem>
            )}
          </For>
        </CarouselContent>
      </CarouselViewport>
      <CarouselIndicatorGroup aria-label="Choose a photo">
        <For each={photos}>
          {(photo, index) => (
            <CarouselIndicator page={index() + 1} aria-label={photo.name} />
          )}
        </For>
      </CarouselIndicatorGroup>
    </Carousel>
  )
}

export { Example }
