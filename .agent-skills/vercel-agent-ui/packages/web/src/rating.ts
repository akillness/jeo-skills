import { rating, type RatingApi } from "@ui-sdk/core/rating"
import { createParts } from "./define-element"
import { element, templateOf } from "./list"

const owner = "ui-rating"

// <ui-rating> renders a <ui-rating-item> per star, copied from the one in its
// <template>, with the radios that pick its scores inside. It joins forms like
// native radios that share a name, with no hidden inputs.
function defineRatingElements() {
  createParts(rating, {
    root: {
      tag: owner,
      formAssociated: true,
      state: {
        value: {
          get: (api: RatingApi) => api.getValue(),
          set: (api: RatingApi, value: number | null) => api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "focus"],
      render(el, { api }) {
        renderStars(el, api)
        const observer = new MutationObserver(() => renderStars(el, api))
        observer.observe(el, { attributeFilter: ["max", "step"] })
        return () => observer.disconnect()
      },
    },
    item: "ui-rating-item",
    radio: "ui-rating-radio",
  })
}

function renderStars(el: HTMLElement, api: RatingApi) {
  const items = [...el.querySelectorAll<HTMLElement>(":scope > ui-rating-item")]
  const max = api.internal.max()
  for (const item of items.slice(max)) {
    item.remove()
  }
  for (let index = 1; index <= max; index++) {
    let item = items[index - 1]
    if (!item) {
      item = element(
        "ui-rating-item",
        { index: String(index) },
        undefined,
        templateOf(el)
      )
      el.append(item)
    }
    if (item.getAttribute("index") !== String(index)) {
      item.setAttribute("index", String(index))
    }
    renderRadios(item, api.internal.values(index).map(String))
  }
}

function renderRadios(item: HTMLElement, values: string[]) {
  const radios = [...item.querySelectorAll(":scope > ui-rating-radio")]
  if (
    radios.map((radio) => radio.getAttribute("value")).join() === values.join()
  ) {
    return
  }
  for (const radio of radios) {
    radio.remove()
  }
  item.append(...values.map((value) => element("ui-rating-radio", { value })))
}

export { defineRatingElements }
