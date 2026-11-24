import "@ui-sdk/web/autocomplete"

const tags = [
  { value: "feature", label: "feature", keywords: ["enhancement", "request"] },
  { value: "fix", label: "fix", keywords: ["bug", "patch"] },
  { value: "docs", label: "docs", keywords: ["documentation", "readme"] },
  { value: "performance", label: "performance", keywords: ["speed", "slow"] },
  { value: "security", label: "security", keywords: ["vulnerability"] },
  { value: "refactor", label: "refactor", keywords: ["cleanup"] },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete filter="startsWith">
      <div data-slot="stack">
        <ui-autocomplete-label>Tag</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input placeholder="Try “bug”" />
        </ui-autocomplete-input>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No tags found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${tags
            .map(
              (tag) => `
                <ui-autocomplete-item value="${tag.value}" label="${tag.label}" keywords="${tag.keywords.join(",")}">
                  ${tag.label}
                  <span data-slot="hint">${tag.keywords[0]}</span>
                </ui-autocomplete-item>
              `
            )
            .join("")}
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }
