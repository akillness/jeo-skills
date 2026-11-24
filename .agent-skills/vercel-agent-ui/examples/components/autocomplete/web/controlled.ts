import "@ui-sdk/web/autocomplete"
import { log } from "../../../shared/web/log"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Grape",
  "Lemon",
  "Mango",
  "Orange",
  "Peach",
  "Pear",
  "Pineapple",
  "Strawberry",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-autocomplete debug>
        <ui-autocomplete-label>Fruit (12 characters at most)</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input />
        </ui-autocomplete-input>
        <ui-autocomplete-content hidden>
          <ui-autocomplete-empty>No fruits found.</ui-autocomplete-empty>
          <ui-autocomplete-list>
            ${fruits.map((fruit) => `<ui-autocomplete-item value="${fruit}">${fruit}</ui-autocomplete-item>`).join("")}
          </ui-autocomplete-list>
        </ui-autocomplete-content>
      </ui-autocomplete>
    </div>
  `
  const autocomplete = root.querySelector("ui-autocomplete")!
  autocomplete.addEventListener("valuechange", (event) => {
    if (event.detail.value.length > 12) {
      return event.preventDefault()
    }
    log(root, `text: ${event.detail.reason}`)
  })
  autocomplete.addEventListener("openchange", (event) => {
    log(
      root,
      `${event.detail.value ? "opened" : "closed"}: ${event.detail.reason}`
    )
  })
  autocomplete.addEventListener("openchangecomplete", (event) => {
    log(root, `${event.detail.value ? "opened" : "closed"} and settled`)
  })
  autocomplete.addEventListener("highlight", (event) => {
    if (event.detail.value) {
      log(root, `highlighted ${event.detail.value}`)
    }
  })
}

export { mount }
