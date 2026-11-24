import "@ui-sdk/web/toggle"
import { createElement, Heart } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toggle>
      <button aria-label="Favorite">
        <ui-toggle-icon>${createElement(Heart, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
      </button>
    </ui-toggle>
  `
  const favorite = root.querySelector("ui-toggle")!
  const heart = root.querySelector("svg")!
  const render = (pressed: boolean) =>
    heart.setAttribute("fill", pressed ? "currentColor" : "none")
  render(favorite.pressed)
  favorite.addEventListener("pressedchange", (event) =>
    render(event.detail.value)
  )
}

export { mount }
