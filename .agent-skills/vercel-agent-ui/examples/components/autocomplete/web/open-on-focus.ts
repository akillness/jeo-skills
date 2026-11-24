import "@ui-sdk/web/autocomplete"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete open-on-focus>
      <ui-autocomplete-input>
        <input aria-label="Search" placeholder="Search…" />
      </ui-autocomplete-input>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No results.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          <ui-autocomplete-group>
            <ui-autocomplete-group-label>Recent searches</ui-autocomplete-group-label>
            ${recent.map((search) => `<ui-autocomplete-item value="${search}">${search}</ui-autocomplete-item>`).join("")}
          </ui-autocomplete-group>
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }
