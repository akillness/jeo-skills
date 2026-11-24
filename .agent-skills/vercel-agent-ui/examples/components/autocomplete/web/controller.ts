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
      <div data-slot="controls">
        <button type="button" data-action="open" data-size="sm">Open</button>
        <button type="button" data-action="type" data-size="sm">Type “Pea”</button>
        <button type="button" data-action="clear" data-size="sm">Clear</button>
        <button type="button" data-action="focus" data-size="sm">Focus</button>
      </div>
      <ui-autocomplete>
        <ui-autocomplete-label>Fruit</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input />
        </ui-autocomplete-input>
        <ui-autocomplete-content hidden>
          <ui-autocomplete-empty>No fruits found.</ui-autocomplete-empty>
          <ui-autocomplete-list>
            ${fruits.map((item) => `<ui-autocomplete-item value="${item}">${item}</ui-autocomplete-item>`).join("")}
          </ui-autocomplete-list>
        </ui-autocomplete-content>
      </ui-autocomplete>
    </div>
  `
  const fruit = root.querySelector("ui-autocomplete")!.api
  const actions: Record<string, () => void> = {
    open: () => fruit.open(),
    type: () => fruit.setValue("Pea"),
    clear: () => fruit.clear(),
    focus: () => fruit.focus(),
  }
  for (const button of root.querySelectorAll<HTMLElement>("[data-action]")) {
    button.addEventListener("click", () => actions[button.dataset.action!]())
  }
}

export { mount }
