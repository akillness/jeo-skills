import { attrs, partState } from "@ui-sdk/core/renderer"
import { slider, type SliderApi } from "@ui-sdk/core/slider"
import { showDefaultText } from "./default-text"
import { createParts } from "./define-element"
import { forwardAttributes } from "./forward-attributes"

const owner = "ui-slider"

// A thumb's index is its place among its slider's thumbs, unless it sets `index`.
function thumbIndex(el: HTMLElement) {
  const own = el.closest("ui-slider-thumb") as HTMLElement | null
  if (!own) {
    return {}
  }
  const explicit = own.getAttribute("index")
  const root = own.closest(owner)
  const thumbs = root
    ? Array.from(root.querySelectorAll("ui-slider-thumb"))
    : [own]
  const index =
    explicit === null ? Math.max(0, thumbs.indexOf(own)) : Number(explicit)
  return { index, id: String(index) }
}

// Names go to the range input inside a thumb, which is what takes focus.
const inputAttributes = ["aria-label", "aria-labelledby", "aria-describedby"]

// <ui-slider> is form-associated: it submits its value, or a range as
// "start/end", under its name. Markup:
//
// <ui-slider name="price" default-value="20/80">
//   <ui-slider-control>
//     <ui-slider-track>
//       <ui-slider-indicator></ui-slider-indicator>
//       <ui-slider-thumb aria-label="Minimum price"></ui-slider-thumb>
//       <ui-slider-thumb aria-label="Maximum price"></ui-slider-thumb>
//     </ui-slider-track>
//   </ui-slider-control>
// </ui-slider>
//
// Each thumb adds the range input that takes focus. An empty
// <ui-slider-value> shows the formatted value. Set `format` as a property.
function defineSliderElements() {
  createParts(slider, {
    root: {
      tag: owner,
      display: "block",
      formAssociated: true,
      // The framework adapters pass it, never an attribute or a property.
      kinds: { thumbInputId: null },
      state: {
        value: {
          get: (api: SliderApi) => api.getValue(),
          set: (api: SliderApi, value: number | number[]) =>
            api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "focus"],
      // Empty values show the formatted value, and inside a thumb, that thumb's.
      render(el, instance) {
        return showDefaultText(el, instance, "ui-slider-value", (value) => {
          if (!value.closest("ui-slider-thumb")) {
            return (partState(instance.part("value", {})) as { text: string })
              .text
          }
          return String(
            attrs(instance.part("thumb-input", thumbIndex(value)))[
              "aria-valuetext"
            ]
          )
        })
      },
    },
    control: { tag: "ui-slider-control", display: "block" },
    track: { tag: "ui-slider-track", display: "block" },
    indicator: { tag: "ui-slider-indicator", display: "block" },
    thumb: {
      tag: "ui-slider-thumb",
      display: "block",
      context: thumbIndex,
      // Adds the range input that takes focus, named by the thumb's own label.
      render(el) {
        if (el.querySelector(":scope > ui-slider-thumb-input")) {
          return
        }
        const wrapper = document.createElement("ui-slider-thumb-input")
        const input = document.createElement("input")
        forwardAttributes(el, input, inputAttributes)
        wrapper.append(input)
        el.append(wrapper)
      },
    },
    "thumb-input": {
      tag: "ui-slider-thumb-input",
      display: "contents",
      context: thumbIndex,
      target: (el) => el.querySelector("input"),
    },
    value: { tag: "ui-slider-value", display: "block" },
  })
}

export { defineSliderElements }
