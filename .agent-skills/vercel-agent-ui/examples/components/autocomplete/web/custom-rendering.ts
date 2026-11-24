import "@ui-sdk/web/autocomplete"

const pages = [
  { title: "Installation", section: "Get Started", href: "#installation" },
  { title: "Composition", section: "Concepts", href: "#composition" },
  { title: "Build Your Own", section: "Concepts", href: "#build-your-own" },
  { title: "Styling", section: "Guides", href: "#styling" },
  { title: "API Reference", section: "Reference", href: "#api-reference" },
  { title: "Accessibility", section: "Reference", href: "#accessibility" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete>
      <div data-slot="stack">
        <ui-autocomplete-label>Jump to</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input placeholder="e.g. Styling" />
        </ui-autocomplete-input>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No sections found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${pages
            .map(
              (page) => `
                <ui-autocomplete-item value="${page.title}" label="${page.title}" as-child>
                  <a href="${page.href}">${page.title}<span data-slot="hint">${page.section}</span></a>
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
