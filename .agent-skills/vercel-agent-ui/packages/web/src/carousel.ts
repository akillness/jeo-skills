import { carousel, type CarouselApi } from "@ui-sdk/core/carousel"
import { createParts, wrappedButton } from "./define-element"

// Wrappers have no role, so the tablist still sees its tabs as direct children.
const wrapper = { display: "contents" as const, target: wrappedButton }

// <ui-carousel> and its parts. Previous, Next, the indicators and the play
// toggle wrap your own <button>, so native button behavior stays. Name the
// carousel, the buttons and the indicators. Markup:
//
// <ui-carousel aria-label="Featured products">
//   <ui-carousel-viewport>
//     <ui-carousel-content>
//       <ui-carousel-item>…</ui-carousel-item>
//       <ui-carousel-item>…</ui-carousel-item>
//     </ui-carousel-content>
//   </ui-carousel-viewport>
//   <ui-carousel-previous><button>Previous slide</button></ui-carousel-previous>
//   <ui-carousel-next><button>Next slide</button></ui-carousel-next>
//   <ui-carousel-indicator-group aria-label="Choose a slide">
//     <ui-carousel-indicator><button aria-label="Slide 1"></button></ui-carousel-indicator>
//     <ui-carousel-indicator><button aria-label="Slide 2"></button></ui-carousel-indicator>
//   </ui-carousel-indicator-group>
// </ui-carousel>
//
// Write one indicator per slide: those past the page count hide themselves.
// Previous, Next, the indicator group and the play toggle work anywhere on the
// page with `for="<carousel id>"`. The play toggle's button has `data-playing`
// while rotating, so its label can switch with CSS.
function defineCarouselElements() {
  createParts(carousel, {
    root: {
      tag: "ui-carousel",
      display: "block",
      defaults: { drag: true },
      // `page` and `playing` are live: setting the property or the attribute
      // pages or rotates, like a controller, and fires the change event.
      state: {
        page: {
          get: (api: CarouselApi) => api.getPage(),
          set: (api: CarouselApi, page: number) => api.setPage(Number(page)),
        },
        playing: {
          get: (api: CarouselApi) => api.isPlaying(),
          set: (api: CarouselApi, playing: boolean) =>
            api.setPlaying(!!playing),
        },
      },
      api: [
        "getPage",
        "getPageCount",
        "setPage",
        "next",
        "previous",
        "canNext",
        "canPrevious",
        "getProgress",
        "isPlaying",
        "setPlaying",
        "play",
        "pause",
      ],
    },
    viewport: { tag: "ui-carousel-viewport", display: "block" },
    content: { tag: "ui-carousel-content", display: "block" },
    item: { tag: "ui-carousel-item", display: "block" },
    previous: { tag: "ui-carousel-previous", ...wrapper },
    next: { tag: "ui-carousel-next", ...wrapper },
    "play-toggle": { tag: "ui-carousel-play-toggle", ...wrapper },
    "indicator-group": { tag: "ui-carousel-indicator-group", display: "block" },
    indicator: {
      tag: "ui-carousel-indicator",
      ...wrapper,
      render: (el) => el.setAttribute("role", "none"),
    },
  })
}

export { defineCarouselElements }
