import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
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

const nextFocused = () =>
  typeof document !== "undefined" &&
  document.activeElement?.getAttribute("data-slot") === "carousel-next"

function Example() {
  return (
    <Carousel aria-label="Photos">
      <CarouselViewport>
        <CarouselContent>
          <For each={photos}>
            {(photo) => (
              <CarouselItem>
                {(state) => (
                  <div data-slot="tile">
                    {photo.name}
                    <span data-slot="hint">
                      {state.index + 1} / {photos.length}
                      {state.active && " · showing"}
                    </span>
                  </div>
                )}
              </CarouselItem>
            )}
          </For>
        </CarouselContent>
      </CarouselViewport>
      <div data-slot="row">
        <CarouselPrevious>
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
          Previous
        </CarouselPrevious>
        <CarouselNext
          render={(props, state) =>
            state.disabled ? (
              <a
                href="https://example.com/gallery"
                ref={(link) =>
                  nextFocused() && queueMicrotask(() => link.focus())
                }
              >
                See all photos
              </a>
            ) : (
              <button {...props}>
                Next
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
              </button>
            )
          }
        />
      </div>
    </Carousel>
  )
}

export { Example }
