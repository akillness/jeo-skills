import "@ui-sdk/web/accordion"
import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import { ChevronDown, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion default-value="reply">
      <ui-accordion-item value="reply">
        <ui-accordion-header>
          <h3>
            <ui-accordion-trigger>
              <button type="button" aria-expanded="true">
                Reply to this thread
                ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-accordion-trigger>
          </h3>
        </ui-accordion-header>
        <ui-accordion-panel keep-mounted>
          <ui-field>
            <ui-field-label>Message</ui-field-label>
            <ui-textarea>
              <textarea rows="3" placeholder="Write a reply…"></textarea>
            </ui-textarea>
          </ui-field>
        </ui-accordion-panel>
      </ui-accordion-item>
      <ui-accordion-item value="formatting">
        <ui-accordion-header>
          <h3>
            <ui-accordion-trigger>
              <button type="button" aria-expanded="false">
                Formatting
                ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-accordion-trigger>
          </h3>
        </ui-accordion-header>
        <ui-accordion-panel hidden>
          <p>Use **bold**, _italics_ and \`code\`. Links paste as previews.</p>
        </ui-accordion-panel>
      </ui-accordion-item>
    </ui-accordion>
  `
}

export { mount }
