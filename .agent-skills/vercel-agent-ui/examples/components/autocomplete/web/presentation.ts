import "@ui-sdk/web/autocomplete"

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
    <ui-autocomplete presentation="sheet">
      <div data-slot="stack">
        <ui-autocomplete-label>Favorite fruit</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input placeholder="e.g. Mango" />
        </ui-autocomplete-input>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No fruits found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${fruits.map((fruit) => `<ui-autocomplete-item value="${fruit}">${fruit}</ui-autocomplete-item>`).join("")}
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }
