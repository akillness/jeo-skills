import "@ui-sdk/web/autocomplete"
import "@ui-sdk/web/field"
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
    <form id="order" data-slot="stack">
      <ui-field>
        <ui-field-label>Fruit</ui-field-label>
        <ui-autocomplete name="fruit" form="order" required default-value="Apple">
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
        <ui-field-description>Any fruit, listed or not.</ui-field-description>
        <div><ui-field-error></ui-field-error></div>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Submit</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${data.join("&")}`)
  })
}

export { mount }
