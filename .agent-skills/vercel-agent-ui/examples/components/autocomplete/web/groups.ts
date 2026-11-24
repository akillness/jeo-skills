import "@ui-sdk/web/autocomplete"

const fruitGroups = [
  {
    label: "Tree fruits",
    items: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
  },
  {
    label: "Berries",
    items: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
  },
  { label: "Tropical", items: ["Avocado", "Banana", "Mango", "Pineapple"] },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete>
      <div data-slot="stack">
        <ui-autocomplete-label>Fruit</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input placeholder="e.g. Pear" />
        </ui-autocomplete-input>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No fruits found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${fruitGroups
            .map(
              (group, index) => `
                ${index > 0 ? `<ui-autocomplete-separator></ui-autocomplete-separator>` : ""}
                <ui-autocomplete-group>
                  <ui-autocomplete-group-label>${group.label}</ui-autocomplete-group-label>
                  ${group.items.map((fruit) => `<ui-autocomplete-item value="${fruit}">${fruit}</ui-autocomplete-item>`).join("")}
                </ui-autocomplete-group>
              `
            )
            .join("")}
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }
