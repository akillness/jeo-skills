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
    <div data-slot="stack">
      <ui-autocomplete disabled default-value="Banana">
        <div data-slot="stack">
          <ui-autocomplete-label>Disabled</ui-autocomplete-label>
          <ui-autocomplete-input>
            <input />
          </ui-autocomplete-input>
        </div>
      </ui-autocomplete>
      <ui-autocomplete read-only default-value="Cherry">
        <div data-slot="stack">
          <ui-autocomplete-label>Read-only</ui-autocomplete-label>
          <ui-autocomplete-input>
            <input />
          </ui-autocomplete-input>
        </div>
      </ui-autocomplete>
      <ui-autocomplete>
        <div data-slot="stack">
          <ui-autocomplete-label>Some suggestions disabled</ui-autocomplete-label>
          <ui-autocomplete-input>
            <input placeholder="Type “b”" />
          </ui-autocomplete-input>
        </div>
        <ui-autocomplete-content hidden>
          <ui-autocomplete-list>
            ${fruits
              .map(
                (fruit, index) =>
                  `<ui-autocomplete-item value="${fruit}" ${index % 3 === 0 ? "disabled" : ""}>${fruit}</ui-autocomplete-item>`
              )
              .join("")}
          </ui-autocomplete-list>
        </ui-autocomplete-content>
      </ui-autocomplete>
    </div>
  `
}

export { mount }
