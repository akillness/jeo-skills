import "@ui-sdk/web/command"
import { CornerDownLeft, createElement } from "lucide"

const pages = ["Composition", "Installation", "Styling"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-command>
      <ui-command-input>
        <input aria-label="Search docs" placeholder="Search docs…" />
      </ui-command-input>
      <ui-command-list>
        ${pages
          .map(
            (page) => `
              <ui-command-item value="${page}" label="${page}" as-child>
                <a href="#${page.toLowerCase()}">
                  <ui-command-item-text>${page}</ui-command-item-text>
                  ${createElement(CornerDownLeft, { "aria-hidden": "true" }).outerHTML}
                </a>
              </ui-command-item>
            `
          )
          .join("")}
      </ui-command-list>
    </ui-command>
  `
}

export { mount }
