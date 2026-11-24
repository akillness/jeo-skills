import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger>
        <button>Share</button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>Share this document</ui-popover-title>
        <ui-popover-description>Anyone with the link can view it.</ui-popover-description>
        <ui-field>
          <ui-field-label>Link</ui-field-label>
          <ui-input>
            <input value="acme.app/d/q3-roadmap" readonly />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-popover-close>
            <button>Cancel</button>
          </ui-popover-close>
          <ui-popover-close>
            <button data-variant="solid">Copy Link</button>
          </ui-popover-close>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
}

export { mount }
